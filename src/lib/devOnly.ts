import type { AstroGlobal } from "astro";

// Shared runtime guard for dev-only routes (videogen, audiogen). Returns a
// redirect Response in a non-dev runtime, or undefined in dev. These routes are
// also physically stripped from the build by `stripDevRoutes` in
// astro.config.mjs; this guard is the belt-and-braces fallback if a dev build
// ever reaches a non-dev runtime. Add a route to DEV_ROUTES there AND guard its
// page with this.
//
// Usage in a page's frontmatter:
//   const guard = devOnlyGuard(Astro);
//   if (guard) return guard;
export function devOnlyGuard(Astro: AstroGlobal): Response | undefined {
  if (!import.meta.env.DEV) return Astro.redirect("/");
}
