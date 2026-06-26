export type Participant = {
  name: string;
  role?: string;
  avatar?: string | null;
  github?: string;
};

export type CallMeta = {
  number?: number | string;
  title?: string;
  date?: string;
};

export type Job = {
  call?: CallMeta;
  participants?: Participant[];
  title?: string;
  speaker?: string;
  role?: string;
  avatar?: string | null;
  audio: string;
  vtt: string;
  /** URL to a sidecar meta.json with chapters / summary / jingles. */
  meta?: string;
  fps?: number;
  bands?: number;
};

const query = new URLSearchParams(location.search);
export const isPreview = query.get("preview") === "1";
export const renderedUrl = query.get("out");
export const noSlides = query.get("noSlides") === "1";
// Dev alignment aid: ?guides=1 draws a center crosshair over the stage.
export const showGuides = query.get("guides") === "1";

export function hasJob(): boolean {
  const w = window as unknown as { __job?: unknown };
  return Boolean(
    w.__job || query.get("job") || query.get("audio") || query.get("speaker"),
  );
}

function readJobFromQuery(): Job {
  return {
    title: query.get("title") ?? undefined,
    speaker: query.get("speaker") ?? undefined,
    role: query.get("role") ?? undefined,
    avatar: query.get("avatar"),
    audio: query.get("audio") ?? "",
    vtt: query.get("vtt") ?? "",
    fps: query.get("fps") ? parseInt(query.get("fps")!, 10) : undefined,
    bands: query.get("bands") ? parseInt(query.get("bands")!, 10) : undefined,
  };
}

export async function loadJob(): Promise<Job> {
  const w = window as unknown as { __job?: Job };
  if (w.__job) return w.__job;
  const jobUrl = query.get("job");
  if (jobUrl) {
    return (await fetch(jobUrl).then((r) => r.json())) as Job;
  }
  return readJobFromQuery();
}
