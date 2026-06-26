---
name: call-markdown
description: Turn a call transcript into the committable call markdown — cleaned transcript + chapters + AI summary — without rendering any video. Content-aware: it inspects calls/<id>.md and runs only the stages not yet done (or the one you ask for). This is the "update the markdown" half of the call pipeline; use it directly when you want to process or fix a call's text without making a video.
---

# Call-Markdown Skill

Builds the **one committable text artifact** for a call — `calls/<id>.md` — from a
transcript: a cleaned `## Full Transcript` (with a `NOTE chapters` block) plus a
`# AI Summary` and `## Key Points Discussed`. It does **no** audio and **no**
video; that is `render-call`. Run this whenever you want to update a call's
markdown — first processing, or fixing one part later.

**Content-aware.** Inspect `calls/<id>.md` first and run only what's missing, or
the specific stage the user asks for. Stages and their done-markers:

| Stage | Produces | Done when the markdown has… |
|---|---|---|
| A — Clean transcript + speakers | `## Full Transcript` ` ```webvtt ` block | a ` ```webvtt ` block |
| B — Chapters | `NOTE chapters` inside that block | `NOTE chapters` in the block |
| C — Summary + key points + blurb | `# AI Summary`, `## Key Points`, `summary:` | a `# AI Summary` section |

**Operate one stage at a time and CONFIRM before moving on.** Show proposed
changes, let the user edit, then proceed. Never auto-run all stages silently.

## Inputs and the transcript drop location

- **Call id** `<id>` = the `calls/<id>.md` basename, e.g. `20260612_054`. The
  agenda markdown usually already exists.
- **A transcript.** The recommended, canonical place to drop the original
  transcript is **`transcripts/<id>.vtt`** (top-level `transcripts/`, a sibling of
  `calls/`). It is **not** under `public/` so it is never served or built — it is
  pure reference input that this skill reads to populate the markdown. If the user
  has a transcript file elsewhere, prompt them to drop (a copy of) it at
  `transcripts/<id>.vtt`. Both the original and any diarized version are
  committed (text reference of record); never overwrite the original on re-runs.
- **If the call needed diarization** (a shared-mic / shared-account call, handled
  by the separate `diarize` skill), read **`transcripts/<id>.diarized.vtt`**
  instead — it is the corrected, cue-split reference. Prefer the `.diarized.vtt`
  when present.

Throughout, "the raw transcript" means whichever of these you consumed
(`transcripts/<id>.diarized.vtt` if present, else `transcripts/<id>.vtt`).

## Conventions (ground truth)

- The committable artifact is `calls/<id>.md`. Preserve its existing frontmatter
  and agenda; this skill only adds/edits the transcript, chapters, and summary
  sections.
- The page derives job/meta/transcript from the markdown via the dev-only
  endpoints in `src/pages/videogen/[call]/`. **Do not** write
  `public/videogen/<NN>/{job,meta,transcript}` files — the markdown is the single
  source of truth.
- **Speaker registry** (`speakers/speakers.yaml`): maps a key → `{ displayName,
  aliases, avatar, github }`. `resolveSpeaker()` (`src/lib/videogen/speakers.ts`)
  matches a label against key/displayName/aliases. Every label in the cleaned
  transcript must resolve.
- **Committable:** `calls/<id>.md`, `transcripts/<id>*.vtt`, `speakers/speakers.yaml`
  + avatars. Only commit when the user asks.

## Stage A — Clean the transcript + speakers (review, confirm)

The original at `transcripts/<id>.vtt` is the immutable reference; never edit it.
The cleaned version goes into the markdown.

1. **Deterministic pre-pass — BEFORE any agents (plain code, no LLM).** Three
   mechanical, repeatable transforms that also make the agents' job easier:
   - **Normalize known speaker labels** against `speakers/speakers.yaml` — map
     every label that resolves (key / displayName / alias, case-insensitive) to
     the canonical `displayName`. A label that does **not** resolve is left
     untouched and surfaced in item 3; never guess here.
   - **Apply the glossary** in `speakers/glossary.yaml` — for each canonical entry,
     replace any listed `aliases` (known ASR mishearings, e.g. `Firo`→`Phyro`,
     `CoreGet`→`Core-Geth`) with the canonical spelling, word-boundary-matched,
     longest alias first. This bakes in corrections the user has already approved
     so the agents don't re-litigate them.
   - **One subtitle per sentence.** Two sub-steps that together give
     sentence-level granularity (never giant multi-sentence walls, never a
     sentence split mid-word):
     1. **Split** each cue at every internal **hard** sentence terminal —
        `.` `?` `!` (optionally a closing quote) followed by whitespace. A cue can
        hold several complete sentences (the ASR/diarizer emits long cues); break
        them. The split time is **interpolated within the cue** by character
        position, so every boundary lands inside a real raw cue (the validator's
        parity allows a boundary strictly *inside* a raw cue, not only on its
        edges).
     2. **Stitch** across cues: merge a piece into the running block **while that
        block does not yet end at a hard terminal** (`[.?!]`). As soon as it ends
        at `.` `?` `!` — or the speaker changes — close it.
     **An ellipsis `…` is a trailing-off pause, NOT a sentence end** — never split
     on it and always stitch *through* it. A speaker who breaks up a thought with
     "So… if… it's…" must become **one** subtitle, not a column of one-word
     fragments. (This was a hard lesson: treating `…` as a terminal over-splits
     badly.) **Do not** apply a "~N sentences per block" cap. The validator's
     `TERMINAL` is `[.?!…]`, so a `…`-ended block (e.g. a speaker trailing off
     before another takes the floor) is still considered complete and does not
     warn; only a block ending **mid-word** before a same-speaker block warns.
2. **Analyze the blocks with a dynamic workflow — chunked, not
   sentence-by-sentence.** A single whole-file pass lets homophones through
   (`miners`/`minors`), leaves garbled orphans in, and spells one name three ways.
   Fan out over the `Workflow` tool (this skill is your opt-in — you do **not**
   need the user to say "ultracode"):
   - **Chunk the grouped blocks by range** into **~50 contiguous chunks**
     (`ceil(totalBlocks / 50)` blocks each), **never splitting a block**; each
     chunk carries its real block numbers + timestamps so every fix maps back.
   - **One agent per chunk** (`model: 'haiku'` default; `'sonnet'` for a dense
     technical call), `pipeline()`/`parallel()`. Give **every** agent the same
     shared context: registry display names + aliases, the **proper-noun glossary
     loaded from `speakers/glossary.yaml`** (each canonical spelling + its optional
     `description`, so the agent can judge whether an uncertain match fits the
     context), and the fix rules. Each agent returns **structured** findings
     (schema), not rewritten prose.
   - **Fix rules** (keep timestamps untouched):
     - **Mis-heard proper nouns** — "Sim Classic" → "Ethereum Classic",
       "theoremclassic.org" → "ethereumclassic.org", "DAP" → "dApp", "AMP pool" →
       "Antpool", "two miners" → "2Miners", a name slip ("Astora" → "Istora").
     - **Homophones in context** — "base fee refund for minors" → "miners".
     - **Garbled / orphan fragments** — a stray one-word cue ("bomb.") or
       mis-segmented phrase ("real estateless one" → "real stateless one") gets
       flagged for repair or merge, not left verbatim.
     - **Stutters / repetitions** — collapse "why, why are we, why are we assuming
       that? Why are we assuming that?" → "Why are we assuming that?".
     - Light punctuation/casing. Preserve meaning; don't paraphrase substance.
     - **Flag (don't relabel) speaker labels** — the pre-pass normalized known
       ones. Surface anything still unresolved or a label that looks
       mis-attributed for item 3; do not silently relabel cues. (Acoustic
       attribution is the `diarize` skill's job, upstream — not this one's.)
     - **Spoken name mentions stay as spoken** — when a name appears in the
       dialogue *body* (not the speaker label), transcribe it as said; only fix a
       clear ASR error to its glossary canonical. Do **not** swap a spoken name
       for a participant's Zoom handle (e.g. keep "Wiedergarten" if that's what was
       said, even though the speaker label for that person is `weder`).
   - **Cross-chunk consistency pass (required).** After aggregating, run one
     reconciliation over the *union* of findings to make every recurring
     name/term uniform across the whole call (e.g. `Wego`/`WeGo`/`Wigo` → one).
     This is the class of error chunking exists to catch.
   Each chunk agent splits findings into **Confident** (clear ASR errors, obvious
   proper nouns, contextual homophones, plain de-stutter — apply directly) and
   **Flagged** (any name you can't verify, any repair that **risks changing
   meaning**, any inconsistently-spelled term with no obvious canonical form —
   collect, do NOT auto-apply; record cue/time, raw line, proposed fix, reason).

   Sketch:
   ```js
   const FINDINGS = { type: 'object', properties: {
     confident: { type: 'array', items: { type: 'object', properties: {
       cue:{type:'number'}, time:{type:'string'}, raw:{type:'string'},
       fixed:{type:'string'}, kind:{type:'string'} } } },
     flagged:   { type: 'array', items: { type: 'object', properties: {
       cue:{type:'number'}, time:{type:'string'}, raw:{type:'string'},
       proposed:{type:'string'}, reason:{type:'string'} } } },
   } }
   const results = await pipeline(chunks,
     c => agent(`${SHARED_CONTEXT}\nAnalyze these cues, return findings:\n${c.text}`,
                {label:`clean:${c.firstCue}-${c.lastCue}`, model:'haiku', schema:FINDINGS}));
   // aggregate -> consistency-reconciliation agent over the union -> apply confident / present flagged
   ```
3. **New speakers:** for every label that doesn't resolve via the registry,
   highlight it and ask the user, per speaker:
   - a mis-transcription of a known speaker (→ add as an `alias`), or a real new
     person?
   - if new, the **display name defaults to the Zoom label verbatim** — that
     string is the participant's own self-chosen display name, so register it
     as-is (e.g. handles like `w1g0`, `weder`). Do **not** "correct" it to a
     guessed proper spelling or expand it to a real name unless the user tells you
     to; only fold it into an existing speaker as an `alias` when it is clearly an
     ASR garble of a known person. Then **prompt for an avatar image URL** (skip →
     initials), download it next to the yaml (`curl -L -o speakers/<key>.<ext>
     "<url>"`), and add a `speakers/speakers.yaml` entry (`displayName` = the
     label, plus `aliases`/`avatar` only if applicable).
4. Show a **representative sample** of the confident cleanup (not all blocks) and
   the resolved speaker list, **and present the flagged fixes** — block/time, raw
   line, proposed fix, reason — for the user to confirm/correct/reject **one by
   one**. Apply their decisions before writing. **When a flagged item is a proper
   noun the user confirms** (a name/term not yet in `speakers/glossary.yaml`),
   **append it to `speakers/glossary.yaml`** — the canonical spelling as the key,
   the ASR variant(s) seen as `aliases`, and a short `description` if useful — so
   future cleanups apply it automatically in the pre-pass. This is how the
   glossary grows.
5. **Propose the roster** — the distinct people who actually spoke, as canonical
   display names. Curate out noise (someone merely quoted, a chat-only relay with
   no cues). Confirm the list; it goes to frontmatter in Stage D and drives the
   call-page roster (and, later, the video).
6. **Write the cleaned transcript into the markdown** — a `## Full Transcript`
   section with the cleaned, sentence-grouped cues in a ` ```webvtt ` block (no
   `NOTE chapters` yet) — and have the user **review it rendered** at
   `/calls/<N>` (the call **number**, e.g. `/calls/54` — not the `<id>` basename;
   renders flat via `remark-webvtt`; keep it inline). Intermediate gate: get the
   transcript right before chapters.
7. **Validate — required gate, before the rendered review.** Resolve every ERROR:
   ```bash
   node scripts/videogen-validate.mjs calls/<id>.md --raw transcripts/<id>.vtt
   ```
   (Use `transcripts/<id>.diarized.vtt` for `--raw` if the call was diarized.) It
   parses the ` ```webvtt ` block as the site does and checks: WEBVTT header;
   every timestamp well-formed with `start <= end`; non-decreasing order; no empty
   cues; **timestamp-boundary parity against the raw** — every cleaned block's
   start/end is a real raw boundary and the run covers the same span with no
   gaps/overlaps (proves no timestamp was invented, no span dropped); and every
   speaker label resolves via `speakers/speakers.yaml`. It also **WARNs** on a
   same-speaker block ending mid-sentence and continuing next — those are
   mid-sentence cuts the pre-pass should have merged. Errors fail the gate;
   re-run until clean. (No chapters yet, so chapter checks are skipped here.)

## Stage B — Chapters (discuss, then confirm)

1. From the cleaned transcript, draft chapters as a `NOTE chapters` block,
   `[h:]mm:ss Title`, one per line on the displayed timeline. **Aim for ~10
   max.** Favour few coherent chapters; merge short adjacent topics (housekeeping,
   a brief aside, two halves of one debate); don't carve a 30-second aside into
   its own chapter.
2. **Sanity-check every boundary against real cues — enforced by the validator.**
   Each chapter start MUST be the **exact start timestamp of a cue**, and the
   **first cue of a speaker's turn** that opens the topic. Never a round-number
   guess, never mid-turn, never mid-sentence (a round minute almost never
   coincides with a real cue start — if it's round, it's wrong).
3. **Iterate against the validator until zero chapter errors:**
   ```bash
   node scripts/videogen-validate.mjs calls/<id>.md
   ```
   For each off-grid boundary it reports the nearest real cue (time + speaker +
   text); **snap** to the cue that actually opens the topic — not blindly the
   nearest, which is often mid-thought; the right one may be a few cues away. A
   mid-turn WARN is acceptable only for a deliberate host pivot (same host
   monologuing across a topic change); otherwise move to a turn-opening cue.
4. **Offer ~3 grouping options at different granularities — not a single draft.**
   First explain the rationale (chapters drive both the website's chaptered
   transcript and the video TOC; they bookend coherent topics, open on a real
   turn, stay scannable), then present three **already-validated** options:
   **Coarse** (~5), **Balanced** (~7, usually mirrors the AI-summary subsections,
   the default), **Fine** (~10). Each must pass the validator first. Give a
   one-line rationale + the full `mm:ss Title` list, let the user pick or mix,
   then iterate as a conversation (retitle, merge, move splits), re-running the
   validator after any edit. Only write the final `NOTE chapters` block once the
   user has chosen **and the validator is clean**.

## Stage C — AI summary + key points + blurb (review, confirm)

From the cleaned transcript, generate, matching the most recent **completed**
call's format exactly (read one with a `# AI Summary` + `webvtt` transcript as the
style template — including section order: `## Key Points Discussed` near the top
with a link down to `#ai-summary`, then the existing agenda, then `# AI Summary`
with `###` subsections that mirror the chapters, ending in an `### Action Items`
subsection):
1. `# AI Summary` — structured subsections with **Details** / **Conclusion**.
2. `## Key Points Discussed` — bullets.
3. A 1–2 sentence `summary:` blurb for the video's summary slide.
4. **Referenced projects / links** — scan the transcript for any project, app,
   article, repo, ECIP/EIP, person's site, or tool that was **named or pointed
   to** ("I posted an article", "check the repo", "add it to the show notes"), and
   weave them in as markdown links in the summary / key points / an Action Items
   line. Reuse a URL already present in the call's agenda frontmatter/body if it's
   there. **Never fabricate a URL** — if you can't verify the exact link (e.g. an
   ECIP number with no canonical URL to hand), list the reference and **ask the
   user for the link** rather than guessing. This is how the show-notes links get
   built.
Show each; get approval. Follow the writing style in `AGENTS.md`.

## Stage D — Write the markdown

By now the cleaned transcript (A) and `NOTE chapters` (B) are in `calls/<id>.md`.
Add the rest, preserving existing frontmatter + agenda:
1. `summary:` blurb + `roster:` (confirmed in A.5) → frontmatter; ensure
   `youtube:` is set (11-char id; if not uploaded yet, note links are inert until
   it is).
2. The `# AI Summary` and `## Key Points Discussed` sections.
Tell the user it's saved (all text, no media) and offer to iterate. **Do not
commit unless asked.**

## Hand-off

The markdown is complete (transcript + chapters + summary). If the user also wants
a video, that's the `render-call` skill. If they only wanted to update the text,
you're done.
