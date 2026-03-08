import { visit } from "unist-util-visit";

/**
 * Remark plugin that transforms ```webvtt code blocks into
 * a styled transcript view with timestamps and speaker labels.
 * Runs before Shiki so the code block is consumed before syntax highlighting.
 */
export default function remarkWebVtt() {
  return (tree, vfile) => {
    // Frontmatter is available on the vfile in Astro's remark pipeline
    const youtube = vfile.data?.astro?.frontmatter?.youtube;

    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "webvtt") return;

      const cues = parseWebVtt(node.value);
      if (!cues.length) return;

      const html = renderTranscript(cues, youtube);

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
      const fullText = escapeHtml(rawText);
      const speakerMatch = fullText.match(/^([^:]+):\s*(.*)/);
      const seconds = Math.max(0, Math.floor(startMs / 1000));
      cues.push({
        start: formatMs(Math.max(0, startMs)),
        seconds,
        speaker: speakerMatch ? speakerMatch[1] : null,
        text: speakerMatch ? speakerMatch[2] : fullText,
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

function renderTranscript(cues, youtube) {
  let prevSpeaker = null;
  const rows = cues
    .map((cue) => {
      const sameSpeaker = cue.speaker && cue.speaker === prevSpeaker;
      prevSpeaker = cue.speaker;

      const speaker =
        cue.speaker && !sameSpeaker
          ? `<span class="transcript-speaker">${cue.speaker}</span>`
          : "";
      const ts = sameSpeaker
        ? ""
        : `<span class="transcript-ts">${cue.start}</span>`;
      const inner = `${ts}${speaker}<span class="transcript-text">${cue.text}</span>`;

      if (youtube) {
        const url = `https://www.youtube.com/watch?v=${youtube}&amp;t=${cue.seconds}`;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="transcript-cue${sameSpeaker ? " transcript-cont" : ""}">${inner}</a>`;
      }
      return `<div class="transcript-cue${sameSpeaker ? " transcript-cont" : ""}">${inner}</div>`;
    })
    .join("\n");

  return `<div class="transcript">\n${rows}\n</div>`;
}
