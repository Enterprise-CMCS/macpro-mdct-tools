#!/usr/bin/env bash
# Install UI deps and build apps/stackport/ui/dist when missing or stale.
# Set STACKPORT_FORCE_UI_BUILD=1 to always rebuild.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STACKPORT_DIR="${STACKPORT_DIR:-$TOOLS_ROOT/apps/stackport}"
UI_DIR="$STACKPORT_DIR/ui"
DIST_INDEX="$UI_DIR/dist/index.html"

if [[ ! -d "$UI_DIR" ]]; then
  echo "StackPort UI not found at $UI_DIR" >&2
  exit 1
fi

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ -f "$TOOLS_ROOT/.nvmrc" ]]; then
    nvm use "$(cat "$TOOLS_ROOT/.nvmrc")" >/dev/null || true
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to build the StackPort UI. Re-run mdct-setup.sh." >&2
  exit 1
fi

needs_npm_install() {
  [[ ! -d "$UI_DIR/node_modules" ]] && return 0
  [[ -f "$UI_DIR/package-lock.json" && "$UI_DIR/package-lock.json" -nt "$UI_DIR/node_modules" ]] && return 0
  return 1
}

needs_rebuild() {
  [[ "${STACKPORT_FORCE_UI_BUILD:-}" == "1" ]] && return 0
  [[ ! -f "$DIST_INDEX" ]] && return 0
  [[ -f "$UI_DIR/package-lock.json" && "$UI_DIR/package-lock.json" -nt "$DIST_INDEX" ]] && return 0
  [[ "$UI_DIR/package.json" -nt "$DIST_INDEX" ]] && return 0
  [[ -f "$UI_DIR/vite.config.ts" && "$UI_DIR/vite.config.ts" -nt "$DIST_INDEX" ]] && return 0
  [[ -f "$UI_DIR/index.html" && "$UI_DIR/index.html" -nt "$DIST_INDEX" ]] && return 0
  if [[ -d "$UI_DIR/src" ]]; then
    local newer
    newer="$(find "$UI_DIR/src" -type f -newer "$DIST_INDEX" | head -n 1)"
    [[ -n "$newer" ]] && return 0
  fi
  return 1
}

cd "$UI_DIR"

if needs_npm_install; then
  echo "Installing StackPort UI dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

if needs_rebuild; then
  echo "Building StackPort UI → ui/dist/"
  npm run build
fi
