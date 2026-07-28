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

review_call='subagent({agent:"reviewer",task:"Read-and-perform:<absolute-run-dir>/BRIEF.md",acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-change-worktree>",context:"fresh",async:true})'
delegate_call='subagent({agent:"implementer",task:"Read-and-perform:<absolute-run-dir>/BRIEF.md",acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-worktree>",context:"fresh",async:true})'
research_call='subagent({agent:"researcher",task:"Read-and-perform:<absolute-run-dir>/BRIEF.md",acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-working-root>",context:"fresh",async:true})'

assert_one_literal "$REVIEW_SKILL" "$review_call" \
  'code-review does not contain exactly one approved top-level single run'
assert_one_literal "$DELEGATE_SKILL" "$delegate_call" \
  'delegate-batch does not contain exactly one approved top-level single run'
assert_one_literal "$RESEARCH_SKILL" "$research_call" \
  'research does not contain exactly one approved top-level single run'
for skill in "$REVIEW_SKILL" "$DELEGATE_SKILL" "$RESEARCH_SKILL"; do
  assert_file_not_matches "$skill" 'subagent\(\{[[:space:]]*chain[[:space:]]*:' \
    "one-step chain syntax returned in $skill"
  assert_file_not_matches "$skill" 'timeoutMs[[:space:]]*:[[:space:]]*[0-9]+' \
    "numeric timeoutMs policy literal returned in $skill"
  assert_file_contains "$skill" "source run's recorded \`timeoutMs\`" \
    "source-run recorded-timeout recovery wording missing from $skill"
done
assert_file_contains "$REVIEW_SKILL" \
  "source run's recorded \`timeoutMs\` and no other contract override"
assert_file_contains "$DELEGATE_SKILL" \
  "source run's recorded \`timeoutMs\` and no contract override"
for manifest in "$MANIFESTS_DIR"/{implementer,reviewer,researcher,observer}.md; do
  assert_equal 1 "$(grep -Fxc -- 'timeoutMs: 2700000' "$manifest")" \
    "$manifest does not contain exactly one canonical 45-minute timeout"
  assert_equal 1 "$(grep -Ec '^[[:space:]]*timeoutMs[[:space:]]*:' "$manifest")" \
    "$manifest does not contain exactly one timeoutMs declaration"
done

source_pin='git:github.com/hypermemetic-ai/pi-subagents@f8f0ef71ef70606288e34e10b14949c730cf9dcf'
base='9e045ed75e09a163afa17271e55150ed1e8369df'
fork_commit='f8f0ef71ef70606288e34e10b14949c730cf9dcf'
rollback_commit='9e045ed75e09a163afa17271e55150ed1e8369df'
settings_filter='[(.packages // [])[] | (if type == "string" then . else .source? // empty end) | select(. == $source)] == [$source]'

assert_file_contains "$README" "$source_pin"
assert_file_contains "$README" "$base"
assert_file_contains "$README" "$fork_commit"
assert_file_contains "$README" 'The fork commit extends the previous exact reviewed fork pin'
assert_file_contains "$README" 'whose parent is the exact'
assert_file_contains "$README" 'https://github.com/hypermemetic-ai/pi-subagents'
assert_file_contains "$README" "$rollback_commit"
assert_file_contains "$README" 'PI_SUBAGENT_TRUSTED_AGENT_PATHS'
assert_file_contains "$README" 'writes `ENVELOPE.md` there as its only result'
assert_file_contains "$README" 'the adapter atomically writes'
assert_file_contains "$README" '`TERMINAL` when the child exits'
assert_file_contains "$README" 'Missing `ENVELOPE.md` is not complete'
assert_file_contains "$README" 'moving refs, and local paths are not'
assert_file_not_matches "$README" '^[[:space:]]*pi install npm:pi-subagents([[:space:]]|$)' \
  'README restored npm as an install source for pi-subagents'

literal_installs="$(grep -Fxc -- "pi install $source_pin" "$README" || true)"
assert_equal 2 "$literal_installs" \
  'README must contain the exact pinned new-install and npm-migration commands'
if grep -E '^[[:space:]]*pi install git:github\.com/hypermemetic-ai/pi-subagents@' "$README" \
  | grep -Fvx -- "pi install $source_pin" >/dev/null; then
  fail 'README contains a non-authoritative literal Git install pin'
fi

assert_file_contains "$README" 'bin/qq-pi-inventory --check'
assert_file_contains "$README" 'select(. == $source)'
assert_file_contains "$README" '] == [$source]'
# The structured package-inventory contract moved to bin/qq-pi-inventory;
# its parser and identity-matrix coverage lives in tests/test-qq-pi-inventory.sh.
# The README verification block now names that command and one jq identity check.

assert_file_contains "$README" 'test ! -e /var/tmp/.agents'
assert_file_contains "$README" 'test ! -e /var/tmp/.pi'
assert_file_contains "$README" 'mktemp -d /var/tmp/pi-subagents-test.XXXXXX'
assert_file_contains "$README" 'env -u PI_SUBAGENT_PI_BINARY -u PI_SUBAGENT_EXTRA_AGENT_DIRS'
assert_file_contains "$README" '-u PI_SUBAGENT_TRUSTED_AGENT_PATHS -u PI_SUBAGENT_TRUSTED_AGENT_KEYS'
assert_file_contains "$README" '-u PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES -u PI_SUBAGENT_TRUSTED_EXECUTION_ROLE'
assert_file_contains "$README" '-u PI_SUBAGENT_EXECUTION_PROFILE_RECEIPT -u QQ_DISPATCH_RUNTIME_ROOT'
assert_file_contains "$README" 'Moving refs and `pi update` or other automatic'
assert_file_contains "$README" 'One-command rollback removes the retained pin'
assert_file_contains "$README" 'tests/vendor-runtime-contract.sh <absolute-pi-subagents-checkout>'

printf 'test-delegate-runtime-bridge: pass\n'
