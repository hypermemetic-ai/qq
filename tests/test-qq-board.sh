#!/usr/bin/env bash
# shellcheck disable=SC1091
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME=test-qq-board
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"; BOARD="$ROOT/bin/qq-board"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
real_git="$(command -v git)"; repo="$tmp/repo"; linked="$tmp/linked"

make_task() {
  local root="$1" number="$2" status="$3" marker="$4"
  mkdir -p "$root/backlog/tasks"
  cat >"$root/backlog/tasks/t-$number - fixture-$number.md" <<TASK
---
id: T-$number
title: Fixture $number
status: $status
---

marker: $marker
TASK
}
"$real_git" init -q -b main "$repo"
mkdir -p "$repo/backlog/tasks"
cat >"$repo/backlog/config.yml" <<'YAML'
project_name: fixture
default_status: To Do
statuses: [To Do, In Progress, Done]
task_prefix: t
YAML
make_task "$repo" 1 'To Do' 'primary wins'
make_task "$repo" 2 Done 'stored done'
"$real_git" -C "$repo" add backlog
"$real_git" -C "$repo" -c user.name=test -c user.email=test@example.com commit -qm records
"$real_git" -C "$repo" worktree add -qb feat/t-1-open "$linked" main >/dev/null
make_task "$linked" 1 'In Progress' 'linked must be ignored'

mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'SH'
#!/usr/bin/env bash
touch "$GH_WAS_CALLED"
exit 97
SH
cat >"$tmp/bin/git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GIT_LOG"
case "$*" in
  *for-each-ref* | *merge-base* | *refs/remotes/origin* | *' origin '*)
    touch "$FORBIDDEN_GIT_READ"; exit 98 ;;
esac
if [ "${INJECT_SECOND_MAIN:-false}" = true ] && [[ "$*" == *'worktree list --porcelain'* ]]; then
  "$REAL_GIT_BIN" "$@"
  printf '\nworktree %s\nHEAD %s\nbranch refs/heads/main\n' \
    "$SECOND_MAIN" "$("$REAL_GIT_BIN" -C "$SECOND_MAIN" rev-parse HEAD)"
  exit 0
fi
exec "$REAL_GIT_BIN" "$@"
SH
chmod +x "$tmp/bin/gh" "$tmp/bin/git"
export PATH="$tmp/bin:$PATH" GH_WAS_CALLED="$tmp/gh-called"
export QQ_GIT_BIN="$tmp/bin/git" REAL_GIT_BIN="$real_git"
export FAKE_GIT_LOG="$tmp/git.log" FORBIDDEN_GIT_READ="$tmp/forbidden-git"
export XDG_CACHE_HOME="$tmp/cache"

run_board() {
  local expected="$1"; shift
  set +e; "$BOARD" "$@" >"$tmp/result.json"; actual=$?; set -e
  assert_equal "$expected" "$actual" "unexpected exit from qq-board $*"
  jq -e . "$tmp/result.json" >/dev/null
}
repo="$(cd "$repo" && pwd -P)"; key="$(printf %s "$repo" | sha256sum | awk '{print $1}')"
board_parent="$XDG_CACHE_HOME/qq/board"; scratch="$board_parent/$key"
mkdir -p "$scratch/backlog/tasks"; touch "$scratch/backlog/tasks/stale"

# Store records are the only input. Stored statuses win even when an open Task
# branch and a divergent linked-worktree copy exist; neither Git refs nor gh
# participate. The stale pre-symlink directory is moved to reaper-compatible trash.
run_board 0 reconcile --repo "$linked"
jq -e --arg repo "$repo" --arg scratch "$scratch" '
  .engine == "qq-board" and .action == "apply:reconcile" and .status == "done"
  and (.state | keys | sort) == ["config_source","dry_run","materialized","notes","repo_root","scratch_root","task_count","tasks"]
  and .state.repo_root == $repo and .state.scratch_root == $scratch
  and .state.materialized and (.state.dry_run | not) and .state.task_count == 2
  and ([.state.tasks[] | {id,status}] | sort_by(.id)) == [
    {id:"T-1",status:"To Do"},{id:"T-2",status:"Done"}]
  and all(.state.tasks[];
    (. | keys | sort) == ["filename","id","materialized","status"] and .materialized)
' "$tmp/result.json" >/dev/null
[ -L "$scratch" ] || fail 'scratch root is not a symlink'
generation_one="$(readlink "$scratch")"; [ -d "$generation_one/backlog/tasks" ] || fail 'publish target is incomplete'
cmp "$repo/backlog/config.yml" "$scratch/backlog/config.yml" || fail 'config copy changed'
cmp "$repo/backlog/tasks/t-1 - fixture-1.md" "$scratch/backlog/tasks/t-1 - fixture-1.md" || fail 'Task copy changed'
cmp "$repo/backlog/tasks/t-2 - fixture-2.md" "$scratch/backlog/tasks/t-2 - fixture-2.md" || fail 'Task copy changed'
assert_file_contains "$scratch/backlog/tasks/t-1 - fixture-1.md" 'marker: primary wins'
assert_equal 2 "$(find "$scratch/backlog/tasks" -maxdepth 1 -type f -name '*.md' | wc -l)" 'linked Task data was aggregated'
[ -f "$generation_one/.signature" ] || fail 'generation has no signature'
[ ! -e "$GH_WAS_CALLED" ] || fail 'qq-board invoked gh'
[ ! -e "$FORBIDDEN_GIT_READ" ] || fail 'qq-board read status refs'
assert_equal 1 "$(find "$board_parent" -mindepth 1 -maxdepth 1 -type d -name ".$key.gen.*" | wc -l)" 'initial publish created multiple generations'
find "$board_parent/.trash" -mindepth 1 -maxdepth 1 -type d -name "$key.*.*" | grep -q . || fail 'stale directory did not reach board trash'

# Matching signatures suppress churn. Inspect reports the same unchanged board
# without claiming materialization or changing the generation.
run_board 0 reconcile --repo "$repo"
assert_equal "$generation_one" "$(readlink "$scratch")" 'unchanged reconcile republished'
jq -e 'any(.state.notes[]; contains("Board unchanged"))' "$tmp/result.json" >/dev/null
run_board 0 inspect reconcile --repo "$linked"
jq -e '.state.dry_run and (.state.materialized | not)
  and all(.state.tasks[]; (.materialized | not))
  and any(.state.notes[]; contains("Board unchanged"))' "$tmp/result.json" >/dev/null
assert_equal "$generation_one" "$(readlink "$scratch")" 'inspect republished'

# A changed store record republishes verbatim and moves the old generation to
# trash while keeping exactly one live generation.
make_task "$repo" 1 'In Progress' 'primary changed'
run_board 0 reconcile --repo "$repo"
generation_two="$(readlink "$scratch")"
[ "$generation_two" != "$generation_one" ] || fail 'changed record did not republish'
[ ! -e "$generation_one" ] || fail 'old generation remained live'
cmp "$repo/backlog/tasks/t-1 - fixture-1.md" "$scratch/backlog/tasks/t-1 - fixture-1.md" || fail 'changed record was rewritten'
assert_equal 1 "$(find "$board_parent" -mindepth 1 -maxdepth 1 -type d -name ".$key.gen.*" | wc -l)" 'changed publish left multiple generations'
[ "$(find "$board_parent/.trash" -mindepth 1 -maxdepth 1 -type d | wc -l)" -ge 2 ] || fail 'old generation is absent from trash'

# Data rails retain their data-error exit, and a second main attachment is a
# refusal rather than an arbitrary primary choice.
cp "$repo/backlog/tasks/t-1 - fixture-1.md" "$tmp/task-good"
sed -i 's/^id: T-1$/id: T-9/' "$repo/backlog/tasks/t-1 - fixture-1.md"
run_board 65 reconcile --repo "$repo"
jq -e '.status == "refused" and .message == "Task filename and frontmatter id disagree."' "$tmp/result.json" >/dev/null
cp "$tmp/task-good" "$repo/backlog/tasks/t-1 - fixture-1.md"
sed -i 's/^status: In Progress$/status: Blocked/' "$repo/backlog/tasks/t-1 - fixture-1.md"
run_board 65 reconcile --repo "$repo"
jq -e '.status == "refused" and .message == "Task record has an unsupported stored status."' "$tmp/result.json" >/dev/null
cp "$tmp/task-good" "$repo/backlog/tasks/t-1 - fixture-1.md"
export INJECT_SECOND_MAIN=true SECOND_MAIN="$repo"
run_board 1 inspect reconcile --repo "$repo"
jq -e '.status == "error" and .state.primary_main_count == 2' "$tmp/result.json" >/dev/null
unset INJECT_SECOND_MAIN

# An owned-looking disposal target that intersects a checkout is retained.
rm "$scratch"
guard="$board_parent/.$key.gen.GuArD1"
"$real_git" -C "$repo" worktree add -qb guard/board-disposal "$guard" main >/dev/null
ln -s "$guard" "$scratch"
run_board 0 reconcile --repo "$repo"
[ -d "$guard/.git" ] || [ -f "$guard/.git" ] || fail 'guard checkout was disposed'
jq -e 'any(.state.notes[]; contains("Refused to dispose of an ineligible scratch target"))' "$tmp/result.json" >/dev/null
if [ ! -L "$scratch" ] || [ "$(readlink "$scratch")" = "$guard" ]; then
  fail 'guard refusal prevented publication'
fi

# Keep watch parsing strict without running an endless renderer.
run_board 1 watch --repo "$repo" --interval 0
jq -e '.message | contains("positive integer")' "$tmp/result.json" >/dev/null
run_board 1 inspect watch --repo "$repo"
jq -e '.message == "inspect applies only to reconcile"' "$tmp/result.json" >/dev/null
run_board 1 watch --repo "$repo" --dry-run
jq -e '.message == "--dry-run applies only to reconcile"' "$tmp/result.json" >/dev/null
run_board 1 reconcile --repo "$repo" --interval 3
jq -e '.message == "--interval applies only to watch"' "$tmp/result.json" >/dev/null

help_output="$("$BOARD" --help)"
assert_contains "$help_output" "store's Task records" 'help omits single-home store'
assert_contains "$help_output" 'without aggregation' 'help still describes aggregation'
[ ! -e "$GH_WAS_CALLED" ] || fail 'qq-board resolved or invoked gh'
[ ! -e "$FORBIDDEN_GIT_READ" ] || fail 'qq-board performed a forbidden Git read'
printf 'test-qq-board: pass\n'
