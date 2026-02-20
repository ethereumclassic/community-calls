/**
 * Date formatting utilities for ETC Community Calls
 */

/**
 * Format: "Jan 15, 2024"
 */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format: "Monday, January 15, 2024"
 */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format: "2024-01-15" (ISO date)
 */
export function formatISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Format: RFC 822 for RSS feeds
 */
export function formatRfc822(date: Date): string {
  return date.toUTCString();
}

/**
 * Format: "20240115T150000Z" for ICS files
 */
export function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Parse "1500 UTC" format to hours/minutes
 */
export function parseUTCTime(
  timeStr: string,
): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2})(\d{2})\s*UTC$/i);
  if (!match) return null;
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
}

/**
 * Combine a date and time string into a full Date object
 */
export function combineDateAndTime(date: Date, timeStr: string): Date {
  const combined = new Date(date);
  const parsed = parseUTCTime(timeStr);
  if (parsed) {
    combined.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
  }
  return combined;
}

/**
 * Format time string with proper colons
 * Converts "1500 UTC" to "15:00 UTC"
 */
export function formatTime(timeStr: string): string {
  const parsed = parseUTCTime(timeStr);
  if (!parsed) return timeStr;
  const hours = parsed.hours.toString().padStart(2, "0");
  const minutes = parsed.minutes.toString().padStart(2, "0");
  return `${hours}:${minutes} UTC`;
}

/**
 * Get timezone date note if the calendar date differs in US or Asia
 * Returns a parenthetical note like "(Jan 14 in Americas)" or "(Jan 16 in Asia)"
 */
export function getTimezoneDateNote(date: Date, timeStr: string): string {
  const parsed = parseUTCTime(timeStr);
  if (!parsed) return "";

  const utcHour = parsed.hours;

  // Early UTC times (before 08:00): Americas would be on previous day
  if (utcHour < 8) {
    const prevDay = new Date(date);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const formatted = prevDay.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return ` (${formatted} in Americas)`;
  }

  // Late UTC times (15:00 or later): Asia would be on next day
  if (utcHour >= 15) {
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const formatted = nextDay.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return ` (${formatted} in Asia)`;
  }

  return "";
}
