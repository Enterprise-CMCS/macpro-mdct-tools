#!/usr/bin/env bash

set -euo pipefail


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="${PROJECTS_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

if [[ ! -d "$PROJECTS_DIR" ]]; then
  echo "error: Projects folder not found: $PROJECTS_DIR" >&2
  exit 1
fi

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found on PATH. Install it with: brew install librsvg" >&2
  exit 1
fi

DIAGRAMS_DIR="$PROJECTS_DIR/diagrams"
mkdir -p "$DIAGRAMS_DIR"
echo "Output folder: $DIAGRAMS_DIR"
echo

converted=0
skipped=0

for repo in "$PROJECTS_DIR"/*/; do
  repo="${repo%/}"
  name="$(basename "$repo")"

  [[ -d "$repo/.git" ]] || continue

  images="$repo/.images"
  if [[ ! -d "$images" ]]; then
    echo "skip: $name (no .images folder)"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ -f "$images/architecture.svg" ]]; then
    # SVG: convert it to PNG
    out="$DIAGRAMS_DIR/$name.png"
    rsvg-convert -o "$out" "$images/architecture.svg"
  elif [[ -f "$images/architecture.png" ]]; then
    # PNG: copy it as-is
    out="$DIAGRAMS_DIR/$name.png"
    cp "$images/architecture.png" "$out"
  elif [[ -f "$images/architecture.jpg" ]]; then
    # JPG: copy it as-is
    out="$DIAGRAMS_DIR/$name.jpg"
    cp "$images/architecture.jpg" "$out"
  else
    echo "skip: $name (no architecture diagram in .images)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "done: $name -> $out"
  converted=$((converted + 1))
done

echo
echo "Converted $converted repo(s), skipped $skipped."
