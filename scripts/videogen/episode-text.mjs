// The YouTube-facing text for a call, built from its markdown: the video title
// and the description (summary, chapters on the video clock, the call-page
// link, then the frontmatter's `youtubeLinks` lines). Shared by
// videogen-handoff.mjs (prints it) and videogen/youtube.mjs (sets it), so the
// two can never disagree.

import { parse as parseYaml } from "yaml";

export function parseCallMarkdown(md) {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? (parseYaml(fmMatch[1]) ?? {}) : {};
  const vtt = md.match(/```webvtt[ \t]*\r?\n([\s\S]*?)\r?\n```/)?.[1] ?? "";
  return { fm, vtt };
}

export function parseChapters(vtt) {
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
  return chapters;
}

const yt = (t) => {
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

export function youtubeText(md) {
  const { fm, vtt } = parseCallMarkdown(md);
  const num = fm.number;
  const title = `${fm.description ?? "(untitled)"} - Ethereum Classic Community Call #${num}`;
  const summary = String(fm.summary ?? "").trim();

  // YouTube requires the first chapter to be 0:00 (it covers the intro). Later
  // chapters shift by `youtubeOffset` (the render's intro/preroll length) so
  // they match the uploaded video, which opens with the intro before the
  // recording starts; the same offset the transcript YouTube links use.
  const offset = Number(fm.youtubeOffset ?? 0);
  const chapterLines = parseChapters(vtt)
    .map((c, i) => `${i === 0 ? "0:00" : yt(c.start + offset)} ${c.title}`)
    .join("\n");

  // After the call-page link: the frontmatter's `youtubeLinks`, one per line.
  const extra = (fm.youtubeLinks ?? []).map((l) => String(l).trim());
  const description = [
    summary,
    "",
    chapterLines,
    "",
    `https://cc.ethereumclassic.org/calls/${num}`,
    ...(extra.length ? ["", ...extra] : []),
  ].join("\n");
  return { fm, title, description };
}
