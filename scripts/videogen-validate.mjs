#!/usr/bin/env node
// Validate a constructed videogen transcript: the ```webvtt fenced block inside
// a call markdown, plus its `NOTE chapters`. Mirrors the parsing in
// src/lib/videogen/{vtt,chapters}.ts (kept standalone so it runs under plain
// node, no Vite/TS loader). Used by the videogen skill as a gate after the
// transcript is constructed (Step 2) and after chapters are added (Step 3).
//
// Usage:
//   node scripts/videogen-validate.mjs calls/<YYYYMMDD>_<NNN>.md \
//     [--raw public/videogen/<NN>/<NN>-raw.vtt] [--max-chapters 10]
//
// Exit 0 = clean (warnings allowed), 1 = errors found / bad invocation.

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const args = process.argv.slice(2);
const mdPath = args.find((a) => !a.startsWith("--"));
const rawPath = argVal("--raw");
const maxChapters = Number(argVal("--max-chapters") ?? 10);

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

if (!mdPath) {
  console.error(
    "usage: videogen-validate.mjs <call.md> [--raw <raw.vtt>] [--max-chapters N]",
  );
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---- parsing (mirror of src/lib/videogen/{vtt,chapters}.ts) ----
const TIMESTAMP =
  /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/;

function toSeconds(h, m, s, ms) {
  return (
    (h ? +h : 0) * 3600 +
    +m * 60 +
    +s +
    (ms ? +ms.padEnd(3, "0").slice(0, 3) / 1000 : 0)
  );
}

function extractWebvtt(md) {
  const m = md.match(/```webvtt[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  return m ? m[1] : null;
}

// Parse cues, carrying the numeric id line and source-line for diagnostics.
function parseCues(vtt) {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const cues = [];
  let i = 0;
  if (lines[i]?.trim().startsWith("WEBVTT")) i++;
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;
    // NOTE blocks (incl. `NOTE chapters`) run until a blank line.
    if (/^NOTE(\s|$)/.test(lines[i].trim())) {
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }
    let id;
    if (!lines[i].includes("-->") && lines[i + 1]?.includes("-->")) {
      id = lines[i].trim();
      i++;
    }
    const m = TIMESTAMP.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    i++;
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "") buf.push(lines[i++]);
    const raw = buf.join("\n").trim();
    const colon = /^([A-Za-z][\w .'-]{0,40}):\s+([\s\S]+)$/.exec(raw);
    const speaker = colon ? colon[1].trim() : undefined;
    const text = colon ? colon[2].trim() : raw;
    cues.push({ id, start, end, speaker, text });
  }
  return cues;
}

function parseChapters(vtt) {
  const lines = vtt.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^NOTE\s+chapters\s*$/.test(lines[i].trim())) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") break;
      const m = lines[j]
        .trim()
        .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/);
      if (m)
        out.push({
          start: (m[1] ? +m[1] : 0) * 3600 + +m[2] * 60 + +m[3],
          title: m[4],
          line: lines[j].trim(),
        });
      else err(`chapter line not [h:]mm:ss Title: "${lines[j].trim()}"`);
    }
    return out;
  }
  return out;
}

function fmt(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = `${m}:${String(s).padStart(2, "0")}`;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : mm;
}

// ---- load ----
const md = readFileSync(mdPath, "utf8");
const vtt = extractWebvtt(md);
if (!vtt) {
  err("no ```webvtt fenced block found");
  report();
}
if (!/^\s*WEBVTT/.test(vtt))
  err("transcript does not start with WEBVTT header");

const cues = parseCues(vtt);
const chapters = parseChapters(vtt);
if (!cues.length) err("no cues parsed");

// ---- cue structural checks ----
let expectedId = 1;
let prevStart = -1;
const turnOpeners = new Set(); // cue start times that open a new speaker turn
let prevSpeaker = null;
for (const [idx, c] of cues.entries()) {
  const where = `cue ${c.id ?? idx + 1} @ ${fmt(c.start)}`;
  if (c.id !== undefined && c.id !== String(expectedId))
    warn(`${where}: cue id "${c.id}" out of sequence (expected ${expectedId})`);
  if (c.id !== undefined) expectedId = Number(c.id) + 1;
  else expectedId++;
  if (c.end < c.start) err(`${where}: end (${fmt(c.end)}) before start`);
  if (c.start < prevStart)
    err(`${where}: start goes backwards from ${fmt(prevStart)}`);
  prevStart = c.start;
  if (!c.text.trim()) err(`${where}: empty cue text`);
  // Semantic orphan/garble detection (e.g. a stray "bomb." cue) is the chunked
  // workflow's job, not this structural pass — kept out to keep signal high.
  if (c.speaker !== prevSpeaker) turnOpeners.add(c.start);
  prevSpeaker = c.speaker;
}

// ---- raw boundary parity (optional) ----
// Sentence-grouping (Step 2.6) merges adjacent same-speaker cues, so cleaned
// cues are a coarser partition of the SAME timeline — not a 1:1 copy. The
// invariant is therefore boundary-subset, not per-index equality: every cleaned
// block start/end must be a real raw boundary, and the run must cover the whole
// span. That proves grouping only *dropped* interior boundaries — it never
// invented a timestamp or lost an audio span.
if (rawPath) {
  const rawCues = parseCues(readFileSync(rawPath, "utf8"));
  const rawStarts = new Set(rawCues.map((c) => c.start));
  const rawEnds = new Set(rawCues.map((c) => c.end));
  // A cleaned boundary must be a real raw boundary OR fall strictly INSIDE a raw
  // cue. The latter is a deterministic sentence-split of a long cue (a multi-
  // sentence cue broken into one-sentence subtitles, with the split time
  // interpolated within the cue). Either way the boundary lies within real
  // audio — cleanup never invents a timestamp in a gap or drops a span.
  const insideRaw = (t) => rawCues.some((c) => t > c.start && t < c.end);
  const ok = (t) => rawStarts.has(t) || rawEnds.has(t) || insideRaw(t);
  for (const [i, c] of cues.entries()) {
    if (!ok(c.start))
      err(
        `block ${i + 1} @ ${fmt(c.start)}: start is not within any raw cue — cleanup must not invent timestamps`,
      );
    if (!ok(c.end))
      err(
        `block ${i + 1} @ ${fmt(c.start)}: end ${fmt(c.end)} is not within any raw cue`,
      );
  }
  if (rawCues.length && cues.length) {
    if (cues[0].start !== rawCues[0].start)
      err(
        `first block starts at ${fmt(cues[0].start)}, raw starts at ${fmt(rawCues[0].start)} — opening span dropped`,
      );
    if (cues[cues.length - 1].end !== rawCues[rawCues.length - 1].end)
      err(
        `last block ends at ${fmt(cues[cues.length - 1].end)}, raw ends at ${fmt(rawCues[rawCues.length - 1].end)} — closing span dropped`,
      );
  }
}

// ---- mid-sentence split check (the grouping rule's teeth) ----
// A same-speaker block that ends without sentence-ending punctuation and whose
// next block is the SAME speaker is a sentence cut that Step 2.6 should merge.
// An ellipsis is a valid terminal (a trailing-off is an intentional break, and
// the grouping treats it as one); only a block ending mid-word should warn.
const TERMINAL = /[.?!…]["'”’)\]]*$/;
const splits = [];
for (let i = 0; i < cues.length - 1; i++) {
  const a = cues[i],
    b = cues[i + 1];
  if (a.speaker && a.speaker === b.speaker && !TERMINAL.test(a.text.trim()))
    splits.push(`${fmt(a.start)} ${a.speaker}: …${a.text.trim().slice(-40)}`);
}
if (splits.length) {
  warn(
    `${splits.length} same-speaker block(s) end mid-sentence and continue in the next block — merge per Step 2.6. e.g.:`,
  );
  for (const s of splits.slice(0, 5)) warn(`    ${s}`);
}

// ---- speaker registry ----
try {
  const reg = parseYaml(readFileSync("speakers/speakers.yaml", "utf8")) ?? {};
  const known = new Set();
  for (const [key, rec] of Object.entries(reg))
    for (const n of [key, rec.displayName, ...(rec.aliases ?? [])])
      known.add(String(n).toLowerCase());
  const seen = new Map();
  for (const c of cues)
    if (c.speaker) seen.set(c.speaker, (seen.get(c.speaker) ?? 0) + 1);
  for (const [name, count] of seen)
    if (!known.has(name.toLowerCase()))
      warn(
        `speaker "${name}" (${count} cues) not in speakers.yaml — add as alias or new entry`,
      );
} catch {
  warn("speakers/speakers.yaml not readable — skipped speaker-label check");
}

// ---- chapter checks ----
if (chapters.length) {
  if (chapters.length > maxChapters)
    warn(`${chapters.length} chapters — aim for <= ${maxChapters}`);
  // Chapters are whole-second (mm:ss); cue starts carry ms. Match at second
  // granularity: a chapter aligns to the cue that begins within that second.
  const cueStarts = new Map();
  for (const c of cues)
    if (!cueStarts.has(Math.floor(c.start)))
      cueStarts.set(Math.floor(c.start), c);
  const turnFloors = new Set([...turnOpeners].map(Math.floor));
  let prev = -1;
  for (const ch of chapters) {
    if (ch.start <= prev)
      err(
        `chapter "${ch.title}" @ ${fmt(ch.start)} not after previous (${fmt(prev)})`,
      );
    prev = ch.start;
    const exact = cueStarts.get(ch.start);
    if (!exact) {
      // find nearest cue start to suggest a snap
      let nearest = cues[0];
      for (const c of cues)
        if (Math.abs(c.start - ch.start) < Math.abs(nearest.start - ch.start))
          nearest = c;
      err(
        `chapter "${ch.title}" @ ${fmt(ch.start)} does not match any cue start — nearest cue is ${fmt(nearest.start)} (${nearest.speaker ?? "?"}: "${nearest.text.slice(0, 50)}…"). Snap the boundary to a real cue.`,
      );
    } else if (!turnFloors.has(ch.start)) {
      warn(
        `chapter "${ch.title}" @ ${fmt(ch.start)} lands mid-turn (same speaker as prior cue: ${exact.speaker ?? "?"}). OK only if it is a deliberate host pivot; otherwise move it to a turn-opening cue.`,
      );
    }
  }
} else {
  warn("no `NOTE chapters` block (fine before Step 3; required after).");
}

report();

function report() {
  console.log(`\nvideogen-validate: ${mdPath}`);
  console.log(
    `  cues: ${cues?.length ?? 0}  chapters: ${chapters?.length ?? 0}`,
  );
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(`\n  ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
