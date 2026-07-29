#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-delegate-runtime-bridge"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
REVIEW_SKILL="$ROOT/skills/code-review/SKILL.md"
DELEGATE_SKILL="$ROOT/skills/delegate-batch/SKILL.md"
RESEARCH_SKILL="$ROOT/skills/research/SKILL.md"
DELIVER_SKILL="$ROOT/skills/deliver-change/SKILL.md"
MANIFESTS_DIR="$ROOT/delegation/manifests/agents"
README="$ROOT/README.md"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

assert_one_literal() {
  local file="$1"
  local needle="$2"
  local label="$3"
  local count
  count="$(grep -oF -- "$needle" "$file" | awk 'END { print NR }' || true)"
  assert_equal 1 "$count" "$label"
}

review_call='bin/qq-delegate run --role reviewer'
delegate_call='bin/qq-delegate run --role implementer'
batch_call='bin/qq-delegate batch'
research_call='bin/qq-delegate run --role researcher'

assert_one_literal "$REVIEW_SKILL" "$review_call" \
  'code-review does not contain exactly one reviewer engine call'
assert_one_literal "$DELEGATE_SKILL" "$delegate_call" \
  'delegate-batch does not contain exactly one implementer engine call'
assert_one_literal "$DELEGATE_SKILL" "$batch_call" \
  'delegate-batch does not contain exactly one batch engine call'
assert_one_literal "$RESEARCH_SKILL" "$research_call" \
  'research does not contain exactly one researcher engine call'

old_call='subagent({agent:"'
for skill in "$REVIEW_SKILL" "$DELEGATE_SKILL" "$RESEARCH_SKILL"; do
  assert_equal 0 "$(grep -oF -- "$old_call" "$skill" | awk 'END { print NR }' || true)" \
    "old subagent call returned in $skill"
  assert_file_not_matches "$skill" 'subagent\(\{[[:space:]]*chain[[:space:]]*:' \
    "one-step chain syntax returned in $skill"
  assert_file_not_matches "$skill" 'timeoutMs[[:space:]]*:[[:space:]]*[0-9]+' \
    "numeric timeoutMs policy literal returned in $skill"
  assert_file_contains "$skill" "source manifest's" \
    "source-manifest timeout recovery wording missing from $skill"
  assert_file_contains "$skill" 'recorded `timeoutMs`, never an override' \
    "timeout override prohibition missing from $skill"
done

for manifest in "$MANIFESTS_DIR"/{implementer,reviewer,researcher,observer}.md; do
  assert_equal 1 "$(grep -Fxc -- 'timeoutMs: 2700000' "$manifest")" \
    "$manifest does not contain exactly one canonical 45-minute timeout"
  assert_equal 1 "$(grep -Ec '^[[:space:]]*timeoutMs[[:space:]]*:' "$manifest")" \
    "$manifest does not contain exactly one timeoutMs declaration"
  for removed_key in extensions systemPromptMode inheritProjectContext \
    inheritSkills defaultContext completionGuard acceptance; do
    assert_file_not_matches "$manifest" "^${removed_key}[[:space:]]*:" \
      "$manifest retains removed key $removed_key"
  done
done
assert_one_literal "$MANIFESTS_DIR/researcher.md" \
  'subagentOnlyExtensions: ~/.pi/agent/npm/node_modules/@upstash/context7-pi/extensions/context7.ts' \
  'researcher does not contain exactly one canonical extension declaration'

assert_file_contains "$DELEGATE_SKILL" 'executes every literal Check'
assert_file_contains "$DELEGATE_SKILL" 'never dispatch around it'
assert_one_literal "$DELIVER_SKILL" 'qq-delegate run --role observer' \
  'deliver-change does not contain exactly one observer engine call'
assert_file_contains "$DELIVER_SKILL" \
  'five accountable-owner gates: intent alignment,'
assert_file_contains "$DELIVER_SKILL" \
  'plan approval, review verdict, acceptance, and merge.'
assert_file_not_matches "$DELIVER_SKILL" 'asynchronously|on wake' \
  'deliver-change retains asynchronous observer dispatch wording'

printf 'test-delegate-runtime-bridge: pass\n'
