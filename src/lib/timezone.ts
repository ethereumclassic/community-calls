/**
 * Client-side timezone utilities for hydration
 */

import { parseUTCTime } from "./dates";

// Re-export for convenience
export { parseUTCTime };

/**
 * Calculate local time from UTC time and offset
 */
export function calculateLocalTime(
  utcTime: { hours: number; minutes: number },
  offsetHours: number,
): { time: string; dayOffset: number } {
  let hours = utcTime.hours + offsetHours;
  const minutes = utcTime.minutes;
  let dayOffset = 0;

  if (hours >= 24) {
    hours -= 24;
    dayOffset = 1;
  }
  if (hours < 0) {
    hours += 24;
    dayOffset = -1;
  }

  return {
    time: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
    dayOffset,
  };
}

/**
 * Get the user's timezone abbreviation (e.g., "EST", "PST", "GMT+4")
 */
export function getTimezoneAbbr(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((part) => part.type === "timeZoneName");
    return tzPart?.value || "Local";
  } catch {
    return "Local";
  }
}

/**
 * Get the user's timezone offset in hours (positive = ahead of UTC)
 */
export function getUserTimezoneOffset(): number {
  const offsetMinutes = new Date().getTimezoneOffset();
  return -offsetMinutes / 60;
}
