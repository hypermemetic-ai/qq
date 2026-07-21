#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-herdr-home"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
HOME_CMD="$ROOT/bin/qq-herdr-home"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" -c user.name=test -c user.email=test@example.com \
  commit --allow-empty -qm initial
main_checkout="$(cd "$repo" && pwd -P)"
repo_key="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)"

fake="$tmp/herdr"
log="$tmp/herdr.log"
cat >"$fake" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_LOG"

case "${1:-} ${2:-}" in
  "workspace list")
    if [ "${FAKE_NO_HOME:-}" = 1 ]; then
      jq -cn --arg checkout "$FAKE_MAIN" --arg key "$FAKE_REPO_KEY" '
        {result:{workspaces:[
          {workspace_id:"wWork",worktree:{checkout_path:($checkout + "-work"),is_linked_worktree:true,repo_key:$key,repo_root:$checkout}}
        ]}}'
    elif [ "${FAKE_MULTI_HOME:-}" = 1 ]; then
      jq -cn --arg checkout "$FAKE_MAIN" --arg key "$FAKE_REPO_KEY" '
        {result:{workspaces:[
          {workspace_id:"wHome",worktree:{checkout_path:$checkout,is_linked_worktree:false,repo_key:$key,repo_root:$checkout}},
          {workspace_id:"wHome2",worktree:{checkout_path:$checkout,is_linked_worktree:false,repo_key:$key,repo_root:$checkout}}
        ]}}'
    else
      jq -cn --arg checkout "$FAKE_MAIN" --arg key "$FAKE_REPO_KEY" '
        {result:{workspaces:[
          {workspace_id:"wHome",worktree:{checkout_path:$checkout,is_linked_worktree:false,repo_key:$key,repo_root:$checkout}},
          {workspace_id:"wWork",worktree:{checkout_path:($checkout + "-work"),is_linked_worktree:true,repo_key:$key,repo_root:$checkout}}
        ]}}'
    fi
    ;;
  "pane list")
    if [ "${FAKE_MULTI_BOARD:-}" = 1 ]; then
      printf '%s\n' '{"result":{"panes":[{"pane_id":"wHome:pBoard","tab_id":"wHome:tBoard"},{"pane_id":"wHome:pGeneral","tab_id":"wHome:tGeneral"},{"pane_id":"wHome:pBoard2","tab_id":"wHome:tOther"}]}}'
    elif [ "${FAKE_SPLIT_BOARD:-}" = 1 ]; then
      printf '%s\n' '{"result":{"panes":[{"pane_id":"wHome:pBoard","tab_id":"wHome:tBoard"},{"pane_id":"wHome:pSplit","tab_id":"wHome:tBoard"},{"pane_id":"wHome:pGeneral","tab_id":"wHome:tGeneral"}]}}'
    else
      printf '%s\n' '{"result":{"panes":[{"pane_id":"wHome:pBoard","tab_id":"wHome:tBoard"},{"pane_id":"wHome:pGeneral","tab_id":"wHome:tGeneral"}]}}'
    fi
    ;;
  "pane process-info")
    pane="${4:-}"
    if { [ "$pane" = "wHome:pBoard" ] && [ "${FAKE_NO_BOARD:-}" != 1 ]; } \
      || [ "$pane" = "wHome:pBoard2" ]; then
      printf '%s\n' '{"result":{"process_info":{"foreground_processes":[{"argv":["node","/opt/bin/backlog","board"]},{"argv":["/opt/lib/backlog","board"]}]}}}'
    else
      printf '%s\n' '{"result":{"process_info":{"foreground_processes":[{"argv":["bash"]}]}}}'
    fi
    ;;
  "tab focus")
    [ "${FAKE_FOCUS_FAIL:-}" != 1 ] || exit 1
    printf '%s\n' '{"result":{"type":"ok"}}'
    ;;
  "tab get")
    if [ "${FAKE_FOCUS_UNCONFIRMED:-}" = 1 ]; then
      printf '%s\n' '{"result":{"tab":{"tab_id":"wHome:tBoard","workspace_id":"wHome","focused":false}}}'
    else
      printf '%s\n' '{"result":{"tab":{"tab_id":"wHome:tBoard","workspace_id":"wHome","focused":true}}}'
    fi
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
export FAKE_MAIN="$main_checkout"
export FAKE_REPO_KEY="$repo_key"

reset_fake() {
  : >"$log"
  unset FAKE_FOCUS_FAIL FAKE_FOCUS_UNCONFIRMED FAKE_MULTI_BOARD
  unset FAKE_MULTI_HOME FAKE_NO_BOARD FAKE_NO_HOME FAKE_SPLIT_BOARD
}

expect_failure() {
  local expected="$1"
  shift
  if "$HOME_CMD" "$@" >"$tmp/out" 2>"$tmp/err"; then
    fail "unexpected success: $expected"
  fi
  assert_file_contains "$tmp/err" "$expected" "missing failure text: $expected"
}

reset_fake
result="$("$HOME_CMD" inspect --repo "$repo")"
jq -e --arg checkout "$main_checkout" '
  (keys == ["action", "focused", "home_workspace_id", "main_checkout", "repo_root"])
  and .action == "inspect"
  and .repo_root == $checkout
  and .main_checkout == $checkout
  and .home_workspace_id == "wHome"
  and .focused == false
' <<<"$result" >/dev/null
if grep -Eq '^(pane list|pane process-info|tab focus|tab get) ' "$log"; then
  fail "inspect performed board discovery or changed focus"
fi

reset_fake
result="$("$HOME_CMD" focus-board --repo "$repo")"
jq -e --arg checkout "$main_checkout" '
  (keys == ["action", "board_pane_id", "board_tab_id", "focused", "home_workspace_id", "main_checkout", "repo_root"])
  and .action == "focus-board"
  and .repo_root == $checkout
  and .main_checkout == $checkout
  and .home_workspace_id == "wHome"
  and .board_tab_id == "wHome:tBoard"
  and .board_pane_id == "wHome:pBoard"
  and .focused == true
' <<<"$result" >/dev/null
grep -Fxq 'tab focus wHome:tBoard' "$log"
grep -Fxq 'tab get wHome:tBoard' "$log"
if grep -Eq '^(pane move|pane close|worktree remove) ' "$log"; then
  fail "focus-board changed work-session topology"
fi

reset_fake
export FAKE_NO_HOME=1
expect_failure 'expected exactly one persistent Herdr home' inspect --repo "$repo"

reset_fake
export FAKE_MULTI_HOME=1
expect_failure 'expected exactly one persistent Herdr home' inspect --repo "$repo"

reset_fake
export FAKE_NO_BOARD=1
expect_failure 'expected exactly one Backlog-board pane' focus-board --repo "$repo"

reset_fake
export FAKE_MULTI_BOARD=1
expect_failure 'expected exactly one Backlog-board pane' focus-board --repo "$repo"

reset_fake
export FAKE_SPLIT_BOARD=1
expect_failure 'must contain exactly one pane' focus-board --repo "$repo"

reset_fake
export FAKE_FOCUS_FAIL=1
expect_failure 'could not focus Backlog board tab' focus-board --repo "$repo"

reset_fake
export FAKE_FOCUS_UNCONFIRMED=1
expect_failure 'Backlog board focus was not confirmed' focus-board --repo "$repo"

tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -Fq 'Change checkouts are plain linked worktrees with no Herdr workspace, and delegated agents run as headless child processes in the Change worktree.'
tr '\n\t' '  ' <"$ROOT/cockpit/README.md" | \
  grep -Fq 'Changes live in plain linked worktrees; no per-Change Herdr workspaces are created.'
tr '\n\t' '  ' <"$ROOT/cockpit/README.md" | \
  grep -Fq 'their own conversation stays in the project home'
if tr '\n\t' '  ' <"$ROOT/cockpit/README.md" | \
  grep -qE 'move the current +conversation into the work session'; then
  fail 'cockpit/README.md reintroduced the pane-migration flow (agents dispatch from the project home, T-70)'
fi
if grep -Fq -- 'herdr agent start' "$ROOT/skills/agent-messaging/SKILL.md"; then
  fail "agent-messaging reintroduced delegate lifecycle machinery"
fi
if tr '\n\t' '  ' <"$ROOT/skills/agent-messaging/SKILL.md" | \
  grep -qE -- 'herdr (pane run|agent send|agent wait|agent list|agent get|agent read)'; then
  fail "agent-messaging reintroduced a herdr inter-agent path (amended T-109: intercom-only)"
fi
grep -Fq -- 'pi-intercom' "$ROOT/skills/agent-messaging/SKILL.md"
grep -Fq -- 'herdr notification show "<title>" --body "<body>" --sound <sound>' \
  "$ROOT/skills/agent-messaging/SKILL.md"
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE '\*\*agent messaging\*\* — Direct live-agent coordination through pi-intercom plus operator-visible herdr notifications outside transcripts\. It does not start, own, or retire agents\.'
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE "\\*\\*work order\\*\\* — One complete work-order brief per delegated ticket: the delegate's complete orientation and the plan bound, carrying .*the required completion envelope\\."
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE "\\*\\*completion envelope\\*\\* — Every delegate's final message must report per-ticket status, commits, files changed, Checks run with results, .*The owner must verify every claim against the tree; an envelope claim is not yet evidence\\."
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE '\*\*decision ledger\*\* —'
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE '\*\*alignment brief\*\* —'
ls "$ROOT"/backlog/decisions/decision-2*.md >/dev/null
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE 'opt-out +recorded +verbatim'

printf 'test-qq-herdr-home: pass\n'
