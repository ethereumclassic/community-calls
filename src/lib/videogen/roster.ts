import { rosterEl } from "./dom";
import { setAvatar } from "./avatar";
import type { Participant } from "./job";

// Stage geometry — kept here so the roster module owns all participant
// layout concerns in one place.
const STAGE_W = 1920;
const NATIVE_W = 240;
const VISUAL_STRIDE = 230;

// Row-layout numbers mirrored from videogen.css (.participant / .active) so
// the display-mode stack can be interpolated from exactly the state the CSS
// paints, and hand back to the CSS with no jump.
const ROW_SCALE = 0.4;
const ROW_ACTIVE_TY = 150;
const ROW_OPACITY = 0.55;

// Display-mode stack down the left edge: small avatars under the header logo,
// one per participant, the active one at full opacity with its name beside
// it. Positions are per index, so a speaker change never moves a card.
const STACK_X = 96; // left edge of the avatar column (matches .header left)
const STACK_TOP = -15; // relative to the roster's own top (200px)
const STACK_SCALE = 0.34; // 240px avatar -> ~82px
const STACK_STRIDE = 90;
// Non-speakers in the stack are dimmed by darkening, not by opacity, so the
// asset behind never shows through the avatar.
const STACK_DIM_BRIGHTNESS = 0.4;

let participants: Participant[] = [];
const participantCards = new Map<string, HTMLElement>();
const cardGeom = new Map<
  string,
  { idx: number; slotX: number; centerX: number }
>();
let activeName: string | null = null;
let stackDm = 0;
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
  cardGeom.clear();
  for (const [name, card] of participantCards) {
    const centre = firstCentre + idx * VISUAL_STRIDE;
    const slotX = centre - NATIVE_W / 2;
    const centerX = STAGE_W / 2 - centre;
    card.style.setProperty("--slot-x", `${slotX.toFixed(2)}px`);
    card.style.setProperty("--center-x", `${centerX.toFixed(2)}px`);
    cardGeom.set(name, { idx, slotX, centerX });
    idx++;
  }
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// Move the roster between its row layout (dm = 0, the CSS state) and the
// display-mode stack (dm = 1). Written inline per frame while dm > 0 so the
// move is a function of timeline time, not of a wall-clock CSS transition;
// at dm = 0 the inline styles are cleared and the CSS takes over again.
// nameAlpha fades the active speaker's name beside its stacked avatar.
export function setStackProgress(dm: number, nameAlpha: number): void {
  stackDm = dm;
  for (const [name, card] of participantCards) {
    const g = cardGeom.get(name);
    if (!g) continue;
    const pname = card.querySelector<HTMLElement>(".pname");
    if (dm <= 0) {
      card.style.transform = "";
      card.style.opacity = "";
      card.style.filter = "";
      card.style.transition = "";
      card.classList.remove("stacked");
      if (pname) {
        pname.style.opacity = "";
        pname.style.transition = "";
      }
      continue;
    }
    const active = name === activeName;
    // Row state, exactly as .participant / .participant.active paint it.
    const rowTx = active ? g.centerX : 0;
    const rowTy = active ? ROW_ACTIVE_TY : 0;
    const rowS = active ? 1 : ROW_SCALE;
    const rowO = active ? 1 : ROW_OPACITY;
    // Stack state: avatar centre at (STACK_X + r, top + idx * stride + r),
    // r being the scaled avatar radius. The card's transform origin is its
    // top-centre (x = 120), so translate relative to that.
    const r = (NATIVE_W / 2) * STACK_SCALE;
    const stackTx = STACK_X + r - (g.slotX + NATIVE_W / 2);
    const stackTy = STACK_TOP + g.idx * STACK_STRIDE;
    const stackS = STACK_SCALE;
    // Stacked cards are all opaque; the inactive ones are darkened instead.
    const stackO = 1;
    const stackB = active ? 1 : STACK_DIM_BRIGHTNESS;

    const tx = lerp(rowTx, stackTx, dm);
    const ty = lerp(rowTy, stackTy, dm);
    const sc = lerp(rowS, stackS, dm);
    const op = lerp(rowO, stackO, dm);
    const br = lerp(1, stackB, dm);
    card.style.transition =
      dm >= 1 ? "opacity 620ms ease, filter 620ms ease" : "none";
    card.style.transform = `translateX(${tx.toFixed(2)}px) translateY(${ty.toFixed(2)}px) scale(${sc.toFixed(4)})`;
    card.style.opacity = op.toFixed(3);
    card.style.filter = br >= 0.999 ? "" : `brightness(${br.toFixed(3)})`;
    card.classList.add("stacked");
    if (pname) {
      pname.style.transition = "none";
      pname.style.opacity = active ? nameAlpha.toFixed(3) : "0";
    }
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
  const exact = participants.find(
    (p) =>
      p.name.trim().toLowerCase() === lower ||
      p.aliases?.some((a) => a.trim().toLowerCase() === lower),
  );
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
  // In the stack the active card's opacity/name are inline, so a speaker
  // change has to be re-applied here rather than waiting for the next seek.
  if (stackDm > 0) setStackProgress(stackDm, stackDm >= 1 ? 1 : 0);
}
