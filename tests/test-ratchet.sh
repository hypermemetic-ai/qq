#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-ratchet"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
RATCHET="$ROOT/tools/ratchet.sh"
STATE="$ROOT/tools/ratchet-baselines.conf"

[ -x "$RATCHET" ] || fail 'tools/ratchet.sh is not executable'
"$RATCHET" check

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/repo"
mkdir -p "$fixture/tools" "$fixture/backlog/docs"
cp "$ROOT/AGENTS.md" "$ROOT/CONCEPTS.md" "$ROOT/REVIEW.md" "$fixture/"
cp -R "$ROOT/skills" "$ROOT/bin" "$fixture/"
cp "$RATCHET" "$STATE" "$fixture/tools/"
cp \
  "$ROOT/backlog/docs/doc-48 - Conventions-—-board-hygiene-Task-vocabulary-board-deep-links.md" \
  "$fixture/backlog/docs/"

fixture_ratchet="$fixture/tools/ratchet.sh"
fixture_state="$fixture/tools/ratchet-baselines.conf"

budget_value() {
  local name="$1"
  sed -n "s/^${name}_budget=//p" "$fixture_state"
}

expect_failure() {
  local mode="$1"
  local description="$2"

  if "$fixture_ratchet" "$mode" >"$tmp/output" 2>&1; then
    fail "$description unexpectedly succeeded"
  fi
}

"$fixture_ratchet" check >"$tmp/output"
cp "$fixture_state" "$tmp/state-before-checks"

prose_budget="$(budget_value prose_words)"
printf ' ratchet_probe_word\n' >>"$fixture/AGENTS.md"
expect_failure check 'word-budget exceed check'
assert_contains "$(<"$tmp/output")" 'prose_words exceeds budget'
assert_contains "$(<"$tmp/output")" \
  "measured=$((prose_budget + 1)) budget=$prose_budget"
cp "$ROOT/AGENTS.md" "$fixture/AGENTS.md"

codex_budget="$(budget_value codex_exec)"
printf '%s\n' 'codex exec' >"$fixture/skills/ratchet-probe.txt"
expect_failure check 'codex-exec exceed check'
assert_contains "$(<"$tmp/output")" 'codex_exec exceeds budget'
assert_contains "$(<"$tmp/output")" \
  "measured=$((codex_budget + 1)) budget=$codex_budget"
rm "$fixture/skills/ratchet-probe.txt"

# A NUL byte must not let a scoped file hide its idiom occurrences: grep's
# binary heuristic would otherwise suppress the match and pass a stale budget.
printf 'codex exec\0filler\n' >"$fixture/skills/ratchet-probe.dat"
expect_failure check 'codex-exec NUL-file exceed check'
assert_contains "$(<"$tmp/output")" 'codex_exec exceeds budget'
assert_contains "$(<"$tmp/output")" \
  "measured=$((codex_budget + 1)) budget=$codex_budget"
rm "$fixture/skills/ratchet-probe.dat"

runtime_budget="$(budget_value runtime_specific_flags)"
printf '%s\n' '--profile' >"$fixture/skills/ratchet-probe.txt"
expect_failure check 'runtime-flag exceed check'
assert_contains "$(<"$tmp/output")" \
  'runtime_specific_flags exceeds budget'
assert_contains "$(<"$tmp/output")" \
  "measured=$((runtime_budget + 1)) budget=$runtime_budget"
rm "$fixture/skills/ratchet-probe.txt"

parser_budget="$(budget_value shell_parser_idioms)"
printf '%s\n' 'shlex' >"$fixture/bin/ratchet-probe"
expect_failure check 'shell-parser exceed check'
assert_contains "$(<"$tmp/output")" \
  'shell_parser_idioms exceeds budget'
assert_contains "$(<"$tmp/output")" \
  "measured=$((parser_budget + 1)) budget=$parser_budget"
rm "$fixture/bin/ratchet-probe"

cmp "$tmp/state-before-checks" "$fixture_state" || \
  fail 'check mode modified the budget state'

original_agents_words="$(wc -w <"$fixture/AGENTS.md")"
improved_prose_budget=$((prose_budget - original_agents_words))
: >"$fixture/AGENTS.md"
expect_failure check 'stale-budget improvement check'
assert_contains "$(<"$tmp/output")" \
  'prose_words has a stale budget after an improvement'
assert_contains "$(<"$tmp/output")" \
  "measured=$improved_prose_budget budget=$prose_budget"

"$fixture_ratchet" update >"$tmp/output"
assert_equal "$improved_prose_budget" "$(budget_value prose_words)" \
  'update did not lower the prose budget to the measured value'
assert_contains "$(<"$tmp/output")" \
  "lowered prose_words: $prose_budget -> $improved_prose_budget"
"$fixture_ratchet" check >"$tmp/output"

cp "$fixture_state" "$tmp/state-after-lower"
printf '%s\n' 'ratchet_probe_word' >>"$fixture/AGENTS.md"
expect_failure update 'budget-raising update'
assert_contains "$(<"$tmp/output")" 'prose_words exceeds budget'
assert_contains "$(<"$tmp/output")" \
  'refusing update because update never raises budgets'
cmp "$tmp/state-after-lower" "$fixture_state" || \
  fail 'a refused update modified the budget state'

printf 'test-ratchet: pass\n'
