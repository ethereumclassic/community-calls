// Display mode: while the call discusses an asset (a mockup, a screenshot, a
// clip), the stage swaps the waveform for that asset. The roster slides from
// its centred row into a small stack down the left edge, the waveform fades
// out under the asset, and header / subtitles / chapter bar stay exactly where
// they are. Windows come from the call markdown `displays:` frontmatter via the
// sidecar meta (see calls-server.ts).
//
// Everything here is a pure function of the transcript time `t`, never of
// wall-clock: the layout ramp, the content cross-fades, the image drift and
// the video position are all computed from t on every seek. That is what
// keeps the realtime capture, the deterministic per-frame render, and a
// scrubbed preview pixel-identical for the same t.

import { stageEl, vizCanvas, amaEl } from "./dom";
import { setStackProgress } from "./roster";
import type { Display } from "./sidecar";

// Layout slides row -> stack over this long at the start of a display session
// and back at the end. Consecutive windows (image straight into a clip) share
// one session, so the layout only moves at the outer edges.
const LAYOUT_RAMP_SEC = 1.2;
// Cross-fade between two consecutive items inside a session.
const CONTENT_FADE_SEC = 0.6;
// Default still-image motion: a slow 1 -> 1.06 drift so it never sits dead
// on screen. A window can override with zoomFrom/zoomTo/focus (e.g. open on a
// full-width close-up of a face and settle out to the whole picture).
const IMAGE_DRIFT_SCALE = 0.06;
const STAGE_W = 1920;
const STAGE_H = 1080;
// A video's currentTime is re-synced when it drifts further than this from
// the timeline (seek granularity + decode latency headroom).
const VIDEO_SYNC_TOLERANCE = 0.3;

type Item = {
  d: Display;
  el: HTMLElement;
  media: HTMLImageElement | HTMLVideoElement;
};

type Session = { start: number; end: number };

const layerEl = document.getElementById("display")!;

let items: Item[] = [];
let sessions: Session[] = [];
let playing = false;
let lastDm = -1;
let lastNameAlpha = -1;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (t: number, a: number, b: number) =>
  b > a ? clamp01((t - a) / (b - a)) : t >= b ? 1 : 0;
// Ease the layout move so the cards settle instead of stopping dead.
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export function setDisplays(list: Display[] | undefined): void {
  layerEl.innerHTML = "";
  items = [];
  sessions = [];
  lastDm = -1;
  lastNameAlpha = -1;
  const sorted = [...(list ?? [])].sort((a, b) => a.start - b.start);
  for (const d of sorted) {
    const el = document.createElement("div");
    el.className = `display-item display-${d.kind} hidden`;
    let media: HTMLImageElement | HTMLVideoElement;
    if (d.kind === "video") {
      const v = document.createElement("video");
      v.src = d.src;
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.loop = !!d.loop;
      v.playbackRate = d.rate ?? 1;
      media = v;
    } else {
      const img = document.createElement("img");
      img.src = d.src;
      img.alt = "";
      img.decoding = "sync";
      const [fx, fy] = parseFocus(d.focus);
      img.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
      media = img;
    }
    el.appendChild(media);
    layerEl.appendChild(el);
    items.push({ d, el, media });

    // Merge into the open session when this window abuts or overlaps it.
    const last = sessions[sessions.length - 1];
    if (last && d.start <= last.end + 0.05) {
      last.end = Math.max(last.end, d.end);
    } else {
      sessions.push({ start: d.start, end: d.end });
    }
  }
}

// The preview transport tells us whether time is advancing, so embedded
// videos play in step with the call (and stay paused on a scrub).
export function setDisplayPlaying(p: boolean): void {
  playing = p;
  for (const it of items) {
    if (it.media instanceof HTMLVideoElement && !p && !it.media.paused) {
      it.media.pause();
    }
  }
}

function sessionOf(t: number): Session | null {
  for (const s of sessions) if (t >= s.start && t < s.end) return s;
  return null;
}

// Layout progress 0..1 at t: 1 inside a session, ramping at its edges.
function layoutProgress(t: number): number {
  let dm = 0;
  for (const s of sessions) {
    const inRamp = ramp(t, s.start, s.start + LAYOUT_RAMP_SEC);
    const outRamp = 1 - ramp(t, s.end - LAYOUT_RAMP_SEC, s.end);
    dm = Math.max(dm, Math.min(inRamp, outRamp));
  }
  return dm;
}

// Opacity of one item at t. At a session edge the layer itself does the
// fading (it carries the black background and the layout ramp), so the item
// is solid there; between two items in one session they cross-fade.
function itemOpacity(it: Item, t: number, s: Session): number {
  const { start, end } = it.d;
  if (t < start || t >= end) return 0;
  const fadeIn =
    start <= s.start + 0.05 ? 1 : ramp(t, start, start + CONTENT_FADE_SEC);
  const fadeOut =
    end >= s.end - 0.05 ? 1 : 1 - ramp(t, end - CONTENT_FADE_SEC, end);
  return Math.min(fadeIn, fadeOut);
}

// "x% y%" -> [0..1, 0..1]; default centre.
function parseFocus(f: string | undefined): [number, number] {
  const m = (f ?? "").trim().match(/^([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return [0.5, 0.5];
  return [clamp01(parseFloat(m[1]) / 100), clamp01(parseFloat(m[2]) / 100)];
}

// Image transform at progress p (0..1 across the window): scale from zoomFrom
// to zoomTo about the focus point, translating so the focus point sits at the
// frame centre when fully zoomed in and at its natural spot when the image is
// shown whole (scale 1). Eased so both ends settle.
// Also drives the cold-open still (slides.ts), hence the narrow parameter.
export function imageTransform(
  d: Pick<Display, "zoomFrom" | "zoomTo" | "focus">,
  p: number,
): string {
  const from = d.zoomFrom ?? 1;
  const to = d.zoomTo ?? (d.zoomFrom != null ? 1 : 1 + IMAGE_DRIFT_SCALE);
  const e = easeInOut(p);
  const s = from + (to - from) * e;
  const [fx, fy] = parseFocus(d.focus);
  // How far the focus point moves toward the centre: all the way at the
  // biggest scale in the window, none at scale 1.
  const sMax = Math.max(from, to);
  const k = sMax > 1 ? clamp01((s - 1) / (sMax - 1)) : 0;
  const dx = (STAGE_W / 2 - fx * STAGE_W) * k;
  const dy = (STAGE_H / 2 - fy * STAGE_H) * k;
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${s.toFixed(4)})`;
}

function syncVideo(
  v: HTMLVideoElement,
  d: Display,
  want: number,
  visible: boolean,
): void {
  if (!visible) {
    if (!v.paused) v.pause();
    return;
  }
  // Timeline seconds -> media seconds (rate), wrapped when looping.
  want = want * (d.rate ?? 1);
  if (d.loop && v.duration > 0 && Number.isFinite(v.duration)) {
    want = want % v.duration;
  }
  const ct = v.currentTime;
  if (Number.isNaN(ct) || Math.abs(ct - want) > VIDEO_SYNC_TOLERANCE) {
    try {
      v.currentTime = Math.max(0, want);
    } catch {
      /* metadata not ready yet; the next frame will land it */
    }
  }
  if (playing && v.paused) void v.play().catch(() => {});
  else if (!playing && !v.paused) v.pause();
}

export function updateDisplay(t: number): void {
  if (items.length === 0) return;

  const raw = layoutProgress(t);
  const dm = easeInOut(raw);
  const s = sessionOf(t);
  // The active speaker's name in the stack: fade it in once the layout has
  // settled and out just before it starts moving back, so it never rides the
  // sliding cards.
  const nameAlpha = s
    ? Math.min(
        ramp(
          t,
          s.start + LAYOUT_RAMP_SEC,
          s.start + LAYOUT_RAMP_SEC + CONTENT_FADE_SEC,
        ),
        1 -
          ramp(
            t,
            s.end - LAYOUT_RAMP_SEC - CONTENT_FADE_SEC,
            s.end - LAYOUT_RAMP_SEC,
          ),
      )
    : 0;

  if (dm !== lastDm || nameAlpha !== lastNameAlpha) {
    lastDm = dm;
    lastNameAlpha = nameAlpha;
    layerEl.style.opacity = String(dm);
    layerEl.classList.toggle("hidden", dm <= 0);
    // The waveform (either backend) fades out under the asset.
    const viz = String(1 - dm);
    vizCanvas.style.opacity = viz;
    amaEl.style.opacity = viz;
    stageEl.classList.toggle("display-mode", dm > 0);
    setStackProgress(dm, nameAlpha);
  }

  for (const it of items) {
    const o = s ? itemOpacity(it, t, s) : 0;
    const visible = o > 0;
    it.el.classList.toggle("hidden", !visible);
    it.el.style.opacity = String(o);
    if (it.media instanceof HTMLVideoElement) {
      syncVideo(it.media, it.d, t - it.d.start, visible);
    } else if (visible) {
      const span = Math.max(0.001, it.d.end - it.d.start);
      const p = clamp01((t - it.d.start) / span);
      it.media.style.transform = imageTransform(it.d, p);
    }
  }
}
