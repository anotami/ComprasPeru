import type { APIRoute } from "astro";
import site from "../data/site.json";
import categories from "../data/categories.json";
import { withBase } from "../lib/site";

export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = astroSite ?? new URL(site.url);
  const routes = [
    { path: "/", priority: "1.0" },
    ...categories.categorias.flatMap((c) => [
      { path: `/${c.slug}`, priority: "0.8" },
      ...(c.subcategorias ?? []).map((s) => ({
        path: `/${c.slug}/${s.slug}`,
        priority: "0.6",
      })),
    ]),
    { path: "/aviso-afiliados", priority: "0.3" },
  ];

  const body = routes
    .map(
      ({ path, priority }) => `  <url>
    <loc>${new URL(withBase(path), origin).href}</loc>
    <lastmod>${site.actualizado}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
