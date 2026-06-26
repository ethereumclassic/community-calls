// Centralised typed DOM handles for the /videogen page so other modules
// don't all repeat `document.getElementById` lookups. Module imports run
// after the deferred-by-default `<script type="module">` boundary, so the
// DOM is guaranteed to be parsed by the time we evaluate this file.

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

export const stageEl = $("stage");
export const loadingEl = $("loading");

export const titleEl = $("title");
export const callNumEl = $("call-num");
export const dateEl = $("date");

export const speakerCard = $("speaker-card");
export const speakerEl = $("speaker");
export const roleEl = $("role");
export const initialsEl = $("initials");
export const avatarEl = $<HTMLDivElement>("avatar");

export const rosterEl = $("roster");
export const subtitleEl = $("subtitle");

export const vizCanvas = $<HTMLCanvasElement>("viz");
export const vizCtx = vizCanvas.getContext("2d")!;
export const amaEl = $("ama");

export const jingleAudio = $<HTMLAudioElement>("jingle-audio");
export const fadeBlackEl = $("fade-black");

export const previewAudio = $<HTMLAudioElement>("preview-audio");
export const previewControls = $("preview-controls");
export const previewPlay = $<HTMLButtonElement>("preview-play");
export const previewRestart = $<HTMLButtonElement>("preview-restart");
export const previewScrub = $<HTMLInputElement>("preview-scrub");
export const previewTime = $("preview-time");
export const previewDownload = $<HTMLAnchorElement>("preview-download");

export const renderedPlayer = $("rendered-player");
export const renderedVideo = $<HTMLVideoElement>("rendered-video");

export const landingEl = $("landing");
