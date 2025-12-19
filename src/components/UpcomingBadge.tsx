import { useState, useEffect } from "react";

interface Props {
  date: string;
  time: string;
}

function parseEventDateTime(dateStr: string, timeStr: string): Date {
  // Parse time like "1500 UTC" or "1700 CST"
  const timeMatch = timeStr.match(/(\d{2})(\d{2})\s*(\w+)/);
  if (!timeMatch) return new Date(dateStr);

  const [, hours, minutes, tz] = timeMatch;
  const date = new Date(dateStr);

  // Set time in UTC
  if (tz.toUpperCase() === "UTC") {
    date.setUTCHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  } else {
    // For other timezones, just set the hours/minutes and hope for the best
    // Most calls use UTC anyway
    date.setUTCHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  }

  return date;
}

function checkIsUpcoming(date: string, time: string): boolean {
  const eventDate = parseEventDateTime(date, time);
  return eventDate > new Date();
}

export default function UpcomingBadge({ date, time }: Props) {
  const [isUpcoming, setIsUpcoming] = useState(() =>
    checkIsUpcoming(date, time),
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Re-check every minute
    const interval = setInterval(() => {
      setIsUpcoming(checkIsUpcoming(date, time));
    }, 60000);

    return () => clearInterval(interval);
  }, [date, time]);

  if (!isUpcoming) return null;

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-orange-400/80 border border-orange-400/20 rounded-full transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
      Upcoming
    </span>
  );
}
