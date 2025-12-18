import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const siteUrl = 'https://cc.ethereumclassic.org';

// Get call number from frontmatter or filename
function getCallNumber(call: { id: string; data: { number?: number } }): number {
  if (call.data.number) return call.data.number;
  const match = call.id.match(/_(\d+)\.md$/);
  return match ? parseInt(match[1], 10) : 0;
}

// Generate slug for call URL
function getSlug(call: { id: string; data: { number?: number; description?: string; date?: Date } }): string {
  const date = call.data.date;
  const num = getCallNumber(call);
  const desc = call.data.description;

  if (date && desc) {
    const dateStr = date.toISOString().split('T')[0];
    const slugDesc = desc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${dateStr}-${num}-${slugDesc}`;
  }
  return call.id.replace('.md', '');
}

// Format date for sitemap (W3C Datetime)
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export const GET: APIRoute = async () => {
  const allCalls = await getCollection('calls');

  // Filter out addendum and recurring files
  const calls = allCalls
    .filter(call =>
      !call.id.includes('addendum') &&
      !call.id.includes('recurring') &&
      call.data.date
    )
    .sort((a, b) => {
      const dateA = a.data.date ? new Date(a.data.date).getTime() : 0;
      const dateB = b.data.date ? new Date(b.data.date).getTime() : 0;
      return dateB - dateA;
    });

  const today = formatDate(new Date());
  const latestCallDate = calls[0]?.data.date ? formatDate(calls[0].data.date) : today;

  const urlEntries = [
    // Homepage
    `  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${latestCallDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    // Individual call pages
    ...calls.map(call => {
      const slug = getSlug(call);
      const lastmod = call.data.date ? formatDate(call.data.date) : today;
      const isUpcoming = call.data.date && call.data.date.getTime() > Date.now();

      return `  <url>
    <loc>${siteUrl}/calls/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${isUpcoming ? 'daily' : 'monthly'}</changefreq>
    <priority>${isUpcoming ? '0.9' : '0.7'}</priority>
  </url>`;
    })
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries.join('\n')}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
