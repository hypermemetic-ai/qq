#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-dispatch"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
DISPATCH="$ROOT/bin/qq-dispatch"
SUPERVISOR="$ROOT/bin/lib/qq-process-tree-supervisor.py"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

launcher_tmp="$tmp/launcher-tmp"
runtime_root="$launcher_tmp/runtime"
test_home="$tmp/home"
session_root="$launcher_tmp/pi-subagent-sessions"
mkdir -p "$runtime_root" "$test_home/.pi/agent/extensions/subagent"
mkdir -m 700 "$session_root"
printf '{"defaultSessionDir":"%s"}\n' "$session_root" \
  >"$test_home/.pi/agent/extensions/subagent/config.json"
export HOME="$test_home"
export TMPDIR="$launcher_tmp"
export QQ_DISPATCH_RUNTIME_ROOT="$runtime_root"
export PYTHONDONTWRITEBYTECODE=1
unset QQ_DISPATCH_RUN_DIR QQ_DISPATCH_TIMEOUT

[ -x "$DISPATCH" ] || fail "missing dispatcher: $DISPATCH"
[ -x "$SUPERVISOR" ] || fail "missing process-tree supervisor: $SUPERVISOR"
retired_boundary="land"; retired_boundary+="strip"
retired_renderer="$ROOT/bin/lib/qq-render-${retired_boundary}-policy.mjs"
[ ! -e "$retired_renderer" ] || fail "retired renderer remains"
[ ! -e "$ROOT/delegation/policies/roles.json" ] || fail "retired role policy remains"
retired_schema="$ROOT/delegation/manifests/completion-envelope"'.schema.json'
[ ! -e "$retired_schema" ] || fail "retired completion contract remains"
[ -f "$ROOT/delegation/manifests/ENVELOPE.md" ] || fail "missing completion template"
for role in implementer observer researcher reviewer; do
  manifest="$ROOT/delegation/manifests/agents/$role.md"
  assert_file_not_matches "$manifest" '^acceptanceRole:'
  assert_file_contains "$manifest" "\$QQ_DISPATCH_RUN_DIR/ENVELOPE.md"
  assert_equal 1 "$(grep -c '^timeoutMs: 2700000$' "$manifest")" \
    "$role timeout declaration changed"
done

fake_pi_source="$tmp/fake-pi"
cat >"$fake_pi_source" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$FAKE_PI_ARGS"
env | LC_ALL=C sort >"$FAKE_PI_ENV"
: >"$FAKE_PI_MARKER"
git status >/dev/null
printf 'pi-live-event role=%s\n' "${PI_SUBAGENT_CHILD_AGENT:-missing}"
if [[ "${FAKE_WRITE_ENVELOPE:-0}" == 1 ]]; then
  printf '# child result\n' >"$QQ_DISPATCH_RUN_DIR/ENVELOPE.md"
fi
case "${FAKE_PI_MODE:-done}" in
  done) exit "${FAKE_PI_EXIT:-0}" ;;
  wedge)
    sleep 300 &
    child=$!
    printf '%s\n' "$child" >"$FAKE_CHILD_PID"
    wait "$child"
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$fake_pi_source"

fake_observe_source="$tmp/fake-observe"
cat >"$fake_observe_source" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  id)
    case "${2:-}" in
      trace) printf '11111111111111111111111111111111\n' ;;
      span) printf '2222222222222222\n' ;;
      *) exit 64 ;;
    esac
    ;;
  record)
    [[ "${FAKE_OBSERVE_FAIL:-0}" != 1 ]] || exit 1
    printf '%s\n' "$*" >>"$FAKE_OBSERVE_LOG"
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$fake_observe_source"

trusted_paths() {
  # shellcheck disable=SC2016
  node -e '
    const root = process.argv[1] + "/delegation/manifests/agents";
    process.stdout.write(JSON.stringify(Object.fromEntries(
      ["implementer", "observer", "researcher", "reviewer"]
        .map((role) => [role, `${root}/${role}.md`]))));
  ' "$1"
}

stage_surface() {
  local checkout="$1"
  local role
  mkdir -p "$checkout/bin/lib" "$checkout/delegation/manifests/agents"
  cp "$DISPATCH" "$checkout/bin/qq-dispatch"
  cp "$ROOT/bin/lib/qq-bin.sh" "$checkout/bin/lib/qq-bin.sh"
  cp "$SUPERVISOR" "$checkout/bin/lib/qq-process-tree-supervisor.py"
  cp "$fake_pi_source" "$checkout/bin/pi"
  cp "$fake_observe_source" "$checkout/bin/qq-observe"
  chmod +x "$checkout/bin/qq-dispatch" "$checkout/bin/pi" \
    "$checkout/bin/qq-observe" "$checkout/bin/lib/qq-process-tree-supervisor.py"
  for role in implementer observer researcher reviewer; do
    cp "$ROOT/delegation/manifests/agents/$role.md" \
      "$checkout/delegation/manifests/agents/$role.md"
  done
}

primary="$tmp/primary"
linked="$tmp/linked"
external="$tmp/external"
non_git="$tmp/non-git"
git init -q -b main "$primary"
git -C "$primary" -c user.name=test -c user.email=test@example.invalid \
  -c commit.gpgSign=false commit --allow-empty -qm base
git -C "$primary" worktree add -q -b linked-test "$linked"
git init -q -b main "$external"
mkdir "$non_git"
stage_surface "$primary"
stage_surface "$linked"
primary_dispatch="$primary/bin/qq-dispatch"
linked_dispatch="$linked/bin/qq-dispatch"

export FAKE_PI_ARGS="$tmp/pi.args"
export FAKE_PI_ENV="$tmp/pi.env"
export FAKE_PI_MARKER="$tmp/pi.marker"
export FAKE_OBSERVE_LOG="$tmp/observe.log"
: >"$FAKE_OBSERVE_LOG"

DISPATCH_STATUS=0
DISPATCH_STDOUT=""
DISPATCH_STDERR=""
dispatch_case() {
  local label="$1"
  local cwd="$2"
  local adapter="$3"
  local role="$4"
  local run_id="$5"
  local adapter_root
  shift 5
  adapter_root="$(cd "$(dirname "$adapter")/.." && pwd -P)"
  rm -f "$FAKE_PI_ARGS" "$FAKE_PI_ENV" "$FAKE_PI_MARKER"
  DISPATCH_STDOUT="$tmp/$label.stdout"
  DISPATCH_STDERR="$tmp/$label.stderr"
  set +e
  (
    cd "$cwd"
    env -u QQ_DISPATCH_RUN_DIR -u QQ_DISPATCH_TIMEOUT \
      PI_SUBAGENT_CHILD_AGENT="$role" \
      PI_SUBAGENT_RUN_ID="$run_id" \
      PI_SUBAGENT_CHILD_INDEX=2 \
      PI_SUBAGENT_TRUSTED_AGENT_PATHS="$(trusted_paths "$adapter_root")" \
      "$@" "$adapter" --json --model smoke/model
  ) >"$DISPATCH_STDOUT" 2>"$DISPATCH_STDERR"
  DISPATCH_STATUS=$?
  set -e
}

new_run_dir() {
  local path="$runtime_root/$1"
  mkdir -m 700 "$path"
  printf '%s\n' "$path"
}

# An owner-created directory already containing its brief is used in place.
owner_run="$(new_run_dir owner-success)"
printf '# bounded work order\n' >"$owner_run/BRIEF.md"
mkdir -p "$test_home/.pi/agent"
printf '{"token":"test-only"}\n' >"$test_home/.pi/agent/auth.json"
dispatch_case owner-success "$primary" "$primary_dispatch" implementer owner-success \
  QQ_DISPATCH_RUN_DIR="$owner_run" FAKE_WRITE_ENVELOPE=1
[[ "$DISPATCH_STATUS" -eq 0 ]] || cat "$DISPATCH_STDERR" >&2
assert_equal 0 "$DISPATCH_STATUS" "owner-created run dispatch failed"
assert_file_contains "$DISPATCH_STDOUT" 'pi-live-event role=implementer'
assert_file_contains "$DISPATCH_STDERR" 'boundary=git-worktree'
[ -f "$owner_run/BRIEF.md" ] || fail "owner brief disappeared"
[ -f "$owner_run/ENVELOPE.md" ] || fail "child result was not written in the run directory"
[ "$(stat -c %a "$owner_run/cache")" = 700 ] || fail "cache directory is not mode 700"
[ "$(stat -c %a "$owner_run/pi-config/auth.json")" = 600 ] || fail "staged auth is not mode 600"
grep -Fxq "QQ_DISPATCH_RUN_DIR=$owner_run" "$FAKE_PI_ENV" || fail "child received the wrong run directory"
grep -Fxq "XDG_CACHE_HOME=$owner_run/cache" "$FAKE_PI_ENV" || fail "cache was not redirected"
grep -Fxq "TMPDIR=$launcher_tmp" "$FAKE_PI_ENV" || fail "child did not inherit its normal temp directory"
if grep -q '^QQ_DISPATCH_POLICY' "$FAKE_PI_ENV"; then
  fail "child inherited a retired policy identity"
fi
python3 - "$FAKE_PI_ARGS" <<'PY'
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args == [b"--approve", b"--offline", b"--json", b"--model", b"smoke/model", b""], args
PY
jq -e '
  .schema == "qq-run-terminal" and .version == 1
  and .run_id == "owner-success" and .agent == "implementer"
  and .exit_code == 0 and (.ended_at | test("Z$"))
' "$owner_run/TERMINAL" >/dev/null

# The adapter still mints a private run when no owner directory is supplied.
dispatch_case minted "$primary" "$primary_dispatch" reviewer minted-run
assert_equal 0 "$DISPATCH_STATUS" "adapter-minted run dispatch failed"
minted_run="$(sed -n 's/^QQ_DISPATCH_RUN_DIR=//p' "$FAKE_PI_ENV")"
case "$minted_run" in "$runtime_root"/*) ;; *) fail "minted run escaped the runtime root" ;; esac
[ "$(stat -c %a "$minted_run")" = 700 ] || fail "minted run is not mode 700"
jq -e '.run_id == "minted-run" and .exit_code == 0' "$minted_run/TERMINAL" >/dev/null

# A nonzero child status is preserved and receives the same durable terminal record.
failure_run="$(new_run_dir child-failure)"
dispatch_case child-failure "$primary" "$primary_dispatch" reviewer child-failure \
  QQ_DISPATCH_RUN_DIR="$failure_run" FAKE_PI_EXIT=23
assert_equal 23 "$DISPATCH_STATUS" "child failure status was not preserved"
jq -e '.agent == "reviewer" and .exit_code == 23' "$failure_run/TERMINAL" >/dev/null

# The removed capture channel is not read, even when its inherited value is unusable.
capture_var=PI_SUBAGENT_STRUCTURED
capture_var+=_OUTPUT_CAPTURE
ignored_run="$(new_run_dir ignored-channel)"
dispatch_case ignored-channel "$primary" "$primary_dispatch" observer ignored-channel \
  QQ_DISPATCH_RUN_DIR="$ignored_run" "$capture_var=$tmp/does-not-exist/result"
assert_equal 0 "$DISPATCH_STATUS" "ignored result channel affected dispatch"

assert_owner_refusal() {
  local label="$1"
  local path="$2"
  local message="$3"
  dispatch_case "$label" "$primary" "$primary_dispatch" reviewer "$label" \
    QQ_DISPATCH_RUN_DIR="$path"
  assert_equal 68 "$DISPATCH_STATUS" "$label did not exit 68"
  assert_file_contains "$DISPATCH_STDERR" "$message"
  [ ! -e "$FAKE_PI_MARKER" ] || fail "$label launched Pi"
}

symlink_target="$(new_run_dir symlink-target)"
symlink_run="$runtime_root/symlink-run"
ln -s "$symlink_target" "$symlink_run"
assert_owner_refusal run-symlink "$symlink_run" 'may not be a symlink'
loose_run="$(new_run_dir loose-run)"
chmod 755 "$loose_run"
assert_owner_refusal run-loose "$loose_run" 'must be mode 700'
foreign_run="$launcher_tmp/foreign-run"
mkdir -m 700 "$foreign_run"
assert_owner_refusal run-foreign "$foreign_run" 'must stay beneath the runtime root'
unexpected_run="$(new_run_dir unexpected-run)"
: >"$unexpected_run/extra"
assert_owner_refusal run-unexpected "$unexpected_run" 'contains unexpected entry'

# Every shipped role passes the declared-tool inventory check.
for role in implementer observer researcher reviewer; do
  dispatch_case "role-$role" "$primary" "$primary_dispatch" "$role" "role-$role"
  assert_equal 0 "$DISPATCH_STATUS" "$role manifest failed startup validation"
done

# A canonical manifest naming a tool outside the adapter inventory refuses at startup.
reviewer_manifest="$primary/delegation/manifests/agents/reviewer.md"
cp "$reviewer_manifest" "$tmp/reviewer.manifest"
sed -i 's/^tools:.*/tools: read, unavailable-test-tool/' "$reviewer_manifest"
dispatch_case unavailable-tool "$primary" "$primary_dispatch" reviewer unavailable-tool
assert_equal 66 "$DISPATCH_STATUS" "unavailable tool did not exit 66"
assert_file_contains "$DISPATCH_STDERR" "declares unavailable tool 'unavailable-test-tool'"
[ ! -e "$FAKE_PI_MARKER" ] || fail "unavailable tool launched Pi"
cp "$tmp/reviewer.manifest" "$reviewer_manifest"

# An extension-provided tool without its providing extension refuses at startup.
researcher_manifest="$primary/delegation/manifests/agents/researcher.md"
cp "$researcher_manifest" "$tmp/researcher.manifest"
sed -i '/^subagentOnlyExtensions:/d' "$researcher_manifest"
dispatch_case unpaired-context7 "$primary" "$primary_dispatch" researcher unpaired-context7
assert_equal 66 "$DISPATCH_STATUS" "unpaired Context7 tool did not exit 66"
assert_file_contains "$DISPATCH_STDERR" "declares unavailable tool 'resolve-library-id'"
[ ! -e "$FAKE_PI_MARKER" ] || fail "unpaired Context7 tool launched Pi"
cp "$tmp/researcher.manifest" "$researcher_manifest"

# Trusted role selection remains exact and fail closed.
dispatch_case trusted-missing "$primary" "$primary_dispatch" reviewer trusted-missing \
  PI_SUBAGENT_TRUSTED_AGENT_PATHS=
assert_equal 71 "$DISPATCH_STATUS" "missing trusted map did not exit 71"
assert_file_contains "$DISPATCH_STDERR" 'PI_SUBAGENT_TRUSTED_AGENT_PATHS is required'
bad_paths="$(trusted_paths "$ROOT")"
dispatch_case trusted-mismatch "$primary" "$primary_dispatch" reviewer trusted-mismatch \
  PI_SUBAGENT_TRUSTED_AGENT_PATHS="$bad_paths"
assert_equal 71 "$DISPATCH_STATUS" "mismatched trusted path did not exit 71"
assert_file_contains "$DISPATCH_STDERR" 'does not match the canonical path'
rm "$reviewer_manifest"
ln -s "$ROOT/delegation/manifests/agents/reviewer.md" "$reviewer_manifest"
dispatch_case trusted-symlink "$primary" "$primary_dispatch" reviewer trusted-symlink
assert_equal 71 "$DISPATCH_STATUS" "symlinked manifest did not exit 71"
assert_file_contains "$DISPATCH_STDERR" 'is unsafe or unavailable'
rm "$reviewer_manifest"
cp "$tmp/reviewer.manifest" "$reviewer_manifest"

# Manifest timeout is the default; the explicit dispatch timeout takes precedence.
real_timeout="$(command -v timeout)"
timeout_probe="$tmp/timeout-probe"
cat >"$timeout_probe" <<'SH'
#!/usr/bin/env bash
printf '%s\0' "$@" >"$TIMEOUT_PROBE_ARGS"
exec "$REAL_TIMEOUT" "$@"
SH
chmod +x "$timeout_probe"
dispatch_case timeout-manifest "$primary" "$primary_dispatch" reviewer timeout-manifest \
  QQ_TIMEOUT_BIN="$timeout_probe" REAL_TIMEOUT="$real_timeout" TIMEOUT_PROBE_ARGS="$tmp/timeout.args"
assert_equal 0 "$DISPATCH_STATUS" "manifest timeout dispatch failed"
python3 - "$tmp/timeout.args" <<'PY'
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args[:4] == [b"-k", b"10", b"--signal=TERM", b"2700s"], args
PY
dispatch_case timeout-override "$primary" "$primary_dispatch" reviewer timeout-override \
  QQ_TIMEOUT_BIN="$timeout_probe" REAL_TIMEOUT="$real_timeout" TIMEOUT_PROBE_ARGS="$tmp/timeout.args" \
  QQ_DISPATCH_TIMEOUT=1.25s
assert_equal 0 "$DISPATCH_STATUS" "explicit timeout dispatch failed"
python3 - "$tmp/timeout.args" <<'PY'
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args[:4] == [b"-k", b"10", b"--signal=TERM", b"1.25s"], args
PY

# Authentication copy errors and unsafe session-root configuration refuse before launch.
fail_bin="$tmp/fail-bin"
mkdir "$fail_bin"
printf '#!/usr/bin/env bash\nexit 1\n' >"$fail_bin/cp"
chmod +x "$fail_bin/cp"
auth_refusal_run="$(new_run_dir auth-refusal)"
dispatch_case auth-refusal "$primary" "$primary_dispatch" reviewer auth-refusal \
  QQ_DISPATCH_RUN_DIR="$auth_refusal_run" PATH="$fail_bin:$PATH"
assert_equal 68 "$DISPATCH_STATUS" "auth staging failure did not exit 68"
assert_file_contains "$DISPATCH_STDERR" 'cannot stage Pi authentication'
[ ! -e "$FAKE_PI_MARKER" ] || fail "auth staging failure launched Pi"
chmod 755 "$session_root"
session_mode_run="$(new_run_dir session-mode)"
dispatch_case session-mode "$primary" "$primary_dispatch" reviewer session-mode \
  QQ_DISPATCH_RUN_DIR="$session_mode_run"
assert_equal 68 "$DISPATCH_STATUS" "loose session root did not exit 68"
assert_file_contains "$DISPATCH_STDERR" 'must be mode 700'
chmod 700 "$session_root"
rm "$test_home/.pi/agent/extensions/subagent/config.json"
session_config_run="$(new_run_dir session-config)"
dispatch_case session-config "$primary" "$primary_dispatch" reviewer session-config \
  QQ_DISPATCH_RUN_DIR="$session_config_run"
assert_equal 68 "$DISPATCH_STATUS" "missing session config did not exit 68"
assert_file_contains "$DISPATCH_STDERR" 'defaultSessionDir is not configured'
printf '{"defaultSessionDir":"%s"}\n' "$session_root" \
  >"$test_home/.pi/agent/extensions/subagent/config.json"

# Canonical and linked adapters retain the global/same-common-directory matrix.
dispatch_case primary-external "$external" "$primary_dispatch" implementer primary-external
assert_equal 0 "$DISPATCH_STATUS" "canonical adapter refused an external Repository"
grep -Fxq "QQ_DISPATCH_WORKTREE=$external" "$FAKE_PI_ENV" || fail "canonical adapter selected the wrong Repository"
dispatch_case primary-linked "$linked" "$primary_dispatch" implementer primary-linked
assert_equal 0 "$DISPATCH_STATUS" "canonical adapter refused its linked worktree"
linked_common="$(realpath -e "$(git -C "$linked" rev-parse --path-format=absolute --git-common-dir)")"
linked_git_dir="$(realpath -e "$(git -C "$linked" rev-parse --path-format=absolute --git-dir)")"
grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$linked_common" "$FAKE_PI_ENV" || fail "shared Git directory was not exported"
grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$linked_git_dir" "$FAKE_PI_ENV" || fail "worktree Git directory was not exported"
dispatch_case linked-own "$linked" "$linked_dispatch" reviewer linked-own
assert_equal 0 "$DISPATCH_STATUS" "linked adapter refused its own common directory"
dispatch_case linked-external "$external" "$linked_dispatch" reviewer linked-external
assert_equal 65 "$DISPATCH_STATUS" "linked adapter served an external Repository"
assert_file_contains "$DISPATCH_STDERR" 'non-primary adapter may not serve an external repository'
dispatch_case non-git "$non_git" "$primary_dispatch" reviewer non-git
assert_equal 65 "$DISPATCH_STATUS" "non-Git cwd did not exit 65"
assert_file_contains "$DISPATCH_STDERR" 'child cwd is not a Git worktree'

# Trace context and a complete invocation span cross the adapter seam.
trace_run="$(new_run_dir trace-run)"
dispatch_case trace "$primary" "$primary_dispatch" reviewer trace-run \
  QQ_DISPATCH_RUN_DIR="$trace_run" \
  QQ_TRACE_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  PI_ROOT_SPAN_ID=bbbbbbbbbbbbbbbb PI_PARENT_SPAN_ID=cccccccccccccccc
assert_equal 0 "$DISPATCH_STATUS" "traced dispatch failed"
grep -Fxq 'QQ_TRACE_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$FAKE_PI_ENV" || fail "trace ID did not reach child"
grep -F -- '--name invoke_agent' "$FAKE_OBSERVE_LOG" >/dev/null || fail "invocation span was not recorded"
grep -F -- '--phase review' "$FAKE_OBSERVE_LOG" >/dev/null || fail "span phase was not recorded"
grep -F -- 'run.id=trace-run' "$FAKE_OBSERVE_LOG" >/dev/null || fail "span run ID was not recorded"
observe_failure_run="$(new_run_dir observe-failure)"
dispatch_case observe-failure "$primary" "$primary_dispatch" reviewer observe-failure \
  QQ_DISPATCH_RUN_DIR="$observe_failure_run" FAKE_OBSERVE_FAIL=1
assert_equal 0 "$DISPATCH_STATUS" "observation failure changed child success"
assert_file_contains "$DISPATCH_STDERR" 'observation write failed; dispatch result preserved'

# Timeout preserves status, records terminal state, and reaps the wedged tree.
timeout_run="$(new_run_dir timeout-run)"
child_pid_file="$tmp/wedged-child.pid"
dispatch_case timeout-tree "$primary" "$primary_dispatch" implementer timeout-tree \
  QQ_DISPATCH_RUN_DIR="$timeout_run" QQ_DISPATCH_TIMEOUT=0.3s \
  FAKE_PI_MODE=wedge FAKE_CHILD_PID="$child_pid_file"
assert_equal 124 "$DISPATCH_STATUS" "timeout status was not preserved"
[ -s "$child_pid_file" ] || fail "wedged child was not announced"
child_pid="$(cat "$child_pid_file")"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 "$child_pid" 2>/dev/null || break
  sleep 0.05
done
if kill -0 "$child_pid" 2>/dev/null; then
  fail "process-tree supervisor leaked descendant $child_pid"
fi
jq -e '.run_id == "timeout-tree" and .exit_code == 124' "$timeout_run/TERMINAL" >/dev/null

grep -Fq "$retired_boundary" "$DISPATCH" && fail "dispatcher still names the retired boundary"
printf 'test-qq-dispatch: pass\n'
