#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-herdr-snap"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
SNAP="$(cd "$TESTS_DIR/.." && pwd -P)/bin/qq-herdr-snap"
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
    printf '{"result":{"pane":{"pane_id":"%s"}}}\n' "${FAKE_CURRENT_PANE:-ws:p1}"
    ;;
  "pane get")
    if [ "${3:-}" = "${FAKE_PREV_PANE:-}" ]; then
      if [ "${FAKE_PREV_GONE:-}" = 1 ]; then
        printf '{"result":{}}\n'
      else
        printf '{"result":{"pane":{"pane_id":"%s","tab_id":"prev:t1","workspace_id":"ws","agent":%s}}}\n' \
          "$3" "${FAKE_PREV_AGENT_JSON:-null}"
      fi
    else
      printf '{"result":{"pane":{"pane_id":"%s","tab_id":"cur:t1","workspace_id":"%s"}}}\n' \
        "$3" "${FAKE_WORKSPACE:-ws}"
    fi
    ;;
  "agent list")
    printf '%s\n' "${FAKE_AGENTS_JSON:-$FAKE_AGENTS_DEFAULT}"
    ;;
  "agent focus")
    [ "${FAKE_FOCUS_FAIL:-}" != 1 ] || exit 1
    printf '{"result":{"type":"ok"}}\n'
    ;;
  "tab focus")
    printf '{"result":{"type":"ok"}}\n'
    ;;
  "notification show")
    printf '{"result":{"shown":true}}\n'
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
export XDG_RUNTIME_DIR="$tmp"
# Sidebar order: codex first, claude second in "ws"; one agent elsewhere.
export FAKE_AGENTS_DEFAULT='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p2","workspace_id":"ws","agent":"claude"},{"pane_id":"other:p1","workspace_id":"other","agent":"claude"}]}}'
state_file="$tmp/qq-herdr-snap.ws.prev"

reset_fake() {
  : >"$log"
  rm -f "$state_file"
  unset FAKE_AGENTS_JSON FAKE_CURRENT_PANE FAKE_FOCUS_FAIL
  unset FAKE_PREV_AGENT_JSON FAKE_PREV_GONE FAKE_PREV_PANE FAKE_WORKSPACE
}

# Dry run resolves target without focusing anything.
reset_fake
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p2 prev=none' "$output"
assert_file_not_matches "$log" '^agent focus '
assert_file_not_matches "$log" '^tab focus '

# Snap: prefers the claude agent in the focused workspace, stores the origin.
reset_fake
HERDR_PANE_ID=ws:p1 "$SNAP"
grep -q '^agent focus ws:p2$' "$log"
assert_equal 'ws:p1' "$(cat "$state_file")" "state file should record the origin pane"

# Without a claude agent, falls back to sidebar order.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"codex"}]}}'
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p9 prev=none' "$output"

# No agent in the focused workspace: best-effort notification, no focus.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"other:p1","workspace_id":"other","agent":"claude"}]}}'
HERDR_PANE_ID=ws:p1 "$SNAP"
grep -q '^notification show qq-snap --body no agent session in this space$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Corrupted agent list: the parse failure dies cleanly instead of acting on
# a target extracted from the valid prefix.
reset_fake
export FAKE_AGENTS_JSON="$FAKE_AGENTS_DEFAULT
not-json"
HERDR_PANE_ID=ws:p1 "$SNAP"
grep -q '^notification show qq-snap --body cannot parse agent list$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Unwritable state location: best-effort notification, exit 0, no focus.
reset_fake
XDG_RUNTIME_DIR="$tmp/missing/nested" HERDR_PANE_ID=ws:p1 "$SNAP"
grep -q '^notification show qq-snap --body cannot record origin pane' "$log"
assert_file_not_matches "$log" '^agent focus '

# Bounce: already on the orchestrator, previous pane hosts an agent.
reset_fake
printf 'ws:p1\n' >"$state_file"
export FAKE_PREV_PANE=ws:p1 FAKE_PREV_AGENT_JSON='"claude"'
HERDR_PANE_ID=ws:p2 "$SNAP"
grep -q '^agent focus ws:p1$' "$log"

# Bounce to a non-agent pane goes through tab focus.
reset_fake
printf 'ws:p1\n' >"$state_file"
export FAKE_PREV_PANE=ws:p1 FAKE_PREV_AGENT_JSON=null
HERDR_PANE_ID=ws:p2 "$SNAP"
grep -q '^tab focus prev:t1$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Bounce when the stored pane no longer exists: notification, no focus.
reset_fake
printf 'ws:p1\n' >"$state_file"
export FAKE_PREV_PANE=ws:p1 FAKE_PREV_GONE=1
HERDR_PANE_ID=ws:p2 "$SNAP"
grep -q '^notification show qq-snap --body previous pane is gone$' "$log"
assert_file_not_matches "$log" '^agent focus '
assert_file_not_matches "$log" '^tab focus '

# Already on the orchestrator with no stored origin: notification only.
reset_fake
HERDR_PANE_ID=ws:p2 "$SNAP"
grep -q '^notification show qq-snap --body already on the orchestrator$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Without HERDR_PANE_ID the focused pane comes from `pane current`.
reset_fake
export FAKE_CURRENT_PANE=ws:p1
env -u HERDR_PANE_ID "$SNAP"
grep -q '^pane current --current$' "$log"
grep -q '^agent focus ws:p2$' "$log"

printf 'test-qq-herdr-snap: pass\n'
