#!/usr/bin/env bash
# Fails if a script or source file that talks to the Gemini API does not import the budget guard (src/lib/budget.ts), or if the web app / edge functions contain an AI call.
cd "$(dirname "$0")/.."
bad=0
for f in $(grep -rl "generativelanguage\|GEMINI_API_BASE" scripts src supabase --include=*.ts 2>/dev/null | grep -v "src/config/models.ts\|src/lib/budget.ts"); do
  case "$f" in src/app/*|src/components/*|supabase/*) echo "AI call in web/edge code: $f"; bad=1;; esac
  grep -q "lib/budget" "$f" || { echo "paid script without budget guard: $f"; bad=1; }
done
[ $bad = 0 ] && echo "paid-call guard OK" || exit 1
