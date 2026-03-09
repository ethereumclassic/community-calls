/**
 * Fetch YouTube auto-generated VTT transcripts for calls that don't have one.
 *
 * Usage:
 *   npx tsx scripts/fetch-transcripts.ts          # all calls
 *   npx tsx scripts/fetch-transcripts.ts 40       # single call
 *
 * Requires ~/yt-dlp binary.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const CALLS_DIR = join(import.meta.dirname!, "..", "calls");
const CACHE_DIR = join(import.meta.dirname!, ".vtt-cache");
const YT_DLP = process.env.YT_DLP ?? join(process.env.HOME!, "yt-dlp");

mkdirSync(CACHE_DIR, { recursive: true });

const filterNumber = process.argv[2];

// ── helpers ──

function toMs(ts: string): number {
  const [h, m, s] = ts.split(":");
  return parseInt(h) * 3600000 + parseInt(m) * 60000 + Math.round(parseFloat(s) * 1000);
}

interface Cue {
  start: string;
  end: string;
  text: string;
}

function cleanVtt(raw: string): Cue[] {
  const lines = raw.split("\n");
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes("-->")) i++;

  // YouTube auto-captions use two-line cues: line 1 is context (previous
  // text), line 2 is the new text with <c> word-timing tags.
  // Transition/freeze cues have ~10ms duration — skip those.
  // For real cues, take only line 2 (new content), strip <c> tags.
  const fragments: Cue[] = [];
  while (i < lines.length) {
    const m = lines[i].match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (m) {
      const start = m[1];
      const end = m[2];
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      // Skip transition frames (duration < 100ms)
      if (toMs(end) - toMs(start) < 100) continue;
      // Take only line 2 (new content); fall back to line 1 for single-line cues
      const contentLine = textLines.length >= 2 ? textLines[1] : textLines[0] ?? "";
      const text = contentLine
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text) fragments.push({ start, end, text });
    }
    i++;
  }

  // Concatenate all fragments into one stream, tracking timestamp per word
  interface Word { word: string; start: string; end: string; }
  const words: Word[] = [];
  for (const frag of fragments) {
    for (const w of frag.text.split(/\s+/).filter(Boolean)) {
      words.push({ word: w, start: frag.start, end: frag.end });
    }
  }

  // Split into sentences at . ? ! with a max duration fallback
  const MAX_CUE_MS = 20_000;
  const grouped: Cue[] = [];
  let sentence: Word[] = [];
  for (const w of words) {
    sentence.push(w);
    const duration = toMs(w.end) - toMs(sentence[0].start);
    const atSentenceEnd = /[.?!]$/.test(w.word) && sentence.length > 1;
    if (atSentenceEnd || duration >= MAX_CUE_MS) {
      grouped.push({
        start: sentence[0].start,
        end: w.end,
        text: sentence.map((s) => s.word).join(" "),
      });
      sentence = [];
    }
  }
  if (sentence.length) {
    grouped.push({
      start: sentence[0].start,
      end: sentence[sentence.length - 1].end,
      text: sentence.map((s) => s.word).join(" "),
    });
  }

  return grouped;
}

function formatVtt(cues: Cue[]): string {
  const out = ["WEBVTT", "", "NOTE no-names", ""];
  cues.forEach((cue, idx) => {
    out.push(String(idx + 1));
    out.push(`${cue.start} --> ${cue.end}`);
    out.push(cue.text);
    out.push("");
  });
  return out.join("\n");
}

// ── main ──

for (const file of readdirSync(CALLS_DIR).filter((f) => f.endsWith(".md"))) {
  const mdPath = join(CALLS_DIR, file);
  const content = readFileSync(mdPath, "utf-8");

  const numberMatch = content.match(/^number:\s*(\d+)/m);
  if (!numberMatch) continue;
  const number = numberMatch[1];

  if (filterNumber && number !== filterNumber) continue;

  // Skip calls with proper (speaker-named) VTT transcripts
  if (content.includes("```webvtt") && !content.includes("NOTE no-names")) {
    console.log(`[${number}] has proper transcript, skipping`);
    continue;
  }

  const ytMatch = content.match(/^youtube:\s*(\S+)/m);
  if (!ytMatch) {
    console.log(`[${number}] no youtube ID, skipping`);
    continue;
  }
  const ytid = ytMatch[1];

  const cachedVtt = join(CACHE_DIR, `${number}.en.vtt`);

  if (!existsSync(cachedVtt)) {
    console.log(`[${number}] downloading subs for ${ytid}...`);
    try {
      execSync(
        `"${YT_DLP}" --skip-download --write-auto-subs --sub-format vtt --sub-lang en ` +
          `-o "${CACHE_DIR}/${number}" "https://www.youtube.com/watch?v=${ytid}"`,
        { stdio: "pipe", timeout: 30_000 },
      );
    } catch (e: any) {
      console.error(`[${number}] FAILED: ${e.stderr?.toString().slice(0, 200)}`);
      continue;
    }
  } else {
    console.log(`[${number}] using cached VTT`);
  }

  let raw: string;
  try {
    raw = readFileSync(cachedVtt, "utf-8");
  } catch {
    console.log(`[${number}] no subtitle file produced`);
    continue;
  }

  const cues = cleanVtt(raw);
  if (!cues.length) {
    console.log(`[${number}] no cues after cleaning`);
    continue;
  }

  const vttBlock = formatVtt(cues);
  const transcriptSection = `\n---\n\n## Full Transcript\n\n\`\`\`webvtt\n${vttBlock}\`\`\`\n`;

  // Strip existing auto-generated transcript section if present, then append fresh
  const stripped = content.replace(/\n---\n\n## Full Transcript\n\n```webvtt\nWEBVTT\n\nNOTE no-names[\s\S]*?```\n?$/, "");
  writeFileSync(mdPath, stripped + transcriptSection);

  console.log(`[${number}] done — ${cues.length} cues`);
}
