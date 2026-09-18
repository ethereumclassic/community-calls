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

import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "astro:content";
import type { Display } from "./sidecar";

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

const videoFileSchema = z.object({
  // Display-mode windows: while the call discusses an asset, the stage swaps
  // the waveform for it. Times are on the transcript clock ([h:]mm:ss[.ms],
  // the same clock as NOTE chapters).
  displays: z.array(displaySchema).optional(),
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

// "[h:]mm:ss[.ms]" on the transcript clock -> seconds.
function parseClock(s: string): number {
  const m = String(s)
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`displays: bad time "${s}" (want [h:]mm:ss[.ms])`);
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + ms / 1000;
}

function resolveSrc(id: string, src: string): string {
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("/")) return src;
  const file = src.replace(/^\.?\/?media\//, "");
  if (file.includes("/") || file.includes(".."))
    throw new Error(`displays: src must be a file name, got "${src}"`);
  if (existsSync(new URL(`./calls/media/${file}`, ROOT)))
    return `/calls-media/${file}`;
  return `/videogen-cache/${id}/media/${file}`;
}

function displayKind(src: string): Display["kind"] {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) ? "video" : "image";
}

export function buildDisplays(id: string): Display[] | undefined {
  const list = loadVideoFile(id)?.displays;
  if (!list || list.length === 0) return undefined;
  return list
    .map((d) => {
      const start = parseClock(d.from);
      const end = parseClock(d.to);
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
