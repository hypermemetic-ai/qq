#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-facts"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
FIXTURES="$TESTS_DIR/fixtures/observer"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export XDG_STATE_HOME="$tmp/state"

assert_exact_output() {
  local command="$1" fixture="$2" expected="$3" actual="$4"
  (
    cd "$ROOT"
    "$OBSERVE" "$command" "$fixture"
  ) >"$actual"
  if ! cmp -s "$expected" "$actual"; then
    diff -u "$expected" "$actual" >&2 || true
    fail "$command output for $(basename "$fixture") did not exactly match hand-counted expectations"
  fi
}

fixture="$FIXTURES/pi-session.jsonl"
assert_exact_output facts "$fixture" "$FIXTURES/pi-expected-facts.json" \
  "$tmp/pi-facts.json"
assert_exact_output signals "$fixture" "$FIXTURES/pi-expected-signals.json" \
  "$tmp/pi-signals.json"

jq -e '
  .unknown_entries.total == 1
  and .unknown_entries.by_shape == {"pi:future_pi_entry":1}
  and .unknown_entries.entries == [{entry:13, shape:"pi:future_pi_entry"}]
' "$tmp/pi-facts.json" >/dev/null \
  || fail 'Pi unknown entry was not counted and cited'
codex_meta="$tmp/codex-session-meta.jsonl"
printf '%s\n' '{"type":"session_meta","payload":{"timestamp":"2026-07-03T00:00:00Z"}}' \
  >"$codex_meta"
set +e
(
  cd "$ROOT"
  "$OBSERVE" facts "$codex_meta"
) >"$tmp/codex-meta.stdout" 2>"$tmp/codex-meta.stderr"
status=$?
set -e
assert_equal 64 "$status" 'facts accepted Codex session metadata'
[ ! -s "$tmp/codex-meta.stdout" ] || fail 'Codex refusal emitted stdout'
printf '%s\n' 'qq-observe: cannot auto-detect session format from line 1' \
  >"$tmp/codex-meta-expected.stderr"
if ! cmp -s "$tmp/codex-meta-expected.stderr" "$tmp/codex-meta.stderr"; then
  diff -u "$tmp/codex-meta-expected.stderr" "$tmp/codex-meta.stderr" >&2 || true
  fail 'Codex session metadata did not hit the exact auto-detection refusal'
fi

no_usage="$tmp/no-usage.jsonl"
cat >"$no_usage" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-03T00:00:00Z"}
{"type":"message","timestamp":"2026-07-03T00:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"No usage was reported."}]}}
JSONL
(
  cd "$ROOT"
  "$OBSERVE" facts "$no_usage"
) >"$tmp/no-usage-facts.json"
jq -e '
  .token_usage == {input:null, output:null, cache_read:null, cache_write:null}
  and .tokens_unavailable == {input:1, output:1, cache_read:1, cache_write:1}
' "$tmp/no-usage-facts.json" >/dev/null \
  || fail 'absent token fields were zeroed or not counted'

bom_pi="$tmp/bom-pi.jsonl"
printf '\357\273\277%s\n' \
  '{"type":"session","version":3,"timestamp":"2026-07-03T00:00:00Z"}' \
  >"$bom_pi"
(
  cd "$ROOT"
  "$OBSERVE" facts "$bom_pi"
) >"$tmp/bom-pi-facts.json"
jq -e '.session_format == "pi" and .entries == 1' "$tmp/bom-pi-facts.json" >/dev/null \
  || fail 'facts did not retain its documented UTF-8 BOM acceptance'
set +e
(
  cd "$ROOT"
  "$OBSERVE" read-session "$bom_pi"
) >"$tmp/bom-pi-read.stdout" 2>"$tmp/bom-pi-read.stderr"
status=$?
set -e
assert_equal 64 "$status" 'read-session accepted a BOM-prefixed Pi header'
[ ! -s "$tmp/bom-pi-read.stdout" ] || fail 'read-session BOM refusal emitted stdout'
assert_file_contains "$tmp/bom-pi-read.stderr" \
  'qq-observe: cannot read session JSONL: Unexpected UTF-8 BOM' \
  'read-session BOM refusal did not preserve its legacy error'

invalid_constant="$tmp/invalid-constant.jsonl"
cat >"$invalid_constant" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-03T00:00:00Z"}
{"type":"message","timestamp":"2026-07-03T00:00:01Z","message":{"role":"assistant","content":[],"usage":{"input":NaN}}}
JSONL
for command in facts signals; do
  set +e
  (
    cd "$ROOT"
    "$OBSERVE" "$command" "$invalid_constant"
  ) >"$tmp/$command-invalid-constant.stdout" 2>"$tmp/$command-invalid-constant.stderr"
  status=$?
  set -e
  assert_equal 64 "$status" "$command accepted a non-RFC JSON constant"
  [ ! -s "$tmp/$command-invalid-constant.stdout" ] \
    || fail "$command emitted stdout for a non-RFC JSON constant"
  assert_file_contains "$tmp/$command-invalid-constant.stderr" \
    'malformed JSON at line 2:' \
    "$command non-RFC constant failure did not cite the malformed physical line"
done
# read-session retains its legacy acceptance of named numeric constants.
(
  cd "$ROOT"
  "$OBSERVE" read-session "$invalid_constant"
) >"$tmp/read-session-invalid-constant.json"

malformed_pi="$tmp/malformed-pi.jsonl"
cat >"$malformed_pi" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-03T00:00:00Z"}
{"type":"message"
JSONL
for command in facts signals; do
  set +e
  (
    cd "$ROOT"
    "$OBSERVE" "$command" "$malformed_pi"
  ) >"$tmp/$command-malformed.stdout" 2>"$tmp/$command-malformed.stderr"
  status=$?
  set -e
  assert_equal 64 "$status" "$command accepted malformed JSONL"
  assert_file_contains "$tmp/$command-malformed.stderr" 'malformed JSON at line 2' \
    "$command failure did not cite the malformed physical line"
done

printf 'test-qq-observe-facts: pass\n'
