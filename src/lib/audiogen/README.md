# audiogen — dev-only audio scratchpad

A browser-based layered acid-techno composer built on [Strudel](https://strudel.cc),
used to design the ETC Community Call intro/outro jingle. Pick one option per
layer (drums / bass / lead / texture), tweak tempo, and record a take.

## This is dev-only and never ships to production

The whole feature is gated to local development and **must not appear on any
production/public route**, but it is fine to keep in the repo. Two independent
mechanisms enforce this:

1. **Runtime guard** — `src/pages/audiogen.astro` does
   `if (!import.meta.env.DEV) return Astro.redirect("/")`, so even if the page
   were served in prod it redirects home.
2. **Build strip** — the `stripDevRoutes` integration in `astro.config.mjs`
   deletes the route from the build output after every `astro build`:
   - `dist/audiogen/` and `dist/audiogen.html` (the page, both build formats)
   - the route's `_astro/*` JS chunks
   Add a new dev-only route by appending an entry to `DEV_ROUTES` in
   `astro.config.mjs` — nothing else is needed.

The reference recording is **not** in `public/` (so it is never copied into the
build in the first place — it does not rely on the strip). It lives in
`assets/audiogen/` and is served at `/audiogen/recording.mp3` only in dev, by
the `audiogenDevRecording` Vite plugin (`apply: "serve"`).

Verify after a build: `find dist -iname "*audiogen*" -o -iname "*.mp3"` should be
empty.

## What lives where

- `src/pages/audiogen.astro` — markup shell + styles, loads `@strudel/web` from a
  CDN (Strudel is AGPL-3.0, so it is never bundled into our build).
- `src/lib/audiogen/layers.ts` — the 4 layers × 16 options and `compose()`.
- `src/lib/audiogen/boot.ts` — UI wiring, the master-output tap (Stop/mute +
  bar-aligned WAV recording), URL state.
- `src/lib/audiogen/wav.ts` — WAV encoder + peak normalizer.
- `assets/audiogen/recording.mp3` — the committed reference take (see below).
  Outside `public/`/`src/` because it is a media asset, not a served route asset
  or imported source; consumed directly by videogen later.

## Recordings

- The in-app **Record** button captures live output as lossless **WAV**
  (download + preview), trimmed to a whole number of 16-beat phrases so it loops
  cleanly. Length defaults to 1 minute (`?rec=<seconds>` overrides).
- The committed reference take is **`assets/audiogen/recording.mp3`** — a
  high-quality (320 kbps) **lossy** MP3, kept small enough to commit. The
  **♪ Play recording** button plays it. It is served only in dev (via the
  `audiogenDevRecording` Vite plugin) and is never part of the build. This is
  the artifact videogen will consume later; the audiogen UI is just the tool
  that produces it.

## Running locally

Behind a proxy, pass the hostname (see project `AGENTS.md`):

```
CHOKIDAR_USEPOLLING=true __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<host> \
  npm run dev -- --host 0.0.0.0 --port 4322
```

Then open `/audiogen`. State (layer picks + tempo) is encoded in the URL, e.g.
`/audiogen?drums=15&bass=13&lead=6&texture=10&bpm=145`.
