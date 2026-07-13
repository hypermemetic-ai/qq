#!/usr/bin/env bash
set -euo pipefail

PULL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/bin/qq-herdr-pull"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fake="$tmp/herdr"
log="$tmp/calls"

cat >"$fake" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_LOG"

case "${1:-} ${2:-}" in
  "pane current")
    printf '{"result":{"pane":{"pane_id":"%s","workspace_id":"%s","agent":%s}}}\n' \
      "${FAKE_CURRENT_PANE:-source:p1}" "${FAKE_CURRENT_WORKSPACE:-source}" \
      "${FAKE_CURRENT_AGENT_JSON:-\"codex\"}"
    ;;
  "workspace get")
    [ "${FAKE_WORKSPACE_MISSING:-}" != 1 ] || exit 1
    printf '{"result":{"workspace":{"workspace_id":"%s"}}}\n' "$3"
    ;;
  "pane list")
    if [ "${FAKE_PANE_COUNT:-1}" = 2 ]; then
      printf '{"result":{"panes":[{"pane_id":"target:p1","tab_id":"target:t1"},{"pane_id":"target:p2","tab_id":"target:t1"}]}}\n'
    elif [ -n "${FAKE_TARGET_AGENT:-}" ]; then
      printf '{"result":{"panes":[{"pane_id":"target:p1","tab_id":"target:t1","agent":"%s"}]}}\n' "$FAKE_TARGET_AGENT"
    else
      printf '{"result":{"panes":[{"pane_id":"target:p1","tab_id":"target:t1"}]}}\n'
    fi
    ;;
  "pane process-info")
    if [ "${FAKE_BUSY:-}" = 1 ]; then
      printf '%s\n' '{"result":{"process_info":{"shell_pid":10,"foreground_process_group_id":20,"foreground_processes":[{"pid":20}]}}}'
    else
      printf '%s\n' '{"result":{"process_info":{"shell_pid":10,"foreground_process_group_id":10,"foreground_processes":[{"pid":10}]}}}'
    fi
    ;;
  "agent list")
    printf '%s\n' '{"result":{"type":"agent_list","agents":[{"pane_id":"agent:p1","agent_status":"idle"},{"pane_id":"agent:p2","agent_status":"blocked"}]}}'
    ;;
  "pane get")
    printf '{"result":{"pane":{"tab_id":"%s"}}}\n' "${FAKE_OPERATOR_TAB:-operator:t1}"
    ;;
  "pane move")
    [ "${FAKE_MOVE_FAIL:-}" != 1 ] || exit 1
    if [ "${FAKE_MOVE_UNCHANGED:-}" = 1 ]; then
      printf '%s\n' '{"result":{"move_result":{"changed":false,"reason":"zoomed_tab","pane":{"pane_id":"source:p1"}}}}'
    else
      printf '{"result":{"move_result":{"changed":true,"pane":{"pane_id":"%s"}}}}\n' "${FAKE_MOVED_PANE:-target:p2}"
    fi
    ;;
  "pane close")
    [ "${FAKE_CLOSE_FAIL:-}" != 1 ] || exit 1
    printf '%s\n' '{"result":{"type":"ok"}}'
    ;;
  "notification show")
    printf '%s\n' '{"result":{"shown":true}}'
    ;;
  *)
    printf 'unexpected fake herdr command: %s\n' "$*" >&2
    exit 2
    ;;
esac
SH
chmod +x "$fake"

export HERDR_BIN_PATH="$fake"
export FAKE_LOG="$log"

reset_fake() {
  : >"$log"
  unset FAKE_BUSY FAKE_CLOSE_FAIL FAKE_CURRENT_PANE FAKE_CURRENT_WORKSPACE
  unset FAKE_CURRENT_AGENT_JSON
  unset FAKE_MOVE_FAIL FAKE_MOVED_PANE FAKE_PANE_COUNT FAKE_TARGET_AGENT
  unset FAKE_MOVE_UNCHANGED
  unset FAKE_WORKSPACE_MISSING
}

expect_agent_failure() {
  local expected="$1"
  shift
  if "$PULL" --workspace target >"$tmp/out" 2>"$tmp/err"; then
    printf 'agent mode unexpectedly succeeded: %s\n' "$expected" >&2
    exit 1
  fi
  grep -Fq "$expected" "$tmp/err"
}

assert_not_called() {
  local pattern="$1"
  if grep -q "$pattern" "$log"; then
    printf 'unexpected fake herdr call matching %s\n' "$pattern" >&2
    exit 1
  fi
}

reset_fake
output="$(QQ_HERDR_PULL_DRY=1 "$PULL" --workspace target)"
test "$output" = 'workspace=target target=target:p1 source=source:p1'
assert_not_called '^pane move '
assert_not_called '^pane close '

reset_fake
output="$("$PULL" --workspace target)"
test "$output" = 'workspace=target pane=target:p2 replaced=target:p1 changed=true'
grep -q '^pane move source:p1 --tab target:t1 --target-pane target:p1 --split right --focus$' "$log"
grep -q '^pane close target:p1$' "$log"

reset_fake
export FAKE_CURRENT_WORKSPACE=target FAKE_CURRENT_PANE=target:p7
output="$("$PULL" --workspace target)"
test "$output" = 'workspace=target pane=target:p7 changed=false'
assert_not_called '^pane list '

reset_fake
export FAKE_PANE_COUNT=2
expect_agent_failure "must contain exactly one placeholder pane (found 2)"
assert_not_called '^pane move '
assert_not_called '^pane close '

reset_fake
export FAKE_CURRENT_AGENT_JSON=null
expect_agent_failure "calling pane 'source:p1' is not an agent"
assert_not_called '^workspace get '
assert_not_called '^pane move '

reset_fake
export FAKE_TARGET_AGENT=codex
expect_agent_failure "already occupied by an agent"
assert_not_called '^pane move '

reset_fake
export FAKE_BUSY=1
expect_agent_failure "is not an idle shell placeholder"
assert_not_called '^pane move '

reset_fake
export FAKE_MOVE_FAIL=1
expect_agent_failure "move failed (source:p1 -> target:t1)"
grep -q '^pane move ' "$log"
assert_not_called '^pane close '

reset_fake
export FAKE_MOVE_UNCHANGED=1
expect_agent_failure "move not applied (source:p1 -> target:t1; reason: zoomed_tab)"
grep -q '^pane move ' "$log"
assert_not_called '^pane close '

reset_fake
export FAKE_CLOSE_FAIL=1
expect_agent_failure "agent moved to 'target:p2', but placeholder 'target:p1' could not be closed"
grep -q '^pane move ' "$log"
grep -q '^pane close target:p1$' "$log"

reset_fake
output="$(HERDR_PANE_ID=operator:p1 QQ_HERDR_PULL_DRY=1 "$PULL" 1)"
test "$output" = 'target=operator:p1 source=agent:p1'

reset_fake
output="$(HERDR_PANE_ID=operator:p1 QQ_HERDR_PULL_DRY=1 "$PULL" next)"
test "$output" = 'target=operator:p1 source=agent:p2'

reset_fake
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move agent:p1 --tab operator:t1 --target-pane operator:p1 --split right --focus$' "$log"
grep -q '^pane close operator:p1$' "$log"

reset_fake
HERDR_PANE_ID=operator:p1 "$PULL" 0
grep -q '^notification show ' "$log"
assert_not_called '^pane move '

reset_fake
export FAKE_MOVE_FAIL=1
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move ' "$log"
grep -q '^notification show ' "$log"
assert_not_called '^pane close '

reset_fake
export FAKE_MOVE_UNCHANGED=1
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move ' "$log"
grep -q '^notification show ' "$log"
assert_not_called '^pane close '

printf 'test-qq-herdr-pull: pass\n'
