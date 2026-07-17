#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c4-parallel-worktrees.txt"
mkdir -p "$EVIDENCE_DIR"

run_probe() (
  set -euo pipefail

  local tmp probe_repository worktree_a worktree_b marker
  local added_a=0 added_b=0
  local git_dir_a git_dir_b common_dir_a common_dir_b writer_a writer_b
  local pid_a pid_b
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-c4-probe.XXXXXX")"
  probe_repository="$tmp/repository"
  worktree_a="$tmp/writer-a"
  worktree_b="$tmp/writer-b"
  marker=".qq-t80-parallel-writer-$PPID-$$"

  cleanup() {
    local exit_status=$?
    trap - EXIT
    set +e
    rm -f "$worktree_a/$marker" "$worktree_b/$marker"
    if [ "$added_a" -eq 1 ]; then
      git -C "$probe_repository" worktree remove --force "$worktree_a" >/dev/null 2>&1
    fi
    if [ "$added_b" -eq 1 ]; then
      git -C "$probe_repository" worktree remove --force "$worktree_b" >/dev/null 2>&1
    fi
    rm -rf "$tmp"
    exit "$exit_status"
  }
  trap cleanup EXIT

  printf 'probe: C4 parallel writers get separate worktrees\n'
  printf 'captured_utc: %s\n' "$(date -u +%FT%TZ)"
  printf 'source_checkout: %s\n' "$ROOT"

  git clone --quiet --no-local "$ROOT" "$probe_repository"
  printf 'isolated_probe_repository: %s\n' "$probe_repository"

  git -C "$probe_repository" worktree add --quiet --detach "$worktree_a" HEAD
  added_a=1
  git -C "$probe_repository" worktree add --quiet --detach "$worktree_b" HEAD
  added_b=1

  git_dir_a="$(git -C "$worktree_a" rev-parse --path-format=absolute --git-dir)"
  git_dir_b="$(git -C "$worktree_b" rev-parse --path-format=absolute --git-dir)"
  common_dir_a="$(git -C "$worktree_a" rev-parse --path-format=absolute --git-common-dir)"
  common_dir_b="$(git -C "$worktree_b" rev-parse --path-format=absolute --git-common-dir)"

  if [ "$worktree_a" = "$worktree_b" ] || [ "$git_dir_a" = "$git_dir_b" ]; then
    printf 'CRITICAL: Git did not allocate distinct worktree paths and administrative directories\n'
    exit 1
  fi
  if [ "$common_dir_a" != "$common_dir_b" ]; then
    printf 'CRITICAL: temporary worktrees do not belong to the same Repository\n'
    exit 1
  fi
  if ! git -C "$probe_repository" worktree list --porcelain | grep -Fxq "worktree $worktree_a"; then
    printf 'CRITICAL: writer A is absent from git worktree list\n'
    exit 1
  fi
  if ! git -C "$probe_repository" worktree list --porcelain | grep -Fxq "worktree $worktree_b"; then
    printf 'CRITICAL: writer B is absent from git worktree list\n'
    exit 1
  fi

  (
    printf 'writer-a\n' >"$worktree_a/$marker"
  ) &
  pid_a=$!
  (
    printf 'writer-b\n' >"$worktree_b/$marker"
  ) &
  pid_b=$!
  wait "$pid_a"
  wait "$pid_b"

  writer_a="$(<"$worktree_a/$marker")"
  writer_b="$(<"$worktree_b/$marker")"
  if [ "$writer_a" != 'writer-a' ] || [ "$writer_b" != 'writer-b' ]; then
    printf 'CRITICAL: concurrent writes crossed worktree boundaries\n'
    exit 1
  fi
  if [ -e "$ROOT/$marker" ]; then
    printf 'CRITICAL: a temporary writer changed the invoking checkout\n'
    exit 1
  fi

  printf 'writer_a_worktree: %s\n' "$worktree_a"
  printf 'writer_a_git_dir: %s\n' "$git_dir_a"
  printf 'writer_a_marker: %s\n' "$writer_a"
  printf 'writer_b_worktree: %s\n' "$worktree_b"
  printf 'writer_b_git_dir: %s\n' "$git_dir_b"
  printf 'writer_b_marker: %s\n' "$writer_b"
  printf 'shared_repository_git_dir: %s\n' "$common_dir_a"

  rm -f "$worktree_a/$marker" "$worktree_b/$marker"
  git -C "$probe_repository" worktree remove "$worktree_a"
  added_a=0
  git -C "$probe_repository" worktree remove "$worktree_b"
  added_b=0
  printf 'cleanup: PASS — both temporary worktrees removed\n'
  printf 'result: PASS — simultaneous writers remained isolated in distinct linked worktrees\n'
)

set +e
run_probe 2>&1 | tee "$EVIDENCE"
pipeline_status=("${PIPESTATUS[@]}")
set -e
if [ "${pipeline_status[1]}" -ne 0 ]; then
  printf 'CRITICAL: could not write evidence file: %s\n' "$EVIDENCE" >&2
  exit "${pipeline_status[1]}"
fi
exit "${pipeline_status[0]}"
