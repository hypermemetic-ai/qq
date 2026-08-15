#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RAIL="$ROOT/bin/qq-methodology"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() {
  printf 'test-methodology: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  [[ "$1" == *"$2"* ]] || fail "expected output to contain: $2"
}

assert_lowercase_project_name() {
  local matches status
  set +e
  matches=$(git -C "$ROOT" grep -n -I -E \
    '(^|[^[:alnum:]_])QQ([^[:alnum:]_]|$)' -- \
    ':(glob)prompts/**' \
    ':(glob)extensions/**' \
    ':(glob)README*' \
    ':(glob)**/README*')
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$matches" >&2
    fail 'agent-facing prose contains the uppercase project name'
  fi
  (( status == 1 )) || fail 'could not check agent-facing project-name prose'
}

activation() {
  ROOT="$ROOT" REPOSITORY="$1" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const { isActivatedRepository } = await import(pathToFileURL(`${process.env.ROOT}/bin/lib/roles.mjs`));
console.log(isActivatedRepository(process.env.REPOSITORY, process.env.ROOT));
NODE
}

[[ -x "$RAIL" ]] || fail "missing executable: $RAIL"
assert_lowercase_project_name

repository="$TMP/repository"
mkdir -p "$repository"
git init -q -b main "$repository"
git -C "$repository" config user.name 'qq Methodology Test'
git -C "$repository" config user.email 'qq-methodology@example.invalid'
printf 'fixture\n' >"$repository/file.txt"
git -C "$repository" add file.txt
git -C "$repository" commit -qm initial

inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked:'
assert_contains "$inspect_output" 'qq.methodology is absent'
[[ "$(activation "$repository")" == false ]] || fail 'unlinked repository activated qq'

link_output=$(cd "$repository" && "$RAIL" link)
assert_contains "$link_output" 'qq.methodology=true'
assert_contains "$link_output" 'fresh Pi session or run /reload'
[[ "$(git -C "$repository" config --local --type=bool --get qq.methodology)" == true ]] \
  || fail 'link did not write the local activation marker'
[[ "$(activation "$repository")" == true ]] || fail 'linked repository did not activate current qq'
(cd "$repository" && "$RAIL" link >/dev/null)
[[ "$(git -C "$repository" config --local --get-all qq.methodology | wc -l)" == 1 ]] \
  || fail 'idempotent link created multiple values'

worktree="$TMP/worktree"
git -C "$repository" worktree add -q -b linked-worktree "$worktree"
assert_contains "$(cd "$worktree" && "$RAIL" inspect)" 'linked: qq.methodology=true'

clone="$TMP/clone"
git clone -q "$repository" "$clone"
assert_contains "$(cd "$clone" && "$RAIL" inspect)" 'unlinked:'
[[ "$(activation "$clone")" == false ]] || fail 'repository-local link leaked into a clone'

(cd "$worktree" && "$RAIL" unlink >/dev/null)
if git -C "$repository" config --local --get qq.methodology >/dev/null 2>&1; then
  fail 'unlink from a worktree did not clear the common repository marker'
fi
[[ "$(activation "$repository")" == false ]] || fail 'unlinked repository still activated current qq'

non_git="$TMP/non-git"
mkdir -p "$non_git"
if (cd "$non_git" && "$RAIL" link >/dev/null 2>"$TMP/non-git.err"); then
  fail 'link accepted a non-Git directory'
fi
assert_contains "$(<"$TMP/non-git.err")" 'not inside a Git repository'

printf 'test-methodology: pass\n'
