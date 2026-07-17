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
  .action == "inspect"
  and .repo_root == $checkout
  and .main_checkout == $checkout
  and .home_workspace_id == "wHome"
  and .board_tab_id == "wHome:tBoard"
  and .board_pane_id == "wHome:pBoard"
  and .focused == false
' <<<"$result" >/dev/null
if grep -q '^tab focus ' "$log"; then
  fail "inspect changed focus"
fi

reset_fake
result="$("$HOME_CMD" focus-board --repo "$repo")"
jq -e '.action == "focus-board" and .focused == true' <<<"$result" >/dev/null
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
expect_failure 'expected exactly one Backlog-board pane' inspect --repo "$repo"

reset_fake
export FAKE_MULTI_BOARD=1
expect_failure 'expected exactly one Backlog-board pane' inspect --repo "$repo"

reset_fake
export FAKE_SPLIT_BOARD=1
expect_failure 'must contain exactly one pane' inspect --repo "$repo"

reset_fake
export FAKE_FOCUS_FAIL=1
expect_failure 'could not focus Backlog board tab' focus-board --repo "$repo"

reset_fake
export FAKE_FOCUS_UNCONFIRMED=1
expect_failure 'Backlog board focus was not confirmed' focus-board --repo "$repo"

tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | grep -qE -- '--workspace +<home-workspace-id>'
test "$(grep -o -- '--label "<change-label>"' "$ROOT/skills/deliver-change/SKILL.md" | wc -l)" -eq 2
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/CONCEPTS.md"
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/cockpit/README.md"
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/skills/deliver-change/SKILL.md"
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -Fq 'agent-chosen, operator-renameable'
grep -Fq 'agent-chosen, operator-renameable' "$ROOT/skills/deliver-change/SKILL.md"
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'unique among work +sessions under'
grep -Fq ".label\` equal to \`<change-label>" "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'existing Change checkout by default, including harness-created worktrees' \
  "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'use creation as the fallback' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'verify that its result confirms it was' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'command fails or reports notifications disabled' \
  "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'browser-only fallback' "$ROOT/skills/deliver-change/SKILL.md"
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'harness-native +background disposition watch'
grep -Fq 'single-notification' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'GitHub CLI' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'state every 5' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'either `MERGED` or `CLOSED`' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'follow-on dispatch' "$ROOT/skills/deliver-change/SKILL.md"
if grep -Fq 'observability pane' "$ROOT/skills/delegate-batch/SKILL.md"; then
  fail 'delegate-batch must not reintroduce the observability pane (operator UAT rejected it; the status surface owns delegate visibility)'
fi
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'do not run `qq-herdr-home +focus-board`'
grep -Fq 'leave operator focus untouched' "$ROOT/skills/deliver-change/SKILL.md"
if tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'qq-herdr-home +focus-board +--repo'; then
  fail 'deliver-change reintroduced the disposition-time focus-board invocation (focus-board is operator-invocable only)'
fi

grep -Fq 'dispatches from the project home' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'dispatches from the project home' "$ROOT/CONCEPTS.md"
tr '\n\t' '  ' <"$ROOT/skills/delegate-batch/SKILL.md" | \
  grep -qE 'In both modes, report each delegate on its work session.s placeholder +root pane'
if grep -Fq 'qq-herdr-pull' "$ROOT/skills/deliver-change/SKILL.md"; then
  fail 'deliver-change reintroduced the qq-herdr-pull migration (the accountable session dispatches from the project home, T-70)'
fi
if grep -qiE 'migrat' "$ROOT/skills/deliver-change/SKILL.md" "$ROOT/skills/delegate-batch/SKILL.md"; then
  fail 'a skill reintroduced the migrated posture (collapsed to the universal project-home dispatcher, T-70)'
fi
if grep -Fq -- '<own-pane-id>' "$ROOT/skills/delegate-batch/SKILL.md"; then
  fail 'delegate-batch reintroduced the accountable-pane stage-token channel (removed by the posture collapse, T-70)'
fi
if grep -Fq 'herdr pane move' "$ROOT/skills/deliver-change/SKILL.md"; then
  fail 'deliver-change reintroduced a retire-time pane move (the retire order moves no pane, T-70)'
fi
grep -Fq 'posture deliver-change step 1 binds' "$ROOT/skills/delegate-batch/SKILL.md"
tr '\n\t' '  ' <"$ROOT/cockpit/README.md" | \
  grep -Fq 'their own conversation stays in the project home'
if tr '\n\t' '  ' <"$ROOT/cockpit/README.md" | \
  grep -qE 'move the current +conversation into the work session'; then
  fail 'cockpit/README.md reintroduced the pane-migration flow (agents dispatch from the project home, T-70)'
fi
if grep -qE 'exception to deliver-change' "$ROOT/skills/delegate-batch/SKILL.md"; then
  fail 'delegate-batch reintroduced the board-driven exception framing (one posture since T-70)'
fi
if grep -Fq 'accountable pane' "$ROOT/skills/deliver-change/SKILL.md"; then
  fail 'deliver-change reintroduced an accountable pane inside the work session (it dispatches from the project home, T-70)'
fi
grep -Fq 'managed Task record under `backlog/tasks/`' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'other untracked entry still blocks the synchronization' "$ROOT/skills/deliver-change/SKILL.md"
if tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'one such checkout, an empty `git status'; then
  fail 'deliver-change step 11 regressed to the strict all-untracked sync rail (T-73)'
fi
if grep -Fq -- 'herdr agent start' "$ROOT/skills/agent-messaging/SKILL.md"; then
  fail "agent-messaging reintroduced delegate lifecycle machinery"
fi
grep -Fq -- 'herdr agent wait <name> --status idle' \
  "$ROOT/skills/agent-messaging/SKILL.md"
grep -Fq -- 'herdr notification show "<title>" --body "<body>" --sound <sound>' \
  "$ROOT/skills/agent-messaging/SKILL.md"
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -Fq "**agent messaging** — Direct coordination between live agents across runtimes through herdr's list, send, read, and wait operations, plus operator-visible notifications outside any transcript. It does not start, own, or retire agents."
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE "\\*\\*work order\\*\\* — One complete work-order brief per delegated ticket: the delegate's complete orientation and the plan bound, carrying .*the required completion envelope\\."
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE "\\*\\*completion envelope\\*\\* — Every delegate's final message must report per-ticket status, commits, files changed, Checks run with results, .*The owner must verify every claim against the tree; an envelope claim is not yet evidence\\."
grep -Fq -- "-c 'skills.include_instructions=false'" "$ROOT/skills/code-review/SKILL.md"
grep -Fq -- "-c 'skills.bundled.enabled=false'" "$ROOT/skills/code-review/SKILL.md"
grep -Fq -- '--sandbox read-only' "$ROOT/skills/code-review/SKILL.md"
grep -Fq -- "-c 'skills.include_instructions=false'" "$ROOT/skills/research/SKILL.md"
grep -Fq -- "-c 'skills.bundled.enabled=false'" "$ROOT/skills/research/SKILL.md"
grep -Fq -- '--sandbox read-only' "$ROOT/skills/research/SKILL.md"

if grep -qE '^[[:space:]]*codex[[:space:]]+exec[[:space:]]+\\' "$ROOT/skills/code-review/SKILL.md" \
  "$ROOT/skills/research/SKILL.md" "$ROOT/skills/delegate-batch/SKILL.md"; then
  fail 'a skill reintroduced an unwrapped codex exec dispatch command (startup wedge containment, doc-45/T-63/T-75)'
fi
tr '\n\t' '  ' <"$ROOT/skills/code-review/SKILL.md" | \
  grep -qF 'timeout -k 10 3600 codex exec'
tr '\n\t' '  ' <"$ROOT/skills/research/SKILL.md" | \
  grep -qF 'timeout -k 10 3600 codex exec'
tr '\n\t' '  ' <"$ROOT/skills/delegate-batch/SKILL.md" | \
  grep -qF 'timeout -k 10 3600 codex exec'
grep -Fq 'deliberately keeps its MCP servers' "$ROOT/skills/code-review/SKILL.md"
if grep -q 'mcp_servers' "$ROOT/skills/code-review/SKILL.md" \
  "$ROOT/skills/research/SKILL.md"; then
  fail 'a reviewer or researcher dispatch mentions mcp_servers in any spelling (operator kept their MCP, T-75)'
fi
tr '\n\t' '  ' <"$ROOT/skills/research/SKILL.md" | \
  grep -qE 'deliberately keeps +its MCP servers'
grep -Fq 'including 124' "$ROOT/skills/code-review/SKILL.md"

tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'Dispositions +do +not +transfer'
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'Authorization +is +not +alignment'
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'Default +to +the +alignment +brief'
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'answerable +from +the +briefing'
if grep -qE 'entirely obvious and mechanical' "$ROOT/skills/grilling/SKILL.md"; then
  fail 'grilling reintroduced the self-certified skip clause (alignment gate, T-76)'
fi
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'decision +ledger'
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'uncited +decision +is +open'
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE '\*\*decision ledger\*\* —'
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE '\*\*alignment brief\*\* —'
ls "$ROOT"/backlog/decisions/decision-2*.md >/dev/null
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'never +in +the +primary +checkout'
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'opt-out +is +itself +a +disposition'
tr '\n\t' '  ' <"$ROOT/skills/grilling/SKILL.md" | \
  grep -qE 'switches +to +the +record +id +before +Task +finalization'
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | \
  grep -qE 'opt-out +recorded +verbatim'
tr '\n\t' '  ' <"$ROOT/CONCEPTS.md" | \
  grep -qE 'opt-out +recorded +verbatim'

printf 'test-qq-herdr-home: pass\n'
