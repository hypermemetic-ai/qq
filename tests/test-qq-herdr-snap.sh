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
  "workspace list")
    printf '%s\n' "${FAKE_WORKSPACES_JSON:-$FAKE_WORKSPACES_DEFAULT}"
    ;;
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
# Sidebar order: codex first, claude second, pi third in the project home.
export FAKE_AGENTS_DEFAULT='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p2","workspace_id":"ws","agent":"claude"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"pi"},{"pane_id":"other:p1","workspace_id":"other","agent":"claude"}]}}'
export FAKE_WORKSPACES_DEFAULT='{"result":{"workspaces":[{"workspace_id":"ws","worktree":{"checkout_path":"/repo","is_linked_worktree":false,"repo_root":"/repo"}},{"workspace_id":"other","worktree":null}]}}'
state_file="$tmp/qq-herdr-snap.ws.prev"
home_state_file="$tmp/qq-herdr-snap.home.prev"

reset_fake() {
  : >"$log"
  rm -f "$state_file" "$home_state_file"
  unset FAKE_AGENTS_JSON FAKE_CURRENT_PANE FAKE_FOCUS_FAIL FAKE_WORKSPACES_JSON
  unset FAKE_PREV_AGENT_JSON FAKE_PREV_GONE FAKE_PREV_PANE FAKE_WORKSPACE
}

# Dry run resolves target without focusing anything.
reset_fake
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p3 prev=none' "$output"
assert_file_not_matches "$log" '^agent focus '
assert_file_not_matches "$log" '^tab focus '

# Snap: prefers project-home pi over Claude and sidebar order, stores the origin.
reset_fake
HERDR_PANE_ID=ws:p1 "$SNAP"
grep -q '^agent focus ws:p3$' "$log"
assert_equal 'ws:p1' "$(cat "$state_file")" "state file should record the origin pane"

# From linked work, prefer this Repository's project-home pi even when a local
# pi and the home Claude appear earlier; bounce back using home-keyed state.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"pi"},{"pane_id":"home:p2","workspace_id":"home","agent":"claude"},{"pane_id":"home:p3","workspace_id":"home","agent":"pi"},{"pane_id":"other:p2","workspace_id":"other","agent":"claude"}]}}'
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"workspace_id":"ws","worktree":{"checkout_path":"/repo-work","is_linked_worktree":true,"repo_root":"/repo"}},{"workspace_id":"sibling","worktree":{"checkout_path":"/repo-sibling","is_linked_worktree":true,"repo_root":"/repo"}},{"workspace_id":"other","worktree":{"checkout_path":"/other","is_linked_worktree":false,"repo_root":"/other"}},{"workspace_id":"home","worktree":{"checkout_path":"/repo","is_linked_worktree":false,"repo_root":"/repo"}}]}}'
HERDR_PANE_ID=ws:p1 "$SNAP"
assert_file_contains "$log" 'agent focus home:p3'
assert_equal 'ws:p1' "$(cat "$home_state_file")" "home state should record the origin pane"
[ ! -e "$state_file" ] || fail "cross-space snap wrote state under the origin workspace"

: >"$log"
export FAKE_WORKSPACE=home FAKE_PREV_PANE=ws:p1 FAKE_PREV_AGENT_JSON='"codex"'
HERDR_PANE_ID=home:p3 "$SNAP"
assert_file_contains "$log" 'agent focus ws:p1'

# Project-home Claude is the fallback when that home has no pi, even if the
# focused linked workspace has a pi.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"pi"},{"pane_id":"home:p2","workspace_id":"home","agent":"claude"}]}}'
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"workspace_id":"ws","worktree":{"checkout_path":"/repo-work","is_linked_worktree":true,"repo_root":"/repo"}},{"workspace_id":"home","worktree":{"checkout_path":"/repo","is_linked_worktree":false,"repo_root":"/repo"}}]}}'
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=home:p2 prev=none' "$output"

# With no pi or Claude in the Repository home, prefer focused-workspace pi.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p2","workspace_id":"ws","agent":"claude"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"pi"},{"pane_id":"home:p9","workspace_id":"home","agent":"codex"}]}}'
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"workspace_id":"ws","worktree":{"checkout_path":"/repo-work","is_linked_worktree":true,"repo_root":"/repo"}},{"workspace_id":"home","worktree":{"checkout_path":"/repo","is_linked_worktree":false,"repo_root":"/repo"}}]}}'
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p3 prev=none' "$output"

# With no home runtime or focused pi, prefer focused-workspace Claude.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p2","workspace_id":"ws","agent":"claude"},{"pane_id":"home:p9","workspace_id":"home","agent":"codex"}]}}'
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"workspace_id":"ws","worktree":{"checkout_path":"/repo-work","is_linked_worktree":true,"repo_root":"/repo"}},{"workspace_id":"home","worktree":{"checkout_path":"/repo","is_linked_worktree":false,"repo_root":"/repo"}}]}}'
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p2 prev=none' "$output"

# Without pi or Claude, falls back to focused-workspace sidebar order.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"pane_id":"ws:p9","workspace_id":"ws","agent":"codex"},{"pane_id":"ws:p3","workspace_id":"ws","agent":"codex"}]}}'
output="$(HERDR_PANE_ID=ws:p1 QQ_HERDR_SNAP_DRY=1 "$SNAP")"
assert_equal 'current=ws:p1 workspace=ws target=ws:p9 prev=none' "$output"

# A reported agent presence on the focused shell pane is not an orchestrator.
reset_fake
export FAKE_AGENTS_JSON='{"result":{"agents":[{"terminal_id":"term:1","agent_status":"working","workspace_id":"ws","tab_id":"ws:t1","pane_id":"ws:p1","focused":true,"revision":1,"agent":"codex","screen_detection_skipped":true}]}}'
HERDR_PANE_ID=ws:p1 "$SNAP"
assert_file_contains "$log" 'notification show qq-snap --body no other agent session in this space'
assert_file_not_matches "$log" 'already on the orchestrator'
assert_file_not_matches "$log" '^agent focus '

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
HERDR_PANE_ID=ws:p3 "$SNAP"
grep -q '^agent focus ws:p1$' "$log"

# Bounce to a non-agent pane goes through tab focus.
reset_fake
printf 'ws:p1\n' >"$state_file"
export FAKE_PREV_PANE=ws:p1 FAKE_PREV_AGENT_JSON=null
HERDR_PANE_ID=ws:p3 "$SNAP"
grep -q '^tab focus prev:t1$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Bounce when the stored pane no longer exists: notification, no focus.
reset_fake
printf 'ws:p1\n' >"$state_file"
export FAKE_PREV_PANE=ws:p1 FAKE_PREV_GONE=1
HERDR_PANE_ID=ws:p3 "$SNAP"
grep -q '^notification show qq-snap --body previous pane is gone$' "$log"
assert_file_not_matches "$log" '^agent focus '
assert_file_not_matches "$log" '^tab focus '

# Already on the orchestrator with no stored origin: notification only.
reset_fake
HERDR_PANE_ID=ws:p3 "$SNAP"
grep -q '^notification show qq-snap --body already on the orchestrator$' "$log"
assert_file_not_matches "$log" '^agent focus '

# Without HERDR_PANE_ID the focused pane comes from `pane current`.
reset_fake
export FAKE_CURRENT_PANE=ws:p1
env -u HERDR_PANE_ID "$SNAP"
grep -q '^pane current --current$' "$log"
grep -q '^agent focus ws:p3$' "$log"

printf 'test-qq-herdr-snap: pass\n'
