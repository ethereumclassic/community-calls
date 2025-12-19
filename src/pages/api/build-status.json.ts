import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { siteConfig } from "../../lib/config";
import { sortCallsByDate } from "../../lib/calls";
import { combineDateAndTime } from "../../lib/dates";

/**
 * Returns the current build status for smart rebuild detection.
 * The scheduled function fetches this to determine if a rebuild is needed.
 */
export const GET: APIRoute = async () => {
  const allCalls = await getCollection("calls");
  const now = Date.now();

  // Get regular calls only (same logic as index.astro)
  const regularCalls = sortCallsByDate(
    allCalls.filter((call) => !call.data.special),
  );

  // Helper to get full event datetime (date + time) - same as index.astro
  const getEventDateTime = (call: (typeof regularCalls)[0]) =>
    call.data.date
      ? combineDateAndTime(call.data.date, call.data.time).getTime()
      : 0;

  // Find upcoming calls using the shared buffer
  const upcomingCalls = regularCalls.filter(
    (call) =>
      call.data.date &&
      getEventDateTime(call) > now - siteConfig.upcomingBufferMs,
  );

  // Get the next upcoming call (soonest first)
  const nextCall =
    upcomingCalls.length > 0 ? sortCallsByDate(upcomingCalls, "asc")[0] : null;

  // Build the response
  let nextUpcomingEvent = null;

  if (nextCall && nextCall.data.date) {
    const eventDateTime = combineDateAndTime(
      nextCall.data.date,
      nextCall.data.time,
    );

    nextUpcomingEvent = {
      number: nextCall.data.callNumber,
      datetime: eventDateTime.toISOString(),
      description: nextCall.data.description,
    };
  }

  const response = {
    nextUpcomingEvent,
    bufferMs: siteConfig.upcomingBufferMs,
    builtAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
