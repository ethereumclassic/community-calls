# TODO

## Inline audio player (videogen-driven, no YouTube)

Upload MP3s of all episodes and build a **dynamic in-browser playback
component** that reuses the videogen stage but is driven by `mp3 + JS` in real
time instead of a pre-rendered MP4. The result is a nice inline player embedded
on the call pages (and/or archive) that shows the synced visuals — roster with
active-speaker focus, captions, chapter chip, audioMotion viz, pre/post-roll
slides — **without relying on a YouTube embed**.

### Why
- Removes the dependency on YouTube for playback on our own site.
- We already render these visuals; this surfaces them live instead of only as a
  downloadable MP4.
- One source of truth: the call markdown already provides transcript, chapters,
  participants, and summary via the videogen endpoints.

### The good news: most of this already exists
The videogen **preview transport** (`src/lib/videogen/preview.ts`) is already a
browser player: it plays the audio element, drives the unified timeline
(preroll slides → main → postroll), syncs the roster/subtitles/chip/viz, and
scrubs across the whole thing. Productionizing it as an embeddable component is
mostly extraction + packaging, not new rendering work.

### Rough plan
- [ ] **Audio hosting** — upload per-episode MP3s somewhere durable and cheap
      (decide where: object storage / CDN; NOT committed to the repo — same
      policy as the gitignored `.m4a`/`.mp4`). Wire a stable per-episode URL.
- [ ] **Extract a reusable player** from `videogen.astro` + `preview.ts` — a
      self-contained component (stage markup + boot) that takes a job
      (`/videogen/<NN>/job.json` from the existing endpoints) and an audio URL,
      and runs the live transport. Drop the dev-only gating for this path.
- [ ] **Embed on call pages** — an inline `<VideogenPlayer call={n} />` that
      lazy-loads (audioMotion, audio decode) and is responsive (the stage is
      authored at 1920×1080; scale it down to fit the content column).
- [ ] **Make it not dev-only** — currently the route + endpoints are stripped
      from prod by the build hook. The player path needs to ship: serve the
      job/meta/transcript (already markdown-derived) in prod, keep the heavy
      render driver dev-only.
- [ ] **Perf** — the full-episode audio decode is heavy (the preview already
      pays this). Consider streaming/seekable decode, or only decoding on play.
- [ ] **UX** — chapter markers on the scrubber, click-to-jump (chapters already
      exist in the timeline), captions toggle, keyboard controls.

### Open questions
- Where do the MP3s live, and how big across all ~58 episodes? (see
  [Episode media hosting](#episode-media-hosting-git-lfs-vs-external-netlify-serving))
- Does the player replace the YouTube embed on call pages, or sit alongside it?
- Mobile layout for a 16:9 stage.

## Episode media hosting (git-lfs vs external; Netlify serving)

Decide how per-episode audio (and any inline-served video) is stored and served
in prod. This is the blocker for the [inline audio player](#inline-audio-player-videogen-driven-no-youtube)
above — that component needs a stable, durable audio URL.

**Immediate trigger:** `public/videogen/53/53-audio.mp3` (~40MB, 64k mono) is
the first per-episode audio we'd keep. It's currently **left uncommitted** — the
videogen skill conventions call `<NN>-audio.mp3` "committed", but there is no
precedent yet and committing raw 40MB blobs per episode (~2GB+ across ~58
episodes) bloats the git pack and every clone. Resolve before publishing more.

### Options to weigh
- [ ] **git-lfs** — track `public/videogen/**/*.mp3` (and maybe a downloadable
      mp4) via LFS. Keeps "one repo" simplicity. Caveats: Netlify does **not**
      smoothly serve LFS pointers (Netlify Large Media is deprecated/EOL), so the
      build would need to materialize the real files, or we serve audio from
      elsewhere anyway — which undercuts the point of LFS.
- [ ] **External object storage + CDN** (Cloudflare R2 / B2 / S3) — upload mp3s
      out of band, reference a stable per-episode URL. Keeps git lean, plays well
      with Netlify (just an `<audio src>` to a CDN), and matches the existing
      policy of gitignoring `.m4a`/`.mp4`. Likely the right answer; pick a
      provider and a naming scheme (`<NN>-audio.mp3`).
- [ ] **Netlify serving path** — confirm how the chosen store is fetched at
      runtime: direct CDN URL (preferred) vs. a Netlify redirect/proxy in
      `netlify.toml`. Note prod strips the dev-only `/videogen` route + assets,
      so audio must NOT depend on that path.

### Decision needed
- [ ] git-lfs vs external storage (recommend external R2/B2 + CDN).
- [ ] Where the inline player's audio URL points, and the same question for any
      downloadable rendered mp4 (the `<YYMMDD>-etccc-<NN>.mp4` handoff output).
- [ ] Backfill plan for existing episodes' audio once the store is chosen.
