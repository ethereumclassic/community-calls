---
name: render-call
description: Render the full call video (MP4) from a completed call markdown, and produce the paste-ready YouTube handoff block (download URL, title, description, chapters). This is the "make the video" half of the call pipeline; run it when the markdown is already done and you want the video. Renders the full final by default (no draft unless asked). Needs the distributable audio mp3 to exist.
---

# Render-Call Skill

Takes a **completed** `calls/<id>.md` (cleaned transcript + `NOTE chapters` + AI
summary — produced by `call-markdown`) and turns it into a rendered MP4 plus
everything needed to publish it. It writes **no** markdown and does **no**
transcript work; that's `call-markdown`.

**Prerequisite check first.** The render drives the live call page, which reads
`/videogen/<NN>/job.json` (derived from the markdown) and the distributable
audio. Confirm the markdown is complete (transcript + chapters + summary). If
chapters or summary are missing, send the user to `call-markdown` first.

Operate one step at a time and CONFIRM. **Never commit or push media.**

## Step 1 — Ensure the distributable audio exists

The page/job point at the committable mono mp3 at
`public/videogen/<NN>/<NN>-audio.mp3` (`<NN>` = call number). If it's missing,
produce it. **How the recording is obtained is left open** — a dropped mp4/audio
file, a path the user gives, etc.; work out what's available. Once you have a
working file, transcode to the distributable mp3 with the bundled ffmpeg (resolve
its path first):

```bash
FF=$(node -e "console.log(require('ffmpeg-static'))")
"$FF" -y -i <recording-or-working-audio> -vn -ac 1 -b:a 64k \
  public/videogen/<NN>/<NN>-audio.mp3
```

`<NN>-audio.mp3` is committable; any `<NN>-audio.m4a`/mp4 working file is
gitignored (70 MB+) and never committed. Verify the page boots against
`/videogen/<NN>/job.json` and the roster resolves before rendering.

## Step 1b — Display windows (assets shown while they are discussed)

The stage has a **display mode**: for a window of the call the waveform is
replaced by an asset (image or clip), the roster slides into a small stack on
the left, and header / subtitles / chapter bar stay put with a vignette
underneath. Windows come from the call markdown frontmatter:

```yaml
displays:
  - from: "20:03.2"          # transcript clock, [h:]mm:ss[.ms] (cue starts)
    to: "22:18.5"
    src: ./media/lady-justice-reference.webp   # calls/media/<file>, or a URL
    zoomFrom: 2.9            # image only: open on a close-up (focus) and
    zoomTo: 1                #   settle out to the whole picture
    focus: "50% 16%"         #   point held on screen at max zoom
  - from: "22:18.5"
    to: "22:50.5"
    src: ./media/etc-rebrand-concept.mp4
    rate: 0.5                # video only: playback rate
    loop: true               #   loop to fill the window
```

- Abutting windows share one layout session (only a cross-fade between them).
- **Propose windows from the transcript.** Scan the cleaned transcript for
  anything named or pointed to (a site, a dashboard, a release, a design, a
  clip) and list candidates with times and a source. Capture public pages with
  Playwright (see `scripts/videogen/capture-page-vt.mjs` for a virtual-time
  60fps capture of an animated page; a plain `recordVideo` capture of a
  software-GL page paints ~11 fps and judders). Crop dashboards to the part
  being discussed. Ask the user for assets you cannot fetch (X posts, photos).
- Assets go in `calls/media/` (committable, served in dev at `/calls-media/`).
- Check the windows before rendering: `scripts/videogen/shot-display.mjs` seeks the
  page to chosen main-local times and screenshots them.
- The title card carries the brand art from `VIDEOGEN_CONFIG.titleArt`.

**Before any render, probe the live visualiser.** Load
`/videogen?job=…&preview=1`, `__seekMain(t)` into the call, click play, and
confirm `#ama canvas` exists and `#viz` is hidden
(`scripts/videogen/probe-ama.mjs`). A 504 "Outdated Optimize Dep" on the analyser
import leaves the deterministic canvas in place and the waveform wrong.

## Step 2 — Render (the full final by default)

> **`--realtime` is mandatory. Copy the command below verbatim.**
> Do **not** reconstruct it from `videogen.mjs`'s `parseArgs` flags. Without
> `--realtime`, `videogen.mjs` silently takes the deterministic per-frame path
> and produces a video that is wrong in two ways that are easy to miss:
> - it renders only `window.__duration` (the bare audio length), so there are
>   **no preroll/postroll slides and no intro/outro jingles**;
> - it drives the visualiser by seeking instead of a live `AnalyserNode`, so the
>   **spectrum renders coarse and low-detail**.
>
> Both paths otherwise log and finish normally. **Check the log line within the
> first minute** — it tells you which path you are on:
> ```
> ▸ realtime capture: 3646.87s (14.5s preroll + 3620.87s main + 11.5s postroll)   ← correct
> ▸ deterministic: 3626.24s → 217574 frames @ 60fps                               ← WRONG, kill it
> ```
> Deterministic is also far slower in wall-clock (a 60-min call took ~3 h) while
> realtime is ~= audio length, so a render that quotes a multi-hour ETA is
> another tell.

**Run the render server and the render as ONE background task** (the server as a
child process), and do **not** spawn other background tasks (especially `Monitor`)
while it runs. There is a concurrency cap on background tasks — extra ones SIGTERM
the oldest, and that silently kills the render server mid-render. A small
orchestration script avoids it: start the server, wait until it serves, run the
render in the foreground, then stop the server — all in one task. Check progress
by reading the task's output file, not with a Monitor.

```bash
# one task: server (child, HMR off) + render
VIDEOGEN_RENDER=1 __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$(hostname)" \
  npm run dev -- --port "$PORT" --host 0.0.0.0 > /tmp/rendersrv.log 2>&1 &
SRV=$!
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/videogen/<NN>/job.json)" = 200 ]; do sleep 2; done
node scripts/videogen.mjs --realtime --job /videogen/<NN>/job.json \
  --out .cache/videogen/<id>/render.mp4 --fps 60 --port "$PORT"
kill "$SRV"
```

With `VIDEOGEN_RENDER=1` the server has HMR off, so editing the site on a separate
dev server can't abort the render. (`videogen.mjs` appends a timestamp to the
output name, e.g. `render-<stamp>.mp4` — rename it to the canonical
`render.mp4` in Step 3.)

1. **Start a dedicated render server on its own random port, with HMR disabled.**
   The `/videogen` route is dev-only (it can't run under `astro preview`), so this
   is a normal `astro dev` server — but `VIDEOGEN_RENDER=1` turns HMR off
   (`astro.config.mjs`), so editing the website on your **separate** working dev
   server can never reload the capture page and abort the render. Use a random
   high port so the two never collide, and start it **after** the audio mp3 exists
   (a file in a directory that did not exist at server startup 404s):
   ```bash
   PORT=$((20000 + RANDOM % 20000))
   VIDEOGEN_RENDER=1 __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=$(hostname) \
     npm run dev -- --port "$PORT" --host 0.0.0.0   # background; note $PORT
   ```
   Wait for it to be ready and confirm the audio serves
   (`curl -o /dev/null -w '%{http_code}' http://localhost:$PORT/videogen/<NN>/<NN>-audio.mp3`
   → 200) before rendering.
2. **Render the full final** — this is the default; do **not** make a draft unless
   the user explicitly asks for one (drafts are a dev-only convenience). The final
   renders into the call's local cache, `.cache/videogen/<id>/render.mp4`
   (gitignored; `<id>` is the markdown basename). Renders are never stored
   anywhere else: YouTube has the published copy and the cache plus the markdown
   reproduce it.
   ```bash
   node scripts/videogen.mjs --realtime --job /videogen/<NN>/job.json \
     --out .cache/videogen/<id>/render.mp4 --fps 60 --port "$PORT"
   ```
   The render is real-time (**wall-clock ≈ audio length**), so an 80-min call is an
   ~80-min background job — launch it and let it run. With HMR off on this server,
   you can keep working on the site (on your other dev server) without disturbing it.
   ```bash
   # Optional dev-only draft (ONLY if the user asks): fast, length-capped.
   # node scripts/videogen.mjs --realtime --job /videogen/<NN>/job.json \
   #   --out public/videogen/<NN>/<NN>-draft.mp4 --fps 30 --port "$PORT" --duration 60
   ```

3. **Verify the render before doing anything else with it.** Two cheap checks
   that catch a deterministic-path render, a missing avatar, and a truncated
   capture:
   ```bash
   # duration MUST exceed the call audio (preroll + postroll are added)
   ffprobe -v error -show_entries format=duration -of csv=p=0 .cache/videogen/<id>/render.mp4
   ffprobe -v error -show_entries format=duration -of csv=p=0 public/videogen/<NN>/<NN>-audio.mp3
   ```
   If the two are equal, you rendered the deterministic path — re-render with
   `--realtime`. Then pull a frame from inside the preroll (e.g. `-ss 3`) and one
   from the postroll (`duration - 3`) and actually look at them: you should see
   the hero/title/toc/stats slides at the head and thanks/logo at the tail.

4. **Roster avatars must resolve before you start.** A participant with a null or
   404 avatar renders as initials and you only find out hours later. Assert it up
   front against the render server:
   ```bash
   curl -s "http://localhost:$PORT/videogen/<NN>/job.json" |
     node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
       for(const p of j.participants){ if(!p.avatar) throw new Error("null avatar: "+p.name);
         console.log(p.name,p.avatar); }})'
   # then curl each path and require 200
   ```
   Avatars live in **`public/speakers/`** (not `speakers/`, which holds only the
   yaml) — `speakers.yaml`'s `avatar:` is a bare filename resolved against that
   directory.

5. **Killing the render server needs the PID of the node child.** `npm run dev`
   /`npx astro dev` forks; killing the wrapper leaves `node .../astro dev --port
   <PORT>` holding the port. Kill by matching that child, and never
   `pkill -f "astro dev"` from a shell whose own command line contains that
   string — it matches itself and kills your shell (exit 144).

## Step 2b — Re-rendering one window instead of the whole call

`scripts/videogen.mjs --realtime --start <main-local-sec> --duration <sec>`
renders a window (no preroll; main-local = transcript time minus the head
trim from `window.__timings`). To splice it into a finished render see
`scripts/videogen/splice.sh`: build the replacement piece with two `xfade`
dissolves so it is exactly keyframe-to-keyframe long, split the base with the
**segment muxer** (`-f segment -segment_times …`, frame-exact; a `-ss/-to`
stream copy lands a frame early and late), concat, and put the base audio
back. Seams show a waveform mismatch, so prefer a full re-render when more
than a couple of windows change.

## Step 2c — (only if the call had a screen share) composite it on

Some calls include a shared screen worth showing (Call 56 SaturnDEX, Call 58
quantum deck). The base render is audio-viz only; the share is composited on
afterwards from the **raw Zoom recording**.

**Audit the share for PII first.** Anything outside a fullscreen app exposes
browser chrome — tabs, address bar (session tokens, private doc ids), bookmarks,
the account avatar, the macOS menu bar clock and the Dock. Prefer **cutting back
to the audio viz** whenever the content is not fullscreen over blurring it: the
cut removes the risk instead of masking it, and the non-fullscreen stretches are
usually just the meeting client mirroring itself. Blur (`gblur` boxes gated to
time windows) is the fallback when the non-fullscreen part actually has content.

**Map recording time onto video time — this is the step that goes wrong.**
The rendered video is *not* on the same clock as the recording. Two shifts stack:

```
video_t = prerollSec + (recording_t - mainAudioOffsetSec)
```

**Read both numbers from `window.__timings`, never infer them.** Drive the page
with Playwright and dump it (see `tmp/etccc58/read-timings.mjs`):

```js
const t = await p.evaluate(() => window.__timings);
// { prerollMs: 14500, postrollMs: 11500, mainDurationSec: 3620.87,
//   mainAudioOffsetSec: 2.55, overlapSec: 8, endFadeSec: 2.5, … }
```

Two traps, both of which cost a re-encode on Call 58:

- **Do not compute the head trim as `audioDuration - mainDurationSec`.** On Call
  58 that is `3626.24 - 3620.87 = 5.37`, but the real `mainAudioOffsetSec` is
  **2.55** — the difference also contains a *tail* trim. Using 5.37 put the deck
  2.8s ahead of the speaker: the content still looked clean, so it passes a
  frame-by-frame PII check and only shows up as the slides changing slightly
  before they are talked about.
- **Do not assume the `SLIDE_MS` constants in `timeline.ts` sum to the preroll** —
  slides are skipped when their meta is missing.

Call 58: `14.5 + (recording_t - 2.55)` = `recording_t + 11.95`, so 368.5 →
**380.45** and 1431.5 → **1443.45**.

**The same shift applies to the YouTube chapters.** Set `youtubeOffset:` in the
call frontmatter to `prerollSec - mainAudioOffsetSec` (rounded — 12 for Call 58);
`videogen-handoff.mjs` adds it to every chapter after the first, which it pins to
`0:00`. Sanity-check by stepping frames either side of a chapter boundary that
falls **outside** the screen-share window — inside it the overlay hides the
chapter label.

**Restore the branding.** A fullscreen share covers the whole frame, so capture
the page's real `.header .left` element (`omitBackground`) plus its bounding box,
build a shadowed copy on a fixed canvas, and overlay it back at its true page
position. Only the left header is restored, matching Call 56.

**Composite in one pass**, not cut-and-concat — no keyframe-aligned seams, and
`-c:a copy` from the base render means audio cannot drift:

```
[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=...,format=yuva420p,
     fade=in:st=0:d=0.6:alpha=1,fade=out:st=<dur-0.6>:d=0.6:alpha=1,
     setpts=PTS+<video_in>/TB[s1];
[0:v][s1]overlay=0:0:enable='between(t,<video_in>,<video_out>)':eof_action=pass:repeatlast=0[bb1];
[2:v]format=yuva420p,fade=...[hd];
[bb1][hd]overlay=<hx>:<hy>:enable='between(t,<video_in>,<video_out>)'[vout]
```

Always test the two transitions on short slices (`-t` for the head, `-copyts -ss`
for the tail) before committing to the full-length encode.

## Step 3 — Output / handoff (review page + paste-ready YouTube block)

Hand the user a reviewable, downloadable video and everything to publish it.

1. **Rename the render output to the canonical name**:
   ```bash
   mv .cache/videogen/<id>/render-*.mp4 .cache/videogen/<id>/render.mp4
   ```
2. **Review it on the working dev server** (port 4321, HMR on — not the render
   server). `/videogen/<NN>/review` is the dev-only review page: a wide
   scrubber with chapters and display windows marked, keyboard transport, a
   Range-served download of the render, and one-off clip renders of any range
   (`I`/`O` at the playhead, or "use hovered window", then "render clip"; clips
   land in `.cache/videogen/<id>/clips/` and play inline). The render itself is
   served at `/videogen-cache/<id>/render.mp4`. No separate static server: the
   `videogen-cache-dev` plugin in `astro.config.mjs` serves the cache with Range
   support, which the Astro dev server alone would not do for a big mp4.
3. **Print the handoff block** (title / summary / chapters, `0:00` forced first):
   ```bash
   node scripts/videogen-handoff.mjs calls/<id>.md --port 4321
   ```
It reads the markdown (frontmatter + `NOTE chapters`) and emits, ready to paste:
- the **download URL** (`http://localhost:<port>/videogen-cache/<id>/render.mp4`)
  and the review page URL,
- the **video title** (`<title> - Ethereum Classic Community Call #<N>`),
- the **summary** blurb (the YouTube description body),
- the **chapters** in YouTube format — **first line forced to `0:00`** (YouTube
  requires it; our timeline opens a few seconds in), the rest on the real
  timeline,
- the **call-page URL** linking back to the transcript.

Present that block verbatim and tell the user: download the video, upload to
YouTube, paste the title / summary+chapters / link into the YouTube fields.
(YouTube derives chapter markers from the description timestamps; it ignores any
chapters embedded in the file.) Once uploaded, capture the 11-char id into
`youtube:` frontmatter so the transcript timestamps deep-link correctly (that's a
one-line markdown edit — fine to do after the render).

## Notes

- Never commit or push media (`<NN>-out-*.mp4`, the handoff mp4, working m4a). The
  committable distributable audio is the mono `<NN>-audio.mp3`.
- If you touched wired code (endpoints, `speakers/speakers.yaml`), it's already
  wired; just verify the page boots against `/videogen/<NN>/job.json`.
