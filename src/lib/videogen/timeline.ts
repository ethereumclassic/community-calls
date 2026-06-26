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
export const JINGLE_OVERLAP_SEC = 8;

// The ending: over the final slide (the logo) the audio fades to silence and
// the picture fades to black, so the video winds down instead of cutting. This
// is the duration of that fade — kept equal to the logo slide's on-screen time
// so the fade spans exactly the last slide. Read by the preview (audio + black
// overlay) and the render (ffmpeg afade), so they stay in lockstep.
export const END_FADE_SEC = 2.5;

// Per-slide on-screen duration. Changing these here automatically reflows the
// preview scrubber AND the driver's audio padding (both read this timeline),
// so the two can no longer drift apart.
const SLIDE_MS: Record<SlideKey, number> = {
  hero: 4500,
  title: 6000,
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
// currentTime tracks `globalT - startGlobal`, and its volume ramps up over
// [startGlobal, fadeInEnd] and down over [fadeOutStart, endGlobal] so the
// crossfade under the speaker is computed the same way wherever we play it.
export type JingleWindow = {
  url: string;
  startGlobal: number;
  endGlobal: number;
  fadeInEnd: number;
  fadeOutStart: number;
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
// Linear ramps, matching ffmpeg afade's default (tri) curve so preview and
// render agree.
export function jingleVolumeAt(w: JingleWindow, t: number): number | null {
  if (t < w.startGlobal || t >= w.endGlobal) return null;
  let v = 1;
  if (w.fadeInEnd > w.startGlobal && t < w.fadeInEnd) {
    v = (t - w.startGlobal) / (w.fadeInEnd - w.startGlobal);
  }
  if (w.endGlobal > w.fadeOutStart && t > w.fadeOutStart) {
    v = Math.min(v, (w.endGlobal - t) / (w.endGlobal - w.fadeOutStart));
  }
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

  // Intro: starts at t=0 over the pre-roll slides at full volume, then bleeds
  // `overlapSec` into the call and fades out under the first speaker.
  const intro: JingleWindow | null =
    useSlides && meta?.intro && prerollMs > 0
      ? {
          url: meta.intro,
          startGlobal: 0,
          endGlobal: mainStart + overlapSec,
          fadeInEnd: 0, // no fade-in; it opens at full
          fadeOutStart: mainStart,
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

  const outro: JingleWindow | null =
    useSlides && meta?.outro && t > mainEnd
      ? {
          url: meta.outro,
          startGlobal: outroStart,
          endGlobal: totalDuration,
          fadeInEnd: mainEnd,
          // Fade the outro out over the final slide so it ends in silence
          // (kept after fadeInEnd so the in-ramp always finishes first).
          fadeOutStart: Math.max(mainEnd, totalDuration - endFadeSec),
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
