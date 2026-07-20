#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-plan-loop"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/cockpit/pi/qq-plan-loop.ts"
PROBE="$TESTS_DIR/fixtures/plan-loop-probe.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node --check "$EXTENSION"

repo="$TMP/repo"
mkdir -p "$repo/.pi/plans" "$repo/src/deep"
git -C "$repo" init -q
git -C "$repo" -c user.name=qq-test -c user.email=qq-test.invalid \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null \
  commit -q --allow-empty -m initial

# The extension intentionally contains JavaScript-compatible TypeScript, so
# the probe can load its real registration and helpers without installing Pi.
module="$TMP/qq-plan-loop.mjs"
cp -- "$EXTENSION" "$module"

HOME="$TMP" node "$PROBE" "$module" "$repo"

printf 'test-plan-loop: pass\n'
