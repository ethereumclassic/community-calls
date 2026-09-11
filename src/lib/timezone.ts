/**
 * Client-side timezone utilities for hydration
 */

import { parseUTCTime, combineDateAndTime } from "./dates";

// Re-export for convenience
export { parseUTCTime };

/**
 * The call's start in the browser's own timezone, evaluated at the call's
 * date so daylight saving is applied for that day rather than today.
 */
export function localTimeAt(
  date: Date | string,
  timeStr: string,
): { time: string; dayOffset: number; abbr: string } | null {
  if (!parseUTCTime(timeStr)) return null;
  const instant = combineDateAndTime(new Date(date), timeStr);

  const time = `${instant.getHours().toString().padStart(2, "0")}:${instant.getMinutes().toString().padStart(2, "0")}`;

  const localDay = Date.UTC(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate(),
  );
  const utcDay = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  );
  const dayOffset = Math.round((localDay - utcDay) / 86_400_000);

  return { time, dayOffset, abbr: getTimezoneAbbr(instant) };
}

/**
 * Get the user's timezone abbreviation at a given instant (e.g., "EDT",
 * "PST", "GMT+4")
 */
function getTimezoneAbbr(instant: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(instant);
    const tzPart = parts.find((part) => part.type === "timeZoneName");
    return tzPart?.value || "Local";
  } catch {
    return "Local";
  }
}
