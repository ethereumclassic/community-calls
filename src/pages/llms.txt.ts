import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";
import { getCalls, sortCallsByDate } from "../lib/calls";

export const GET: APIRoute = async () => {
  const allCalls = await getCalls();
  const calls = sortCallsByDate(allCalls.filter((call) => !call.data.special));

  const callLines = calls.map((call) => {
    const num = call.data.callNumber;
    const date = call.data.date.toISOString().split("T")[0];
    return `- [ETCCC ${num} (${date})](${siteConfig.url}/calls/${call.data.slug}): ${call.data.description}`;
  });

  const body = `# ${siteConfig.name}

> ${siteConfig.description}

This site hosts agendas, notes, and recordings for the Ethereum Classic Community Call (ETCCC) series.

## Sitemap

- [sitemap.xml](${siteConfig.url}/sitemap.xml)

## Feeds

- [RSS Feed](${siteConfig.rssUrl})
- [iCalendar Feed](${siteConfig.icsUrl})

## Links

- [Website](${siteConfig.social.website})
- [Discord](${siteConfig.social.discord})
- [YouTube](${siteConfig.social.youtube})
- [GitHub](${siteConfig.social.github})

## Calls

${callLines.join("\n")}
`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
