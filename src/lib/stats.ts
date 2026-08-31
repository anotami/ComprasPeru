import type { Product } from "../components/ProductCard.astro";
import site from "../data/site.json";
import categories from "../data/categories.json";

const files = import.meta.glob<{ default: Product[] }>(
  "../data/products/*.json",
  { eager: true },
);

/** Suma de todos los "vendidos" reales que capturamos de AliExpress. */
function sumaVentas(list: Product[]): number {
  return list.reduce((s, p) => s + (p._src?.orders ?? 0), 0);
}

/** Formatea un entero grande a algo legible: 1054923 -> "1,05 M". */
export function compacto(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(".", ",") + " M";
  if (n >= 10_000) return Math.round(n / 1000) + " mil";
  return n.toLocaleString("es");
}

/** Números reales del catálogo entero — se calculan en el build, sin terceros. */
export function siteStats() {
  const todos = Object.values(files).flatMap((m) => m.default ?? []);
  const cats = categories.categorias;
  return {
    productos: todos.length,
    categorias: cats.length,
    rankings: cats.reduce((s, c) => s + 1 + (c.subcategorias?.length ?? 0), 0),
    ventasSumadas: sumaVentas(todos),
    actualizado: site.actualizado,
  };
}

/** Igual, pero de una sola lista ya cargada (una página de categoría). */
export function listaStats(list: Product[]) {
  return { productos: list.length, ventasSumadas: sumaVentas(list) };
}
