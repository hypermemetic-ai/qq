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

assert_equal 18 "$fail_closed_count" "fail-closed test count changed"
printf 'test-qq-delegate: fail-closed cases: %s\n' "$fail_closed_count"
printf 'test-qq-delegate: pass\n'
