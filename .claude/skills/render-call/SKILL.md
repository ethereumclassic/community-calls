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

## Step 2 — Render (the full final by default)

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
  --out public/<YYMMDD>-etccc-<NN>.mp4 --fps 60 --port "$PORT"
kill "$SRV"
```

With `VIDEOGEN_RENDER=1` the server has HMR off, so editing the site on a separate
dev server can't abort the render. (`videogen.mjs` appends a timestamp to the
output name, e.g. `<YYMMDD>-etccc-<NN>-<stamp>.mp4` — rename it to the canonical
`<YYMMDD>-etccc-<NN>.mp4` in Step 3.)

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
   renders to the clean handoff name at the **public root** —
   `<YYMMDD>-etccc-<NN>.mp4` (`date` frontmatter without dashes, last two year
   digits) — so the download URL is tidy and self-identifying. It is gitignored
   (`public/*-etccc-*.mp4`).
   ```bash
   node scripts/videogen.mjs --realtime --job /videogen/<NN>/job.json \
     --out public/<YYMMDD>-etccc-<NN>.mp4 --fps 60 --port "$PORT"
   ```
   The render is real-time (**wall-clock ≈ audio length**), so an 80-min call is an
   ~80-min background job — launch it and let it run. With HMR off on this server,
   you can keep working on the site (on your other dev server) without disturbing it.
   ```bash
   # Optional dev-only draft (ONLY if the user asks): fast, length-capped.
   # node scripts/videogen.mjs --realtime --job /videogen/<NN>/job.json \
   #   --out public/videogen/<NN>/<NN>-draft.mp4 --fps 30 --port "$PORT" --duration 60
   ```

## Step 3 — Output / handoff (serve + paste-ready YouTube block)

Hand the user a downloadable video and everything to publish it.

1. **Rename the render output to the canonical name** the handoff expects:
   ```bash
   mv public/<YYMMDD>-etccc-<NN>-*.mp4 public/<YYMMDD>-etccc-<NN>.mp4
   ```
2. **Serve the file with a plain static server**, not the Astro dev server — the
   Astro dev server does **not** serve a root-level `public/*.mp4` (it 404s even on
   a fresh start; the subdir `<NN>-audio.mp3` serves fine, but the final at the
   public root does not). Stop the render server, free the port, then:
   ```bash
   (cd public && nix run nixpkgs#python3 -- -m http.server "$PORT" --bind 0.0.0.0 &)
   curl -s -I "http://localhost:$PORT/<YYMMDD>-etccc-<NN>.mp4" | head -1   # expect 200 video/mp4
   ```
3. **Print the handoff block** (title / summary / chapters, `0:00` forced first):
   ```bash
   node scripts/videogen-handoff.mjs calls/<id>.md --port "$PORT"
   ```
   The download URL it prints (`http://localhost:$PORT/<YYMMDD>-etccc-<NN>.mp4`) is
   served by the static server. Leave it running so the user can download.
It reads the markdown (frontmatter + `NOTE chapters`) and emits, ready to paste:
- the **download URL** (`http://localhost:<port>/<YYMMDD>-etccc-<NN>.mp4`),
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
