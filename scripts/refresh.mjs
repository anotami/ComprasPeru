/**
 * refresh.mjs — actualiza los rankings del sitio SIN API de AliExpress.
 *
 *   1. Por cada `query` de cada categoría (src/data/categories.json) hace un GET
 *      a la búsqueda de AliExpress ordenada por pedidos y parsea el JSON que
 *      viene incrustado en el HTML.
 *   2. Elige el producto con más pedidos de cada puesto.
 *   3. Arma el link de afiliado (deeplink por plantilla, sin login).
 *   4. Descarga la foto principal a public/img/<slug>/NN.webp
 *   5. Redacta descripción + "por qué comprarlo" + badge con la API de Anthropic
 *      (solo para los productos NUEVOS respecto al mes anterior — barato).
 *   6. Escribe src/data/products/<slug>.json
 *
 * Uso:
 *   node scripts/refresh.mjs                 # todo
 *   node scripts/refresh.mjs --only=moto     # una categoría
 *   node scripts/refresh.mjs --dry-run       # no escribe nada, solo muestra
 *   node scripts/refresh.mjs --refresh-copy  # re-redacta también lo que no cambió
 *   node scripts/refresh.mjs --no-copy       # nunca llama a Anthropic (copy de plantilla)
 *
 * Variables de entorno:
 *   ALIEXPRESS_AFF_KEY   aff_short_key de tu cuenta Portals (para el deeplink)
 *   LINK_MODE            deeplink (def.) | raw | manual
 *   ANTHROPIC_API_KEY    para redactar el copy
 *   ANTHROPIC_MODEL      def. claude-haiku-4-5
 *   PEN_USD              tipo de cambio para el precio de referencia (def. 3.75)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => resolve(ROOT, ...p);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k, d) => {
  const a = args.find((x) => x.startsWith(k + "="));
  return a ? a.slice(k.length + 1) : d;
};

const DRY = has("--dry-run");
const REFRESH_COPY = has("--refresh-copy");
const NO_COPY = has("--no-copy");
const ONLY = (val("--only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

const AFF_KEY = process.env.ALIEXPRESS_AFF_KEY || "";
const LINK_MODE = process.env.LINK_MODE || "deeplink";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const PEN_USD = Number(process.env.PEN_USD || "3.75");

// Pacing anti-rate-limit. AliExpress empieza a tirar captcha tras ~15-20
// requests rápidos desde la misma IP. Espaciar + enfriar cuando bloquea.
const DELAY_MS = Number(process.env.REQUEST_DELAY_MS || "4000"); // entre búsquedas
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || "90000"); // tras un bloqueo
const MAX_BLOCKS_ABORT = Number(process.env.MAX_BLOCKS_ABORT || "10"); // corta si la IP está quemada

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];
const pickUA = () => process.env.USER_AGENT || UAS[Math.floor(Math.random() * UAS.length)];
const UA = pickUA();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.floor(Math.random() * 1500);

class BlockedError extends Error {}
let consecutiveBlocks = 0;
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("  ⚠ ", ...a);

const manualList = [];
let hadFailure = false;
let affKeyWarned = false;

/* ───────────────────────── scraping ───────────────────────── */

function slugifyQuery(q) {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractInitData(html) {
  const marker = "_init_data_=";
  const i = html.indexOf(marker);
  if (i === -1) return null;
  const di = html.indexOf("data:", i);
  const start = html.indexOf("{", di);
  if (start === -1) return null;
  let depth = 0;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, k + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findItemList(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 12) return null;
  if (
    Array.isArray(obj.content) &&
    obj.content[0] &&
    (obj.content[0].productId || obj.content[0].redirectedId)
  )
    return obj.content;
  for (const k of Object.keys(obj)) {
    const r = findItemList(obj[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function parseOrders(txt) {
  if (!txt) return 0;
  const m = String(txt).replace(/\./g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function normalize(raw) {
  const id = raw.productId || raw.redirectedId;
  if (!id) return null;
  const title =
    (raw.title && (raw.title.displayTitle || raw.title.seoTitle)) || raw.productTitle || "";
  const img = (raw.image && (raw.image.imgUrl || raw.image.url)) || raw.imageUrl || "";
  const priceObj =
    (raw.prices && (raw.prices.salePrice || raw.prices.originalPrice)) || raw.price || null;
  const pricePEN = priceObj ? Number(priceObj.minPrice || priceObj.value || 0) : 0;
  const rating = raw.evaluation ? Number(raw.evaluation.starRating || 0) : 0;
  const ordersTxt = raw.trade && (raw.trade.tradeDesc || raw.trade.realTradeDesc);
  return {
    id: String(id),
    title: title.trim(),
    url: `https://www.aliexpress.com/item/${id}.html`,
    img: img.startsWith("//") ? "https:" + img : img,
    pricePEN,
    rating,
    orders: parseOrders(ordersTxt),
    ordersTxt: ordersTxt || "",
  };
}

const PUNISH = /punish|ca_baxia|_____tmd_____|nc_wrapper|x5referer|slider|geetest/i;

// Fuerza resultados en español y precios en soles aunque el servidor esté en EE.UU.
const AE_LOCALE_COOKIE =
  "aep_usuc_f=site=esp&c_tp=PEN&region=PE&b_locale=es_ES; intl_locale=es_ES";

async function search(query, attempt = 1) {
  const url = `https://es.aliexpress.com/w/wholesale-${slugifyQuery(
    query,
  )}.html?SortType=total_tranpro_desc&g=y&SearchText=${encodeURIComponent(query)}`;
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": pickUA(),
        "Accept-Language": "es-PE,es-419,es;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://es.aliexpress.com/",
        Cookie: AE_LOCALE_COOKIE,
      },
    });
    html = await res.text();
    if (!res.ok && res.status !== 200) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (attempt <= 3) {
      await sleep(jitter(2500 * attempt));
      return search(query, attempt + 1);
    }
    throw new Error(`fetch falló para "${query}": ${e.message}`);
  }

  const blocked = PUNISH.test(html.slice(0, 40000)) && !html.includes("_init_data_=");
  if (blocked) {
    if (attempt <= 2) {
      await sleep(jitter(COOLDOWN_MS)); // enfría antes de reintentar
      return search(query, attempt + 1);
    }
    throw new BlockedError(`AliExpress bloqueó la búsqueda "${query}" (captcha/punish)`);
  }

  const data = extractInitData(html);
  const list = data && findItemList(data);
  if (!list || !list.length) {
    if (attempt <= 2) {
      await sleep(jitter(3500 * attempt));
      return search(query, attempt + 1);
    }
    throw new Error(`sin resultados parseables para "${query}"`);
  }
  consecutiveBlocks = 0;
  return list.map(normalize).filter(Boolean);
}

const STOP = new Set(
  "de la el los las para con sin y o a en un una por que del al es tipo".split(" "),
);

function relevance(query, title) {
  const kw = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const t = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return kw.filter((w) => t.includes(w)).length;
}

function pickBest(cands, usedIds, query) {
  const base = (c) => c.img && c.img.startsWith("http") && !usedIds.has(c.id);
  // Ordena por: relevancia en tramos (2+, 1, 0) → pedidos → rating.
  // Así un producto que coincide con 2 palabras clave gana aunque venda menos,
  // pero entre igual de relevantes manda el más vendido.
  const rank = (list) =>
    list
      .map((c) => ({ ...c, rel: Math.min(2, relevance(query, c.title)) }))
      .sort((a, b) => b.rel - a.rel || b.orders - a.orders || b.rating - a.rating);

  let pool = rank(cands.filter((c) => base(c) && relevance(query, c.title) >= 1));
  const good = pool.filter((c) => c.rating === 0 || c.rating >= 4.3);
  if (good.length) return good[0];
  if (pool.length) return pool[0];
  pool = rank(cands.filter(base));
  return pool.filter((c) => c.rating >= 4.0)[0] || pool[0] || null;
}

/* ───────────────────────── precio / link / imagen ───────────────────────── */

// Banda de precio ajustada al valor real (aprox. -6% / +10%).
// Tuneable con PRICE_LO / PRICE_HI (ej. PRICE_LO=0.95 PRICE_HI=1.06 para más ceñido).
const PRICE_LO = Number(process.env.PRICE_LO || "0.94");
const PRICE_HI = Number(process.env.PRICE_HI || "1.1");

function usdBand(pen) {
  const usd = pen / PEN_USD;
  if (!usd || usd < 1) return "$2–4";
  const r = (x) => (x < 30 ? Math.round(x) : x < 120 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10);
  let lo = Math.max(1, r(usd * PRICE_LO));
  let hi = r(usd * PRICE_HI);
  if (hi <= lo) hi = lo + (lo < 25 ? 2 : 5);
  return `$${lo}–${hi}`;
}

function affiliateLink(productUrl, file, rank) {
  if (LINK_MODE === "raw") return productUrl;
  if (LINK_MODE === "manual") {
    manualList.push({ file, rank, product_url: productUrl });
    return "PEGAR_LINK_AQUI";
  }
  // deeplink
  if (!AFF_KEY) {
    if (!affKeyWarned) {
      warn("ALIEXPRESS_AFF_KEY vacío → los botones usan la URL del producto SIN rastreo (no hay comisión)");
      affKeyWarned = true;
    }
    return productUrl;
  }
  return `https://s.click.aliexpress.com/deep_link.htm?aff_short_key=${encodeURIComponent(
    AFF_KEY,
  )}&dl_target_url=${encodeURIComponent(productUrl)}`;
}

function fullResImage(imgUrl) {
  return imgUrl.replace(/(\.(jpg|jpeg|png|webp|avif))_.*$/i, "$1");
}

async function downloadImage(imgUrl, slug, rank) {
  const nn = String(rank).padStart(2, "0");
  if (DRY) return `/img/${slug}/${nn}.webp`;
  const dir = P("public/img", slug);
  mkdirSync(dir, { recursive: true });
  const url = fullResImage(imgUrl);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://www.aliexpress.com/", Accept: "image/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "image/jpeg";
    const ext = ct.includes("webp")
      ? "webp"
      : ct.includes("png")
        ? "png"
        : ct.includes("avif")
          ? "avif"
          : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error("imagen muy chica");
    const rel = `/img/${slug}/${nn}.${ext}`;
    if (!DRY) writeFileSync(P("public" + rel), buf);
    return rel;
  } catch (e) {
    // conserva la que ya exista
    for (const ext of ["webp", "jpg", "png", "avif"]) {
      if (existsSync(P(`public/img/${slug}/${nn}.${ext}`))) {
        warn(`no pude bajar la foto de ${slug} #${rank} (${e.message}); dejo la anterior`);
        return `/img/${slug}/${nn}.${ext}`;
      }
    }
    warn(`no pude bajar la foto de ${slug} #${rank} (${e.message}); uso placeholder`);
    return `/img/${slug}/${nn}.svg`;
  }
}

/* ───────────────────────── copy con Claude ───────────────────────── */

function cleanName(title) {
  let t = title.split(/[,|·;]| - | \/ /)[0].replace(/\s+/g, " ").trim();
  if (t.length < 12) t = title.replace(/\s+/g, " ").trim();
  return t.length > 65 ? t.slice(0, 62).replace(/\s+\S*$/, "") + "…" : t;
}

function templateCopy(item, isTopSeller, isPriciest) {
  return {
    nombre: cleanName(item.title),
    descripcion_corta: item.title.replace(/\s+/g, " ").trim().slice(0, 155),
    por_que_comprarlo: [
      `Está entre lo más pedido de su categoría en AliExpress (${item.ordersTxt || "muchas ventas"}).`,
      item.rating ? `Calificación de ${item.rating}/5 según los compradores.` : "Vendedor con buena reputación.",
      "Toca el botón para ver precio del día, fotos reales y opiniones antes de comprar.",
    ],
    badge: isTopSeller ? "El más vendido" : isPriciest ? "Ticket alto" : null,
  };
}

async function claudeCopy(catName, items) {
  const payload = items.map((it) => ({
    rank: it.rank,
    titulo: it.title,
    precio_ref: it.precio_referencia,
    rating: it.rating,
    pedidos: it.ordersTxt,
  }));
  const prompt = `Categoría: ${catName}. Para CADA producto de esta lista devuélveme un objeto con:
- "rank": el mismo número
- "nombre": título corto y limpio en español, máx 65 caracteres, sin texto promocional ni mayúsculas gritonas
- "descripcion_corta": 1 frase (máx 155 caracteres), directa, qué es y para qué sirve
- "por_que_comprarlo": array de EXACTAMENTE 3 razones concretas de compra (no repitas el nombre, nada de relleno)
- "badge": uno de "El más vendido" | "Mejor calidad-precio" | "Ticket alto" | null
Reglas de badge: "El más vendido" solo para el de más pedidos; "Ticket alto" para el más caro si pasa de USD 40; "Mejor calidad-precio" para uno barato con rating alto; el resto null. Máximo un badge de cada tipo.
Tono: español neutro peruano, directo, sin exagerar, sin signos de exclamación.
Responde SOLO con un array JSON válido, sin texto alrededor.

LISTA:
${JSON.stringify(payload, null, 1)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || "").join("");
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const byRank = new Map(arr.map((o) => [Number(o.rank), o]));
  return byRank;
}

/* ───────────────────────── por categoría ───────────────────────── */

function loadPrev(slug) {
  const f = P("src/data/products", `${slug}.json`);
  if (!existsSync(f)) return new Map();
  try {
    const arr = JSON.parse(readFileSync(f, "utf8"));
    return new Map(arr.filter((p) => p._src?.id).map((p) => [String(p._src.id), p]));
  } catch {
    return new Map();
  }
}

async function tryQuery(q, rank, usedIds, picked) {
  const cands = await search(q); // puede lanzar BlockedError
  const best = pickBest(cands, usedIds, q);
  if (!best) {
    warn(`"${q}": ningún candidato válido, salto el puesto ${rank}`);
    return false;
  }
  usedIds.add(best.id);
  picked.push({ ...best, rank });
  log(`  #${rank}  ${best.orders} ped · ${best.rating || "s/r"} · ${best.title.slice(0, 55)}`);
  return true;
}

async function buildCategory(cat) {
  log(`\n▶ ${cat.slug} — ${cat.queries.length} búsquedas`);
  const prev = loadPrev(cat.slug);
  const usedIds = new Set();
  const picked = [];
  const failed = [];

  for (let i = 0; i < cat.queries.length; i++) {
    const q = cat.queries[i];
    const rank = i + 1;
    try {
      await tryQuery(q, rank, usedIds, picked);
    } catch (e) {
      if (e instanceof BlockedError) {
        consecutiveBlocks++;
        failed.push({ q, rank });
        warn(e.message);
        if (consecutiveBlocks >= MAX_BLOCKS_ABORT) {
          throw new BlockedError(
            `${consecutiveBlocks} bloqueos seguidos: la IP está quemada, abortando ${cat.slug}`,
          );
        }
      } else {
        warn(e.message);
      }
    }
    await sleep(jitter(DELAY_MS));
  }

  // Segunda pasada para lo que bloqueó: enfría y reintenta una vez.
  if (failed.length) {
    log(`  enfriando ${Math.round(COOLDOWN_MS / 1000)}s y reintentando ${failed.length}…`);
    await sleep(COOLDOWN_MS);
    for (const { q, rank } of failed) {
      try {
        await tryQuery(q, rank, usedIds, picked);
      } catch (e) {
        warn(`reintento falló: ${e.message}`);
      }
      await sleep(jitter(DELAY_MS));
    }
  }

  if (!picked.length) {
    hadFailure = true;
    warn(`${cat.slug}: 0 productos, dejo el archivo anterior intacto`);
    return;
  }
  if (picked.length < cat.queries.length) {
    hadFailure = true;
    warn(`${cat.slug}: solo ${picked.length}/${cat.queries.length} puestos (los que faltan conservan lo anterior si existe)`);
  }
  picked.sort((a, b) => a.rank - b.rank);

  const topSellerRank = picked.slice().sort((a, b) => b.orders - a.orders)[0].rank;
  const priciestRank = picked.slice().sort((a, b) => b.pricePEN - a.pricePEN)[0].rank;

  // arma base con precio, imagen y link
  const items = [];
  for (const p of picked) {
    const precio_referencia = usdBand(p.pricePEN);
    const imagen = await downloadImage(p.img, cat.slug, p.rank);
    const link_afiliado = affiliateLink(p.url, cat.slug, p.rank);
    items.push({ ...p, precio_referencia, imagen, link_afiliado });
  }

  // copy: reusa el del mes pasado si el id no cambió (salvo --refresh-copy)
  const needCopy = items.filter((it) => REFRESH_COPY || !prev.has(it.id));
  let copyByRank = new Map();
  if (needCopy.length && !NO_COPY && ANTHROPIC_KEY) {
    try {
      log(`  redactando ${needCopy.length} con ${ANTHROPIC_MODEL}…`);
      copyByRank = await claudeCopy(cat.nombre, needCopy);
    } catch (e) {
      warn(`copy con Claude falló (${e.message}); uso plantilla`);
    }
  } else if (needCopy.length && !ANTHROPIC_KEY && !NO_COPY) {
    warn("ANTHROPIC_API_KEY vacío → copy de plantilla para los productos nuevos");
  }

  const products = items.map((it) => {
    const old = prev.get(it.id);
    const reuse = old && !REFRESH_COPY;
    const gen = copyByRank.get(it.rank);
    const tmpl = templateCopy(it, it.rank === topSellerRank, it.rank === priciestRank);
    const nombre = reuse ? old.nombre : gen?.nombre || tmpl.nombre;
    const descripcion_corta = reuse ? old.descripcion_corta : gen?.descripcion_corta || tmpl.descripcion_corta;
    const por_que_comprarlo =
      reuse ? old.por_que_comprarlo
      : Array.isArray(gen?.por_que_comprarlo) && gen.por_que_comprarlo.length === 3
        ? gen.por_que_comprarlo
        : tmpl.por_que_comprarlo;
    const badge = reuse ? old.badge : gen && "badge" in gen ? gen.badge : tmpl.badge;
    return {
      rank: it.rank,
      nombre,
      descripcion_corta,
      por_que_comprarlo,
      precio_referencia: it.precio_referencia,
      imagen: it.imagen,
      link_afiliado: it.link_afiliado,
      badge: badge ?? null,
      _src: {
        id: it.id,
        orders: it.orders,
        rating: it.rating,
        url: it.url,
        capturado: new Date().toISOString().slice(0, 10),
      },
    };
  });

  // Rellena los puestos que no se pudieron scrapear con lo del mes anterior.
  const prevByRank = new Map();
  for (const p of prev.values()) prevByRank.set(p.rank, p);
  const gotRanks = new Set(products.map((p) => p.rank));
  for (let r = 1; r <= cat.queries.length; r++) {
    if (!gotRanks.has(r) && prevByRank.has(r)) {
      products.push(prevByRank.get(r));
      log(`  #${r}  (sin scrapear — conservo el del mes pasado)`);
    }
  }
  products.sort((a, b) => a.rank - b.rank);

  const outFile = P("src/data/products", `${cat.slug}.json`);
  if (DRY) {
    log(`  (dry-run) escribiría ${products.length} productos en ${outFile}`);
  } else {
    writeFileSync(outFile, JSON.stringify(products, null, 2) + "\n");
    log(`  ✓ ${products.length} productos → src/data/products/${cat.slug}.json`);
  }
}

/* ───────────────────────── main ───────────────────────── */

async function main() {
  const { categorias } = JSON.parse(readFileSync(P("src/data/categories.json"), "utf8"));
  const cats = categorias.filter((c) => !ONLY.length || ONLY.includes(c.slug));
  log(`refresh — ${cats.length} categoría(s) · link-mode=${LINK_MODE}${DRY ? " · DRY-RUN" : ""}`);

  for (let i = 0; i < cats.length; i++) {
    try {
      await buildCategory(cats[i]);
    } catch (e) {
      hadFailure = true;
      warn(`${cats[i].slug} falló entero: ${e.message}`);
    }
    if (i < cats.length - 1) await sleep(jitter(DELAY_MS * 2));
  }

  if (!DRY) {
    const site = JSON.parse(readFileSync(P("src/data/site.json"), "utf8"));
    site.actualizado = new Date().toISOString().slice(0, 10);
    writeFileSync(P("src/data/site.json"), JSON.stringify(site, null, 2) + "\n");
  }

  if (manualList.length) {
    writeFileSync(P("refresh-manual-links.json"), JSON.stringify(manualList, null, 2));
    log(`\nLINK_MODE=manual → ${manualList.length} URLs en refresh-manual-links.json`);
  }

  log(hadFailure ? "\n✗ terminó con errores (revisa arriba)" : "\n✓ listo");
  process.exit(hadFailure ? 1 : 0);
}

main();
