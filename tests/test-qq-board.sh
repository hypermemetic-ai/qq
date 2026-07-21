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
a_worktree="$tmp/a-worktree"
z_worktree="$tmp/z-worktree"
i_worktree="$tmp/i-worktree"
"$real_git" init -q -b main "$repo"
mkdir -p "$repo/backlog/tasks"
cat >"$repo/backlog/config.yml" <<'YAML'
project_name: "fixture"
default_status: "To Do"
statuses: ["To Do", "In Progress", "Done"]
task_prefix: "t"
YAML
"$real_git" -C "$repo" add backlog/config.yml
"$real_git" -C "$repo" -c user.name=test -c user.email=test@example.com \
  commit -qm initial

# Branch two linked worktrees before primary receives records so their task
# directories contain only records born or deliberately overlaid there.
"$real_git" -C "$repo" worktree add -qb feat/t-1-born "$a_worktree" main
"$real_git" -C "$repo" worktree add -qb fix/t-5-other "$z_worktree" main

make_task() {
  local root="$1"
  local number="$2"
  local status="$3"
  local slug="$4"
  local marker="$5"
  local task_file="$root/backlog/tasks/t-$number - $slug.md"

  mkdir -p "$root/backlog/tasks"
  {
    printf '%s\n' '---'
    printf 'id: T-%s\n' "$number"
    printf 'title: Fixture T-%s\n' "$number"
    printf 'status: %s\n' "$status"
    printf '%s\n' '---' '' "$marker"
  } >"$task_file"
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

make_task "$repo" 1 'To Do' primary-copy 'marker: primary T-1'
make_task "$repo" 2 'To Do' merged-primary 'marker: primary T-2'
make_task "$repo" 4 Done durable-done 'marker: primary T-4'
"$real_git" -C "$repo" add backlog/tasks
"$real_git" -C "$repo" -c user.name=test -c user.email=test@example.com \
  commit -qm 'primary records'

# Branch a third worktree after primary's records: its byte-identical
# inherited copies must never overlay primary or a divergent in-flight edit,
# and never count as collisions.
"$real_git" -C "$repo" worktree add -qb feat/t-9-inherited "$i_worktree" main

make_task "$a_worktree" 1 'To Do' worktree-copy 'marker: worktree T-1 overlay'
make_task "$a_worktree" 3 'In Progress' born-here 'marker: born only in worktree'
make_task "$a_worktree" 5 'To Do' collision-a 'marker: earlier linked copy'
make_task "$z_worktree" 5 'To Do' collision-z 'marker: later linked copy wins'

"$real_git" -C "$repo" update-ref refs/remotes/origin/fix/t-2-merged \
  "$("$real_git" -C "$repo" rev-parse HEAD)"

source_digest() {
  local root
  {
    for root in "$repo" "$a_worktree" "$z_worktree" "$i_worktree"; do
      find "$root/backlog/tasks" -maxdepth 1 -type f -name '*.md' \
        -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum
    done
  } | sha256sum | awk '{print $1}'
}

primary_digest() {
  find "$repo/backlog" -type f -print0 | sort -z \
    | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

sources_before="$(source_digest)"
primary_before="$(primary_digest)"

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
[ "${1:-} ${2:-}" = 'pr list' ] || exit 64
jq -cn '[
  {headRefName:"feat/t-1-born",state:"OPEN",mergedAt:null},
  {
    headRefName:"fix/t-2-merged",
    state:"MERGED",
    mergedAt:"2026-07-18T00:00:00Z"
  },
  {headRefName:"fix/t-5-other",state:"OPEN",mergedAt:null},
  {headRefName:"feat/t-9-inherited",state:"OPEN",mergedAt:null}
]'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"
export FAKE_GH_LOG="$tmp/gh.log"

fake_backlog="$tmp/backlog"
cat >"$fake_backlog" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "$PWD" "$*" >>"$FAKE_BACKLOG_LOG"
if [ "${1:-}" = board ] && [ "$#" -eq 1 ]; then
  printf 'BOARD_RENDER\n'
  exit 0
fi
exit 64
SH
chmod +x "$fake_backlog"
export QQ_BACKLOG_BIN="$fake_backlog"
export FAKE_BACKLOG_LOG="$tmp/backlog.log"
: >"$FAKE_BACKLOG_LOG"

export XDG_CACHE_HOME="$tmp/cache"

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

# The one-shot read model contains primary records plus records born in a
# linked worktree. Only content-divergent copies overlay: an inherited
# byte-identical copy is skipped silently, a divergent linked copy overlays
# primary without warning, and only two divergent linked copies collide.
run_board 0 reconcile --repo "$repo"
jq -e --arg repo "$repo" --arg a "$a_worktree" --arg z "$z_worktree" '
  .engine == "qq-board"
  and .action == "apply:reconcile"
  and .status == "done"
  and .state.repo_root == $repo
  and .state.materialized == true
  and .state.dry_run == false
  and .state.pr_state_available == true
  and .state.worktree_count == 4
  and .state.task_count == 5
  and .state.changed_count == 4
  and .state.collision_count == 1
  and .state.collisions == [{
    id:"T-5",
    previous_source:$a,
    overriding_source:$z
  }]
  and any(.state.notes[]; contains("Divergent cross-worktree Task copies for T-5"))
  and ([.state.notes[] | select(contains("Skipped disposing"))] | length == 0)
  and (
    .state.tasks[]
    | select(.id == "T-1")
    | .source_worktree == $a
      and .stored_status == "To Do"
      and .derived_status == "In Progress"
      and .branches == ["feat/t-1-born"]
      and .changed and .materialized
  )
  and (
    .state.tasks[]
    | select(.id == "T-2")
    | .source_worktree == $repo
      and .derived_status == "Done"
      and .branches == ["fix/t-2-merged"]
      and .changed
  )
  and (
    .state.tasks[]
    | select(.id == "T-3")
    | .source_worktree == $a
      and .stored_status == "In Progress"
      and .derived_status == "To Do"
      and .changed
  )
  and (
    .state.tasks[]
    | select(.id == "T-5")
    | .source_worktree == $z
      and .derived_status == "In Progress"
      and .branches == ["fix/t-5-other"]
  )
' "$tmp/result.json" >/dev/null

scratch_root="$(jq -r '.state.scratch_root' "$tmp/result.json")"
case "$scratch_root" in
  "$XDG_CACHE_HOME"/qq/board/*) ;;
  *) fail "scratch tree escaped XDG cache: $scratch_root" ;;
esac
[ -L "$scratch_root" ] || fail 'scratch root is not a publishable symlink'
generation_one="$(readlink "$scratch_root")"
case "$generation_one" in
  "$XDG_CACHE_HOME"/qq/board/.*) ;;
  *) fail "generation escaped the scratch parent: $generation_one" ;;
esac
[ -d "$generation_one/backlog/tasks" ] \
  || fail 'symlink does not resolve to a complete generation'
[ -d "$scratch_root/backlog/tasks" ] || fail 'reconcile omitted scratch tasks'
cmp "$repo/backlog/config.yml" "$scratch_root/backlog/config.yml" \
  || fail 'scratch config differs from primary config'
assert_equal 5 \
  "$(find "$scratch_root/backlog/tasks" -maxdepth 1 -type f -name '*.md' | wc -l)" \
  'scratch tree has the wrong aggregate size'

scratch_t1="$scratch_root/backlog/tasks/t-1 - worktree-copy.md"
scratch_t2="$scratch_root/backlog/tasks/t-2 - merged-primary.md"
scratch_t3="$scratch_root/backlog/tasks/t-3 - born-here.md"
scratch_t4="$scratch_root/backlog/tasks/t-4 - durable-done.md"
scratch_t5="$scratch_root/backlog/tasks/t-5 - collision-z.md"
[ -f "$scratch_t1" ] || fail 'worktree overlay is absent from scratch'
[ ! -e "$scratch_root/backlog/tasks/t-1 - primary-copy.md" ] \
  || fail 'primary copy survived a worktree overlay'
[ -f "$scratch_t3" ] || fail 'worktree-born record is absent from scratch'
[ -f "$scratch_t5" ] || fail 'later cross-worktree copy did not win'
assert_file_contains "$scratch_t1" 'marker: worktree T-1 overlay'
assert_file_contains "$scratch_t3" 'marker: born only in worktree'
assert_file_contains "$scratch_t5" 'marker: later linked copy wins'
assert_equal 'In Progress' "$(read_status "$scratch_t1")" \
  'scratch T-1 omitted branch-derived status'
assert_equal Done "$(read_status "$scratch_t2")" \
  'scratch T-2 omitted PR-derived status'
assert_equal 'To Do' "$(read_status "$scratch_t3")" \
  'scratch T-3 retained stale source status'
assert_equal Done "$(read_status "$scratch_t4")" \
  'scratch materialization downgraded durable Done'
assert_equal 'In Progress' "$(read_status "$scratch_t5")" \
  'scratch T-5 omitted later worktree branch truth'

assert_equal "$sources_before" "$(source_digest)" \
  'reconcile changed a source Task record'
assert_equal "$primary_before" "$(primary_digest)" \
  'reconcile changed a primary file'
assert_equal 0 "$(wc -l <"$FAKE_BACKLOG_LOG")" \
  'reconcile invoked Backlog against source or scratch records'
assert_file_contains "$FAKE_GIT_LOG" 'worktree list --porcelain'
assert_file_contains "$FAKE_GIT_LOG" \
  'for-each-ref --format=%(refname) refs/heads refs/remotes/origin'
assert_file_contains "$FAKE_GH_LOG" \
  'pr list --state all --limit 1000 --json headRefName,state,mergedAt'

# Both report-only spellings leave an existing scratch generation untouched.
touch "$scratch_root/report-only-sentinel"
run_board 0 reconcile --repo "$repo" --dry-run
jq -e '
  .state.dry_run == true
  and .state.materialized == false
  and all(.state.tasks[]; .materialized == false)
' "$tmp/result.json" >/dev/null
[ -f "$scratch_root/report-only-sentinel" ] \
  || fail '--dry-run replaced the scratch generation'

run_board 0 inspect reconcile --repo "$a_worktree"
jq -e --arg scratch "$scratch_root" '
  .action == "inspect:reconcile"
  and .state.repo_root != ""
  and .state.scratch_root == $scratch
  and .state.dry_run == true
  and .state.materialized == false
' "$tmp/result.json" >/dev/null
[ -f "$scratch_root/report-only-sentinel" ] \
  || fail 'inspect replaced the scratch generation'

[ -f "$scratch_root/.signature" ] \
  || fail 'published generation carries no signature'

# An unchanged aggregate is not republished and creates no churn: same
# generation, sentinel persists, trash stays empty.
run_board 0 reconcile --repo "$a_worktree"
assert_equal "$scratch_root" "$(jq -r '.state.scratch_root' "$tmp/result.json")" \
  'linked invocation selected a different scratch tree'
jq -e '
  .status == "done"
  and any(.state.notes[]; contains("Board unchanged; kept the current generation."))
' "$tmp/result.json" >/dev/null
[ -L "$scratch_root" ] || fail 'apply replaced the publish symlink'
[ "$(readlink "$scratch_root")" = "$generation_one" ] \
  || fail 'unchanged board was republished'
[ -f "$scratch_root/report-only-sentinel" ] \
  || fail 'unchanged board lost its generation'
if [ -d "$XDG_CACHE_HOME/qq/board/.trash" ]; then
  [ "$(find "$XDG_CACHE_HOME/qq/board/.trash" -mindepth 1 -maxdepth 1 | wc -l)" -eq 0 ] \
    || fail 'unchanged board churned the trash'
fi
assert_equal "$sources_before" "$(source_digest)" \
  'second materialization changed a source Task record'
assert_equal "$primary_before" "$(primary_digest)" \
  'second materialization changed a primary file'

# Main advances after a linked worktree inherited clean snapshots: the
# stale snapshot differs from primary but never participated in its Change,
# so it must not overlay the advanced primary or count as a collision.
make_task "$repo" 4 Done durable-done 'marker: primary T-4 advanced'
"$real_git" -C "$repo" add backlog/tasks
"$real_git" -C "$repo" -c user.name=test -c user.email=test@example.com \
  commit -qm 'advance t-4'
sources_before="$(source_digest)"
primary_before="$(primary_digest)"
run_board 0 reconcile --repo "$repo"
jq -e --arg repo "$repo" '
  .state.collision_count == 1
  and ([.state.collisions[].id] == ["T-5"])
  and ([.state.notes[] | select(contains("for T-4"))] | length == 0)
  and (.state.tasks[] | select(.id == "T-4") | .source_worktree == $repo)
' "$tmp/result.json" >/dev/null
assert_file_contains "$scratch_root/backlog/tasks/t-4 - durable-done.md" \
  'marker: primary T-4 advanced'
generation_two="$(readlink "$scratch_root")"
[ "$generation_two" != "$generation_one" ] \
  || fail 'changed board kept a stale generation'
[ ! -e "$generation_one" ] || fail 'previous generation was not disposed'
[ "$(find "$XDG_CACHE_HOME/qq/board/.trash" -mindepth 1 -maxdepth 1 -type d | wc -l)" -ge 1 ] \
  || fail 'disposed generation is absent from the trash'

# A malformed prior publish target is canonicalized before reaping, never
# followed outside the cache.
rm -f "$scratch_root"
ln -s "$XDG_CACHE_HOME/qq/board/../../../repo" "$scratch_root"
run_board 0 reconcile --repo "$repo"
jq -e '
  .status == "done"
  and any(.state.notes[]; contains("Refused to dispose of an ineligible scratch target"))
' "$tmp/result.json" >/dev/null
[ -d "$repo/backlog/tasks" ] || fail 'disposal escaped into the fixture repo'
[ -L "$scratch_root" ] || fail 'publish did not replace the malformed link'
[ -d "$scratch_root/backlog/tasks" ] || fail 'malformed-link run left no board'

# A same-cache target outside this Repository's generations is never reaped.
victim="$XDG_CACHE_HOME/qq/board/.victim"
mkdir -p "$victim/backlog/tasks"
touch "$victim/backlog/tasks/sentinel"
rm -f "$scratch_root"
ln -s "$victim" "$scratch_root"
run_board 0 reconcile --repo "$repo"
[ -f "$victim/backlog/tasks/sentinel" ] \
  || fail 'disposal deleted a same-cache foreign target'
jq -e '
  .status == "done"
  and any(.state.notes[]; contains("Refused to dispose of an ineligible scratch target"))
' "$tmp/result.json" >/dev/null
[ -L "$scratch_root" ] && [ -d "$scratch_root/backlog/tasks" ] \
  || fail 'foreign-target run left no board'
rm -rf "$victim"

# A byte-identical foreign target is never trusted: its missing signature
# forces a fresh publication and the disposal refusal names it.
foreign="$XDG_CACHE_HOME/qq/board/.foreign"
mkdir -p "$foreign"
cp -r "$scratch_root/backlog" "$foreign/"
rm -f "$scratch_root"
ln -s "$foreign" "$scratch_root"
run_board 0 reconcile --repo "$repo"
jq -e '
  .status == "done"
  and ([.state.notes[] | select(contains("Board unchanged"))] | length == 0)
  and any(.state.notes[]; contains("Refused to dispose of an ineligible scratch target"))
' "$tmp/result.json" >/dev/null
case "$(readlink "$scratch_root")" in
  "$XDG_CACHE_HOME"/qq/board/.*.gen.*) ;;
  *) fail 'foreign identical target was kept as the board' ;;
esac
[ -d "$foreign/backlog" ] || fail 'foreign identical target was disposed'
rm -rf "$foreign"

# A failed participation read degrades loudly: the note names the worktree
# and every record there participates, so truth is never silently hidden.
fake_git_fail="$tmp/git-fail"
cat >"$fake_git_fail" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GIT_LOG"
[ "${1:-}" = status ] && exit 64
[ "${1:-}" = -C ] && [ "${3:-}" = status ] && exit 64
exec "$REAL_GIT_BIN" "$@"
SH
chmod +x "$fake_git_fail"
export QQ_GIT_BIN="$fake_git_fail"
run_board 0 reconcile --repo "$repo"
jq -e '
  .status == "done"
  and .state.task_count == 5
  and any(.state.notes[]; contains("Cannot read uncommitted Task changes"))
' "$tmp/result.json" >/dev/null
export QQ_GIT_BIN="$fake_git"

# An absent gh is a noted degradation, not an aggregation failure, and inspect
# still leaves the materialized cache untouched.
touch "$scratch_root/gh-degradation-sentinel"
export QQ_GH_BIN="$tmp/missing-gh"
run_board 0 inspect reconcile --repo "$repo"
jq -e '
  .status == "done"
  and .state.pr_state_available == false
  and any(.state.notes[]; contains("PR state unavailable"))
' "$tmp/result.json" >/dev/null
[ -f "$scratch_root/gh-degradation-sentinel" ] \
  || fail 'degraded inspect replaced the scratch generation'
export QQ_GH_BIN="$fake_gh"

help_output="$("$BOARD" --help)"
assert_contains "$help_output" 'qq-board watch --interval 3' \
  'help omitted the Herdr pane command'
assert_contains "$help_output" 'Source records are never written' \
  'help omitted the source-record boundary'

# Reconcile never accepts --interval, including its default value.
run_board 1 reconcile --repo "$repo" --interval 3
jq -e '
  .status == "error"
  and .message == "--interval applies only to watch"
' "$tmp/result.json" >/dev/null
run_board 1 inspect reconcile --repo "$repo" --interval 3
jq -e '
  .status == "error"
  and .message == "--interval applies only to watch"
' "$tmp/result.json" >/dev/null

# Runtime state is refused when cache configuration would place it in a
# checkout, even for a report-only invocation.
export XDG_CACHE_HOME="$repo/.cache"
run_board 1 inspect reconcile --repo "$repo"
jq -e '
  .status == "error"
  and (.message | contains("outside every Repository checkout"))
' "$tmp/result.json" >/dev/null
export XDG_CACHE_HOME="$tmp/cache"

# The same refusal fires when a cache ancestor is a symlink into a checkout.
mkdir -p "$tmp/linkcache"
ln -s "$repo" "$tmp/linkcache/qq"
export XDG_CACHE_HOME="$tmp/linkcache"
run_board 1 inspect reconcile --repo "$repo"
jq -e '
  .status == "error"
  and (.message | contains("outside every Repository checkout"))
' "$tmp/result.json" >/dev/null
export XDG_CACHE_HOME="$tmp/cache"

# The pane runner rematerializes first, then executes the vendor CLI with the
# scratch tree as its current directory.
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
watch_output="$("$BOARD" watch --repo "$a_worktree" --interval 7)"
assert_equal BOARD_RENDER "$watch_output" \
  'watch mixed reconciliation output into the vendor render'
assert_file_contains "$FAKE_WATCH_LOG" '--no-title --interval 7 --exec'
assert_equal "$scratch_root|board" "$(cat "$FAKE_BACKLOG_LOG")" \
  'watch did not run the vendor board from the scratch tree'
assert_equal "$sources_before" "$(source_digest)" \
  'watch changed a source Task record'
assert_equal "$primary_before" "$(primary_digest)" \
  'watch changed a primary file'

printf 'test-qq-board: pass\n'
