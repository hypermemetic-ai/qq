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
assert_file_contains "$README" 'a successful terminal'
assert_file_contains "$README" '`structured_output` tool result is a trusted recovery watermark'
assert_file_contains "$README" 'Failed tool'
assert_file_contains "$README" 'bare calls, missing or invalid captures, and later errors remain'
assert_file_contains "$README" 'failures under parent schema validation'
assert_file_contains "$README" 'packages, branches, tags, version ranges, moving refs, and local paths are not'
assert_file_not_matches "$README" '^[[:space:]]*pi install npm:pi-subagents([[:space:]]|$)' \
  'README restored npm as an install source for pi-subagents'

literal_installs="$(grep -Fxc -- "pi install $source_pin" "$README" || true)"
assert_equal 2 "$literal_installs" \
  'README must contain the exact pinned new-install and npm-migration commands'
if grep -E '^[[:space:]]*pi install git:github\.com/hypermemetic-ai/pi-subagents@' "$README" \
  | grep -Fvx -- "pi install $source_pin" >/dev/null; then
  fail 'README contains a non-authoritative literal Git install pin'
fi

assert_file_contains "$README" '(.packages // [])[]'
assert_file_contains "$README" 'if type == "string" then . else .source? // empty end'
assert_file_contains "$README" 'select(. == $source)'
assert_file_contains "$README" '] == [$source]'
assert_file_contains "$README" 'PI_PACKAGE_LIST="$(FORCE_COLOR=0 pi list --approve)"'
assert_file_contains "$README" 'package_name == "pi-subagents"'
assert_file_contains "$README" 'authorities != [expected]'
verifier="$tmp/verify-pi-subagents.py"
awk '
  /^SOURCE=.*PY_VERIFY_PI_SUBAGENTS/ { capture=1; next }
  /^PY_VERIFY_PI_SUBAGENTS$/ { capture=0 }
  capture { print }
' "$README" >"$verifier"
[ -s "$verifier" ] || fail 'README package-identity verifier was not extractable'
assert_file_contains "$README" 'rev-parse HEAD'
assert_file_contains "$README" 'test -z "$(git -C "$checkout" status --porcelain)"'
assert_file_contains "$README" 'remote get-url origin'
for valid_settings in \
  "$(jq -cn --arg source "$source_pin" '{packages:[$source]}')" \
  "$(jq -cn --arg source "$source_pin" '{packages:[{source:$source}]}')" \
  "$(jq -cn --arg source "$source_pin" '{packages:[$source,"./pi-subagents-looking"]}')"; do
  printf '%s\n' "$valid_settings" \
    | jq -e --arg source "$source_pin" "$settings_filter" >/dev/null \
    || fail 'sole exact pi-subagents source was rejected'
done
for invalid_settings in \
  "$(jq -cn --arg source "$source_pin" '{packages:[$source,$source]}')" \
  "$(jq -cn --arg source "$source_pin" '{packages:[{source:$source},{source:$source}]}')" \
  "$(jq -cn '{packages:["npm:pi-subagents"]}')" \
  "$(jq -cn '{packages:[]}')"; do
  if printf '%s\n' "$invalid_settings" \
    | jq -e --arg source "$source_pin" "$settings_filter" >/dev/null; then
    fail 'duplicate pi-subagents authority passed the sole-source check'
  fi
done
mkdir -p "$tmp/home/.pi/agent" "$tmp/project/.pi" \
  "$tmp/exact" "$tmp/unrelated" "$tmp/alias" \
  "$tmp/pi-subagents-looking" "$tmp/missing" "$tmp/invalid" \
  "$tmp/empty-name" "$tmp/nonstring-name"
jq -cn --arg source "$source_pin" '{packages:[$source]}' \
  >"$tmp/home/.pi/agent/settings.json"
printf '{"packages":[]}\n' >"$tmp/project/.pi/settings.json"
printf '{"name":"pi-subagents"}\n' >"$tmp/exact/package.json"
printf '{"name":"unrelated"}\n' >"$tmp/unrelated/package.json"
printf '{"name":"pi-subagents"}\n' >"$tmp/alias/package.json"
printf '{"name":"unrelated"}\n' >"$tmp/pi-subagents-looking/package.json"
printf '{not-json\n' >"$tmp/invalid/package.json"
printf '{"name":""}\n' >"$tmp/empty-name/package.json"
printf '{"name":42}\n' >"$tmp/nonstring-name/package.json"
verify_list() {
  (
    cd "$tmp/project"
    HOME="$tmp/home" SOURCE="$source_pin" PI_PACKAGE_LIST="$1" \
      python3 "$verifier" >/dev/null 2>&1
  )
}
for valid_list in \
  "$(printf 'User packages:\n  %s\n    %s\n' "$source_pin" "$tmp/exact")" \
  "$(printf 'Project packages:\n  %s (filtered)\n' "$source_pin")" \
  "$(printf 'User packages:\n  %s\n    %s\nProject packages:\n  ./other\n    %s\n' \
    "$source_pin" "$tmp/exact" "$tmp/unrelated")" \
  "$(printf 'User packages:\n  %s\n    %s\nProject packages:\n  ./pi-subagents-looking\n    %s\n' \
    "$source_pin" "$tmp/exact" "$tmp/pi-subagents-looking")"; do
  verify_list "$valid_list" || fail 'valid combined package identity was rejected'
done
jq -cn --arg source "$source_pin" \
  '{packages:[$source,"./pi-subagents-looking"]}' \
  >"$tmp/home/.pi/agent/settings.json"
user_unrelated_list="$(printf 'User packages:\n  %s\n    %s\n  ./pi-subagents-looking\n    %s\n' \
  "$source_pin" "$tmp/exact" "$tmp/pi-subagents-looking")"
verify_list "$user_unrelated_list" \
  || fail 'valid user-scoped unrelated source spelling was rejected'
jq -cn --arg source "$source_pin" '{packages:[$source]}' \
  >"$tmp/home/.pi/agent/settings.json"
for invalid_list in \
  "$(printf 'User packages:\n  %s\n    %s\nProject packages:\n  ./vendor/delegate (filtered)\n    %s\n' \
    "$source_pin" "$tmp/exact" "$tmp/alias")" \
  "$(printf 'User packages:\n  %s\n    %s\nProject packages:\n  git:example.invalid/alias\n    %s\n' \
    "$source_pin" "$tmp/exact" "$tmp/alias")" \
  "$(printf 'User packages:\n  %s\n    %s\nProject packages:\n  %s (filtered)\n' \
    "$source_pin" "$tmp/exact" "$source_pin")" \
  "$(printf 'Project packages:\n  npm:pi-subagents\n    %s\n' "$tmp/alias")" \
  "$(printf 'User packages:\n  npm:unrelated\n    %s\n' "$tmp/unrelated")" \
  "$(printf 'Project packages:\n  ./missing\n    %s\n' "$tmp/missing")" \
  "$(printf 'Project packages:\n  ./invalid\n    %s\n' "$tmp/invalid")" \
  "$(printf 'Project packages:\n  ./empty-name\n    %s\n' "$tmp/empty-name")" \
  "$(printf 'Project packages:\n  ./nonstring-name\n    %s\n' "$tmp/nonstring-name")" \
  "$(printf 'Project packages:\n  git:example.invalid/unresolved\n')"; do
  if verify_list "$invalid_list"; then
    fail 'wrong, duplicate, aliased, absent, or unresolved package identity passed'
  fi
done
exact_list="$(printf 'User packages:\n  %s\n    %s\n' "$source_pin" "$tmp/exact")"
for ambiguous_source in '  ./delegate' './delegate  ' $'./dele\ngate' \
  $'./dele\vgate' $'./dele\fgate' $'./dele\egate' './delegate (filtered)' ''; do
  jq -cn --arg source "$ambiguous_source" '{packages:[$source]}' \
    >"$tmp/project/.pi/settings.json"
  if verify_list "$exact_list"; then
    fail 'ambiguous configured source bypassed package-list parsing'
  fi
done
printf '{"packages":[]}\n' >"$tmp/project/.pi/settings.json"
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
