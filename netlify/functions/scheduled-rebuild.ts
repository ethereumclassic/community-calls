import type { Config, Context } from "@netlify/functions";

interface BuildStatus {
  nextUpcomingEvent: {
    number: number;
    datetime: string;
    description: string;
  } | null;
  bufferMs: number;
  builtAt: string;
}

const SITE_URL = process.env.URL || "https://cc.ethereumclassic.org";
const BUILD_HOOK_URL = process.env.BUILD_HOOK_URL;

export default async function handler(req: Request, context: Context) {
  console.log(
    `[scheduled-rebuild] Starting check at ${new Date().toISOString()}`,
  );

  if (!BUILD_HOOK_URL) {
    console.error(
      "[scheduled-rebuild] BUILD_HOOK_URL environment variable not set",
    );
    return new Response("BUILD_HOOK_URL not configured", { status: 500 });
  }

  try {
    // Fetch the current build status from the deployed site
    const statusUrl = `${SITE_URL}/api/build-status.json`;
    console.log(`[scheduled-rebuild] Fetching ${statusUrl}`);

    const response = await fetch(statusUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch build status: ${response.status}`);
    }

    const status: BuildStatus = await response.json();
    console.log(
      `[scheduled-rebuild] Build status:`,
      JSON.stringify(status, null, 2),
    );

    // If there's no upcoming event, no rebuild needed
    if (!status.nextUpcomingEvent) {
      console.log("[scheduled-rebuild] No upcoming events - skipping rebuild");
      return new Response(
        JSON.stringify({ action: "skipped", reason: "no upcoming events" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if the event has ended (event time + buffer < now)
    const eventTime = new Date(status.nextUpcomingEvent.datetime).getTime();
    const eventEndTime = eventTime + status.bufferMs;
    const now = Date.now();

    console.log(
      `[scheduled-rebuild] Event #${status.nextUpcomingEvent.number}: ${status.nextUpcomingEvent.datetime}`,
    );
    console.log(
      `[scheduled-rebuild] Event end (with buffer): ${new Date(eventEndTime).toISOString()}`,
    );
    console.log(
      `[scheduled-rebuild] Current time: ${new Date(now).toISOString()}`,
    );

    if (now > eventEndTime) {
      // Event has ended - trigger rebuild
      console.log(
        `[scheduled-rebuild] Event #${status.nextUpcomingEvent.number} has ended - triggering rebuild`,
      );

      const buildResponse = await fetch(BUILD_HOOK_URL, { method: "POST" });
      if (!buildResponse.ok) {
        throw new Error(`Failed to trigger build: ${buildResponse.status}`);
      }

      console.log("[scheduled-rebuild] Build triggered successfully");
      return new Response(
        JSON.stringify({
          action: "rebuild_triggered",
          reason: `Event #${status.nextUpcomingEvent.number} has ended`,
          eventNumber: status.nextUpcomingEvent.number,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      // Event still upcoming - no rebuild needed
      const remainingMs = eventEndTime - now;
      const remainingMinutes = Math.round(remainingMs / 60000);

      console.log(
        `[scheduled-rebuild] Event still upcoming (${remainingMinutes} min remaining) - skipping rebuild`,
      );
      return new Response(
        JSON.stringify({
          action: "skipped",
          reason: "event still upcoming",
          eventNumber: status.nextUpcomingEvent.number,
          remainingMinutes,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("[scheduled-rebuild] Error:", error);
    return new Response(
      JSON.stringify({ action: "error", message: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Schedule: Run daily at 1800 UTC
export const config: Config = {
  schedule: "0 18 * * *",
};
