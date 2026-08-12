#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/ep.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
mkdir -m 700 "$TMP/scratch"
python3 "$ROOT/tests/event_plane_test.py" \
  "$ROOT/bin/event-plane" \
  "$ROOT/bin/event-plane-admin" \
  "$ROOT/bin/lib/event_plane_client.py" \
  "$ROOT/bin/lib/event-plane-client.ts" \
  "$ROOT" "$TMP/scratch"
printf 'test-event-plane: pass\n'
