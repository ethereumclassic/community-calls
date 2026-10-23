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

// A cold open: the call audio between start and end (transcript clock,
// seconds) played over the still `src` before the preroll slides.
export type ColdOpen = {
  start: number;
  end: number;
  src: string;
  quote?: string; // on-screen caption; default is the clip's spoken words
  zoomFrom?: number;
  zoomTo?: number;
  focus?: string; // "x% y%" of the frame
};

export type SidecarMeta = {
  summary?: string;
  coldOpen?: ColdOpen;
  // Dev preview only: every coldopen-* still in the call's media cache (with
  // its thumb-coldopen-* thumbnail when there is one), so the slide gallery
  // and review page can show the cold open over each candidate.
  coldOpenCandidates?: { src: string; thumb?: string }[];
  // YouTube thumbnail faces: the cold open's speaker (default) or everyone.
  thumbnail?: { faces?: "speaker" | "all" };
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
