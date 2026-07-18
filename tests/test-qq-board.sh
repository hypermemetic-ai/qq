#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-board"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
BOARD="$ROOT/bin/qq-board"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

real_git="$(command -v git)"
repo="$tmp/repo"
"$real_git" init -q -b main "$repo"
"$real_git" -C "$repo" -c user.name=test -c user.email=test@example.com \
  commit --allow-empty -qm initial
mkdir -p "$repo/backlog/tasks"

make_task() {
  local number="$1"
  local status="$2"
  local slug="$3"

  {
    printf '%s\n' '---'
    printf 'id: T-%s\n' "$number"
    printf 'title: Fixture T-%s\n' "$number"
    printf 'status: %s\n' "$status"
    printf '%s\n' '---' '' "$slug"
  } >"$repo/backlog/tasks/t-$number - $slug.md"
}

read_status() {
  awk '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { exit }
    frontmatter && /^status:[[:space:]]*/ {
      sub(/^status:[[:space:]]*/, "")
      print
      exit
    }
  ' "$1"
}

set_status() {
  local path="$1"
  local status="$2"
  local temporary="$path.tmp"

  awk -v replacement="$status" '
    NR == 1 && $0 == "---" { frontmatter = 1 }
    frontmatter && /^status:[[:space:]]*/ {
      print "status: " replacement
      next
    }
    { print }
  ' "$path" >"$temporary"
  mv "$temporary" "$path"
}

make_task 1 'In Progress' no-branch
make_task 2 'To Do' active-worktree
make_task 3 'To Do' merged-pr
make_task 4 Done durable-done

t1_file="$repo/backlog/tasks/t-1 - no-branch.md"
t2_file="$repo/backlog/tasks/t-2 - active-worktree.md"
t3_file="$repo/backlog/tasks/t-3 - merged-pr.md"
t4_file="$repo/backlog/tasks/t-4 - durable-done.md"

"$real_git" -C "$repo" worktree add -qb feat/t-2-active \
  "$tmp/t2-worktree" main
"$real_git" -C "$repo" update-ref refs/remotes/origin/fix/t-3-merged \
  "$("$real_git" -C "$repo" rev-parse HEAD)"

fake_git="$tmp/git"
cat >"$fake_git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GIT_LOG"
exec "$REAL_GIT_BIN" "$@"
SH
chmod +x "$fake_git"
export QQ_GIT_BIN="$fake_git"
export REAL_GIT_BIN="$real_git"
export FAKE_GIT_LOG="$tmp/git.log"

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GH_LOG"
if [ "${1:-} ${2:-}" != 'pr list' ]; then
  exit 64
fi
jq -cn '[
  {headRefName:"feat/t-2-active",state:"OPEN",mergedAt:null},
  {
    headRefName:"fix/t-3-merged",
    state:"MERGED",
    mergedAt:"2026-07-18T00:00:00Z"
  }
]'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"
export FAKE_GH_LOG="$tmp/gh.log"

fake_backlog="$tmp/backlog"
cat >"$fake_backlog" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_BACKLOG_LOG"
if [ "${1:-}" = board ] && [ "$#" -eq 1 ]; then
  printf 'BOARD_RENDER\n'
  exit 0
fi
[ "${1:-} ${2:-}" = 'task edit' ] || exit 64
shift 2

status=""
task_id=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --status)
      [ "$#" -ge 2 ] || exit 64
      status="$2"
      shift 2
      ;;
    --plain)
      shift
      ;;
    T-[0-9]*)
      task_id="$1"
      shift
      ;;
    *) exit 64 ;;
  esac
done
[ -n "$status" ] && [ -n "$task_id" ] || exit 64

task_number="${task_id#T-}"
shopt -s nullglob
matches=("$PWD/backlog/tasks/t-$task_number"*.md)
shopt -u nullglob
[ "${#matches[@]}" -eq 1 ] || exit 65
task_file="${matches[0]}"
temporary="$task_file.tmp"
awk -v replacement="$status" '
  NR == 1 && $0 == "---" { frontmatter = 1 }
  frontmatter && /^status:[[:space:]]*/ {
    print "status: " replacement
    next
  }
  { print }
' "$task_file" >"$temporary"
mv "$temporary" "$task_file"
SH
chmod +x "$fake_backlog"
export QQ_BACKLOG_BIN="$fake_backlog"
export FAKE_BACKLOG_LOG="$tmp/backlog.log"

run_board() {
  local expected_exit="$1"
  shift

  set +e
  "$BOARD" "$@" >"$tmp/result.json"
  actual_exit=$?
  set -e
  assert_equal "$expected_exit" "$actual_exit" "unexpected qq-board exit"
  jq -e . "$tmp/result.json" >/dev/null
}

# One offline snapshot covers no branch, an active worktree, a merged PR, and
# durable stored Done. Only the three differing records are written.
run_board 0 reconcile --repo "$repo"
jq -e '
  .engine == "qq-board"
  and .action == "apply:reconcile"
  and .status == "done"
  and .state.pr_state_available == true
  and .state.task_count == 4
  and .state.changed_count == 3
  and (
    .state.tasks[]
    | select(.id == "T-1")
    | .derived_status == "To Do" and .changed and .written
  )
  and (
    .state.tasks[]
    | select(.id == "T-2")
    | .derived_status == "In Progress"
      and .branches == ["feat/t-2-active"]
      and .changed and .written
  )
  and (
    .state.tasks[]
    | select(.id == "T-3")
    | .derived_status == "Done"
      and .branches == ["fix/t-3-merged"]
      and .changed and .written
  )
  and (
    .state.tasks[]
    | select(.id == "T-4")
    | .stored_status == "Done"
      and .derived_status == "Done"
      and (.changed | not)
      and (.written | not)
  )
' "$tmp/result.json" >/dev/null
assert_equal 'To Do' "$(read_status "$t1_file")" \
  'task without a matching branch did not become To Do'
assert_equal 'In Progress' "$(read_status "$t2_file")" \
  'active worktree task did not become In Progress'
assert_equal Done "$(read_status "$t3_file")" \
  'merged pull-request task did not become Done'
assert_equal Done "$(read_status "$t4_file")" \
  'stored Done task was downgraded'
assert_equal 3 "$(wc -l <"$FAKE_BACKLOG_LOG")" \
  'reconcile wrote an unexpected number of Task records'
assert_file_contains "$FAKE_GIT_LOG" 'worktree list --porcelain'
assert_file_contains "$FAKE_GIT_LOG" \
  'for-each-ref --format=%(refname) refs/heads refs/remotes/origin'
assert_file_contains "$FAKE_GH_LOG" \
  'pr list --state all --limit 1000 --json headRefName,state,mergedAt'

# A second reconciliation re-derives the same statuses and writes nothing.
: >"$FAKE_BACKLOG_LOG"
run_board 0 reconcile --repo "$repo"
jq -e '
  .state.changed_count == 0
  and all(.state.tasks[]; (.changed | not) and (.written | not))
' "$tmp/result.json" >/dev/null
assert_equal 0 "$(wc -l <"$FAKE_BACKLOG_LOG")" \
  'idempotent reconciliation rewrote a Task record'

# Both dry-run spellings report a real change without invoking Backlog.
set_status "$t1_file" 'In Progress'
: >"$FAKE_BACKLOG_LOG"
run_board 0 reconcile --repo "$repo" --dry-run
jq -e '
  .state.dry_run == true
  and .state.changed_count == 1
  and (
    .state.tasks[]
    | select(.id == "T-1")
    | .stored_status == "In Progress"
      and .derived_status == "To Do"
      and .changed
      and (.written | not)
  )
' "$tmp/result.json" >/dev/null
assert_equal 'In Progress' "$(read_status "$t1_file")" \
  '--dry-run changed a Task record'
assert_equal 0 "$(wc -l <"$FAKE_BACKLOG_LOG")" \
  '--dry-run invoked Backlog'

run_board 0 inspect reconcile --repo "$repo"
jq -e '
  .action == "inspect:reconcile"
  and .state.dry_run == true
  and .state.changed_count == 1
  and any(.state.tasks[]; .id == "T-1" and .changed and (.written | not))
' "$tmp/result.json" >/dev/null
assert_equal 'In Progress' "$(read_status "$t1_file")" \
  'inspect changed a Task record'
assert_equal 0 "$(wc -l <"$FAKE_BACKLOG_LOG")" \
  'inspect invoked Backlog'

# An absent gh is a noted degradation, not a board failure. Git truth still
# drives active work to In Progress; no network-capable command is attempted.
set_status "$t3_file" 'To Do'
: >"$FAKE_BACKLOG_LOG"
export QQ_GH_BIN="$tmp/missing-gh"
run_board 0 reconcile --repo "$repo"
jq -e '
  .status == "done"
  and .state.pr_state_available == false
  and any(.state.notes[]; contains("PR state unavailable"))
  and (
    .state.tasks[]
    | select(.id == "T-3")
    | .stored_status == "To Do"
      and .derived_status == "In Progress"
      and .changed
      and .written
  )
' "$tmp/result.json" >/dev/null
assert_equal 'In Progress' "$(read_status "$t3_file")" \
  'gh absence prevented branch-only reconciliation'
assert_equal Done "$(read_status "$t4_file")" \
  'gh absence downgraded stored Done'

help_output="$("$BOARD" --help)"
assert_contains "$help_output" 'qq-board watch --interval 3' \
  'help omitted the Herdr pane command'

# The pane runner keeps reconciliation output quiet and exposes only the
# Backlog render on each watch tick.
fake_watch="$tmp/watch"
cat >"$fake_watch" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_WATCH_LOG"
[ "${1:-}" = --no-title ] || exit 64
[ "${2:-}" = --interval ] || exit 64
[ "${4:-}" = --exec ] || exit 64
shift 4
exec "$@"
SH
chmod +x "$fake_watch"
export QQ_WATCH_BIN="$fake_watch"
export FAKE_WATCH_LOG="$tmp/watch.log"
: >"$FAKE_BACKLOG_LOG"
watch_output="$("$BOARD" watch --repo "$repo" --interval 7)"
assert_equal BOARD_RENDER "$watch_output" \
  'pane runner mixed reconciliation output into the board render'
assert_file_contains "$FAKE_WATCH_LOG" '--no-title --interval 7 --exec'
assert_equal board "$(cat "$FAKE_BACKLOG_LOG")" \
  'pane runner did not finish its tick with a clean Backlog render'

printf 'test-qq-board: pass\n'
