import { rosterEl } from "./dom";
import { setAvatar } from "./avatar";
import type { Participant } from "./job";

// Stage geometry — kept here so the roster module owns all participant
// layout concerns in one place.
const STAGE_W = 1920;
const NATIVE_W = 240;
const VISUAL_STRIDE = 230;

let participants: Participant[] = [];
const participantCards = new Map<string, HTMLElement>();
let activeName: string | null = null;
// Cache speaker-string -> participant: matchParticipant runs per cue (stats)
// and per frame (subtitle) over a handful of distinct speaker strings.
const matchCache = new Map<string, Participant | undefined>();

export function getParticipants(): Participant[] {
  return participants;
}

export function renderRoster(ps: Participant[]) {
  participants = ps;
  rosterEl.innerHTML = "";
  participantCards.clear();
  matchCache.clear();
  for (const p of ps) {
    const card = document.createElement("div");
    card.className = "participant";
    card.dataset.name = p.name;

    const av = document.createElement("div");
    av.className = "avatar-circle";
    setAvatar(av, p);
    card.appendChild(av);

    const name = document.createElement("div");
    name.className = "pname";
    name.textContent = p.name;
    card.appendChild(name);

    rosterEl.appendChild(card);
    participantCards.set(p.name, card);
  }
  layoutSlots(ps.length);
}

// Evenly-spaced absolute slots across the stage. Card width = 240px (the
// active state). Each card's centre is at firstCentre + i × VISUAL_STRIDE;
// --slot-x is the card's `left` and --center-x compensates so the active
// state translates back to the canvas centre.
function layoutSlots(n: number) {
  const totalStride = VISUAL_STRIDE * (n - 1);
  const firstCentre = STAGE_W / 2 - totalStride / 2;
  let idx = 0;
  for (const card of participantCards.values()) {
    const centre = firstCentre + idx * VISUAL_STRIDE;
    card.style.setProperty(
      "--slot-x",
      `${(centre - NATIVE_W / 2).toFixed(2)}px`,
    );
    card.style.setProperty(
      "--center-x",
      `${(STAGE_W / 2 - centre).toFixed(2)}px`,
    );
    idx++;
  }
}

// Match a VTT cue speaker name against the roster. Exact (case-insensitive)
// wins; otherwise compare on the first word so "Istora" in the roster
// matches "Istora Mandiri" in the cue.
export function matchParticipant(
  speaker: string | undefined,
): Participant | undefined {
  if (!speaker) return undefined;
  if (matchCache.has(speaker)) return matchCache.get(speaker);
  const m = resolveParticipant(speaker);
  matchCache.set(speaker, m);
  return m;
}

function resolveParticipant(speaker: string): Participant | undefined {
  const lower = speaker.trim().toLowerCase();
  const first = lower.split(/\s+/)[0];
  const exact = participants.find((p) => p.name.trim().toLowerCase() === lower);
  if (exact) return exact;
  return participants.find((p) => {
    const pl = p.name.trim().toLowerCase();
    // First-word match, or the roster name is a whole-word prefix of the cue
    // speaker. The trailing space avoids "Ed" matching "Edward".
    return pl.split(/\s+/)[0] === first || lower.startsWith(pl + " ");
  });
}

export function setActive(p: Participant | undefined) {
  const name = p?.name ?? null;
  if (name === activeName) return;
  activeName = name;
  for (const [n, card] of participantCards) {
    card.classList.toggle("active", n === name);
  }
}
