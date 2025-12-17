# ETC Community Calls - Astro SSG Conversion Plan

**URL:** https://cc.ethereumclassic.org

## Project Structure

```
/
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
├── tsconfig.json
├── public/
│   ├── etc_cc_logo.png
│   └── img/
│       └── afternoon_tea_and_etc.jpeg
├── src/
│   ├── content.config.ts          # Content collection schemas
│   ├── layouts/
│   │   └── Layout.astro           # Base layout with DaisyUI
│   ├── pages/
│   │   ├── index.astro            # Landing page
│   │   └── calls/
│   │       └── [...slug].astro    # Dynamic call pages
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── CallCard.astro         # Card for call listings
│   └── styles/
│       └── global.css             # Tailwind imports + ETC theme tweaks
└── src/content/
    └── calls/
        ├── 20210309_001.md
        ├── ... (all 44 call files)
        └── recurring_tea_and_etc.md
```

## Normalized Frontmatter Schema

All call markdown files will use this consistent schema:

```yaml
---
title: "ETC Community Call 044"           # Display title
description: "1559 Strikes Back"          # Short description/tagline
date: 2025-12-05                          # Single date OR
dates: [2021-05-11, 2021-06-08]           # Array for recurring events
time: "1500 UTC"
location: "Zoom"                          # Discord, Zoom, Twitter Spaces
youtube: "https://www.youtube.com/watch?v=FtgqlsATEe0"  # Optional
host: "Istora"                            # Optional
cohost: "BrotherLal"                      # Optional
---
```

## URL Slug Format

`/calls/2025-12-05-044-1559-strikes-back`

Generated from: `{date}-{call-number}-{slugified-description}`

## Implementation Steps

### Phase 1: Astro Project Setup
1. Initialize Astro project with `npm create astro@latest`
2. Install dependencies: `@astrojs/tailwind`, `tailwindcss`, `daisyui`
3. Configure `astro.config.mjs` for static output
4. Configure `tailwind.config.mjs` with DaisyUI plugin and ETC color tweaks
5. Create base layout with DaisyUI components

### Phase 2: Content Collection Setup
1. Create `src/content.config.ts` with Zod schema for calls
2. Define schema with optional `youtube`, `dates` array support
3. Set up glob loader for `src/content/calls/*.md`

### Phase 3: Move & Normalize Markdown Files
1. Move all `YYYYMMDD_NNN.md` files to `src/content/calls/`
2. Delete `_template.md` and `_script.md`
3. Convert `recurring_call_Tea_and_ETC.md` to new format with dates array
4. Normalize frontmatter across all files:
   - Add `title` field (e.g., "ETC Community Call 010")
   - Standardize `description` field
   - Add `youtube` field where recordings exist
   - Ensure consistent date format

### Phase 4: Build Pages
1. Create landing page (`src/pages/index.astro`):
   - Hero with logo
   - Detailed explainer section:
     - What the community calls are
     - When they happen (schedule/frequency)
     - How to join (Discord, Zoom links)
     - Links to Discord server and YouTube channel
   - List of recent/upcoming calls
2. Create call listing/archive section
3. Create dynamic call page (`src/pages/calls/[...slug].astro`):
   - Generate slug from date-number-title
   - Render markdown content
   - Embed YouTube video if available
   - Show call metadata

### Phase 4.5: Find YouTube Links
1. Search @ETCCommunityCalls YouTube channel for existing recordings
2. Match videos to call files by date/title
3. Add `youtube` field to frontmatter for all found recordings

### Phase 5: Static Assets
1. Move images to `public/` folder
2. Update image references in markdown files

## Files to Delete
- `_template.md`
- `_script.md`
- `*.xcf` (GIMP files - not needed for web)

## Files to Move
- `etc_cc_logo.png` → `public/`
- `etc_cc_005.png`, `etc_cc_006.png` → `public/`
- `UTC.png`, `220118-UTC1400.png` → `public/img/`
- `img/afternoon_tea_and_etc.jpeg` → `public/img/`

## DaisyUI Theme
Use DaisyUI default theme with minor ETC-specific tweaks:
- Primary color: ETC green (#3ab83a or similar)
- Keep most defaults for simplicity

## Initial Scope (Basic Framework & Routes)

For this first implementation pass, we will:
1. Set up Astro project with Tailwind + DaisyUI
2. Create content collection schema
3. Move markdown files to `src/content/calls/`
4. Build landing page (basic)
5. Build dynamic call pages with working routes
6. Basic styling with DaisyUI

**Deferred to later:**
- Full frontmatter normalization for all 44 files
- YouTube link discovery for all files
- Polish/refinement of UI
- Detailed landing page content

## Questions Resolved
- URL slug: `{date}-{number}-{title-slug}`
- Normalize frontmatter: Yes
- YouTube: Add to frontmatter
- Support files: Delete template/script, convert recurring to dates array
- Styling: DaisyUI + Tailwind with ETC theme tweaks
