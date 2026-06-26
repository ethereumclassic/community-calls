---
name: diarize
description: Fix speaker attribution in a call transcript when one Zoom participant is actually two+ people (shared mic / same room). Local, CPU-only voice attribution that relabels the transcript and splits cues at speaker changes. On-demand — most calls do NOT need this; run it only when a Zoom label conflates multiple voices.
---

# Diarize Skill

A standalone, on-demand step for the **weird case**: a call where two (or more)
people speak under a single Zoom participant — e.g. they share a mic, or sit in
one room on one account. Zoom then labels every one of their lines with the same
name, and no transcript cleanup can separate them, because the distinction is
acoustic, not textual.

This skill re-derives "who spoke when" from the audio with a fully local,
CPU-only, tokenless tool (`scripts/diarize/`, sherpa-onnx ONNX models, no
HuggingFace, no network at run time) and rewrites the transcript: each cue under
the conflated label is reattributed to the right voice, and a cue spanning a
speaker change is **split into multiple cues**.

**Most calls never need this.** If every participant is on their own Zoom
connection, their labels are already correct — skip this skill entirely and go
straight to `call-markdown` / `videogen`. Use this only when the user says a
call has a shared-mic / shared-account situation, or when a transcript shows one
label covering two obviously different people.

Operate one step at a time and CONFIRM before writing.

## Inputs

- **The original transcript** at `transcripts/<id>.vtt` (the dropped Zoom `.vtt`;
  see `call-markdown` for the recommended drop location). `<id>` is the
  `calls/<id>.md` basename, e.g. `20260612_054`.
- **The call audio.** How it is obtained is left open — a dropped recording, a
  file the user points at, whatever. The tool accepts anything ffmpeg reads
  (mp4/m4a/wav) and converts internally; a 16 kHz mono wav is fastest. Do not
  prescribe a fetch method; work out what is available.
- **Per-call metadata** in `scripts/diarize/enroll.json` (you add this in step 3).

## Step 0 — Confirm it's needed (confirm)

Resolve the call id. Look at `transcripts/<id>.vtt`: which Zoom label conflates
two+ people? Confirm with the user who is hiding under it (e.g. "Istora Mandiri"
is actually Istora **and** Diego). If no label conflates anyone, stop — this
skill is not needed.

## Step 1 — One-time setup (if not already done)

The tool needs a Python venv and two ONNX models, all under `.cache/` (gitignored
— never committed). If `.cache/diarize/models/` is missing, follow the setup
block in `scripts/diarize/README.md` (uv venv + `curl` two models from k2-fsa
GitHub releases). ~18× realtime on CPU once set up.

## Step 2 — Get the audio

Obtain the recording by whatever means fits (dropped file, user-provided path).
Note its path; the tool will convert it. Nothing to commit here.

## Step 3 — Enroll the voices (the one judgement call)

Add an entry to `scripts/diarize/enroll.json`, keyed by `<id>`:

```json
"20260612_054": {
  "split": "Istora Mandiri",
  "enroll": {
    "Istora": ["2:00-2:35"],
    "Diego":  ["26:24-27:53"]
  }
}
```

- `split` — the conflating Zoom label.
- `enroll` — each real voice → one or more **clean reference spans** (`START-END`
  in seconds or `[h:]m:s`) where that person speaks **alone**. Find them by
  reading `transcripts/<id>.vtt`: an intro monologue, a long technical answer.
  ~20–40 s each is plenty. Confirm the spans with the user.

## Step 4 — Report-only pass (review, confirm)

Run with `--report-only` and review:

```bash
PY=.cache/diarize/.venv/bin/python
$PY scripts/diarize/diarize.py --audio <recording> \
  --vtt transcripts/<id>.vtt --call <id> --report-only
```

Check the printed **reference cross-similarity** (lower = better separated; ≈0.3
is good, >0.6 means the spans overlap or the voices are close — pick cleaner
spans and redo step 3). Then check the per-speaker cue/minute split looks
plausible and skim the **example within-cue splits**. Show the user.

## Step 5 — Write the diarized transcript (confirm)

When the report looks right, write the output to `transcripts/<id>.diarized.vtt`:

```bash
$PY scripts/diarize/diarize.py --audio <recording> \
  --vtt transcripts/<id>.vtt --call <id> \
  --out transcripts/<id>.diarized.vtt
```

This relabels the conflated cues and splits within-cue turns; other participants'
labels are untouched. It is a structurally valid WEBVTT and **becomes the
reference transcript** that `call-markdown` reads instead of the raw Zoom one.

## Hand-off

Tell the user: `transcripts/<id>.diarized.vtt` is ready; run `call-markdown`
(or `videogen`) next, pointing it at the diarized file. Both
`transcripts/<id>.vtt` and `transcripts/<id>.diarized.vtt` are **committable**;
the `.cache/` venv/models/working-audio are **never** committed. Only commit when
the user asks.

## Limits (be honest with the user)

- Same-room / shared-mic audio mixes to one mono stream (no stereo cue); this is
  pure voice attribution from enrolled references. It works, but is not perfect.
- Rapid back-and-forth inside one cue: the acoustic turn is found, but the text
  split point is approximate (Zoom has no word timestamps). The downstream
  `call-markdown` step fixes wording. Eyeball the splits.
- See `scripts/diarize/README.md` for full options (`--no-split-cues`, window
  tuning, the unsupervised cluster fallback for separate-connection calls).
