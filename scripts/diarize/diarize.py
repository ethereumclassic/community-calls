#!/usr/bin/env python3
"""Local, CPU-only speaker diarization that relabels an existing transcript.

Problem this solves: a recording where two people share a single Zoom
participant (e.g. two mics on one account) get collapsed under one label in the
Zoom .vtt. The words and timings are fine; only the *attribution* is wrong.

This tool re-derives "who spoke when" acoustically with sherpa-onnx (ONNX, no
HuggingFace, no network at run time once models are cached) and overlays the
resulting voice clusters onto the existing .vtt. Zoom labels that are already
1:1 with a voice (clean participants) are used to name clusters automatically;
the shared-mic label splits across >1 cluster, which is exactly the split we
want. Use --map to pin the ambiguous clusters to real names.

See README.md for setup and the model download step. Nothing here is committed
except this script and the README; models / audio / outputs live under
.cache/ (gitignored).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 16000


# ----------------------------------------------------------------------------- VTT
@dataclass
class Cue:
    idx: int
    start: float
    end: float
    speaker: str | None
    text: str
    raw_text: str  # original "Speaker: text" line(s)


_TS = re.compile(r"(\d+):(\d{2}):(\d{2})[.,](\d{3})")


def _ts_to_s(ts: str) -> float:
    m = _TS.search(ts)
    if not m:
        raise ValueError(f"bad timestamp: {ts!r}")
    h, mm, s, ms = (int(x) for x in m.groups())
    return h * 3600 + mm * 60 + s + ms / 1000.0


def _s_to_ts(t: float) -> str:
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def parse_vtt(path: str) -> list[Cue]:
    cues: list[Cue] = []
    block: list[str] = []

    def flush(block: list[str]) -> None:
        if not block:
            return
        # find the timing line
        ti = next((i for i, ln in enumerate(block) if "-->" in ln), None)
        if ti is None:
            return
        start_s, _, end_s = block[ti].partition("-->")
        start, end = _ts_to_s(start_s), _ts_to_s(end_s)
        idx_line = block[ti - 1].strip() if ti >= 1 else ""
        idx = int(idx_line) if idx_line.isdigit() else len(cues) + 1
        text_lines = [ln for ln in block[ti + 1 :] if ln.strip()]
        raw = "\n".join(text_lines).strip()
        speaker, sep, rest = raw.partition(":")
        if sep and "\n" not in speaker and 0 < len(speaker) <= 40:
            cues.append(Cue(idx, start, end, speaker.strip(), rest.strip(), raw))
        else:
            cues.append(Cue(idx, start, end, None, raw, raw))

    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.strip() == "" and any("-->" in b for b in block):
            flush(block)
            block = []
        elif line.strip() == "":
            block = []
        else:
            if line.strip() == "WEBVTT" or line.startswith(("NOTE", "STYLE")):
                continue
            block.append(line)
    if any("-->" in b for b in block):
        flush(block)
    return cues


def write_vtt(path: str, cues: list[Cue], labels: list[str]) -> None:
    out = ["WEBVTT", ""]
    for cue, label in zip(cues, labels):
        body = cue.text if cue.speaker is not None else cue.raw_text
        line = f"{label}: {body}" if label else body
        out += [str(cue.idx), f"{_s_to_ts(cue.start)} --> {_s_to_ts(cue.end)}", line, ""]
    open(path, "w", encoding="utf-8").write("\n".join(out))


# ----------------------------------------------------------------------------- audio
def find_ffmpeg() -> str | None:
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    # repo-local ffmpeg-static
    guess = os.path.join(
        os.path.dirname(__file__), "..", "..", "node_modules", "ffmpeg-static", "ffmpeg"
    )
    return guess if os.path.exists(guess) else None


def load_audio(path: str) -> np.ndarray:
    """Return mono float32 @ 16 kHz, converting via ffmpeg if needed."""
    if path.lower().endswith(".wav"):
        w = wave.open(path, "rb")
        if w.getframerate() == SAMPLE_RATE and w.getnchannels() == 1 and w.getsampwidth() == 2:
            data = w.readframes(w.getnframes())
            return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    ff = find_ffmpeg()
    if not ff:
        sys.exit("error: need ffmpeg to convert audio (set $FFMPEG or install ffmpeg)")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    subprocess.run(
        [ff, "-hide_banner", "-loglevel", "error", "-y", "-i", path,
         "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", tmp_path],
        check=True,
    )
    try:
        w = wave.open(tmp_path, "rb")
        data = w.readframes(w.getnframes())
        return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    finally:
        os.unlink(tmp_path)


# ----------------------------------------------------------------------------- diarize
def diarize(samples, seg_model, emb_model, num_speakers, threshold, num_threads):
    import sherpa_onnx as so

    cfg = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(
            pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=seg_model),
            num_threads=num_threads,
        ),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=emb_model, num_threads=num_threads),
        clustering=so.FastClusteringConfig(
            num_clusters=num_speakers if num_speakers else -1,
            threshold=threshold,
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    sd = so.OfflineSpeakerDiarization(cfg)
    if sd.sample_rate != SAMPLE_RATE:
        sys.exit(f"engine expects {sd.sample_rate} Hz")
    res = sd.process(samples).sort_by_start_time()
    # list of (start, end, cluster_id)
    return [(s.start, s.end, s.speaker) for s in res]


# ----------------------------------------------------------------------------- enrollment
def parse_span(s: str) -> tuple[float, float]:
    """'120-155' or '2:00-2:35' or '0:26:24-0:27:53' (seconds or [h:]m:s)."""
    def t(x: str) -> float:
        parts = [float(p) for p in x.strip().split(":")]
        return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))
    a, _, b = s.partition("-")
    return t(a), t(b)


def make_extractor(emb_model, num_threads):
    import sherpa_onnx as so
    return so.SpeakerEmbeddingExtractor(
        so.SpeakerEmbeddingExtractorConfig(model=emb_model, num_threads=num_threads)
    )


def embed(extractor, samples, a, b):
    seg = samples[int(a * SAMPLE_RATE):int(b * SAMPLE_RATE)]
    if len(seg) < int(0.5 * SAMPLE_RATE):
        return None
    st = extractor.create_stream()
    st.accept_waveform(SAMPLE_RATE, seg)
    v = np.asarray(extractor.compute(st), dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n else None


_SENT_END = re.compile(r"[.?!…]+[\"')\]]?(?=\s|$)")


def _runs_from_windows(centers, labs, t0, t1, min_turn):
    """Per-window labels -> [(seg_start, seg_end, lab)], dropping flips < min_turn."""
    runs = []  # [win_start_idx, win_end_idx, lab]
    s = 0
    for i in range(1, len(labs) + 1):
        if i == len(labs) or labs[i] != labs[s]:
            runs.append([s, i - 1, labs[s]])
            s = i
    # window-index runs -> time segments (boundary = midpoint between adjacent centers)
    segs = []
    for k, r in enumerate(runs):
        a = t0 if k == 0 else (centers[r[0]] + centers[runs[k - 1][1]]) / 2
        b = t1 if k == len(runs) - 1 else (centers[r[1]] + centers[runs[k + 1][0]]) / 2
        segs.append([a, b, r[2]])
    # absorb sub-min_turn segments into the longer neighbour, then merge same-label
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for k, sg in enumerate(segs):
            if sg[1] - sg[0] < min_turn:
                if k == 0:
                    nb = 1
                elif k == len(segs) - 1:
                    nb = k - 1
                else:
                    left = segs[k - 1][1] - segs[k - 1][0]
                    right = segs[k + 1][1] - segs[k + 1][0]
                    nb = k - 1 if left >= right else k + 1
                segs[nb][0] = min(segs[nb][0], sg[0])
                segs[nb][1] = max(segs[nb][1], sg[1])
                segs.pop(k)
                changed = True
                break
    merged = [segs[0]]
    for sg in segs[1:]:
        if sg[2] == merged[-1][2]:
            merged[-1][1] = sg[1]
        else:
            merged.append(sg)
    return [(a, b, lab) for a, b, lab in merged]


def _split_text(text, fracs):
    """Split text at cumulative-time fractions, snapping to sentence then word
    boundaries (we have no word timestamps, so this is proportional + snapped)."""
    n = len(text)
    sent = [m.end() for m in _SENT_END.finditer(text)]
    word = [m.start() for m in re.finditer(r"\s+", text)]
    cuts, prev = [], 0
    for f in fracs:
        target = int(round(f * n))
        cands = [c for c in sent if prev < c < n] or [c for c in word if prev < c < n]
        cut = min(cands, key=lambda c: abs(c - target)) if cands else max(target, prev + 1)
        cut = min(max(cut, prev + 1), n)
        cuts.append(cut)
        prev = cut
    pieces, start = [], 0
    for c in cuts:
        pieces.append(text[start:c].strip())
        start = c
    pieces.append(text[start:].strip())
    return pieces


def fine_split_cue(extractor, samples, cue, names, R, win, hop, min_turn, allow_split):
    """Return [(start, end, label, text, sim)] for a cue. With allow_split, a cue
    spanning >1 reference voice is broken into sub-cues at the speaker changes."""
    text = cue.text if cue.speaker is not None else cue.raw_text
    dur = cue.end - cue.start

    def assign(a, b):
        v = embed(extractor, samples, a, b)
        if v is None:
            return None, 0.0
        sims = R @ v
        return int(np.argmax(sims)), float(sims.max())

    if not allow_split or dur < max(2 * win, 1.5):
        i, sim = assign(cue.start, cue.end)
        lab = names[i] if i is not None else ""  # "" = too short, inherit neighbour
        return [(cue.start, cue.end, lab, text, sim)]

    centers, labs = [], []
    t = cue.start
    while t + win <= cue.end + 1e-6:
        v = embed(extractor, samples, t, t + win)
        if v is not None:
            centers.append(t + win / 2)
            labs.append(int(np.argmax(R @ v)))
        t += hop
    if not labs:
        i, sim = assign(cue.start, cue.end)
        return [(cue.start, cue.end, names[i] if i is not None else "", text, sim)]

    segs = _runs_from_windows(centers, labs, cue.start, cue.end, min_turn)
    if len(segs) == 1:
        return [(cue.start, cue.end, names[segs[0][2]], text, 0.0)]
    fracs = [(segs[k][1] - cue.start) / dur for k in range(len(segs) - 1)]
    pieces = _split_text(text, fracs)
    out = []
    for (a, b, lab), piece in zip(segs, pieces):
        if piece:
            out.append((a, b, names[lab], piece, 0.0))
    return out or [(cue.start, cue.end, names[segs[0][2]], text, 0.0)]


def write_cues(path, rows):
    """rows: list of (start, end, label, text)."""
    out = ["WEBVTT", ""]
    for i, (a, b, label, text) in enumerate(rows, 1):
        out += [str(i), f"{_s_to_ts(a)} --> {_s_to_ts(b)}", f"{label}: {text}" if label else text, ""]
    open(path, "w", encoding="utf-8").write("\n".join(out))


def overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def assign_clusters(cues, segs):
    """For each cue, the cluster with the most temporal overlap (-1 if none)."""
    out = []
    for cue in cues:
        tally = defaultdict(float)
        for s0, s1, c in segs:
            if s1 < cue.start:
                continue
            if s0 > cue.end:
                break
            tally[c] += overlap(cue.start, cue.end, s0, s1)
        out.append(max(tally, key=tally.get) if tally else -1)
    return out


# ----------------------------------------------------------------------------- naming
def crosstab(cues, cue_clusters):
    """zoom_label -> {cluster -> seconds}."""
    tab: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for cue, c in zip(cues, cue_clusters):
        tab[cue.speaker or "(none)"][c] += cue.end - cue.start
    return tab


def auto_names(tab, overrides):
    """Pick a name per cluster. A cluster owned by exactly one Zoom label takes
    that label. When a label spans several clusters (the shared mic), the
    biggest cluster keeps the bare name and the rest get '<label> #2', '#3'…
    so they are visibly un-disambiguated until --map pins them."""
    # cluster -> dominant zoom label
    clusters = set()
    for label, d in tab.items():
        clusters.update(d)
    clusters.discard(-1)

    dom: dict[int, str] = {}
    for c in clusters:
        best, best_s = None, -1.0
        for label, d in tab.items():
            if label == "(none)":
                continue
            if d.get(c, 0) > best_s:
                best, best_s = label, d.get(c, 0)
        dom[c] = best or "Speaker"

    # group clusters by dominant label, rank by total seconds
    by_label: dict[str, list[int]] = defaultdict(list)
    for c, label in dom.items():
        by_label[label].append(c)
    names: dict[int, str] = {}
    for label, cs in by_label.items():
        cs.sort(key=lambda c: -sum(d.get(c, 0) for d in tab.values()))
        for rank, c in enumerate(cs):
            names[c] = label if rank == 0 else f"{label} #{rank + 1}"
    names[-1] = ""  # no acoustic match -> leave bare / keep original below
    for c_str, name in overrides.items():
        names[int(c_str)] = name
    return names


# ----------------------------------------------------------------------------- main
def main() -> None:
    here = os.path.dirname(__file__)
    default_models = os.path.join(here, "..", "..", ".cache", "diarize", "models")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio", required=True, help="recording (wav/mp4/m4a/...)")
    ap.add_argument("--vtt", required=True, help="existing Zoom .vtt to relabel")
    ap.add_argument("--out", help="output .vtt (default: <vtt>.relabeled.vtt)")
    ap.add_argument("--models", default=default_models, help="dir with the two ONNX models")
    ap.add_argument("--seg", help="override segmentation model path")
    ap.add_argument("--emb", help="override embedding model path")
    ap.add_argument("--num-speakers", type=int, default=0, help="known voice count (0 = auto)")
    ap.add_argument("--split-label", default="",
                    help="isolate only cues with this Zoom label and split JUST them "
                         "(the shared-mic bucket). Other cues keep their Zoom label.")
    ap.add_argument("--split-into", type=int, default=2, help="clusters for --split-label")
    ap.add_argument("--enroll", default="",
                    help="reference-based attribution (best for same-room/blended voices). "
                         'Format: "Name=span[+span];Name2=span". A span is START-END in '
                         'seconds or [h:]m:s, e.g. "Istora=2:00-2:35;Diego=26:24-27:53". '
                         "Each in-scope cue is assigned to the nearest reference voice. "
                         "Scope is --split-label if given, else all cues. No diarization needed.")
    ap.add_argument("--call", default="",
                    help="call id (calls/<id>.md basename) to load split/enroll metadata "
                         "from the enroll file, instead of passing --split-label/--enroll inline.")
    ap.add_argument("--enroll-file", default=os.path.join(here, "enroll.json"),
                    help="per-call metadata registry (default: alongside this script)")
    ap.add_argument("--no-split-cues", action="store_true",
                    help="one label per cue; do NOT split a cue at within-cue speaker changes")
    ap.add_argument("--win", type=float, default=1.2, help="within-cue window seconds")
    ap.add_argument("--hop", type=float, default=0.4, help="within-cue window hop seconds")
    ap.add_argument("--min-turn", type=float, default=0.8, help="shortest kept speaker turn (s)")
    ap.add_argument("--pad", type=float, default=0.2, help="seconds of context kept around each isolated cue")
    ap.add_argument("--threshold", type=float, default=0.5, help="clustering threshold when auto")
    ap.add_argument("--num-threads", type=int, default=max(1, (os.cpu_count() or 4) // 2))
    ap.add_argument("--map", default="", help='pin clusters, e.g. "2=Diego,0=Istora"')
    ap.add_argument("--report-only", action="store_true", help="print cross-tab, don't write vtt")
    args = ap.parse_args()

    seg = args.seg or os.path.join(args.models, "sherpa-onnx-pyannote-segmentation-3-0", "model.onnx")
    emb = args.emb or os.path.join(args.models, "nemo_en_titanet_large.onnx")
    for p in (seg, emb):
        if not os.path.exists(p):
            sys.exit(f"missing model: {p}\n  run the download step in scripts/diarize/README.md")

    overrides = dict(kv.split("=", 1) for kv in args.map.split(",") if "=" in kv)

    # ---- per-call metadata file (keeps the tool call-agnostic) ----
    if args.call:
        if not os.path.exists(args.enroll_file):
            sys.exit(f"no enroll file: {args.enroll_file}")
        entry = json.load(open(args.enroll_file)).get(args.call)
        if entry is None:
            sys.exit(f"call {args.call!r} not found in {args.enroll_file}")
        if not args.split_label:
            args.split_label = entry.get("split", "")
        if not args.enroll and entry.get("enroll"):
            args.enroll = ";".join(f"{n}=" + "+".join(sp) for n, sp in entry["enroll"].items())

    print(f"loading audio: {args.audio}", file=sys.stderr)
    samples = load_audio(args.audio)
    dur = len(samples) / SAMPLE_RATE
    print(f"  {dur/60:.1f} min @ {SAMPLE_RATE} Hz", file=sys.stderr)

    cues = parse_vtt(args.vtt)

    # ---- enrollment mode: reference-based attribution (no diarization) ----
    if args.enroll:
        extractor = make_extractor(emb, args.num_threads)
        references: dict[str, np.ndarray] = {}
        print("building references:", file=sys.stderr)
        for chunk in args.enroll.split(";"):
            name, _, spans = chunk.partition("=")
            name = name.strip()
            vecs = []
            for sp in spans.split("+"):
                a, b = parse_span(sp)
                v = embed(extractor, samples, a, b)
                if v is not None:
                    vecs.append(v)
            if not vecs:
                sys.exit(f"no usable audio for reference {name!r}")
            ref = np.mean(vecs, axis=0)
            references[name] = ref / np.linalg.norm(ref)
            print(f"  {name}: {len(vecs)} span(s)", file=sys.stderr)
        # cross-similarity of references (low = well separated)
        rnames = list(references)
        if len(rnames) > 1:
            print("reference cross-similarity (lower = more separable):")
            for i in range(len(rnames)):
                for j in range(i + 1, len(rnames)):
                    s = float(references[rnames[i]] @ references[rnames[j]])
                    print(f"  {rnames[i]} vs {rnames[j]}: {s:.3f}")

        R = np.stack([references[n] for n in rnames])
        out_rows = []          # (start, end, label, text)
        secs = defaultdict(float); cnt = defaultdict(int)
        split_examples = []
        last_label = ""
        for cue in cues:
            scope = (not args.split_label) or cue.speaker == args.split_label
            if not scope:
                body = cue.text if cue.speaker is not None else cue.raw_text
                out_rows.append((cue.start, cue.end, cue.speaker or "", body))
                continue
            parts = fine_split_cue(extractor, samples, cue, rnames, R,
                                   args.win, args.hop, args.min_turn, not args.no_split_cues)
            if len(parts) > 1 and len(split_examples) < 8:
                split_examples.append((cue, parts))
            for a, b, lab, text, _ in parts:
                if not lab:  # too short to embed -> inherit previous resolved speaker
                    lab = last_label or rnames[0]
                last_label = lab
                out_rows.append((a, b, lab, text))
                secs[lab] += b - a; cnt[lab] += 1

        n_split = sum(1 for _ in split_examples)
        print(f"\n=== attribution ({len(cues)} cues -> {len(out_rows)} cues"
              f"{'' if args.no_split_cues else f', {n_split}+ split at within-cue turns'}) ===")
        for n in rnames:
            print(f"  {n:20s} {cnt[n]:4d} cues  {secs[n]/60:6.1f} min")
        if split_examples:
            print("\n=== example within-cue splits ===")
            for cue, parts in split_examples[:6]:
                print(f"  [{cue.start:6.0f}s] ORIG: {(cue.text or cue.raw_text)[:88]}")
                for a, b, lab, text, _ in parts:
                    print(f"          -> {lab:8s} {text[:74]}")
        if args.report_only:
            return
        out = args.out or re.sub(r"\.vtt$", "", args.vtt) + ".relabeled.vtt"
        write_cues(out, out_rows)
        print(f"\nwrote {out}", file=sys.stderr)
        return

    num_speakers = args.num_speakers
    if args.split_label:
        # Hybrid mode: silence everything outside the shared-mic label so the
        # clustering budget is spent ONLY on separating those voices.
        labels_present = {c.speaker for c in cues}
        if args.split_label not in labels_present:
            sys.exit(f"--split-label {args.split_label!r} not found. labels: {sorted(filter(None, labels_present))}")
        mask = np.zeros_like(samples)
        kept = 0.0
        for cue in cues:
            if cue.speaker == args.split_label:
                a = max(0, int((cue.start - args.pad) * SAMPLE_RATE))
                b = min(len(samples), int((cue.end + args.pad) * SAMPLE_RATE))
                mask[a:b] = samples[a:b]
                kept += (b - a) / SAMPLE_RATE
        samples = mask
        num_speakers = args.split_into
        print(f"split mode: isolated {kept/60:.1f} min of {args.split_label!r} -> "
              f"{args.split_into} clusters", file=sys.stderr)

    print(f"diarizing (num_speakers={num_speakers or 'auto'}, threads={args.num_threads})…", file=sys.stderr)
    import time
    t = time.time()
    segs = diarize(samples, seg, emb, num_speakers, args.threshold, args.num_threads)
    print(f"  {time.time()-t:.0f}s, {len(segs)} segments, "
          f"{len({c for *_, c in segs})} clusters", file=sys.stderr)

    cue_clusters = assign_clusters(cues, segs)
    tab = crosstab(cues, cue_clusters)
    names = auto_names(tab, overrides)

    # ---- cross-tab report: the key artifact for naming decisions ----
    all_clusters = sorted({c for d in tab.values() for c in d})
    print("\n=== cross-tab: Zoom label  ->  voice cluster (seconds) ===")
    header = "zoom label".ljust(20) + "".join(f"  c{c}".rjust(8) for c in all_clusters)
    print(header)
    for label in sorted(tab, key=lambda x: -sum(tab[x].values())):
        row = label.ljust(20) + "".join(f"{tab[label].get(c,0):8.0f}" for c in all_clusters)
        print(row)
    # a name ending in " #2".." #9" is an un-disambiguated shared-mic cluster
    ambiguous = lambda c: names.get(c, "").endswith(tuple(f"#{i}" for i in range(2, 10)))
    print("\ncluster -> name:")
    for c in all_clusters:
        flag = "  <-- shared/ambiguous" if ambiguous(c) else ""
        print(f"  c{c} = {names.get(c,'?')!r}{flag}")
    unmapped = [c for c in all_clusters if ambiguous(c)]
    if unmapped:
        print(f"\nNOTE: {len(unmapped)} ambiguous cluster(s). Pin them with "
              f'--map "{unmapped[0]}=Name,…" and rerun.')

    if args.report_only:
        return

    labels = []
    for cue, c in zip(cues, cue_clusters):
        name = names.get(c, "")
        labels.append(name if name else (cue.speaker or ""))
    out = args.out or re.sub(r"\.vtt$", "", args.vtt) + ".relabeled.vtt"
    write_vtt(out, cues, labels)
    print(f"\nwrote {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
