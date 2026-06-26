// Speaker-time donut. Walks the cues, attributes each cue's duration to its
// matched participant, renders a donut + avatar pins around the ring +
// legend.

import type { Cue } from "./vtt";
import type { Participant } from "./job";
import { matchParticipant } from "./roster";
import { setAvatar } from "./avatar";

const SVG_NS = "http://www.w3.org/2000/svg";

const COLOURS = [
  "#7aeea8",
  "#a0ffc8",
  "#5ac488",
  "#3a8e60",
  "#c8e8d8",
  "#88b8a0",
  "#a8d8b8",
  "#608878",
];

type Slice = {
  participant: Participant;
  secs: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  colour: string;
};

function computeSlices(cues: Cue[], participants: Participant[]): Slice[] {
  const totals = new Map<string, number>();
  for (const p of participants) totals.set(p.name, 0);
  for (const c of cues) {
    const p = matchParticipant(c.speaker);
    if (!p) continue;
    const dur = Math.max(0, c.end - c.start);
    totals.set(p.name, (totals.get(p.name) ?? 0) + dur);
  }
  const grand = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  if (grand <= 0) return [];

  const slices: Slice[] = [];
  const byTotal = participants
    .map((p) => ({ p, secs: totals.get(p.name) ?? 0 }))
    .filter((s) => s.secs > 0)
    .sort((a, b) => b.secs - a.secs);

  let angle = -Math.PI / 2; // start at 12 o'clock
  let colourIdx = 0;
  for (const { p, secs } of byTotal) {
    const sweep = (secs / grand) * 2 * Math.PI;
    slices.push({
      participant: p,
      secs,
      startAngle: angle,
      endAngle: angle + sweep,
      midAngle: angle + sweep / 2,
      colour: COLOURS[colourIdx % COLOURS.length],
    });
    angle += sweep;
    colourIdx++;
  }
  return slices;
}

export function renderSpeakerStats(
  container: HTMLElement,
  cues: Cue[],
  participants: Participant[],
): void {
  const slices = computeSlices(cues, participants);

  container.innerHTML = "";

  const chart = document.createElement("div");
  chart.className = "stats-chart";
  container.appendChild(chart);

  // Text-free speaker-time ring: a solid donut split into per-speaker wedges by
  // radial divider lines, with each speaker's avatar sitting outside the ring
  // and a little arrow pointing in to their wedge. No totals, no labels.
  const SIZE = 720;
  const c = SIZE / 2;
  const R = 165; // ring centreline radius
  const STROKE = 50;
  const Rin = R - STROKE / 2;
  const Rout = R + STROKE / 2;
  const C = 2 * Math.PI * R;
  const AVATAR = 84;
  const R_AV = 310; // avatar centre radius (outside the ring)

  const svgWrap = document.createElement("div");
  svgWrap.className = "stats-svg-wrap";
  svgWrap.style.width = `${SIZE}px`;
  svgWrap.style.height = `${SIZE}px`;
  chart.appendChild(svgWrap);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svgWrap.appendChild(svg);

  // 1) Solid ring: each wedge is a dash sized to its sweep, butted against the
  //    next (the divider lines provide the separation).
  let offset = 0;
  for (const s of slices) {
    const dash = ((s.endAngle - s.startAngle) / (2 * Math.PI)) * C;
    const arc = document.createElementNS(SVG_NS, "circle");
    arc.setAttribute("cx", String(c));
    arc.setAttribute("cy", String(c));
    arc.setAttribute("r", String(R));
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", s.colour);
    arc.setAttribute("stroke-width", String(STROKE));
    arc.setAttribute("stroke-linecap", "butt");
    arc.setAttribute("stroke-dasharray", `${dash} ${C - dash}`);
    arc.setAttribute("stroke-dashoffset", String(-offset));
    arc.setAttribute("transform", `rotate(-90 ${c} ${c})`);
    svg.appendChild(arc);
    offset += dash;
  }

  // 2) Radial divider lines dissecting the ring at every wedge boundary.
  for (const s of slices) {
    const a = s.startAngle;
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", String(c + (Rin - 3) * Math.cos(a)));
    ln.setAttribute("y1", String(c + (Rin - 3) * Math.sin(a)));
    ln.setAttribute("x2", String(c + (Rout + 3) * Math.cos(a)));
    ln.setAttribute("y2", String(c + (Rout + 3) * Math.sin(a)));
    ln.setAttribute("stroke", "var(--color-void, #0a0a0c)");
    ln.setAttribute("stroke-width", "6");
    svg.appendChild(ln);
  }

  // 3) Per speaker: a connector line from the avatar in to its wedge, then the
  //    avatar. Just a line (no arrowhead) tipping just outside the ring.
  for (const s of slices) {
    const a = s.midAngle;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(c + (R_AV - AVATAR / 2 - 4) * cosA));
    line.setAttribute("y1", String(c + (R_AV - AVATAR / 2 - 4) * sinA));
    line.setAttribute("x2", String(c + (Rout + 4) * cosA));
    line.setAttribute("y2", String(c + (Rout + 4) * sinA));
    line.setAttribute("stroke", s.colour);
    line.setAttribute("stroke-width", "3");
    svg.appendChild(line);

    // Avatar pin outside the ring.
    const ax = c + R_AV * cosA;
    const ay = c + R_AV * sinA;
    const pin = document.createElement("div");
    pin.className = "stats-pin";
    pin.style.width = `${AVATAR}px`;
    pin.style.height = `${AVATAR}px`;
    pin.style.left = `${ax - AVATAR / 2}px`;
    pin.style.top = `${ay - AVATAR / 2}px`;
    pin.style.borderColor = s.colour;
    setAvatar(pin, s.participant);
    svgWrap.appendChild(pin);
  }
}
