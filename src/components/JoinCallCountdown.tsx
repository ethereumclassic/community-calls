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

function TimeUnit({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={`font-mono text-4xl tabular-nums ${color}`}>
        {value.toString().padStart(2, "0")}
      </span>
      <span className="text-xs uppercase tracking-wider text-gray-500 mt-1">
        {label}
      </span>
    </div>
  );
}

export default function JoinCallCountdown({ eventDateTime }: Props) {
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

  const hasStarted = timeLeft.total <= 0;
  const countdownColor = hasStarted ? "text-amber-400" : "text-etc-green";
  const borderColor = hasStarted
    ? "border-amber-400/20"
    : "border-etc-green/20";

  return (
    <div
      className={`py-6 px-4 rounded-lg bg-void border ${borderColor} transition-opacity duration-300 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      {!hasStarted && (
        <p className="text-center text-xs uppercase tracking-wider text-gray-500 mb-3">
          Starts in
        </p>
      )}
      {hasStarted && (
        <p className="text-center text-xs uppercase tracking-wider text-amber-400 mb-3">
          Live now
        </p>
      )}
      <div className="flex justify-center gap-6">
        {timeLeft.days > 0 && (
          <TimeUnit label="Days" value={timeLeft.days} color={countdownColor} />
        )}
        <TimeUnit label="Hours" value={timeLeft.hours} color={countdownColor} />
        <TimeUnit
          label="Mins"
          value={timeLeft.minutes}
          color={countdownColor}
        />
        <TimeUnit
          label="Secs"
          value={timeLeft.seconds}
          color={countdownColor}
        />
      </div>
    </div>
  );
}
