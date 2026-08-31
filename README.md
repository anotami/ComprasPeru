# Hallazgos AliExpress

Sitio estático de afiliados de AliExpress (mercado Perú / LatAm). Páginas por
categoría con un ranking de productos y botones con tu enlace de afiliado.

- **Framework:** [Astro](https://astro.build) (salida 100% estática, sin backend ni base de datos).
- **JS en cliente:** solo un script mínimo para el botón “volver arriba”.
- **CSS:** propio, mobile-first (hoja única en `src/styles/global.css`).
- **Datos:** todo sale de `src/data/`. Las categorías se definen en
  `src/data/categories.json`; los productos en `src/data/products/<slug>.json`.
  Nada está hardcodeado en el HTML.

> **¿Quieres que se actualice y publique solo cada mes?**
> Todo el flujo automático (buscar los más vendidos, generar links, redactar,
> commit + deploy a GitHub Pages) está en **[`AUTOMATIZACION.md`](AUTOMATIZACION.md)**.
> Este README cubre la edición manual.

---

## 1. Requisitos y comandos

Necesitas **Node 18.20+ / 20.3+ / 22+** (probado con Node 24).

```bash
npm install          # instalar dependencias (una sola vez)
npm run dev          # servidor local con recarga en caliente -> http://localhost:4321
npm run build        # genera el sitio estático en dist/
npm run preview      # sirve dist/ para revisar el resultado final del build
npm run gen:img      # regenera los placeholders SVG (favicon, OG e imágenes de producto)
```

El criterio de aceptación es: `npm run build` sin errores y `npm run preview`
funcionando. Ambos están verificados.

---

## 2. Los enlaces de afiliado

> **Si activas la automatización** ([`AUTOMATIZACION.md`](AUTOMATIZACION.md)) esto
> lo hace `refresh.mjs` solo, con tu `ALIEXPRESS_AFF_KEY` y `LINK_MODE=deeplink`.
> Esta sección es para hacerlo a mano.

Los 30 productos vienen **elegidos y enlazados** a fichas reales de AliExpress
(búsqueda del 30 de agosto de 2026, priorizando reputación, ventas y precio).
El campo `link_afiliado` de cada producto (en `src/data/products/<slug>.json`)
tiene una URL **real y funcional**, por ejemplo:

```json
"link_afiliado": "https://www.aliexpress.com/item/1005006861760459.html"
```

Esas URLs **funcionan**, pero **todavía no tienen tu ID de afiliado**: nadie puede
generar por ti un enlace de comisión, porque va atado a tu cuenta de AliExpress
Portals. El paso que te toca es convertir cada URL en tu enlace rastreado:

1. Entra a **[portals.aliexpress.com](https://portals.aliexpress.com)** con tu cuenta de afiliado.
2. Abre **Ad Center → Link Generator** (o “Herramienta de enlaces”).
3. Pega la URL del producto (puedes pegar varias de golpe) y genera el enlace
   corto rastreado (`https://s.click.aliexpress.com/e/_XXXXXXX`).
4. En el JSON del nicho (`src/data/moto.json`, `camping.json`, `running.json`),
   reemplaza el valor de `link_afiliado` de ese producto por tu enlace rastreado.
   Deja las comillas. No toques nada más.

La lista de los 30, con su archivo y su URL actual, está al final de este README
(sección 11) para que copies y conviertas rápido.

Cada botón ya se renderiza con `target="_blank"` y
`rel="nofollow sponsored noopener"` (requisito de buscadores para enlaces de
afiliado). Eso no se cambia.

Después de pegar tus enlaces rastreados:

```bash
npm run build
```

y vuelve a desplegar (o haz `git push` si tienes deploy automático).

> **Mientras tanto:** aunque no conviertas nada, el sitio ya es 100% funcional y
> los botones llevan al producto correcto. Solo que esas visitas no te generan
> comisión hasta que uses tus enlaces de Portals.

---

## 3. Reemplazar las imágenes

Cada producto ya trae una **foto real en `.webp`** descargada de su ficha de
AliExpress, en `public/img/<nicho>/01.webp … 10.webp`. Se muestran con
`object-fit: contain` sobre fondo blanco, así que se ve el producto completo sin
recortes.

> Ojo: son las fotos que subió cada vendedor y algunas traen texto o sellos
> promocionales incrustados (“365 days”, “OFFICIAL”, specs, etc.). Son útiles
> para arrancar, pero cuando puedas conviene cambiarlas por fotos más limpias
> (tuyas o del propio catálogo del vendedor).

Para cambiar una imagen:

**Opción A — mantener el nombre**
1. Guarda tu foto como `public/img/moto/01.webp` (o `.jpg`), pisando la actual.
2. Si cambias la extensión (a `.jpg`), ajusta el campo `"imagen"` en
   `src/data/moto.json`: `"/img/moto/01.jpg"`.

**Opción B — nombre libre**
1. Copia la imagen a `public/img/moto/` con el nombre que quieras.
2. Apunta el campo `"imagen"` a esa ruta: `"imagen": "/img/moto/intercom.webp"`.

Recomendaciones:
- Cuadrada o **4:3**; da igual, la tarjeta la ajusta sin recortar.
- **WebP** o **JPG** optimizado, apunta a **< 120 KB** por imagen.
- Todo lo que pongas en `public/` se sirve tal cual desde la raíz del sitio.

`npm run gen:img` regenera `favicon.svg` y las imágenes OG, y crea un placeholder
SVG **solo** para los puestos que aún no tengan foto (nunca pisa tus `.webp`).

Las imágenes OG (`public/og/*.svg`) y el `favicon.svg` son genéricas;
reemplázalas cuando tengas identidad visual. Si usas PNG/JPG para OG, actualiza
la ruta en `src/layouts/BaseLayout.astro` (prop `ogImage`) o en cada página.

---

## 4. Editar textos, precios, badges y orden

**Productos** — `src/data/products/<slug>.json` (un objeto por producto):

| Campo | Para qué sirve |
|---|---|
| `rank` | Posición en el ranking. Ordena las tarjetas y la tabla. |
| `nombre` | Título del producto. |
| `descripcion_corta` | Frase bajo el título. |
| `por_que_comprarlo` | Array de 3 bullets. |
| `precio_referencia` | Texto libre, ej. `"$25–80"`. **No** es el precio final. |
| `imagen` | Ruta dentro de `public/` (foto `.webp` del producto). |
| `link_afiliado` | Enlace de afiliado (o URL del producto). |
| `badge` | `"El más vendido"`, `"Mejor calidad-precio"`, `"Ticket alto"` o `null`. |
| `specs` | Array de hasta 3 `{ "k": etiqueta, "v": valor }` — la ficha técnica que se muestra en la tarjeta y como columnas en la tabla comparativa. Lo redacta Claude; si está vacío, la tabla usa la columna "Distinción". |
| `_src` | Metadatos de origen (id de AliExpress, pedidos, rating). **No lo borres:** `refresh.mjs` lo usa para conservar tu texto si el producto no cambió. |

**Categorías** (nav, títulos SEO, hero, intro, colores, búsquedas) —
`src/data/categories.json`. Ver [`AUTOMATIZACION.md`](AUTOMATIZACION.md) §2 para
agregar una. Admite `{n}` (nº de productos) y `{year}` en `h1`/`title`/`meta`.

**Preguntas frecuentes** — `src/data/faq.json` (se usan en todas las páginas de
categoría y alimentan el `schema.org/FAQPage`).

Fecha de “Actualizado el …”: campo `actualizado` en `src/data/site.json`
(formato `AAAA-MM-DD`).

---

## 5. Cambiar el dominio / la subcarpeta

El dominio y el base path salen de variables de entorno (los workflows las pasan
desde las Variables del repo — ver [`AUTOMATIZACION.md`](AUTOMATIZACION.md) §1.3):

| Variable | Ejemplo | Si no está |
|---|---|---|
| `SITE_URL` | `https://tuusuario.github.io` o `https://tudominio.com` | usa `src/data/site.json` → `url` |
| `BASE_PATH` | `/nombre-del-repo` &nbsp;·&nbsp; `/` con dominio propio | `/` |

Afecta a canónicas, Open Graph, `sitemap.xml` y `robots.txt`, y prefija todos los
enlaces y rutas de imágenes. En local: `SITE_URL=… BASE_PATH=… npm run build`.

## 5b. Desplegar

- **GitHub Pages (recomendado, automático):** los workflows `deploy.yml` +
  `refresh.yml` ya lo hacen. Setup en [`AUTOMATIZACION.md`](AUTOMATIZACION.md).
- **Vercel / Netlify:** siguen funcionando, pasos abajo. Ahí no hace falta
  `BASE_PATH` (déjalo en `/`) y `SITE_URL` es tu dominio de Vercel/Netlify.

---

## 6. Desplegar en Vercel (pasos exactos)

### 6.1 Primer deploy (vía Git — recomendado)

1. Sube el proyecto a un repo de GitHub/GitLab/Bitbucket:
   ```bash
   git init
   git add .
   git commit -m "Sitio de afiliados AliExpress"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. Entra a <https://vercel.com>, inicia sesión y pulsa **Add New… → Project**.
3. **Import** el repositorio que acabas de subir.
4. Vercel detecta Astro solo. Deja los valores por defecto:
   - **Framework Preset:** `Astro`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. Pulsa **Deploy**. En ~1 minuto tendrás una URL `*.vercel.app`.
6. Cada `git push` a `main` vuelve a desplegar automáticamente.

### 6.2 Alternativa sin Git (Vercel CLI)

```bash
npm i -g vercel
vercel          # primera vez: responde a las preguntas (acepta los defaults)
vercel --prod   # despliega a producción
```

### 6.3 Conectar tu dominio propio (después)

1. En el dashboard de Vercel: **tu proyecto → Settings → Domains**.
2. Escribe tu dominio (ej. `hallazgosaliexpress.com`) y pulsa **Add**.
3. Vercel te muestra los registros DNS a crear en tu proveedor (el sitio donde
   compraste el dominio):
   - **Dominio raíz** (`hallazgosaliexpress.com`): registro `A` a la IP que
     indica Vercel **o** registro `ALIAS/ANAME` a `cname.vercel-dns.com`.
   - **www** (`www.hallazgosaliexpress.com`): registro `CNAME` a
     `cname.vercel-dns.com`.
4. Guarda los DNS en tu proveedor. La verificación y el certificado HTTPS
   (Let’s Encrypt) se activan solos en minutos u horas.
5. En **Settings → Domains** elige cuál es el dominio principal y deja el otro
   como redirección (recomendado: `www` → raíz, o al revés).
6. **Importante:** actualiza `src/data/site.json` con el dominio final, haz
   `npm run build` y `git push` para que canónicas, OG y sitemap usen el
   dominio correcto.
7. Envía `https://tudominio.com/sitemap.xml` a Google Search Console.

---

## 7. Desplegar en Netlify (alternativa)

- **Vía Git:** New site from Git → elige el repo. Build command `npm run build`,
  publish directory `dist`. Deploy.
- **Vía CLI:**
  ```bash
  npm i -g netlify-cli
  netlify deploy --build --prod
  ```
- **Dominio propio:** Site settings → Domain management → Add domain, y crea el
  `CNAME` a tu subdominio de Netlify (o usa los nameservers de Netlify).

No hace falta ningún archivo de configuración extra: Astro genera HTML estático
en `dist/` y ambas plataformas lo sirven directo.

---

## 8. Verificar Lighthouse (objetivo ≥ 90 en Performance y SEO, móvil)

```bash
npm run build
npm run preview     # queda sirviendo en http://localhost:4321
# en otra terminal:
npx lighthouse http://localhost:4321/moto --preset=perf --form-factor=mobile --view
```

O en Chrome: DevTools → pestaña **Lighthouse** → Mobile → Analyze.

El sitio está optimizado para eso: HTML estático, sin framework JS en cliente,
imágenes con `loading="lazy"` y dimensiones explícitas, CSS única, tipografías
con `preconnect` + `display=swap`. Si quieres exprimir el último punto de
performance, self-hostea las fuentes de Google (descárgalas a
`public/fonts/` y cambia el `<link>` de `BaseLayout.astro` por `@font-face`).

---

## 9. Estructura del proyecto

```
├─ astro.config.mjs         # site + base path (SITE_URL / BASE_PATH por env)
├─ .github/workflows/
│  ├─ refresh.yml           # cron mensual: busca, redacta, commit + push
│  └─ deploy.yml            # en cada push a main: build + deploy a GitHub Pages
├─ src/
│  ├─ data/
│  │  ├─ site.json           # nombre, fecha de actualización, dominio por defecto
│  │  ├─ categories.json     # ★ fuente única: 1 objeto = 1 categoría (nav, SEO, hero, queries)
│  │  ├─ faq.json            # preguntas frecuentes (schema FAQPage)
│  │  └─ products/
│  │     ├─ moto.json        # productos de /moto  (los genera refresh.mjs)
│  │     ├─ camping.json     # productos de /camping
│  │     └─ running.json     # productos de /running
│  ├─ lib/
│  │  ├─ site.ts             # withBase() (base path) + tpl() ({n}/{year})
│  │  └─ format.ts           # fecha larga en español
│  ├─ layouts/BaseLayout.astro   # <head>, SEO, OG, header, footer, back-to-top
│  ├─ components/
│  │  ├─ Header.astro / Footer.astro / BackToTop.astro
│  │  ├─ NicheTemplate.astro     # arma una página de categoría + JSON-LD
│  │  ├─ CompareTable.astro      # tabla comparativa anclada a las reseñas
│  │  ├─ ProductCard.astro       # tarjeta de producto + botón de afiliado
│  │  ├─ MidCta.astro            # CTA intermedio
│  │  └─ Faq.astro
│  ├─ pages/
│  │  ├─ index.astro             # /
│  │  ├─ [categoria].astro       # /moto /camping /running … (una por categories.json)
│  │  ├─ aviso-afiliados.astro   # divulgación (linkeada en el footer de todo el sitio)
│  │  ├─ sitemap.xml.ts          # /sitemap.xml
│  │  └─ robots.txt.ts           # /robots.txt
│  └─ styles/global.css
├─ public/
│  ├─ favicon.svg  ·  .nojekyll
│  ├─ og/                    # imágenes Open Graph (genéricas)
│  └─ img/<categoria>/NN.webp   # fotos de producto (las baja refresh.mjs)
└─ scripts/
   ├─ refresh.mjs           # buscar + link + foto + copy + escribir (ver AUTOMATIZACION.md)
   └─ generate-placeholders.mjs   # favicon, OG y placeholders de hueco
```

---

## 10. Programa de afiliados de AliExpress — checklist

- [x] Página `/aviso-afiliados` con la divulgación completa.
- [x] Aviso de afiliados en el **footer de todas las páginas**, con enlace a `/aviso-afiliados`.
- [x] Enlaces salientes marcados `rel="nofollow sponsored noopener"`.
- [x] Precios etiquetados como “de referencia”.
- [x] Los 30 productos elegidos y enlazados a fichas reales de AliExpress.
- [x] Los 30 productos con foto real (`.webp`) en `public/img/`.
- [ ] Convierte las 30 URLs a tus enlaces rastreados de Portals (sección 2 + tablas de abajo).
- [ ] Cambia `src/data/site.json` → `url` a tu dominio real antes del deploy final.
- [ ] (Opcional) Reemplaza las fotos con versiones más limpias y las imágenes OG.

---

## 11. Los 30 productos y sus URLs

Cada fila = un objeto en el JSON indicado, identificado por su `rank`. Convierte
la **URL actual** en tu enlace de AliExpress Portals y pégalo en `link_afiliado`
(ver sección 2). Precios y stock capturados el **2026-08-30**; verifícalos antes
de publicar, cambian seguido.

### `src/data/moto.json`
| rank | Producto | URL actual (`link_afiliado`) |
|---|---|---|
| 1 | Intercomunicador Bluetooth FreedConn KY Pro | `https://www.aliexpress.com/item/1005006861760459.html` |
| 2 | Soporte de celular antivibración de aluminio | `https://www.aliexpress.com/item/1005007674493055.html` |
| 3 | Guantes de moto con protección y dedos táctiles | `https://www.aliexpress.com/item/1005007385178555.html` |
| 4 | Inflador de aire portátil recargable (manómetro digital) | `https://www.aliexpress.com/item/1005005768360349.html` |
| 5 | Luces LED auxiliares / neblineros con DRL | `https://www.aliexpress.com/item/1005010806526219.html` |
| 6 | Pasamontañas térmico Rockbros | `https://www.aliexpress.com/item/1005006461143356.html` |
| 7 | Bolsa de tanque impermeable Rhinowalk | `https://www.aliexpress.com/item/1005010471265965.html` |
| 8 | Funda cubre moto impermeable con protección UV | `https://www.aliexpress.com/item/1005006532342744.html` |
| 9 | Kit de reparación de llanta tubeless con mechas | `https://www.aliexpress.com/item/1005005949133345.html` |
| 10 | Candado de disco para moto con alarma | `https://www.aliexpress.com/item/1005012234247044.html` |

### `src/data/camping.json`
| rank | Producto | URL actual (`link_afiliado`) |
|---|---|---|
| 1 | Carpa Naturehike Cloud-Up (2 personas) | `https://www.aliexpress.com/item/1005007766384801.html` |
| 2 | Colchoneta inflable ultraliviana | `https://www.aliexpress.com/item/1005010158141221.html` |
| 3 | Saco de dormir tipo momia Naturehike (MJ300/MJ600) | `https://www.aliexpress.com/item/1005006979079698.html` |
| 4 | Sistema de cocina a gas Fire-Maple Petrel | `https://www.aliexpress.com/item/1005005616325284.html` |
| 5 | Linterna frontal recargable por USB (COB) | `https://www.aliexpress.com/item/1005010769481549.html` |
| 6 | Silla plegable ultraliviana de aluminio (WESTTUNE) | `https://www.aliexpress.com/item/1005010039664099.html` |
| 7 | Mini bomba de aire eléctrica Flextail Zero Pump | `https://www.aliexpress.com/item/1005007345413368.html` |
| 8 | Filtro de agua portátil tipo pajita | `https://www.aliexpress.com/item/1005011937377808.html` |
| 9 | Bastones de trekking plegables de aluminio (par) | `https://www.aliexpress.com/item/1005012873144202.html` |
| 10 | Power bank solar 20 000 mAh | `https://www.aliexpress.com/item/1005012124170204.html` |

### `src/data/running.json`
| rank | Producto | URL actual (`link_afiliado`) |
|---|---|---|
| 1 | Chaleco de hidratación Aonijie (C962, 12 L) | `https://www.aliexpress.com/item/4000248545527.html` |
| 2 | Audífonos de conducción ósea open-ear (IPX8) | `https://www.aliexpress.com/item/1005009706727798.html` |
| 3 | Cinturón de running para celular impermeable | `https://www.aliexpress.com/item/1005006042747299.html` |
| 4 | Reloj GPS Amazfit Bip U Pro | `https://www.aliexpress.com/item/1005009020315634.html` |
| 5 | Medias de compresión hasta la rodilla | `https://www.aliexpress.com/item/1005004389095840.html` |
| 6 | Lentes deportivos fotocromáticos Rockbros (UV400) | `https://www.aliexpress.com/item/1005007454897718.html` |
| 7 | Gorra de running quick-dry ultraligera | `https://www.aliexpress.com/item/1005007617728467.html` |
| 8 | Soft flask plegable 500 ml (WRELS) | `https://www.aliexpress.com/item/1005007505482487.html` |
| 9 | Mini pistola de masaje muscular USB | `https://www.aliexpress.com/item/1005010228465799.html` |
| 10 | Luz LED con clip para correr de noche | `https://www.aliexpress.com/item/1005010241131322.html` |
