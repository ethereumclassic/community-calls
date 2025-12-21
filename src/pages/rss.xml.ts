import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";
import { getCalls, sortCallsByDate } from "../lib/calls";
import { formatRfc822 } from "../lib/dates";
import { escapeXml } from "../lib/encode";

export const GET: APIRoute = async () => {
  const allCalls = await getCalls();

  // Filter out special calls and sort (newest first)
  const calls = sortCallsByDate(
    allCalls.filter((call) => !call.data.special),
  ).slice(0, 50); // Limit to 50 most recent

  const now = new Date();
  const latestDate = calls[0]?.data.date ?? now;

  const items = calls.map((call) => {
    const callNumber = call.data.callNumber!;
    const slug = call.data.slug!;
    const url = `${siteConfig.url}/calls/${slug}`;
    const title = `ETC Community Call #${callNumber}: ${call.data.description}`;
    const pubDate = formatRfc822(call.data.date);
    const ogImageUrl = `${siteConfig.url}/og/call/${callNumber}.png`;

    let description = `Ethereum Classic Community Call #${callNumber}`;
    description += ` - ${call.data.description}`;
    description += ` | Time: ${call.data.time}`;
    description += ` | Location: ${call.data.location}`;
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
      ${call.data.youtube ? `<comments>${escapeXml(call.data.youtube)}</comments>` : ""}
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteConfig.name)}</title>
    <link>${siteConfig.url}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${formatRfc822(latestDate)}</lastBuildDate>
    <pubDate>${formatRfc822(latestDate)}</pubDate>
    <ttl>60</ttl>
    <atom:link href="${siteConfig.rssUrl}" rel="self" type="application/rss+xml" />
    <image>
      <url>${siteConfig.url}${siteConfig.assets.logo}</url>
      <title>${escapeXml(siteConfig.name)}</title>
      <link>${siteConfig.url}</link>
    </image>
    <category>Cryptocurrency</category>
    <category>Ethereum Classic</category>
    <category>Blockchain</category>
    <generator>Astro</generator>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
