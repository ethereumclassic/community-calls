import { useState, useEffect, useMemo } from "react";
import {
  parseUTCTime,
  calculateLocalTime,
  getTimezoneAbbr,
  getUserTimezoneOffset,
} from "../lib/timezone";

interface Props {
  time: string; // Format: "1500 UTC"
}

interface TimezoneEntry {
  city: string;
  offset: number;
  abbr: string;
  isCenter?: boolean;
  isUserTime?: boolean;
}

const baseTimezones: TimezoneEntry[] = [
  { city: "Los Angeles", offset: -8, abbr: "PST" },
  { city: "New York", offset: -5, abbr: "EST" },
  { city: "UTC", offset: 0, abbr: "UTC", isCenter: true },
  { city: "London", offset: 0, abbr: "GMT" },
  { city: "Berlin", offset: 1, abbr: "CET" },
  { city: "Dubai", offset: 4, abbr: "GST" },
  { city: "Bangkok", offset: 7, abbr: "ICT" },
  { city: "Shanghai", offset: 8, abbr: "CST" },
  { city: "Tokyo", offset: 9, abbr: "JST" },
  { city: "Sydney", offset: 11, abbr: "AEDT" },
];

export default function TimezoneBar({ time }: Props) {
  const [mounted, setMounted] = useState(false);
  const [userOffset, setUserOffset] = useState<number | null>(null);
  const [userTzAbbr, setUserTzAbbr] = useState<string>("Local");

  const utcTime = useMemo(() => parseUTCTime(time), [time]);

  useEffect(() => {
    setMounted(true);
    setUserOffset(getUserTimezoneOffset());
    setUserTzAbbr(getTimezoneAbbr());
  }, []);

  const timezones = useMemo(() => {
    if (userOffset === null || !utcTime) return baseTimezones;

    const userEntry: TimezoneEntry = {
      city: userTzAbbr,
      offset: userOffset,
      abbr: userTzAbbr,
      isUserTime: true,
    };

    // Insert user entry in correct position by offset (always show all timezones)
    const result: TimezoneEntry[] = [];
    let inserted = false;

    for (const tz of baseTimezones) {
      if (!inserted && !tz.isCenter && userOffset < tz.offset) {
        result.push(userEntry);
        inserted = true;
      }
      result.push(tz);
      // Insert after UTC if user offset is 0 but not UTC itself
      if (tz.isCenter && !inserted && userOffset >= 0) {
        // Check if we should insert here (user offset <= next non-center item's offset)
        const nextNonCenter = baseTimezones.find(
          (t) =>
            !t.isCenter &&
            t.offset >= 0 &&
            baseTimezones.indexOf(t) > baseTimezones.indexOf(tz),
        );
        if (!nextNonCenter || userOffset <= nextNonCenter.offset) {
          result.push(userEntry);
          inserted = true;
        }
      }
    }

    if (!inserted) {
      result.push(userEntry);
    }

    return result;
  }, [userOffset, utcTime, userTzAbbr]);

  if (!utcTime) return null;

  const utcZone = timezones.find((tz) => tz.isCenter);
  const userZone = timezones.find((tz) => tz.isUserTime);
  const otherZones = timezones
    .filter((tz) => !tz.isCenter && !tz.isUserTime)
    .sort((a, b) => a.offset - b.offset);

  const renderTimezoneItem = (tz: TimezoneEntry) => {
    const { time: displayTime, dayOffset } = calculateLocalTime(
      utcTime,
      tz.offset,
    );

    if (tz.isUserTime) {
      return (
        <div
          key="user-time"
          className={`flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-400/30 flex-shrink-0 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-orange-400 font-medium">{tz.city}</span>
          <span className="text-orange-300 font-semibold">{displayTime}</span>
          {dayOffset !== 0 && (
            <span className="text-[9px] text-etc-green/80">
              {dayOffset > 0 ? "+1" : "-1"}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        key={tz.city}
        className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface/50 border border-etc-green/5 hover:border-etc-green/20 transition-colors flex-shrink-0"
      >
        <span className="text-gray-500">{tz.city}</span>
        <span className="text-gray-300">{displayTime}</span>
        {dayOffset !== 0 && (
          <span className="text-[9px] text-etc-green/80">
            {dayOffset > 0 ? "+1" : "-1"}
          </span>
        )}
      </div>
    );
  };

  const renderMobileItem = (tz: TimezoneEntry) => {
    const { time: displayTime, dayOffset } = calculateLocalTime(
      utcTime,
      tz.offset,
    );

    if (tz.isUserTime) {
      return (
        <div
          key="user-time-mobile"
          className={`flex items-center justify-between px-3 py-2 rounded bg-orange-500/10 border border-orange-400/20 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm font-mono text-orange-400 font-medium">
              {tz.city}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono text-orange-300 font-semibold">
              {displayTime}
            </span>
            {dayOffset !== 0 && (
              <span className="text-[10px] font-mono text-etc-green/80">
                {dayOffset > 0 ? "+1" : "-1"}
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        key={tz.city}
        className="flex items-center justify-between px-3 py-2 rounded bg-surface-elevated/50 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500 w-10">
            {tz.abbr}
          </span>
          <span className="text-sm font-mono text-gray-400">{tz.city}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-mono text-gray-200 font-semibold">
            {displayTime}
          </span>
          {dayOffset !== 0 && (
            <span className="text-[10px] font-mono text-etc-green/80">
              {dayOffset > 0 ? "+1" : "-1"}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Sort mobile items by offset for logical ordering (exclude user's local time since it's shown separately)
  const mobileItems = timezones
    .filter((tz) => !tz.isCenter && !tz.isUserTime)
    .sort((a, b) => a.offset - b.offset);

  return (
    <div className="timezone-bar mt-4 md:-ml-12 lg:-ml-20">
      {/* Desktop: Horizontal scrollable bar */}
      <div className="hidden md:block overflow-x-auto scrollbar-hide edge-fade-mask pb-2 pl-12 lg:pl-20 pr-14">
        <div className="flex items-center justify-center gap-1 text-xs font-mono min-w-max">
          {/* UTC first */}
          {utcZone && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-etc-green/10 border border-etc-green/30 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-etc-green animate-pulse-glow" />
              <span className="text-etc-green font-semibold">
                {utcZone.abbr}
              </span>
              <span className="text-etc-green font-bold">
                {calculateLocalTime(utcTime, utcZone.offset).time}
              </span>
            </div>
          )}

          {/* User's local time second */}
          {userZone && renderTimezoneItem(userZone)}

          {/* Other timezones */}
          {otherZones.map(renderTimezoneItem)}
        </div>
      </div>

      {/* Mobile: UTC dropdown + Local time */}
      <div className="md:hidden">
        <details className="timezone-dropdown">
          <summary className="grid grid-cols-2 gap-2 list-none cursor-pointer select-none">
            {/* UTC button */}
            <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-etc-green/10 border border-etc-green/30">
              <span className="w-1.5 h-1.5 rounded-full bg-etc-green animate-pulse-glow" />
              <span className="text-etc-green font-mono text-sm font-semibold">
                UTC
              </span>
              <span className="text-etc-green font-mono text-sm font-bold">
                {calculateLocalTime(utcTime, 0).time}
              </span>
              <svg
                className="w-4 h-4 text-etc-green/60 transition-transform duration-200 dropdown-arrow"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>

            {/* Local time (static) */}
            {userZone && (
              <div
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-400/30 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-orange-400 font-mono text-sm font-medium">
                  {userZone.city}
                </span>
                <span className="text-orange-300 font-mono text-sm font-bold">
                  {calculateLocalTime(utcTime, userZone.offset).time}
                </span>
                {calculateLocalTime(utcTime, userZone.offset).dayOffset !==
                  0 && (
                  <span className="text-[10px] font-mono text-etc-green/80">
                    {calculateLocalTime(utcTime, userZone.offset).dayOffset > 0
                      ? "+1"
                      : "-1"}
                  </span>
                )}
              </div>
            )}
          </summary>

          {/* Dropdown content - other timezones */}
          <div className="mt-2 p-2 rounded-lg bg-surface border border-etc-green/10 space-y-1">
            {mobileItems.map(renderMobileItem)}
          </div>
        </details>
      </div>
    </div>
  );
}
