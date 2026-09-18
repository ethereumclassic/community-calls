Run `npm run quickfix` periodically while editing code to catch issues early.

Icons must be explicitly listed in `astro.config.mjs` under `icon.include.lucide` before use.

When starting the dev server behind a proxy (e.g. Coder), pass the hostname via env var: `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<hostname> npm run dev -- --host 0.0.0.0`

## Dev-only routes

Some routes (`/videogen`, `/audiogen`) are local-development tools and must never ship to production, but they are fine to keep in the repo (source and any `public/<route>/` assets). They are kept out of prod two ways: a runtime guard (`if (!import.meta.env.DEV) return Astro.redirect("/")`) and the `stripDevRoutes` integration in `astro.config.mjs`, which deletes the route's page, html, `public/` assets, and `_astro` chunks from `dist/` after every build. Register a new one by adding it to `DEV_ROUTES`. See `src/lib/audiogen/README.md`.

## Rendering call videos

The final render **must** be `node scripts/videogen.mjs --realtime …`. Use the
command in the `render-call` skill verbatim; do not rebuild it from
`videogen.mjs`'s flags. Without `--realtime` the deterministic per-frame path
runs instead and silently drops the preroll/postroll slides and the intro/outro
jingles, and renders a coarse, seek-driven visualiser. Confirm from the log line
in the first minute: `▸ realtime capture: …s (…preroll + …main + …postroll)` is
correct, `▸ deterministic: …` is not. A finished render must be **longer** than
`public/videogen/<NN>/<NN>-audio.mp3`; if the two durations match, it is wrong.

Getting the recording out of Zoom needs Playwright, not `yt-dlp` (its Zoom
extractor no longer parses the play page), and Playwright's bundled Chromium
cannot launch in this devcontainer — point
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a Nix-built chromium.

## Call media

The episode markdown is the public record and carries no render settings.
Video settings (display windows) are in `calls/video/<id>.yaml`. Per-call media
is not in git: the distributable audio and display clips live on the call's
GitHub release (`call-<NN>`) and locally under `public/videogen/<NN>/` and
`.cache/videogen/<id>/`; `node scripts/videogen/media.mjs pull <NN>` fetches
them. Renders are never stored; YouTube has the published copy.

## Writing Style for Call Agendas

- Use neutral language. Pose suggestions as questions rather than making declarative statements. The agenda should facilitate discussion, not advocate positions.
  - Good: "Should this be the focus of the next hard fork?"
  - Bad: "This should be the focus of the next hard fork."
- No em dashes.