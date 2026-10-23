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
// --start <sec>: begin the render at main-local time `sec` (seconds into the
// trimmed call, i.e. transcript time minus the head trim) instead of at the
// top. Used to re-render one window of a call (e.g. a display-mode segment)
// for splicing into an existing full render; with --start there is no preroll
// in the capture, --duration counts from the start point.
const startSec = numArg("start", null);
// --clip: with --start, stop at the end of the window instead of running on
// into the postroll slides; for one-off clips rendered for review.
const clipMode = !!args.clip;
// AMA's AnalyserNode + Web Audio buffer chain introduces ~150-250ms of
// lag between an audio sample being played and AMA's bars reacting to it.
// Delay the audio track by this much in the muxed MP4 so the viz "catches
// up" with audio in the final output.
const vizOffsetSec = numArg("viz-offset", 0.2);

if (fps <= 0) die("--fps must be > 0");
if (port <= 0) die("--port must be > 0");
if (limitDurationSec != null && limitDurationSec <= 0)
  die("--duration must be > 0");
if (startSec != null && startSec < 0) die("--start must be >= 0");
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
let audioPath = join(workDir, "audio.m4a");

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
  if (startSec != null) {
    // Window renders (clips, re-rendered segments) only need a slice; the mix
    // graph in buildConcatAudio decodes the source directly, so skip the
    // minute-long re-encode of the whole call.
    audioPath = rawAudio;
  } else {
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
  }
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
// PLAYWRIGHT_CHROMIUM_EXECUTABLE lets us point at a self-contained browser
// (e.g. a Nix-built chromium) instead of Playwright's downloaded binary, which
// needs FHS system libs this Nix devcontainer doesn't provide.
const browser = await chromium.launch({
  // --no-sandbox: required for a Nix-built chromium running as root in this
  // container. The bigger V8 heap keeps the full-call audio decode + spectrum
  // from OOM-closing the page.
  args: [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--js-flags=--max-old-space-size=4096",
  ],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
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

// Set by renderRealtime(); declared before the render runs (top-level let).
let renderTimings = null;

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
// The video-clock facts later steps need (captions and chapters on YouTube are
// on the video clock): written next to the render as <name>.timings.json.
if (renderTimings)
  await writeFile(
    out.replace(/\.mp4$/, "") + ".timings.json",
    JSON.stringify(renderTimings, null, 2) + "\n",
  );

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
      ...(startSec ? ["-ss", String(startSec)] : []),
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
    await page.evaluate((t) => window.__seek(t), (startSec ?? 0) + f / fps);
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
  // With --start the capture opens on the stage mid-call: no preroll slides,
  // no intro jingle, and the main window is measured from the start point.
  const startAt = startSec ?? 0;
  if (startAt >= timings.mainDurationSec)
    die(
      `--start ${startAt}s is past the end of the call (${timings.mainDurationSec.toFixed(2)}s)`,
    );
  const prerollSec = startSec != null ? 0 : timings.prerollMs / 1000;
  const postrollSec =
    clipMode && startSec != null ? 0 : timings.postrollMs / 1000;
  const mainAvail = timings.mainDurationSec - startAt;
  const mainSec = limitDurationSec
    ? Math.min(limitDurationSec, mainAvail)
    : mainAvail;
  const totalSec = prerollSec + mainSec + postrollSec;
  renderTimings = {
    prerollSec,
    mainSec,
    postrollSec,
    totalSec,
    // Call audio time at the start of the main segment (head trim + --start).
    mainAudioOffsetSec: Math.max(0, timings.mainAudioOffsetSec ?? 0) + startAt,
  };
  console.log(
    `▸ realtime capture: ${totalSec.toFixed(2)}s (${prerollSec}s preroll + ${mainSec.toFixed(2)}s main + ${postrollSec}s postroll)` +
      (startSec != null ? ` starting ${startAt}s into the call` : ""),
  );

  // Build the audio track: intro jingle over the preroll, the main call audio,
  // and the outro jingle over the postroll, crossfaded under the speaker at
  // each boundary (see buildConcatAudio). The result is exactly totalSec long
  // so it lines up with the captured video.
  const fullAudio = join(workDir, "full-audio.m4a");
  await buildConcatAudio(fullAudio, {
    introUrl: startSec != null ? undefined : timings.introUrl,
    outroUrl: timings.outroUrl,
    mainPath: audioPath,
    // Head-trim offset: the main audio starts here (cuts leading silence), so
    // the rendered audio matches the trimmed call the browser plays. A --start
    // moves the audio in-point along with the picture.
    mainOffsetSec: Math.max(0, timings.mainAudioOffsetSec ?? 0) + startAt,
    prerollSec,
    // Cold open at the head of the preroll (none with --start, which has no
    // preroll): that stretch of the call plays before the intro jingle.
    coldOpenSec: startSec != null ? 0 : (timings.coldOpenSec ?? 0),
    coldOpenFrom: timings.coldOpenAudioFrom ?? 0,
    mainSec,
    postrollSec,
    coldOpenFadeInSec: timings.coldOpenFadeInSec ?? 0,
    coldOpenFadeOutSec: timings.coldOpenFadeOutSec ?? 0,
    // The jingle windows (global times + volume envelopes) exactly as the
    // page's timeline plays them. The outro is shifted onto this render's
    // clock, which differs from the page's when --start/--duration trim the
    // call.
    introWindow: startSec != null ? null : timings.introWindow,
    outroWindow: timings.outroWindow,
    outroShiftSec:
      prerollSec +
      mainSec -
      (timings.prerollMs / 1000 + timings.mainDurationSec),
    endFadeSec: Math.max(0, Math.min(timings.endFadeSec ?? 0, postrollSec)),
  });

  // Frames go to a temp dir; we need real files (not a pipe) so the concat
  // demuxer can use per-frame durations — what kills the cadence drift
  // that fixed-framerate input has. /dev/shm would be RAM-only but this
  // devcontainer caps shm at 64MB, so we fall back to the regular tmp.
  const framesDir = join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });
  const captureLog = [];

  // Encode while capturing: every CHUNK_FRAMES captured frames, the frames so
  // far (minus a margin still being written) are encoded into a CFR segment
  // with an exact frame count and deleted, so the disk never holds more than
  // a couple of chunks of JPEGs (a full 107-min call is ~55 GB of them). The
  // encoder is niced and capped at 8 threads so the realtime capture keeps
  // its cadence; segments are stream-copied together at the end.
  const CHUNK_FRAMES = Math.max(
    600,
    Math.trunc(Number(process.env.VIDEOGEN_CHUNK_FRAMES ?? 6000)),
  );
  const segsDir = join(workDir, "segs");
  await mkdir(segsDir, { recursive: true });
  const segments = []; // { path, frames }
  let emittedFrames = 0; // CFR frames written across all segments
  let encodedUpTo = 0; // captureLog index of the next chunk's first frame
  let encodeChain = Promise.resolve();
  let encodeFailed = null;

  // Encode captured frames [from, to) as one segment. `endT` is the wallclock
  // time the segment must end at (the arrival of frame `to`, or the last
  // frame + one nominal frame for the final chunk); the segment gets exactly
  // round(endT * fps) - emittedFrames output frames so the CFR timeline never
  // drifts at a seam.
  async function encodeChunk(from, to, endT) {
    const startT = captureLog[from].t;
    const want = Math.round(endT * fps) - emittedFrames;
    if (want <= 0) return;
    const lines = ["ffconcat version 1.0"];
    for (let i = from; i < to; i++) {
      const cur = captureLog[i];
      const nextT = i + 1 < to ? captureLog[i + 1].t : endT;
      lines.push(`file '${cur.name}'`);
      lines.push(`duration ${Math.max(0.001, nextT - cur.t).toFixed(4)}`);
    }
    // Repeat the last frame with a second of slack so -frames:v can always be
    // satisfied whatever the rounding of the durations above.
    lines.push(`file '${captureLog[to - 1].name}'`);
    lines.push(`duration 1.0`);
    lines.push(`file '${captureLog[to - 1].name}'`);
    const listPath = join(framesDir, `seg${segments.length}.ffconcat`);
    await writeFile(listPath, lines.join("\n"));
    const segPath = join(
      segsDir,
      `seg${String(segments.length).padStart(4, "0")}.mp4`,
    );
    segments.push({ path: segPath, frames: want });
    emittedFrames += want;
    await run("nice", [
      "-n",
      "10",
      ffmpegPath,
      "-y",
      "-loglevel",
      "error",
      "-threads",
      "8",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-an",
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
      "-frames:v",
      String(want),
      "-video_track_timescale",
      String(fps * 256),
      segPath,
    ]);
    if (debug)
      console.error(
        `  seg ${segments.length - 1}: frames ${from}-${to - 1} (${startT.toFixed(2)}s-${endT.toFixed(2)}s) -> ${want} cfr frames`,
      );
    await Promise.all(
      captureLog
        .slice(from, to)
        .map((f) =>
          rm(join(framesDir, f.name), { force: true }).catch(() => {}),
        ),
    );
  }

  // Queue a chunk encode for everything captured so far, leaving a margin of
  // frames whose files may still be in flight.
  function scheduleChunk() {
    const MARGIN = 120;
    const to = captureLog.length - MARGIN;
    if (to - encodedUpTo < CHUNK_FRAMES) return;
    const from = encodedUpTo;
    encodedUpTo = to;
    const endT = captureLog[to].t;
    encodeChain = encodeChain
      .then(() => encodeChunk(from, to, endT))
      .catch((e) => {
        encodeFailed = encodeFailed ?? e;
      });
  }

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
    scheduleChunk();
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

  if (startSec != null) {
    // Mid-call start: position the transport first and wait for the resting
    // slide overlay to finish fading out, so the first captured frame is the
    // stage and not the tail of the hero card.
    await page.evaluate((s) => window.__seekMain(s), startAt);
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector("#slides");
          if (!el || el.classList.contains("hidden")) return true;
          return parseFloat(getComputedStyle(el).opacity) < 0.01;
        },
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    // ...and let the stage's own CSS transitions (active card, chapter
    // label) finish before the first frame is taken.
    await new Promise((r) => setTimeout(r, 800));
  }
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90, // intermediate frames; 95 needs ~47 GB for a 65-min call
    everyNthFrame: 1,
  });
  // Tiny pause so the first paint flush after startScreencast lands.
  await new Promise((r) => setTimeout(r, 80));

  // Kick off the full preview transport: preroll → main → postroll. When
  // --duration caps mainSec, tell the transport to end the main segment early
  // (window.__capMainAt) so postroll fires at the right time instead of after
  // the full audio (which can be 86 minutes).
  await page.evaluate(
    ({ mainLimit, start }) => {
      if (mainLimit > 0 && typeof window.__capMainAt === "function") {
        window.__capMainAt(mainLimit);
      }
      if (start > 0 && typeof window.__seekMain === "function") {
        window.__seekMain(start);
      }
      document.getElementById("preview-play").click();
    },
    {
      // __capMainAt is on the main-local clock, so the cap is start + length.
      mainLimit: limitDurationSec ? startAt + mainSec : -1,
      start: startAt,
    },
  );

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
    // Clip mode: the window is the whole capture, so stop right after it.
    new Promise((r) =>
      setTimeout(r, clipMode ? mainSec * 1000 + 250 : totalSec * 1000 + 15_000),
    ),
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

  // Clip mode: drop any frames captured past the window (the transport keeps
  // going into the postroll until we stop the screencast).
  if (clipMode) {
    const keep = captureLog.filter((f) => f.t <= mainSec);
    if (keep.length) ((captureLog.length = 0), captureLog.push(...keep));
    if (encodedUpTo > captureLog.length) encodedUpTo = captureLog.length;
  }

  console.log("▸ encoding…");
  // Let queued chunks finish, then encode the tail: the last frame is held
  // for one nominal frame time, and the segment ends there.
  await encodeChain;
  if (encodeFailed) throw encodeFailed;
  if (encodedUpTo < captureLog.length) {
    const last = captureLog[captureLog.length - 1];
    await encodeChunk(encodedUpTo, captureLog.length, last.t + 1 / fps);
  }
  const listPath = join(segsDir, "segments.txt");
  await writeFile(
    listPath,
    segments.map((sg) => `file '${sg.path}'`).join("\n") + "\n",
  );
  const totalFrames = segments.reduce((n, sg) => n + sg.frames, 0);
  console.log(
    `▸ ${segments.length} segment(s), ${totalFrames} frames (${(totalFrames / fps).toFixed(2)}s); muxing audio…`,
  );
  const finalOut = withTimestamp(out);
  const ffArgs = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-itsoffset",
    String(vizOffsetSec),
    "-i",
    fullAudio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
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
  await rm(segsDir, { recursive: true, force: true }).catch(() => {});
  out = finalOut;
}

// Build the full audio track, laid out on one totalSec-long timeline and mixed
// so the jingle crosses the slide/call boundaries instead of hard-cutting:
//
//   0  cold open  preroll        preroll+main                 totalSec
//   |=clip=>|==intro==|=duck/tail=>···call···<=rise=|==outro==|
//
// The cold open plays a stretch of the call; the intro jingle fades in under
// its end, plays over the slides, ducks before the call and tails under the
// first speaker; the outro mirrors it. The jingle envelopes come from the
// page's timeline (window.__timings introWindow/outroWindow, built in
// timeline.ts), so the rendered MP4 and the on-page preview mix identically.
// A silent base of exactly totalSec fixes the length and fills any gaps.
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

  // endFadeSec is already clamped by the caller (to postrollSec).
  const { prerollSec, mainSec, postrollSec, endFadeSec } = opts;
  const mainOffsetSec = Math.max(0, opts.mainOffsetSec ?? 0);
  const totalSec = prerollSec + mainSec + postrollSec;
  const endFade = Math.max(0, endFadeSec ?? 0);
  const ms = (s) => Math.round(s * 1000); // adelay wants integer milliseconds
  // The cold open (if any) fills the head of the preroll with call audio.
  const coldSec = Math.max(0, Math.min(opts.coldOpenSec ?? 0, prerollSec));
  // Piecewise-linear ffmpeg `volume` expression over local time t from a list
  // of [t, v] points; the caller wraps it in quotes inside the filter graph.
  const envelopeExpr = (pts) => {
    let expr = String(pts[pts.length - 1][1]);
    for (let i = pts.length - 1; i >= 1; i--) {
      const [ta, va] = pts[i - 1];
      const [tb, vb] = pts[i];
      const seg =
        tb > ta ? `${va}+(${vb}-${va})*(t-${ta})/${tb - ta}` : String(vb);
      expr = `if(lt(t\,${tb})\,${seg}\,${expr})`;
    }
    return `if(lt(t\,${pts[0][0]})\,${pts[0][1]}\,${expr})`;
  };

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

  // A jingle window from the page's timeline -> one delayed, trimmed,
  // envelope-shaped input. `shift` moves it onto this render's clock.
  const jingleFilter = (idx, w, shift, label) => {
    const start = w.startGlobal + shift;
    const dur = w.endGlobal - w.startGlobal;
    if (dur <= 0 || start + dur <= 0) return;
    const env = envelopeExpr(w.envelope.map((p) => [p.t - w.startGlobal, p.v]));
    filters.push(
      `[${idx}:a]atrim=duration=${dur},asetpts=PTS-STARTPTS,volume='${env}':eval=frame,adelay=${ms(Math.max(0, start))}|${ms(Math.max(0, start))}[${label}]`,
    );
    mixLabels.push(`[${label}]`);
  };

  // Intro: fades in under the end of the cold open (held at the speech level),
  // up to full over the slides, ducks before the call and tails under the
  // first speaker (see timeline.ts for the numbers).
  if (introIdx >= 0 && opts.introWindow)
    jingleFilter(introIdx, opts.introWindow, 0, "pre");

  // The call audio feeds the main segment and, with a cold open, the clip.
  const mainSrc = coldSec > 0 ? "[mainsrc]" : `[${mainIdx}:a]`;
  if (coldSec > 0) {
    filters.push(`[${mainIdx}:a]asplit=2[mainsrc][coldsrc]`);
    // Cold open: the clip from t=0, faded in and out (the fade out overlaps
    // the jingle coming in).
    const fadeIn = Math.max(0.01, opts.coldOpenFadeInSec ?? 0.05);
    const fadeOut = Math.min(opts.coldOpenFadeOutSec ?? 0.3, coldSec / 2);
    filters.push(
      `[coldsrc]atrim=start=${opts.coldOpenFrom}:end=${opts.coldOpenFrom + coldSec},asetpts=PTS-STARTPTS,afade=t=in:d=${fadeIn},afade=t=out:st=${coldSec - fadeOut}:d=${fadeOut}[cold]`,
    );
    mixLabels.push("[cold]");
  }

  // Main call audio: cut leading silence (start at mainOffsetSec) and take
  // mainSec of it, then delay to start after the preroll.
  filters.push(
    `${mainSrc}atrim=start=${mainOffsetSec}:end=${mainOffsetSec + mainSec},asetpts=PTS-STARTPTS,adelay=${ms(prerollSec)}|${ms(prerollSec)}[main]`,
  );
  mixLabels.push("[main]");

  // Outro: rises under the closing words, full over the postroll, out to
  // silence over the last slide.
  if (outroIdx >= 0 && postrollSec > 0 && opts.outroWindow)
    jingleFilter(outroIdx, opts.outroWindow, opts.outroShiftSec ?? 0, "post");

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
