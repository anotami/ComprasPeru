// Genera placeholders SVG (favicon, imágenes OG y fotos de producto).
// Uso: npm run gen:img
// Reemplaza libremente los archivos de /public/img/** por fotos reales.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pub = resolve(root, "public");

// Las categorías (y sus colores) salen de src/data/categories.json.
const { categorias } = JSON.parse(
  readFileSync(resolve(root, "src/data/categories.json"), "utf8"),
);
const THEME = Object.fromEntries(
  categorias.map((c) => [
    c.slug,
    { accent: c.accent, wash: c.accentWash, label: c.nombre.toUpperCase() },
  ]),
);
const PAPER = "#F5F1E8";
const INK = "#17140F";

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, max = 24, maxLines = 4) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
    if (lines.length === maxLines - 1 && line.length > max) break;
  }
  if (line) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

function write(path, content) {
  const full = resolve(pub, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  console.log("  ✓", path);
}

/* ---------- Foto de producto ---------- */
function productSVG(name, theme, rank) {
  const t = THEME[theme];
  const lines = wrap(name.replace(/\s*\(.*?\)\s*/g, " ").trim(), 24, 4);
  const startY = 300 - (lines.length - 1) * 26;
  const tspans = lines
    .map(
      (l, i) =>
        `<tspan x="400" y="${startY + i * 52}">${esc(l)}</tspan>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${esc(name)}">
  <rect width="800" height="600" fill="${t.wash}"/>
  <rect x="16" y="16" width="768" height="568" fill="none" stroke="${t.accent}" stroke-width="2" stroke-dasharray="10 8"/>
  <g fill="none" stroke="${INK}" stroke-opacity="0.06" stroke-width="2">
    <path d="M-20 150C160 60 360 60 520 150S760 240 900 150"/>
    <path d="M-20 260C160 170 360 170 520 260S760 350 900 260"/>
    <path d="M-20 370C160 280 360 280 520 370S760 460 900 370"/>
  </g>
  <text x="400" y="72" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="18" font-weight="700" letter-spacing="4" fill="${INK}" fill-opacity="0.4">${t.label} · PLACEHOLDER</text>
  <text text-anchor="middle" font-family="'Syne','Trebuchet MS',sans-serif" font-size="42" font-weight="800" fill="${INK}">${tspans}</text>
  <text x="400" y="548" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="16" fill="${INK}" fill-opacity="0.4">reemplazar por foto real · 800×600</text>
</svg>
`;
}

/* ---------- Imagen OG ---------- */
function ogSVG(title, sub, accent, wash) {
  const lines = wrap(title, 30, 3);
  const tspans = lines
    .map((l, i) => `<tspan x="80" y="${300 + i * 74}">${esc(l)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect width="1200" height="630" fill="${wash}" fill-opacity="0.6"/>
  <rect x="0" y="0" width="14" height="630" fill="${accent}"/>
  <g fill="none" stroke="${INK}" stroke-opacity="0.05" stroke-width="3">
    <path d="M-40 180C260 60 560 60 800 180S1140 300 1300 180"/>
    <path d="M-40 340C260 220 560 220 800 340S1140 460 1300 340"/>
    <path d="M-40 500C260 380 560 380 800 500S1140 620 1300 500"/>
  </g>
  <text x="80" y="150" font-family="'JetBrains Mono',monospace" font-size="26" font-weight="700" letter-spacing="6" fill="${accent}">HALLAZGOS ALIEXPRESS</text>
  <text font-family="'Syne','Trebuchet MS',sans-serif" font-size="64" font-weight="800" fill="${INK}">${tspans}</text>
  <text x="80" y="560" font-family="'Manrope',sans-serif" font-size="28" fill="${INK}" fill-opacity="0.6">${esc(sub)}</text>
</svg>
`;
}

/* ---------- Favicon ---------- */
function faviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${INK}"/>
  <circle cx="32" cy="32" r="13" fill="#F0501F"/>
  <path d="M20 44L44 20" stroke="${PAPER}" stroke-width="5" stroke-linecap="round"/>
</svg>
`;
}

console.log("Generando placeholders…");

write("favicon.svg", faviconSVG());

write(
  "og/default.svg",
  ogSVG(
    "Los mejores hallazgos de AliExpress, probados y curados",
    "Rankings para Perú y Latinoamérica",
    "#B4531F",
    "#F1E7D6"
  )
);

for (const [slug, t] of Object.entries(THEME)) {
  const dataFile = resolve(root, `src/data/products/${slug}.json`);
  const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : [];
  write(
    `og/${slug}.svg`,
    ogSVG(
      (data.length || 10) + " mejores de " + t.label.toLowerCase() + " en AliExpress",
      "Ranking con precios de referencia",
      t.accent,
      t.wash
    )
  );
  // Placeholder de producto: SOLO si no existe ya una imagen real
  // (webp/jpg/png) para ese puesto. Así `npm run gen:img` nunca pisa tus fotos.
  for (const p of data) {
    const n = String(p.rank).padStart(2, "0");
    const yaHayFoto = ["webp", "jpg", "jpeg", "png"].some((ext) =>
      existsSync(resolve(pub, `img/${slug}/${n}.${ext}`))
    );
    if (yaHayFoto) {
      console.log(`  · img/${slug}/${n} ya tiene foto, se omite el placeholder`);
      continue;
    }
    write(`img/${slug}/${n}.svg`, productSVG(p.nombre, slug, p.rank));
  }
}

console.log("Listo.");
