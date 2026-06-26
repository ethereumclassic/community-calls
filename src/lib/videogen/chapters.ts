// Pulls the transcript + chapters out of a call markdown body. The transcript
// is the ```webvtt fenced block; chapters are the `NOTE chapters` lines inside
// it. This is the runtime (endpoint) counterpart to the build-time parsing in
// src/plugins/remark-webvtt.js — both read the same `NOTE chapters` format.

type RawChapter = { title: string; start: number };

// Extract the first ```webvtt fenced block's contents from a markdown string.
// Tolerates CRLF line endings (a Windows-edited markdown file).
export function extractWebvtt(markdown: string): string | null {
  const m = markdown.match(/```webvtt[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  return m ? m[1] : null;
}

// Parse `NOTE chapters` lines ([h:]mm:ss title) into { start (seconds), title }.
export function parseChapters(vtt: string): RawChapter[] {
  const lines = vtt.split("\n");
  const chapters: RawChapter[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^NOTE\s+chapters\s*$/.test(lines[i].trim())) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") break;
      const m = lines[j]
        .trim()
        .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/);
      if (m) {
        const h = m[1] ? parseInt(m[1], 10) : 0;
        chapters.push({
          start: h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10),
          title: m[4],
        });
      }
    }
    break;
  }
  return chapters;
}
