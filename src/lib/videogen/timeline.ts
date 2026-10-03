// The full video as a single ordered timeline: preroll slides, then the main
// call playback, then postroll slides. Each segment has an absolute global
// start/end (in seconds) so the preview transport can scrub across the whole
// thing and the realtime driver can size its concatenated audio track from
// the same numbers. This is the single source of truth for slide timing —
// nothing else should hard-code pre/post-roll durations.

import type { SidecarMeta } from "./sidecar";
import type { SlideKey } from "./slides";

// How long the jingle bleeds across a slide/chat boundary and fades under the
// speaker. The intro plays full over the pre-roll slides, then keeps playing
// into the start of the call and fades out over this window while the first
// speaker talks; the outro mirrors it, fading in under the closing speaker over
// the last of the call before playing full over the post-roll slides. This one
// constant is the single source of truth for the crossfade — the browser
// preview (preview.ts) and the ffmpeg render (scripts/videogen.mjs, via
// __timings) both read it so they can never drift apart.
const JINGLE_OVERLAP_SEC = 10;

// The jingle is ducked before the speaker starts: over the last
// JINGLE_DUCK_LEAD_SEC of the preroll it drops from full to JINGLE_DUCK_LEVEL,
// so by the first word it is already quiet, and then tails from that level to
// silence over JINGLE_OVERLAP_SEC. The outro mirrors it: rises to the duck
// level under the closing words, then to full over the first
// JINGLE_DUCK_LEAD_SEC of the postroll.
const JINGLE_DUCK_LEAD_SEC = 4;
const JINGLE_DUCK_LEVEL = 0.25;

// The ending: over the final slide (the logo) the audio fades to silence and
// the picture fades to black, so the video winds down instead of cutting. This
// is the duration of that fade — kept equal to the logo slide's on-screen time
// so the fade spans exactly the last slide. Read by the preview (audio + black
// overlay) and the render (ffmpeg afade), so they stay in lockstep.
const END_FADE_SEC = 2.5;

// Per-slide on-screen duration. Changing these here automatically reflows the
// preview scrubber AND the driver's audio padding (both read this timeline),
// so the two can no longer drift apart.
const SLIDE_MS: Record<SlideKey, number> = {
  hero: 4500,
  title: 9000,
  toc: 4000,
  stats: 5500,
  thanks: 3500,
  logo: 2500,
};

type SlideSegment = {
  kind: "slide";
  key: SlideKey;
  start: number;
  end: number;
};

type MainSegment = { kind: "main"; start: number; end: number };
export type Segment = SlideSegment | MainSegment;

// A jingle placed on the global timeline. Audio is region-aware: the element's
// currentTime tracks `globalT - startGlobal`, and its volume follows a
// piecewise-linear envelope (global time -> 0..1) so the duck and crossfade
// under the speaker are computed the same way wherever we play it.
type JingleWindow = {
  url: string;
  startGlobal: number;
  endGlobal: number;
  envelope: { t: number; v: number }[]; // sorted by t
};

export type Timeline = {
  segments: Segment[];
  totalDuration: number;
  mainStart: number;
  mainEnd: number;
  prerollMs: number;
  postrollMs: number;
  // Effective crossfade window (clamped to the call length for short renders).
  overlapSec: number;
  // Duck: seconds before the call over which the intro drops to duckLevel
  // (mirrored after the call for the outro).
  duckLeadSec: number;
  duckLevel: number;
  intro: JingleWindow | null;
  outro: JingleWindow | null;
  // Final audio-fade / fade-to-black window: [totalDuration - endFadeSec,
  // totalDuration]. 0 when there's no postroll to fade over.
  endFadeSec: number;
  // Main-segment length (== mainEnd - mainStart) and the audio head-trim
  // offset. Main local time t plays audio at `mainAudioOffsetSec + t`.
  mainDurationSec: number;
  mainAudioOffsetSec: number;
};

// Volume of a jingle window at a global time, or null when it isn't playing.
// Linear between envelope points, matching the ffmpeg `volume` expression the
// render driver builds from the same numbers so preview and render agree.
export function jingleVolumeAt(w: JingleWindow, t: number): number | null {
  if (t < w.startGlobal || t >= w.endGlobal) return null;
  const pts = w.envelope;
  if (pts.length === 0) return 1;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.t) {
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      const v = a.v + (b.v - a.v) * f;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  return pts[pts.length - 1].v;
}

type TimelineSpec = {
  meta: SidecarMeta | null;
  // Duration of the main segment AFTER head/tail-silence trimming (i.e.
  // last-cue-end minus first-cue-start, not the raw audio length).
  mainDurationSec: number;
  // Audio time the main segment starts at — the head-trim offset. The main
  // segment's local time t maps to audio time `mainAudioOffsetSec + t`.
  mainAudioOffsetSec?: number;
  // false in noSlides mode (or when there's no sidecar meta to build from).
  includeSlides: boolean;
};

// Which slides to show is content-driven: title always, TOC only when there
// are chapters, summary only when there's a summary. Postroll is the full
// stats -> thanks -> logo run. Keeping this derivation in one place means the
// exposed prerollMs/postrollMs always match what actually renders.
function prerollKeys(meta: SidecarMeta): SlideKey[] {
  // Brand hero, then the episode card (title + summary merged), then chapters.
  const keys: SlideKey[] = ["hero", "title"];
  if (meta.chapters && meta.chapters.length > 0) keys.push("toc");
  return keys;
}

const POSTROLL_KEYS: SlideKey[] = ["stats", "thanks", "logo"];

export function buildTimeline(spec: TimelineSpec): Timeline {
  const segments: Segment[] = [];
  const useSlides = spec.includeSlides && spec.meta != null;
  const meta = spec.meta;

  let t = 0;
  if (useSlides && meta) {
    for (const key of prerollKeys(meta)) {
      const end = t + SLIDE_MS[key] / 1000;
      segments.push({ kind: "slide", key, start: t, end });
      t = end;
    }
  }
  const prerollMs = t * 1000;

  const mainStart = t;
  const mainEnd = mainStart + Math.max(0, spec.mainDurationSec);
  segments.push({ kind: "main", start: mainStart, end: mainEnd });
  t = mainEnd;

  if (useSlides && meta) {
    for (const key of POSTROLL_KEYS) {
      const end = t + SLIDE_MS[key] / 1000;
      segments.push({ kind: "slide", key, start: t, end });
      t = end;
    }
  }
  const totalDuration = t;

  // Crossfade clamp: cap at HALF the call so the intro fade-out and outro
  // fade-in windows can never overlap (matters for short --duration test
  // renders). This keeps the intro and outro from summing on top of each other
  // and keeps preview and render in agreement on where the outro starts. For a
  // real-length call this is just JINGLE_OVERLAP_SEC.
  const overlapSec = Math.max(
    0,
    Math.min(JINGLE_OVERLAP_SEC, (mainEnd - mainStart) / 2),
  );

  // Duck lead can't be longer than the preroll it sits in (short renders).
  const duckLeadSec = Math.max(0, Math.min(JINGLE_DUCK_LEAD_SEC, mainStart));
  const duckLevel = JINGLE_DUCK_LEVEL;

  // Intro: opens full over the pre-roll slides, ducks to duckLevel over the
  // last duckLeadSec before the call, then tails to silence over `overlapSec`
  // under the first speaker.
  const intro: JingleWindow | null =
    useSlides && meta?.intro && prerollMs > 0
      ? {
          url: meta.intro,
          startGlobal: 0,
          endGlobal: mainStart + overlapSec,
          envelope: [
            { t: 0, v: 1 },
            { t: mainStart - duckLeadSec, v: 1 },
            { t: mainStart, v: duckLevel },
            { t: mainStart + overlapSec, v: 0 },
          ],
        }
      : null;

  // Outro: fades in under the closing speaker over the last `overlapSec` of the
  // call, then plays full across the post-roll slides to the end.
  const outroStart = Math.max(
    intro ? intro.endGlobal : mainStart,
    mainEnd - overlapSec,
  );
  // Fade the audio to silence and the picture to black over the final slide.
  const endFadeSec = useSlides
    ? Math.max(0, Math.min(END_FADE_SEC, totalDuration - mainEnd))
    : 0;

  // Outro: rises to duckLevel under the closing words, up to full over the
  // first duckLeadSec of the postroll, then out to silence over the final
  // slide (the fade-to-black window) so it ends in silence.
  const outLead = Math.max(0, Math.min(duckLeadSec, totalDuration - mainEnd));
  const outFadeStart = Math.max(mainEnd + outLead, totalDuration - endFadeSec);
  const outro: JingleWindow | null =
    useSlides && meta?.outro && t > mainEnd
      ? {
          url: meta.outro,
          startGlobal: outroStart,
          endGlobal: totalDuration,
          envelope: [
            { t: outroStart, v: 0 },
            { t: mainEnd, v: duckLevel },
            { t: mainEnd + outLead, v: 1 },
            { t: outFadeStart, v: 1 },
            { t: totalDuration, v: 0 },
          ],
        }
      : null;

  return {
    segments,
    totalDuration,
    mainStart,
    mainEnd,
    prerollMs,
    postrollMs: (totalDuration - mainEnd) * 1000,
    overlapSec,
    duckLeadSec,
    duckLevel,
    intro,
    outro,
    endFadeSec,
    mainDurationSec: mainEnd - mainStart,
    mainAudioOffsetSec: spec.mainAudioOffsetSec ?? 0,
  };
}

// Locate the segment covering a global time, clamped to the timeline bounds.
export function segmentAt(tl: Timeline, t: number): Segment {
  const segs = tl.segments;
  if (t <= segs[0].start) return segs[0];
  for (const seg of segs) {
    if (t >= seg.start && t < seg.end) return seg;
  }
  return segs[segs.length - 1];
}

export function segmentIndexAt(tl: Timeline, t: number): number {
  const segs = tl.segments;
  if (t <= segs[0].start) return 0;
  for (let i = 0; i < segs.length; i++) {
    if (t >= segs[i].start && t < segs[i].end) return i;
  }
  return segs.length - 1;
}
