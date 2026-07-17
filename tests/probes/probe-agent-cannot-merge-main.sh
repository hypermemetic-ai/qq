#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c1-agent-cannot-merge-main.txt"
mkdir -p "$EVIDENCE_DIR"

run_probe() (
  set -euo pipefail

  local tmp worktree actor repository_json repo default_branch branch
  local candidate pr_number='' pr_url='' merge_status merged_at checks_seen
  local worktree_added=0 remote_branch_pushed=0 cleanup_complete=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-c1-probe.XXXXXX")"
  worktree="$tmp/worktree"
  branch="probe/t80-c1-$(date -u +%Y%m%dT%H%M%SZ)-$$"

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

  printf 'probe: C1 agent credentials cannot merge main; live main green-gate config remains active\n'
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

  gh api "repos/$repo/rulesets/18942749" >"$tmp/ruleset.json"
  if ! jq -e '
    .id == 18942749
    and .name == "main: pull request with green checks"
    and .target == "branch"
    and .enforcement == "active"
    and (((.bypass_actors // []) | length) == 0)
    and ((((.conditions.ref_name.include // []) | index("~DEFAULT_BRANCH"))) != null)
    and any(.rules[]?; .type == "deletion")
    and any(.rules[]?; .type == "non_fast_forward")
    and any(.rules[]?;
      .type == "pull_request"
      and .parameters.required_approving_review_count == 0)
    and any(.rules[]?;
      .type == "required_status_checks"
      and any(.parameters.required_status_checks[]?;
        .context == "shell-tests" and .integration_id == 15368))
  ' "$tmp/ruleset.json" >/dev/null; then
    printf 'CRITICAL: ruleset 18942749 no longer matches the required main green-gate contract\n'
    jq '{id, name, target, enforcement, bypass_actors, conditions, rules}' "$tmp/ruleset.json"
    exit 1
  fi
  printf 'live_ruleset: '
  jq -c '{id, name, enforcement, bypass_actor_count: ((.bypass_actors // []) | length), required_checks: [.rules[]? | select(.type == "required_status_checks") | .parameters.required_status_checks[]?]}' "$tmp/ruleset.json"

  gh api "repos/$repo/branches/main/protection" >"$tmp/protection.json"
  if ! jq -e --arg actor "$actor" '
    .restrictions != null
    and (([.restrictions.users[]?.login] | index($actor)) == null)
    and (([.restrictions.users[]?.login] | index("qqp-dev")) != null)
    and (([.restrictions.users[]?.login] | index("hypermemetic")) != null)
    and (([.restrictions.users[]?.login] | index("sshmendez")) != null)
  ' "$tmp/protection.json" >/dev/null; then
    printf 'CRITICAL: classic main protection no longer restricts updates to the three operator admin accounts\n'
    jq '{restriction_users: [.restrictions.users[]?.login]}' "$tmp/protection.json"
    exit 1
  fi
  printf 'live_push_restrictions: '
  jq -c '{allowed_users: [.restrictions.users[]?.login]}' "$tmp/protection.json"
  printf 'config_result: PASS — active default-branch rules require PRs and shell-tests; qqp-bot is not an allowed updater\n'

  git -C "$ROOT" fetch --quiet origin \
    refs/heads/main:refs/remotes/origin/main
  git -C "$ROOT" worktree add --quiet --detach "$worktree" refs/remotes/origin/main
  worktree_added=1
  git -C "$worktree" \
    -c user.name="$actor" \
    -c user.email="$actor@users.noreply.github.com" \
    commit --quiet --allow-empty -m 'test: probe agent merge rejection (T-80)'
  candidate="$(git -C "$worktree" rev-parse HEAD)"
  git -C "$worktree" push --quiet origin "HEAD:refs/heads/$branch"
  remote_branch_pushed=1

  gh api -X POST "repos/$repo/pulls" \
    -f title='test: probe agent merge rejection (T-80)' \
    -f body='Harmless empty-commit capability probe. This PR is closed and its branch deleted by the probe.' \
    -f head="$branch" \
    -f base=main >"$tmp/pr.json"
  pr_number="$(jq -r .number "$tmp/pr.json")"
  pr_url="$(jq -r .html_url "$tmp/pr.json")"
  if ! [[ "$pr_number" =~ ^[0-9]+$ ]] || [ "$pr_url" != "https://github.com/$repo/pull/$pr_number" ]; then
    printf 'CRITICAL: scratch PR creation returned an unusable identity\n'
    exit 1
  fi
  printf 'scratch_branch: %s\n' "$branch"
  printf 'harmless_empty_commit: %s\n' "$candidate"
  printf 'scratch_pr: %s\n' "$pr_url"

  checks_seen=0
  for _ in $(seq 1 60); do
    set +e
    gh pr checks "$pr_number" --repo "$repo" --required >"$tmp/checks-ready" 2>&1
    set -e
    if grep -Fq 'shell-tests' "$tmp/checks-ready"; then
      checks_seen=1
      break
    fi
    sleep 5
  done
  sed 's/^/checks_initial: /' "$tmp/checks-ready"
  if [ "$checks_seen" -ne 1 ]; then
    printf 'CRITICAL: required shell-tests check did not appear within five minutes\n'
    exit 1
  fi
  timeout 900 gh pr checks "$pr_number" --repo "$repo" --required --watch --fail-fast
  printf 'checks_result: PASS — all required checks are green before the merge attempt\n'

  printf 'attempt: PUT /repos/%s/pulls/%s/merge (REST API, squash, exact head SHA)\n' "$repo" "$pr_number"
  set +e
  gh api --include -X PUT "repos/$repo/pulls/$pr_number/merge" \
    -f sha="$candidate" \
    -f merge_method=squash >"$tmp/merge-response" 2>"$tmp/merge-error"
  merge_status=$?
  set -e
  sed 's/^/merge_response: /' "$tmp/merge-response"
  sed 's/^/merge_error: /' "$tmp/merge-error"
  printf 'merge_cli_exit_status: %s\n' "$merge_status"

  merged_at="$(gh api "repos/$repo/pulls/$pr_number" --jq '.merged_at // ""')"
  if [ -n "$merged_at" ]; then
    printf 'CRITICAL: agent credentials unexpectedly merged the harmless empty commit at %s\n' "$merged_at"
    exit 1
  fi
  if [ "$merge_status" -eq 0 ]; then
    printf 'CRITICAL: merge endpoint unexpectedly returned success instead of rejecting qqp-bot\n'
    exit 1
  fi
  if ! grep -Eq 'HTTP/[0-9.]+ 405|\(HTTP 405\)' "$tmp/merge-response" "$tmp/merge-error"; then
    printf 'CRITICAL: merge failed, but not with the expected HTTP 405 protected-ref rejection\n'
    exit 1
  fi

  if ! cleanup_resources; then
    printf 'CRITICAL: merge rejection was observed, but scratch-resource cleanup failed\n'
    exit 1
  fi
  cleanup_complete=1
  printf 'result: PASS — a green PR could not be merged by qqp-bot; GitHub returned HTTP 405\n'
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
