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

primary_repo="$tmp/repositories/primary"
linked_worktree="$tmp/worktrees/linked"
non_git_root="$tmp/non-git-root"
mkdir -p "$(dirname "$primary_repo")" "$(dirname "$linked_worktree")" \
  "$non_git_root"
git init -q "$primary_repo"
git -C "$primary_repo" \
  -c user.name='qq dispatch test' \
  -c user.email='qq-dispatch@example.invalid' \
  -c commit.gpgSign=false \
  commit --allow-empty -qm 'dispatch test base'
git -C "$primary_repo" worktree add -q -b dispatch-test-linked \
  "$linked_worktree"

linked_common_dir="$(
  git -C "$linked_worktree" rev-parse \
    --path-format=absolute --git-common-dir
)"
linked_git_dir="$(
  git -C "$linked_worktree" rev-parse --path-format=absolute --git-dir
)"
primary_common_dir="$(
  git -C "$primary_repo" rev-parse --path-format=absolute --git-common-dir
)"
primary_git_dir="$(
  git -C "$primary_repo" rev-parse --path-format=absolute --git-dir
)"
[ "$linked_common_dir" != "$linked_git_dir" ] \
  || fail 'linked-worktree fixture did not produce distinct Git directories'
assert_equal "$primary_common_dir" "$primary_git_dir" \
  'primary-checkout fixture produced distinct Git directories'

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

# A linked-worktree implementer receives both distinct Git metadata roots,
# and inspect reports the same ordered pair without spawning Codex.
: >"$FAKE_CODEX_LOG"
run_engine 0 inspect implementer \
  --root "$linked_worktree" --brief "$brief" \
  --output "$tmp/linked-inspect-output"
[ ! -s "$FAKE_CODEX_LOG" ] || fail 'linked-worktree inspect started Codex'
jq -e \
  --arg common_dir "$linked_common_dir" \
  --arg git_dir "$linked_git_dir" \
  '.state.writable_roots == [$common_dir, $git_dir]' \
  "$tmp/result.json" >/dev/null
run_engine 0 implementer \
  --root "$linked_worktree" --brief "$brief" \
  --output "$tmp/linked-envelope"
python3 - "$FAKE_CODEX_LOG" "$linked_common_dir" "$linked_git_dir" <<'PY'
import os
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
add_dirs = [
    args[index + 1]
    for index, argument in enumerate(args[:-1])
    if argument == b"--add-dir"
]
assert add_dirs == [os.fsencode(sys.argv[2]), os.fsencode(sys.argv[3])]
PY

# A primary checkout deduplicates its equal common and per-checkout Git dirs.
: >"$FAKE_CODEX_LOG"
run_engine 0 inspect implementer \
  --root "$primary_repo" --brief "$brief" \
  --output "$tmp/primary-inspect-output"
[ ! -s "$FAKE_CODEX_LOG" ] || fail 'primary-checkout inspect started Codex'
jq -e \
  --arg common_dir "$primary_common_dir" \
  '.state.writable_roots == [$common_dir]' \
  "$tmp/result.json" >/dev/null
run_engine 0 implementer \
  --root "$primary_repo" --brief "$brief" \
  --output "$tmp/primary-envelope"
python3 - "$FAKE_CODEX_LOG" "$primary_common_dir" <<'PY'
import os
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
add_dirs = [
    args[index + 1]
    for index, argument in enumerate(args[:-1])
    if argument == b"--add-dir"
]
assert add_dirs == [os.fsencode(sys.argv[2])]
PY

# A non-Git root preserves skip-git-repo-check behavior without extra grants.
: >"$FAKE_CODEX_LOG"
run_engine 0 inspect implementer \
  --root "$non_git_root" --brief "$brief" \
  --output "$tmp/non-git-inspect-output"
[ ! -s "$FAKE_CODEX_LOG" ] || fail 'non-Git inspect started Codex'
jq -e '.state.writable_roots == []' "$tmp/result.json" >/dev/null
run_engine 0 implementer \
  --root "$non_git_root" --brief "$brief" \
  --output "$tmp/non-git-envelope"
python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--add-dir" not in args
PY

# Inherited Git repository selection cannot turn a non-Git root into a grant.
: >"$FAKE_CODEX_LOG"
(
  export GIT_DIR="$primary_repo/.git"
  run_engine 0 implementer \
    --root "$non_git_root" --brief "$brief" \
    --output "$tmp/non-git-env-leak-envelope"
)
jq -e '.state.writable_roots == []' "$tmp/result.json" >/dev/null
python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--add-dir" not in args
PY

# Read-only roles receive and report no writable roots, even for a worktree.
for read_only_role in reviewer researcher; do
  : >"$FAKE_CODEX_LOG"
  run_engine 0 inspect "$read_only_role" \
    --root "$linked_worktree" --brief "$brief" \
    --output "$tmp/$read_only_role-inspect-output"
  [ ! -s "$FAKE_CODEX_LOG" ] \
    || fail "$read_only_role worktree inspect started Codex"
  jq -e \
    --arg role "$read_only_role" \
    '.state.role == $role and .state.writable_roots == []' \
    "$tmp/result.json" >/dev/null
  run_engine 0 "$read_only_role" \
    --root "$linked_worktree" --brief "$brief" \
    --output "$tmp/$read_only_role-worktree-output"
  python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--add-dir" not in args
PY
done

# Read-only roles do not resolve Git, while implementer dispatch still requires
# it. Each invalid override is scoped so it cannot leak into later assertions.
invalid_git="$tmp/missing-git"
for read_only_role in reviewer researcher; do
  : >"$FAKE_CODEX_LOG"
  (
    export QQ_GIT_BIN="$invalid_git"
    run_engine 0 inspect "$read_only_role" \
      --root "$linked_worktree" --brief "$brief" \
      --output "$tmp/$read_only_role-no-git-inspect-output"
    [ ! -s "$FAKE_CODEX_LOG" ] \
      || fail "$read_only_role no-Git inspect started Codex"
    jq -e \
      --arg role "$read_only_role" \
      '.state.role == $role and .state.writable_roots == []' \
      "$tmp/result.json" >/dev/null
    run_engine 0 "$read_only_role" \
      --root "$linked_worktree" --brief "$brief" \
      --output "$tmp/$read_only_role-no-git-output"
    jq -e \
      --arg role "$read_only_role" \
      '.state.role == $role and .state.writable_roots == []' \
      "$tmp/result.json" >/dev/null
  )
  python3 - "$FAKE_CODEX_LOG" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--add-dir" not in args
PY
done

: >"$FAKE_CODEX_LOG"
(
  export QQ_GIT_BIN="$invalid_git"
  run_engine 1 implementer \
    --root "$linked_worktree" --brief "$brief" \
    --output "$tmp/implementer-no-git-output"
)
jq -e '
  .status == "error"
  and (.message | contains("QQ_GIT_BIN must be an absolute executable file"))
' "$tmp/result.json" >/dev/null
[ ! -s "$FAKE_CODEX_LOG" ] || fail 'no-Git implementer started Codex'

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
