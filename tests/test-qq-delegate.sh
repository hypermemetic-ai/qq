#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-delegate"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
ENGINE="$ROOT/bin/qq-delegate"
SUPERVISOR="$ROOT/bin/lib/qq-process-tree-supervisor.py"
SERVICE_EXTENSION="$ROOT/delegation/extensions/qq-service-class.ts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

launcher_tmp="$tmp/launcher-tmp"
runtime_root="$tmp/state/qq/delegate"
test_home="$tmp/home"
mkdir -p "$runtime_root" "$launcher_tmp" "$test_home/.pi/agent"
chmod 700 "$runtime_root" "$test_home"
printf '{"token":"delegate-test"}\n' >"$test_home/.pi/agent/auth.json"
chmod 600 "$test_home/.pi/agent/auth.json"
context7="$test_home/.pi/agent/npm/node_modules/@upstash/context7-pi/extensions/context7.ts"
mkdir -p "$(dirname "$context7")"
printf '// fixture Context7 extension\n' >"$context7"

export HOME="$test_home"
export TMPDIR="$launcher_tmp"
export QQ_DISPATCH_RUNTIME_ROOT="$runtime_root"
export PYTHONDONTWRITEBYTECODE=1
unset QQ_DISPATCH_RUN_DIR QQ_DISPATCH_TIMEOUT CONTEXT7_API_KEY PI_SUBAGENT_PARENT_SESSION HERDR_PANE_ID

[ -x "$ENGINE" ] || fail "missing engine: $ENGINE"
[ -x "$SUPERVISOR" ] || fail "missing process-tree supervisor: $SUPERVISOR"
[ -f "$SERVICE_EXTENSION" ] || fail "missing delegate service-class extension: $SERVICE_EXTENSION"

fake_pi="$tmp/fake-pi"
cat >"$fake_pi" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$QQ_DISPATCH_RUN_DIR/argv.nul"
env | LC_ALL=C sort >"$QQ_DISPATCH_RUN_DIR/child.env"
if [[ -n "${QQ_DELEGATE_TEST_PID_LOG:-}" ]]; then
  printf '%s\n' "$$" >>"$QQ_DELEGATE_TEST_PID_LOG"
fi
printf '{"event":"fixture-output"}\n'
printf 'fixture-stderr\n' >&2
mkdir -p "$PI_CODING_AGENT_SESSION_DIR/nested"
printf '{"type":"session"}\n' >"$PI_CODING_AGENT_SESSION_DIR/nested/child.jsonl"
printf '# completion envelope\n' >"$QQ_DISPATCH_RUN_DIR/ENVELOPE.md"
brief="$QQ_DISPATCH_RUN_DIR/BRIEF.md"
if grep -q '^sleep=' "$brief"; then
  sleep "$(sed -n 's/^sleep=//p' "$brief" | head -n1)"
fi
if grep -q '^wedge=1$' "$brief"; then
  sleep 300 &
  child=$!
  printf '%s\n' "$child" >"$QQ_DISPATCH_RUN_DIR/stub-child.pid"
  wait "$child"
fi
exit_code="$(sed -n 's/^exit=//p' "$brief" | head -n1)"
exit "${exit_code:-0}"
SH
chmod +x "$fake_pi"

fixture="$tmp/fixture"
mkdir -p "$fixture/bin/lib" "$fixture/delegation/manifests/agents" \
  "$fixture/delegation/policies" "$fixture/delegation/extensions"
git init -q -b main "$fixture"
git -C "$fixture" -c user.name=test -c user.email=test@example.invalid \
  -c commit.gpgSign=false commit --allow-empty -qm base
cp "$ENGINE" "$fixture/bin/qq-delegate"
cp "$SUPERVISOR" "$fixture/bin/lib/qq-process-tree-supervisor.py"
cp "$fake_pi" "$fixture/bin/pi"
cp "$ROOT"/delegation/manifests/agents/*.md "$fixture/delegation/manifests/agents/"
cp "$ROOT/delegation/policies/execution-profiles.json" \
  "$fixture/delegation/policies/execution-profiles.json"
cp "$SERVICE_EXTENSION" "$fixture/delegation/extensions/qq-service-class.ts"
chmod +x "$fixture/bin/qq-delegate" "$fixture/bin/pi" \
  "$fixture/bin/lib/qq-process-tree-supervisor.py"
fixture_engine="$fixture/bin/qq-delegate"
policy="$fixture/delegation/policies/execution-profiles.json"
fixture_service_extension="$fixture/delegation/extensions/qq-service-class.ts"

new_run() {
  local name="$1"
  local content="${2:-# bounded work order}"
  local path="$runtime_root/$name"
  mkdir -m 700 "$path"
  printf '%s\n' "$content" >"$path/BRIEF.md"
  printf '%s\n' "$path"
}

RUN_STATUS=0
RUN_STDOUT=""
RUN_STDERR=""
run_case() {
  local label="$1"
  local role="$2"
  local cwd="$3"
  local brief="$4"
  shift 4
  RUN_STDOUT="$tmp/$label.stdout"
  RUN_STDERR="$tmp/$label.stderr"
  set +e
  env "$@" "$fixture_engine" run --role "$role" --cwd "$cwd" --brief "$brief" \
    >"$RUN_STDOUT" 2>"$RUN_STDERR"
  RUN_STATUS=$?
  set -e
}

# Happy path: argv, prompt, environment, and terminal discovery.
parent_session="12345678-1234-4abc-8def-1234567890ab"
happy_run="$(new_run happy)"
run_case happy reviewer "$fixture" "$happy_run/BRIEF.md" \
  PI_SUBAGENT_PARENT_SESSION="$parent_session" \
  HERDR_PANE_ID=herdr:reviewer_T192 \
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  QQ_DELEGATE_SERVICE_CLASS=priority \
  QQ_DISPATCH_RUN_DIR=/inherited/wrong
assert_equal 0 "$RUN_STATUS" "happy delegate run failed"
assert_file_contains "$RUN_STDERR" "[qq-delegate] role=reviewer timeout=2700s run-dir=$happy_run"
HAPPY_RUN="$happy_run" python3 - "$happy_run/argv.nul" <<'PY'
import os
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
run = os.environ["HAPPY_RUN"]
assert args == [
    b"--approve", b"--offline", b"--mode", b"json", b"-p",
    b"--provider", b"kimi-coding", b"--model", b"k3",
    b"--thinking", b"max",
    b"--tools", b"read,grep,find,ls,bash", b"--no-extensions",
    b"--no-skills", b"--no-context-files", b"--system-prompt",
    f"{run}/.system-prompt.md".encode(),
    f"Task: Read-and-perform:{run}/BRIEF.md".encode(), b"",
], args
PY
python3 - "$fixture/delegation/manifests/agents/reviewer.md" \
  "$happy_run/.system-prompt.md" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
lines = source.splitlines(keepends=True)
close = [line.rstrip("\r\n") for line in lines].index("---", 1)
assert Path(sys.argv[2]).read_text() == "".join(lines[close + 1:])
PY
[ "$(stat -c %a "$happy_run/.system-prompt.md")" = 600 ] || fail "system prompt mode is not 600"
[ "$(stat -c %a "$happy_run/pi-config/auth.json")" = 600 ] || fail "staged auth mode is not 600"
assert_equal 'herdr:reviewer_T192' "$(cat "$happy_run/PANE")" \
  "valid HERDR_PANE_ID was not recorded exactly"
[ "$(stat -c %a "$happy_run/PANE")" = 600 ] || fail "recorded PANE mode is not 600"
cmp "$test_home/.pi/agent/auth.json" "$happy_run/pi-config/auth.json" >/dev/null \
  || fail "staged auth differs"
grep -Fxq "QQ_DISPATCH_RUN_DIR=$happy_run" "$happy_run/child.env" || fail "run dir was not exported"
grep -Fxq "XDG_CACHE_HOME=$happy_run/cache" "$happy_run/child.env" || fail "cache dir was not exported"
grep -Fxq "PI_CODING_AGENT_DIR=$happy_run/pi-config" "$happy_run/child.env" || fail "Pi config was not redirected"
grep -Fxq "PI_CODING_AGENT_SESSION_DIR=$happy_run/sessions" "$happy_run/child.env" || fail "sessions were not redirected"
grep -Fxq 'PI_OFFLINE=1' "$happy_run/child.env" || fail "offline mode was not exported"
if grep -Eq '^(PI_SUBAGENT_|QQ_DELEGATE_SERVICE_CLASS=|QQ_DISPATCH_RUN_DIR=/inherited)' "$happy_run/child.env"; then
  fail "default-class child inherited a scrubbed variable"
fi
python3 - "$happy_run/argv.nul" <<'PY'
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--extension" not in args, args
PY
assert_file_contains "$happy_run/output.jsonl" '"event":"fixture-output"'
assert_file_contains "$happy_run/stderr.log" 'fixture-stderr'
jq -e --arg run "$happy_run" --arg cwd "$fixture" --arg session "$parent_session" '
  .schema == "qq-run-terminal" and .version == 2
  and (.run_id | test("^[0-9a-f-]{36}$")) and .agent == "reviewer"
  and .exit_code == 0 and .timed_out == false and .cwd == $cwd
  and .run_dir == $run and .output_log == ($run + "/output.jsonl")
  and .sessions_dir == ($run + "/sessions") and .parent_session == $session
  and (.started_at | test("Z$")) and (.ended_at | test("Z$"))
' "$happy_run/TERMINAL" >/dev/null
[ ! -e "$runtime_root/async-subagent-runs" ] \
  || fail "delegate recreated the retired async-subagent-runs bridge"

# PANE is a sanctioned preflight entry and a valid inherited pane replaces it
# atomically. Malformed and absent pane identity never fail dispatch or create
# a targeting record.
pane_allowlisted_run="$(new_run pane-allowlisted)"
printf '%s\n' 'old:pane' >"$pane_allowlisted_run/PANE"
chmod 600 "$pane_allowlisted_run/PANE"
run_case pane-allowlisted reviewer "$fixture" "$pane_allowlisted_run/BRIEF.md" \
  HERDR_PANE_ID=pane:new-42
assert_equal 0 "$RUN_STATUS" "allowlisted PANE entry was refused"
assert_equal 'pane:new-42' "$(cat "$pane_allowlisted_run/PANE")" \
  "allowlisted PANE was not atomically replaced"

malformed_pane_run="$(new_run malformed-pane)"
run_case malformed-pane reviewer "$fixture" "$malformed_pane_run/BRIEF.md" \
  HERDR_PANE_ID=$'bad\npane'
assert_equal 0 "$RUN_STATUS" "malformed pane identity changed dispatch behavior"
[ ! -e "$malformed_pane_run/PANE" ] || fail "malformed pane identity was recorded"

absent_pane_run="$(new_run absent-pane)"
run_case absent-pane reviewer "$fixture" "$absent_pane_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "absent pane identity changed dispatch behavior"
[ ! -e "$absent_pane_run/PANE" ] || fail "absent pane identity created PANE"

# Default derivation: with no QQ_DISPATCH_RUNTIME_ROOT override the engine
# roots run dirs at $XDG_STATE_HOME/qq/delegate — durable qq state.
xdg_root="$tmp/xdg-state"
xdg_run="$xdg_root/qq/delegate/default-run"
mkdir -p -- "$xdg_root/qq/delegate"
mkdir -m 700 "$xdg_run"
printf '%s\n' '# bounded work order' >"$xdg_run/BRIEF.md"
run_case xdg-default reviewer "$fixture" "$xdg_run/BRIEF.md" \
  -u QQ_DISPATCH_RUNTIME_ROOT XDG_STATE_HOME="$xdg_root"
assert_equal 0 "$RUN_STATUS" "run beneath the XDG default root failed"
[ -f "$xdg_run/TERMINAL" ] || fail "XDG-default run dir did not seal"

# The retired /tmp-containment rail stays gone: an explicit runtime root
# outside /tmp is accepted (the Repository tree is never beneath /tmp).
repo_tmp="$(mktemp -d "$ROOT/tests/.delegate-root.XXXXXX")"
trap 'rm -rf "$tmp" "$repo_tmp"' EXIT
case "$repo_tmp" in
  /tmp/*) fail 'fixture root unexpectedly beneath /tmp' ;;
esac
offtmp_run="$repo_tmp/delegate-root/off-tmp-run"
mkdir -p -- "$repo_tmp/delegate-root"
mkdir -m 700 "$offtmp_run"
printf '%s\n' '# bounded work order' >"$offtmp_run/BRIEF.md"
run_case off-tmp reviewer "$fixture" "$offtmp_run/BRIEF.md" \
  QQ_DISPATCH_RUNTIME_ROOT="$repo_tmp/delegate-root"
assert_equal 0 "$RUN_STATUS" "runtime root outside /tmp was refused"
[ -f "$offtmp_run/TERMINAL" ] || fail "off-/tmp run dir did not seal"

# A child failure remains the terminal run result.
failed_run="$(new_run child-failed 'exit=3')"
run_case child-failed reviewer "$fixture" "$failed_run/BRIEF.md"
assert_equal 3 "$RUN_STATUS" "child exit 3 was not preserved"
jq -e '.exit_code == 3 and .timed_out == false' "$failed_run/TERMINAL" >/dev/null

# Timeout reaps the stub's descendant and is durable.
timeout_run="$(new_run timeout 'wedge=1')"
run_case timeout reviewer "$fixture" "$timeout_run/BRIEF.md" QQ_DISPATCH_TIMEOUT=0.3s
assert_equal 124 "$RUN_STATUS" "timeout status was not preserved"
jq -e '.exit_code == 124 and .timed_out == true' "$timeout_run/TERMINAL" >/dev/null
[ -s "$timeout_run/stub-child.pid" ] || fail "wedged descendant did not announce itself"
wedged_pid="$(cat "$timeout_run/stub-child.pid")"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 "$wedged_pid" 2>/dev/null || break
  sleep 0.05
done
kill -0 "$wedged_pid" 2>/dev/null && fail "supervisor leaked descendant $wedged_pid"

# Fail-closed matrix. Counted explicitly for completion evidence.
fail_closed_count=0
expect_refusal() {
  local label="$1"
  local message="$2"
  shift 2
  set +e
  "$@" >"$tmp/$label.refusal.stdout" 2>"$tmp/$label.refusal.stderr"
  local status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label unexpectedly succeeded"
  assert_file_contains "$tmp/$label.refusal.stderr" "$message"
  fail_closed_count=$((fail_closed_count + 1))
}

expect_policy_refusal() {
  local label="$1"
  local message="$2"
  shift 2
  set +e
  "$@" >"$tmp/$label.refusal.stdout" 2>"$tmp/$label.refusal.stderr"
  local status=$?
  set -e
  assert_equal 66 "$status" "$label did not use the policy refusal status"
  assert_file_contains "$tmp/$label.refusal.stderr" "$message"
  fail_closed_count=$((fail_closed_count + 1))
}

missing_dir="$runtime_root/missing"
mkdir -m 700 "$missing_dir"
expect_refusal missing-brief 'brief must exist' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$missing_dir/BRIEF.md"
sealed_run="$(new_run sealed)"
printf '{}\n' >"$sealed_run/TERMINAL"
expect_refusal sealed 'sealed by TERMINAL' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$sealed_run/BRIEF.md"
loose_run="$(new_run loose)"
chmod 755 "$loose_run"
expect_refusal loose 'must be mode 700' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$loose_run/BRIEF.md"
symlink_run="$runtime_root/brief-symlink"
mkdir -m 700 "$symlink_run"
printf '# target\n' >"$tmp/brief-target"
ln -s "$tmp/brief-target" "$symlink_run/BRIEF.md"
expect_refusal brief-symlink 'brief may not be a symlink' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$symlink_run/BRIEF.md"
non_git="$tmp/non-git"
mkdir "$non_git"
non_git_run="$(new_run non-git-cwd)"
expect_refusal non-git 'cwd is not a Git worktree' \
  "$fixture_engine" run --role reviewer --cwd "$non_git" --brief "$non_git_run/BRIEF.md"
foreign="$tmp/foreign"
git init -q -b main "$foreign"
foreign_run="$(new_run foreign-cwd)"
expect_refusal foreign 'different Git common directory' \
  "$fixture_engine" run --role reviewer --cwd "$foreign" --brief "$foreign_run/BRIEF.md"
unknown_run="$(new_run unknown-role)"
expect_refusal unknown-role "unsupported delegated role 'architect'" \
  "$fixture_engine" run --role architect --cwd "$fixture" --brief "$unknown_run/BRIEF.md"

reviewer_manifest="$fixture/delegation/manifests/agents/reviewer.md"
cp "$reviewer_manifest" "$tmp/reviewer.original"
python3 - "$reviewer_manifest" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
path.write_text(text.replace("timeoutMs: 2700000", "timeoutMs: 2700000\ntimeoutMs: 1"))
PY
duplicate_timeout_run="$(new_run duplicate-timeout)"
expect_refusal duplicate-timeout 'exactly one timeoutMs' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$duplicate_timeout_run/BRIEF.md"
cp "$tmp/reviewer.original" "$reviewer_manifest"
sed -i 's/^tools:.*/tools: read, subagent/' "$reviewer_manifest"
unavailable_tool_run="$(new_run unavailable-tool)"
expect_refusal unavailable-tool "unavailable tool 'subagent'" \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$unavailable_tool_run/BRIEF.md"
cp "$tmp/reviewer.original" "$reviewer_manifest"
cp "$policy" "$tmp/policy.original"
printf '{bad json\n' >"$policy"
malformed_policy_run="$(new_run malformed-policy)"
expect_refusal malformed-policy 'policy is malformed' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$malformed_policy_run/BRIEF.md"
cp "$tmp/policy.original" "$policy"
python3 - "$policy" <<'PY'
import json
from pathlib import Path
import sys
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["implementer"]["serviceClass"] = "realtime"
path.write_text(json.dumps(value))
PY
invalid_class_run="$(new_run invalid-service-class)"
expect_policy_refusal invalid-service-class 'serviceClass for implementer is unsupported' \
  "$fixture_engine" run --role implementer --cwd "$fixture" --brief "$invalid_class_run/BRIEF.md"

cp "$tmp/policy.original" "$policy"
python3 - "$policy" <<'PY'
import json
from pathlib import Path
import sys
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["reviewer"]["serviceClass"] = "flex"
path.write_text(json.dumps(value))
PY
unsupported_provider_run="$(new_run unsupported-service-provider)"
expect_policy_refusal unsupported-service-provider 'unsupported for requested provider kimi-coding' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$unsupported_provider_run/BRIEF.md"

# Every allowed non-default class reaches only the explicit delegate extension
# and the validated private child environment for OpenAI requested providers.
for service_spec in auto:openai default:openai-codex flex:openai-codex priority:openai-codex; do
  service_class="${service_spec%%:*}"
  service_provider="${service_spec#*:}"
  python3 - "$tmp/policy.original" "$policy" "$service_class" "$service_provider" <<'PY'
import json
from pathlib import Path
import sys
source, target = map(Path, sys.argv[1:3])
value = json.loads(source.read_text())
value["implementer"]["serviceClass"] = sys.argv[3]
value["implementer"]["provider"] = sys.argv[4]
target.write_text(json.dumps(value))
PY
  service_run="$(new_run "service-$service_class")"
  run_case "service-$service_class" implementer "$fixture" "$service_run/BRIEF.md" \
    QQ_DELEGATE_SERVICE_CLASS=inherited-invalid
  assert_equal 0 "$RUN_STATUS" "$service_class service-class dispatch failed"
  SERVICE_CLASS="$service_class" SERVICE_PROVIDER="$service_provider" \
    SERVICE_EXTENSION="$fixture_service_extension" \
    python3 - "$service_run/argv.nul" <<'PY'
import os
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args[args.index(b"--provider") + 1].decode() == os.environ["SERVICE_PROVIDER"], args
index = args.index(b"--no-extensions")
assert args[index + 1:index + 3] == [b"--extension", os.environ["SERVICE_EXTENSION"].encode()], args
assert args.count(b"--extension") == 1, args
PY
  grep -Fxq "QQ_DELEGATE_SERVICE_CLASS=$service_class" "$service_run/child.env" \
    || fail "$service_class was not exported as the selected private service class"
done

cp "$tmp/policy.original" "$policy"
python3 - "$policy" effort ludicrous <<'PY'
import json
from pathlib import Path
import sys
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["reviewer"][sys.argv[2]] = sys.argv[3]
path.write_text(json.dumps(value))
PY
bad_effort_run="$(new_run bad-effort)"
expect_refusal bad-effort 'effort for reviewer is unsupported' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$bad_effort_run/BRIEF.md"
cp "$tmp/policy.original" "$policy"

# provider-default omits thinking; researcher mounts Context7 and rejects its API key.
python3 - "$policy" <<'PY'
import json
from pathlib import Path
import sys
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["reviewer"]["effort"] = "provider-default"
path.write_text(json.dumps(value))
PY
default_effort_run="$(new_run default-effort)"
run_case default-effort reviewer "$fixture" "$default_effort_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "provider-default effort dispatch failed"
python3 - "$default_effort_run/argv.nul" <<'PY'
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert b"--thinking" not in args, args
PY
cp "$tmp/policy.original" "$policy"
research_run="$(new_run researcher)"
run_case researcher researcher "$fixture" "$research_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "researcher dispatch failed"
CONTEXT7="$context7" python3 - "$research_run/argv.nul" <<'PY'
import os
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
n = args.index(b"--extension")
assert args[n + 1].decode() == os.environ["CONTEXT7"]
tools = args[args.index(b"--tools") + 1].decode().split(",")
assert "resolve-library-id" in tools and "query-docs" in tools, tools
PY

python3 - "$tmp/policy.original" "$policy" <<'PY'
import json
from pathlib import Path
import sys
source, target = map(Path, sys.argv[1:])
value = json.loads(source.read_text())
value["researcher"]["serviceClass"] = "priority"
target.write_text(json.dumps(value))
PY
research_service_run="$(new_run researcher-service)"
run_case researcher-service researcher "$fixture" "$research_service_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "researcher service-class dispatch failed"
CONTEXT7="$context7" SERVICE_EXTENSION="$fixture_service_extension" \
  python3 - "$research_service_run/argv.nul" <<'PY'
import os
from pathlib import Path
import sys
args = Path(sys.argv[1]).read_bytes().split(b"\0")
extensions = [args[index + 1].decode() for index, value in enumerate(args) if value == b"--extension"]
assert extensions == [os.environ["SERVICE_EXTENSION"], os.environ["CONTEXT7"]], extensions
PY
grep -Fxq 'QQ_DELEGATE_SERVICE_CLASS=priority' "$research_service_run/child.env" \
  || fail 'researcher did not receive its validated private service class'
cp "$tmp/policy.original" "$policy"

context_key_run="$(new_run context-key)"
expect_refusal context-key 'forbids inherited CONTEXT7_API_KEY' \
  env CONTEXT7_API_KEY=secret "$fixture_engine" run --role researcher \
    --cwd "$fixture" --brief "$context_key_run/BRIEF.md"

# Context7 stays vendor-only: no retired root MCP configuration, and the
# vendor extension source is never copied into the Repository.
[ ! -e "$ROOT/.mcp.json" ] || fail 'retired root MCP configuration still exists'
if find "$ROOT" -path '*/node_modules' -prune -o \
  -path '*/extensions/context7.ts' -type f -print -quit | grep -q .; then
  fail 'vendor Context7 extension source was copied into the Repository'
fi

# Missing parent session deliberately records the all-zeros accountable UUID.
fallback_run="$(new_run parent-fallback)"
run_case parent-fallback reviewer "$fixture" "$fallback_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "parent-session fallback dispatch failed"
jq -e '.parent_session == "00000000-0000-0000-0000-000000000000"' \
  "$fallback_run/TERMINAL" >/dev/null

# An uppercase-hex parent session UUID canonicalizes to lowercase: the
# consumer (bin/qq-observe SESSION_UUID) matches lowercase only.
upper_session="ABCDEFAB-1234-4ABC-8DEF-ABCDEF012345"
upper_run="$(new_run parent-uppercase)"
run_case parent-uppercase reviewer "$fixture" "$upper_run/BRIEF.md" \
  PI_SUBAGENT_PARENT_SESSION="$upper_session"
assert_equal 0 "$RUN_STATUS" "uppercase parent-session dispatch failed"
jq -e '.parent_session == "abcdefab-1234-4abc-8def-abcdef012345"' \
  "$upper_run/TERMINAL" >/dev/null

# Batch is blocking, concurrent, complete, and summarizes every ticket.
batch_runs=()
for spec in 'batch-a:sleep=0.4' 'batch-b:sleep=0.4' $'batch-c:sleep=0.4\nexit=2'; do
  name="${spec%%:*}"
  content="${spec#*:}"
  batch_runs+=("$(new_run "$name" "$content")")
done
batch_json="$tmp/batch.json"
python3 - "$batch_json" "$fixture" "${batch_runs[@]}" <<'PY'
import json
from pathlib import Path
import sys
target, cwd, *runs = sys.argv[1:]
Path(target).write_text(json.dumps([
    {"role": "reviewer", "cwd": cwd, "brief": run + "/BRIEF.md"}
    for run in runs
]))
PY
batch_stdout="$tmp/batch.stdout"
batch_stderr="$tmp/batch.stderr"
batch_start="$(date +%s%3N)"
set +e
"$fixture_engine" batch "$batch_json" >"$batch_stdout" 2>"$batch_stderr"
batch_status=$?
set -e
batch_elapsed=$(( $(date +%s%3N) - batch_start ))
assert_equal 1 "$batch_status" "mixed-result batch did not exit 1"
[[ "$batch_elapsed" -lt 1000 ]] || fail "batch was not parallel (${batch_elapsed}ms)"
assert_equal 3 "$(wc -l <"$batch_stdout" | tr -d ' ')" "batch did not emit three summaries"
python3 - "$batch_stdout" "$fixture" "${batch_runs[@]}" <<'PY'
import json
from pathlib import Path
import sys
rows = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
assert [row["exit_code"] for row in rows] == [0, 0, 2], rows
assert all(set(row) == {"run_id", "role", "cwd", "run_dir", "exit_code", "duration_s", "timed_out"} for row in rows)
assert all(row["cwd"] == sys.argv[2] for row in rows)
assert [row["run_dir"] for row in rows] == sys.argv[3:]
assert all(row["duration_s"] >= 0.4 and row["timed_out"] is False for row in rows)
PY
for run in "${batch_runs[@]}"; do
  [ -f "$run/TERMINAL" ] || fail "batch run lacks TERMINAL: $run"
  [ -f "$run/output.jsonl" ] || fail "batch run lacks output: $run"
done

# Prompt-returning start accepts only after production preflight, returns the
# exact durable identity, and does not wait for the fake Pi child lifecycle.
# The sanctioned cache may already contain the owner's Check baseline.
start_run="$(new_run start-success 'sleep=1')"
mkdir -p "$start_run/cache/baseline"
printf 'owner baseline evidence\n' >"$start_run/cache/baseline/check.log"
start_stdout="$tmp/start-success.stdout"
start_stderr="$tmp/start-success.stderr"
start_started="$(date +%s%3N)"
env HERDR_PANE_ID=pane:start_T208 "$fixture_engine" start \
  --role reviewer --cwd "$fixture" --brief "$start_run/BRIEF.md" \
  >"$start_stdout" 2>"$start_stderr"
start_elapsed=$(( $(date +%s%3N) - start_started ))
[[ "$start_elapsed" -lt 700 ]] || fail "start blocked on its child (${start_elapsed}ms)"
[ ! -e "$start_run/TERMINAL" ] || fail "start waited through the sleeping child"
start_id="$(jq -r '.run_id' "$start_stdout")"
jq -e --arg run "$start_run" '
  .schema == "qq-run-start" and .version == 1 and .state == "accepted"
  and .run_dir == $run and (.run_id | test("^[0-9a-f-]{36}$"))
' "$start_stdout" >/dev/null
jq -e --arg id "$start_id" --arg run "$start_run" --arg cwd "$fixture" '
  .schema == "qq-run-launch" and .version == 1 and .run_id == $id
  and .run_dir == $run and .brief == ($run + "/BRIEF.md")
  and .cwd == $cwd and .role == "reviewer" and .detached == true
  and (.worker_pid | type == "number") and (.worker_start_ticks | type == "number")
  and (.dispatch_pid | type == "number") and (.dispatch_start_ticks | type == "number")
' "$start_run/LAUNCH" >/dev/null
[ "$(stat -c %a "$start_run/LAUNCH")" = 600 ] || fail "LAUNCH mode is not 600"
[ ! -e "$start_run/.launch-claim" ] || fail "accepted run retained its launch claim"
assert_equal 'owner baseline evidence' "$(cat "$start_run/cache/baseline/check.log")" \
  "start did not preserve sanctioned baseline evidence"
assert_equal 'pane:start_T208' "$(cat "$start_run/PANE")" \
  "start did not persist its valid pane identity"

status_started="$(date +%s%3N)"
"$fixture_engine" status "$start_run" >"$tmp/start-active.status"
status_elapsed=$(( $(date +%s%3N) - status_started ))
[[ "$status_elapsed" -lt 300 ]] || fail "status waited or scanned (${status_elapsed}ms)"
jq -e --arg id "$start_id" --arg run "$start_run" '
  .schema == "qq-run-status" and .run_id == $id and .run_dir == $run
  and .state == "running" and (.worker_pid | type == "number")
' "$tmp/start-active.status" >/dev/null
set +e
"$fixture_engine" wait "$start_run" >"$tmp/start-success.wait"
start_wait_status=$?
set -e
assert_equal 0 "$start_wait_status" "wait did not preserve successful child status"
jq -e --arg id "$start_id" '.state == "terminal" and .run_id == $id and .exit_code == 0' \
  "$tmp/start-success.wait" >/dev/null
"$fixture_engine" status "$start_run" >"$tmp/start-terminal.status"
jq -e --arg id "$start_id" '.state == "terminal" and .run_id == $id and .exit_code == 0' \
  "$tmp/start-terminal.status" >/dev/null
"$fixture_engine" collect "$start_run" >"$tmp/start-success.collect"
jq -e --arg id "$start_id" --arg run "$start_run" '
  .schema == "qq-run-collection" and .run_id == $id and .run_dir == $run
  and .state == "terminal" and .terminal.schema == "qq-run-terminal"
  and .terminal.version == 2 and .terminal.run_id == $id
  and .terminal.exit_code == 0 and .terminal.run_dir == $run
  and .terminal_path == ($run + "/TERMINAL")
  and .envelope_path == ($run + "/ENVELOPE.md")
  and .envelope == "# completion envelope\n"
' "$tmp/start-success.collect" >/dev/null
assert_equal 'owner baseline evidence' "$(cat "$start_run/cache/baseline/check.log")" \
  "collection did not preserve the sanctioned baseline evidence"

# Completed TERMINAL v2 state from the admitted blocking engine remains exact
# authority even when its pre-LAUNCH run directory has no LAUNCH artifact.
legacy_terminal_run="$(new_run legacy-terminal-only)"
run_case legacy-terminal-only reviewer "$fixture" "$legacy_terminal_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "legacy fixture run did not complete"
rm "$legacy_terminal_run/LAUNCH"
[ ! -e "$legacy_terminal_run/LAUNCH" ] || fail "legacy fixture retained LAUNCH"
"$fixture_engine" status "$legacy_terminal_run" >"$tmp/legacy-terminal.status"
"$fixture_engine" wait "$legacy_terminal_run" >"$tmp/legacy-terminal.wait"
"$fixture_engine" collect "$legacy_terminal_run" >"$tmp/legacy-terminal.collect"
python3 - "$legacy_terminal_run" "$tmp/legacy-terminal.status" \
  "$tmp/legacy-terminal.wait" "$tmp/legacy-terminal.collect" <<'PY'
import json
from pathlib import Path
import sys
run = Path(sys.argv[1])
terminal = json.loads((run / "TERMINAL").read_text())
status = json.loads(Path(sys.argv[2]).read_text())
wait = json.loads(Path(sys.argv[3]).read_text())
collection = json.loads(Path(sys.argv[4]).read_text())
for snapshot in (status, wait):
    assert snapshot == {
        "schema": "qq-run-status", "version": 1,
        "run_id": terminal["run_id"], "run_dir": str(run),
        "state": "terminal", "role": terminal["agent"],
        "cwd": terminal["cwd"], "exit_code": terminal["exit_code"],
        "timed_out": terminal["timed_out"],
        "terminal_path": str(run / "TERMINAL"),
    }, snapshot
assert collection["terminal"] == terminal, collection
assert collection["run_id"] == terminal["run_id"], collection
assert collection["run_dir"] == str(run), collection
assert collection["terminal_path"] == str(run / "TERMINAL"), collection
assert collection["envelope"] == (run / "ENVELOPE.md").read_text(), collection
PY

# Wait and collection both preserve nonzero and timeout outcomes while still
# emitting exact attributable JSON.
start_failed_run="$(new_run start-failed 'exit=3')"
"$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$start_failed_run/BRIEF.md" >"$tmp/start-failed.start"
failed_start_id="$(jq -r .run_id "$tmp/start-failed.start")"
set +e
"$fixture_engine" wait "$start_failed_run" >"$tmp/start-failed.wait"
failed_wait_status=$?
"$fixture_engine" collect "$start_failed_run" >"$tmp/start-failed.collect"
failed_collect_status=$?
set -e
assert_equal 3 "$failed_wait_status" "wait did not preserve child exit 3"
assert_equal 3 "$failed_collect_status" "collect did not preserve child exit 3"
jq -e --arg id "$failed_start_id" '.run_id == $id and .exit_code == 3 and .timed_out == false' \
  "$tmp/start-failed.wait" >/dev/null
jq -e --arg id "$failed_start_id" '.run_id == $id and .terminal.exit_code == 3' \
  "$tmp/start-failed.collect" >/dev/null

start_timeout_run="$(new_run start-timeout 'wedge=1')"
env QQ_DISPATCH_TIMEOUT=0.3s "$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$start_timeout_run/BRIEF.md" >"$tmp/start-timeout.start"
timeout_start_id="$(jq -r .run_id "$tmp/start-timeout.start")"
set +e
"$fixture_engine" wait "$start_timeout_run" >"$tmp/start-timeout.wait"
start_timeout_status=$?
"$fixture_engine" collect "$start_timeout_run" >"$tmp/start-timeout.collect"
start_timeout_collect_status=$?
set -e
assert_equal 124 "$start_timeout_status" "non-blocking wait did not preserve timeout"
assert_equal 124 "$start_timeout_collect_status" "timeout collection did not preserve timeout"
jq -e --arg id "$timeout_start_id" '
  .run_id == $id and .exit_code == 124 and .timed_out == true
' "$tmp/start-timeout.wait" >/dev/null
jq -e '.terminal.exit_code == 124 and .terminal.timed_out == true' \
  "$tmp/start-timeout.collect" >/dev/null
start_wedged_pid="$(cat "$start_timeout_run/stub-child.pid")"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 "$start_wedged_pid" 2>/dev/null || break
  sleep 0.05
done
kill -0 "$start_wedged_pid" 2>/dev/null \
  && fail "non-blocking timeout leaked descendant $start_wedged_pid"

# start-batch accepts the existing shape promptly, starts all three tickets,
# and preserves exact per-run attribution through independent collection.
start_batch_runs=()
for name in start-batch-a start-batch-b start-batch-c; do
  start_batch_runs+=("$(new_run "$name" 'sleep=1.5')")
done
start_batch_json="$tmp/start-batch.json"
python3 - "$start_batch_json" "$fixture" "${start_batch_runs[@]}" <<'PY'
import json
from pathlib import Path
import sys
target, cwd, *runs = sys.argv[1:]
Path(target).write_text(json.dumps([
    {"role": "reviewer", "cwd": cwd, "brief": run + "/BRIEF.md"}
    for run in runs
]))
PY
start_batch_started="$(date +%s%3N)"
"$fixture_engine" start-batch "$start_batch_json" >"$tmp/start-batch.stdout"
start_batch_elapsed=$(( $(date +%s%3N) - start_batch_started ))
[[ "$start_batch_elapsed" -lt 1000 ]] \
  || fail "start-batch waited through child lifecycles (${start_batch_elapsed}ms)"
assert_equal 3 "$(wc -l <"$tmp/start-batch.stdout" | tr -d ' ')" \
  "start-batch did not emit one line per accepted ticket"
python3 - "$tmp/start-batch.stdout" "${start_batch_runs[@]}" <<'PY'
import json
from pathlib import Path
import sys
rows = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
assert [row["run_dir"] for row in rows] == sys.argv[2:], rows
assert len({row["run_id"] for row in rows}) == 3, rows
assert all(row["state"] == "accepted" for row in rows), rows
PY
for run in "${start_batch_runs[@]}"; do
  "$fixture_engine" wait "$run" >"$tmp/$(basename "$run").wait"
  "$fixture_engine" collect "$run" >"$tmp/$(basename "$run").collect"
  jq -e --arg run "$run" '.run_dir == $run and .terminal.run_dir == $run' \
    "$tmp/$(basename "$run").collect" >/dev/null
done

# A delayed same-directory starter must revalidate after acquiring its claim.
# The accepted winner stays collectable and the loser never launches a child or
# leaves claim residue after the winner unlinks its own claim.
race_run="$(new_run same-directory-race 'sleep=0.4')"
race_site="$tmp/same-directory-race-site"
race_marker="$tmp/same-directory-race.marker"
race_pid_log="$tmp/same-directory-race.pids"
mkdir -p "$race_site"
cat >"$race_site/sitecustomize.py" <<'PY'
import os
import time
from pathlib import Path
if os.environ.get("QQ_DELEGATE_INTERNAL_WORKER") == "1" and os.environ.get("QQ_DELEGATE_TEST_SLOW_CLAIM") == "1":
    marker = Path(os.environ["QQ_DELEGATE_TEST_CLAIM_MARKER"])
    marker.write_text("sleeping\n")
    time.sleep(1.2)
    marker.write_text("released\n")
PY
env PYTHONPATH="$race_site" QQ_DELEGATE_TEST_SLOW_CLAIM=1 \
  QQ_DELEGATE_TEST_CLAIM_MARKER="$race_marker" \
  QQ_DELEGATE_TEST_PID_LOG="$race_pid_log" \
  "$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$race_run/BRIEF.md" >"$tmp/same-directory-race-a.stdout" \
  2>"$tmp/same-directory-race-a.stderr" &
race_a_starter=$!
for _ in {1..200}; do
  [[ -f "$race_marker" && "$(cat "$race_marker")" == sleeping ]] && break
  sleep 0.01
done
[[ -f "$race_marker" && "$(cat "$race_marker")" == sleeping ]] \
  || fail "delayed same-directory worker did not reach the claim window"
env QQ_DELEGATE_TEST_PID_LOG="$race_pid_log" \
  "$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$race_run/BRIEF.md" >"$tmp/same-directory-race-b.stdout"
set +e
wait "$race_a_starter"
race_a_status=$?
set -e
[[ "$race_a_status" -ne 0 ]] || fail "duplicate same-directory starter was accepted"
"$fixture_engine" wait "$race_run" >"$tmp/same-directory-race.wait"
for _ in {1..200}; do
  [[ -f "$race_marker" && "$(cat "$race_marker")" == released ]] && break
  sleep 0.01
done
[[ -f "$race_marker" && "$(cat "$race_marker")" == released ]] \
  || fail "delayed same-directory worker did not leave its stall"
sleep 0.2
[ ! -e "$race_run/.launch-claim" ] \
  || fail "losing same-directory worker left claim residue"
"$fixture_engine" status "$race_run" >"$tmp/same-directory-race.status"
"$fixture_engine" collect "$race_run" >"$tmp/same-directory-race.collect"
assert_equal 1 "$(wc -l <"$race_pid_log" | tr -d ' ')" \
  "losing same-directory worker launched a second child"
race_id="$(jq -r .run_id "$tmp/same-directory-race-b.stdout")"
jq -e --arg id "$race_id" '.state == "terminal" and .run_id == $id and .exit_code == 0' \
  "$tmp/same-directory-race.status" >/dev/null
jq -e --arg id "$race_id" '.run_id == $id and .terminal.run_id == $id' \
  "$tmp/same-directory-race.collect" >/dev/null

# A starter shell may disappear immediately after acceptance; the detached
# worker remains authoritative and seals the exact run.
detached_survival_run="$(new_run detached-survival 'sleep=0.5')"
(
  exec "$fixture_engine" start --role reviewer --cwd "$fixture" \
    --brief "$detached_survival_run/BRIEF.md"
) >"$tmp/detached-survival.start" &
starter_pid=$!
wait "$starter_pid"
[ -f "$detached_survival_run/LAUNCH" ] || fail "starter returned before durable acceptance"
"$fixture_engine" wait "$detached_survival_run" >"$tmp/detached-survival.wait"

# Killing the exact detached worker cannot leave a plausible running state.
# Status checks the persisted PID/start identity and tears down its owned group.
worker_failure_run="$(new_run worker-failure 'wedge=1')"
env QQ_DISPATCH_TIMEOUT=5s "$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$worker_failure_run/BRIEF.md" >"$tmp/worker-failure.start"
for _ in {1..100}; do
  [ -s "$worker_failure_run/stub-child.pid" ] && break
  sleep 0.02
done
[ -s "$worker_failure_run/stub-child.pid" ] || fail "worker-failure descendant did not start"
worker_failure_child="$(cat "$worker_failure_run/stub-child.pid")"
worker_failure_pid="$(jq -r .worker_pid "$worker_failure_run/LAUNCH")"
kill -KILL "$worker_failure_pid"
for _ in {1..100}; do
  kill -0 "$worker_failure_pid" 2>/dev/null || break
  sleep 0.01
done
set +e
"$fixture_engine" status "$worker_failure_run" >"$tmp/worker-failure.status"
worker_failure_status=$?
set -e
assert_equal 75 "$worker_failure_status" "dead detached worker looked plausible"
jq -e '.state == "failed" and .reason == "worker-not-running"' \
  "$tmp/worker-failure.status" >/dev/null
for _ in {1..100}; do
  kill -0 "$worker_failure_child" 2>/dev/null || break
  sleep 0.02
done
kill -0 "$worker_failure_child" 2>/dev/null \
  && fail "dead worker status cleanup leaked descendant $worker_failure_child"
expect_refusal incomplete-worker-collect 'incomplete and cannot be collected' \
  "$fixture_engine" collect "$worker_failure_run"

# Starting spent output and preflight-invalid tickets fails before emitting an
# acceptance line. The spent run stays refused on every retry.
spent_output_run="$(new_run spent-output)"
printf 'prior output\n' >"$spent_output_run/output.jsonl"
expect_refusal spent-output-start 'failed before accepting the ticket' \
  "$fixture_engine" start --role reviewer --cwd "$fixture" \
    --brief "$spent_output_run/BRIEF.md"
preflight_failure_run="$(new_run start-preflight-failure)"
expect_refusal start-preflight-failure 'failed before accepting the ticket' \
  "$fixture_engine" start --role architect --cwd "$fixture" \
    --brief "$preflight_failure_run/BRIEF.md"
expect_refusal spent-terminal-start 'LAUNCH metadata is misattributed' \
  "$fixture_engine" start --role reviewer --cwd "$fixture" \
    --brief "$start_run/BRIEF.md"

# Lifecycle validation refuses missing, malformed, linked, loose, mismatched,
# stale-process, and cross-run artifacts without scanning for another run.
missing_launch_run="$(new_run missing-launch-status)"
expect_refusal missing-launch-status 'LAUNCH is missing' \
  "$fixture_engine" status "$missing_launch_run"
ln -s "$start_run" "$runtime_root/symlink-run"
expect_refusal symlink-run-status 'non-symlink directory' \
  "$fixture_engine" status "$runtime_root/symlink-run"
chmod 755 "$start_run"
expect_refusal loose-status 'run directory must be mode 700' \
  "$fixture_engine" status "$start_run"
chmod 700 "$start_run"

cp -p "$start_run/LAUNCH" "$tmp/start.LAUNCH"
chmod 644 "$start_run/LAUNCH"
expect_refusal launch-mode 'LAUNCH must be mode 600' \
  "$fixture_engine" status "$start_run"
cp -p "$tmp/start.LAUNCH" "$start_run/LAUNCH"
printf '{malformed\n' >"$start_run/LAUNCH"
chmod 600 "$start_run/LAUNCH"
expect_refusal launch-malformed 'LAUNCH is malformed' \
  "$fixture_engine" status "$start_run"
cp -p "$tmp/start.LAUNCH" "$start_run/LAUNCH"
mv "$start_run/LAUNCH" "$start_run/LAUNCH.saved"
ln -s LAUNCH.saved "$start_run/LAUNCH"
expect_refusal launch-symlink 'LAUNCH is not a regular non-symlink file' \
  "$fixture_engine" status "$start_run"
rm "$start_run/LAUNCH"
mv "$start_run/LAUNCH.saved" "$start_run/LAUNCH"
python3 - "$start_run/LAUNCH" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["run_id"] = "00000000-0000-0000-0000-000000000000"
path.write_text(json.dumps(value) + "\n")
PY
chmod 600 "$start_run/LAUNCH"
expect_refusal launch-run-id 'TERMINAL is mismatched or misattributed' \
  "$fixture_engine" status "$start_run"
cp -p "$tmp/start.LAUNCH" "$start_run/LAUNCH"

cp -p "$start_run/TERMINAL" "$tmp/start.TERMINAL"
printf '{malformed\n' >"$start_run/TERMINAL"
chmod 600 "$start_run/TERMINAL"
expect_refusal terminal-malformed 'TERMINAL is malformed' \
  "$fixture_engine" collect "$start_run"
cp -p "$tmp/start.TERMINAL" "$start_run/TERMINAL"
mv "$start_run/TERMINAL" "$start_run/TERMINAL.saved"
ln -s TERMINAL.saved "$start_run/TERMINAL"
expect_refusal terminal-symlink 'TERMINAL is not a regular non-symlink file' \
  "$fixture_engine" collect "$start_run"
rm "$start_run/TERMINAL"
mv "$start_run/TERMINAL.saved" "$start_run/TERMINAL"
python3 - "$start_run/TERMINAL" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["run_id"] = "00000000-0000-0000-0000-000000000000"
path.write_text(json.dumps(value) + "\n")
PY
chmod 600 "$start_run/TERMINAL"
expect_refusal terminal-run-id 'TERMINAL is mismatched or misattributed' \
  "$fixture_engine" collect "$start_run"
cp -p "$tmp/start.TERMINAL" "$start_run/TERMINAL"

mv "$start_run/ENVELOPE.md" "$start_run/ENVELOPE.saved"
expect_refusal envelope-missing 'ENVELOPE.md is missing' \
  "$fixture_engine" collect "$start_run"
ln -s ENVELOPE.saved "$start_run/ENVELOPE.md"
expect_refusal envelope-symlink 'ENVELOPE.md is not a regular non-symlink file' \
  "$fixture_engine" collect "$start_run"
rm "$start_run/ENVELOPE.md"
mv "$start_run/ENVELOPE.saved" "$start_run/ENVELOPE.md"
chmod 644 "$start_run/ENVELOPE.md"
expect_refusal envelope-mode 'ENVELOPE.md must be mode 600' \
  "$fixture_engine" collect "$start_run"
chmod 600 "$start_run/ENVELOPE.md"

cp -p "$start_run/PANE" "$tmp/start.PANE"
mv "$start_run/PANE" "$start_run/PANE.saved"
ln -s PANE.saved "$start_run/PANE"
expect_refusal pane-symlink 'PANE is not a regular non-symlink file' \
  "$fixture_engine" collect "$start_run"
rm "$start_run/PANE"
mv "$start_run/PANE.saved" "$start_run/PANE"
printf 'unsafe pane\n' >"$start_run/PANE"
chmod 600 "$start_run/PANE"
expect_refusal pane-malformed 'PANE is malformed' \
  "$fixture_engine" collect "$start_run"
cp -p "$tmp/start.PANE" "$start_run/PANE"
chmod 644 "$start_run/PANE"
expect_refusal pane-mode 'PANE must be mode 600' \
  "$fixture_engine" collect "$start_run"
cp -p "$tmp/start.PANE" "$start_run/PANE"
"$fixture_engine" collect "$start_run" >"$tmp/start-valid-pane.collect"
jq -e '.state == "terminal" and .terminal.exit_code == 0' \
  "$tmp/start-valid-pane.collect" >/dev/null
printf %s 'pane:start_T208' >"$start_run/PANE"
chmod 600 "$start_run/PANE"
"$fixture_engine" collect "$start_run" >"$tmp/start-valid-pane-no-newline.collect"
jq -e '.state == "terminal" and .terminal.exit_code == 0' \
  "$tmp/start-valid-pane-no-newline.collect" >/dev/null
cp -p "$tmp/start.PANE" "$start_run/PANE"

mv "$start_run/output.jsonl" "$start_run/output.saved"
expect_refusal output-missing 'terminal output log is missing' \
  "$fixture_engine" collect "$start_run"
mv "$start_run/output.saved" "$start_run/output.jsonl"
cp -p "$start_run/output.jsonl" "$tmp/start.output.jsonl"
truncate -s 134217728 "$start_run/output.jsonl"
set +e
(
  ulimit -v 65536
  "$fixture_engine" collect "$start_run"
) >"$tmp/start-sparse-output.collect" 2>"$tmp/start-sparse-output.stderr"
sparse_output_status=$?
set -e
assert_equal 0 "$sparse_output_status" \
  "collection loaded the sparse terminal output instead of validating metadata"
cp -p "$tmp/start.output.jsonl" "$start_run/output.jsonl"
mv "$start_run/sessions" "$start_run/sessions.saved"
ln -s sessions.saved "$start_run/sessions"
expect_refusal sessions-symlink 'terminal sessions directory is not a regular non-symlink directory' \
  "$fixture_engine" collect "$start_run"
rm "$start_run/sessions"
mv "$start_run/sessions.saved" "$start_run/sessions"

cp -p "$start_failed_run/TERMINAL" "$tmp/start-failed.TERMINAL"
cp -p "$start_run/TERMINAL" "$start_failed_run/TERMINAL"
expect_refusal cross-run-terminal 'TERMINAL is mismatched or misattributed' \
  "$fixture_engine" collect "$start_failed_run"
cp -p "$tmp/start-failed.TERMINAL" "$start_failed_run/TERMINAL"

stale_pid_run="$(new_run stale-pid 'sleep=1')"
"$fixture_engine" start --role reviewer --cwd "$fixture" \
  --brief "$stale_pid_run/BRIEF.md" >"$tmp/stale-pid.start"
cp -p "$stale_pid_run/LAUNCH" "$tmp/stale-pid.LAUNCH"
python3 - "$stale_pid_run/LAUNCH" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["dispatch_process_group"] += 1
path.write_text(json.dumps(value) + "\n")
PY
chmod 600 "$stale_pid_run/LAUNCH"
expect_refusal detached-process-group 'detached LAUNCH process group is misattributed' \
  "$fixture_engine" status "$stale_pid_run"
cp -p "$tmp/stale-pid.LAUNCH" "$stale_pid_run/LAUNCH"
python3 - "$stale_pid_run/LAUNCH" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["worker_start_ticks"] += 1
path.write_text(json.dumps(value) + "\n")
PY
chmod 600 "$stale_pid_run/LAUNCH"
set +e
"$fixture_engine" status "$stale_pid_run" >"$tmp/stale-pid.status"
stale_pid_status=$?
set -e
assert_equal 75 "$stale_pid_status" "stale PID identity looked running"
jq -e '.state == "failed" and .reason == "worker-pid-reused"' \
  "$tmp/stale-pid.status" >/dev/null
cp -p "$tmp/stale-pid.LAUNCH" "$stale_pid_run/LAUNCH"
"$fixture_engine" wait "$stale_pid_run" >"$tmp/stale-pid.wait"

empty_batch="$tmp/empty.json"
printf '[]\n' >"$empty_batch"
expect_refusal empty-batch '1..12 tickets' "$fixture_engine" batch "$empty_batch"
too_many_batch="$tmp/too-many.json"
python3 - "$too_many_batch" "$fixture" <<'PY'
import json
from pathlib import Path
import sys
Path(sys.argv[1]).write_text(json.dumps([
    {"role":"reviewer", "cwd":sys.argv[2], "brief":f"/tmp/run-{i}/BRIEF.md"}
    for i in range(13)
]))
PY
expect_refusal too-many-batch '1..12 tickets' "$fixture_engine" batch "$too_many_batch"
duplicate_batch="$tmp/duplicate.json"
python3 - "$duplicate_batch" "$fixture" <<'PY'
import json
from pathlib import Path
import sys
ticket = {"role":"reviewer", "cwd":sys.argv[2], "brief":"/tmp/same/BRIEF.md"}
Path(sys.argv[1]).write_text(json.dumps([ticket, ticket]))
PY
expect_refusal duplicate-batch 'duplicates brief path' "$fixture_engine" batch "$duplicate_batch"
missing_key_batch="$tmp/missing-key.json"
printf '[{"role":"reviewer","cwd":"%s"}]\n' "$fixture" >"$missing_key_batch"
expect_refusal missing-key-batch 'exact keys role,cwd,brief' \
  "$fixture_engine" batch "$missing_key_batch"

assert_equal 42 "$fail_closed_count" "fail-closed test count changed"
printf 'test-qq-delegate: fail-closed cases: %s\n' "$fail_closed_count"
printf 'test-qq-delegate: pass\n'
