#!/usr/bin/env bash
# Full product pipeline for new/changed products (every step is idempotent and only touches what is still todo):
#   ingest -> image pre-selection -> classification -> bounding boxes -> cutout -> image check incl. presentation (-> next-best image -> cutout -> check, up to 3 rounds) -> measurements -> outfit pool
# Needs DRAPE_PIPELINE_TOKEN and GEMINI_API_KEY in the environment; PY = python with rembg/onnxruntime (default: python3).
# Usage: npm run ingest:all [-- --no-outfits]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DRAPE_PIPELINE_TOKEN:?DRAPE_PIPELINE_TOKEN is not set}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY is not set}"
export PY="${PY:-python3}"

npx tsx scripts/ingest.ts
npx tsx scripts/preselect-images.ts
npx tsx scripts/classify.ts
npx tsx scripts/bbox-feed-images.ts
for round in 1 2 3; do
  echo "== cutout + image check, round $round =="
  scripts/cutout/run_all.sh -- shoes bottom top full_body
  npx tsx scripts/image-check.ts | tee /tmp/image-check-round.log
  # products switched to another image need one more cutout + check round; stop when nothing was switched
  grep -q '"switched":0' /tmp/image-check-round.log && break
done
# mask measurements (hem / waist ratios) for the rule-based layout; only cutouts not measured yet
"$PY" scripts/cutout/measure.py
# presentation of images that passed an older check (new products get it from the check itself)
npx tsx scripts/image-check.ts --presentation
if [ "${1:-}" != "--no-outfits" ]; then npx tsx scripts/build-outfits.ts; fi
