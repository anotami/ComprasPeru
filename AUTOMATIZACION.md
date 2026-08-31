# Automatización — el sitio se actualiza y publica solo

Una vez configurado esto, **cada mes** GitHub:

1. Busca en AliExpress los productos **más vendidos** de cada categoría.
2. Arma tu **link de afiliado** para cada uno (por plantilla, sin login).
3. Descarga las **fotos**.
4. Redacta la **descripción y los 3 “por qué comprarlo”** con Claude.
5. Escribe los datos, hace **commit** y **push**.
6. El push dispara el **build** y el **deploy a GitHub Pages**.

Sin que toques nada. Agregar una categoría = editar un archivo (ver más abajo).

---

## Parte 1 · Setup único (30–45 min, una sola vez)

### 1.1 Subir el proyecto a GitHub

```bash
git add -A
git commit -m "Sitio de afiliados + automatización"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 1.2 Activar GitHub Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 1.3 Variables del repo

Repo → **Settings → Secrets and variables → Actions → pestaña _Variables_ → New repository variable**:

| Variable | Valor | Para qué |
|---|---|---|
| `SITE_URL` | `https://TU_USUARIO.github.io` (o tu dominio propio con `https://`) | URLs canónicas, OG, sitemap |
| `BASE_PATH` | `/TU_REPO` &nbsp;·&nbsp; **o** `/` si el repo se llama `TU_USUARIO.github.io` o usas dominio propio | subcarpeta donde vive el sitio |
| `PEN_USD` *(opcional)* | `3.75` | tipo de cambio para el “precio de referencia” |
| `LINK_MODE` *(opcional)* | `deeplink` (por defecto) | cómo se arma el link de afiliado |
| `ANTHROPIC_MODEL` *(opcional)* | `claude-haiku-4-5` | modelo para redactar (sin sufijo de fecha) |

### 1.4 Secretos del repo

Misma pantalla, pestaña **_Secrets_ → New repository secret**:

| Secreto | De dónde sale |
|---|---|
| `ALIEXPRESS_AFF_KEY` | Tu `aff_short_key` de AliExpress Portals (ver 1.5) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → **API Keys → Create Key**. Cárgale ~$5 de saldo; cada corrida mensual cuesta centavos. |

Y como **Variable** (no secreto), solo si tu API key está ligada a un workspace
(la corrida falla con `HTTP 400 … anthropic-workspace-id is required`):

| Variable | De dónde sale |
|---|---|
| `ANTHROPIC_WORKSPACE_ID` | [console.anthropic.com/settings/workspaces](https://console.anthropic.com/settings/workspaces) → tu workspace → el `wrkspc_…` de la URL |

### 1.5 Tu `aff_short_key` de AliExpress (para los links, sin API)

1. Entra a [portals.aliexpress.com](https://portals.aliexpress.com) con tu cuenta de afiliado.
2. Busca tu **tracking id / short key**: suele estar en **Ad Center → Tracking ID** o dentro de cualquier link que ya te haya generado la herramienta (el trozo después de `aff_short_key=` o el código del link `e/_XXXXXXX`).
3. **Pruébalo** antes de confiar en él. Arma esta URL con tu key y ábrela en el navegador:
   ```
   https://s.click.aliexpress.com/deep_link.htm?aff_short_key=TU_KEY&dl_target_url=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1005006861760459.html
   ```
   Debe llevarte a la ficha del producto. Espera unos minutos y mira en el **reporte de Portals** si el clic quedó registrado con tu tracking.
   - **Registra el clic** → perfecto, pon la key en `ALIEXPRESS_AFF_KEY` y listo para siempre.
   - **No registra / no soporta deeplink** → tu cuenta necesita otro método. Opciones:
     - `LINK_MODE=raw`: el botón lleva al producto pero **sin comisión** (útil para publicar ya y arreglar después).
     - `LINK_MODE=manual`: el refresh deja `PEGAR_LINK_AQUI` y genera `refresh-manual-links.json` con las URLs; las conviertes una vez al mes con el prompt de Claude‑para‑Chrome (ver `README.md`) y haces commit.
     - Solicitar la **API oficial** de afiliados (más estable) — pídemelo y te lo dejo montado, el `refresh.mjs` está hecho para cambiar la fuente en una función.

### 1.6 Lanzar la primera corrida a mano

Repo → **Actions → “Refrescar rankings” → Run workflow**. Cuando termine y haga push, se dispara solo el deploy. En unos minutos tu sitio está en `SITE_URL + BASE_PATH`.

A partir de ahí corre **solo, el día 1 de cada mes**.

---

## Parte 2 · Agregar / quitar / cambiar categorías

Todo vive en **`src/data/categories.json`**. Agregar un objeto = una página nueva
(`/slug`), su tarjeta en el home, su entrada en el menú y en el sitemap.

```jsonc
{
  "slug": "cocina",                       // la URL: /cocina  (solo minúsculas, sin espacios)
  "nombre": "Cocina",
  "nav": "Cocina",
  "emoji": "🍳",
  "accent": "#B23A48",                    // color de acento de la categoría
  "accentWash": "#F4E3E4",                // versión clara del acento (fondos)
  "kicker": "Utensilios de cocina",
  "h1": "Los {n} mejores gadgets de cocina de AliExpress ({year})",
  "subtitulo": "Frase corta que se ve bajo el título y en la tarjeta del home.",
  "title": "Top {n} gadgets de cocina en AliExpress ({year}) | Hallazgos AliExpress",
  "meta": "Descripción SEO de ~150 caracteres. Admite {n} y {year}.",
  "intro": "Párrafo de 2–3 frases que explica el criterio de la lista.",
  "queries": [
    "afilador cuchillos electrico cocina",
    "bascula digital cocina 5kg",
    "set organizador cajones cocina",
    "termometro cocina digital pincho",
    "prensa ajos acero inoxidable"
  ]
}
```

- **`queries`** manda: **1 búsqueda = 1 puesto del ranking**. El robot toma el
  producto con **más pedidos** de cada búsqueda (rating ≥ 4.3, con foto, sin
  repetir). Cuantas más queries pongas, más largo el ranking. Sé específico:
  `"reloj gps running deporte"` trae mejores resultados que `"reloj"`.
- `{n}` se reemplaza por la cantidad real de productos; `{year}` por el año.
- **Quitar** una categoría: borra su objeto (opcional: borra `src/data/products/<slug>.json`
  y `public/img/<slug>/`).
- Después de editar: `git commit` + `git push`. El siguiente refresh mensual la
  completa; para verla ya, lanza **Run workflow** a mano.

> El color de acento no necesita tocar CSS: sale de `accent` / `accentWash`.
> Mientras una categoría nueva no tenga productos, su página muestra un aviso de
> “estamos actualizando”.

### Subcategorías (opcional)

Cada categoría puede tener un array `subcategorias` (hoy son **5 por categoría**,
tipo taxonomía de AliExpress). Cada una es su propia página en
`/<categoria>/<subcategoria>` con su mini-ranking de **10 productos**, y aparece
en la sección **“Explora por tema”** de la página padre.

```jsonc
{
  "slug": "moto",
  "...": "...campos normales de la categoría...",
  "queries": [ "...10 búsquedas del top general..." ],
  "subcategorias": [
    {
      "slug": "comunicacion",                 // URL: /moto/comunicacion
      "nombre": "Comunicación en el casco",
      "kicker": "Intercomunicadores y audio", // etiqueta corta
      "intro": "Frase de 1–2 líneas que explica el tema.",
      "queries": [ "...10 búsquedas...", "..." ]   // 1 búsqueda = 1 puesto
    }
    // 5 en total
  ]
}
```

El robot mensual llena el padre **y** cada subcategoría. Los datos van a
`src/data/products/<categoria>__<subcategoria>.json` y las fotos a
`public/img/<categoria>__<subcategoria>/`. Ojo: el catálogo completo son
**~360 búsquedas** (6 categorías × 5 subcategorías × 10 + padres). Por eso la
corrida completa es la que más chance tiene de toparse con captcha.

### Modo `chain` — encadenar por categoría, sin esperar

En **Run workflow** hay un input `chain`. Le pasás las categorías separadas por
coma y el workflow procesa **una por corrida** y **se re-lanza solo** con las que
faltan, en secuencia, sin solaparse. Una sola vez que lo disparás:

```
chain: moto,camping,running,impresion-3d,meshtastic
```

→ corre `moto`, al terminar dispara `camping`, luego `running`, etc. Cada corrida
es ~60 búsquedas (mucho más seguro que las 360 de una) y commitea + deploya lo
suyo. Una categoría con captcha **no frena la cadena**. Si el re-lanzamiento
automático no arrancara, creá un PAT con scope `actions:write` y guardalo como
secreto **`CHAIN_TOKEN`**. También sirve el input `only` para una sola categoría
suelta. Espaciado tuneable con las Variables `REQUEST_DELAY_MS` / `COOLDOWN_MS` /
`MAX_BLOCKS_ABORT`.

---

## Parte 3 · Probar y ajustar en tu PC

```bash
npm install

# ver qué elegiría, sin escribir nada:
npm run refresh -- --dry-run --only=moto

# correr de verdad una categoría (usa tus variables de entorno locales):
LINK_MODE=raw npm run refresh -- --only=camping --no-copy

# con copy de Claude y links reales:
ALIEXPRESS_AFF_KEY=xxx ANTHROPIC_API_KEY=sk-ant-xxx npm run refresh

npm run dev        # revisar el sitio en http://localhost:4321
npm run build      # comprobar que compila
```

Flags de `refresh.mjs`:

| Flag | Efecto |
|---|---|
| `--dry-run` | no escribe nada, solo muestra las elecciones |
| `--only=moto,camping` | limita a esas categorías |
| `--refresh-copy` | vuelve a redactar también lo que no cambió (por defecto reusa el texto si el producto es el mismo del mes pasado) |
| `--no-copy` | nunca llama a Anthropic; usa texto de plantilla |
| `--copy-only` | **solo reescribe los textos** de los JSON que ya existen, con Claude. NO toca AliExpress (cero riesgo de captcha). Útil si el scraping se hizo con `--no-copy` o si quieres regenerar toda la redacción. |
| `--no-subs` | ignora las subcategorías (solo padres) |

Variables de entorno / pacing: `REQUEST_DELAY_MS` (ms entre búsquedas, def. 4000),
`COOLDOWN_MS` (tras un bloqueo, def. 90000), `MAX_BLOCKS_ABORT` (def. 10),
`PRICE_LO` / `PRICE_HI` (banda de precio, def. 0.94 / 1.10).

En el **workflow** (Actions → Refrescar rankings → Run workflow) las mismas
opciones están como casillas: `only`, `refresh_copy`, `copy_only`.

`refresh.mjs` **conserva tu texto** de un producto si su id de AliExpress no
cambió respecto al mes anterior (así solo paga redacción por lo nuevo). Si
editaste a mano una descripción y quieres que se respete, no toques su `_src.id`.

---

## Parte 4 · El captcha de AliExpress (léelo)

AliExpress empieza a mostrar **captcha tras ~15–20 búsquedas rápidas desde la
misma IP**. `refresh.mjs` lo maneja: espacia las requests (`REQUEST_DELAY_MS`,
4 s por defecto), **enfría 90 s y reintenta** lo que bloqueó, rota el
`User-Agent`, y si una IP queda quemada **conserva los rankings del mes anterior**
en los puestos que no pudo actualizar (no rompe el sitio).

Aun así, **desde los servidores de GitHub (IP de datacenter) es más probable que
lo bloqueen** que desde tu casa. En orden de fiabilidad:

| Opción | Fiabilidad | Esfuerzo |
|---|---|---|
| **A. Self-hosted runner en tu PC** | alta (tu IP casera) | 10 min, y el PC encendido el día 1 |
| **B. Correr `npm run refresh` en tu PC y `git push`** | alta | manual, 1 vez al mes |
| **C. Dejar el cron en GitHub tal cual** | media — algunos meses refresca parcial | cero; si falla, relanzas con 1 clic |
| **D. API oficial de afiliados** | máxima, sin captcha | solicitud única (te lo dejo montado si la consigues) |

### A. Self-hosted runner (recomendado si quieres cero intervención)

1. Repo → **Settings → Actions → Runners → New self-hosted runner** y sigue los
   pasos para tu SO (descarga + `./config` + `./run` o instalar como servicio).
2. En `.github/workflows/refresh.yml` cambia `runs-on: ubuntu-latest` por
   `runs-on: self-hosted`.
3. Listo: el cron mensual corre en tu máquina, con tu IP. El deploy sigue en los
   servidores de GitHub (no necesita runner propio).

### Ajustes finos

- Subir la tolerancia: variable `REQUEST_DELAY_MS` a `8000`, `COOLDOWN_MS` a `120000`.
- **Un producto quedó feo o fuera de tema** → haz la `query` de `categories.json`
  más específica y relanza (`Run workflow` con `only=esa-categoria`).
- **AliExpress cambió el HTML y ya no parsea** → el arreglo está acotado a la
  función `search()` de `scripts/refresh.mjs`. Buen momento para pasar a la API.
- **El scraping de la búsqueda es zona gris de los términos de AliExpress.** Bajo
  volumen (1 vez al mes, tu propio sitio de afiliado), pero tenlo presente. La API
  oficial es la vía sancionada si quieres cero riesgo.
- **El catálogo completo son ~360 búsquedas** (10 por subcategoría × 5 × 6 + los
  padres), así que la corrida completa tarda ~1 h y es la que más chance tiene de
  toparse con captcha. Si bloquea, corré **por categoría** con `only` (o
  `--only=categoria` en local) y hacé push entre medias, o usá un self-hosted
  runner. El workflow ya trae espaciado alto por defecto.

---

## Parte 5 · Analíticas (opcional pero recomendado)

### Prueba social sin terceros (ya activa)

El sitio muestra números reales **calculados en el build**, sin analítica ni
backend: en el pie y bajo el hero del home ("140 productos vigilados · 20
rankings · +1,05 M de ventas sumadas en AliExpress") y una línea por categoría
("10 productos · +83 mil ventas sumadas"). Salen de `_src.orders` de cada
producto (`src/lib/stats.ts`) y se actualizan solos en cada refresco mensual.
Cada tarjeta ya trae además el "★ 4.6 · 12.400+ vendidos" real del producto.

> **Contador de visitas/clics reales:** GitHub Pages no tiene backend ni API de
> tráfico, así que un contador de visitas propio "solo con GitHub" no es posible
> sin exponer un token en el navegador. Si algún día lo quieres, la vía limpia es
> un Cloudflare Worker + KV en **tu** cuenta (plan gratis). Mientras tanto, la
> prueba social de arriba (ventas reales) es más fuerte que un contador de vistas.

### Analíticas privadas (opcional)

Para saber qué categorías y productos generan clics sin que se vea en la página,
elige una —todas sin cookies, sin banner y sin impacto de rendimiento— y pega los
datos en `src/data/site.json` → `analytics`. Lo que dejes vacío no carga nada.

**Recomendada — Cloudflare Web Analytics (gratis):**

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Analytics & Logs → Web Analytics → Add a site**.
2. Pon tu dominio (o el `usuario.github.io`). Te da un **token** (una cadena larga).
3. En `src/data/site.json`:
   ```json
   "analytics": { "plausible": "", "umami": { "src": "", "id": "" }, "cloudflare": "TU_TOKEN" }
   ```
4. `git commit` + `git push`.

**Alternativas:** Plausible (`"plausible": "tudominio.com"`, de pago o self-host)
o Umami (`"umami": { "src": "https://…/script.js", "id": "…" }`, self-host).

El sitio ya dispara un evento **“Clic afiliado”** con el nombre del producto en
cada clic saliente, si hay Plausible o Umami cargado — así ves qué se lleva la
gente.
