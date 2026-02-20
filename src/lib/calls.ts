import { getCollection, type CollectionEntry } from "astro:content";
import { siteConfig } from "./config";
import { combineDateAndTime, parseUTCTime } from "./dates";

type RawCall = CollectionEntry<"calls">;

/**
 * Call with computed fields
 */
export interface Call extends Omit<RawCall, "data"> {
  data: RawCall["data"] & {
    callNumber: number;
    slug: string;
    youtubeId: string | null;
    eventDateTime: number;
    isUpcoming: boolean;
    uid: string;
  };
}

/**
 * Extract call number from filename
 */
function getCallNumberFromId(id: string): number {
  const match = id.match(/_(\d+)(?:_\w+)?\.md$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Add computed fields to a raw call entry
 */
function enrichCall(raw: RawCall): Call {
  const { id, data } = raw;

  // Compute call number
  const callNumber = data.number ?? getCallNumberFromId(id);

  // Compute slug: number for regular calls, filename for special
  const slug = data.special ? id.replace(".md", "") : String(callNumber);

  // Compute event datetime
  const eventDateTime = combineDateAndTime(data.date, data.time).getTime();

  // Compute isUpcoming (calls with a YouTube link are never upcoming)
  const now = Date.now();
  const isUpcoming =
    !data.youtube && eventDateTime > now - siteConfig.upcomingBufferMs;

  // Compute UID for ICS
  const dateStr = data.date.toISOString().split("T")[0].replace(/-/g, "");
  const uid = `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;

  // Resolve greenRoom defaults
  let greenRoom = data.greenRoom;
  if (greenRoom) {
    const sameLocation = greenRoom.sameLocation;
    const resolvedLocation =
      greenRoom.location ?? (sameLocation ? data.location : undefined);
    const resolvedJoinLink =
      greenRoom.joinLink ?? (sameLocation ? data.joinLink : undefined);

    // Default time to 1 hour before the call
    let resolvedTime = greenRoom.time;
    if (!resolvedTime) {
      const parsed = parseUTCTime(data.time);
      if (parsed) {
        const totalMinutes = parsed.hours * 60 + parsed.minutes - 60;
        const h = Math.floor((((totalMinutes % 1440) + 1440) % 1440) / 60);
        const m = (((totalMinutes % 1440) + 1440) % 1440) % 60;
        resolvedTime = `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")} UTC`;
      }
    }

    greenRoom = {
      ...greenRoom,
      time: resolvedTime,
      location: resolvedLocation,
      joinLink: resolvedJoinLink,
    };
  }

  return {
    ...raw,
    data: {
      ...data,
      greenRoom,
      callNumber,
      slug,
      youtubeId: data.youtube ?? null,
      eventDateTime,
      isUpcoming,
      uid,
    },
  };
}

/**
 * Get all calls with computed fields
 */
export async function getCalls(): Promise<Call[]> {
  const rawCalls = await getCollection("calls");
  return rawCalls.map(enrichCall);
}

/**
 * Sort calls by date (newest first by default)
 */
export function sortCallsByDate(
  calls: Call[],
  order: "asc" | "desc" = "desc",
): Call[] {
  return [...calls].sort((a, b) => {
    const dateA = new Date(a.data.date).getTime();
    const dateB = new Date(b.data.date).getTime();
    return order === "desc" ? dateB - dateA : dateA - dateB;
  });
}

/**
 * Sort calls by call number
 */
export function sortCallsByNumber(
  calls: Call[],
  order: "asc" | "desc" = "asc",
): Call[] {
  return [...calls].sort((a, b) => {
    const numA = a.data.callNumber;
    const numB = b.data.callNumber;
    return order === "asc" ? numA - numB : numB - numA;
  });
}
