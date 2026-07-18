#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-dispatch"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
DISPATCH="$ROOT/bin/qq-dispatch"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

brief="$tmp/brief.md"
printf 'bounded assignment\n' >"$brief"
codex_home="$tmp/codex-home"
mkdir -p "$codex_home"
for role in implementer reviewer researcher; do
  ln -s "$ROOT/codex-profiles/qq-$role.config.toml" \
    "$codex_home/qq-$role.config.toml"
done

fake_codex="$tmp/codex"
cat >"$fake_codex" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$FAKE_CODEX_LOG"

output=""
previous=""
for argument in "$@"; do
  if [ "$previous" = -o ]; then
    output="$argument"
    break
  fi
  previous="$argument"
done

case "${FAKE_CODEX_MODE:-done}" in
  done)
    [ -n "$output" ] || exit 65
    printf 'completed artifact\n' >"$output"
    printf 'codex event\n'
    ;;
  empty)
    printf 'codex event without artifact\n'
    ;;
  error)
    printf 'provider failed\n' >&2
    exit 9
    ;;
  wedge)
    sleep 300 &
    child=$!
    printf '%s\n' "$child" >"$FAKE_CHILD_PID"
    wait "$child"
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$fake_codex"

export QQ_CODEX_BIN="$fake_codex"
export FAKE_CODEX_LOG="$tmp/codex.args"
export CODEX_HOME="$codex_home"

run_engine() {
  local expected_exit="$1"
  shift
  set +e
  "$DISPATCH" "$@" >"$tmp/result.json"
  actual_exit=$?
  set -e
  assert_equal "$expected_exit" "$actual_exit" "unexpected qq-dispatch exit"
  jq -e . "$tmp/result.json" >/dev/null
}

# Exit 0: the profile supplies sandbox/Skill settings and the engine supplies
# only the implementer's settled MCP-off override.
export FAKE_CODEX_MODE="done"
run_engine 0 implementer \
  --root "$ROOT" --brief "$brief" --output "$tmp/envelope" \
  --events "$tmp/events" --stderr "$tmp/stderr"
jq -e '
  .status == "done"
  and .state.role == "implementer"
  and .state.profile == "qq-implementer"
  and .state.mcp == "off"
  and .state.codex_exit == 0
' "$tmp/result.json" >/dev/null
python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--profile" in args
assert args[args.index(b"--profile") + 1] == b"qq-implementer"
assert b"mcp_servers={}" in args
assert b"--sandbox" not in args
assert b"skills.include_instructions=false" not in args
PY
assert_file_contains "$tmp/events" 'codex event'

# An implementer can opt into the profile's MCP configuration by omitting the
# default MCP-off override, and the selected mode is observable in state.
run_engine 0 implementer \
  --root "$ROOT" --brief "$brief" --output "$tmp/mcp-envelope" --mcp
jq -e '
  .status == "done"
  and .state.role == "implementer"
  and .state.mcp == "on"
' "$tmp/result.json" >/dev/null
python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"mcp_servers={}" not in args
PY

# Inspect mirrors the same mounted-profile preconditions without spawning.
: >"$FAKE_CODEX_LOG"
run_engine 0 inspect implementer \
  --root "$ROOT" --brief "$brief" --output "$tmp/inspect-output"
[ ! -s "$FAKE_CODEX_LOG" ] || fail 'dispatch inspect started Codex'
jq -e '.status == "done" and .state.role == "implementer"' \
  "$tmp/result.json" >/dev/null

# Reviewer and researcher keep MCP on by omitting the override.
run_engine 0 reviewer \
  --root "$ROOT" --brief "$brief" --output "$tmp/review"
python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args[args.index(b"--profile") + 1] == b"qq-reviewer"
assert b"mcp_servers={}" not in args
PY

# Exit 2: a missing checkout-mounted profile is a rail refusal, not an error.
unlink "$codex_home/qq-researcher.config.toml"
run_engine 2 researcher \
  --root "$ROOT" --brief "$brief" --output "$tmp/research"
jq -e '
  .status == "refused"
  and (.message | contains("not mounted from this checkout"))
  and .state.profile == "qq-researcher"
' "$tmp/result.json" >/dev/null

# Exit 1: malformed input is an error.
run_engine 1 unknown \
  --root "$ROOT" --brief "$brief" --output "$tmp/unknown"
jq -e '.status == "error"' "$tmp/result.json" >/dev/null

# A successful Codex exit cannot reuse a nonempty artifact from an earlier
# attempt: dispatch removes it before launch and retains the empty-artifact error.
stale_output="$tmp/stale-envelope"
printf 'stale completion\n' >"$stale_output"
export FAKE_CODEX_MODE=empty
run_engine 1 implementer \
  --root "$ROOT" --brief "$brief" --output "$stale_output"
jq -e '
  .status == "error"
  and (.message | contains("without a completion artifact"))
' "$tmp/result.json" >/dev/null
[ ! -e "$stale_output" ] || fail 'dispatch retained the stale completion artifact'

# Timeout containment returns engine error 1 (never raw 124) and reaps the
# fake Codex process tree, including its long-running child.
export FAKE_CODEX_MODE=wedge
export FAKE_CHILD_PID="$tmp/child.pid"
run_engine 1 implementer \
  --root "$ROOT" --brief "$brief" --output "$tmp/wedge-output" \
  --events "$tmp/wedge-events" --stderr "$tmp/wedge-stderr" \
  --timeout 0.2
jq -e '
  .status == "error"
  and .state.codex_exit == 124
  and (.message | contains("reaped the process tree"))
' "$tmp/result.json" >/dev/null
child_pid="$(cat "$FAKE_CHILD_PID")"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$child_pid" 2>/dev/null; then
    break
  fi
  sleep 0.05
done
if kill -0 "$child_pid" 2>/dev/null; then
  fail "timeout leaked wedged child process $child_pid"
fi

grep -Fq 'sandbox_mode = "workspace-write"' \
  "$ROOT/codex-profiles/qq-implementer.config.toml"
grep -Fq 'sandbox_mode = "read-only"' \
  "$ROOT/codex-profiles/qq-reviewer.config.toml"
grep -Fq 'include_instructions = false' \
  "$ROOT/codex-profiles/qq-researcher.config.toml"

printf 'test-qq-dispatch: pass\n'
