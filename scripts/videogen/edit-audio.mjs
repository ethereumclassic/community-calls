#!/usr/bin/env node
// Edit a call's audio before rendering: cut hand-picked spans (trolls, false
// starts) and shorten long silent gaps, then write everything downstream on
// the edited clock.
//
//   node scripts/videogen/edit-audio.mjs <NN> --recording <file> [--vtt <in.vtt>]
//   node scripts/videogen/edit-audio.mjs <NN> --dry-run --recording <file>
//
// Reads the `edit:` section of calls/video/<id>.yaml:
//
//   edit:
//     cuts:                   # recording clock, [h:]mm:ss[.ms]
//       - { from: "10:15.3", to: "10:58.85" }
//     silence:                # optional; only gaps >= minGapSec are touched
//       minGapSec: 2          # a pause this long or longer is shortened...
//       keepSec: 0.75         # ...to this long (half kept either side)
//       thresholdDb: -40      # below this level counts as silence
//
// Writes:
//   public/videogen/<NN>/<NN>-audio.mp3   the distributable audio, edited
//   transcripts/<id>.edited.vtt           the transcript (--vtt, default the
//                                         diarized one if present) re-timed
//                                         onto the edited clock; cues inside
//                                         a cut are dropped
//   calls/video/<id>.map.json             kept spans, recording -> edited, so
//                                         times in calls/video/<id>.yaml stay
//                                         on the recording clock (video-file.ts
//                                         maps them)

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FF =
  process.env.FFMPEG ?? createRequire(import.meta.url)("ffmpeg-static");

const args = process.argv.slice(2);
const nnArg = args.find((a) => /^\d+$/.test(a));
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const recording = opt("recording");
if (!nnArg || !recording) {
  console.error(
    "usage: edit-audio.mjs <NN> --recording <file> [--vtt <in.vtt>] [--dry-run]",
  );
  process.exit(2);
}
const nn = String(parseInt(nnArg, 10));
const mdName = readdirSync(join(ROOT, "calls")).find((f) =>
  f.endsWith(`_${nn.padStart(3, "0")}.md`),
);
if (!mdName) throw new Error(`no calls/*_${nn.padStart(3, "0")}.md`);
const id = mdName.replace(/\.md$/, "");

const videoFile = join(ROOT, "calls/video", `${id}.yaml`);
const edit = existsSync(videoFile)
  ? parseYaml(readFileSync(videoFile, "utf8"))?.edit
  : undefined;
if (!edit) throw new Error(`calls/video/${id}.yaml has no edit: section`);

function parseClock(s) {
  const m = String(s)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`bad time "${s}" (want [h:]mm:ss[.ms])`);
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
  return (m[1] ? +m[1] : 0) * 3600 + +m[2] * 60 + +m[3] + ms / 1000;
}
const fmt = (x) => {
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${(x % 60).toFixed(3).padStart(6, "0")}`;
};

// Recording duration.
const probe = spawnSync(FF, ["-i", recording], { encoding: "utf8" }).stderr;
const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
if (!dm) throw new Error(`cannot read duration of ${recording}`);
const duration = +dm[1] * 3600 + +dm[2] * 60 + +dm[3];

// Spans to remove, on the recording clock.
const removals = (edit.cuts ?? []).map((c) => ({
  start: parseClock(c.from),
  end: parseClock(c.to),
  why: "cut",
}));

let gaps = [];
if (edit.silence) {
  const { minGapSec = 2, keepSec = 0.75, thresholdDb = -40 } = edit.silence;
  if (keepSec >= minGapSec)
    throw new Error("silence.keepSec must be below minGapSec");
  const out = spawnSync(
    FF,
    [
      "-hide_banner",
      "-i",
      recording,
      "-vn",
      "-ac",
      "1",
      "-af",
      `silencedetect=n=${thresholdDb}dB:d=${minGapSec}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  ).stderr;
  let s = null;
  for (const line of out.split("\n")) {
    const a = /silence_start: ([\d.]+)/.exec(line);
    const b = /silence_end: ([\d.]+)/.exec(line);
    if (a) s = +a[1];
    if (b && s != null) {
      gaps.push({ start: s, end: +b[1] });
      s = null;
    }
  }
  // Leave the head and tail alone: the renderer already trims dead air there
  // from the first and last cue.
  gaps = gaps.filter((g) => g.start > 0.5 && g.end < duration - 0.5);
  for (const g of gaps)
    removals.push({
      start: g.start + keepSec / 2,
      end: g.end - keepSec / 2,
      why: "silence",
    });
}

// Merge overlapping removals, then the kept spans are the complement.
removals.sort((a, b) => a.start - b.start);
const merged = [];
for (const r of removals) {
  const last = merged[merged.length - 1];
  if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
  else merged.push({ ...r });
}
const kept = [];
let cursor = 0;
let editedAt = 0;
for (const r of merged) {
  if (r.start > cursor) {
    kept.push({ from: cursor, to: r.start, at: editedAt });
    editedAt += r.start - cursor;
  }
  cursor = Math.max(cursor, r.end);
}
if (cursor < duration) {
  kept.push({ from: cursor, to: duration, at: editedAt });
  editedAt += duration - cursor;
}

const removedCut = merged
  .filter((r) => r.why === "cut")
  .reduce((s, r) => s + r.end - r.start, 0);
const removedTotal = duration - editedAt;
console.log(
  `recording ${fmt(duration)} -> edited ${fmt(editedAt)} (-${removedTotal.toFixed(1)}s)`,
);
console.log(
  `  cuts: ${(edit.cuts ?? []).length} span(s), ${removedCut.toFixed(1)}s`,
);
if (edit.silence) {
  console.log(
    `  silence: ${gaps.length} gap(s) >= ${edit.silence.minGapSec ?? 2}s, ${(removedTotal - removedCut).toFixed(1)}s saved`,
  );
  const longest = [...gaps]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, 8);
  for (const g of longest)
    console.log(`    ${fmt(g.start)}  ${(g.end - g.start).toFixed(2)}s`);
}

// Recording time -> edited time (a time inside a removal maps to its start).
function mapTime(t) {
  for (const k of kept) {
    if (t < k.from) return k.at;
    if (t <= k.to) return k.at + (t - k.from);
  }
  return editedAt;
}

if (dryRun) process.exit(0);

// Audio: keep the spans with aselect (joins land in silence or at a cut).
const audioOut = join(ROOT, "public/videogen", nn, `${nn}-audio.mp3`);
mkdirSync(dirname(audioOut), { recursive: true });
const expr = kept
  .map((k) => `between(t,${k.from.toFixed(3)},${k.to.toFixed(3)})`)
  .join("+");
execFileSync(
  FF,
  [
    "-v",
    "error",
    "-y",
    "-i",
    recording,
    "-vn",
    "-af",
    `aselect='${expr}',asetpts=N/SR/TB`,
    "-ac",
    "1",
    "-b:a",
    "64k",
    audioOut,
  ],
  { stdio: "inherit" },
);

// Transcript: re-time cues; drop any that fall wholly inside a removal.
const vttIn =
  opt("vtt") ??
  [`transcripts/${id}.diarized.vtt`, `transcripts/${id}.vtt`]
    .map((p) => join(ROOT, p))
    .find(existsSync);
if (vttIn) {
  const blocks = readFileSync(vttIn, "utf8")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\n+/);
  const cues = [];
  for (const b of blocks.slice(1)) {
    const lines = b.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split("-->").map((x) => x.trim().split(/\s+/)[0]);
    const toSec = (s) => {
      const p = s.split(":").map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const start = toSec(a);
    const end = toSec(z);
    const ns = mapTime(start);
    const ne = mapTime(end);
    if (ne - ns < 0.05) continue; // swallowed by a cut
    cues.push(
      `${cues.length + 1}\n${fmt(ns)} --> ${fmt(ne)}\n${lines.slice(ti + 1).join("\n")}`,
    );
  }
  const vttOut = join(ROOT, "transcripts", `${id}.edited.vtt`);
  writeFileSync(vttOut, `WEBVTT\n\n${cues.join("\n\n")}\n`);
  console.log(
    `transcript: ${cues.length} cues -> ${vttOut.replace(ROOT + "/", "")}`,
  );
}

const mapOut = join(ROOT, "calls/video", `${id}.map.json`);
writeFileSync(
  mapOut,
  JSON.stringify(
    {
      note: "Kept spans of the recording: [from, to] on the recording clock play at `at` on the edited clock. Written by scripts/videogen/edit-audio.mjs.",
      recordingSec: +duration.toFixed(3),
      editedSec: +editedAt.toFixed(3),
      kept: kept.map((k) => [
        +k.from.toFixed(3),
        +k.to.toFixed(3),
        +k.at.toFixed(3),
      ]),
    },
    null,
    1,
  ) + "\n",
);
console.log(
  `audio: ${audioOut.replace(ROOT + "/", "")}\nmap: ${mapOut.replace(ROOT + "/", "")}`,
);
