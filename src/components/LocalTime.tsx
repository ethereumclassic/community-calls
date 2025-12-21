import { useState, useEffect } from "react";
import {
  parseUTCTime,
  calculateLocalTime,
  getTimezoneAbbr,
  getUserTimezoneOffset,
} from "../lib/timezone";

interface Props {
  time: string; // Format: "1500 UTC"
  variant?: "inline" | "badge" | "badge-mobile";
  showDayOffset?: boolean;
}

export default function LocalTime({
  time,
  variant = "inline",
  showDayOffset = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [localTime, setLocalTime] = useState<string | null>(null);
  const [tzAbbr, setTzAbbr] = useState<string>("");
  const [dayOffset, setDayOffset] = useState<number>(0);

  useEffect(() => {
    const utcTime = parseUTCTime(time);
    if (!utcTime) return;

    const offsetHours = getUserTimezoneOffset();
    const result = calculateLocalTime(utcTime, offsetHours);

    setLocalTime(result.time);
    setDayOffset(result.dayOffset);
    setTzAbbr(getTimezoneAbbr());
    setMounted(true);
  }, [time]);

  if (!localTime) return null;

  const dayOffsetDisplay =
    showDayOffset && dayOffset !== 0 ? (dayOffset > 0 ? "+1" : "-1") : null;

  if (variant === "badge") {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-400/30 flex-shrink-0 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-orange-400 font-medium">{tzAbbr}</span>
        <span className="text-orange-300 font-semibold">{localTime}</span>
        {dayOffsetDisplay && (
          <span className="text-[9px] text-etc-green/80">
            {dayOffsetDisplay}
          </span>
        )}
      </div>
    );
  }

  if (variant === "badge-mobile") {
    return (
      <div
        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-400/30 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-orange-400 font-mono text-sm font-medium">
          {tzAbbr}
        </span>
        <span className="text-orange-300 font-mono text-sm font-bold">
          {localTime}
        </span>
        {dayOffsetDisplay && (
          <span className="text-[10px] font-mono text-etc-green/80">
            {dayOffsetDisplay}
          </span>
        )}
      </div>
    );
  }

  // Default inline variant
  return (
    <span
      className={`text-orange-400/80 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      ({tzAbbr} {localTime})
    </span>
  );
}
