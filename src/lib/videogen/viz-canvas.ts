import { vizCanvas, vizCtx } from "./dom";
import { frameIndex, type Spectrum } from "./viz";

// Mirror-wave look (emulates audioMotion-analyzer's "Mirror wave" preset,
// but driven by our precomputed offline spectrum so render stays
// deterministic):
//   - smooth line wave across the canvas
//   - horizontally mirrored at centre (left half = right half)
//   - filled area beneath the line, gradient that fades downward
//   - faded vertical reflection below for the floor reflection
//   - auto-normalised via a slow-decay running peak so peaks rarely hit
//     the canvas edges regardless of source loudness

let spectrum: Spectrum | null = null;
let vizSmooth: Float32Array | null = null;
let lastVizT = -1;
let vizPeak = 0;

export function setSpectrum(s: Spectrum | null): void {
  spectrum = s;
  vizSmooth = null;
  vizPeak = 0;
  lastVizT = -1;
}

export function drawViz(t: number): void {
  const w = vizCanvas.width;
  const h = vizCanvas.height;
  vizCtx.clearRect(0, 0, w, h);
  if (!spectrum) return;
  const fps = spectrum.fps;
  const bands = spectrum.bands;
  const idx = Math.min(spectrum.frames.length - 1, frameIndex(t, fps));
  const frame = spectrum.frames[idx];
  if (!frame) return;

  if (!vizSmooth || vizSmooth.length !== bands || lastVizT > t + 1) {
    vizSmooth = new Float32Array(frame);
    vizPeak = 0;
  }
  for (let b = 0; b < bands; b++) {
    const target = frame[b];
    const cur = vizSmooth[b];
    // Fast attack, quicker decay (0.3) than before so the wave settles back to
    // flat promptly after speech instead of leaving a lingering resting hump.
    const k = target > cur ? 0.45 : 0.3;
    vizSmooth[b] = cur + (target - cur) * k;
  }
  lastVizT = t;

  // Running peak across all bands for normalisation. Fast attack, slow
  // decay so a brief loud peak stays the reference for a while and softer
  // content paints proportionally smaller.
  let frameMax = 0;
  for (let b = 0; b < bands; b++) {
    if (vizSmooth[b] > frameMax) frameMax = vizSmooth[b];
  }
  if (frameMax > vizPeak) vizPeak = frameMax;
  else vizPeak = vizPeak * 0.9985 + frameMax * 0.0015;
  const denom = Math.max(0.05, vizPeak);

  const halfW = w / 2;
  const baseY = h * 0.46;
  const maxAmp = h * 0.36;
  const reflexGap = h * 0.01;
  const reflexMaxH = h * 0.32;

  function sample(x: number): number {
    const tNorm = Math.abs(x - halfW) / halfW;
    const pos = tNorm * (bands - 1);
    const i = Math.floor(pos);
    const frac = pos - i;
    const sm = frac * frac * (3 - 2 * frac);
    const get = (k: number) => vizSmooth![Math.max(0, Math.min(bands - 1, k))];
    const v0 = (get(i - 1) + get(i) + get(i + 1)) / 3;
    const v1 = (get(i) + get(i + 1) + get(i + 2)) / 3;
    return Math.min(1, ((v0 * (1 - sm) + v1 * sm) / denom) * 0.95);
  }

  const step = 3;

  // Floor reflection (drawn first; main wave covers any overlap at the
  // baseline). Same shape, vertically flipped, faded out with a top-to-
  // bottom gradient.
  vizCtx.beginPath();
  const reflexBase = baseY + reflexGap;
  vizCtx.moveTo(0, reflexBase);
  for (let x = 0; x <= w; x += step) {
    vizCtx.lineTo(x, reflexBase + sample(x) * reflexMaxH);
  }
  vizCtx.lineTo(w, reflexBase);
  vizCtx.closePath();
  const reflexGrad = vizCtx.createLinearGradient(
    0,
    reflexBase,
    0,
    reflexBase + reflexMaxH,
  );
  reflexGrad.addColorStop(0, "rgba(122, 238, 168, 0.32)");
  reflexGrad.addColorStop(0.6, "rgba(122, 238, 168, 0.08)");
  reflexGrad.addColorStop(1, "rgba(122, 238, 168, 0)");
  vizCtx.fillStyle = reflexGrad;
  vizCtx.fill();

  // Main wave: filled area + thin stroke on top.
  vizCtx.beginPath();
  vizCtx.moveTo(0, baseY);
  for (let x = 0; x <= w; x += step) {
    vizCtx.lineTo(x, baseY - sample(x) * maxAmp);
  }
  vizCtx.lineTo(w, baseY);
  vizCtx.closePath();
  const fillGrad = vizCtx.createLinearGradient(0, baseY - maxAmp, 0, baseY);
  fillGrad.addColorStop(0, "rgba(160, 255, 200, 0.55)");
  fillGrad.addColorStop(1, "rgba(70, 160, 110, 0.10)");
  vizCtx.fillStyle = fillGrad;
  vizCtx.fill();

  vizCtx.beginPath();
  vizCtx.moveTo(0, baseY - sample(0) * maxAmp);
  for (let x = step; x <= w; x += step) {
    vizCtx.lineTo(x, baseY - sample(x) * maxAmp);
  }
  vizCtx.lineWidth = 2;
  vizCtx.strokeStyle = "rgba(160, 255, 200, 0.85)";
  vizCtx.stroke();
}
