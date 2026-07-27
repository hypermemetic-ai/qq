#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
primary="$TMP/primary"
change_root="$TMP/change-worktrees"
linked="$change_root/linked"
outside_linked="$TMP/outside-linked"
runtime="$TMP/runtime"
pi_temp="$TMP/pi-temp"
sibling_root="$TMP/sibling-worktrees"

mkdir -p "$change_root"
git init -q "$primary"
git -C "$primary" -c user.name=test -c user.email=test@example.invalid commit --allow-empty -qm base
git -C "$primary" worktree add -q -b nested-check "$linked"
git -C "$primary" worktree add -q -b outside-check "$outside_linked"
common="$(realpath -e "$(git -C "$linked" rev-parse --path-format=absolute --git-common-dir)")"
linked_git="$(realpath -e "$(git -C "$linked" rev-parse --path-format=absolute --git-dir)")"
mkdir -p "$sibling_root" "$runtime/outer/pi-config" "$runtime/inner/pi-config" "$runtime/read/pi-config" "$pi_temp/pi-subagent-check"

render() {
  local role="$1" run="$2" worktree="$3" git_dir="$4" output="$5"
  node "$ROOT/bin/lib/qq-render-landstrip-policy.mjs" \
    --roles "$ROOT/delegation/policies/roles.json" --role "$role" --run-id "$run" \
    --worktree "$worktree" --git-common-dir "$common" --git-worktree-dir "$git_dir" \
    --runtime-root "$runtime" --change-worktree-root "$change_root" --pi-auth "$runtime/$run/pi-config/auth.json" \
    --pi-subagent-temp-dir "$pi_temp" --structured-output-capture '' \
    --policy "$output" --event-log "$runtime/events.jsonl" --timeout 30s \
    --landstrip-version 'landstrip 0.17.31' >/dev/null
}
render orchestrator outer "$primary" "$common" "$runtime/outer.json"
render implementer inner "$linked" "$linked_git" "$runtime/inner.json"
render reviewer read "$linked" "$linked_git" "$runtime/read.json"

landstrip="$HOME/.pi/agent/npm/node_modules/@landstrip/landstrip-linux-x64/bin/landstrip"
[ -x "$landstrip" ]
# A not-yet-registered future Change path is admitted by its canonical root.
"$landstrip" -p "$runtime/outer.json" bash -c 'mkdir "$1/future-change"; printf future >"$1/future-change/file"' _ "$change_root"
if "$landstrip" -p "$runtime/outer.json" bash -c 'printf forbidden >"$1/file"' _ "$sibling_root" 2>/dev/null; then
  printf 'sibling Repository worktree-root write unexpectedly succeeded\n' >&2; exit 1
fi
if "$landstrip" -p "$runtime/outer.json" bash -c 'printf forbidden >"$1/file"' _ "$outside_linked" 2>/dev/null; then
  printf 'registered worktree outside Change root unexpectedly became writable\n' >&2; exit 1
fi
main_before="$(git -C "$primary" rev-parse refs/heads/main)"
if "$landstrip" -p "$runtime/outer.json" bash -c '
  tree=$(git -C "$1" rev-parse HEAD^{tree})
  commit=$(printf forbidden | git -C "$1" commit-tree "$tree" -p HEAD)
  git -C "$1" update-ref refs/heads/main "$commit"
' _ "$primary" 2>/dev/null; then
  printf 'primary main ref update unexpectedly succeeded\n' >&2; exit 1
fi
test "$(git -C "$primary" rev-parse refs/heads/main)" = "$main_before"
"$landstrip" -p "$runtime/outer.json" \
  "$landstrip" -p "$runtime/inner.json" \
  bash -c 'cd "$1"; printf nested >nested.txt; git add nested.txt; git -c user.name=test -c user.email=test@example.invalid commit -qm nested' _ "$linked"
test "$(git -C "$linked" log -1 --format=%s)" = nested

if "$landstrip" -p "$runtime/outer.json" \
  bash -c 'printf forbidden >"$1/forbidden.txt"' _ "$primary" 2>/dev/null; then
  printf 'primary write unexpectedly succeeded\n' >&2
  exit 1
fi
if "$landstrip" -p "$runtime/outer.json" \
  "$landstrip" -p "$runtime/read.json" \
  bash -c 'printf forbidden >"$1/read-role.txt"' _ "$linked" 2>/dev/null; then
  printf 'read-only nested write unexpectedly succeeded\n' >&2
  exit 1
fi

printf 'test-qq-orchestrator-landstrip: pass\n'
