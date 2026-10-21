#!/usr/bin/env bash
# Runs the cutout worker for the given slots in order, N parallel shards each (default: shoes bottom top full_body, 4 shards).
# Usage: DRAPE_PIPELINE_TOKEN=... scripts/cutout/run_all.sh [--shards 4] [--retry-failed] -- slot [slot...]
shards=4; extra=(); slots=()
while [ $# -gt 0 ]; do case "$1" in --shards) shards=$2; shift 2;; --retry-failed) extra+=(--retry-failed); shift;; --) shift; slots=("$@"); break;; *) shift;; esac; done
[ ${#slots[@]} -eq 0 ] && slots=(shoes bottom top full_body accessory)
PY=${PY:-python3}; dir=$(dirname "$0")
for slot in "${slots[@]}"; do
  pids=()
  for ((i = 0; i < shards; i++)); do "$PY" "$dir/worker.py" --slot "$slot" --shard "$i" --shards "$shards" --batch 30 "${extra[@]}" & pids+=($!); done
  wait "${pids[@]}"
done
