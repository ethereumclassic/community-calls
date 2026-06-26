Run `npm run quickfix` periodically while editing code to catch issues early.

Icons must be explicitly listed in `astro.config.mjs` under `icon.include.lucide` before use.

When starting the dev server behind a proxy (e.g. Coder), pass the hostname via env var: `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<hostname> npm run dev -- --host 0.0.0.0`

## Dev-only routes

Some routes (`/videogen`, `/audiogen`) are local-development tools and must never ship to production, but they are fine to keep in the repo (source and any `public/<route>/` assets). They are kept out of prod two ways: a runtime guard (`if (!import.meta.env.DEV) return Astro.redirect("/")`) and the `stripDevRoutes` integration in `astro.config.mjs`, which deletes the route's page, html, `public/` assets, and `_astro` chunks from `dist/` after every build. Register a new one by adding it to `DEV_ROUTES`. See `src/lib/audiogen/README.md`.

## Writing Style for Call Agendas

- Use neutral language. Pose suggestions as questions rather than making declarative statements. The agenda should facilitate discussion, not advocate positions.
  - Good: "Should this be the focus of the next hard fork?"
  - Bad: "This should be the focus of the next hard fork."
- No em dashes.