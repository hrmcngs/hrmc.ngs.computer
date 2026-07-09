#!/usr/bin/env bash
# mc-items.js + mc-model3d.js + viewer-embed.js を 1 ファイルに結合し、
# サイト直下 mc-item-viewer.js を生成する（外部サイトから <script> 1 本で使えるバンドル）。
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="mc-item-viewer.js"
SRC="src/js"

{
  echo "/*! mc-item-viewer.js — bundled Item Viewer (McItems + McModel3D + embed UI)."
  echo " *  Build: cat mc-items.js mc-model3d.js viewer-embed.js. Do not edit directly."
  echo " *  Usage: <script src=\".../mc-item-viewer.js\" data-repos=\"owner/repo,...\"></script> */"
  echo ""
  cat "$SRC/mc-items.js"
  echo ""
  cat "$SRC/mc-model3d.js"
  echo ""
  cat "$SRC/viewer-embed.js"
} > "$OUT"

echo "built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
