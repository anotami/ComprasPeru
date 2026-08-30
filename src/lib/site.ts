import site from "../data/site.json";

/** Prefija una ruta con el base path del sitio (para GitHub Pages en subcarpeta). */
export function withBase(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return (base + "/" + String(path).replace(/^\//, "")).replace(/\/{2,}/g, "/") || "/";
}

/**
 * URL absoluta y canónica de una ruta interna.
 * Pásale `Astro.site` como `origin` desde componentes .astro.
 */
export function absUrl(path: string, origin?: string | URL): string {
  return new URL(withBase(path), origin ?? site.url).href;
}

/** Reemplaza {n} y {year} en los textos de categoría. */
export function tpl(text: string, vars: { n?: number; year?: number } = {}): string {
  const year = vars.year ?? new Date().getFullYear();
  return String(text)
    .replaceAll("{year}", String(year))
    .replaceAll("{n}", String(vars.n ?? ""));
}
