// @ts-check
import { defineConfig } from 'astro/config';
import site from './src/data/site.json' with { type: 'json' };

// El dominio y el base path de producción se pueden fijar por variable de entorno
// (los workflows de GitHub las pasan). Por defecto usa src/data/site.json y raíz.
//   SITE_URL   -> ej. https://tuusuario.github.io   o   https://tudominio.com
//   BASE_PATH  -> ej. /nombre-del-repo   (déjalo en / si usas dominio propio)
const SITE = process.env.SITE_URL || site.url;
const BASE = process.env.BASE_PATH || '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
