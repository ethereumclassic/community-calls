import type { APIRoute, GetStaticPaths } from "astro";
import { siteConfig } from "../../lib/config";
import { getCalls } from "../../lib/calls";
import { formatICSDate, parseUTCTime } from "../../lib/dates";
import { escapeICS } from "../../lib/encode";

export const getStaticPaths: GetStaticPaths = async () => {
  const allCalls = await getCalls();

  // Only generate ICS for calls that have a date
  const datedCalls = allCalls.filter((call) => call.data.date);

  return datedCalls.map((call) => ({
    params: { slug: call.data.slug },
    props: { call },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const { call } = props;

  const callNumber = call.data.callNumber!;
  const date = call.data.date!;
  const time = call.data.time;

  const now = new Date();
  const nowFormatted = formatICSDate(now);

  // Set start time
  const startDate = new Date(date);
  if (time) {
    const parsed = parseUTCTime(time);
    if (parsed) {
      startDate.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
    }
  }

  // End time is typically 1 hour after start
  const endDate = new Date(startDate);
  endDate.setUTCHours(endDate.getUTCHours() + 1);

  const summary = `ETC Community Call #${callNumber}${call.data.description ? `: ${call.data.description}` : ""}`;
  const slug = call.data.slug!;
  const url = `${siteConfig.url}/calls/${slug}`;

  let description = `Ethereum Classic Community Call #${callNumber}`;
  if (call.data.description) {
    description += `\\n\\n${call.data.description}`;
  }
  description += `\\n\\nMore info: ${url}`;
  if (call.data.joinLink) {
    description += `\\nJoin: ${call.data.joinLink}`;
  }
  if (call.data.youtube) {
    description += `\\nRecording: https://youtube.com/watch?v=${call.data.youtube}`;
  }

  const location = call.data.location || "Online";

  const event = [
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

  // Build calendar
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${siteConfig.name}//cc.ethereumclassic.org//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICS(summary)}`,
    event,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="etccc-${callNumber}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
