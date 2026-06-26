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
import type { SidecarMeta, Chapter } from "./sidecar";

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
  };
}
