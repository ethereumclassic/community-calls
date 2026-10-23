// The per-call video file: calls/video/<id>.yaml. Everything the render needs
// that is not part of the episode's published text lives here (display-mode
// windows today; transitions and other render settings later), so the call
// markdown stays the clean, public episode record. Read server-side by the
// dev-only videogen endpoints (calls-server.ts).
//
// Display `src` values resolve by convention, never by full path:
//   - an http(s) URL or an absolute path is used as-is;
//   - `media/<file>` or a bare `<file>` refers to a committed still in
//     calls/media/ if one exists there, otherwise to the call's local media
//     cache at .cache/videogen/<id>/media/<file>, which `scripts/videogen/media.mjs
//     pull <NN>` fills from the call's GitHub release. In dev both are served
//     with Range support (callsMediaDev / videogenCacheDev in astro.config.mjs).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "astro:content";
import type { ColdOpen, Display } from "./sidecar";

const displaySchema = z.object({
  from: z.string(),
  to: z.string(),
  src: z.string(),
  // Images: zoom from `zoomFrom` to `zoomTo` across the window (default a slow
  // 1 -> 1.06 drift), keeping `focus` ("x% y%" of the frame, default centre)
  // fixed on screen at the zoomed-in end.
  zoomFrom: z.number().positive().optional(),
  zoomTo: z.number().positive().optional(),
  focus: z.string().optional(),
  // Videos: playback rate (1 = natural) and whether to loop to fill the window.
  rate: z.number().positive().optional(),
  loop: z.boolean().optional(),
});

// Cold open: a short highlight from the call played before the preroll, over
// a still. `from`/`to` pick the audio; `src` resolves like a display src;
// `quote` is the on-screen caption (default: the words spoken in the clip);
// zoom/focus behave as for an image display.
const coldOpenSchema = z.object({
  from: z.string(),
  to: z.string(),
  src: z.string(),
  quote: z.string().optional(),
  zoomFrom: z.number().positive().optional(),
  zoomTo: z.number().positive().optional(),
  focus: z.string().optional(),
});

// Audio edit applied by scripts/videogen/edit-audio.mjs before rendering.
// When present, every other time in this file is on the recording clock and
// is carried onto the edited audio through calls/video/<id>.map.json.
const editSchema = z.object({
  cuts: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  silence: z
    .object({
      minGapSec: z.number().positive().optional(),
      keepSec: z.number().nonnegative().optional(),
      thresholdDb: z.number().optional(),
    })
    .optional(),
});

const videoFileSchema = z.object({
  edit: editSchema.optional(),
  coldOpen: coldOpenSchema.optional(),
  // Display-mode windows: while the call discusses an asset, the stage swaps
  // the waveform for it. Times are [h:]mm:ss[.ms] on the transcript clock
  // (the same clock as NOTE chapters), or on the recording clock when the
  // file has an edit.
  displays: z.array(displaySchema).optional(),
  // YouTube thumbnail: `faces: speaker` (default) shows the cold open's
  // speaker, for a guest interview; `faces: all` shows every participant.
  thumbnail: z
    .object({ faces: z.enum(["speaker", "all"]).optional() })
    .optional(),
});

type VideoFile = z.infer<typeof videoFileSchema>;

const ROOT = new URL("../../../", import.meta.url);

function loadVideoFile(id: string): VideoFile | null {
  const file = new URL(`./calls/video/${id}.yaml`, ROOT);
  if (!existsSync(file)) return null;
  const raw = parseYaml(readFileSync(file, "utf8")) ?? {};
  const parsed = videoFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `calls/video/${id}.yaml: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

// Recording time -> edited time, from the kept spans edit-audio.mjs wrote. A
// time inside a removed span maps to where that span was cut out. Identity
// when the call has no edit.
function loadClockMap(id: string, vf: VideoFile | null): (t: number) => number {
  if (!vf?.edit) return (t) => t;
  const file = new URL(`./calls/video/${id}.map.json`, ROOT);
  if (!existsSync(file))
    throw new Error(
      `calls/video/${id}.yaml has an edit but no ${id}.map.json; run scripts/videogen/edit-audio.mjs`,
    );
  const { kept } = JSON.parse(readFileSync(file, "utf8")) as {
    kept: [number, number, number][];
  };
  return (t) => {
    for (const [from, to, at] of kept) {
      if (t < from) return at;
      if (t <= to) return at + (t - from);
    }
    const last = kept[kept.length - 1];
    return last ? last[2] + (last[1] - last[0]) : t;
  };
}

// "[h:]mm:ss[.ms]" -> seconds.
function parseClock(s: string): number {
  const m = String(s)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`video file: bad time "${s}" (want [h:]mm:ss[.ms])`);
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + ms / 1000;
}

function resolveSrc(id: string, src: string): string {
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("/")) return src;
  const file = src.replace(/^\.?\/?media\//, "");
  if (file.includes("/") || file.includes(".."))
    throw new Error(`video file: src must be a file name, got "${src}"`);
  if (existsSync(new URL(`./calls/media/${file}`, ROOT)))
    return `/calls-media/${file}`;
  return `/videogen-cache/${id}/media/${file}`;
}

function displayKind(src: string): Display["kind"] {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) ? "video" : "image";
}

export function buildDisplays(id: string): Display[] | undefined {
  const vf = loadVideoFile(id);
  const list = vf?.displays;
  if (!list || list.length === 0) return undefined;
  const toEdited = loadClockMap(id, vf);
  return list
    .map((d) => {
      const start = toEdited(parseClock(d.from));
      const end = toEdited(parseClock(d.to));
      if (end <= start)
        throw new Error(
          `displays: "${d.from}" -> "${d.to}" ends before it starts`,
        );
      const src = resolveSrc(id, d.src);
      const out: Display = { start, end, src, kind: displayKind(src) };
      if (d.zoomFrom != null) out.zoomFrom = d.zoomFrom;
      if (d.zoomTo != null) out.zoomTo = d.zoomTo;
      if (d.focus) out.focus = d.focus;
      if (d.rate != null) out.rate = d.rate;
      if (d.loop != null) out.loop = d.loop;
      return out;
    })
    .sort((a, b) => a.start - b.start);
}

// Longest cold open we accept: it is a teaser, not a segment.
const COLD_OPEN_MAX_SEC = 20;

export function buildThumbnail(
  id: string,
): { faces?: "speaker" | "all" } | undefined {
  return loadVideoFile(id)?.thumbnail;
}

export function buildColdOpen(id: string): ColdOpen | undefined {
  const vf = loadVideoFile(id);
  const c = vf?.coldOpen;
  if (!c) return undefined;
  const toEdited = loadClockMap(id, vf);
  const start = toEdited(parseClock(c.from));
  const end = toEdited(parseClock(c.to));
  if (end <= start || end - start > COLD_OPEN_MAX_SEC)
    throw new Error(
      `coldOpen: "${c.from}" -> "${c.to}" must run forwards and last at most ${COLD_OPEN_MAX_SEC}s`,
    );
  const out: ColdOpen = { start, end, src: resolveSrc(id, c.src) };
  if (c.quote) out.quote = c.quote;
  if (c.zoomFrom != null) out.zoomFrom = c.zoomFrom;
  if (c.zoomTo != null) out.zoomTo = c.zoomTo;
  if (c.focus) out.focus = c.focus;
  return out;
}

// Candidate cold-open stills: coldopen-*.{png,jpg,webp} in the call's media
// cache, as servable URLs, each with its thumb-coldopen-*.webp thumbnail when
// one exists (the stills are ~2560px; the gallery and review grid only need
// the thumbnail).
export function listColdOpenCandidates(
  id: string,
): { src: string; thumb?: string }[] | undefined {
  const dir = new URL(`./.cache/videogen/${id}/media/`, ROOT);
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir);
  const url = (f: string) => `/videogen-cache/${id}/media/${f}`;
  const list = files
    .filter((f) => /^coldopen-.+\.(png|jpe?g|webp)$/i.test(f))
    .sort()
    .map((f) => {
      const thumb = `thumb-${f.replace(/\.[^.]+$/, "")}.webp`;
      return files.includes(thumb)
        ? { src: url(f), thumb: url(thumb) }
        : { src: url(f) };
    });
  return list.length ? list : undefined;
}
