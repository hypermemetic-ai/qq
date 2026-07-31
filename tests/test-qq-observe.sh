#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-observe"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[ -x "$OBSERVE" ] || fail "qq-observe is not executable"
set +e
"$OBSERVE" >"$tmp/stdout" 2>"$tmp/usage"
status=$?
set -e
assert_equal 64 "$status" "missing command did not return usage"
assert_file_contains "$tmp/usage" 'qq-observe facts SESSION.jsonl'
assert_file_contains "$tmp/usage" 'qq-observe finalize --run DIR'
assert_file_contains "$tmp/usage" 'qq-observe architect-context'

printf 'test-qq-observe: pass\n'
