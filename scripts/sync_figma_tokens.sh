#!/usr/bin/env bash
# scripts/sync_figma_tokens.sh
# Sync design tokens from the live Figma file → print a diff against current tokens
#
# Usage:
#   export FIGMA_TOKEN=figd_xxxxx
#   ./scripts/sync_figma_tokens.sh
#
# The script only READS and prints — it does not auto-apply changes.
# Review the output, then manually update the relevant token files.

set -euo pipefail

FILE_ID="a6PHaT6GaxDYFGRuGNxTGZ"
OUT="design/figma-tokens-full.json"
PREV="${OUT%.json}-prev.json"

if [ -z "${FIGMA_TOKEN:-}" ]; then
  echo "❌  FIGMA_TOKEN env var is required."
  echo "    export FIGMA_TOKEN=figd_xxxxx"
  exit 1
fi

echo "🔄  Fetching Figma file ${FILE_ID}..."

# Back up previous extraction
if [ -f "$OUT" ]; then
  cp "$OUT" "$PREV"
fi

# Re-run full extraction
curl -sf -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/${FILE_ID}" | \
  python3 scripts/extract_figma_tokens.py --json > "$OUT"

echo "✅  Tokens saved to $OUT"

# If previous exists, show diff
if [ -f "$PREV" ]; then
  echo ""
  echo "📊  Diff vs previous extraction:"
  diff <(python3 -c "
import json
with open('$PREV') as f: d=json.load(f)
# Print colors only
for h,name in sorted(set((c,n) for c,n in [(c,'') for c in d.get('fills',[])])):
    print(h)
" 2>/dev/null || true) \
       <(python3 -c "
import json
with open('$OUT') as f: d=json.load(f)
for h,name in sorted(set((c,n) for c,n in [(c,'') for c in d.get('fills',[])])):
    print(h)
" 2>/dev/null || true) || echo "  (no structural diff)"

  echo ""
  echo "📐  New radii:    $(python3 -c "import json; d=json.load(open('$OUT')); print(d['radii'])")"
  echo "🎨  Gradients:    $(python3 -c "import json; d=json.load(open('$OUT')); print(len(d['gradients']))")"
  echo "🌑  Shadows:      $(python3 -c "import json; d=json.load(open('$OUT')); print(len(d['shadows']))")"
  echo "🔠  Font entries: $(python3 -c "import json; d=json.load(open('$OUT')); print(len(d['typography']))")"
fi

echo ""
echo "Files to update if tokens changed:"
echo "  frontend/src/app/globals.css"
echo "  frontend/tailwind.config.js"
echo "  mobile/src/theme/colors.ts"
echo "  mobile/src/theme/typography.ts"
echo "  mobile/src/theme/gradients.ts"
echo "  mobile/src/theme/shadows.ts"
