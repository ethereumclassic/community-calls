// Sidecar meta.json — chapters, summary, jingles. Hand-authored for now;
// later, AI-precomputed against the VTT. One file feeds the chapter chip,
// the TOC + summary pre-roll slides, the post-roll speaker stats, and the
// jingles.

export type Chapter = {
  title: string;
  start: number;
  end: number;
};

// A display-mode window: between start and end (transcript clock, seconds)
// the stage shows `src` instead of the waveform. kind is derived from the
// file extension server-side so the page never has to sniff.
export type Display = {
  start: number;
  end: number;
  src: string;
  kind: "image" | "video";
  // image motion: scale across the window, holding `focus` on screen
  zoomFrom?: number;
  zoomTo?: number;
  focus?: string; // "x% y%" of the frame
  // video playback
  rate?: number;
  loop?: boolean;
};

export type SidecarMeta = {
  summary?: string;
  displays?: Display[];
  hosts?: string[];
  episodeUrl?: string;
  chapters?: Chapter[];
  intro?: string;
  outro?: string;
};

export async function loadSidecar(
  url: string | undefined,
): Promise<SidecarMeta | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as SidecarMeta;
  } catch {
    return null;
  }
}

export function chapterAt(
  chapters: Chapter[] | undefined,
  t: number,
): Chapter | undefined {
  if (!chapters) return undefined;
  for (let i = 0; i < chapters.length; i++) {
    if (t < chapters[i].start) return undefined;
    if (t < chapters[i].end) return chapters[i];
  }
  return undefined;
}

export function chapterIndex(
  chapters: Chapter[] | undefined,
  t: number,
): number {
  if (!chapters) return -1;
  for (let i = 0; i < chapters.length; i++) {
    if (t < chapters[i].end) return t < chapters[i].start ? -1 : i;
  }
  return -1;
}
