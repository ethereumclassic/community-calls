---
name: videogen
description: Orchestrate the full call pipeline end to end — from a transcript to a published call page (cleaned transcript, chapters, AI summary) and a rendered video. Inspects the call markdown to see what's already done, proposes the remaining steps, and composes the per-stage skills, confirming before the render. Use for the whole flow; for a single part, run that step's skill directly.
---

# Videogen Skill (orchestrator)

Composes the call pipeline. It does not itself clean transcripts or render — it
**identifies the call, inspects what's already done, proposes a pipeline, and runs
the per-stage skills** with confirmation at each gate. The real work lives in:

- **`diarize`** — *(weird case, on-demand)* fix speaker labels when one Zoom
  participant is actually two+ people. Most calls skip this.
- **`call-markdown`** — clean transcript + chapters + AI summary → `calls/<id>.md`
  (the "update the markdown" half).
- **`render-call`** — render the MP4 + YouTube handoff block (the "make the
  video" half).

You can always run those directly when you only want one part. Use `videogen`
when you want the whole flow driven and gated for you.

## Arguments

`$ARGUMENTS` may be a bare call number, file paths, or both. Resolve the call id
first (from args, filenames, or by asking). `<id>` = the `calls/<id>.md` basename,
e.g. `20260612_054`; `<NN>` = the call number.

## Step 0 — Identify the call (confirm)

1. Find the call's markdown in `calls/` (match the `number:` frontmatter). If none
   exists, ask the user to create the agenda first (or offer `/draft-agenda`).
2. **Published-call guard.** If the markdown already contains BOTH a `# AI Summary`
   AND a ` ```webvtt ` transcript block, the call is already published. Warn that
   re-running stages would overwrite published content; only continue on an
   explicit stage the user asks for, never a blind full re-run.
3. Read the most recent *completed* call (one with a `# AI Summary` + `webvtt`
   transcript) — the **style template** for the summary/structure. Replicate it.
4. Confirm the call identity (number, title, date) with the user.

## Step 1 — Inspect state and propose the pipeline

Read `calls/<id>.md` and detect which stages are done, by content marker:

| Stage | Skill | Done when the markdown has… |
|---|---|---|
| Transcript | `call-markdown` (A) | a ` ```webvtt ` block under `## Full Transcript` |
| Chapters | `call-markdown` (B) | `NOTE chapters` inside that block |
| Summary | `call-markdown` (C) | a `# AI Summary` section |
| Video | `render-call` | a rendered `<YYMMDD>-etccc-<NN>.mp4` exists (gitignored) |

Also check inputs: is there a transcript at `transcripts/<id>.vtt` (or a
`transcripts/<id>.diarized.vtt`)? If neither exists, prompt the user to drop the
original transcript at **`transcripts/<id>.vtt`** (see `call-markdown` for why
that location).

**Does it need diarization?** Only if the user says so, or `transcripts/<id>.vtt`
shows one Zoom label covering two obviously different people (a shared
mic/account). If so, recommend running the **`diarize`** skill first (it writes
`transcripts/<id>.diarized.vtt`, which `call-markdown` then prefers). Do **not**
auto-run it; most calls don't need it.

Then **present the proposed pipeline** and confirm before doing anything, e.g.:

> "Transcript ✓, chapters ✓, summary ✗, video ✗. Plan: finish the summary via
> `call-markdown`, then — with your OK — render via `render-call`. Sound good?"

If the user only wants the markdown (no video), stop after `call-markdown`.

## Step 2 — Run the stages (gated)

In order, skipping what's already done:

1. **(if needed) `diarize`** — separate, on-demand; produces the diarized
   transcript. Hand its output to the next stage.
2. **`call-markdown`** — runs the missing text stage(s) (clean / chapters /
   summary / write), each with its own confirm gate. This produces the complete
   `calls/<id>.md`.
3. **Confirm before rendering.** This is the key gate: only proceed to video once
   the user approves. Many runs legitimately stop here.
4. **`render-call`** — draft → final MP4 + the paste-ready YouTube handoff.

Invoke each sub-skill rather than re-implementing it; this file is only the
conductor.

## Important notes

- **Confirm at every gate; never run the whole pipeline unattended**, and always
  pause before the render.
- **Single source of truth is the markdown** — never write the legacy
  `public/videogen/<NN>/{job,meta,transcript}` files.
- **Never commit or push media.** `calls/<id>.md`, `transcripts/<id>*.vtt`,
  `speakers/` (yaml + avatars), and the committable `<NN>-audio.mp3` are
  committable — but only commit when the user asks.
