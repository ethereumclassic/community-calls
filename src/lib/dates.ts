/**
 * Date formatting utilities for ETC Community Calls
 */

/**
 * Format: "Jan 15, 2024"
 */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format: "Monday, January 15, 2024"
 */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format: "2024-01-15" (ISO date)
 */
export function formatISODate(date: Date): string {
  return date.toISOString().split('T')[0];
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
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Parse "1500 UTC" format to hours/minutes
 */
export function parseUTCTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2})(\d{2})\s*UTC$/i);
  if (!match) return null;
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
}

/**
 * Combine a date and time string into a full Date object
 * Returns the date at midnight UTC if time is not provided or invalid
 */
export function combineDateAndTime(date: Date, timeStr?: string): Date {
  const combined = new Date(date);
  if (timeStr) {
    const parsed = parseUTCTime(timeStr);
    if (parsed) {
      combined.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
    }
  }
  return combined;
}
