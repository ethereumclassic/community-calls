import type { APIRoute } from "astro";
import { siteConfig } from "../../lib/config";
import { getCalls, sortCallsByDate } from "../../lib/calls";

/**
 * Returns the current build status for smart rebuild detection.
 * The scheduled function fetches this to determine if a rebuild is needed.
 */
export const GET: APIRoute = async () => {
  const allCalls = await getCalls();

  // Get regular calls only (same logic as index.astro)
  const regularCalls = sortCallsByDate(
    allCalls.filter((call) => !call.data.special),
  );

  // Find upcoming calls (already computed by getCalls)
  const upcomingCalls = regularCalls.filter((call) => call.data.isUpcoming);

  // Get the next upcoming call (soonest first)
  const nextCall =
    upcomingCalls.length > 0 ? sortCallsByDate(upcomingCalls, "asc")[0] : null;

  // Build the response
  let nextUpcomingEvent = null;

  if (nextCall && nextCall.data.eventDateTime) {
    nextUpcomingEvent = {
      number: nextCall.data.callNumber,
      datetime: new Date(nextCall.data.eventDateTime).toISOString(),
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
