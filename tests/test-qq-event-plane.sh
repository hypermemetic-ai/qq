#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-event-plane"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

for dependency in python3 node; do
  command -v "$dependency" >/dev/null 2>&1 || fail "$dependency is required"
done

python3 "$TESTS_DIR/qq_event_plane_test.py" \
  "$ROOT/bin/qq-event-plane" \
  "$ROOT/bin/qq-event-plane-admin" \
  "$ROOT/bin/lib/qq_event_plane_client.py" \
  "$ROOT/bin/lib/qq_event_plane_state.py" \
  "$ROOT/bin/lib/qq-event-plane-client.ts" \
  "$ROOT" "$TMP"

printf 'test-qq-event-plane: pass (46 named proofs; AC #1-#10 + F2-F7 + offline restore crash matrix)\n'
