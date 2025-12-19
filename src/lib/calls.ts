import { getCollection, getEntry, type CollectionEntry } from "astro:content";
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
    eventDateTime: number | null;
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
  const eventDateTime = data.date
    ? combineDateAndTime(data.date, data.time).getTime()
    : null;

  // Compute isUpcoming
  const now = Date.now();
  const isUpcoming =
    eventDateTime !== null
      ? eventDateTime > now - siteConfig.upcomingBufferMs
      : false;

  // Compute UID for ICS
  const dateStr = data.date
    ? data.date.toISOString().split("T")[0].replace(/-/g, "")
    : "";
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
 * Get a single call by slug with computed fields
 */
export async function getCall(slug: string): Promise<Call | undefined> {
  const rawCall = await getEntry("calls", slug);
  return rawCall ? enrichCall(rawCall) : undefined;
}

/**
 * Sort calls by date (newest first by default)
 */
export function sortCallsByDate(
  calls: Call[],
  order: "asc" | "desc" = "desc",
): Call[] {
  return [...calls].sort((a, b) => {
    const dateA = a.data.date ? new Date(a.data.date).getTime() : 0;
    const dateB = b.data.date ? new Date(b.data.date).getTime() : 0;
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
