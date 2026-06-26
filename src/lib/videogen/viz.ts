// Tiny radix-2 FFT + precompute that turns a decoded AudioBuffer into a
// frame-indexed array of N-band magnitudes. The /videogen page calls this
// once on load, then reads `spectrum[frameIndex]` while the driver seeks.

export type Spectrum = {
  fps: number;
  bands: number;
  frames: Float32Array[]; // length = totalFrames, each Float32Array length = bands
  duration: number;
};

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

export async function decodeAudio(
  url: string,
  ctx: OfflineAudioContext | AudioContext,
): Promise<AudioBuffer> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}

export function computeSpectrum(
  buffer: AudioBuffer,
  opts: { fps?: number; bands?: number; fftSize?: number } = {},
): Spectrum {
  const fps = opts.fps ?? 60;
  const bands = opts.bands ?? 48;
  const fftSize = opts.fftSize ?? 1024; // must be power of two
  const sr = buffer.sampleRate;
  const samplesPerFrame = Math.round(sr / fps);
  const totalFrames = Math.floor(buffer.duration * fps);

  // Mono mix for analysis
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= buffer.numberOfChannels;
  }

  // Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Logarithmic band edges (Hz). Start at 80 Hz (not sub-bass): the lowest band
  // maps to the centre of the mirror wave (next to the speaker avatar), and
  // sub-100 Hz room rumble there shows as a small persistent centre bump even
  // when the speaker is at rest. High-passing it keeps the centre flat.
  const minHz = 80;
  const maxHz = Math.min(sr / 2, 16000);
  const edges = new Float32Array(bands + 1);
  for (let i = 0; i <= bands; i++) {
    edges[i] = minHz * Math.pow(maxHz / minHz, i / bands);
  }
  const binHz = sr / fftSize;

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const frames: Float32Array[] = new Array(totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    const center = f * samplesPerFrame;
    const start = Math.max(0, center - fftSize / 2);
    re.fill(0);
    im.fill(0);
    const end = Math.min(mono.length, start + fftSize);
    let energy = 0;
    for (let i = 0; i < end - start; i++) {
      const s = mono[start + i];
      energy += s * s;
      re[i] = s * window[i];
    }
    fft(re, im);

    // Soft noise gate: the log-compression below steeply amplifies tiny
    // magnitudes, so room tone / mic noise during silence shows up as a
    // visible "bump". Gate on the frame's RMS energy — below gateLo the bands
    // are forced to 0, above gateHi they pass untouched, smoothstep between
    // (the time-smoothing in viz-canvas hides any threshold flicker). Tune
    // gateLo/gateHi if it clips quiet speech or leaves residual shimmer.
    const rms = Math.sqrt(energy / Math.max(1, end - start));
    // ~ -36 .. -28 dBFS: sits above the live two-mic room tone (which otherwise
    // leaks a small "resting bump" through a lower gate) and below speech, so
    // quiet moments paint flat while speech is untouched. Validated by rendering
    // the wave shape offline at in-call room-tone frames (flat) vs speech (full).
    const gateLo = 0.02,
      gateHi = 0.045;
    let gate =
      rms <= gateLo
        ? 0
        : rms >= gateHi
          ? 1
          : (rms - gateLo) / (gateHi - gateLo);
    gate = gate * gate * (3 - 2 * gate); // smoothstep

    const out = new Float32Array(bands);
    for (let b = 0; b < bands; b++) {
      const loBin = Math.max(1, Math.floor(edges[b] / binHz));
      const hiBin = Math.min(fftSize / 2, Math.ceil(edges[b + 1] / binHz));
      let sum = 0;
      let count = 0;
      for (let k = loBin; k < hiBin; k++) {
        sum += Math.hypot(re[k], im[k]);
        count++;
      }
      const mag = count > 0 ? sum / count : 0;
      // log-compress + normalize roughly into 0..1, then apply the noise gate
      out[b] = gate * Math.min(1, Math.log10(1 + mag * 20) / 1.5);
    }
    frames[f] = out;
  }

  return { fps, bands, frames, duration: buffer.duration };
}

export function frameIndex(t: number, fps: number): number {
  return Math.max(0, Math.floor(t * fps));
}
