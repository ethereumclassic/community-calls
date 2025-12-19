import { useState, useEffect } from "react";

interface Props {
  eventDateTime: number;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(eventDateTime: number): TimeLeft {
  const total = eventDateTime - Date.now();
  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total };
  }

  return {
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((total % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((total % (1000 * 60)) / 1000),
    total,
  };
}

function formatTimeLeft(time: TimeLeft): string {
  if (time.total <= 0) {
    return "Started";
  }

  if (time.days > 0) {
    return `Starts in ${time.days}d ${time.hours}h`;
  }
  if (time.hours > 0) {
    return `Starts in ${time.hours}h ${time.minutes}m`;
  }
  if (time.minutes > 0) {
    return `Starts in ${time.minutes}m ${time.seconds}s`;
  }
  return `Starts in ${time.seconds}s`;
}

export default function UpcomingCountdown({ eventDateTime }: Props) {
  const [timeLeft, setTimeLeft] = useState(() =>
    calculateTimeLeft(eventDateTime),
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeLeft(calculateTimeLeft(eventDateTime));

    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft(eventDateTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [eventDateTime]);

  return (
    <span
      className={`inline-flex items-center gap-2 tabular-nums transition-all duration-500 ease-out ${
        mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
      }`}
    >
      <span className="text-orange-300/40">·</span>
      <span className="text-orange-300/70">{formatTimeLeft(timeLeft)}</span>
    </span>
  );
}
