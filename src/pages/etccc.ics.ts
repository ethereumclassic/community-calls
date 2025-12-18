import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Parse time string like "1500 UTC" to hours and minutes
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2})(\d{2})\s*UTC$/i);
  if (!match) return null;
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
}

// Format date to ICS format (YYYYMMDDTHHMMSSZ)
function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Escape special characters for ICS
function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Generate UID for event
function generateUID(callNumber: number, date: Date): string {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;
}

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

export const GET: APIRoute = async () => {
  const allCalls = await getCollection('calls');

  // Filter out addendum and recurring files, keep only dated calls
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

  const now = new Date();
  const nowFormatted = formatICSDate(now);

  // Generate VEVENT for each call
  const events = calls.map(call => {
    const callNumber = getCallNumber(call);
    const date = call.data.date!;
    const time = call.data.time;

    // Set start time
    const startDate = new Date(date);
    if (time) {
      const parsed = parseTime(time);
      if (parsed) {
        startDate.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
      }
    }

    // End time is typically 2 hours after start
    const endDate = new Date(startDate);
    endDate.setUTCHours(endDate.getUTCHours() + 2);

    const summary = `ETC Community Call #${callNumber}${call.data.description ? `: ${call.data.description}` : ''}`;
    const slug = getSlug(call);
    const url = `https://cc.ethereumclassic.org/calls/${slug}`;

    let description = `Ethereum Classic Community Call #${callNumber}`;
    if (call.data.description) {
      description += `\\n\\n${call.data.description}`;
    }
    description += `\\n\\nMore info: ${url}`;
    if (call.data.youtube) {
      description += `\\nRecording: ${call.data.youtube}`;
    }

    const location = call.data.location || 'Online';

    return [
      'BEGIN:VEVENT',
      `UID:${generateUID(callNumber, startDate)}`,
      `DTSTAMP:${nowFormatted}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      `LOCATION:${escapeICS(location)}`,
      `URL:${url}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  // Build calendar
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ETC Community Calls//cc.ethereumclassic.org//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ETC Community Calls',
    'X-WR-CALDESC:Ethereum Classic Community Calls - Regular open discussions about development, ECIPs, and the future of ETC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...events.map(e => e),
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(calendar, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="etccc.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
