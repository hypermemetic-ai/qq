#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c5-pr-handoff-url.txt"
mkdir -p "$EVIDENCE_DIR"

run_probe() (
  set -euo pipefail

  local tmp worktree actor repository_json repo default_branch branch
  local candidate pr_output pr_url='' created_url pr_number='' closed_state
  local worktree_added=0 remote_branch_pushed=0 cleanup_complete=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-c5-probe.XXXXXX")"
  worktree="$tmp/worktree"
  branch="probe/t80-c5-$(date -u +%Y%m%dT%H%M%SZ)-$$"

  cleanup_resources() {
    local failed=0 state refs

    if [ -n "$pr_number" ]; then
      if state="$(gh api "repos/$repo/pulls/$pr_number" --jq .state 2>/dev/null)"; then
        if [ "$state" = 'open' ]; then
          if gh api --silent -X PATCH "repos/$repo/pulls/$pr_number" -f state=closed; then
            printf 'cleanup: closed scratch PR #%s\n' "$pr_number"
          else
            printf 'CRITICAL: could not close scratch PR #%s\n' "$pr_number"
            failed=1
          fi
        else
          printf 'cleanup: scratch PR #%s already %s\n' "$pr_number" "$state"
        fi
      else
        printf 'CRITICAL: could not inspect scratch PR #%s during cleanup\n' "$pr_number"
        failed=1
      fi
    fi

    if [ "$remote_branch_pushed" -eq 1 ]; then
      if refs="$(git -C "$ROOT" ls-remote --heads origin "refs/heads/$branch")"; then
        if [ -n "$refs" ]; then
          if git -C "$ROOT" push --quiet origin --delete "$branch"; then
            printf 'cleanup: deleted scratch branch %s\n' "$branch"
          else
            printf 'CRITICAL: could not delete scratch branch %s\n' "$branch"
            failed=1
          fi
        else
          printf 'cleanup: scratch branch %s already absent\n' "$branch"
        fi
      else
        printf 'CRITICAL: could not inspect scratch branch %s during cleanup\n' "$branch"
        failed=1
      fi
    fi

    if [ "$worktree_added" -eq 1 ]; then
      if git -C "$ROOT" worktree remove "$worktree"; then
        worktree_added=0
        printf 'cleanup: removed temporary detached worktree\n'
      else
        printf 'CRITICAL: could not remove temporary detached worktree\n'
        failed=1
      fi
    fi
    return "$failed"
  }

  cleanup_on_exit() {
    local exit_status=$?
    trap - EXIT
    set +e
    if [ "$cleanup_complete" -eq 0 ]; then
      cleanup_resources
    fi
    rm -rf "$tmp"
    exit "$exit_status"
  }
  trap cleanup_on_exit EXIT

  printf 'probe: C5 PR handoff yields a usable URL\n'
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
  git -C "$ROOT" worktree add --quiet --detach "$worktree" refs/remotes/origin/main
  worktree_added=1
  git -C "$worktree" \
    -c user.name="$actor" \
    -c user.email="$actor@users.noreply.github.com" \
    commit --quiet --allow-empty -m 'test: probe PR handoff URL (T-80)'
  candidate="$(git -C "$worktree" rev-parse HEAD)"
  git -C "$worktree" push --quiet origin "HEAD:refs/heads/$branch"
  remote_branch_pushed=1

  pr_output="$(gh pr create \
    --repo "$repo" \
    --base main \
    --head "$branch" \
    --title 'test: probe PR handoff URL (T-80)' \
    --body 'Harmless empty-commit capability probe. This PR is closed and its branch deleted by the probe.')"
  gh pr view "$branch" --repo "$repo" \
    --json number,url,state,headRefName,baseRefName,headRefOid >"$tmp/pr-view.json"
  pr_number="$(jq -r .number "$tmp/pr-view.json")"
  created_url="$(jq -r .url "$tmp/pr-view.json")"
  pr_url="$pr_output"
  if ! [[ "$pr_number" =~ ^[0-9]+$ ]]; then
    printf 'CRITICAL: created PR did not have a numeric identity\n'
    exit 1
  fi
  if [ "$pr_url" != "$created_url" ] || [ "$pr_url" != "https://github.com/$repo/pull/$pr_number" ]; then
    printf 'CRITICAL: gh pr create did not yield a repository PR URL on stdout: %s\n' "$pr_output"
    exit 1
  fi
  if ! jq -e \
    --arg url "$pr_url" \
    --arg branch "$branch" \
    --arg candidate "$candidate" '
      .url == $url
      and .state == "OPEN"
      and .headRefName == $branch
      and .baseRefName == "main"
      and .headRefOid == $candidate
    ' "$tmp/pr-view.json" >/dev/null; then
    printf 'CRITICAL: the handoff URL did not resolve to the created open PR\n'
    jq . "$tmp/pr-view.json"
    exit 1
  fi
  printf 'harmless_empty_commit: %s\n' "$candidate"
  printf 'handoff_url: %s\n' "$pr_url"
  printf 'url_resolution: PASS — URL resolves to the expected open PR, branch, base, and head SHA\n'

  if ! cleanup_resources; then
    printf 'CRITICAL: URL was usable, but scratch-resource cleanup failed\n'
    exit 1
  fi
  cleanup_complete=1

  closed_state="$(gh pr view "$pr_url" --repo "$repo" --json state --jq .state)"
  if [ "$closed_state" != 'CLOSED' ]; then
    printf 'CRITICAL: scratch PR did not remain resolvable as closed after cleanup\n'
    exit 1
  fi
  printf 'post_cleanup_url_state: %s\n' "$closed_state"
  printf 'result: PASS — gh pr create yielded a usable URL and all scratch resources were cleaned\n'
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
