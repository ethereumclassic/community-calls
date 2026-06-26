import { visit } from "unist-util-visit";
// Single source of truth for the `NOTE chapters` format, shared with the
// runtime videogen endpoints (Vite/esbuild bundles this TS import into the
// config graph; the plugin is no longer loadable by bare Node).
import { parseChapters } from "../lib/videogen/chapters.ts";
import { resolveSpeaker } from "../lib/videogen/speakers.ts";

/**
 * Remark plugin that transforms ```webvtt code blocks into
 * a styled transcript view with timestamps and speaker labels.
 * Runs before Shiki so the code block is consumed before syntax highlighting.
 */
export default function remarkWebVtt() {
  return (tree, vfile) => {
    // Frontmatter is available on the vfile in Astro's remark pipeline
    const youtube = vfile.data?.astro?.frontmatter?.youtube;
    // Manual offset (seconds) added to every YouTube deep-link `&t=` so the
    // links land correctly in the uploaded video, which opens with the intro
    // the render prepends before the recording. Displayed timestamps stay on
    // the recording timeline; only the link target shifts. Defaults to 0.
    const youtubeOffset = vfile.data?.astro?.frontmatter?.youtubeOffset ?? 0;

    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "webvtt") return;

      const cues = parseWebVtt(node.value);
      if (!cues.length) return;

      // A `NOTE chapters` block (prepended by the videogen skill) upgrades the
      // flat transcript to a chaptered, collapsible one. Absent → unchanged
      // flat render, so existing calls are untouched.
      const chapters = parseChapters(node.value);
      const html = chapters.length
        ? renderChapteredTranscript(cues, chapters, youtube, youtubeOffset)
        : renderTranscript(cues, youtube, youtubeOffset);

      parent.children.splice(index, 1, {
        type: "html",
        value: html,
      });
    });
  };
}

function parseWebVtt(text) {
  const lines = text.split("\n");
  let i = 0;

  // Skip WEBVTT header
  if (lines[i]?.trim() === "WEBVTT") i++;

  // Parse optional NOTE comment for offset (e.g. "NOTE offset:-1427270")
  let offsetMs = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i]?.startsWith("NOTE")) {
    const noteLines = [lines[i]];
    i++;
    while (i < lines.length && lines[i].trim() !== "") {
      noteLines.push(lines[i]);
      i++;
    }
    const noteText = noteLines.join(" ");
    const offsetMatch = noteText.match(/offset:\s*(-?\d+)/);
    if (offsetMatch) offsetMs = parseInt(offsetMatch[1], 10);
  }

  // Skip to first cue
  while (i < lines.length && !lines[i].includes("-->")) i++;

  const cues = [];
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
    );
    if (match) {
      const rawStartMs = toMs(match[1]);
      const rawEndMs = toMs(match[2]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      const rawText = textLines.join(" ").trim();

      // [redacted] cues are cut from the video — accumulate their
      // duration as offset and skip them from the transcript.
      if (/^\[redacted\]$|:\s*\[redacted\]$/.test(rawText)) {
        offsetMs -= rawEndMs - rawStartMs;
        continue;
      }

      const startMs = rawStartMs + offsetMs;
      // Split speaker off the raw (unescaped) text so the speaker string can be
      // resolved against the registry verbatim (registry aliases hold the raw
      // Zoom name, e.g. "Cody Burns | >"). Escape the spoken text for output;
      // the speaker label is escaped at render time.
      const speakerMatch = rawText.match(/^([^:]+):\s*(.*)/);
      const seconds = Math.max(0, Math.floor(startMs / 1000));
      cues.push({
        start: formatMs(Math.max(0, startMs)),
        seconds,
        speaker: speakerMatch ? speakerMatch[1].trim() : null,
        text: escapeHtml(speakerMatch ? speakerMatch[2] : rawText),
      });
    }
    i++;
  }
  return cues;
}

function toMs(ts) {
  const parts = ts.split(":");
  return (
    parseInt(parts[0], 10) * 3600000 +
    parseInt(parts[1], 10) * 60000 +
    Math.round(parseFloat(parts[2]) * 1000)
  );
}

function formatMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Render the cue rows for a list of cues. Speaker labels collapse on
// consecutive same-speaker cues; prevSpeaker resets per call so each chapter
// starts with a fresh speaker label.
function renderCueRows(cues, youtube, youtubeOffset = 0) {
  let prevSpeaker = null;
  return cues
    .map((cue) => {
      const sameSpeaker = cue.speaker && cue.speaker === prevSpeaker;
      prevSpeaker = cue.speaker;

      let speaker = "";
      if (cue.speaker && !sameSpeaker) {
        const resolved = resolveSpeaker(cue.speaker);
        // Prefer the registry's canonical display name over the raw Zoom label
        // (e.g. "Cody Burns | >" → "Cody Burns"); fall back to the raw name.
        const name = escapeHtml(resolved?.displayName ?? cue.speaker);
        const avatar = resolved?.avatar
          ? `<img class="transcript-avatar" src="${resolved.avatar}" alt="" width="20" height="20" loading="lazy" />`
          : "";
        speaker = `<span class="transcript-speaker">${avatar}${name}</span>`;
      }
      const ts = sameSpeaker
        ? ""
        : `<span class="transcript-ts">${cue.start}</span>`;
      const inner = `${ts}${speaker}<span class="transcript-text">${cue.text}</span>`;

      if (youtube) {
        const url = `https://www.youtube.com/watch?v=${youtube}&amp;t=${cue.seconds + youtubeOffset}`;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="transcript-cue${sameSpeaker ? " transcript-cont" : ""}">${inner}</a>`;
      }
      return `<div class="transcript-cue${sameSpeaker ? " transcript-cont" : ""}">${inner}</div>`;
    })
    .join("\n");
}

function renderTranscript(cues, youtube, youtubeOffset = 0) {
  const rows = renderCueRows(cues, youtube, youtubeOffset);
  return `<div class="transcript-wrapper"><div class="transcript">\n${rows}\n</div></div>`;
}

// Chaptered transcript: each chapter is a collapsed <details> whose cues are
// the cues falling in [chapter.start, nextChapter.start). The timestamp is a
// YouTube deep-link; the title toggles the section. No JS required.
function renderChapteredTranscript(cues, chapters, youtube, youtubeOffset = 0) {
  // Sort by start so an out-of-order NOTE line can't misgroup cues. Cues before
  // the first chapter fall into it (the videogen skill anchors chapter 1 at
  // 0:00, so in practice there are none).
  const sorted = [...chapters].sort((a, b) => a.start - b.start);
  const groups = sorted.map(() => []);
  for (const cue of cues) {
    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].start <= cue.seconds) idx = i;
      else break;
    }
    groups[idx].push(cue);
  }

  const sections = sorted
    .map((ch, i) => {
      if (!groups[i].length) return ""; // don't render an empty chapter
      const rows = renderCueRows(groups[i], youtube, youtubeOffset);
      const tsLabel = formatMs(ch.start * 1000);
      const ts = youtube
        ? `<a class="chapter-ts" href="https://www.youtube.com/watch?v=${youtube}&amp;t=${ch.start + youtubeOffset}" target="_blank" rel="noopener noreferrer">${tsLabel}</a>`
        : `<span class="chapter-ts">${tsLabel}</span>`;
      const summary = `<summary class="chapter-summary">${ts}<span class="chapter-title">${escapeHtml(ch.title)}</span></summary>`;
      return `<details class="transcript-chapter">${summary}<div class="transcript">\n${rows}\n</div></details>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<div class="transcript-wrapper transcript-chaptered">\n${sections}\n</div>`;
}
