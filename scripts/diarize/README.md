# diarize — local speaker relabeling for shared-mic recordings

A small, CPU-only tool that fixes speaker attribution in a Zoom `.vtt` when two
people share one Zoom participant (e.g. two mics on one account). It does **not**
re-transcribe — the Zoom words and timings are kept. It only re-derives *who
spoke when* acoustically and overlays that onto the transcript.

Why this exists: Zoom attributes by participant connection, not by voice. When
Istora and Diego join under one account, every line is labeled "Istora Mandiri".
Voice diarization clusters the audio by voice-print and splits that bucket back
into two people. Participants on their own connection (already correct) are used
to name the clusters automatically; the shared one is the only thing you name by
hand (via `--map`).

Fully local: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) ONNX models, no
HuggingFace, no token, no network at run time once the models are cached.

## What is and isn't committed

Committed: `diarize.py`, this `README.md`. **Nothing else.** Models, the Python
venv, audio, and outputs all live under `.cache/diarize/` and `.cache/<call>/`,
which are gitignored. The tool is intentionally self-contained and leaves no
artifacts in the tree.

## One-time setup

Requires `nix` (for `uv`) and `ffmpeg` (the repo already ships `ffmpeg-static`;
the script finds it automatically, or set `$FFMPEG`).

```sh
# 1. Python env (sherpa-onnx ships prebuilt CPU wheels — no compiling)
nix run nixpkgs#uv -- venv --python 3.11 .cache/diarize/.venv
nix run nixpkgs#uv -- pip install --python .cache/diarize/.venv/bin/python sherpa-onnx numpy

# 2. Models (ONNX, from k2-fsa GitHub releases — NOT HuggingFace)
mkdir -p .cache/diarize/models && cd .cache/diarize/models
#   segmentation (pyannote 3.0 exported to ONNX)
curl -fL -O https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2
tar xjf sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 && rm sherpa-onnx-pyannote-segmentation-3-0.tar.bz2
#   speaker embeddings (NeMo TitaNet-large, English; note the upstream tag is
#   misspelled "recongition")
curl -fL -O https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_large.onnx
cd -
```

Other English embedding models from the same release work too and trade
accuracy for speed: `wespeaker_en_voxceleb_resnet34_LM.onnx`,
`3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`. Pass with `--emb`.

## The tool is call-agnostic; per-call data lives in `enroll.json`

`diarize.py` hardcodes nothing about any call. The only call-specific input is a
small entry in **`enroll.json`** (next to the script), keyed by call id (the
`calls/<id>.md` basename). Only calls that actually need a speaker fix appear
there; a call absent from the file is passed through with its Zoom labels intact.

```json
{
  "20260612_054": {
    "split": "Istora Mandiri",
    "enroll": {
      "Istora": ["2:00-2:35"],
      "Diego":  ["26:24-27:53"]
    }
  }
}
```

- `split` — the Zoom label that conflates two+ people sharing one connection.
- `enroll` — each real voice → one or more clean reference spans (`START-END` in
  seconds or `[h:]m:s`) where that person speaks alone. ~20-40 s each is plenty.

## Usage

```sh
PY=.cache/diarize/.venv/bin/python

# Reads split/enroll for this call from enroll.json; relabels + splits cues.
$PY scripts/diarize/diarize.py \
  --audio /path/to/recording.mp4 \
  --vtt   /path/to/zoom.vtt \
  --call  20260612_054 \
  --out   /path/to/diarized.vtt
```

Add `--report-only` to preview the attribution and example within-cue splits
without writing. `--audio` accepts anything ffmpeg reads (mp4/m4a/wav/...),
converted to 16 kHz mono internally; a pre-extracted 16 kHz mono wav is fastest.

**Picking reference spans:** open the Zoom `.vtt`, find a stretch where each
person clearly speaks alone (an intro monologue, a long technical answer), and
note the start/end. The tool prints the references' cross-similarity — **lower is
better separated** (≈0.3 is good; >0.6 means the spans overlap or the voices are
genuinely close — pick cleaner spans).

### What it produces

Every cue under `split` is reattributed to the nearest enrolled voice; cues from
other participants keep their Zoom label. A cue spanning a speaker change is
**broken into multiple cues** at the acoustic turn (text is split proportionally
and snapped to the nearest sentence/word boundary — approximate, since Zoom has
no word timestamps, but the downstream cleanup step refines wording). The result
is a structurally valid WEBVTT whose new boundaries make it the `raw.vtt` of
record for cleanup.

### Inline alternative (no enroll.json)

The same can be passed directly, e.g. for a one-off:

```sh
$PY scripts/diarize/diarize.py --audio rec.mp4 --vtt zoom.vtt \
  --split-label "Istora Mandiri" --enroll "Istora=2:00-2:35;Diego=26:24-27:53" \
  --out diarized.vtt
```

### Options

| flag | meaning |
|---|---|
| `--call <id>` | load `split`/`enroll` from `enroll.json` (recommended). |
| `--enroll "N=span[+span];…"` | inline references; span is `START-END` in s or `[h:]m:s`. |
| `--split-label <label>` | the Zoom label to reattribute (scope). Others pass through. |
| `--no-split-cues` | one label per cue; don't break cues at within-cue turns. |
| `--win / --hop / --min-turn` | within-cue window (1.2 / 0.4 / 0.8 s). Raise `--min-turn` to split less. |
| `--report-only` | preview attribution + example splits; don't write. |
| `--enroll-file <path>` | override the metadata file (default: alongside the script). |
| `--emb / --seg / --num-threads` | model overrides / threads (default half the cores). |

### Unsupervised fallback (separate connections, unknown voices)

When voices are on **separate** mics/connections (no shared label) you don't need
enrollment — let it cluster. `--num-speakers N` forces N voice clusters and
prints a cross-tab of Zoom-label × cluster; `--map "0=Name,…"` names them. This
is weaker for the shared-mic case (it tends to peel a noise outlier instead of
splitting two close voices — that's exactly why enrollment exists), but fine when
the speakers are acoustically distinct.

## Notes & limits

- **Same-room / two-mic / one Zoom user** still mixes to one mono stream (Zoom
  duplicates to both channels — verified: L−R is digital silence), so there is no
  stereo cue; this is pure voice attribution. Enrollment handles it; blind
  clustering does not.
- Rapid back-and-forth inside a single cue is the hard case: the acoustic turn is
  found, but the *text* split point is approximate (no word timestamps). The
  cleanup step downstream fixes wording.
- Speed: ~18× realtime for plain attribution; within-cue splitting embeds sliding
  windows so it's slower (a few minutes for an 80-min call). CPU only.
- This is a dev tool; it never ships to production and is not wired into the
  Astro build.
