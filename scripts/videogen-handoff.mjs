#!/usr/bin/env node
// Emit the end-of-pipeline handoff block for a finished call: the dev-server
// download URL for the rendered video, plus the title / summary / chapters /
// link to paste into YouTube after upload. Reuses the same chapter parsing as
// videogen-validate.mjs. Chapters are emitted YouTube-style (first line forced
// to 0:00, which YouTube requires).
//
// Usage: node scripts/videogen-handoff.mjs calls/<YYYYMMDD>_<NNN>.md [--port 4321]

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const argv = process.argv.slice(2);
const mdPath = argv.find((a) => !a.startsWith("--"));
const port = argv.includes("--port")
  ? argv[argv.indexOf("--port") + 1]
  : "4321";
if (!mdPath) {
  console.error("usage: videogen-handoff.mjs <call.md> [--port 4321]");
  process.exit(1);
}

const md = readFileSync(mdPath, "utf8");

// frontmatter
const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
const fm = fmMatch ? (parseYaml(fmMatch[1]) ?? {}) : {};
const num = fm.number;
const title = fm.description ?? "(untitled)";
const summary = (fm.summary ?? "").trim();
const yymmdd = String(fm.date ?? "")
  .replace(/-/g, "")
  .slice(2); // 2026-05-29 -> 260529

// chapters from the ```webvtt block
const vtt = md.match(/```webvtt[ \t]*\r?\n([\s\S]*?)\r?\n```/)?.[1] ?? "";
const lines = vtt.split("\n");
const chapters = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^NOTE\s+chapters\s*$/.test(lines[i].trim())) continue;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === "") break;
    const m = lines[j]
      .trim()
      .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/);
    if (m)
      chapters.push({
        start: (m[1] ? +m[1] : 0) * 3600 + +m[2] * 60 + +m[3],
        title: m[4],
      });
  }
  break;
}

const yt = (t) => {
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};
// YouTube requires the first chapter to be 0:00 (it covers the intro). Later
// chapters shift by `youtubeOffset` (the render's intro/preroll length) so they
// match the uploaded video's timeline, which opens with the intro slides before
// the recording starts — same offset the transcript YouTube links use.
const offset = Number(fm.youtubeOffset ?? 0);
const chapterLines = chapters
  .map((c, i) => `${i === 0 ? "0:00" : yt(c.start + offset)} ${c.title}`)
  .join("\n");

const file = `${yymmdd}-etccc-${num}.mp4`;
const out = [
  `video ready to download: http://localhost:${port}/${file}`,
  ``,
  `${title} - Ethereum Classic Community Call #${num}`,
  ``,
  summary,
  ``,
  chapterLines,
  ``,
  `https://cc.ethereumclassic.org/calls/${num}`,
  ``,
].join("\n");

console.log(out);
