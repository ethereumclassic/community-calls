import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "../lib/config";
import { sortCallsByDate } from "../lib/calls";
import { formatISODate } from "../lib/dates";

export const GET: APIRoute = async () => {
  const allCalls = await getCollection("calls");

  // Filter out special calls, only include dated calls
  const calls = sortCallsByDate(
    allCalls.filter((call) => !call.data.special && call.data.date),
  );

  const today = formatISODate(new Date());
  const latestCallDate = calls[0]?.data.date
    ? formatISODate(calls[0].data.date)
    : today;

  const urlEntries = [
    // Homepage
    `  <url>
    <loc>${siteConfig.url}/</loc>
    <lastmod>${latestCallDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    // Individual call pages
    ...calls.map((call) => {
      const slug = call.data.slug!;
      const lastmod = call.data.date ? formatISODate(call.data.date) : today;
      const isUpcoming =
        call.data.date && call.data.date.getTime() > Date.now();

      return `  <url>
    <loc>${siteConfig.url}/calls/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${isUpcoming ? "daily" : "monthly"}</changefreq>
    <priority>${isUpcoming ? "0.9" : "0.7"}</priority>
  </url>`;
    }),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries.join("\n")}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
