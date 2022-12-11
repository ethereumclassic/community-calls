import "twin.macro";
import React, { useState } from "react";
import { DateTime as DT } from "luxon";

function getDateTime({ date, time }, setZone) {
  return DT.fromFormat(`${date} ${time}`, "yyyy-MM-dd HHmm z", {
    setZone,
  });
}

const TimeZone = ({ dt, timezone }) => {
  return (
    <div>
      {dt.setZone(timezone).toLocaleString({
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "longGeneric",
      })}
    </div>
  );
};

const ManyTimeZones = ({ dt, ...props }) => {
  return (
    <div {...props}>
      <TimeZone timezone={"America/Los_Angeles"} dt={dt} />
      <TimeZone timezone={"America/Chicago"} dt={dt} />
      <TimeZone timezone={"America/New_York"} dt={dt} />
      <TimeZone timezone={"Europe/London"} dt={dt} />
      <TimeZone timezone={"Europe/Berlin"} dt={dt} />
      <TimeZone timezone={"Europe/Moscow"} dt={dt} />
      <TimeZone timezone={"Asia/Dubai"} dt={dt} />
      <TimeZone timezone={"Asia/Kolkata"} dt={dt} />
      <TimeZone timezone={"Asia/Singapore"} dt={dt} />
      <TimeZone timezone={"Asia/Tokyo"} dt={dt} />
      <TimeZone timezone={"Australia/Sydney"} dt={dt} />
    </div>
  );
};

// TODO add dropdown for common timezones?

const DateTime = ({ date, time, many, local, timeOnly, ...props }) => {
  const dt = getDateTime({ date, time }, true);
  if (many) {
    return <ManyTimeZones dt={dt} {...props} />;
  }
  const dtLocal = getDateTime({ date, time }, false);
  const isSameTimezone = dt.zone == dtLocal.zone;
  const isSameDate = dt.day == dtLocal.day;
  if (local && !isSameTimezone) {
    return (
      <>
        {dtLocal.toLocaleString({
          ...(!isSameDate && {
            day: "numeric",
            month: "long",
          }),
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZoneName: "shortGeneric",
        })}
      </>
    );
  }
  return (
    <>
      {dt.toLocaleString({
        ...(!timeOnly && {
          year: "numeric",
          day: "numeric",
          month: "long",
        }),
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short",
      })}
    </>
  );
};

export default DateTime;
