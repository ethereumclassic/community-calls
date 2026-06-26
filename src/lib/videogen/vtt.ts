export type Cue = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};

const TIMESTAMP =
  /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/;

function toSeconds(
  h: string | undefined,
  m: string,
  s: string,
  ms: string | undefined,
): number {
  const ph = h ? parseInt(h, 10) : 0;
  const pm = parseInt(m, 10);
  const ps = parseInt(s, 10);
  const pms = ms ? parseInt(ms.padEnd(3, "0").slice(0, 3), 10) : 0;
  return ph * 3600 + pm * 60 + ps + pms / 1000;
}

export function parseVtt(input: string): Cue[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const cues: Cue[] = [];
  let i = 0;
  if (lines[i]?.trim().startsWith("WEBVTT")) i++;

  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;

    // Optional cue identifier line
    if (!lines[i].includes("-->") && lines[i + 1]?.includes("-->")) i++;

    const tsLine = lines[i];
    const m = TIMESTAMP.exec(tsLine);
    if (!m) {
      i++;
      continue;
    }
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    i++;

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      buf.push(lines[i]);
      i++;
    }
    const raw = buf.join("\n");
    const { speaker, text } = extractVoice(raw);
    cues.push({ start, end, speaker, text });
  }
  return cues;
}

function extractVoice(raw: string): { speaker?: string; text: string } {
  // <v Speaker Name>text</v> or <v Speaker>text
  const m = /^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/.exec(raw.trim());
  if (m) return { speaker: m[1].trim(), text: stripTags(m[2]).trim() };
  // "Speaker: text" fallback
  const colon = /^([A-Za-z][\w .'-]{0,40}):\s+([\s\S]+)$/.exec(raw.trim());
  if (colon) return { speaker: colon[1].trim(), text: colon[2].trim() };
  return { text: stripTags(raw).trim() };
}

function stripTags(s: string): string {
  return s.replace(/<\/?[^>]+>/g, "");
}

export function cueAt(cues: Cue[], t: number): Cue | undefined {
  // linear scan is fine for a single talk; sorted by start.
  for (let i = 0; i < cues.length; i++) {
    if (t < cues[i].start) return undefined;
    if (t < cues[i].end) return cues[i];
  }
  return undefined;
}

// The most recently-ended cue at-or-before time t. Used to "hold" the active
// speaker through brief silences so a half-second gap doesn't toggle them off
// the stage.
export function prevCue(cues: Cue[], t: number): Cue | undefined {
  let prev: Cue | undefined;
  for (const c of cues) {
    if (c.end <= t) prev = c;
    else break;
  }
  return prev;
}
