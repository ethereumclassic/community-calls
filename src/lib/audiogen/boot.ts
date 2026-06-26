// Client-side boot for the dev-only /audiogen route, powered by Strudel.
//
// @strudel/web is loaded as a UMD global from a CDN by a <script> tag in the
// page (so its AGPL code never enters our bundle, and the route is stripped
// from prod regardless). This module renders a layered composer: drums / bass
// / lead / texture, each with 16 options. Pick one per layer to compose a
// track; the choice is reflected in the editor and the URL. Stop cuts the
// output instantly; Record taps the master into a WAV.

import { LAYERS, compose, DEFAULT_SELECTION, type Selection } from "./layers";
import { audioBufferToWav, fadeOut, normalize } from "./wav";

// @strudel/web exposes initStrudel on window immediately; the rest (evaluate,
// hush, samples, setcps, note, s, stack, ...) are injected as globals only
// AFTER the async initStrudel() resolves, so it must be awaited.
type StrudelGlobals = {
  initStrudel: (opts?: Record<string, unknown>) => Promise<void>;
  evaluate: (code: string) => Promise<unknown>;
  hush: () => void;
  samples: (source: string, base?: string) => Promise<void>;
  aliasBank?: (source: string) => Promise<void>;
  setcps?: (n: number) => void;
};

// Strudel's clock lives under the `strudel` namespace: getCps() = cycles per
// second, getTime() = the current cycle position (a float advancing at cps).
const strudelClock = () =>
  (
    window as unknown as {
      strudel?: { getCps?: () => number; getTime?: () => number };
    }
  ).strudel;
const w = window as unknown as StrudelGlobals & Record<string, unknown>;

const CDN = "https://strudel.b-cdn.net";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const waitFor = (test: () => boolean, ms = 8000) =>
  new Promise<void>((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      if (test()) return resolve();
      if (performance.now() - t0 > ms) return reject(new Error("timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });

// --- Master-output tap + mute ----------------------------------------------
// superdough keeps its master GainNode private, so we catch it by patching
// AudioNode.prototype.connect: the master is whatever node first connects to
// an AudioDestinationNode. We interpose a gain we control (so Stop can cut the
// output instantly, including reverb/delay tails) and tap the pre-mute signal
// into a ScriptProcessor for WAV export, plus a post-mute analyser for a level
// reading.
type Tap = {
  ac: AudioContext;
  setMuted: (muted: boolean) => void;
  getLevel: () => number;
  // onFirstBlock fires once, at the first captured block, with that block's
  // AudioContext time and size - used to map recorded samples onto Strudel's
  // cycle clock so we can trim to whole bars.
  start: (onFirstBlock?: (acTime: number, bufferSize: number) => void) => void;
  stop: () => AudioBuffer;
};

function installMasterTap(onReady: (tap: Tap) => void) {
  const proto = AudioNode.prototype;
  const orig = proto.connect as (this: AudioNode, ...a: unknown[]) => AudioNode;
  let captured = false;
  (proto as { connect: unknown }).connect = function (
    this: AudioNode,
    target: unknown,
    ...rest: unknown[]
  ) {
    if (!captured && target instanceof AudioDestinationNode) {
      captured = true;
      const ac = this.context as AudioContext;
      const sp = ac.createScriptProcessor(4096, 2, 2);
      const sink = ac.createGain();
      sink.gain.value = 0; // keep the processor running, but silent
      const muteGain = ac.createGain();
      const meter = ac.createAnalyser();
      meter.fftSize = 2048;
      let recording = false;
      let firstBlock = false;
      let onFirst: ((acTime: number, bufferSize: number) => void) | undefined;
      let left: Float32Array[] = [];
      let right: Float32Array[] = [];
      sp.onaudioprocess = (e) => {
        if (!recording) return;
        const inBuf = e.inputBuffer;
        if (firstBlock) {
          firstBlock = false;
          onFirst?.(ac.currentTime, inBuf.length);
        }
        left.push(new Float32Array(inBuf.getChannelData(0)));
        right.push(
          new Float32Array(
            inBuf.getChannelData(inBuf.numberOfChannels > 1 ? 1 : 0),
          ),
        );
      };
      // record tap (taps the full master signal, pre-mute)
      orig.call(this, sp);
      orig.call(sp, sink);
      orig.call(sink, ac.destination);
      // interpose mute between master and speakers (replaces master->dest)
      orig.call(this, muteGain);
      orig.call(muteGain, target);
      orig.call(muteGain, meter); // post-mute meter (passthrough sink)
      onReady({
        ac,
        setMuted: (muted) => {
          const now = ac.currentTime;
          muteGain.gain.cancelScheduledValues(now);
          muteGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.015);
        },
        getLevel: () => {
          const buf = new Float32Array(meter.fftSize);
          meter.getFloatTimeDomainData(buf);
          let s = 0;
          for (const x of buf) s += x * x;
          return Math.sqrt(s / buf.length);
        },
        start: (onFirstBlock) => {
          left = [];
          right = [];
          onFirst = onFirstBlock;
          firstBlock = true;
          recording = true;
        },
        stop: () => {
          recording = false;
          const len = left.reduce((a, c) => a + c.length, 0);
          const out = ac.createBuffer(2, Math.max(len, 1), ac.sampleRate);
          const copy = (chunks: Float32Array[], ch: number) => {
            const data = out.getChannelData(ch);
            let off = 0;
            for (const c of chunks) {
              data.set(c, off);
              off += c.length;
            }
          };
          copy(left, 0);
          copy(right, 1);
          return out;
        },
      });
      // We've rerouted master -> muteGain -> destination above. Return here so
      // the original master -> destination connection is NOT also made; running
      // the fall-through orig.call would add a second, un-muteable direct path
      // (doubling the audio and defeating Stop).
      return muteGain;
    }
    return (orig as (...a: unknown[]) => AudioNode).call(this, target, ...rest);
  };
}

// --- URL state -------------------------------------------------------------
function readState(): { sel: Selection; bpm: number } {
  const p = new URLSearchParams(location.search);
  const sel: Selection = { ...DEFAULT_SELECTION };
  for (const layer of LAYERS) {
    const v = p.get(layer.id);
    if (v === "off") sel[layer.id] = -1;
    else if (v != null) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0 && n < layer.options.length)
        sel[layer.id] = n;
    }
  }
  const bpmRaw = parseInt(p.get("bpm") ?? "", 10);
  const bpm = !Number.isNaN(bpmRaw) ? Math.min(190, Math.max(90, bpmRaw)) : 140;
  return { sel, bpm };
}

function writeState(sel: Selection, bpm: number) {
  const p = new URLSearchParams();
  for (const layer of LAYERS)
    p.set(layer.id, sel[layer.id] < 0 ? "off" : String(sel[layer.id]));
  p.set("bpm", String(bpm));
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

export function boot() {
  const editor = $<HTMLTextAreaElement>("code");
  const layersEl = $<HTMLDivElement>("layers");
  const playBtn = $<HTMLButtonElement>("play");
  const stopBtn = $<HTMLButtonElement>("stop");
  const recBtn = $<HTMLButtonElement>("record");
  const playRecBtn = $<HTMLButtonElement>("play-rec");
  const savedAudio = $<HTMLAudioElement>("saved-audio");
  const bpmInput = $<HTMLInputElement>("bpm");
  const bpmOut = $<HTMLSpanElement>("bpm-out");
  const status = $<HTMLSpanElement>("status");
  const dl = $<HTMLAnchorElement>("download");
  const audio = $<HTMLAudioElement>("preview");

  const setStatus = (s: string) => (status.textContent = s);
  // Target recording length in seconds (default 1 min). Overridable via
  // ?rec=<seconds> for quick testing. The actual clip is trimmed to a whole
  // number of 16-beat phrases, so it ends up near this length.
  const RECORD_SECONDS =
    Number(new URLSearchParams(location.search).get("rec")) || 60;
  const PHRASE_CYCLES = 4; // 4 cycles = 16 beats (our cps puts 4 beats/cycle)
  const TAIL_SECONDS = 4; // extra audio after the last phrase, faded to silence

  let tap: Tap | null = null;
  let lastUrl: string | null = null;
  installMasterTap((t) => {
    tap = t;
    // debug handle (dev-only route, stripped from prod) - level meter + mute
    (window as unknown as { __audiogenTap?: Tap }).__audiogenTap = t;
  });

  // --- state ---
  const { sel, bpm } = readState();
  bpmInput.value = String(bpm);
  bpmOut.textContent = String(bpm);

  // Strudel cps model: 1 cycle = 1 bar = 4 beats, so cps = bpm / (60 * 4).
  // PHRASE_CYCLES (4 cycles = 16 beats) is built on the same beat count.
  const BEATS_PER_CYCLE = 4;
  const bpmToCps = (b: number) => b / (60 * BEATS_PER_CYCLE);
  const applyTempo = () => {
    if (typeof w.setcps === "function")
      w.setcps(bpmToCps(Number(bpmInput.value)));
  };

  // --- render the layer grid ---
  const selLabels: Record<string, HTMLElement> = {};
  for (const layer of LAYERS) {
    const row = document.createElement("div");
    row.className = "layer";
    const head = document.createElement("div");
    head.className = "layer-head";
    head.innerHTML = `<span class="layer-name">${layer.name}</span><span class="layer-sel"></span>`;
    selLabels[layer.id] = head.querySelector(".layer-sel") as HTMLElement;
    const opts = document.createElement("div");
    opts.className = "opts";
    layer.options.forEach((opt, i) => {
      const chip = document.createElement("button");
      chip.className = "opt";
      chip.textContent = String(i + 1);
      chip.title = opt.name;
      chip.addEventListener("click", () => {
        // clicking the active chip toggles the layer off
        sel[layer.id] = sel[layer.id] === i ? -1 : i;
        refreshLayer(layer.id);
        recompose();
        play();
      });
      opts.appendChild(chip);
    });
    row.append(head, opts);
    layersEl.appendChild(row);
  }

  const refreshLayer = (id: string) => {
    const layer = LAYERS.find((l) => l.id === id);
    if (!layer) return;
    const idx = sel[id];
    const row = layersEl.children[LAYERS.indexOf(layer)] as HTMLElement;
    const chips = row.querySelectorAll(".opt");
    chips.forEach((c, i) => c.classList.toggle("active", i === idx));
    selLabels[id].textContent = idx < 0 ? "off" : layer.options[idx].name;
  };

  const recompose = () => {
    editor.value = compose(sel);
    writeState(sel, Number(bpmInput.value));
  };

  // paint initial selection
  for (const layer of LAYERS) refreshLayer(layer.id);
  editor.value = compose(sel);

  // --- strudel init + sample loading ---
  let initPromise: Promise<void> | null = null;
  const ensureInit = () => {
    if (!initPromise) {
      initPromise = (async () => {
        await waitFor(() => typeof w.initStrudel === "function").catch(() => {
          throw new Error("Strudel failed to load from CDN");
        });
        await w.initStrudel();
        setStatus("loading samples (first play only)...");
        await Promise.all([
          w.samples("github:tidalcycles/dirt-samples"),
          w.samples(
            `${CDN}/tidal-drum-machines.json`,
            `${CDN}/tidal-drum-machines/machines/`,
          ),
        ]);
        const aliasBank =
          w.aliasBank ??
          (window as unknown as { strudel?: StrudelGlobals }).strudel
            ?.aliasBank;
        if (typeof aliasBank === "function") {
          await aliasBank(`${CDN}/tidal-drum-machines-alias.json`);
        }
      })();
    }
    return initPromise;
  };

  const play = async () => {
    try {
      setStatus("loading...");
      await ensureInit();
      tap?.setMuted(false);
      await w.evaluate(editor.value);
      applyTempo();
      setStatus("playing");
    } catch (err) {
      console.error(err);
      setStatus(`error: ${(err as Error).message}`);
    }
  };

  const stop = () => {
    // hush is only injected once initStrudel() resolves; guard so a Stop click
    // during init (initPromise set, globals not yet present) can't throw.
    if (typeof w.hush === "function") w.hush();
    tap?.setMuted(true); // cut output instantly, including reverb/delay tails
    setStatus("stopped");
  };

  playBtn.addEventListener("click", play);
  stopBtn.addEventListener("click", stop);

  // Play the committed reference take (assets/audiogen/recording.mp3, served in
  // dev by the astro.config Vite plugin). Stops the live engine first so they
  // don't overlap; cache-busts so a freshly re-recorded file reloads.
  playRecBtn.addEventListener("click", () => {
    stop();
    savedAudio.classList.remove("hidden");
    // High-quality MP3 (320k) to keep the repo file small; the in-app Record
    // button still produces lossless WAV.
    savedAudio.src = `/audiogen/recording.mp3?t=${performance.now()}`;
    savedAudio
      .play()
      .then(() => setStatus("playing saved recording"))
      .catch((e) => setStatus(`no recording yet (${e.message})`));
  });
  bpmInput.addEventListener("input", () => {
    bpmOut.textContent = `${bpmInput.value}`;
    applyTempo();
    writeState(sel, Number(bpmInput.value));
  });

  editor.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      play();
    }
  });

  recBtn.addEventListener("click", async () => {
    recBtn.disabled = true;
    try {
      await play();
      if (!tap) throw new Error("master tap not ready - press Play first");
      tap.setMuted(false);

      const sr = tap.ac.sampleRate;
      // getCps() can be missing OR return 0/NaN before the clock has ticked;
      // `??` only catches null/undefined, so validate and fall back to the
      // slider tempo. A bad cps would make samplesPerCycle Infinity and the
      // capture/trim collapse to an empty clip.
      let cps = strudelClock()?.getCps?.();
      if (!(typeof cps === "number" && isFinite(cps) && cps > 0))
        cps = bpmToCps(Number(bpmInput.value));
      const samplesPerCycle = sr / cps;
      const phraseSec = PHRASE_CYCLES / cps;

      // Capture the cycle position of the first recorded sample, so we can
      // later trim to a phrase boundary. baseCycle = cycle at buffer sample 0.
      let baseCycle = 0;
      tap.start((acTime, bufferSize) => {
        const cycleNow = strudelClock()?.getTime?.() ?? 0;
        // the just-captured block was recorded ~bufferSize frames before this
        // callback fired, so sample 0 sits that far back on the cycle clock.
        baseCycle = cycleNow - (bufferSize / sr) * cps;
      });

      // Record the target plus one phrase of alignment room and the fade tail,
      // so there's always enough material to trim + fade out.
      const captureSec = RECORD_SECONDS + phraseSec + TAIL_SECONDS + 2;
      const mins = Math.round((RECORD_SECONDS / 60) * 10) / 10;
      setStatus(`recording ~${mins} min (bar-aligned)...`);
      await new Promise((r) => setTimeout(r, captureSec * 1000));
      const raw = tap.stop();
      w.hush();
      tap.setMuted(true);

      // Trim to whole 16-beat phrases, starting on a phrase boundary.
      const firstBoundary =
        Math.ceil(baseCycle / PHRASE_CYCLES) * PHRASE_CYCLES;
      const offset = Math.max(
        0,
        Math.round(((firstBoundary - baseCycle) / cps) * sr),
      );
      const wantCycles =
        Math.round((RECORD_SECONDS * cps) / PHRASE_CYCLES) * PHRASE_CYCLES;
      const haveCycles =
        Math.floor((raw.length - offset) / samplesPerCycle / PHRASE_CYCLES) *
        PHRASE_CYCLES;
      const nCycles = Math.max(PHRASE_CYCLES, Math.min(wantCycles, haveCycles));
      // Whole-phrase content (bar-aligned start + end), then up to TAIL_SECONDS
      // of extra audio that we fade out, so the clip ends gracefully instead of
      // cutting off mid-sound.
      const contentLen = Math.min(
        raw.length - offset,
        Math.round(nCycles * samplesPerCycle),
      );
      const tailLen = Math.min(
        raw.length - offset - contentLen,
        Math.round(TAIL_SECONDS * sr),
      );
      const length = contentLen + tailLen;
      if (length <= 0)
        throw new Error("no audio captured - press Play, then Record");

      const clip = tap.ac.createBuffer(2, length, sr);
      for (let c = 0; c < 2; c++) {
        clip
          .getChannelData(c)
          .set(raw.getChannelData(c).subarray(offset, offset + length));
      }

      const wav = audioBufferToWav(fadeOut(normalize(clip), tailLen));
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(wav);
      audio.src = lastUrl;
      audio.classList.remove("hidden");
      dl.href = lastUrl;
      dl.download = `audiogen-${(length / sr).toFixed(0)}s.wav`;
      dl.classList.remove("hidden");
      setStatus(
        `recorded ${(length / sr).toFixed(1)}s ` +
          `(${nCycles / PHRASE_CYCLES} phrases + ${(tailLen / sr).toFixed(1)}s fade) -> WAV ready`,
      );
    } catch (err) {
      console.error(err);
      setStatus(`record failed: ${(err as Error).message}`);
    } finally {
      recBtn.disabled = false;
    }
  });

  setStatus("ready - pick layer options to compose, then they play");
}
