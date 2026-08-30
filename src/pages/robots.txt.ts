import type { APIRoute } from "astro";
import site from "../data/site.json";
import { withBase } from "../lib/site";

export const GET: APIRoute = ({ site: astroSite }) => {
  const origin = astroSite ?? new URL(site.url);
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL(withBase("/sitemap.xml"), origin).href}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
