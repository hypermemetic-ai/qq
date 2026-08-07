#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-lifecycle-contract"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
BACKLOG="$(command -v backlog || true)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

make_store() {
  local root="$1" project="$2" default_status="$3" statuses="$4"
  mkdir -p "$root/backlog"
  cat >"$root/backlog/config.yml" <<YAML
project_name: "$project"
default_status: "$default_status"
statuses: [$statuses]
labels: []
date_format: yyyy-mm-dd
max_column_width: 20
auto_open_browser: false
default_port: 6420
remote_operations: false
auto_commit: false
filesystem_only: true
bypass_git_hooks: false
check_active_branches: false
active_branch_days: 30
task_prefix: "t"
YAML
}

run_backlog() {
  local root="$1"; shift
  (cd "$root" && "$BACKLOG" "$@" >/dev/null)
}

assert_task_status() {
  local root="$1" collection="$2" task_id="$3" expected="$4" file
  file="$(find "$root/backlog/$collection" -maxdepth 1 -type f -name "t-${task_id#T-} - *.md" -print -quit)"
  [ -n "$file" ] || fail "$task_id is absent from $collection"
  assert_file_contains "$file" "status: $expected"
}

if [ -n "$BACKLOG" ]; then
old="$TMP/old"
make_store "$old" old 'To Do' '"To Do", "In Progress", "Done"'
run_backlog "$old" task create 'Old lifecycle completion' --no-dod-defaults --plain
assert_task_status "$old" tasks T-1 'To Do'
# In the old store, To Do is the explicit compatibility bridge for aligned/start.
run_backlog "$old" task edit T-1 --status 'In Progress' --plain
assert_task_status "$old" tasks T-1 'In Progress'
run_backlog "$old" task edit T-1 --status 'To Do' --plain
assert_task_status "$old" tasks T-1 'To Do'
run_backlog "$old" task edit T-1 --status 'In Progress' --plain
run_backlog "$old" task edit T-1 --status Done --plain
run_backlog "$old" task complete T-1
[ ! -e "$old/backlog/tasks/t-1 - Old-lifecycle-completion.md" ] || fail 'old completion remained active'
assert_task_status "$old" completed T-1 Done
run_backlog "$old" task create 'Old lifecycle archive' --no-dod-defaults --plain
run_backlog "$old" task archive T-2
[ ! -e "$old/backlog/tasks/t-2 - Old-lifecycle-archive.md" ] || fail 'old archive remained active'
assert_task_status "$old" archive/tasks T-2 'To Do'

target="$TMP/target"
make_store "$target" target Unaligned '"Unaligned", "Aligned", "Active"'
run_backlog "$target" task create 'Target lifecycle completion' --no-dod-defaults --plain
assert_task_status "$target" tasks T-1 Unaligned
run_backlog "$target" task edit T-1 --status Aligned --plain
assert_task_status "$target" tasks T-1 Aligned
run_backlog "$target" task edit T-1 --status Active --plain
assert_task_status "$target" tasks T-1 Active
run_backlog "$target" task edit T-1 --status Unaligned --plain
assert_task_status "$target" tasks T-1 Unaligned
run_backlog "$target" task edit T-1 --status Aligned --plain
run_backlog "$target" task edit T-1 --status Active --plain
run_backlog "$target" task complete T-1
[ ! -e "$target/backlog/tasks/t-1 - Target-lifecycle-completion.md" ] || fail 'target completion remained active'
assert_task_status "$target" completed T-1 Active
run_backlog "$target" task create 'Target lifecycle archive' --no-dod-defaults --plain
run_backlog "$target" task edit T-2 --status Aligned --plain
run_backlog "$target" task archive T-2
[ ! -e "$target/backlog/tasks/t-2 - Target-lifecycle-archive.md" ] || fail 'target archive remained active'
assert_task_status "$target" archive/tasks T-2 Aligned
else
  printf 'test-lifecycle-contract: Backlog CLI unavailable; live compatibility probe skipped\n'
fi

python3 - "$ROOT/CONCEPTS.md" "$ROOT/delegation/manifests/agents/change_owner.md" "$ROOT/README.md" <<'PY'
from pathlib import Path
import sys

concepts = Path(sys.argv[1]).read_text(encoding="utf-8")
prompt = Path(sys.argv[2]).read_text(encoding="utf-8")
prompt_flat = " ".join(prompt.split())
readme = Path(sys.argv[3]).read_text(encoding="utf-8")
readme_flat = " ".join(readme.split())

for phrase in (
    "Default-deny; execution unauthorized.",
    "Sole execution authorization.",
    "Requires one exact accountable Change Owner.",
    "Completion/archive remove a Task from the active collection",
    "`To Do`/`In Progress`/`Done` are migration compatibility",
    "not independent pickup authority. Unknowns fail closed.",
):
    assert phrase in concepts, phrase

for phrase in (
    "exactly one admitted Change",
    "decision ledger to cite the disposition for every consequential decision",
    "independently verify every envelope claim",
    "Run behavior and outcome Checks that observe the intended subject",
    "fresh-context review for every non-trivial Change",
    "review each fix delta",
    "Map every acceptance criterion to fresh evidence",
    "Conduct operator-only input and proportionate UAT directly with the operator",
    "stop mutation and explicitly return realignment to the Architect",
    "open one pull request",
    "Never merge; the operator's merge is the gate",
    "After verified merge, run the landing rail",
    "complete the Task through the Backlog CLI",
    "finalize the guided Observer package",
    "retire through the engine",
    "five accountable gates: intent alignment, plan approval, review verdict, acceptance, and operator merge",
):
    assert phrase in prompt_flat, phrase
assert "mark its Task Done" not in prompt
assert "activation is performed separately after the Change lands" not in readme
assert "verify it in fresh linked and unlinked Pi sessions after merge" in readme_flat
PY

printf 'test-lifecycle-contract: pass\n'
