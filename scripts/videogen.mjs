#!/usr/bin/env node
// Render a /videogen frame stream to MP4 by driving the Astro dev (or preview)
// server with Playwright and piping PNGs into ffmpeg.
//
// Usage:
//   node scripts/videogen.mjs --video in.mp4 --vtt in.vtt --speaker "Alice"
//
// Requires: dev server running on --port (default 4321).

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

function timestampSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function withTimestamp(outPath) {
  const dir = dirname(outPath);
  const ext = extname(outPath);
  const base = basename(outPath, ext);
  return join(dir, `${base}-${timestampSlug()}${ext}`);
}

import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// Same registry the Astro side reads, parsed straight from the YAML (a plain
// Node script can't reach an Astro content collection). Legacy --speaker mode
// only; the main --job path gets avatars from the job spec.
const speakers =
  parseYaml(
    readFileSync(new URL("../speakers/speakers.yaml", import.meta.url), "utf8"),
  ) ?? {};

function resolveSpeaker(name) {
  const lower = name.trim().toLowerCase();
  for (const [key, rec] of Object.entries(speakers)) {
    const names = [key, rec.displayName, ...(rec.aliases ?? [])].map((s) =>
      String(s).toLowerCase(),
    );
    if (names.includes(lower)) return { key, ...rec };
  }
  return { key: lower };
}

function avatarUrlForGithub(login, size = 256) {
  return `https://github.com/${login}.png?size=${size}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// Numeric CLI args: a flag passed with no value lands as boolean `true`, and a
// non-numeric value yields NaN; both silently poison fps/duration math, so
// validate up front.
function numArg(name, dflt) {
  const v = args[name];
  if (v === undefined) return dflt;
  if (v === true) die(`--${name} requires a numeric value`);
  const n = Number(v);
  if (Number.isNaN(n)) die(`--${name} must be a number (got "${v}")`);
  return n;
}

const jobArg = args.job ?? null;
const videoIn = args.video ? resolve(args.video) : null;
const audioIn = args.audio ? resolve(args.audio) : null;
const vttIn = args.vtt ? resolve(args.vtt) : null;
let out = resolve(args.out ?? "videogen-out.mp4");
const fps = Math.trunc(numArg("fps", 60));
const port = Math.trunc(numArg("port", 4321));
const baseUrl = args["base-url"] ?? `http://localhost:${port}`;
const speaker = args.speaker ?? "";
const title = args.title ?? "";
const role = args.role ?? "";
const debug = !!args.debug;
const realtime = !!args.realtime;
const limitDurationSec = numArg("duration", null);
// AMA's AnalyserNode + Web Audio buffer chain introduces ~150-250ms of
// lag between an audio sample being played and AMA's bars reacting to it.
// Delay the audio track by this much in the muxed MP4 so the viz "catches
// up" with audio in the final output.
const vizOffsetSec = numArg("viz-offset", 0.2);

if (fps <= 0) die("--fps must be > 0");
if (port <= 0) die("--port must be > 0");
if (limitDurationSec != null && limitDurationSec <= 0)
  die("--duration must be > 0");
if (realtime && !jobArg)
  die("--realtime requires --job (it drives the live preview transport)");

if (jobArg) {
  // --job <url-or-path>: fetch the prebuilt job spec, then derive audio + vtt
  // from the URLs it references. Lets the driver render against the same
  // job.json that the browser preview uses.
} else {
  if (!vttIn) die("--vtt is required (or pass --job)");
  if (!videoIn && !audioIn) die("--video or --audio is required (or --job)");
  if (vttIn && !existsSync(vttIn)) die(`vtt not found: ${vttIn}`);
  if (videoIn && !existsSync(videoIn)) die(`video not found: ${videoIn}`);
  if (audioIn && !existsSync(audioIn)) die(`audio not found: ${audioIn}`);
}

const workDir = await mkdtemp(join(tmpdir(), "videogen-"));
const audioPath = join(workDir, "audio.m4a");

console.log(`▸ work dir: ${workDir}`);

// Resolve audio source. For --job, the JSON spec's `audio` URL is fetched
// against the dev server; for --video / --audio, the input file is read off
// disk. Either way we end up with an AAC file at audioPath that ffmpeg can
// re-mux during final encode.
let jobSpec = null;
if (jobArg) {
  if (/^https?:/.test(jobArg)) {
    jobSpec = await (await fetch(jobArg)).json();
  } else if (jobArg.startsWith("/")) {
    jobSpec = await (await fetch(`${baseUrl}${jobArg}`)).json();
  } else {
    jobSpec = JSON.parse(await readFile(resolve(jobArg), "utf8"));
  }
  const audioUrl = jobSpec.audio?.startsWith("http")
    ? jobSpec.audio
    : `${baseUrl}${jobSpec.audio}`;
  console.log(`▸ fetching audio ${audioUrl}…`);
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) die(`audio fetch failed: ${audioRes.status} ${audioUrl}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const rawAudio = join(workDir, "audio-in");
  await writeFile(rawAudio, buf);
  console.log("▸ re-encoding audio…");
  await run(ffmpegPath, [
    "-y",
    "-i",
    rawAudio,
    "-vn",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    audioPath,
  ]);
} else {
  console.log("▸ extracting audio…");
  await run(ffmpegPath, [
    "-y",
    "-i",
    videoIn ?? audioIn,
    "-vn",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    audioPath,
  ]);
}

// Resolve speaker avatar (single-speaker mode only; --job spec carries its
// own participant avatars).
let avatarDataUrl = null;
if (!jobArg && speaker) {
  const spk = resolveSpeaker(speaker);
  if (spk.github) {
    const cacheDir = join(REPO_ROOT, ".cache", "avatars");
    await mkdir(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, `${spk.github}.png`);
    if (!existsSync(cachePath)) {
      console.log(`▸ downloading avatar for @${spk.github}…`);
      const res = await fetch(avatarUrlForGithub(spk.github, 256));
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(cachePath, buf);
      } else {
        console.warn(`  (avatar fetch failed: ${res.status})`);
      }
    }
    if (existsSync(cachePath)) {
      const buf = await readFile(cachePath);
      avatarDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    }
  }
}

// Sanity-check the dev server is up.
try {
  const res = await fetch(`${baseUrl}/videogen`, { method: "HEAD" });
  if (!res.ok && res.status !== 405) throw new Error(`status ${res.status}`);
} catch (e) {
  die(
    `dev server not reachable at ${baseUrl}. Start it with:\n  npm run dev -- --host 0.0.0.0\n(${e.message})`,
  );
}

// 4. Launch Playwright. Intercept fetches for the virtual /__job/ paths and
//    serve the audio + VTT from disk. Inject the job spec via initscript.
console.log("▸ launching browser…");
// --disable-dev-shm-usage: this devcontainer caps /dev/shm at 64 MB, which
// crashes Chromium on long 1080p screencast runs; back it with a tmp file.
const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

// Per-frame mode rewires assets through /__job/ routes so it can render
// against any local file. Realtime mode skips the intercept because the
// page fetches everything from the dev server normally — needed for the
// AMA AnalyserNode to attach without CORS surprises.
if (!realtime) {
  const job = jobSpec
    ? { ...jobSpec, audio: "/__job/audio", vtt: "/__job/vtt", fps, bands: 48 }
    : {
        title,
        speaker,
        role,
        avatar: avatarDataUrl,
        audio: "/__job/audio",
        vtt: "/__job/vtt",
        fps,
        bands: 48,
      };
  await context.addInitScript((j) => {
    // eslint-disable-next-line no-undef
    window.__job = j;
  }, job);

  await context.route("**/__job/audio", async (route) => {
    const body = await readFile(audioPath);
    route.fulfill({
      status: 200,
      headers: { "content-type": "audio/mp4" },
      body,
    });
  });
  let vttBody = null;
  if (jobSpec) {
    const vttUrl = jobSpec.vtt?.startsWith("http")
      ? jobSpec.vtt
      : `${baseUrl}${jobSpec.vtt}`;
    vttBody = Buffer.from(await (await fetch(vttUrl)).arrayBuffer());
  } else {
    vttBody = await readFile(vttIn);
  }
  await context.route("**/__job/vtt", async (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/vtt" },
      body: vttBody,
    });
  });
}

const page = await context.newPage();
page.on("pageerror", (e) => console.error("[page-error]", e.message));
page.on("crash", () => console.error("[page-crash]"));
page.on("close", () => console.error("[page-closed]"));
page.on("console", (m) => {
  if (m.type() === "error" || debug) console.error("[page]", m.text());
});

// Real-time mode pipes a CDP screencast straight into ffmpeg while the page
// plays the audio at 1× speed. Slides + chapter chip + AMA all render
// natively. Per-frame seek mode (the original path) still works for
// deterministic offline renders.
// In realtime + --job mode we navigate to the page with ?job= directly so
// the page fetches its assets from the dev server without going through
// our route intercept (which conflicts with the audio element's CORS-ish
// requirements for the AMA AnalyserNode).
const pageUrl = realtime
  ? jobArg
    ? `${baseUrl}/videogen?job=${encodeURIComponent(jobArg)}&preview=1`
    : `${baseUrl}/videogen?preview=1`
  : `${baseUrl}/videogen`;
await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready !== undefined, null, {
  timeout: 30_000,
});
await page.addStyleTag({
  content:
    "astro-dev-toolbar, astro-dev-overlay { display: none !important; } " +
    "#preview-controls { display: none !important; }",
});
await page.evaluate(() => window.__ready);

const duration = await page.evaluate(() => window.__duration);
if (!duration || duration <= 0) die("audio decoded with zero duration");
const renderDur = limitDurationSec
  ? Math.min(limitDurationSec, duration)
  : duration;

try {
  if (realtime) {
    await renderRealtime(renderDur);
  } else {
    await renderPerFrame(renderDur);
  }
} finally {
  // Always tear down the browser and temp dir, even if rendering threw —
  // otherwise a failed run leaks a headless Chromium process and fills tmp.
  await browser.close().catch(() => {});
  if (!debug)
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
}
console.log(`✓ wrote ${out}`);

// ── per-frame deterministic renderer (original path) ────────────────────────
async function renderPerFrame(durSec) {
  const totalFrames = Math.floor(durSec * fps);
  console.log(
    `▸ deterministic: ${durSec.toFixed(2)}s → ${totalFrames} frames @ ${fps}fps`,
  );
  console.log("▸ rendering…");
  const ff = spawn(
    ffmpegPath,
    [
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-i",
      "-",
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      out,
    ],
    {
      stdio: [
        "pipe",
        debug ? "inherit" : "ignore",
        debug ? "inherit" : "ignore",
      ],
    },
  );
  const ffExit = new Promise((res, rej) => {
    ff.on("error", rej);
    ff.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)),
    );
  });
  const t0 = Date.now();
  const shotOpts = {
    type: "jpeg",
    quality: 92,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  };
  for (let f = 0; f < totalFrames; f++) {
    await page.evaluate((t) => window.__seek(t), f / fps);
    const buf = await page.screenshot(shotOpts);
    if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once("drain", r));
    }
    if (f % fps === 0) {
      const pct = ((f / totalFrames) * 100).toFixed(1);
      const elapsed = (Date.now() - t0) / 1000;
      const rate = f / elapsed || 0;
      process.stdout.write(
        `\r  frame ${f}/${totalFrames} (${pct}%, ${rate.toFixed(1)} fps render)   `,
      );
    }
  }
  process.stdout.write("\n");
  ff.stdin.end();
  await ffExit;
}

// ── real-time CDP screencast renderer ──────────────────────────────────────
async function renderRealtime(durSec) {
  // Pull the page's pre/post-roll wallclock budget + jingle URLs so we can
  // size the concatenated audio track to match the captured visual range.
  const timings = await page.evaluate(() => window.__timings);
  if (!timings)
    die("page did not expose window.__timings — sidecar meta missing?");
  const prerollSec = timings.prerollMs / 1000;
  const postrollSec = timings.postrollMs / 1000;
  const mainSec = limitDurationSec
    ? Math.min(limitDurationSec, timings.mainDurationSec)
    : timings.mainDurationSec;
  // Crossfade window: cap at half the (possibly --duration-capped) main length
  // so intro and outro never overlap — same rule as timeline.ts so the MP4 and
  // the on-page preview agree on the outro start.
  const overlapSec = Math.max(
    0,
    Math.min(timings.overlapSec ?? 0, mainSec / 2),
  );
  const totalSec = prerollSec + mainSec + postrollSec;
  console.log(
    `▸ realtime capture: ${totalSec.toFixed(2)}s (${prerollSec}s preroll + ${mainSec.toFixed(2)}s main + ${postrollSec}s postroll)`,
  );

  // Build the audio track: intro jingle over the preroll, the main call audio,
  // and the outro jingle over the postroll, crossfaded under the speaker at
  // each boundary (see buildConcatAudio). The result is exactly totalSec long
  // so it lines up with the captured video.
  const fullAudio = join(workDir, "full-audio.m4a");
  await buildConcatAudio(fullAudio, {
    introUrl: timings.introUrl,
    outroUrl: timings.outroUrl,
    mainPath: audioPath,
    // Head-trim offset: the main audio starts here (cuts leading silence), so
    // the rendered audio matches the trimmed call the browser plays.
    mainOffsetSec: Math.max(0, timings.mainAudioOffsetSec ?? 0),
    prerollSec,
    mainSec,
    postrollSec,
    overlapSec,
    endFadeSec: Math.max(0, Math.min(timings.endFadeSec ?? 0, postrollSec)),
  });

  // Frames go to a temp dir; we need real files (not a pipe) so the concat
  // demuxer can use per-frame durations — what kills the cadence drift
  // that fixed-framerate input has. /dev/shm would be RAM-only but this
  // devcontainer caps shm at 64MB, so we fall back to the regular tmp.
  const framesDir = join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });
  const captureLog = [];

  const client = await context.newCDPSession(page);
  let frames = 0;
  let stopped = false;
  let captureT0 = 0;

  client.on("Page.screencastFrame", async ({ data, sessionId }) => {
    const now = Date.now();
    if (stopped) {
      try {
        await client.send("Page.screencastFrameAck", { sessionId });
      } catch {
        /* */
      }
      return;
    }
    // Claim this frame's index and log its arrival time synchronously, before
    // any await — otherwise two concurrent handlers can read the same `frames`
    // value and clobber each other's file / produce out-of-order timestamps.
    const idx = frames++;
    if (idx === 0) captureT0 = now;
    const name = `f${String(idx).padStart(8, "0")}.jpg`;
    captureLog.push({ name, t: (now - captureT0) / 1000 });
    try {
      await writeFile(join(framesDir, name), Buffer.from(data, "base64"));
    } catch {
      /* */
    }
    try {
      await client.send("Page.screencastFrameAck", { sessionId });
    } catch {
      /* */
    }
  });

  // Wait for the preview's resting frame (the title slide) to finish fading
  // in before we capture, so frame 0 is the title slide rather than the bare
  // stage. If there's no preroll (noSlides), the stage is the intended first
  // frame and this resolves immediately.
  await page
    .waitForFunction(
      () => {
        const t = window.__timings;
        if (!t || t.prerollMs <= 0) return true;
        const el = document.querySelector("#slides .slide.visible");
        return !!el && parseFloat(getComputedStyle(el).opacity) > 0.99;
      },
      null,
      { timeout: 5000 },
    )
    .catch(() => {});

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    everyNthFrame: 1,
  });
  // Tiny pause so the first paint flush after startScreencast lands.
  await new Promise((r) => setTimeout(r, 80));

  // Kick off the full preview transport: preroll → main → postroll. When
  // --duration caps mainSec, tell the transport to end the main segment early
  // (window.__capMainAt) so postroll fires at the right time instead of after
  // the full audio (which can be 86 minutes).
  await page.evaluate((mainLimit) => {
    if (mainLimit > 0 && typeof window.__capMainAt === "function") {
      window.__capMainAt(mainLimit);
    }
    document.getElementById("preview-play").click();
  }, limitDurationSec ?? -1);

  const t0 = Date.now();
  const progress = setInterval(() => {
    const elapsed = (Date.now() - t0) / 1000;
    process.stdout.write(
      `\r  ${elapsed.toFixed(1)}s / ${totalSec.toFixed(1)}s — ${frames} frames captured   `,
    );
  }, 1000);

  // Wait for the page to signal that pre/main/post-roll are all finished.
  // Safety overshoot of 15s in case __renderEnded never fires.
  await Promise.race([
    page.evaluate(() => window.__renderEnded),
    new Promise((r) => setTimeout(r, totalSec * 1000 + 15_000)),
  ]);

  clearInterval(progress);
  process.stdout.write("\n");
  stopped = true;
  try {
    await client.send("Page.stopScreencast");
  } catch {
    /* */
  }
  const captureElapsed = (Date.now() - t0) / 1000;
  console.log(
    `▸ captured ${frames} frames over ${captureElapsed.toFixed(2)}s wallclock`,
  );
  if (captureLog.length === 0)
    die(
      "no frames were captured (the page never started playing — check that " +
        "#preview-play exists and __renderEnded resolved)",
    );

  // Build a concat-demuxer list using each frame's real arrival time. This
  // keeps video playback locked to wallclock regardless of cadence wobble
  // (the previous fixed-framerate hint accumulated drift).
  const concatLines = ["ffconcat version 1.0"];
  for (let i = 0; i < captureLog.length; i++) {
    const cur = captureLog[i];
    const next = captureLog[i + 1];
    const dur = next ? Math.max(0.001, next.t - cur.t) : 0.04;
    concatLines.push(`file '${cur.name}'`);
    concatLines.push(`duration ${dur.toFixed(4)}`);
  }
  if (captureLog.length > 0) {
    concatLines.push(`file '${captureLog[captureLog.length - 1].name}'`);
  }
  const concatPath = join(framesDir, "frames.ffconcat");
  await writeFile(concatPath, concatLines.join("\n"));

  console.log("▸ encoding…");
  const finalOut = withTimestamp(out);
  const ffArgs = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-itsoffset",
    String(vizOffsetSec),
    "-i",
    fullAudio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-vsync",
    "cfr",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    finalOut,
  ];
  const ff = spawn(ffmpegPath, ffArgs, {
    stdio: [
      "ignore",
      debug ? "inherit" : "ignore",
      debug ? "inherit" : "ignore",
    ],
  });
  await new Promise((res, rej) => {
    ff.on("error", rej);
    ff.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)),
    );
  });
  // Best-effort cleanup of frame dir to free disk (the rest of workDir is
  // removed in the top-level finally).
  await rm(framesDir, { recursive: true, force: true }).catch(() => {});
  out = finalOut;
}

// Build the full audio track, laid out on one totalSec-long timeline and mixed
// so the jingle crosses the slide/call boundaries instead of hard-cutting:
//
//   0        preroll        preroll+main                 totalSec
//   |==intro==|=fade out=>·····call·····<=fade in=|==outro==|
//             (overlap)                  (overlap)
//
// The intro opens at full over the pre-roll slides, then fades out over
// `overlapSec` while the first speaker talks; the outro fades in under the
// closing speaker over the last `overlapSec` of the call, then plays full over
// the post-roll slides. A silent base of exactly totalSec fixes the length and
// fills any gaps (e.g. when a jingle URL is missing). This mirrors the browser
// preview (see preview.ts / timeline.ts jingleVolumeAt) so the rendered MP4 and
// the on-page preview sound identical.
async function buildConcatAudio(outPath, opts) {
  // ffmpeg-static segfaults on HTTP inputs in some filter graphs — always
  // localise jingles to a temp file first. Memoised by URL so a shared
  // intro/outro jingle (the common case — both default to the same take) is
  // fetched and written only once.
  const localised = new Map();
  async function localise(url, name) {
    if (!url) return null;
    if (localised.has(url)) return localised.get(url);
    const u = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const res = await fetch(u);
    if (!res.ok) die(`jingle fetch failed: ${res.status} ${u}`);
    const local = join(workDir, name);
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
    localised.set(url, local);
    return local;
  }
  const introIn = await localise(opts.introUrl, "intro.mp3");
  const outroIn = await localise(opts.outroUrl, "outro.mp3");

  // overlapSec and endFadeSec are already clamped by the caller (to half the
  // main length, and to postrollSec, respectively); just guard a degenerate 0.
  const { prerollSec, mainSec, postrollSec, overlapSec, endFadeSec } = opts;
  const mainOffsetSec = Math.max(0, opts.mainOffsetSec ?? 0);
  const totalSec = prerollSec + mainSec + postrollSec;
  const ov = Math.max(0, overlapSec);
  const endFade = Math.max(0, endFadeSec ?? 0);
  const ms = (s) => Math.round(s * 1000); // adelay wants integer milliseconds

  const args = ["-y"];
  if (introIn) args.push("-i", introIn);
  args.push("-i", opts.mainPath);
  if (outroIn) args.push("-i", outroIn);
  const introIdx = introIn ? 0 : -1;
  const mainIdx = introIn ? 1 : 0;
  const outroIdx = outroIn ? mainIdx + 1 : -1;

  // Silent bed pins the output to exactly totalSec and covers any gaps.
  const filters = [
    `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${totalSec}[base]`,
  ];
  const mixLabels = ["[base]"];

  // Intro: plays from 0, full over the preroll, fading out across [preroll,
  // preroll+ov]. Trimmed so it doesn't bleed further into the call. The fade is
  // only emitted when ov > 0 (afade with d=0 is a degenerate no-op/error).
  if (introIdx >= 0 && prerollSec > 0) {
    const fade = ov > 0 ? `,afade=t=out:st=${prerollSec}:d=${ov}` : "";
    filters.push(
      `[${introIdx}:a]atrim=duration=${prerollSec + ov},asetpts=PTS-STARTPTS${fade}[pre]`,
    );
    mixLabels.push("[pre]");
  }

  // Main call audio: cut leading silence (start at mainOffsetSec) and take
  // mainSec of it, then delay to start after the preroll.
  filters.push(
    `[${mainIdx}:a]atrim=start=${mainOffsetSec}:end=${mainOffsetSec + mainSec},asetpts=PTS-STARTPTS,adelay=${ms(prerollSec)}|${ms(prerollSec)}[main]`,
  );
  mixLabels.push("[main]");

  // Outro: fades in over its first `ov` seconds, then plays full; delayed so
  // that fade-in lands under the last `ov` seconds of the call.
  if (outroIdx >= 0 && postrollSec > 0) {
    const outroDelay = prerollSec + mainSec - ov;
    const fade = ov > 0 ? `,afade=t=in:st=0:d=${ov}` : "";
    filters.push(
      `[${outroIdx}:a]atrim=duration=${ov + postrollSec},asetpts=PTS-STARTPTS${fade},adelay=${ms(outroDelay)}|${ms(outroDelay)}[post]`,
    );
    mixLabels.push("[post]");
  }

  // normalize=0 keeps each source at its own level (we want the brief overlap
  // to sum, not duck everything); dropout_transition=0 avoids a gain bump when
  // a source ends. Because the jingle and the speaker SUM during the crossfade
  // windows, the peak can briefly exceed 0 dBFS — a true-peak limiter catches
  // that so the rendered MP4 never hard-clips. level=disabled keeps it as a
  // peak ceiling only (no makeup gain that would pump up the quiet stretches).
  // A final afade-out over the last slide takes the whole track to silence, in
  // step with the picture fading to black (preview.ts applyFadeBlack).
  const endFadeOut =
    endFade > 0 ? `,afade=t=out:st=${totalSec - endFade}:d=${endFade}` : "";
  filters.push(
    `${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0,alimiter=level=disabled:limit=0.97${endFadeOut}[full]`,
  );

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[full]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outPath,
  );

  if (debug) console.error("ffmpeg audio:", ffmpegPath, args.join(" "));
  await new Promise((res, rej) => {
    const p = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", rej);
    p.on("close", (code, signal) => {
      if (code === 0) return res();
      const tail = stderr.split("\n").slice(-12).join("\n");
      rej(
        new Error(
          `ffmpeg(audio concat) exit code=${code} signal=${signal}\n${tail}`,
        ),
      );
    });
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: debug ? "inherit" : "ignore" });
    p.on("error", rej);
    p.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} exit ${code}`)),
    );
  });
}
