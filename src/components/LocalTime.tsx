import { useState, useEffect } from "react";
import {
  parseUTCTime,
  calculateLocalTime,
  getTimezoneAbbr,
  getUserTimezoneOffset,
} from "../lib/timezone";

interface Props {
  time: string; // Format: "1500 UTC"
}

export default function LocalTime({ time }: Props) {
  const [mounted, setMounted] = useState(false);
  const [localTime, setLocalTime] = useState<string | null>(null);
  const [tzAbbr, setTzAbbr] = useState<string>("");

  useEffect(() => {
    const utcTime = parseUTCTime(time);
    if (!utcTime) return;

    const offsetHours = getUserTimezoneOffset();
    const { time: formatted } = calculateLocalTime(utcTime, offsetHours);

    setLocalTime(formatted);
    setTzAbbr(getTimezoneAbbr());
    setMounted(true);
  }, [time]);

  if (!localTime) return null;

  return (
    <span
      className={`text-orange-400/80 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      ({tzAbbr} {localTime})
    </span>
  );
}
