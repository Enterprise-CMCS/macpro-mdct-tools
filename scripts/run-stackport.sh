#!/usr/bin/env bash
# Launch StackPort against local MiniStack (host networking).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STACKPORT_DIR="${STACKPORT_DIR:-$TOOLS_ROOT/apps/stackport}"

if [[ ! -d "$STACKPORT_DIR" ]]; then
  echo "StackPort not found at $STACKPORT_DIR" >&2
  echo "Clone or sync apps/stackport under macpro-mdct-tools." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Re-run mdct-setup.sh or: brew install uv" >&2
  exit 1
fi

"$SCRIPT_DIR/build-stackport-ui.sh"

export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:${MINISTACK_PORT:-4566}}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-mdct}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-mdct}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
export STACKPORT_PORT="${STACKPORT_PORT:-8080}"

echo "StackPort → $AWS_ENDPOINT_URL (UI http://localstack:${STACKPORT_PORT})"
cd "$STACKPORT_DIR"
exec uv run stackport
