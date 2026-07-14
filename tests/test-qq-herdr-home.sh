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

grep -Fq "qq-herdr-home\" \"\$HOME/.local/bin/qq-herdr-home\"" "$ROOT/bin/install.sh"
tr '\n\t' '  ' <"$ROOT/skills/deliver-change/SKILL.md" | grep -qE -- '--workspace +<home-workspace-id>'
test "$(grep -o -- '--label "<change-label>"' "$ROOT/skills/deliver-change/SKILL.md" | wc -l)" -eq 2
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/CONCEPTS.md"
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/cockpit/README.md"
grep -Fq '[A-Za-z0-9-]{1,15}' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'unique among work sessions under' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq ".label\` equal to \`<change-label>" "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq 'qq-herdr-home focus-board --repo <root>' "$ROOT/skills/deliver-change/SKILL.md"
grep -Fq -- 'herdr agent start <name> --workspace <id> --tab <owning-tab-id> --cwd <path> --split right --no-focus -- <argv...>' \
  "$ROOT/skills/agent-messaging/SKILL.md"
grep -Fq -- 'herdr agent wait <name> --status idle' \
  "$ROOT/skills/agent-messaging/SKILL.md"
grep -Fq -- "\`agent-messaging\`'s canonical temporary-delegate procedure" \
  "$ROOT/skills/code-review/SKILL.md"
grep -Fq -- "\`agent-messaging\`'s canonical temporary-delegate procedure" \
  "$ROOT/skills/research/SKILL.md"

printf 'test-qq-herdr-home: pass\n'
