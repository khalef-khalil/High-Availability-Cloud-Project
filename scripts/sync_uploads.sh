#!/usr/bin/env bash
set -euo pipefail
# Usage: ./scripts/sync_uploads.sh user@peer:/path/to/project/uploads/
# Sync local uploads/ -> remote uploads/ (one-way) using rsync over SSH
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/uploads/"
DEST="$1"
rsync -az --delete "$SRC_DIR" "$DEST"
