import { amaEl, previewAudio, vizCanvas } from "./dom";

// Audio-motion-analyzer wrapper. Dynamic-imported on first use so render
// mode + tests don't pay the bundle cost, and so the AudioContext attaches
// inside a user gesture (Chrome autoplay policy).

type AmaCtor = new (
  container: HTMLElement,
  opts: Record<string, unknown>,
) => {
  registerGradient: (name: string, def: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
};

let amaPromise: Promise<unknown> | null = null;

export function ensureAma(): Promise<unknown> {
  if (amaPromise) return amaPromise;
  amaPromise = (async () => {
    const mod = (await import("audiomotion-analyzer")) as unknown as {
      default: AmaCtor;
    };
    const AudioMotionAnalyzer = mod.default;
    const inst = new AudioMotionAnalyzer(amaEl, {
      source: previewAudio,
      // Mirror wave — line / area graph, horizontal mirror, with floor
      // reflection. Restrained so the speaker dominates.
      mode: 10,
      channelLayout: "single",
      fillAlpha: 0.32,
      lineWidth: 1.25,
      minFreq: 30,
      maxFreq: 16000,
      mirror: -1,
      radial: false,
      reflexAlpha: 0.35,
      reflexBright: 1,
      reflexRatio: 0.5,
      reflexFit: true,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      showBgColor: false,
      overlay: true,
      smoothing: 0.75,
    });
    inst.registerGradient("etc-green", {
      bgColor: "#0a0a0c",
      colorStops: [
        { pos: 0, color: "rgba(90, 196, 136, 0.55)" },
        { pos: 0.5, color: "rgba(70, 160, 110, 0.42)" },
        { pos: 1, color: "rgba(38, 95, 64, 0.28)" },
      ],
    });
    inst.setOptions({ gradient: "etc-green" });
    vizCanvas.classList.add("hidden");
    amaEl.classList.remove("hidden");
    return inst;
  })();
  return amaPromise;
}
