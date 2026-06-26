// Peak-normalize an AudioBuffer in place to `targetPeak` (linear, <= 1).
// The live limiter isn't a true brickwall, so the rendered buffer can contain
// samples above 1.0; normalizing guarantees a clean, non-clipped WAV.
export function normalize(buffer: AudioBuffer, targetPeak = 0.95): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak > 0) {
    const g = targetPeak / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buffer;
}

// Fade the last `fadeSamples` of a buffer down to silence with an equal-power
// (cosine) curve, so a recording ends gracefully instead of cutting off.
export function fadeOut(buffer: AudioBuffer, fadeSamples: number): AudioBuffer {
  const n = Math.min(fadeSamples, buffer.length);
  if (n <= 0) return buffer;
  const start = buffer.length - n;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      d[start + i] *= Math.cos((i / n) * (Math.PI / 2)); // 1 -> 0
    }
  }
  return buffer;
}

// Minimal 16-bit PCM WAV encoder for an AudioBuffer (offline render -> download).
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataLength = numFrames * blockAlign;

  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  // interleave channels, clamp to [-1, 1], convert to 16-bit
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}
