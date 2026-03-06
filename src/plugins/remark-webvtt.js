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
  const cues = [];
  let i = 0;

  // Skip WEBVTT header and any blank lines
  while (i < lines.length && !lines[i].includes("-->")) i++;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
    );
    if (match) {
      const start = match[1];
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      const fullText = escapeHtml(textLines.join(" "));
      const speakerMatch = fullText.match(/^([^:]+):\s*(.*)/);
      cues.push({
        start: formatTimestamp(start),
        seconds: toSeconds(start),
        speaker: speakerMatch ? speakerMatch[1] : null,
        text: speakerMatch ? speakerMatch[2] : fullText,
      });
    }
    i++;
  }
  return cues;
}

function toSeconds(ts) {
  const parts = ts.split(":");
  return (
    parseInt(parts[0], 10) * 3600 +
    parseInt(parts[1], 10) * 60 +
    Math.floor(parseFloat(parts[2]))
  );
}

function formatTimestamp(ts) {
  const parts = ts.split(":");
  const h = parseInt(parts[0], 10);
  const s = parts[2].split(".")[0];
  if (h > 0) return `${h}:${parts[1]}:${s}`;
  return `${parseInt(parts[1], 10)}:${s}`;
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
