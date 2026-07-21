#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
RENDERER="$ROOT/bin/lib/qq-render-landstrip-policy.mjs"
ROLES="$ROOT/delegation/policies/roles.json"

skip() {
  printf 'test-qq-delegate-enforcement: skip: %s\n' "$1"
  exit 0
}

fail() {
  printf 'test-qq-delegate-enforcement: FAIL: %s\n' "$1" >&2
  exit 1
}

# shellcheck source=bin/lib/qq-bin.sh
# shellcheck disable=SC1091
source "$ROOT/bin/lib/qq-bin.sh"

if ! qq_resolve_bin node; then
  skip "$QQ_BIN_ERROR"
fi
node_binary="$QQ_BIN_RESULT"

if [[ -n "${QQ_LANDSTRIP_BIN:-}" ]]; then
  if ! qq_resolve_bin landstrip; then
    fail "$QQ_BIN_ERROR"
  fi
  landstrip_binary="$QQ_BIN_RESULT"
else
  [[ -n "${HOME:-}" ]] || skip 'HOME is unavailable for operator Pi npm-tree lookup'
  if ! platform="$("$node_binary" -p 'process.platform' 2>/dev/null)" \
    || ! architecture="$("$node_binary" -p 'process.arch' 2>/dev/null)"; then
    skip 'node could not resolve the Landstrip platform package'
  fi
  landstrip_binary="${HOME%/}/.pi/agent/npm/node_modules/@landstrip/landstrip-${platform}-${architecture}/bin/landstrip"
  [[ -f "$landstrip_binary" && -x "$landstrip_binary" ]] \
    || skip 'Landstrip is not installed in the operator Pi npm tree'
fi

if ! landstrip_binary="$(realpath -e -- "$landstrip_binary" 2>/dev/null)"; then
  fail 'Landstrip binary cannot be resolved'
fi
if ! landstrip_version="$("$landstrip_binary" --version 2>&1)"; then
  fail "Landstrip version probe failed: $landstrip_version"
fi
[[ "$landstrip_version" == 'landstrip 0.17.31' ]] \
  || fail "expected Landstrip 0.17.31, got '$landstrip_version'"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-delegate-enforcement.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
worktree="$tmp/worktree"
git_common_dir="$tmp/git-common"
git_worktree_dir="$tmp/git-worktree"
runtime_root="$tmp/runtime"
launcher_tmp="$tmp/launcher-tmp"
test_home="$tmp/home"
reviewer_run="$runtime_root/runs/reviewer"
implementer_run="$runtime_root/runs/implementer"
own_subagent_tmp="$launcher_tmp/pi-subagent-THIS"
mkdir -p \
  "$worktree" \
  "$git_common_dir" \
  "$git_worktree_dir" \
  "$reviewer_run/pi-config" \
  "$implementer_run/pi-config" \
  "$own_subagent_tmp" \
  "$test_home"
printf '%s\n' 'staged-auth-sentinel' >"$reviewer_run/pi-config/auth.json"
printf '%s\n' 'staged-auth-sentinel' >"$implementer_run/pi-config/auth.json"

render_policy() {
  local role="$1"
  local run_dir="$2"
  local policy_path="$3"
  "$node_binary" "$RENDERER" \
    --roles "$ROLES" \
    --role "$role" \
    --run-id "native-$role" \
    --worktree "$worktree" \
    --git-common-dir "$git_common_dir" \
    --git-worktree-dir "$git_worktree_dir" \
    --runtime-root "$runtime_root" \
    --pi-auth "$run_dir/pi-config/auth.json" \
    --pi-subagent-temp-dir "$launcher_tmp" \
    --structured-output-capture '' \
    --policy "$policy_path" \
    --event-log "$runtime_root/native-events.jsonl" \
    --timeout 2s \
    --landstrip-version "$landstrip_version" \
    >/dev/null
}

reviewer_policy="$reviewer_run/landstrip-policy.json"
implementer_policy="$implementer_run/landstrip-policy.json"
render_policy reviewer "$reviewer_run" "$reviewer_policy"
render_policy implementer "$implementer_run" "$implementer_policy"

# This models a later pi-subagents run: it did not exist when either policy was
# rendered, so neither policy may acquire access to it through a shared glob.
later_subagent_tmp="$launcher_tmp/pi-subagent-OTHER"
sibling_run="$runtime_root/runs/sibling"
mkdir -p "$later_subagent_tmp" "$sibling_run"

assert_policy_omits() {
  local policy="$1"
  local omitted_path="$2"
  "$node_binary" -e '
    const fs = require("node:fs");
    const policy = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (policy.filesystem.allowWrite.includes(process.argv[2])) process.exit(1);
  ' "$policy" "$omitted_path" \
    || fail "policy unexpectedly grants $omitted_path"
}

assert_write_denied() {
  local policy="$1"
  local target="$2"
  local label="$3"
  local output="$tmp/$label.output"
  rm -f -- "$target"
  set +e
  "$landstrip_binary" -p "$policy" \
    "$node_binary" -e '
      require("node:fs").writeFileSync(process.argv[1], "forbidden\n");
    ' "$target" >"$output" 2>&1
  local status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label write unexpectedly succeeded"
  [[ ! -e "$target" ]] || fail "$label write created $target"
}

assert_overwrite_denied() {
  local policy="$1"
  local target="$2"
  local label="$3"
  local output="$tmp/$label.output"
  set +e
  "$landstrip_binary" -p "$policy" \
    "$node_binary" -e '
      require("node:fs").writeFileSync(process.argv[1], "forbidden\n");
    ' "$target" >"$output" 2>&1
  local status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label overwrite unexpectedly succeeded"
  [[ "$(cat "$target")" == 'staged-auth-sentinel' ]] \
    || fail "$label overwrite changed $target"
}

assert_policy_omits "$reviewer_policy" "$later_subagent_tmp"
assert_policy_omits "$implementer_policy" "$later_subagent_tmp"

assert_write_denied \
  "$reviewer_policy" "$worktree/reviewer-created" reviewer-worktree

implementer_target="$worktree/implementer-created"
"$landstrip_binary" -p "$implementer_policy" \
  "$node_binary" -e '
    require("node:fs").writeFileSync(process.argv[1], "allowed\n");
  ' "$implementer_target" >"$tmp/implementer-worktree.output" 2>&1 || {
    sed -n '1,80p' "$tmp/implementer-worktree.output" >&2
    fail 'implementer worktree write was denied'
  }
[[ "$(cat "$implementer_target")" == 'allowed' ]] \
  || fail 'implementer worktree write did not persist'

assert_write_denied \
  "$implementer_policy" "$test_home/implementer-created" implementer-home
assert_overwrite_denied \
  "$implementer_policy" "$implementer_run/pi-config/auth.json" staged-auth
assert_write_denied \
  "$implementer_policy" "$sibling_run/implementer-created" sibling-run
assert_write_denied \
  "$implementer_policy" "$later_subagent_tmp/implementer-created" later-subagent-run

printf 'test-qq-delegate-enforcement: pass\n'
