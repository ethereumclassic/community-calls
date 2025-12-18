import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const siteUrl = 'https://cc.ethereumclassic.org';
const siteName = 'ETC Community Calls';
const siteDescription = 'Regular open discussions about Ethereum Classic development, ECIPs, and the future of ETC.';

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

// Escape XML entities
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format date for RSS (RFC 822)
function formatRfc822(date: Date): string {
  return date.toUTCString();
}

export const GET: APIRoute = async () => {
  const allCalls = await getCollection('calls');

  // Filter and sort calls (newest first)
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
    })
    .slice(0, 50); // Limit to 50 most recent

  const now = new Date();
  const latestDate = calls[0]?.data.date || now;

  const items = calls.map(call => {
    const callNumber = getCallNumber(call);
    const slug = getSlug(call);
    const url = `${siteUrl}/calls/${slug}`;
    const title = `ETC Community Call #${callNumber}${call.data.description ? `: ${call.data.description}` : ''}`;
    const pubDate = call.data.date ? formatRfc822(call.data.date) : formatRfc822(now);
    const ogImageUrl = `${siteUrl}/og/call/${callNumber}.png`;

    let description = `Ethereum Classic Community Call #${callNumber}`;
    if (call.data.description) {
      description += ` - ${call.data.description}`;
    }
    if (call.data.time) {
      description += ` | Time: ${call.data.time}`;
    }
    if (call.data.location) {
      description += ` | Location: ${call.data.location}`;
    }
    if (call.data.youtube) {
      description += ` | Recording available on YouTube`;
    }

    return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      <enclosure url="${ogImageUrl}" type="image/png" length="0" />
      ${call.data.youtube ? `<comments>${escapeXml(call.data.youtube)}</comments>` : ''}
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatRfc822(latestDate)}</lastBuildDate>
    <pubDate>${formatRfc822(latestDate)}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${siteUrl}/etc-logo.svg</url>
      <title>${escapeXml(siteName)}</title>
      <link>${siteUrl}</link>
    </image>
    <category>Cryptocurrency</category>
    <category>Ethereum Classic</category>
    <category>Blockchain</category>
    <generator>Astro</generator>
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
