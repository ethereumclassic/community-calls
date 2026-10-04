// The full video as a single ordered timeline: preroll slides, then the main
// call playback, then postroll slides. Each segment has an absolute global
// start/end (in seconds) so the preview transport can scrub across the whole
// thing and the realtime driver can size its concatenated audio track from
// the same numbers. This is the single source of truth for slide timing —
// nothing else should hard-code pre/post-roll durations.

import type { SidecarMeta } from "./sidecar";
import type { SlideKey } from "./slides";

// Jingle levels and fades. These numbers are the single source of truth for
// the intro/outro mix: the browser preview (preview.ts) plays the envelopes
// built here, and the ffmpeg render (scripts/videogen.mjs) receives the same
// envelopes through __timings, so the two can never drift apart.
//
// The jingle (about -11.5 LUFS) is much louder than speech (about -18 LUFS):
// - JINGLE_FULL: its level over the slides, so it does not jump 6 dB above
//   the voices either side of it.
// - JINGLE_UNDER_SPEECH: the most it may be while anyone is talking (cold
//   open, the opening words, the closing words), about 18 dB under the voice.
const JINGLE_FULL = 0.6;
const JINGLE_UNDER_SPEECH = 0.06;
// The jingle starts silent and fades in slowly to full.
const JINGLE_FADE_IN_SEC = 3;
// It reaches the speech level this long before the call starts...
const JINGLE_DUCK_LEAD_SEC = 4;
const JINGLE_DUCK_EARLY_SEC = 0.5;
// ...and tails from there to silence over this long under the first speaker
// (the outro mirrors it, rising under the closing speaker).
const JINGLE_OVERLAP_SEC = 6;
// Cold open: the jingle starts this long before the clip ends, held at the
// speech level, and the clip itself fades in and out.
const COLD_OPEN_OVERLAP_SEC = 2;
const COLD_OPEN_FADE_IN_SEC = 0.3;
const COLD_OPEN_FADE_OUT_SEC = 1;

// The ending: over the final slide (the logo) the audio fades to silence and
// the picture fades to black, so the video winds down instead of cutting. This
// is the duration of that fade — kept equal to the logo slide's on-screen time
// so the fade spans exactly the last slide. Read by the preview (audio + black
// overlay) and the render (ffmpeg afade), so they stay in lockstep.
const END_FADE_SEC = 2.5;

// Per-slide on-screen duration. Changing these here automatically reflows the
// preview scrubber AND the driver's audio padding (both read this timeline),
// so the two can no longer drift apart.
// The cold open is sized by its clip, not here (see coldOpenSec below).
const SLIDE_MS: Record<Exclude<SlideKey, "coldopen">, number> = {
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
  // Cold open only: the call audio plays from this audio time over the slide.
  audioFrom?: number;
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
  // Cold open at the head of the preroll (0 when there is none): seconds of
  // call audio from coldOpenAudioFrom, faded in/out over coldOpenFade*Sec.
  coldOpenSec: number;
  coldOpenAudioFrom: number;
  coldOpenFadeInSec: number;
  coldOpenFadeOutSec: number;
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

// Which slides to show: an optional cold open, then hero and title (the
// summary sits on the title card). Postroll is the full
// stats -> thanks -> logo run. Keeping this derivation in one place means the
// exposed prerollMs/postrollMs always match what actually renders.
function prerollKeys(meta: SidecarMeta): SlideKey[] {
  // Optional cold open, then the brand hero and the episode card (title +
  // summary merged). The chapter list (toc) is no longer part of the intro;
  // YouTube's description chapters cover it.
  const keys: SlideKey[] = meta.coldOpen ? ["coldopen"] : [];
  keys.push("hero", "title");
  return keys;
}

const POSTROLL_KEYS: Exclude<SlideKey, "coldopen">[] = [
  "stats",
  "thanks",
  "logo",
];

export function buildTimeline(spec: TimelineSpec): Timeline {
  const segments: Segment[] = [];
  const useSlides = spec.includeSlides && spec.meta != null;
  const meta = spec.meta;

  let t = 0;
  let coldOpenSec = 0;
  if (useSlides && meta) {
    for (const key of prerollKeys(meta)) {
      if (key === "coldopen" && meta.coldOpen) {
        coldOpenSec = meta.coldOpen.end - meta.coldOpen.start;
        const end = t + coldOpenSec;
        segments.push({
          kind: "slide",
          key,
          start: t,
          end,
          audioFrom: meta.coldOpen.start,
        });
        t = end;
        continue;
      }
      if (key === "coldopen") continue;
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

  // Duck lead can't be longer than the slides it sits in (short renders).
  const duckLeadSec = Math.max(
    0,
    Math.min(JINGLE_DUCK_LEAD_SEC, mainStart - coldOpenSec),
  );
  const duckLevel = JINGLE_UNDER_SPEECH;
  const full = JINGLE_FULL;

  // Intro: starts silent (under the end of the cold open, held at the speech
  // level until the clip ends), fades in slowly to full over the slides,
  // ducks to the speech level just before the call, then tails to silence
  // under the first speaker.
  const coldOverlap =
    coldOpenSec > 0 ? Math.min(COLD_OPEN_OVERLAP_SEC, coldOpenSec) : 0;
  const introStart = coldOpenSec - coldOverlap;
  const slidesSec = mainStart - coldOpenSec;
  const fadeIn = Math.min(
    JINGLE_FADE_IN_SEC,
    Math.max(0, slidesSec - duckLeadSec),
  );
  const duckAt = Math.max(
    coldOpenSec + fadeIn,
    mainStart - JINGLE_DUCK_EARLY_SEC,
  );
  const intro: JingleWindow | null =
    useSlides && meta?.intro && slidesSec > 0
      ? {
          url: meta.intro,
          startGlobal: introStart,
          endGlobal: mainStart + overlapSec,
          envelope: [
            { t: introStart, v: 0 },
            ...(coldOverlap > 0 ? [{ t: coldOpenSec, v: duckLevel }] : []),
            { t: coldOpenSec + fadeIn, v: full },
            {
              t: Math.max(coldOpenSec + fadeIn, mainStart - duckLeadSec),
              v: full,
            },
            { t: duckAt, v: duckLevel },
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
            { t: mainEnd + outLead, v: full },
            { t: outFadeStart, v: full },
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
    coldOpenSec,
    coldOpenAudioFrom: meta?.coldOpen?.start ?? 0,
    coldOpenFadeInSec: coldOpenSec > 0 ? COLD_OPEN_FADE_IN_SEC : 0,
    coldOpenFadeOutSec: coldOpenSec > 0 ? COLD_OPEN_FADE_OUT_SEC : 0,
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
