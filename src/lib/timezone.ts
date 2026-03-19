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
  let totalMinutes =
    utcTime.hours * 60 + utcTime.minutes + Math.round(offsetHours * 60);
  let dayOffset = 0;

  if (totalMinutes >= 1440) {
    totalMinutes -= 1440;
    dayOffset = 1;
  }
  if (totalMinutes < 0) {
    totalMinutes += 1440;
    dayOffset = -1;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

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
