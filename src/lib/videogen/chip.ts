// Segmented chapter timeline at the bottom of the stage. Done and future
// chapters are 10px-wide pills; the current chapter expands to fill the
// remaining track but keeps the same 10px height — only width changes.
// The current chapter's title sits on the line above and cross-fades when
// the active chapter changes.

import { chapterAt, chapterIndex, type Chapter } from "./sidecar";

const barEl = document.getElementById("chip")!;
const labelEl = document.getElementById("chip-title")!;
const trackEl = document.getElementById("chip-track")!;

let chapters: Chapter[] | undefined = undefined;
let segments: HTMLElement[] = [];
let fills: HTMLElement[] = [];
let activeIdx = -2; // -1 used for "before first chapter"
let labelText = "";

export function setChapters(c: Chapter[] | undefined): void {
  chapters = c;
  trackEl.innerHTML = "";
  segments = [];
  fills = [];
  labelEl.textContent = "";
  labelEl.classList.remove("visible");
  activeIdx = -2;
  labelText = "";
  if (!c || c.length === 0) {
    barEl.classList.remove("visible");
    return;
  }
  for (let i = 0; i < c.length; i++) {
    const seg = document.createElement("div");
    seg.className = "chapter-segment future";
    seg.dataset.idx = String(i);
    const fill = document.createElement("div");
    fill.className = "chapter-fill";
    seg.appendChild(fill);
    trackEl.appendChild(seg);
    segments.push(seg);
    fills.push(fill);
  }
  barEl.classList.add("visible");
}

function setLabel(text: string): void {
  if (text === labelText) return;
  labelText = text;
  if (text) {
    // Quick cross-fade: drop the old label, swap, fade the new in.
    labelEl.classList.remove("visible");
    setTimeout(() => {
      labelEl.textContent = text;
      requestAnimationFrame(() => labelEl.classList.add("visible"));
    }, 160);
  } else {
    labelEl.classList.remove("visible");
  }
}

export function updateChip(t: number): void {
  if (!chapters) return;
  const idx = chapterIndex(chapters, t);

  if (idx !== activeIdx) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      seg.classList.toggle("done", idx >= 0 && i < idx);
      seg.classList.toggle("current", i === idx);
      seg.classList.toggle("future", idx < 0 ? true : i > idx);
    }
    setLabel(idx >= 0 ? chapters[idx].title : "");
    // Match the .chapter-segment + .chapter-track CSS (10px segments,
    // 8px gap) so the label slides right with the current chapter.
    const SEG_W = 10;
    const GAP = 8;
    labelEl.style.setProperty(
      "--label-x",
      `${Math.max(0, idx) * (SEG_W + GAP)}px`,
    );
    activeIdx = idx;
  }

  if (idx >= 0) {
    const c = chapterAt(chapters, t)!;
    const span = Math.max(0.001, c.end - c.start);
    const elapsed = Math.max(0, Math.min(span, t - c.start));
    fills[idx].style.width = `${(elapsed / span) * 100}%`;
  }
}
