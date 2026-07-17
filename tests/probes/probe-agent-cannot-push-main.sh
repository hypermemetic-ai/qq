#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c2-agent-cannot-push-main.txt"
mkdir -p "$EVIDENCE_DIR"

run_probe() (
  set -euo pipefail

  local tmp worktree actor repository_json repo default_branch
  local baseline candidate remote_after push_status
  local worktree_added=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-c2-probe.XXXXXX")"
  worktree="$tmp/worktree"

  cleanup() {
    local exit_status=$?
    trap - EXIT
    set +e
    if [ "$worktree_added" -eq 1 ]; then
      git -C "$ROOT" worktree remove --force "$worktree" >/dev/null 2>&1
    fi
    rm -rf "$tmp"
    exit "$exit_status"
  }
  trap cleanup EXIT

  printf 'probe: C2 agent credentials cannot push main\n'
  printf 'captured_utc: %s\n' "$(date -u +%FT%TZ)"
  cd "$ROOT"

  actor="$(gh api user --jq .login)"
  if [ "$actor" != 'qqp-bot' ]; then
    printf 'CRITICAL: refusing to probe with gh authenticated as %s; expected qqp-bot\n' "$actor"
    exit 1
  fi
  repository_json="$(gh repo view --json nameWithOwner,defaultBranchRef)"
  repo="$(jq -r .nameWithOwner <<<"$repository_json")"
  default_branch="$(jq -r .defaultBranchRef.name <<<"$repository_json")"
  if [ "$default_branch" != 'main' ]; then
    printf 'CRITICAL: expected default branch main, got %s\n' "$default_branch"
    exit 1
  fi
  printf 'authenticated_actor: %s\n' "$actor"
  printf 'repository: %s\n' "$repo"

  git -C "$ROOT" fetch --quiet origin \
    refs/heads/main:refs/remotes/origin/main
  baseline="$(git -C "$ROOT" rev-parse refs/remotes/origin/main)"
  git -C "$ROOT" worktree add --quiet --detach "$worktree" refs/remotes/origin/main
  worktree_added=1
  git -C "$worktree" \
    -c user.name="$actor" \
    -c user.email="$actor@users.noreply.github.com" \
    commit --quiet --allow-empty -m 'test: probe agent direct-push rejection (T-80)'
  candidate="$(git -C "$worktree" rev-parse HEAD)"

  printf 'remote_main_before: %s\n' "$baseline"
  printf 'harmless_empty_commit: %s\n' "$candidate"
  printf 'attempt: git push origin HEAD:refs/heads/main\n'

  set +e
  git -C "$worktree" push origin HEAD:refs/heads/main >"$tmp/push-output" 2>&1
  push_status=$?
  set -e
  sed 's/^/push: /' "$tmp/push-output"
  printf 'push_exit_status: %s\n' "$push_status"

  remote_after="$(git -C "$ROOT" ls-remote origin refs/heads/main | awk '{print $1}')"
  printf 'remote_main_after: %s\n' "$remote_after"

  if [ "$push_status" -eq 0 ]; then
    printf 'CRITICAL: agent credentials unexpectedly pushed the harmless empty commit to main\n'
    exit 1
  fi
  if ! grep -Fq 'GH013' "$tmp/push-output"; then
    printf 'CRITICAL: push failed, but not with the expected protected-branch GH013 rejection\n'
    exit 1
  fi
  if [ "$remote_after" != "$baseline" ]; then
    printf 'CRITICAL: remote main changed during a rejected push\n'
    exit 1
  fi

  git -C "$ROOT" worktree remove "$worktree"
  worktree_added=0
  printf 'cleanup: PASS — temporary detached worktree removed; no scratch remote ref was created\n'
  printf 'result: PASS — GitHub rejected the agent-authenticated direct push and main was unchanged\n'
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
