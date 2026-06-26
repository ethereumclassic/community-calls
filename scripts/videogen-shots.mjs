#!/usr/bin/env node
// Capture screenshots of /videogen at key states for visual validation.
// Usage:
//   node scripts/videogen-shots.mjs [base-url]
// Writes PNGs into .cache/videogen-screens/.

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const OUT = join(REPO, ".cache", "videogen-screens");
const BASE = process.argv[2] ?? "http://localhost:4321";

await mkdir(OUT, { recursive: true });

// --autoplay-policy=no-user-gesture-required lets audio.play() succeed
// without a click in headless mode, so we can snapshot the AMA-driven
// preview state.
// --disable-dev-shm-usage: this devcontainer caps /dev/shm at 64 MB, so let
// Chromium use a tmp file instead and avoid crashing on 1080p pages.
const browser = await chromium.launch({
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-dev-shm-usage",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

async function shot(name, url, opts = {}) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[page:${name}]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[console:${name}]`, m.text());
  });
  await page.goto(`${BASE}${url}`, { waitUntil: "load" });
  await page.addStyleTag({
    content:
      "astro-dev-toolbar, astro-dev-overlay { display: none !important; } " +
      "#preview-controls { display: none !important; }",
  });
  if (opts.waitForReady !== false) {
    await page.evaluate(() => window.__ready);
  }
  if (opts.seek != null) {
    await page.evaluate((t) => window.__seek(t), opts.seek);
    await page.waitForTimeout(opts.settle ?? 500);
  }
  if (opts.play) {
    // For AMA preview screenshots: click the play button (which is the
    // user gesture that initialises AMA), seek to the requested time, wait
    // for some real frames to paint, then snapshot.
    await page.evaluate(async (t) => {
      const audio = document.getElementById("preview-audio");
      audio.currentTime = t;
      const btn = document.getElementById("preview-play");
      btn.click();
    }, opts.play);
    await page.waitForTimeout(opts.playWait ?? 1500);
  }
  const out = join(OUT, `${name}.png`);
  await page.screenshot({
    path: out,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
    omitBackground: false,
  });
  console.log(`✓ ${name} → ${out}`);
  await page.close();
}

// Jobs are now derived from the call markdown via the /videogen/<NN>/ endpoints
// (the old static public/videogen/053/* files are gone). The audio-dependent
// shots need <NN>-audio.mp3 present under public/videogen/53/.
const call53 = "/videogen?job=/videogen/53/job.json";
const call53Preview = `${call53}&preview=1`;

await shot("landing", "/videogen", { waitForReady: false });
await shot("call53-t0", call53, { seek: 0 });
// Timestamps re-anchored against the full episode timeline.
await shot("call53-diego", call53, { seek: 1535 });
await shot("call53-istora", call53, { seek: 1735 });
await shot("call53-lunar", call53, { seek: 1597 });
await shot("call53-iav", call53, { seek: 1825 });
await shot("call53-longcap", call53, { seek: 1605 });

// Slide shots: the slide-jump buttons now seek the unified timeline straight
// to a slide (paused), so a single helper covers every pre/post-roll slide —
// no more clicking play and waiting out the jingle, or faking `ended`.
async function slideShot(name, slideKey) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[page:${name}]`, e.message));
  await page.goto(`${BASE}${call53Preview}`, { waitUntil: "load" });
  await page.addStyleTag({
    content:
      "astro-dev-toolbar, astro-dev-overlay { display: none !important; }",
  });
  await page.evaluate(() => window.__ready);
  // Let setupPreviewControls finish wiring the timeline before we click.
  await page.waitForTimeout(300);
  await page.evaluate((key) => {
    document.querySelector(`#slide-jumps button[data-slide="${key}"]`).click();
  }, slideKey);
  // Settle the 700ms cross-fade (and the stats donut render).
  await page.waitForTimeout(900);
  const out = join(OUT, `${name}.png`);
  await page.screenshot({
    path: out,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  console.log(`✓ ${name} → ${out}`);
  await page.close();
}

// Chapter timeline at points spread across the 9 full-episode chapters.
await shot("call53-chip-ch1", call53, { seek: 240, settle: 900 });
await shot("call53-chip-ch2", call53, { seek: 700, settle: 900 });
await shot("call53-chip-ch3", call53, { seek: 1070, settle: 900 });
await shot("call53-chip-ch4", call53, { seek: 1500, settle: 900 });

// Pre-roll slides.
await slideShot("call53-slide-title", "title");
await slideShot("call53-slide-toc", "toc");
await slideShot("call53-slide-summary", "summary");

// Post-roll slides.
await slideShot("call53-slide-stats", "stats");
await slideShot("call53-slide-thanks", "thanks");
await slideShot("call53-slide-logo", "logo");
// Live preview snapshots with AMA actually running. Audio has to be playing
// for AnalyserNode to produce data, so we click play + seek + wait.
await shot("call53-ama-lunar", call53Preview, { play: 67, playWait: 1800 });
await shot("call53-ama-istora", call53Preview, { play: 205, playWait: 1800 });

await browser.close();
console.log(`\nAll screenshots in ${OUT}`);
