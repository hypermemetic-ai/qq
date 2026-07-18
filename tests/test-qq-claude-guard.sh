#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-claude-backlog-hook"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
HOOK="$ROOT/bin/qq-claude-backlog-hook"
SETTINGS="$ROOT/.claude/settings.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$HOOK" ] || fail 'Claude Code Backlog hook is not executable'

path_payload() {
  jq -cn --arg tool "$1" --arg key "$2" --arg path "$3" --arg cwd "$ROOT" \
    '{cwd:$cwd,tool_name:$tool,tool_input:{($key):$path}}'
}

assert_result() {
  local expected="$1"
  local payload="$2"
  local message="$3"
  local status=0

  : >"$TMP/out"
  : >"$TMP/err"
  printf '%s\n' "$payload" | "$HOOK" >"$TMP/out" 2>"$TMP/err" || status=$?
  assert_equal "$expected" "$status" "$message: wrong exit status"
  assert_equal '' "$(<"$TMP/out")" "$message: hook wrote to stdout"
  if [ "$expected" -eq 2 ]; then
    assert_equal 1 "$(wc -l <"$TMP/err")" "$message: feedback was not one line"
    assert_contains "$(<"$TMP/err")" \
      'managed Backlog markdown must be edited through the backlog CLI' \
      "$message: wrong feedback"
  else
    assert_equal '' "$(<"$TMP/err")" "$message: hook wrote to stderr"
  fi
}

assert_result 2 "$(path_payload Edit file_path backlog/tasks/t-82.md)" \
  'relative Edit under backlog'
assert_result 2 "$(path_payload Write file_path "$ROOT/backlog/docs/note.txt")" \
  'absolute Write under backlog'
assert_result 2 "$(path_payload MultiEdit file_path docs/../backlog/tasks/t-82.md)" \
  'normalized MultiEdit path under backlog'
assert_result 2 "$(path_payload NotebookEdit notebook_path backlog/note.ipynb)" \
  'NotebookEdit under backlog'
assert_result 2 "$(path_payload Bash path backlog/tasks/t-82.md)" \
  'structured Bash path under backlog'

assert_result 0 "$(path_payload Write file_path README.md)" \
  'non-backlog Write'
assert_result 0 "$(path_payload Edit file_path backlog-copy/note.md)" \
  'backlog prefix sibling'
assert_result 0 '{"tool_name":"Read","tool_input":{"file_path":"backlog/tasks/t-82.md"}}' \
  'non-edit tool'
assert_result 0 'not valid JSON' 'malformed event'

mv_payload="$(jq -cn \
  '{tool_name:"Bash",tool_input:{command:"mv backlog/tasks/t-82.md backlog/completed/t-82.md"}}'
)"
assert_result 0 "$mv_payload" 'task-record finalization mv'

jq -e '
  .permissions.deny == [
    "Bash(gh pr merge:*)",
    "Bash(gh * pr merge)",
    "Bash(gh * pr merge *)"
  ]
  and .hooks.PreToolUse == [{
    matcher: "Bash|Edit|Write|MultiEdit|NotebookEdit",
    hooks: [{
      type: "command",
      command: "${CLAUDE_PROJECT_DIR}/bin/qq-claude-backlog-hook",
      args: []
    }]
  }]
' "$SETTINGS" >/dev/null || fail 'Claude Code permissions or hook wiring drifted'

printf 'test-qq-claude-backlog-hook: pass\n'
