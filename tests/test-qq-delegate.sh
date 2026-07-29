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
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

launcher_tmp="$tmp/launcher-tmp"
runtime_root="$launcher_tmp/pi-subagents-uid-$(id -u)"
test_home="$tmp/home"
mkdir -p "$runtime_root" "$test_home/.pi/agent"
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
unset QQ_DISPATCH_RUN_DIR QQ_DISPATCH_TIMEOUT CONTEXT7_API_KEY PI_SUBAGENT_PARENT_SESSION

[ -x "$ENGINE" ] || fail "missing engine: $ENGINE"
[ -x "$SUPERVISOR" ] || fail "missing process-tree supervisor: $SUPERVISOR"

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

fake_observe="$tmp/fake-observe"
cat >"$fake_observe" <<'SH'
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
    printf '%s\n' "$*" >>"$FAKE_OBSERVE_LOG"
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$fake_observe"

fixture="$tmp/fixture"
mkdir -p "$fixture/bin/lib" "$fixture/delegation/manifests/agents" \
  "$fixture/delegation/policies"
git init -q -b main "$fixture"
git -C "$fixture" -c user.name=test -c user.email=test@example.invalid \
  -c commit.gpgSign=false commit --allow-empty -qm base
cp "$ENGINE" "$fixture/bin/qq-delegate"
cp "$SUPERVISOR" "$fixture/bin/lib/qq-process-tree-supervisor.py"
cp "$fake_pi" "$fixture/bin/pi"
cp "$fake_observe" "$fixture/bin/qq-observe"
cp "$ROOT"/delegation/manifests/agents/*.md "$fixture/delegation/manifests/agents/"
cp "$ROOT/delegation/policies/execution-profiles.json" \
  "$fixture/delegation/policies/execution-profiles.json"
chmod +x "$fixture/bin/qq-delegate" "$fixture/bin/pi" \
  "$fixture/bin/qq-observe" "$fixture/bin/lib/qq-process-tree-supervisor.py"
fixture_engine="$fixture/bin/qq-delegate"
policy="$fixture/delegation/policies/execution-profiles.json"
export FAKE_OBSERVE_LOG="$tmp/observe.log"
: >"$FAKE_OBSERVE_LOG"

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

# Happy path: argv, prompt, environment, artifacts, discovery record, and span.
parent_session="12345678-1234-4abc-8def-1234567890ab"
happy_run="$(new_run happy)"
run_case happy reviewer "$fixture" "$happy_run/BRIEF.md" \
  PI_SUBAGENT_PARENT_SESSION="$parent_session" \
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  QQ_EXECUTION_PROFILE_LAUNCHER=/bad/launcher \
  QQ_EXECUTION_PROFILE_LAUNCHER_ROLE=reviewer \
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
cmp "$test_home/.pi/agent/auth.json" "$happy_run/pi-config/auth.json" >/dev/null \
  || fail "staged auth differs"
grep -Fxq "QQ_DISPATCH_RUN_DIR=$happy_run" "$happy_run/child.env" || fail "run dir was not exported"
grep -Fxq "XDG_CACHE_HOME=$happy_run/cache" "$happy_run/child.env" || fail "cache dir was not exported"
grep -Fxq "PI_CODING_AGENT_DIR=$happy_run/pi-config" "$happy_run/child.env" || fail "Pi config was not redirected"
grep -Fxq "PI_CODING_AGENT_SESSION_DIR=$happy_run/sessions" "$happy_run/child.env" || fail "sessions were not redirected"
grep -Fxq 'PI_OFFLINE=1' "$happy_run/child.env" || fail "offline mode was not exported"
if grep -Eq '^(PI_SUBAGENT_|QQ_EXECUTION_PROFILE_LAUNCHER|QQ_DISPATCH_RUN_DIR=/inherited)' "$happy_run/child.env"; then
  fail "child inherited a scrubbed variable"
fi
assert_file_contains "$happy_run/output.jsonl" '"event":"fixture-output"'
assert_file_contains "$happy_run/stderr.log" 'fixture-stderr'
jq -e --arg run "$happy_run" --arg cwd "$fixture" '
  .schema == "qq-run-terminal" and .version == 2
  and (.run_id | test("^[0-9a-f-]{36}$")) and .agent == "reviewer"
  and .exit_code == 0 and .timed_out == false and .cwd == $cwd
  and .run_dir == $run and .output_log == ($run + "/output.jsonl")
  and .sessions_dir == ($run + "/sessions")
  and (.started_at | test("Z$")) and (.ended_at | test("Z$"))
' "$happy_run/TERMINAL" >/dev/null
happy_id="$(jq -r .run_id "$happy_run/TERMINAL")"
happy_record="$runtime_root/async-subagent-runs/$happy_id/status.json"
jq -e --arg session "$parent_session" --arg run "$happy_run" '
  keys == ["cwd","isNested","lastActivityAt","mode","runId","sessionFile","sessionId","startedAt","state"]
  and .mode == "single" and .state == "completed" and .isNested == false
  and .sessionId == $session and .sessionFile == ($run + "/sessions/nested/child.jsonl")
  and (.startedAt | type == "number") and (.lastActivityAt | type == "number")
' "$happy_record" >/dev/null
[ "$(stat -c %a "$happy_record")" = 600 ] || fail "status record mode is not 600"
assert_file_contains "$FAKE_OBSERVE_LOG" '--name invoke_agent --phase review --actor reviewer'
assert_file_contains "$FAKE_OBSERVE_LOG" "run.id=$happy_id"
assert_file_contains "$FAKE_OBSERVE_LOG" 'child.index=0'
assert_file_contains "$FAKE_OBSERVE_LOG" "worktree=$fixture"
assert_file_contains "$FAKE_OBSERVE_LOG" 'exit.status=0'

# A child failure remains the run result and is recorded as failed.
failed_run="$(new_run child-failed 'exit=3')"
run_case child-failed reviewer "$fixture" "$failed_run/BRIEF.md"
assert_equal 3 "$RUN_STATUS" "child exit 3 was not preserved"
jq -e '.exit_code == 3 and .timed_out == false' "$failed_run/TERMINAL" >/dev/null
failed_id="$(jq -r .run_id "$failed_run/TERMINAL")"
jq -e '.state == "failed"' "$runtime_root/async-subagent-runs/$failed_id/status.json" >/dev/null

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
python3 - "$policy" serviceClass flex <<'PY'
import json
from pathlib import Path
import sys
path = Path(sys.argv[1]); value = json.loads(path.read_text())
value["reviewer"][sys.argv[2]] = sys.argv[3]
path.write_text(json.dumps(value))
PY
flex_run="$(new_run flex-service)"
expect_refusal flex-service 'serviceClass' \
  "$fixture_engine" run --role reviewer --cwd "$fixture" --brief "$flex_run/BRIEF.md"
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
context_key_run="$(new_run context-key)"
expect_refusal context-key 'forbids inherited CONTEXT7_API_KEY' \
  env CONTEXT7_API_KEY=secret "$fixture_engine" run --role researcher \
    --cwd "$fixture" --brief "$context_key_run/BRIEF.md"

# Missing parent session deliberately records the all-zeros accountable UUID.
fallback_run="$(new_run parent-fallback)"
run_case parent-fallback reviewer "$fixture" "$fallback_run/BRIEF.md"
assert_equal 0 "$RUN_STATUS" "parent-session fallback dispatch failed"
fallback_id="$(jq -r .run_id "$fallback_run/TERMINAL")"
jq -e '.sessionId == "00000000-0000-0000-0000-000000000000"' \
  "$runtime_root/async-subagent-runs/$fallback_id/status.json" >/dev/null

# An uppercase-hex parent session UUID canonicalizes to lowercase: the
# consumer (bin/qq-observe SESSION_UUID) matches lowercase only.
upper_session="ABCDEFAB-1234-4ABC-8DEF-ABCDEF012345"
upper_run="$(new_run parent-uppercase)"
run_case parent-uppercase reviewer "$fixture" "$upper_run/BRIEF.md" \
  PI_SUBAGENT_PARENT_SESSION="$upper_session"
assert_equal 0 "$RUN_STATUS" "uppercase parent-session dispatch failed"
upper_id="$(jq -r .run_id "$upper_run/TERMINAL")"
jq -e '.sessionId == "abcdefab-1234-4abc-8def-abcdef012345"' \
  "$runtime_root/async-subagent-runs/$upper_id/status.json" >/dev/null

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

assert_equal 17 "$fail_closed_count" "fail-closed test count changed"
printf 'test-qq-delegate: fail-closed cases: %s\n' "$fail_closed_count"
printf 'test-qq-delegate: pass\n'
