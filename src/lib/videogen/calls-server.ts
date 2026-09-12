// Server-side: assembles a videogen job / sidecar-meta / transcript for a call
// straight from its markdown entry, so none of it has to be duplicated into
// public/videogen/<NN>/. Used by the dev-only /videogen/[call]/* endpoints.
//
// NOTE: only `import type` from ./job — job.ts touches `location` at module
// load, which doesn't exist server-side. Type imports are erased, so they're
// safe here.

import { getCollection, type CollectionEntry } from "astro:content";
import type { GetStaticPaths } from "astro";
import { parseVtt } from "./vtt";
import { extractWebvtt, parseChapters } from "./chapters";
import { VIDEOGEN_CONFIG } from "./config";
import { resolveSpeaker } from "./speakers";
import type { Job, Participant } from "./job";
import type { SidecarMeta, Chapter, Display } from "./sidecar";

type Entry = CollectionEntry<"calls">;

// Dev-only path list shared by all three endpoints (one per numbered call).
export const callPaths: GetStaticPaths = async () => {
  if (!import.meta.env.DEV) return [];
  const calls = await getCollection("calls");
  return calls
    .filter((c) => c.data.number != null)
    .map((c) => ({ params: { call: String(c.data.number) } }));
};

export async function getCall(callId: string): Promise<Entry | undefined> {
  const calls = await getCollection("calls");
  return calls.find(
    (c) => c.data.number != null && String(c.data.number) === callId,
  );
}

export function getTranscript(entry: Entry): string | null {
  return extractWebvtt(entry.body ?? "");
}

// Participants are the distinct cue speakers, in first-appearance order,
// resolved against the speaker registry (so aliases collapse to one canonical
// person with their avatar). Unknown speakers keep their transcript name and
// fall back to initials.
function deriveParticipants(vtt: string): Participant[] {
  const seen = new Map<string, Participant>();
  for (const c of parseVtt(vtt)) {
    if (!c.speaker) continue;
    const r = resolveSpeaker(c.speaker);
    const id = r ? r.key : c.speaker.toLowerCase();
    if (!seen.has(id)) {
      seen.set(id, {
        name: r?.displayName ?? c.speaker,
        avatar: r?.avatar ?? null,
      });
    }
  }
  return [...seen.values()];
}

function rosterParticipant(name: string): Participant {
  const r = resolveSpeaker(name);
  return { name: r?.displayName ?? name, avatar: r?.avatar ?? null };
}

export function buildJob(entry: Entry, vtt: string): Job {
  const id = String(entry.data.number);
  return {
    call: {
      number: entry.data.number,
      title: entry.data.description,
      date: entry.data.date.toISOString().slice(0, 10),
    },
    // The curated frontmatter roster is the source of truth; fall back to
    // deriving participants from the transcript speakers when it's absent.
    participants: entry.data.roster?.length
      ? entry.data.roster.map(rosterParticipant)
      : deriveParticipants(vtt),
    // Committed, distributable audio is the compressed mono <NN>-audio.mp3.
    audio: `/videogen/${id}/${id}-audio.mp3`,
    vtt: `/videogen/${id}/transcript.vtt`,
    meta: `/videogen/${id}/meta.json`,
    fps: VIDEOGEN_CONFIG.fps,
    bands: VIDEOGEN_CONFIG.bands,
  };
}

// "[h:]mm:ss[.ms]" on the transcript clock -> seconds. Same shape as the
// NOTE chapters lines, plus optional fractional seconds so a display window
// can start on an exact cue boundary.
function parseClock(s: string): number {
  const m = String(s)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`displays: bad time "${s}" (want [h:]mm:ss[.ms])`);
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + ms / 1000;
}

// Display assets live next to the call markdown in calls/media/ (so they are
// committed with the call and usable by the call page too). In dev they are
// served at /calls-media/<file> by the callsMediaDev plugin (astro.config.mjs).
function displaySrc(src: string): string {
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("/")) return src;
  const file = src.replace(/^\.?\/?media\//, "");
  return `/calls-media/${file}`;
}

function displayKind(src: string): Display["kind"] {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) ? "video" : "image";
}

function buildDisplays(entry: Entry): Display[] | undefined {
  const list = entry.data.displays;
  if (!list || list.length === 0) return undefined;
  return list
    .map((d) => {
      const start = parseClock(d.from);
      const end = parseClock(d.to);
      if (end <= start)
        throw new Error(
          `displays: "${d.from}" -> "${d.to}" ends before it starts`,
        );
      const src = displaySrc(d.src);
      const out: Display = { start, end, src, kind: displayKind(src) };
      if (d.zoomFrom != null) out.zoomFrom = d.zoomFrom;
      if (d.zoomTo != null) out.zoomTo = d.zoomTo;
      if (d.focus) out.focus = d.focus;
      if (d.rate != null) out.rate = d.rate;
      if (d.loop != null) out.loop = d.loop;
      return out;
    })
    .sort((a, b) => a.start - b.start);
}

export function buildMeta(entry: Entry, vtt: string): SidecarMeta {
  // Sort so an out-of-order NOTE line can't yield end < start; clamp the end so
  // a chapter whose start lands past the last cue still has end >= start.
  const raw = parseChapters(vtt).sort((a, b) => a.start - b.start);
  const cues = parseVtt(vtt);
  const lastEnd = cues.length ? cues[cues.length - 1].end : 0;
  const chapters: Chapter[] = raw.map((ch, i) => ({
    title: ch.title,
    start: ch.start,
    end: Math.max(ch.start, i + 1 < raw.length ? raw[i + 1].start : lastEnd),
  }));
  // summary comes from the frontmatter `summary` blurb (written by /videogen);
  // when absent, the summary slide is simply skipped.
  return {
    summary: entry.data.summary,
    hosts: entry.data.hosts,
    episodeUrl: `${VIDEOGEN_CONFIG.episodeBaseUrl}/${entry.data.number}`,
    intro: VIDEOGEN_CONFIG.intro,
    outro: VIDEOGEN_CONFIG.outro,
    chapters,
    displays: buildDisplays(entry),
  };
}
