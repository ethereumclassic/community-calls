import { getCollection, type CollectionEntry } from "astro:content";
import { siteConfig } from "./config";
import { combineDateAndTime } from "./dates";

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

  // Compute isUpcoming
  const now = Date.now();
  const isUpcoming = eventDateTime > now - siteConfig.upcomingBufferMs;

  // Compute UID for ICS
  const dateStr = data.date.toISOString().split("T")[0].replace(/-/g, "");
  const uid = `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;

  return {
    ...raw,
    data: {
      ...data,
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
