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
export XDG_STATE_HOME="$tmp/state"

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
selector=""
for argument in "$@"; do
  if [ "$after_options" = true ] && [[ "$argument" == --repo=* ]]; then
    exit 64
  fi
  if [[ "$argument" == --repo=* ]]; then
    repo_option=true
  fi
  if [ "$argument" = -- ]; then
    after_options=true
  elif [[ "$argument" =~ ^[0-9]+$ ]]; then
    selector="$argument"
  fi
done
if [ "${1:-} ${2:-}" = "repo view" ]; then
  printf '%s\n' '{"nameWithOwner":"fixture/repo"}'
  exit 0
fi
if [ "${FAKE_GH_BAD:-}" = 1 ]; then
  printf 'not-json\n'
  exit 0
fi
state="${FAKE_PR_STATE:-MERGED}"
if [ "$repo_option" = true ]; then
  state=OPEN
fi
jq -cn \
  --argjson number "${selector:-83}" \
  --arg state "$state" \
  --arg head_ref "${FAKE_PR_HEAD:-feature}" \
  --arg oid "${FAKE_MERGE_OID:-}" \
  '{number:$number,state:$state,headRefName:$head_ref,body:"T-83 — fixture Change",mergedAt:(if $state == "MERGED" then "2026-07-18T00:00:00Z" else null end),mergeCommit:(if $state == "MERGED" then {oid:$oid} else null end),url:"https://example.test/pr/83"}'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"
export FAKE_MERGE_OID="$merge_oid"
export QQ_QQ_OBSERVE_BIN="$ROOT/bin/qq-observe"

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
      printf '%s\n' '{"result":{"agents":[{"workspace_id":"change-ws","agent":"other-agent"}]}}'
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

# An untracked Task record is dirty primary state and blocks landing just like
# every other untracked path.
export FAKE_PR_STATE=MERGED
mkdir -p "$main_checkout/backlog/tasks"
managed_task="$main_checkout/backlog/tasks/t-83 - engine-—-task.md"
printf 'in-flight task\n' >"$managed_task"
run_change 2 land 83 --repo "$change_checkout"
jq -e '
  .status == "refused"
  and (.message | contains("Primary main permits no tracked changes or untracked paths, including backlog/tasks"))
  and .state.current_status == "?? backlog/tasks/t-83 - engine-—-task.md"
' "$tmp/result.json" >/dev/null
assert_not_contains "$(git -C "$main_checkout" rev-parse HEAD)" "$merge_oid" \
  'dirty-primary refusal synchronized main'
[ -f "$managed_task" ] || fail 'dirty-primary refusal removed the Task record'

# Exit 0: a completely clean primary passes the same land rails.
rm -- "$managed_task"
rmdir -- "$main_checkout/backlog/tasks" "$main_checkout/backlog"
run_change 0 land 83 --repo "$change_checkout"
expected_fingerprint="$(git -C "$main_checkout" ls-tree -rz --full-tree "$merge_oid" -- \
  AGENTS.md skills extensions .pi/prompts/bro.md .pi/prompts/check-in.md | sha256sum | awk '{print $1}')"
jq -e '
  .status == "done"
  and .state.pr_state == "MERGED"
  and .state.merge_commit == $oid
  and .state.before_tree != .state.landed_tree
  and .state.activation.action == "none"
  and .state.activation.resource_fingerprint == $fingerprint
  and .state.activation.changed_loaded_resources == []
  and .state.activation.reason == "no globally loaded qq resources changed"
  and .state.activation_targets == []
  and .state.activation_armed == false
' --arg oid "$merge_oid" --arg fingerprint "$expected_fingerprint" "$tmp/result.json" >/dev/null
assert_equal "$merge_oid" "$(git -C "$main_checkout" rev-parse HEAD)" \
  'land did not synchronize main to the merge commit'
assert_file_not_matches "$FAKE_GIT_LOG" '(^|[[:space:]])pull([[:space:]]|$)' \
  'land performed a second fetch through git pull'

# Land is idempotent when main already contains the verified merge.
run_change 0 land 83 --repo "$main_checkout"

# A second landed Change touching the globally mounted extension tree is
# classified and armed through the same fast-forward rail. Empty discovery is
# a valid exact census, not an excuse to omit the activation record.
loaded_checkout="$tmp/loaded-change"
git -C "$main_checkout" worktree add -qb loaded-feature "$loaded_checkout" main
mkdir -p "$loaded_checkout/extensions"
printf 'export default function fixture() {}\n' >"$loaded_checkout/extensions/fixture.ts"
git -C "$loaded_checkout" add extensions/fixture.ts
git -C "$loaded_checkout" -c user.name=test -c user.email=test@example.com \
  commit -qm loaded-feature
loaded_oid="$(git -C "$loaded_checkout" rev-parse HEAD)"
git -C "$loaded_checkout" push -qu origin HEAD:main
export FAKE_MERGE_OID="$loaded_oid"
export FAKE_PR_HEAD=loaded-feature
run_change 0 land 84 --repo "$loaded_checkout"
jq -e '
  .status == "done"
  and .state.activation.action == "reload"
  and .state.activation.changed_loaded_resources == ["extensions/fixture.ts"]
  and .state.activation_targets == []
  and .state.activation_armed == true
  and (.state.activation_run_dir | type == "string")
' "$tmp/result.json" >/dev/null
activation_run_dir="$(jq -r '.state.activation_run_dir' "$tmp/result.json")"
[ -f "$activation_run_dir/REQUEST.json" ] || fail 'land did not arm its activation request'
[ ! -e "$activation_run_dir/REQUEST.pending" ] || fail 'land left a pending activation request after synchronization'
run_change 0 land 84 --repo "$main_checkout"
jq -e --arg run_dir "$activation_run_dir" '
  .status == "done"
  and .state.activation.action == "reload"
  and .state.activation_run_dir == $run_dir
  and .state.activation_armed == true
  and .state.retried_activation_targets == []
' "$tmp/result.json" >/dev/null

# Restore the original PR merge identity used by retirement fixtures. The
# feature branch remains an ancestor after this later loaded Change lands.
export FAKE_MERGE_OID="$merge_oid"
unset FAKE_PR_HEAD

# An uncommitted record in the Change checkout also fails the common clean
# worktree rail before retirement can remove any lifecycle subject.
mkdir -p "$change_checkout/backlog/tasks"
change_task="$change_checkout/backlog/tasks/t-83 - unfinished.md"
printf 'unfinished record\n' >"$change_task"
run_change 2 retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:p1
jq -e '
  .status == "refused"
  and (.message | contains("uncommitted Task record is dirty like any other path"))
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'dirty-record refusal removed the checkout'
rm -- "$change_task"
rmdir -- "$change_checkout/backlog/tasks" "$change_checkout/backlog"

observer_run_dir="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/repo/pr-83"
observer_package="$observer_run_dir/package.json"

# A known merged PR refuses retirement while its canonical guided observer
# run is missing, invalid, or unfinalized; the state names the run dir.
run_change 2 retire change-ws --repo "$main_checkout" --branch feature --pr 83 \
  --placeholder-pane change-ws:p1
jq -e --arg run_dir "$observer_run_dir" '
  .status == "refused"
  and .state.observer_package == $run_dir
  and .state.observer_package_status == "missing-invalid-or-unfinalized"
  and (.message | contains("qq-observe assemble --pr 83 --repo"))
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'missing-observer refusal removed the checkout'

mkdir -p "$observer_run_dir"
printf '%s\n' '{"schema":"wrong","pr":83,"repository":"fixture/repo"}' \
  >"$observer_package"
run_change 2 retire change-ws --repo "$main_checkout" --branch feature --pr 83 \
  --placeholder-pane change-ws:p1
jq -e '
  .status == "refused"
  and .state.observer_package_status == "missing-invalid-or-unfinalized"
' "$tmp/result.json" >/dev/null

# A schema-valid package without a terminal analysis record is still
# unfinalized and refuses the same way.
printf '%s\n' \
  '{"schema":"qq-observer.package","schema_version":2,"pr":83,"repository":"fixture/repo"}' \
  >"$observer_package"
run_change 2 retire change-ws --repo "$main_checkout" --branch feature --pr 83 \
  --placeholder-pane change-ws:p1
jq -e '
  .status == "refused"
  and .state.observer_package_status == "missing-invalid-or-unfinalized"
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'unfinalized-observer refusal removed the checkout'

# The sole explicit operator override bypasses only the run check, is
# visible in result state, and inspect still leaves every subject intact.
run_change 0 inspect retire change-ws --repo "$main_checkout" --branch feature \
  --pr 83 --allow-unobserved-retire --placeholder-pane change-ws:p1
jq -e '
  .status == "done"
  and .state.allow_unobserved_retire == true
  and .state.observer_package_status == "override"
' "$tmp/result.json" >/dev/null
[ -d "$change_checkout" ] || fail 'observer override inspect removed the checkout'

# A failed-but-final run carries the canonical analysis_failed.json marker
# and satisfies the observer rail from here on.
printf '%s\n' \
  '{"reason":"fixture analysis failed","schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed"}' \
  >"$observer_run_dir/analysis_failed.json"

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

# Delegate run dirs bound to the retiring checkout expire with the
# retirement; foreign and unsealed run dirs are never touched.
delegate_root="$XDG_STATE_HOME/qq/delegate"
retire_run="$delegate_root/retire-run"
foreign_run="$delegate_root/foreign-run"
unsealed_run="$delegate_root/unsealed-run"
mkdir -p -m 700 "$retire_run" "$foreign_run" "$unsealed_run"
checkout_canonical="$(cd "$change_checkout" && pwd -P)"
jq -cn --arg cwd "$checkout_canonical" \
  '{schema:"qq-run-terminal",version:2,run_id:"retire-run",agent:"reviewer",exit_code:0,timed_out:false,cwd:$cwd}' \
  >"$retire_run/TERMINAL"
jq -cn \
  '{schema:"qq-run-terminal",version:2,run_id:"foreign-run",agent:"reviewer",exit_code:0,timed_out:false,cwd:"/elsewhere"}' \
  >"$foreign_run/TERMINAL"

# Without --pr no observer package is verified, so bound sealed run dirs
# block retirement unless the operator explicitly overrides; every subject
# and run dir is preserved.
run_change 2 retire change-ws --repo "$main_checkout" --branch feature \
  --placeholder-pane change-ws:p1
jq -e '
  .status == "refused"
  and .state.delegate_run_dirs == 1
  and (.message | contains("--allow-unobserved-retire"))
' "$tmp/result.json" >/dev/null
[ -d "$retire_run" ] || fail 'unverified-evidence refusal removed a run dir'
[ -d "$change_checkout" ] || fail 'unverified-evidence refusal removed the checkout'

# Inspect mirrors every retirement rail without removing anything.
run_change 0 inspect retire change-ws --repo "$main_checkout" --branch feature \
  --pr 83 --placeholder-pane change-ws:p1
[ -d "$change_checkout" ] || fail 'retire inspect removed the checkout'
jq -e '.state.delegate_run_dirs == 1' "$tmp/result.json" >/dev/null \
  || fail 'retire inspect did not count the bound delegate run dir'
[ -d "$retire_run" ] || fail 'retire inspect removed a delegate run dir'

# Green retirement uses unforced Herdr removal followed by branch -d.
run_change 0 retire change-ws --repo "$main_checkout" --branch feature \
  --pr 83 --placeholder-pane change-ws:p1
[ ! -e "$change_checkout" ] || fail 'retire left the Change checkout'
if git -C "$main_checkout" show-ref --verify --quiet refs/heads/feature; then
  fail 'retire left the local Change branch'
fi
assert_file_contains "$FAKE_HERDR_LOG" 'worktree remove --workspace change-ws'
jq -e '
  .state.delegate_run_dirs == 1
  and .state.activation_retirement.status == "not-found"
  and .state.activation_retirement.retired == false
' "$tmp/result.json" >/dev/null \
  || fail 'retire did not report delegate and activation retirement state'
[ ! -e "$retire_run" ] || fail 'retire left a delegate run dir bound to the checkout'
[ -d "$foreign_run" ] || fail 'retire removed a foreign delegate run dir'
[ -d "$unsealed_run" ] || fail 'retire removed an unsealed delegate run dir'
[ -d "$activation_run_dir" ] || fail 'retire removed a foreign Change activation run'

# Retirement is idempotent once both subjects are absent.
run_change 0 retire change-ws --repo "$main_checkout" --branch feature
jq -e '
  .status == "done"
  and .state.workspace_state == "absent"
  and .state.branch_exists == false
  and .state.activation_retirement.status == "not-found"
' "$tmp/result.json" >/dev/null

# The engine retires only the one complete activation request matching the
# supplied branch and PR identity, then reports an idempotent exact absence.
export FAKE_PR_HEAD=loaded-feature
run_change 0 retire loaded-ws --repo "$main_checkout" --branch loaded-feature \
  --pr 84 --checkout "$loaded_checkout" --workspace-absent-owned \
  --allow-unobserved-retire
jq -e --arg run_id "$(basename "$activation_run_dir")" '
  .state.activation_retirement.status == "retired"
  and .state.activation_retirement.retired == true
  and .state.activation_retirement.run_id == $run_id
' "$tmp/result.json" >/dev/null
[ ! -e "$activation_run_dir" ] || fail 'qq-change retire left its exact complete activation run'
[ -d "$foreign_run" ] || fail 'activation retirement removed a foreign delegate run'
run_change 0 retire loaded-ws --repo "$main_checkout" --branch loaded-feature --pr 84
jq -e '
  .state.activation_retirement.status == "not-found"
  and .state.activation_retirement.retired == false
' "$tmp/result.json" >/dev/null
unset FAKE_PR_HEAD

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

# The explicit operator override sanctions unobserved retirement: bound
# sealed run dirs, checkout, and branch are all removed without --pr.
override_checkout="$tmp/override-change"
git -C "$main_checkout" worktree add -qb override-feature "$override_checkout" main
printf 'override content\n' >"$override_checkout/override.txt"
git -C "$override_checkout" add override.txt
git -C "$override_checkout" -c user.name=test -c user.email=test@example.com \
  commit -qm override-feature
git -C "$override_checkout" push -qu origin HEAD:main
git -C "$main_checkout" pull -q --ff-only origin main
override_run="$delegate_root/override-run"
mkdir -p -m 700 "$override_run"
jq -cn --arg cwd "$(cd "$override_checkout" && pwd -P)" \
  '{schema:"qq-run-terminal",version:2,run_id:"override-run",agent:"implementer",exit_code:0,timed_out:false,cwd:$cwd}' \
  >"$override_run/TERMINAL"
run_change 0 retire override-ws --repo "$main_checkout" \
  --branch override-feature --checkout "$override_checkout" \
  --workspace-absent-owned --allow-unobserved-retire
jq -e '.state.delegate_run_dirs == 1' "$tmp/result.json" >/dev/null \
  || fail 'override retirement did not report the bound delegate run dir'
[ ! -e "$override_run" ] || fail 'override retirement left its bound run dir'
[ ! -e "$override_checkout" ] || fail 'override retirement left the checkout'
[ -d "$foreign_run" ] || fail 'override retirement removed a foreign run dir'

if grep -Eq -- '(^| )(--force|-D)( |$)' "$FAKE_HERDR_LOG"; then
  fail 'retirement used a forced removal flag'
fi

printf 'test-qq-change: pass\n'
