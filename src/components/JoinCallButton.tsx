import { useState, useEffect } from "react";

interface Props {
  eventDateTime: number;
  joinLink: string;
  location: string;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

export default function JoinCallButton({
  eventDateTime,
  joinLink,
  location,
}: Props) {
  const [canJoin, setCanJoin] = useState(
    () => eventDateTime - Date.now() <= TEN_MINUTES_MS
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCanJoin(eventDateTime - Date.now() <= TEN_MINUTES_MS);

    const interval = setInterval(() => {
      setCanJoin(eventDateTime - Date.now() <= TEN_MINUTES_MS);
    }, 1000);

    return () => clearInterval(interval);
  }, [eventDateTime]);

  return (
    <div
      className={`transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      {canJoin ? (
        <a
          href={joinLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn w-full bg-etc-green hover:bg-etc-green/90 text-void border-0 font-mono text-sm uppercase tracking-wider"
        >
          Join {location} Call
        </a>
      ) : (
        <div className="space-y-2">
          <button
            disabled
            className="btn w-full btn-ghost border border-gray-600 text-gray-500 font-mono text-sm uppercase tracking-wider cursor-not-allowed"
          >
            Join {location} Call
          </button>
          <p className="text-center text-xs text-gray-500">
            You can join 10 minutes before the call starts
          </p>
        </div>
      )}
    </div>
  );
}
