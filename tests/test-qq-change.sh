#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-change"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
CHANGE="$ROOT/bin/qq-change"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

remote="$tmp/remote.git"
main_checkout="$tmp/main"
change_checkout="$tmp/change"
git init -q --bare "$remote"
git clone -q "$remote" "$main_checkout"
git -C "$main_checkout" switch -q -c main
git -C "$main_checkout" -c user.name=test -c user.email=test@example.com \
  commit --allow-empty -qm base
git -C "$main_checkout" push -qu origin main
git -C "$main_checkout" worktree add -qb feature "$change_checkout" main
printf 'landed content\n' >"$change_checkout/change.txt"
git -C "$change_checkout" add change.txt
git -C "$change_checkout" -c user.name=test -c user.email=test@example.com \
  commit -qm feature
merge_oid="$(git -C "$change_checkout" rev-parse HEAD)"
# Simulate GitHub's merge while leaving the sole local main checkout behind.
git -C "$change_checkout" push -qu origin HEAD:main

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
after_options=false
repo_option=false
for argument in "$@"; do
  if [ "$after_options" = true ] && [[ "$argument" == --repo=* ]]; then
    exit 64
  fi
  if [[ "$argument" == --repo=* ]]; then
    repo_option=true
  fi
  if [ "$argument" = -- ]; then
    after_options=true
  fi
done
if [ "${FAKE_GH_BAD:-}" = 1 ]; then
  printf 'not-json\n'
  exit 0
fi
state="${FAKE_PR_STATE:-MERGED}"
if [ "$repo_option" = true ]; then
  state=OPEN
fi
jq -cn \
  --arg state "$state" \
  --arg oid "${FAKE_MERGE_OID:-}" \
  '{state:$state,mergedAt:(if $state == "MERGED" then "2026-07-18T00:00:00Z" else null end),mergeCommit:(if $state == "MERGED" then {oid:$oid} else null end),url:"https://example.test/pr/83"}'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"
export FAKE_MERGE_OID="$merge_oid"

real_git="$(command -v git)"
fake_git="$tmp/git"
cat >"$fake_git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GIT_LOG"
command_name=""
for argument in "$@"; do
  case "$argument" in
    fetch | pull | merge)
      command_name="$argument"
      break
      ;;
  esac
done
case "$command_name" in
  fetch)
    [ "${FAKE_GIT_FETCH_FAIL:-}" != 1 ] || exit 74
    ;;
  pull)
    exit 75
    ;;
  merge)
    [ "${FAKE_GIT_MERGE_FAIL:-}" != 1 ] || exit 76
    ;;
esac
exec "$REAL_GIT_BIN" "$@"
SH
chmod +x "$fake_git"
export QQ_GIT_BIN="$fake_git"
export REAL_GIT_BIN="$real_git"
export FAKE_GIT_LOG="$tmp/git.log"

fake_herdr="$tmp/herdr"
cat >"$fake_herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_HERDR_LOG"
case "${1:-} ${2:-}" in
  "workspace list")
    if [ -d "$FAKE_CHANGE_CHECKOUT" ]; then
      jq -cn --arg checkout "$FAKE_CHANGE_CHECKOUT" '
        {result:{workspaces:[
          {workspace_id:"change-ws",worktree:{checkout_path:$checkout,is_linked_worktree:true}}
        ]}}'
    else
      printf '%s\n' '{"result":{"workspaces":[]}}'
    fi
    ;;
  "agent list")
    if [ "${FAKE_LIVE_AGENT:-}" = 1 ]; then
      printf '%s\n' '{"result":{"agents":[{"workspace_id":"change-ws","agent":"codex"}]}}'
    else
      printf '%s\n' '{"result":{"agents":[]}}'
    fi
    ;;
  "pane list")
    printf '%s\n' '{"result":{"panes":[{"pane_id":"change-ws:p1","tab_id":"change-ws:t1"}]}}'
    ;;
  "api snapshot")
    printf '%s\n' '{"result":{"focused_workspace_id":"home-ws"}}'
    ;;
  "worktree remove")
    git -C "$FAKE_MAIN_CHECKOUT" worktree remove "$FAKE_CHANGE_CHECKOUT"
    printf '%s\n' '{"result":{"removed":true}}'
    ;;
  *)
    printf 'unexpected fake herdr command: %s\n' "$*" >&2
    exit 2
    ;;
esac
SH
chmod +x "$fake_herdr"
export QQ_HERDR_BIN="$fake_herdr"
export FAKE_HERDR_LOG="$tmp/herdr.log"
export FAKE_CHANGE_CHECKOUT="$change_checkout"
export FAKE_MAIN_CHECKOUT="$main_checkout"

run_change() {
  local expected_exit="$1"
  shift
  set +e
  "$CHANGE" "$@" >"$tmp/result.json"
  actual_exit=$?
  set -e
  assert_equal "$expected_exit" "$actual_exit" "unexpected qq-change exit"
  jq -e . "$tmp/result.json" >/dev/null
}

# Exit 2: a non-merged PR is a rail refusal and leaves local main behind.
export FAKE_PR_STATE=OPEN
run_change 2 land 83 --repo "$change_checkout"
jq -e '
  .status == "refused"
  and .state.pr_state == "OPEN"
' "$tmp/result.json" >/dev/null
assert_not_contains "$(git -C "$main_checkout" rev-parse HEAD)" "$merge_oid" \
  'OPEN refusal synchronized main'

# A flag-shaped selector reaches gh only after its end-of-options terminator;
# gh rejects it as a selector instead of reinterpreting Repository identity.
export FAKE_PR_STATE=MERGED
run_change 1 land --repo=owner/other --repo "$change_checkout"
jq -e '
  .status == "error"
  and (.message | contains("pull-request inspection failed"))
' "$tmp/result.json" >/dev/null

# Exit 1: unreadable GitHub data is an error.
export FAKE_GH_BAD=1
run_change 1 land 83 --repo "$change_checkout"
jq -e '.status == "error"' "$tmp/result.json" >/dev/null
unset FAKE_GH_BAD

# Transport failure belongs only to the fresh fetch and is an engine error.
export FAKE_GIT_FETCH_FAIL=1
run_change 1 land 83 --repo "$change_checkout"
jq -e '
  .status == "error"
  and (.message | contains("freshly fetch"))
' "$tmp/result.json" >/dev/null
unset FAKE_GIT_FETCH_FAIL

# Once origin/main is fetched, a local fast-forward refusal is a rail refusal
# and does not invoke a second transport operation.
export FAKE_GIT_MERGE_FAIL=1
run_change 2 land 83 --repo "$change_checkout"
jq -e '
  .status == "refused"
  and (.message | contains("fast-forward-only"))
' "$tmp/result.json" >/dev/null
unset FAKE_GIT_MERGE_FAIL

# Exit 0: verify merge ancestry, then fast-forward only the sole main checkout.
export FAKE_PR_STATE=MERGED
mkdir -p "$main_checkout/backlog/tasks"
managed_task="$main_checkout/backlog/tasks/t-83 - engine-—-task.md"
printf 'in-flight task\n' >"$managed_task"
run_change 0 land 83 --repo "$change_checkout"
jq -e '
  .status == "done"
  and .state.pr_state == "MERGED"
  and .state.merge_commit == $oid
' --arg oid "$merge_oid" "$tmp/result.json" >/dev/null
assert_equal "$merge_oid" "$(git -C "$main_checkout" rev-parse HEAD)" \
  'land did not synchronize main to the merge commit'
[ -f "$managed_task" ] || fail 'land clobbered the allowed in-flight Task record'
assert_file_not_matches "$FAKE_GIT_LOG" '(^|[[:space:]])pull([[:space:]]|$)' \
  'land performed a second fetch through git pull'

# Land is idempotent when main already contains the verified merge.
run_change 0 land 83 --repo "$main_checkout"

# Retirement refuses while any live delegate remains and changes nothing.
export FAKE_LIVE_AGENT=1
run_change 2 retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:p1
jq -e '
  .status == "refused"
  and .state.live_agent_count == 1
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'live-agent refusal removed the checkout'
git -C "$main_checkout" show-ref --verify --quiet refs/heads/feature \
  || fail 'live-agent refusal deleted the branch'
unset FAKE_LIVE_AGENT

# A one-pane census is insufficient unless that pane is the retained root
# placeholder identified when the Change work session was created.
run_change 2 retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:operator-pane
jq -e '
  .status == "refused"
  and (.message | contains("operator-created"))
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'placeholder mismatch removed the checkout'

# Inspect mirrors every retirement rail without removing anything.
run_change 0 inspect retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:p1
[ -d "$change_checkout" ] || fail 'retire inspect removed the checkout'

# Green retirement uses unforced Herdr removal followed by branch -d.
run_change 0 retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:p1
[ ! -e "$change_checkout" ] || fail 'retire left the Change checkout'
if git -C "$main_checkout" show-ref --verify --quiet refs/heads/feature; then
  fail 'retire left the local Change branch'
fi
assert_file_contains "$FAKE_HERDR_LOG" 'worktree remove --workspace change-ws'

# Retirement is idempotent once both subjects are absent.
run_change 0 retire change-ws --repo "$main_checkout" --branch feature
jq -e '
  .status == "done"
  and .state.workspace_state == "absent"
  and .state.branch_exists == false
' "$tmp/result.json" >/dev/null

# A legitimately operator-closed work session uses the explicit lifecycle
# ownership assertion and unforced git worktree removal.
absent_checkout="$tmp/absent-change"
git -C "$main_checkout" worktree add -qb absent-feature "$absent_checkout" main
printf 'absent-session content\n' >"$absent_checkout/absent.txt"
git -C "$absent_checkout" add absent.txt
git -C "$absent_checkout" -c user.name=test -c user.email=test@example.com \
  commit -qm absent-feature
git -C "$absent_checkout" push -qu origin HEAD:main
git -C "$main_checkout" pull -q --ff-only origin main

run_change 2 retire missing-ws --repo "$main_checkout" \
  --branch absent-feature --checkout "$absent_checkout"
jq -e '
  .status == "refused"
  and (.message | contains("completion wake fired"))
' "$tmp/result.json" >/dev/null
[ -d "$absent_checkout" ] || fail 'absent-session evidence refusal removed the checkout'

run_change 0 retire missing-ws --repo "$main_checkout" \
  --branch absent-feature --checkout "$absent_checkout" --workspace-absent-owned
[ ! -e "$absent_checkout" ] || fail 'absent-session retirement left the checkout'
if git -C "$main_checkout" show-ref --verify --quiet refs/heads/absent-feature; then
  fail 'absent-session retirement left the branch'
fi

# A process interruption after checkout removal can be resumed without any
# remembered phase: the remaining merged branch is re-derived and deleted
# through branch -d only.
git -C "$main_checkout" branch branch-only HEAD
run_change 0 retire interrupted-ws --repo "$main_checkout" --branch branch-only
if git -C "$main_checkout" show-ref --verify --quiet refs/heads/branch-only; then
  fail 'branch-only idempotent retirement left the merged branch'
fi

# A dangling symlink is still an unexplained checkout path, not evidence that
# branch-only recovery may delete the remaining merged branch.
dangling_checkout="$tmp/dangling-checkout"
ln -s "$tmp/missing-checkout-target" "$dangling_checkout"
git -C "$main_checkout" branch dangling-feature HEAD
run_change 2 retire dangling-ws --repo "$main_checkout" \
  --branch dangling-feature --checkout "$dangling_checkout"
jq -e '
  .status == "refused"
  and (.message | contains("local branch remains"))
' "$tmp/result.json" >/dev/null
[ -L "$dangling_checkout" ] || fail 'dangling-checkout refusal removed the symlink'
if ! git -C "$main_checkout" show-ref --verify --quiet \
  refs/heads/dangling-feature; then
  fail 'dangling-checkout refusal deleted the merged branch'
fi

# The same recovery applies when the interrupted invocation supplied the
# checkout path but removed that checkout before branch deletion.
interrupted_checkout="$tmp/interrupted-change"
git -C "$main_checkout" worktree add -qb interrupted-feature \
  "$interrupted_checkout" main
git -C "$main_checkout" worktree remove "$interrupted_checkout"
run_change 0 retire interrupted-checkout-ws --repo "$main_checkout" \
  --branch interrupted-feature --checkout "$interrupted_checkout" \
  --workspace-absent-owned
if git -C "$main_checkout" show-ref --verify --quiet \
  refs/heads/interrupted-feature; then
  fail 'checkout-qualified idempotent retirement left the merged branch'
fi

if grep -Eq -- '(^| )(--force|-D)( |$)' "$FAKE_HERDR_LOG"; then
  fail 'retirement used a forced removal flag'
fi

printf 'test-qq-change: pass\n'
