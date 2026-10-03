#!/usr/bin/env bash
# Splice re-rendered windows into a finished call render without re-encoding
# the whole video. Source this file, then call the functions (see render-call
# skill, Step 2b).
#
#   make_middle BASE SEG SEG_T0 IN OUT KA KB D OUT_MP4
#     BASE   the full render (video clock)
#     SEG    a --start render of the window; SEG local 0 == video clock SEG_T0
#     IN/OUT video-clock times where the new picture takes over / hands back
#     KA/KB  base keyframes, KA <= IN, KB >= OUT + D  (ffprobe packet flags K)
#     D      dissolve length at each seam
#   Output = base[KA..IN+D] -dissolve-> seg[IN..OUT] -dissolve-> base[OUT-D..KB],
#   exactly KB-KA long (each dissolve overlaps D; A and C each carry D extra),
#   so it drops into the base at [KA, KB] frame for frame. Silent: the final
#   keeps the base audio track untouched.
#
#   assemble BASE FINAL KA1:KB1 MID1 [KA2:KB2 MID2 ...]
#     stream-copies the untouched base stretches around each middle and
#     concatenates, then muxes the base audio back in.
set -euo pipefail
FF=$(node -e "console.log(require('ffmpeg-static'))")
ENC=(-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 60 -profile:v high -level 4.2 -video_track_timescale 15360)
calc() { python3 -c "print(round($1, 6))"; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

make_middle() {
  local BASE=$1 SEG=$2 SEG_T0=$3 IN=$4 OUT=$5 KA=$6 KB=$7 D=$8 OUTF=$9
  local A_TO L SEG_SS C_SS OFF1 OFF2
  A_TO=$(calc "$IN + $D"); L=$(calc "$OUT - $IN"); SEG_SS=$(calc "$IN - $SEG_T0")
  C_SS=$(calc "$OUT - $D"); OFF1=$(calc "$IN - $KA"); OFF2=$(calc "$OUT - $D - $KA")
  echo "▸ middle [$KA .. $KB]: dissolve in at $IN, out at $C_SS (D=$D), seg in-point ${SEG_SS}s"
  "$FF" -y -loglevel error -threads 8 -filter_complex_threads 8 \
    -ss "$KA" -to "$A_TO" -i "$BASE" \
    -ss "$SEG_SS" -t "$L" -i "$SEG" \
    -ss "$C_SS" -to "$KB" -i "$BASE" \
    -filter_complex "\
[0:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[a];\
[1:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[b];\
[2:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[c];\
[a][b]xfade=transition=fade:duration=${D}:offset=${OFF1}[ab];\
[ab][c]xfade=transition=fade:duration=${D}:offset=${OFF2}[v]" \
    -map "[v]" -an "${ENC[@]}" -movflags +faststart "$OUTF"
  echo "   middle: $(dur "$OUTF")s (want $(calc "$KB - $KA"))"
}

# head-only variant: seg replaces base[0..OUT] entirely (new preroll), one dissolve out
# head variant: seg replaces base[0..BASE_OUT] with seg[0..SEG_OUT] (the seg may
# carry a longer preroll than the base did), one dissolve out into the base.
make_head() {
  local BASE=$1 SEG=$2 SEG_OUT=$3 BASE_OUT=$4 KB=$5 D=$6 OUTF=$7
  local C_SS OFF
  C_SS=$(calc "$BASE_OUT - $D"); OFF=$(calc "$SEG_OUT - $D")
  echo "▸ head: seg to $SEG_OUT, dissolve into base at $C_SS .. $KB"
  "$FF" -y -loglevel error -threads 8 -filter_complex_threads 8 \
    -t "$SEG_OUT" -i "$SEG" \
    -ss "$C_SS" -to "$KB" -i "$BASE" \
    -filter_complex "\
[0:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[b];\
[1:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[c];\
[b][c]xfade=transition=fade:duration=${D}:offset=${OFF}[v]" \
    -map "[v]" -an "${ENC[@]}" -movflags +faststart "$OUTF"
  echo "   head: $(dur "$OUTF")s (want $(calc "$SEG_OUT + $KB - $BASE_OUT"))"
}

# tail variant: base[KA..IN+D] dissolves into seg[IN..] which then runs to its
# own end (a --start render that includes the postroll), replacing the rest of
# the base. SEG_T0 is the base-clock time of the seg's local 0.
make_tail() {
  local BASE=$1 SEG=$2 SEG_T0=$3 IN=$4 KA=$5 D=$6 OUTF=$7
  local A_TO SEG_SS OFF
  A_TO=$(calc "$IN + $D"); SEG_SS=$(calc "$IN - $SEG_T0"); OFF=$(calc "$IN - $KA")
  echo "▸ tail [$KA ..]: dissolve into seg at $IN (D=$D), seg in-point ${SEG_SS}s"
  "$FF" -y -loglevel error -threads 8 -filter_complex_threads 8 \
    -ss "$KA" -to "$A_TO" -i "$BASE" \
    -ss "$SEG_SS" -i "$SEG" \
    -filter_complex "\
[0:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[a];\
[1:v]setpts=PTS-STARTPTS,format=yuv420p,fps=60[b];\
[a][b]xfade=transition=fade:duration=${D}:offset=${OFF}[v]" \
    -map "[v]" -an "${ENC[@]}" -movflags +faststart "$OUTF"
  echo "   tail: $(dur "$OUTF")s"
}

assemble() {
  # Cut the untouched stretches with the segment muxer, which splits exactly on
  # the keyframe packets (a -ss/-to stream copy lands a frame early and late,
  # which shifts everything after the first seam). Pieces alternate base/mid.
  local BASE=$1 FINAL=$2; shift 2
  local dir; dir=$(mktemp -d /tmp/splice.XXXX)
  local times="" mids=() kas=() kbs=()
  while [ $# -gt 0 ]; do kas+=("${1%%:*}"); kbs+=("${1##*:}"); mids+=("$(realpath "$2")"); shift 2; done
  for i in "${!kas[@]}"; do
    [ "${kas[$i]}" != "0" ] && times+="${kas[$i]},"
    times+="${kbs[$i]},"
  done
  times=${times%,}
  "$FF" -y -loglevel error -i "$BASE" -an -c:v copy -f segment -segment_times "$times" -reset_timestamps 1 "$dir/p%02d.mp4"
  local list="$dir/list.txt"; : > "$list"
  local p=0
  for i in "${!kas[@]}"; do
    if [ "${kas[$i]}" != "0" ]; then echo "file '$dir/p$(printf %02d $p).mp4'" >> "$list"; p=$((p+1)); fi
    echo "file '${mids[$i]}'" >> "$list"; p=$((p+1))   # the base piece the mid replaces
  done
  echo "file '$dir/p$(printf %02d $p).mp4'" >> "$list"
  cat "$list"
  "$FF" -y -loglevel error -f concat -safe 0 -i "$list" -i "$BASE" \
    -map 0:v -map 1:a -c copy -movflags +faststart "$FINAL"
  echo "final: $(dur "$FINAL")s   base: $(dur "$BASE")s"
  rm -rf "$dir"
}
