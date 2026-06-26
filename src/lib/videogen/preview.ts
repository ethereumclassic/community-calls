import {
  previewAudio,
  jingleAudio,
  fadeBlackEl,
  previewControls,
  previewPlay,
  previewRestart,
  previewScrub,
  previewTime,
  previewDownload,
  renderedPlayer,
  renderedVideo,
} from "./dom";
import { fmt } from "./format";
import { ensureAma } from "./ama";
import { renderedUrl, type Job, type Participant } from "./job";
import type { SidecarMeta } from "./sidecar";
import type { Cue } from "./vtt";
import {
  segmentAt,
  segmentIndexAt,
  jingleVolumeAt,
  type Segment,
  type Timeline,
} from "./timeline";
import {
  setActiveSlide,
  hideSlideOverlay,
  setOverlayOpacity,
  SLIDE_KEYS,
  type SlideContext,
  type SlideKey,
} from "./slides";

// Cross-fade between the slide deck and the live call stage at each boundary.
const SLIDE_FADE_SEC = 0.6;
// The call -> first post-roll slide (speaker-time pie) gets a longer, clearly
// perceptible fade: a 0.6s cross-dissolve between two busy frames reads as a
// flash, so give the close of the call a proper slow fade up into the slide.
const POSTROLL_FADE_SEC = 1.6;

type Ctx = {
  ready: Promise<void>;
  audioSrc: string;
  seek: (t: number) => void;
  getJob: () => Job | null;
  getSidecar: () => SidecarMeta | null;
  getCues: () => Cue[];
  getParticipants: () => Participant[];
  getTimeline: () => Timeline;
};

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// Linear 0..1 ramp across [a, b], clamped outside. Shared by the boundary
// cross-fades and the end fade-to-black so they all ramp the same way.
const ramp = (t: number, a: number, b: number) =>
  b > a ? clamp((t - a) / (b - a), 0, 1) : t >= b ? 1 : 0;

// Preview transport over the whole-video timeline (preroll slides + main +
// postroll slides). One global clock (`globalT`, in seconds) drives the
// scrubber and the rendered visual; you can scrub into any slide. Audio is
// region-aware: the main call audio plays during the main segment, the
// intro/outro jingles play during their slide groups, and everything else is
// silence. The realtime driver clicks play and awaits window.__renderEnded.
export function setupPreviewControls(ctx: Ctx): void {
  previewControls.classList.remove("hidden");

  let timeline: Timeline | null = null;
  let globalT = 0;
  let playing = false;
  let lastWall = 0;
  // Last observed call-audio currentTime, to detect a "playing but stalled"
  // media element (paused === false yet currentTime frozen). When that happens
  // the visual clock must fall back to wallclock — the page audio is only a
  // clock here (the output audio is muxed separately), so a stalled element
  // must never be allowed to freeze the picture.
  let lastAudioCT = -1;
  let raf = 0;
  let activeIdx = -1; // last segment index media was synced to
  let currentJingleUrl: string | null = null;
  let jingleVol = -1; // last volume written to jingleAudio (-1 = unset)
  // Slides adjacent to the main segment, for the boundary cross-fades.
  let lastPrerollKey: SlideKey | null = null;
  let firstPostrollKey: SlideKey | null = null;
  let fadeBlackOpacity = -1; // last opacity written to the fade-to-black layer
  // Optional cap (driver --duration) that ends the main segment early.
  let mainCapSec: number | null = null;

  // window.__renderEnded resolves once the whole timeline has played through;
  // the realtime screencast driver awaits it to know when to stop recording.
  let endedResolve: () => void = () => {};
  const endedPromise = new Promise<void>((r) => {
    endedResolve = r;
  });
  const w = window as unknown as {
    __renderEnded: Promise<void>;
    __capMainAt: (sec: number) => void;
  };
  w.__renderEnded = endedPromise;
  // Driver hook: cap the main segment at `sec` so postroll fires without
  // waiting out the full (up to 86 min) audio. Replaces the old synthetic
  // `ended` dispatch.
  w.__capMainAt = (sec: number) => {
    mainCapSec = sec > 0 ? sec : null;
  };

  function buildSlideContext(): SlideContext {
    const job = ctx.getJob();
    const meta = ctx.getSidecar();
    return {
      call: job?.call,
      hosts: meta?.hosts,
      chapters: meta?.chapters,
      summary: meta?.summary,
      cues: ctx.getCues(),
      participants: ctx.getParticipants(),
      meta: meta ?? null,
    };
  }

  function updateScrubUI(t: number): void {
    const total = timeline?.totalDuration ?? 0;
    if (total > 0) previewScrub.value = String(t);
    previewTime.textContent = `${fmt(t)} / ${fmt(total)}`;
  }

  // Paint the correct visual for a global time: the stage (via ctx.seek) in
  // the main segment, otherwise the active slide.
  function renderGlobal(t: number): void {
    if (!timeline) return;
    const seg = segmentAt(timeline, t);
    const { mainStart, mainEnd, mainAudioOffsetSec: off } = timeline;
    const fade = SLIDE_FADE_SEC;

    // The slide<->stage cross-fades are a playback transition. On a paused
    // scrub or slide-jump we skip them and show the slide at full opacity, so
    // inspecting a boundary slide (e.g. the stats slide, whose start lands
    // exactly at mainEnd where the fade-in opacity is 0) shows it solid rather
    // than caught mid-transition over the held stage.
    if (seg.kind === "main") {
      // Main local time -> audio time (offset past the trimmed head silence).
      ctx.seek(off + (t - mainStart));
      // Fade the last pre-roll slide out over the opening of the call (the
      // stage is already live underneath) instead of cutting to it.
      if (playing && lastPrerollKey && t < mainStart + fade) {
        setActiveSlide(lastPrerollKey, buildSlideContext);
        setOverlayOpacity(1 - ramp(t, mainStart, mainStart + fade));
      } else {
        hideSlideOverlay();
      }
    } else {
      setActiveSlide(seg.key, buildSlideContext);
      // Fade the first post-roll slide in over the close of the call (a longer
      // fade than the inter-slide one so it clearly reads as a fade-up).
      const postFade = POSTROLL_FADE_SEC;
      if (playing && seg.key === firstPostrollKey && t < mainEnd + postFade) {
        ctx.seek(off + (mainEnd - mainStart)); // hold the final call frame
        setOverlayOpacity(ramp(t, mainEnd, mainEnd + postFade));
      } else {
        setOverlayOpacity(1);
      }
    }
    applyFadeBlack(t);
    updateScrubUI(t);
  }

  // Fade the whole stage to black over the final slide: opacity ramps 0 -> 1
  // across [totalDuration - endFadeSec, totalDuration]. Captured by the
  // screencast, so the rendered MP4 fades out in step with the audio. Written
  // only when it changes (constant 0 for the whole call body otherwise).
  function applyFadeBlack(t: number): void {
    if (!timeline) return;
    const { endFadeSec, totalDuration } = timeline;
    // Reach full black a hair BEFORE the end and hold it solid, so the very last
    // captured frame is fully black. The realtime screencast's final frame lands
    // a frame or two before totalDuration; ramping exactly to totalDuration left
    // it at ~0.99 opacity, so the ETC logo stayed faintly visible.
    const hold = Math.min(0.4, endFadeSec * 0.3);
    const o =
      endFadeSec > 0
        ? ramp(t, totalDuration - endFadeSec, totalDuration - hold)
        : 0;
    if (o !== fadeBlackOpacity) {
      fadeBlackOpacity = o;
      fadeBlackEl.style.opacity = String(o);
    }
  }

  function pauseJingle(): void {
    if (!jingleAudio.paused) jingleAudio.pause();
  }

  // The jingle lives on the global timeline (intro window, then outro window),
  // not inside a single slide group: it keeps playing across the slide/main
  // boundary and fades under the speaker. Each frame we look up which window
  // covers `t` and apply its volume envelope + position; outside both windows
  // it's silent. Audible only while playing (scrubbing positions it silently).
  function activeJingle(t: number) {
    if (!timeline) return null;
    for (const w of [timeline.intro, timeline.outro]) {
      if (!w) continue;
      const vol = jingleVolumeAt(w, t);
      if (vol !== null) return { w, vol };
    }
    return null;
  }

  function applyJingle(t: number): void {
    const active = activeJingle(t);
    if (!active) {
      pauseJingle();
      return;
    }
    const { w, vol } = active;
    if (currentJingleUrl !== w.url) {
      jingleAudio.src = w.url;
      currentJingleUrl = w.url;
    }
    // Only touch .volume when it actually changes — this runs every animation
    // frame, and the long full-volume plateau over the slides would otherwise
    // re-assign the same value 60×/s.
    if (vol !== jingleVol) {
      jingleAudio.volume = vol;
      jingleVol = vol;
    }
    const offset = t - w.startGlobal;
    if (
      offset >= 0 &&
      (Number.isNaN(jingleAudio.currentTime) ||
        Math.abs(jingleAudio.currentTime - offset) > 0.25)
    ) {
      try {
        jingleAudio.currentTime = offset;
      } catch {
        /* metadata not loaded yet — fine, it'll start from 0 */
      }
    }
    if (playing && jingleAudio.paused) void jingleAudio.play().catch(() => {});
    else if (!playing && !jingleAudio.paused) jingleAudio.pause();
  }

  // Start/stop the main call audio when crossing into a segment. The jingle is
  // handled separately (applyJingle) since it spans boundaries.
  function onEnterSegment(seg: Segment, t: number): void {
    if (!timeline) return;
    if (seg.kind === "main") {
      // Audio plays from the trimmed-head offset, not from 0.
      const audioT =
        timeline.mainAudioOffsetSec + Math.max(0, t - timeline.mainStart);
      if (Math.abs(previewAudio.currentTime - audioT) > 0.25) {
        previewAudio.currentTime = audioT;
      }
      if (playing) void previewAudio.play().catch(() => {});
    } else {
      if (!previewAudio.paused) previewAudio.pause();
    }
  }

  function syncMedia(t: number): void {
    if (!timeline) return;
    const idx = segmentIndexAt(timeline, t);
    const seg = timeline.segments[idx];
    if (idx !== activeIdx) {
      onEnterSegment(seg, t);
      activeIdx = idx;
    } else if (
      seg.kind === "main" &&
      playing &&
      previewAudio.paused &&
      !previewAudio.ended
    ) {
      void previewAudio.play().catch(() => {});
    }
    applyJingle(t);
  }

  function frame(): void {
    if (!playing || !timeline) return;
    const now = performance.now();
    const dt = (now - lastWall) / 1000;
    lastWall = now;

    const seg = segmentAt(timeline, globalT);
    if (seg.kind === "main") {
      // Main audio is the authority while it's actually *advancing*, so there's
      // no drift over a long call; otherwise advance by wall clock. Clamp to
      // mainEnd so a longer-than-decoded media element can't push the clock
      // into postroll while the call audio is still playing.
      //
      // Crucially, "playing" is not enough: a media element can be unpaused yet
      // stalled (buffering/seek), with currentTime frozen. If we slaved globalT
      // to a frozen currentTime the whole render would freeze in place (that is
      // exactly the preroll->main "stuck slide" failure). So require currentTime
      // to actually move; if it isn't (paused OR stalled), advance on wallclock.
      const ct = previewAudio.currentTime;
      const audioAdvancing = !previewAudio.paused && ct > lastAudioCT + 1e-3;
      if (audioAdvancing) {
        // audio currentTime is offset past the trimmed head — back it out.
        globalT = Math.min(
          timeline.mainEnd,
          timeline.mainStart + (ct - timeline.mainAudioOffsetSec),
        );
      } else {
        globalT += dt;
      }
      lastAudioCT = ct;
      // Cap against the timeline position (not audio.currentTime) so the
      // --duration cap still fires when the audio isn't actually playing
      // (e.g. autoplay blocked), instead of running out the full call.
      const mainLocal = globalT - timeline.mainStart;
      const capped = mainCapSec != null && mainLocal >= mainCapSec;
      if (previewAudio.ended || capped) globalT = timeline.mainEnd;
    } else {
      globalT += dt;
    }

    if (globalT >= timeline.totalDuration) {
      globalT = timeline.totalDuration;
      renderGlobal(globalT);
      finish();
      return;
    }

    syncMedia(globalT);
    renderGlobal(globalT);
    raf = requestAnimationFrame(frame);
  }

  function finish(): void {
    playing = false;
    cancelAnimationFrame(raf);
    previewAudio.pause();
    pauseJingle();
    previewPlay.textContent = "▶";
    endedResolve();
  }

  function pause(): void {
    playing = false;
    cancelAnimationFrame(raf);
    previewAudio.pause();
    pauseJingle();
    previewPlay.textContent = "▶";
  }

  async function play(): Promise<void> {
    if (!timeline || timeline.totalDuration <= 0) return;
    if (globalT >= timeline.totalDuration) globalT = 0; // replay from the top
    // AMA must attach inside the user gesture (Chrome autoplay policy).
    await ensureAma().catch(() => {});
    playing = true;
    previewPlay.textContent = "⏸";
    activeIdx = -1; // force media re-entry for the current segment
    lastWall = performance.now();
    lastAudioCT = -1; // reset stall tracking; first main frame re-authorities
    syncMedia(globalT);
    renderGlobal(globalT);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  // Move the clock to `t` and re-sync media without changing play/pause state.
  function seekTo(t: number): void {
    if (!timeline) return;
    globalT = clamp(t, 0, timeline.totalDuration);
    activeIdx = -1;
    lastWall = performance.now();
    lastAudioCT = -1; // a seek jumps currentTime; don't read it as "advancing"
    syncMedia(globalT);
    renderGlobal(globalT);
  }

  ctx.ready.then(() => {
    timeline = ctx.getTimeline();
    const mi = timeline.segments.findIndex((s) => s.kind === "main");
    const before = timeline.segments[mi - 1];
    const after = timeline.segments[mi + 1];
    lastPrerollKey = before?.kind === "slide" ? before.key : null;
    firstPostrollKey = after?.kind === "slide" ? after.key : null;
    previewAudio.src = ctx.audioSrc;
    previewScrub.min = "0";
    previewScrub.max = String(timeline.totalDuration || 1);
    previewScrub.step = "0.05";
    previewScrub.value = "0";
    // Paint the t=0 frame so the resting state is the timeline's first frame
    // (the title slide), not the bare stage — this is also what the realtime
    // driver captures as frame 0.
    seekTo(0);
    if (renderedUrl) {
      previewDownload.href = renderedUrl;
      previewDownload.classList.remove("hidden");
      renderedVideo.src = renderedUrl;
      renderedPlayer.classList.remove("hidden");
    }
  });

  previewPlay.addEventListener("click", () => {
    if (playing) pause();
    else void play();
  });

  previewRestart.addEventListener("click", () => {
    const wasPlaying = playing;
    pause();
    seekTo(0);
    if (wasPlaying) void play();
  });

  previewScrub.addEventListener("input", () => {
    if (!timeline) return;
    seekTo(parseFloat(previewScrub.value));
  });

  // Slide-jump buttons seek the timeline to that slide (paused) so you can
  // inspect it in context; "×" hides the overlay. Slides that aren't in the
  // current timeline (e.g. summary when there's no summary) are shown ad hoc.
  const jumps = document.getElementById("slide-jumps");
  jumps?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "button[data-slide]",
    ) as HTMLButtonElement | null;
    if (!btn) return;
    const which = btn.dataset.slide!;
    if (which === "off") {
      pause();
      hideSlideOverlay();
      return;
    }
    // Ignore a data-slide that isn't a real slide key (markup drift), rather
    // than feeding an invalid key into buildSlide's switch.
    if (!timeline || !SLIDE_KEYS.includes(which as SlideKey)) return;
    const seg = timeline.segments.find(
      (s) => s.kind === "slide" && s.key === which,
    );
    pause();
    if (seg) {
      seekTo(seg.start);
    } else {
      // Ad-hoc slide not on the timeline: show it solid, clearing any
      // fractional overlay opacity left by an interrupted boundary cross-fade.
      setActiveSlide(which as SlideKey, buildSlideContext);
      setOverlayOpacity(1);
    }
  });
}
