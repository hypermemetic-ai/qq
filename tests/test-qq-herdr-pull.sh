#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-herdr-pull"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
PULL="$(cd "$TESTS_DIR/.." && pwd -P)/bin/qq-herdr-pull"
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
      "${FAKE_CURRENT_AGENT_JSON:-\"other-agent\"}"
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

export QQ_HERDR_BIN="$fake"
export FAKE_LOG="$log"

reset_fake() {
  : >"$log"
  unset FAKE_CLOSE_FAIL FAKE_CURRENT_PANE FAKE_CURRENT_WORKSPACE
  unset FAKE_CURRENT_AGENT_JSON FAKE_MOVE_FAIL FAKE_MOVED_PANE
  unset FAKE_MOVE_UNCHANGED FAKE_OPERATOR_TAB
}

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
assert_file_not_matches "$log" '^pane move '

# Without the injected keybinding identity the focused pane is resolved live.
reset_fake
HERDR_PANE_ID= FAKE_CURRENT_PANE=operator:p9 QQ_HERDR_PULL_DRY=1 "$PULL" 1 >/dev/null
grep -q '^pane current ' "$log"

reset_fake
export FAKE_MOVE_FAIL=1
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move ' "$log"
grep -q '^notification show ' "$log"
assert_file_not_matches "$log" '^pane close '

reset_fake
export FAKE_MOVE_UNCHANGED=1
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move ' "$log"
grep -q '^notification show ' "$log"
assert_file_not_matches "$log" '^pane close '

reset_fake
export FAKE_CLOSE_FAIL=1
HERDR_PANE_ID=operator:p1 "$PULL" 1
grep -q '^pane move ' "$log"
grep -q '^pane close operator:p1$' "$log"
grep -q '^notification show ' "$log"

# The retired agent-mode spelling dies as an ordinary usage error: a
# notification, a successful exit, and no layout mutation.
reset_fake
HERDR_PANE_ID=operator:p1 "$PULL" --workspace target
grep -q '^notification show ' "$log"
assert_file_not_matches "$log" '^workspace get '
assert_file_not_matches "$log" '^pane move '
assert_file_not_matches "$log" '^pane close '

printf 'test-qq-herdr-pull: pass\n'
