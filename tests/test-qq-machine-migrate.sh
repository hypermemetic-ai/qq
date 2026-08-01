#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-machine-migrate"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
MIGRATE="$(cd "$TESTS_DIR/.." && pwd -P)/bin/qq-machine-migrate"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

home="$tmp/home"
state="$home/.local/state"
manifest="$tmp/manifest.json"
fake_herdr="$tmp/herdr"
fake_rsync="$tmp/rsync"
rsync_log="$tmp/rsync.log"
herdr_log="$tmp/herdr.log"
pi_session="$home/.pi/agent/sessions/project/pi-session.jsonl"
codex_id="019fab70-cd00-7ac0-a226-848e5b4fa0dd"
codex_session="$home/.codex/sessions/2026/08/01/rollout-$codex_id.jsonl"

mkdir -p "$(dirname "$pi_session")" "$(dirname "$codex_session")" \
  "$home/.codex/archived_sessions" "$home/.ssh"
printf '{"pi":true}\n' >"$pi_session"
printf '{"codex":true}\n' >"$codex_session"
printf 'keep-target-access\n' >"$home/.ssh/authorized_keys"

cat >"$manifest" <<EOF
{
  "schema": "qq.machine-migration",
  "schema_version": 1,
  "required_home": "$home",
  "versioned_roots": [
    {"path": "machine", "class": "git", "reason": "test"}
  ],
  "repositories": [],
  "exact_roots": [
    {"path": ".pi", "class": "private", "reason": "test"},
    {"path": ".codex", "class": "private", "reason": "test"},
    {"path": ".ssh", "class": "credential", "reason": "test"}
  ],
  "session_roots": [".pi/agent/sessions", ".codex/sessions", ".codex/archived_sessions"],
  "config_links": [
    {"source": "machine/npm-globals.txt", "target": ".config/qq/npm-globals.txt"}
  ],
  "rsync_excludes": [".ssh/authorized_keys"]
}
EOF

cat >"$fake_herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "${FAKE_HERDR_DOWN:-}" != 1 ] || exit 1
[ -z "${FAKE_HERDR_LOG:-}" ] || printf '%s\n' "$*" >>"$FAKE_HERDR_LOG"
if [ "${FAKE_APPLY:-}" = 1 ]; then
  case "${1:-} ${2:-}" in
    "api snapshot")
      printf '{"result":{"snapshot":{"workspaces":[],"tabs":[],"panes":[]}}}\n'
      ;;
    "workspace create")
      printf '{"result":{"workspace":{"workspace_id":"w-restored","active_tab_id":"t-restored-1"}}}\n'
      ;;
    "tab create")
      printf '{"result":{"tab":{"tab_id":"t-restored-2"}}}\n'
      ;;
    "pane list")
      printf '{"result":{"panes":[{"tab_id":"t-restored-1","pane_id":"p-restored-1"},{"tab_id":"t-restored-2","pane_id":"p-restored-2"}]}}\n'
      ;;
    "agent start"|"tab rename"|"tab focus"|"workspace focus"|"pane run")
      printf '{"result":{"type":"ok"}}\n'
      ;;
    *) exit 2 ;;
  esac
  exit 0
fi
[ "${1:-} ${2:-}" = "api snapshot" ] || exit 2
python3 - "$FAKE_HOME" "$FAKE_CODEX_ID" <<'PY'
import json
import sys
home, codex_id = sys.argv[1:]
pi_session = home + "/.pi/agent/sessions/project/pi-session.jsonl"
print(json.dumps({
    "result": {"snapshot": {
        "focused_workspace_id": "w1",
        "focused_tab_id": "t2",
        "workspaces": [{
            "workspace_id": "w1", "number": 1, "label": "~", "active_tab_id": "t2",
            "worktree": None,
        }],
        "tabs": [
            {"workspace_id": "w1", "tab_id": "t1", "number": 1, "label": "pi"},
            {"workspace_id": "w1", "tab_id": "t2", "number": 2, "label": "codex"},
        ],
        "panes": [
            {
                "workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "cwd": home,
                "agent": "pi", "agent_session": {"agent": "pi", "kind": "path", "value": pi_session},
            },
            {
                "workspace_id": "w1", "tab_id": "t2", "pane_id": "p2", "cwd": home,
                "agent": "codex", "agent_session": {"agent": "codex", "kind": "id", "value": codex_id},
            },
        ],
    }}
}))
PY
SH
chmod +x "$fake_herdr"

cat >"$fake_rsync" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >"$FAKE_RSYNC_LOG"
SH
chmod +x "$fake_rsync"

export FAKE_HOME="$home" FAKE_CODEX_ID="$codex_id" FAKE_RSYNC_LOG="$rsync_log"
config_preview="$("$MIGRATE" --manifest "$manifest" install-config --home "$home")"
assert_contains "$config_preview" "missing   $home/.config/qq/npm-globals.txt"
"$MIGRATE" --manifest "$manifest" install-config --home "$home" --apply >/dev/null
assert_equal "$(cd "$TESTS_DIR/.." && pwd -P)/machine/npm-globals.txt" \
  "$(readlink "$home/.config/qq/npm-globals.txt")"

capture="$(
  XDG_STATE_HOME="$state" QQ_MACHINE_HERDR="$fake_herdr" \
    "$MIGRATE" --manifest "$manifest" capture --home "$home"
)"
[ -d "$capture" ] || fail "capture directory was not created"
assert_equal 700 "$(stat -c %a "$capture")"
assert_equal 600 "$(stat -c %a "$capture/open-cockpit.json")"
assert_file_contains "$capture/capture.json" '"phase": "live"'

output="$("$MIGRATE" verify "$capture" --home "$home")"
assert_contains "$output" 'verified 2 session files'
assert_contains "$output" '2 open tabs'
assert_contains "$output" '(~=2)'

plan="$("$MIGRATE" restore-layout "$capture" --home "$home")"
assert_contains "$plan" "kind=pi session=$pi_session"
assert_contains "$plan" "kind=codex session=$codex_id"
FAKE_APPLY=1 FAKE_HERDR_LOG="$herdr_log" QQ_MACHINE_HERDR="$fake_herdr" \
  "$MIGRATE" restore-layout "$capture" --home "$home" --apply >/dev/null
assert_file_contains "$herdr_log" "agent start restored-pi-0 --kind pi --pane p-restored-1 -- --session $pi_session"
assert_file_contains "$herdr_log" "agent start restored-codex-1 --kind codex --pane p-restored-2 -- resume $codex_id"
assert_file_contains "$herdr_log" 'tab focus t-restored-2'

QQ_MACHINE_RSYNC="$fake_rsync" "$MIGRATE" sync "$capture" "$(basename "$home")@thinkcentre.local" \
  --phase warm --home "$home" --dry-run
assert_file_contains "$rsync_log" '--dry-run'
assert_file_contains "$rsync_log" '--exclude'
assert_file_contains "$rsync_log" '/.ssh/authorized_keys'
assert_file_contains "$rsync_log" "$home/./.pi"
assert_file_contains "$rsync_log" "$(basename "$home")@thinkcentre.local:$home/"
if QQ_MACHINE_RSYNC="$fake_rsync" "$MIGRATE" sync "$capture" "$(basename "$home")@localhost" \
  --phase warm --home "$home" --dry-run >/dev/null 2>&1; then
  fail "sync accepted the local machine as its target"
fi

if QQ_MACHINE_RSYNC="$fake_rsync" "$MIGRATE" sync "$capture" "$(basename "$home")@thinkcentre.local" \
  --phase final --home "$home" --dry-run >/dev/null 2>&1; then
  fail "final sync accepted a live capture"
fi

final_capture="$(
  XDG_STATE_HOME="$state" FAKE_HERDR_DOWN=1 QQ_MACHINE_HERDR="$fake_herdr" \
    "$MIGRATE" --manifest "$manifest" capture --home "$home" --topology-from "$capture"
)"
assert_file_contains "$final_capture/capture.json" '"phase": "quiesced"'
QQ_MACHINE_RSYNC="$fake_rsync" "$MIGRATE" sync "$final_capture" "$(basename "$home")@thinkcentre.local" \
  --phase final --home "$home" --dry-run

printf 'tampered\n' >>"$pi_session"
if "$MIGRATE" verify "$capture" --home "$home" >/dev/null 2>&1; then
  fail "verify accepted a changed session file"
fi

printf 'test-qq-machine-migrate: pass\n'
