// Slide deck: the title/TOC/summary/stats/thanks/logo full-canvas cards. This
// module owns how a slide is built (buildSlide) and how the overlay shows one
// at a time (setActiveSlide / hideSlideOverlay). It no longer owns *when*
// slides play — that's the timeline's job (see timeline.ts). The preview
// transport and the realtime driver both drive this off a single clock, so
// there are no more hard-coded pre/post-roll waits here.

import { fmtDateLong } from "./format";
import { renderSpeakerStats } from "./stats";
import { setAvatar } from "./avatar";
import { imageTransform } from "./display";
import { matchParticipant } from "./roster";
import type { Cue } from "./vtt";
import type { Participant, CallMeta } from "./job";
import type { Chapter, SidecarMeta } from "./sidecar";

const slidesEl = document.getElementById("slides")!;
const slidesInner = document.getElementById("slides-inner")!;

export type SlideKey =
  | "coldopen"
  | "hero"
  | "title"
  | "toc"
  | "stats"
  | "thanks"
  | "logo";

// Runtime list of valid keys, for validating untyped sources (e.g. a
// data-slide attribute) before they reach buildSlide's exhaustive switch.
export const SLIDE_KEYS: readonly SlideKey[] = [
  "coldopen",
  "hero",
  "title",
  "toc",
  "stats",
  "thanks",
  "logo",
];

// Everything any slide builder might need. Assembled once by the caller and
// handed to buildSlide so the registry stays a flat key -> element map.
export type SlideContext = {
  call?: CallMeta;
  hosts?: string[];
  chapters?: Chapter[];
  summary?: string;
  cues: Cue[];
  participants: Participant[];
  meta: SidecarMeta | null;
};

// OG-inspired chrome shared by every full-canvas slide: subtle SVG line
// pattern in the background, corner brackets, and a soft border frame. Static,
// so it's a module constant rather than rebuilt per slide.
const CHROME = `
    <div class="og-bg">
      <svg viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <path d="M0,540 L480,540 L557,346 L1363,346 L1440,540 L1920,540"
              stroke="#6fcf97" stroke-width="2" fill="none"/>
        <path d="M0,767 L326,767 L403,648 L730,648 L807,767 L1920,767"
              stroke="#6fcf97" stroke-width="2" fill="none"/>
      </svg>
    </div>
    <div class="og-border"></div>
    <div class="og-corner og-corner-tl"></div>
    <div class="og-corner og-corner-tr"></div>
    <div class="og-corner og-corner-bl"></div>
    <div class="og-corner og-corner-br"></div>`;

// Cold open: the highlight clip's still, full-bleed, with the speaker and the
// quoted words as a lower third. The call audio plays underneath (preview.ts);
// the still's slow zoom is driven from the transport via setColdOpenProgress
// so scrubbing and the realtime capture agree.
function coldOpenSlide(meta: SidecarMeta | null, cues: Cue[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-coldopen";
  const co = meta?.coldOpen;
  if (!co) return root;
  const inClip = cues.filter((c) => c.end > co.start && c.start < co.end);
  const speaker = inClip.find((c) => c.speaker)?.speaker;
  const who = matchParticipant(speaker);
  const quote = co.quote ?? inClip.map((c) => c.text).join(" ");
  root.innerHTML = `
    <img class="coldopen-img" src="${co.src}" alt="" />
    <div class="coldopen-shade"></div>
    <div class="coldopen-lower">
      ${who ? `<div class="coldopen-avatar"></div>` : ""}
      <div class="coldopen-text">
        ${who ? `<div class="coldopen-name">${who.name}</div>` : ""}
        ${quote ? `<blockquote class="coldopen-quote">“${quote}”</blockquote>` : ""}
      </div>
    </div>`;
  const av = root.querySelector<HTMLElement>(".coldopen-avatar");
  if (av && who) setAvatar(av, who);
  // The stage's own header (logo top left, #number/date/title top right),
  // copied from the live stage so it matches the call view exactly.
  const header = document.querySelector(".stage .header");
  if (header) {
    const copy = header.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    root.appendChild(copy);
  }
  return root;
}

// Zoom the mounted cold-open still to progress p (0..1 across the clip).
export function setColdOpenProgress(meta: SidecarMeta | null, p: number): void {
  const co = meta?.coldOpen;
  const img = slidesInner.querySelector<HTMLElement>(
    '.slide[data-key="coldopen"] .coldopen-img',
  );
  if (!co || !img) return;
  img.style.transform = imageTransform(
    { zoomFrom: co.zoomFrom, zoomTo: co.zoomTo, focus: co.focus },
    Math.min(1, Math.max(0, p)),
  );
}

// Brand opener — the landing-page hero (logo with glow/float, the big
// "Ethereum Classic / Community Calls" wordmark with the green glow, the
// subtitle) over a CRT scanline overlay. Reuses the global animation + glow
// utility classes (animate-float / animate-pulse-glow / text-glow) that the
// /videogen page already loads via index.css.
function heroSlide(): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-hero";
  root.innerHTML = `
    <div class="hero-grid"></div>
    <div class="hero-inner">
      <div class="hero-logo-wrap">
        <div class="hero-logo-glow"></div>
        <img class="hero-logo" src="/etc-logo.svg" alt="ETC" />
      </div>
      <h1 class="hero-title">
        <span>Ethereum Classic</span>
        <span class="text-glow">Community Calls</span>
      </h1>
      <p class="hero-sub">
        Regular open discussions about development,
        <span class="hero-link">ECIPs</span>, and the future of
        <span class="hero-link">Ethereum Classic</span>
      </p>
    </div>
    <div class="hero-scanlines"></div>`;
  return root;
}

// Episode card: #number/date, the title in green, and the "In this episode"
// summary, centred. Fonts match the main call view's header — mono meta,
// Instrument-Serif green title.
function titleSlide(
  call: CallMeta | undefined,
  summary: string | undefined,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-title og";
  root.innerHTML = `
    ${CHROME}
    <div class="og-content title-content">
      <div class="title-text">
        <div class="title-meta">
          ${call?.number != null ? `<span class="num">#${call.number}</span>` : ""}
          ${call?.date ? `<span class="date">${fmtDateLong(call.date)}</span>` : ""}
        </div>
        <h1 class="title-name">${call?.title ?? ""}</h1>
        ${summary ? `<p class="title-summary">${summary}</p>` : ""}
      </div>
    </div>`;
  return root;
}

function tocSlide(chapters: Chapter[] | undefined): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-toc og";
  // Just the chapter titles (no number, no timestamp), clamped to two lines.
  const items = (chapters ?? [])
    .map((c) => `<li><span class="title">${c.title}</span></li>`)
    .join("");
  root.innerHTML = `
    ${CHROME}
    <div class="og-content toc-content">
      <h2 class="og-heading toc-heading">Topics Discussed</h2>
      <ol class="toc-list">${items}</ol>
    </div>`;
  return root;
}

function statsSlide(cues: Cue[], participants: Participant[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-stats og";
  root.innerHTML = `
    ${CHROME}
    <div class="og-content">
      <div class="stats-body" id="stats-body"></div>
    </div>`;
  const body = root.querySelector<HTMLElement>("#stats-body")!;
  renderSpeakerStats(body, cues, participants);
  return root;
}

function thanksSlide(meta: SidecarMeta | null): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-thanks og";
  const url = meta?.episodeUrl ?? "cc.ethereumclassic.org";
  const display = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  root.innerHTML = `
    ${CHROME}
    <div class="og-content">
      <h2 class="og-heading">Thank you for watching</h2>
      <p class="thanks-body">For full show notes see</p>
      <div class="thanks-url">${display}</div>
    </div>`;
  return root;
}

function logoSlide(): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-logo og";
  root.innerHTML = `
    ${CHROME}
    <div class="og-stage logo-only">
      <div class="og-logo-wrap">
        <div class="og-logo-glow"></div>
        <img class="og-logo big" src="/etc-logo.svg" alt="ETC" />
      </div>
    </div>`;
  return root;
}

// Flat registry: key -> freshly built slide element. Adding a slide means
// adding one case here and one entry in timeline.ts — no make* wrapper, no
// second dispatch in the preview switch.
function buildSlide(key: SlideKey, ctx: SlideContext): HTMLElement {
  switch (key) {
    case "coldopen":
      return coldOpenSlide(ctx.meta, ctx.cues);
    case "hero":
      return heroSlide();
    case "title":
      return titleSlide(ctx.call, ctx.summary);
    case "toc":
      return tocSlide(ctx.chapters);
    case "stats":
      return statsSlide(ctx.cues, ctx.participants);
    case "thanks":
      return thanksSlide(ctx.meta);
    case "logo":
      return logoSlide();
  }
}

// ── Thumbnail ───────────────────────────────────────────────────────────────
// A YouTube thumbnail card, never on the video timeline: the cold-open still,
// the stage logo overlay, the episode number in white above the title, and
// the guest's face (the cold open's speaker). Shown fitted to the window at
// /videogen?...&slide=thumbnail, which is what gets captured at 1280x720.
export function thumbnailSlide(ctx: SlideContext): HTMLElement {
  const root = document.createElement("div");
  root.className = "slide-thumb";
  const co = ctx.meta?.coldOpen;
  const speaker = co
    ? ctx.cues.find((c) => c.end > co.start && c.start < co.end && c.speaker)
        ?.speaker
    : undefined;
  const who = matchParticipant(speaker);
  root.innerHTML = `
    ${co ? `<img class="thumb-bg" src="${co.src}" alt="" />` : ""}
    <div class="thumb-shade"></div>
    <div class="thumb-num">${ctx.call?.number != null ? `#${ctx.call.number}` : ""}</div>
    <h1 class="thumb-title">${ctx.call?.title ?? ""}</h1>
    ${who ? `<div class="thumb-face"></div>` : ""}`;
  const face = root.querySelector<HTMLElement>(".thumb-face");
  if (face && who) setAvatar(face, who);
  // The stage's own logo overlay (logo + "Ethereum Classic / Community
  // Calls"), copied from the live stage like the cold open's header. Only the
  // left half: the right half would repeat the number and title.
  const left = document.querySelector(".stage .header .left");
  if (left) {
    const header = document.createElement("div");
    header.className = "header thumb-header";
    header.appendChild(left.cloneNode(true));
    root.appendChild(header);
  }
  return root;
}

// ── Gallery ─────────────────────────────────────────────────────────────────
// Every slide at once, scaled down, for the preview page: the timeline's
// slides in order, plus the cold open rebuilt over each candidate still so
// they can be compared side by side.
const GALLERY_SCALE = 0.25;

function galleryCard(label: string, el: HTMLElement): HTMLElement {
  const card = document.createElement("figure");
  card.className = "gallery-card";
  const frame = document.createElement("div");
  frame.className = "gallery-frame";
  const inner = document.createElement("div");
  inner.className = "gallery-scale";
  inner.style.transform = `scale(${GALLERY_SCALE})`;
  el.classList.add("slide", "visible");
  inner.appendChild(el);
  frame.appendChild(inner);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  card.append(frame, cap);
  return card;
}

export function renderSlideGallery(
  container: HTMLElement,
  keys: SlideKey[],
  ctx: SlideContext,
): void {
  container.innerHTML = "";
  const meta = ctx.meta;
  const co = meta?.coldOpen;
  for (const key of keys) {
    if (key === "coldopen" && co) {
      const current = co.src.split("/").pop() ?? co.src;
      const stills = meta?.coldOpenCandidates?.length
        ? meta.coldOpenCandidates
        : [{ src: co.src }];
      for (const still of stills) {
        const name = still.src.split("/").pop() ?? still.src;
        // The card is a quarter size, so the thumbnail is plenty.
        const src = still.thumb ?? still.src;
        const m = { ...meta, coldOpen: { ...co, src } };
        const el = buildSlide("coldopen", { ...ctx, meta: m });
        const card = galleryCard(
          `cold open · ${name}${name === current ? " (chosen)" : ""}`,
          el,
        );
        if (name === current) card.classList.add("chosen");
        container.appendChild(card);
      }
      continue;
    }
    container.appendChild(galleryCard(key, buildSlide(key, ctx)));
  }
}

// ── Overlay manager ─────────────────────────────────────────────────────────
// Shows exactly one slide on the full-bleed overlay and cross-fades when the
// key changes. Idempotent: safe to call setActiveSlide(sameKey) or
// hideSlideOverlay() every animation frame.

let mountedKey: SlideKey | null = null;
let overlayShown = false;

// makeCtx is a factory so the (potentially non-trivial) slide context is only
// built when the slide actually changes, not on every animation frame.
export function setActiveSlide(
  key: SlideKey,
  makeCtx: () => SlideContext,
): void {
  if (!overlayShown) {
    slidesEl.classList.remove("hidden");
    overlayShown = true;
  }
  if (key === mountedKey) return;
  mountedKey = key;

  const el = buildSlide(key, makeCtx());
  el.classList.add("slide");
  el.dataset.key = key;
  slidesInner.appendChild(el);
  requestAnimationFrame(() => {
    // Replaced before this frame (hideSlideOverlay + another slide): leave the
    // newer slide alone rather than fading it out as one of "the others".
    if (!el.isConnected) return;
    el.classList.add("visible");
    for (const child of Array.from(slidesInner.children)) {
      if (child !== el) {
        (child as HTMLElement).classList.remove("visible");
        setTimeout(() => child.remove(), 700);
      }
    }
  });
}

export function hideSlideOverlay(): void {
  if (!overlayShown) return;
  overlayShown = false;
  mountedKey = null;
  slidesEl.classList.add("hidden");
  slidesInner.innerHTML = "";
}

// Opacity of the whole overlay (its opaque backdrop included), driven by the
// transport so the slide deck cross-fades onto/off the live stage at the
// pre-roll -> call and call -> post-roll boundaries instead of cutting. Called
// every animation frame; only touches the DOM when the value actually changes
// (it's a constant 1 across the bulk of every slide).
let overlayOpacity = -1;
export function setOverlayOpacity(o: number): void {
  if (o === overlayOpacity) return;
  overlayOpacity = o;
  slidesEl.style.opacity = String(o);
}
