import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";
import { getCalls, sortCallsByDate } from "../lib/calls";
import { formatICSDate, parseUTCTime } from "../lib/dates";
import { escapeICS } from "../lib/encode";

export const GET: APIRoute = async () => {
  const allCalls = await getCalls();

  // Filter out special calls, keep only dated calls
  const calls = sortCallsByDate(
    allCalls.filter((call) => !call.data.special && call.data.date),
  );

  const now = new Date();
  const nowFormatted = formatICSDate(now);

  // Generate VEVENT for each call
  const events = calls.map((call) => {
    const callNumber = call.data.callNumber!;
    const date = call.data.date!;
    const time = call.data.time;

    // Set start time
    const startDate = new Date(date);
    if (time) {
      const parsed = parseUTCTime(time);
      if (parsed) {
        startDate.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
      }
    }

    // End time is typically 2 hours after start
    const endDate = new Date(startDate);
    endDate.setUTCHours(endDate.getUTCHours() + 2);

    const summary = `ETC Community Call #${callNumber}${call.data.description ? `: ${call.data.description}` : ""}`;
    const slug = call.data.slug!;
    const url = `${siteConfig.url}/calls/${slug}`;

    let description = `Ethereum Classic Community Call #${callNumber}`;
    if (call.data.description) {
      description += `\\n\\n${call.data.description}`;
    }
    description += `\\n\\nMore info: ${url}`;
    if (call.data.youtube) {
      description += `\\nRecording: ${call.data.youtube}`;
    }

    const location = call.data.location || "Online";

    return [
      "BEGIN:VEVENT",
      `UID:${call.data.uid}`,
      `DTSTAMP:${nowFormatted}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      `LOCATION:${escapeICS(location)}`,
      `URL:${url}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  // Build calendar
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${siteConfig.name}//cc.ethereumclassic.org//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${siteConfig.name}`,
    `X-WR-CALDESC:${siteConfig.description}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...events.map((e) => e),
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="etccc.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
};
