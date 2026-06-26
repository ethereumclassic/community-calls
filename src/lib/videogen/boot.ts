import {
  stageEl,
  loadingEl,
  landingEl,
  speakerCard,
  speakerEl,
  roleEl,
  initialsEl,
  avatarEl,
  rosterEl,
} from "./dom";
import {
  hasJob,
  isPreview,
  noSlides,
  showGuides,
  loadJob,
  type Job,
} from "./job";
import { applyCallMeta } from "./meta";
import { renderRoster, getParticipants } from "./roster";
import { setAvatar } from "./avatar";
import { initialsFor } from "./text";
import { parseVtt, type Cue } from "./vtt";
import { setCues, drawSubtitle } from "./subtitle";
import { computeSpectrum, decodeAudio } from "./viz";
import { drawViz, setSpectrum } from "./viz-canvas";
import { setupPreviewControls } from "./preview";
import { loadSidecar, type SidecarMeta } from "./sidecar";
import { setChapters, updateChip } from "./chip";
import { buildTimeline, type Timeline } from "./timeline";

let duration = 0;
let job: Job | null = null;
let sidecar: SidecarMeta | null = null;
let cuesRef: Cue[] = [];
let timeline: Timeline | null = null;

function seek(t: number): void {
  drawViz(t);
  drawSubtitle(t);
  updateChip(t);
}

// Window globals — used by the headless driver to seek per-frame and by
// the e2e tests to await page hydration. Keep names stable.
const w = window as unknown as {
  __seek: (t: number) => void;
  __ready?: Promise<void>;
  __duration?: number;
  __cueCount?: number;
};
w.__seek = seek;

async function init(): Promise<void> {
  job = await loadJob();
  const fps = job.fps ?? 60;
  const bands = job.bands ?? 48;

  applyCallMeta(job.call, job.title);

  // Synthesize a one-entry roster from legacy {speaker, role, avatar} so
  // the original single-speaker test path keeps working.
  if (job.participants && job.participants.length > 0) {
    renderRoster(job.participants);
    rosterEl.classList.remove("hidden");
    speakerCard.classList.add("hidden");
  } else if (job.speaker) {
    speakerEl.textContent = job.speaker;
    roleEl.textContent = job.role ?? "";
    if (job.avatar) {
      setAvatar(avatarEl, {
        name: job.speaker,
        role: job.role,
        avatar: job.avatar,
      });
    } else {
      initialsEl.textContent = initialsFor(job.speaker);
    }
    renderRoster([
      { name: job.speaker, role: job.role, avatar: job.avatar ?? null },
    ]);
  }

  if (job.vtt) {
    const vttText = await fetch(job.vtt).then((r) => r.text());
    cuesRef = parseVtt(vttText);
    setCues(cuesRef);
    w.__cueCount = cuesRef.length;
  }

  // Sidecar meta (chapters, summary, jingles). Optional — chip stays hidden
  // and pre/post-roll are skipped when there's no meta.
  sidecar = await loadSidecar(job.meta);
  setChapters(sidecar?.chapters);

  if (job.audio) {
    const tmp = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    const buf = await decodeAudio(job.audio, tmp);
    await tmp.close();
    duration = buf.duration;
    setSpectrum(computeSpectrum(buf, { fps, bands }));
  }

  w.__duration = duration;

  // Trim leading/trailing dead air: the call starts at the first cue and ends
  // at the last, so silence/pauses before the first sentence and after the last
  // are cut automatically. A 1s buffer keeps a beat of breathing room before
  // the first word (and after the last). Falls back to the full audio when
  // there are no cues.
  const TRIM_LEAD_SEC = 1.0;
  let mainAudioOffsetSec = 0;
  let mainDurationSec = duration;
  if (cuesRef.length > 0 && duration > 0) {
    const firstStart = Math.min(...cuesRef.map((c) => c.start));
    const lastEnd = Math.max(...cuesRef.map((c) => c.end));
    mainAudioOffsetSec = Math.max(0, firstStart - TRIM_LEAD_SEC);
    const end = Math.min(duration, lastEnd + TRIM_LEAD_SEC);
    mainDurationSec = Math.max(0, end - mainAudioOffsetSec);
  }

  // Single source of truth for slide timing: the same timeline drives the
  // preview transport and the realtime driver's audio sizing. noSlides mode
  // (or a missing sidecar) collapses it to just the main segment.
  timeline = buildTimeline({
    meta: sidecar,
    mainDurationSec,
    mainAudioOffsetSec,
    includeSlides: !noSlides,
  });

  // Realtime-render driver reads these to size the concatenated audio
  // track + know when to stop screencast capture.
  (
    window as unknown as {
      __timings: {
        prerollMs: number;
        postrollMs: number;
        overlapSec: number;
        endFadeSec: number;
        introUrl?: string;
        outroUrl?: string;
        mainAudioUrl: string;
        mainDurationSec: number;
        mainAudioOffsetSec: number;
      };
    }
  ).__timings = {
    prerollMs: timeline.prerollMs,
    postrollMs: timeline.postrollMs,
    overlapSec: timeline.overlapSec,
    endFadeSec: timeline.endFadeSec,
    introUrl: sidecar?.intro,
    outroUrl: sidecar?.outro,
    mainAudioUrl: job.audio,
    // Trimmed main length + head-trim offset (cut dead air at head/tail).
    mainDurationSec: timeline.mainDurationSec,
    mainAudioOffsetSec: timeline.mainAudioOffsetSec,
  };
  seek(0);
}

export function boot(): void {
  if (showGuides) {
    document.getElementById("guides")?.classList.remove("hidden");
  }
  if (hasJob()) {
    w.__ready = init().then(() => {
      stageEl.classList.remove("unhydrated");
      loadingEl.classList.add("hidden");
    });
  } else {
    landingEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
    stageEl.classList.remove("unhydrated");
    w.__ready = Promise.resolve();
  }

  if (isPreview) {
    setupPreviewControls({
      ready: w.__ready!,
      get audioSrc() {
        return job?.audio ?? "";
      },
      seek,
      getJob: () => job,
      getSidecar: () => sidecar,
      getCues: () => cuesRef,
      getParticipants: () => getParticipants(),
      getTimeline: () =>
        timeline ??
        buildTimeline({
          meta: null,
          mainDurationSec: duration,
          includeSlides: false,
        }),
    });
  }
}
