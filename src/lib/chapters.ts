// Parses the `NOTE chapters` lines out of a call transcript's ```webvtt block.
// A chapter list (prepended to the WEBVTT) upgrades the flat transcript on the
// call page to a chaptered, collapsible one. Consumed by the build-time
// remark-webvtt plugin (src/plugins/remark-webvtt.js).

type RawChapter = { title: string; start: number };

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
