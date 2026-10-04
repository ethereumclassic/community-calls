#!/usr/bin/env node
// Make the small avatar copies the website uses. Full-size avatars in
// public/speakers/ feed the video (stage roster, cold open, thumbnail, up to
// ~500px); the site only shows them at 40px (call roster) and 20px
// (transcript), so it loads public/speakers/sm/<name>.webp at 96x96 instead.
// Re-run after adding or replacing an avatar:
//
//   node scripts/speaker-avatars.mjs

import { mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve, parse } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public/speakers");
const SMALL = join(DIR, "sm");
const SIZE = 96;
const ff = createRequire(import.meta.url)("ffmpeg-static");

mkdirSync(SMALL, { recursive: true });
for (const f of readdirSync(DIR)) {
  if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
  const src = join(DIR, f);
  const out = join(SMALL, `${parse(f).name}.webp`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs)
    continue;
  // Square-crop to the centre, then scale.
  execFileSync(ff, [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-vf",
    `crop='min(iw,ih)':'min(iw,ih)',scale=${SIZE}:${SIZE}:flags=lanczos`,
    "-quality",
    "85",
    out,
  ]);
  console.log(`${f} -> sm/${parse(f).name}.webp`);
}
