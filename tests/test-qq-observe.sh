#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-observe"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[ -x "$OBSERVE" ] || fail "qq-observe is not executable"
export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
unset PI_PARENT_SPAN_ID PI_ROOT_SPAN_ID QQ_TRACE_ID
mkdir -p "$HOME"
git_common_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
repository_name="$(basename "$(dirname "$(realpath -e "$git_common_dir")")")"
store="$XDG_STATE_HOME/qq/spans/$repository_name/spans.jsonl"

span_id="$($OBSERVE id span)"
trace_id="$($OBSERVE id trace)"
[[ "$span_id" =~ ^[0-9a-f]{16}$ ]] || fail "span ID has the wrong shape"
[[ "$trace_id" =~ ^[0-9a-f]{32}$ ]] || fail "trace ID has the wrong shape"

(
  cd "$ROOT"
  "$OBSERVE" record \
    --name execute_tool --phase implementation --actor engine \
    --start 2026-07-21T10:00:00Z --end 2026-07-21T10:00:01.250Z \
    --trace-id 11111111111111111111111111111111 \
    --span-id 2222222222222222 --root-span-id 2222222222222222 \
    --attribute tool=qq-test >/dev/null
)
[ -f "$store" ] || fail "span store was not created"
assert_equal 600 "$(stat -c '%a' "$store")" "span store mode is not private"
jq -e '
  .schema_version == 1
  and .name == "execute_tool"
  and .phase == "implementation"
  and .actor == "engine"
  and .trace_id == "11111111111111111111111111111111"
  and .span_id == "2222222222222222"
  and .root_span_id == "2222222222222222"
  and .parent_span_id == null
  and .duration_ms == 1250
  and .attributes.tool == "qq-test"
' "$store" >/dev/null

session="$tmp/session.jsonl"
cat >"$session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-21T11:00:00.000Z"}
{"type":"message","timestamp":"2026-07-21T11:00:03.500Z","message":{"role":"user"}}
JSONL
(
  cd "$ROOT"
  "$OBSERVE" read-session "$session" \
    --phase orientation --actor accountable-session \
    --trace-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    --span-id bbbbbbbbbbbbbbbb >/dev/null
)
assert_equal 2 "$(wc -l <"$store")" "span records were not appended"
tail -n 1 "$store" | jq -e \
  --arg session "$(realpath "$session")" '
  .name == "invoke_workflow"
  and .source == "pi-session-jsonl"
  and .duration_ms == 3500
  and .attributes["session.file"] == $session
  and .attributes["session.entries"] == 2
' >/dev/null

set +e
(
  cd "$ROOT"
  XDG_STATE_HOME="$ROOT/.observation-test-state" \
    "$OBSERVE" record --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/refusal.stdout" 2>"$tmp/refusal.stderr"
refusal_status=$?
set -e
assert_equal 65 "$refusal_status" "worktree-local store was not refused"
assert_file_contains "$tmp/refusal.stderr" "refusing span store inside Git worktree"
[ ! -e "$ROOT/.observation-test-state" ] || fail "refusal wrote runtime state into the worktree"

set +e
(
  cd "$ROOT"
  "$OBSERVE" record --name invoke_agent --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z \
    --trace-id NOT-A-TRACE-ID
) >"$tmp/malformed.stdout" 2>"$tmp/malformed.stderr"
malformed_status=$?
set -e
assert_equal 64 "$malformed_status" "malformed trace context was accepted"
assert_equal 2 "$(wc -l <"$store")" "a refused record was appended"

assert_session_refused() {
  local label="$1" content="$2" expected="$3"
  local fixture="$tmp/$label.jsonl"
  printf '%s\n' "$content" >"$fixture"
  set +e
  (
    cd "$ROOT"
    "$OBSERVE" read-session "$fixture"
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  assert_equal 64 "$status" "$label session was accepted"
  assert_file_contains "$tmp/$label.stderr" "$expected"
  assert_equal 2 "$(wc -l <"$store")" "$label appended a span"
}

assert_session_refused version-999 \
  '{"type":"session","version":999,"timestamp":"2026-07-21T11:00:00Z"}' \
  'type=session, version=3 header'
assert_session_refused missing-version \
  '{"type":"session","timestamp":"2026-07-21T11:00:00Z"}' \
  'type=session, version=3 header'
assert_session_refused corrupt-partial \
  $'{"type":"session","version":3,"timestamp":"2026-07-21T11:00:00Z"}\n{"type":"message"' \
  'cannot read session JSONL'

assert_store_refused() {
  local label="$1" state="$2" expected="$3"
  set +e
  (
    cd "$ROOT"
    XDG_STATE_HOME="$state" timeout 2 "$OBSERVE" record \
      --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  [ "$status" -ne 124 ] || fail "$label blocked"
  [ "$status" -ne 0 ] || fail "$label unexpectedly succeeded"
  assert_file_contains "$tmp/$label.stderr" "$expected"
}

symlink_state="$tmp/symlink-state"
symlink_target="$tmp/symlink-target"
mkdir -p "$symlink_state/qq/spans/$repository_name"
printf 'sentinel\n' >"$symlink_target"
ln -s "$symlink_target" "$symlink_state/qq/spans/$repository_name/spans.jsonl"
assert_store_refused symlink-leaf "$symlink_state" 'span store leaf is not a regular file'
assert_equal sentinel "$(cat "$symlink_target")" 'symlink leaf target was modified'

fifo_state="$tmp/fifo-state"
mkdir -p "$fifo_state/qq/spans/$repository_name"
mkfifo "$fifo_state/qq/spans/$repository_name/spans.jsonl"
assert_store_refused fifo-leaf "$fifo_state" 'span store leaf is not a regular file'

escape_state="$tmp/escape-state"
escape_target="$tmp/escape-target"
mkdir -p "$escape_state" "$escape_target"
ln -s "$escape_target" "$escape_state/qq"
assert_store_refused store-dir-escape "$escape_state" 'span store escapes the resolved state root'
[ ! -e "$escape_target/spans" ] || fail 'store directory escape wrote outside the state root'

# Pause the final Python process after the shell has validated its store, then
# replace that checked directory with a symlink. The eventual open must not
# follow the swapped ancestor outside the state root.
real_python="$(command -v python3)"
delayed_python="$tmp/delayed-python"
cat >"$delayed_python" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${2:-}" = record ] && [ -n "${DELAYED_PYTHON_READY:-}" ]; then
  : >"$DELAYED_PYTHON_READY"
  until [ -e "$DELAYED_PYTHON_RELEASE" ]; do sleep 0.01; done
fi
exec "$REAL_PYTHON" "$@"
SH
chmod +x "$delayed_python"
ancestor_state="$tmp/ancestor-state"
ancestor_target="$tmp/ancestor-target"
mkdir -p "$ancestor_target"
set +e
(
  cd "$ROOT"
  REAL_PYTHON="$real_python" \
  DELAYED_PYTHON_READY="$tmp/ancestor-ready" \
  DELAYED_PYTHON_RELEASE="$tmp/ancestor-release" \
  QQ_PYTHON3_BIN="$delayed_python" \
  XDG_STATE_HOME="$ancestor_state" \
    timeout 3 "$OBSERVE" record --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/ancestor-swap.stdout" 2>"$tmp/ancestor-swap.stderr" &
ancestor_pid=$!
set -e
for _ in $(seq 1 200); do
  [ -e "$tmp/ancestor-ready" ] && break
  sleep 0.01
done
[ -e "$tmp/ancestor-ready" ] || fail 'ancestor swap probe did not reach the post-validation window'
ancestor_store="$ancestor_state/qq/spans/$repository_name"
[ -d "$ancestor_store" ] || fail 'ancestor swap probe did not validate the store directory'
mv "$ancestor_store" "$ancestor_store.checked"
ln -s "$ancestor_target" "$ancestor_store"
: >"$tmp/ancestor-release"
set +e
wait "$ancestor_pid"
ancestor_status=$?
set -e
[ "$ancestor_status" -ne 124 ] || fail 'ancestor swap probe blocked'
[ "$ancestor_status" -ne 0 ] || fail 'swapped store ancestor was accepted'
[ ! -e "$ancestor_target/spans.jsonl" ] || fail 'swapped store ancestor redirected a span outside the state root'

# Delay only the leaf open, after append() has completed its lstat, and swap a
# FIFO into that gap. The probe open must return without waiting for a reader.
open_hook_dir="$tmp/open-hook"
mkdir "$open_hook_dir"
cat >"$open_hook_dir/sitecustomize.py" <<'PY'
import os
from pathlib import Path
import time

real_open = os.open

def delayed_open(path, flags, *args, **kwargs):
    if os.path.basename(os.fspath(path)) == "spans.jsonl":
        Path(os.environ["DELAYED_OPEN_READY"]).touch()
        while not Path(os.environ["DELAYED_OPEN_RELEASE"]).exists():
            time.sleep(0.01)
    return real_open(path, flags, *args, **kwargs)

os.open = delayed_open
PY
fifo_swap_state="$tmp/fifo-swap-state"
set +e
(
  cd "$ROOT"
  DELAYED_OPEN_READY="$tmp/fifo-swap-ready" \
  DELAYED_OPEN_RELEASE="$tmp/fifo-swap-release" \
  PYTHONPATH="$open_hook_dir" \
  XDG_STATE_HOME="$fifo_swap_state" \
    timeout 2 "$OBSERVE" record --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/fifo-swap.stdout" 2>"$tmp/fifo-swap.stderr" &
fifo_swap_pid=$!
set -e
for _ in $(seq 1 200); do
  [ -e "$tmp/fifo-swap-ready" ] && break
  sleep 0.01
done
[ -e "$tmp/fifo-swap-ready" ] || fail 'FIFO swap probe did not reach the lstat-open window'
fifo_swap_leaf="$fifo_swap_state/qq/spans/$repository_name/spans.jsonl"
mkfifo "$fifo_swap_leaf"
: >"$tmp/fifo-swap-release"
set +e
wait "$fifo_swap_pid"
fifo_swap_status=$?
set -e
[ "$fifo_swap_status" -ne 124 ] || fail 'FIFO swapped after lstat blocked the probe open'
[ "$fifo_swap_status" -ne 0 ] || fail 'FIFO swapped after lstat was accepted'
[ -p "$fifo_swap_leaf" ] || fail 'FIFO swap probe did not preserve its special-file leaf'

fixture_primary="$tmp/repository-primary"
fixture_linked="$tmp/repository-linked"
git init -q "$fixture_primary"
git -C "$fixture_primary" -c user.name=test -c user.email=test@example.invalid \
  commit --allow-empty -qm base
git -C "$fixture_primary" worktree add -q -b observe-linked "$fixture_linked"
linked_state="$tmp/linked-state"
(
  cd "$fixture_linked"
  XDG_STATE_HOME="$linked_state" "$OBSERVE" record \
    --name linked_test --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z >/dev/null
)
primary_store="$linked_state/qq/spans/$(basename "$fixture_primary")/spans.jsonl"
[ -f "$primary_store" ] || fail 'linked-worktree span did not land in the primary Repository store'
[ ! -e "$linked_state/qq/spans/$(basename "$fixture_linked")" ] \
  || fail 'linked-worktree span created a basename-keyed store'

summary_state="$tmp/summary-state"
summary_store="$summary_state/qq/spans/$repository_name/spans.jsonl"
mkdir -p "$(dirname "$summary_store")"
summary_span() {
  local start="$1" phase="$2" name="$3" actor="$4" duration="$5" trace="$6" status="$7"
  jq -cn \
    --arg start "$start" --arg phase "$phase" --arg name "$name" \
    --arg actor "$actor" --argjson duration "$duration" --arg trace "$trace" \
    --arg status "$status" '
    {
      schema_version: 1,
      trace_id: $trace,
      span_id: "2222222222222222",
      parent_span_id: null,
      root_span_id: "2222222222222222",
      name: $name,
      phase: (if $phase == "null" then null else $phase end),
      actor: $actor,
      start_time: $start,
      end_time: $start,
      duration_ms: $duration,
      status: $status,
      source: "test-fixture",
      attributes: {}
    }'
}
{
  summary_span 2026-01-01T23:59:59Z implementation outside-before engine 900 \
    00000000000000000000000000000000 ok
  summary_span 2026-01-02T00:00:00Z implementation repeat alpha 100 \
    11111111111111111111111111111111 ok
  summary_span 2026-01-02T01:00:00Z implementation repeat alpha 300 \
    11111111111111111111111111111111 error
  summary_span 2026-01-03T00:00:00Z review inspect beta 200 \
    22222222222222222222222222222222 ok
  summary_span 2026-01-02T02:00:00Z null unphased gamma 50 \
    33333333333333333333333333333333 timeout
  for number in $(seq -w 1 21); do
    summary_span 2026-01-02T03:00:00Z orientation "task-$number" worker "$((10#$number))" \
      44444444444444444444444444444444 ok
  done
  printf '%s\n' '{not-json' '[]'
  summary_span 2026-01-03T00:00:01Z delivery outside-after engine 800 \
    55555555555555555555555555555555 ok
} >"$summary_store"
cp "$summary_store" "$tmp/summary-store.before"

(
  cd "$ROOT"
  XDG_STATE_HOME="$summary_state" "$OBSERVE" summarize \
    --since 2026-01-02T00:00:00Z --until 2026-01-03T00:00:00Z \
    >"$tmp/summary.txt"
  XDG_STATE_HOME="$summary_state" "$OBSERVE" summarize \
    --since 2026-01-02T00:00:00Z --until 2026-01-03T00:00:00Z --json \
    >"$tmp/summary.json"
  XDG_STATE_HOME="$summary_state" "$OBSERVE" summarize \
    --since 2026-01-03T00:00:00Z --until 2026-01-03T00:00:00Z \
    >"$tmp/ok-only-summary.txt"
)
cmp "$tmp/summary-store.before" "$summary_store" \
  || fail 'summarize modified the span store'
assert_file_contains "$tmp/summary.txt" 'Window: [2026-01-02T00:00:00Z, 2026-01-03T00:00:00Z]'
assert_file_contains "$tmp/summary.txt" 'Spans: 25'
assert_file_contains "$tmp/summary.txt" 'Traces: 4'
assert_file_contains "$tmp/summary.txt" 'Malformed lines skipped: 2'
assert_file_contains "$tmp/summary.txt" 'implementation       2     400.0    200.0    100.0    300.0'
assert_file_contains "$tmp/summary.txt" 'orientation         21     231.0     11.0     11.0     20.0'
assert_file_contains "$tmp/summary.txt" 'review               1     200.0    200.0    200.0    200.0'
assert_file_contains "$tmp/summary.txt" '(none)               1      50.0     50.0     50.0     50.0'
assert_equal 20 "$(awk '/^Span recurrence$/ {seen=1; next} /^Non-ok statuses$/ {seen=0} seen && /^[^ -]/ {rows++} END {print rows-1}' "$tmp/summary.txt")" \
  'recurrence report did not contain exactly 20 rows'
assert_equal repeat "$(awk '/^Span recurrence$/ {seen=1; next} seen && $1 == "repeat" {print $1; exit}' "$tmp/summary.txt")" \
  'highest-duration recurrence was not first'
assert_file_contains "$tmp/summary.txt" 'task-05'
if grep -Eq '^task-0[1-4][[:space:]]' "$tmp/summary.txt"; then
  fail 'recurrence report did not cut off after the top 20 pairs'
fi
assert_file_contains "$tmp/summary.txt" 'error       1'
assert_file_contains "$tmp/summary.txt" 'timeout     1'
assert_file_contains "$tmp/ok-only-summary.txt" 'Spans: 1'
assert_file_not_matches "$tmp/ok-only-summary.txt" '^Non-ok statuses$' \
  'status section was printed when every selected span was ok'

jq -e '
  .window == {since:"2026-01-02T00:00:00Z", until:"2026-01-03T00:00:00Z"}
  and .spans == 25 and .traces == 4 and .skipped == 2
  and .phases == [
    {phase:"implementation", spans:2, total_ms:400.0, mean_ms:200.0, p50_ms:100.0, p95_ms:300.0},
    {phase:"orientation", spans:21, total_ms:231.0, mean_ms:11.0, p50_ms:11.0, p95_ms:20.0},
    {phase:"review", spans:1, total_ms:200.0, mean_ms:200.0, p50_ms:200.0, p95_ms:200.0},
    {phase:null, spans:1, total_ms:50.0, mean_ms:50.0, p50_ms:50.0, p95_ms:50.0}
  ]
  and (.recurrence | length) == 20
  and .recurrence[0] == {name:"repeat", actor:"alpha", runs:2, total_ms:400.0, mean_ms:200.0}
  and .recurrence[3] == {name:"task-21", actor:"worker", runs:1, total_ms:21.0, mean_ms:21.0}
  and .recurrence[-1] == {name:"task-05", actor:"worker", runs:1, total_ms:5.0, mean_ms:5.0}
  and .statuses == [{status:"error", count:1}, {status:"timeout", count:1}]
' "$tmp/summary.json" >/dev/null || fail 'JSON summary did not match the text report aggregates'

outcome_state="$tmp/outcome-state"
outcome_store="$outcome_state/qq/spans/$repository_name/spans.jsonl"
outcome_runtime="$tmp/outcome-runtime"
mkdir -p "$(dirname "$outcome_store")" "$outcome_runtime/async-subagent-runs"
outcome_span() {
  local span_id="$1" name="$2" source="$3" exit_status="$4" run_id="$5"
  jq -cn \
    --arg span_id "$span_id" --arg name "$name" --arg source "$source" \
    --arg exit_status "$exit_status" --arg run_id "$run_id" '
    {
      schema_version: 1,
      trace_id: "99999999999999999999999999999999",
      span_id: $span_id,
      parent_span_id: null,
      root_span_id: $span_id,
      name: $name,
      phase: "implementation",
      actor: "implementer",
      start_time: "2026-01-04T00:00:00Z",
      end_time: "2026-01-04T00:00:01Z",
      duration_ms: 1000,
      status: "error",
      source: $source,
      attributes: {"exit.status": $exit_status, "run.id": $run_id}
    }'
}
for state in complete failed stopped; do
  mkdir -p "$outcome_runtime/async-subagent-runs/$state"
  printf '{"state":"%s"}\n' "$state" \
    >"$outcome_runtime/async-subagent-runs/$state/status.json"
done
mkdir -p \
  "$outcome_runtime/async-subagent-runs/non-dispatch" \
  "$outcome_runtime/async-subagent-runs/non-signal"
printf '{"state":"complete"}\n' \
  >"$outcome_runtime/async-subagent-runs/non-dispatch/status.json"
printf '{"state":"complete"}\n' \
  >"$outcome_runtime/async-subagent-runs/non-signal/status.json"
{
  outcome_span aaaaaaaaaaaaaaaa teardown-complete qq-dispatch 143 complete
  outcome_span bbbbbbbbbbbbbbbb teardown-failed qq-dispatch 130 failed
  outcome_span cccccccccccccccc teardown-stopped qq-dispatch 129 stopped
  outcome_span dddddddddddddddd teardown-missing qq-dispatch 143 missing
  outcome_span eeeeeeeeeeeeeeee non-dispatch other-source 143 non-dispatch
  outcome_span ffffffffffffffff non-signal qq-dispatch 124 non-signal
  outcome_span 1212121212121212 manual-run qq-dispatch 143 manual
} >"$outcome_store"
cp "$outcome_store" "$tmp/outcome-store.before"
(
  cd "$ROOT"
  XDG_STATE_HOME="$outcome_state" QQ_DISPATCH_RUNTIME_ROOT="$outcome_runtime" \
    "$OBSERVE" summarize >"$tmp/outcome-summary.txt"
  XDG_STATE_HOME="$outcome_state" QQ_DISPATCH_RUNTIME_ROOT="$outcome_runtime" \
    "$OBSERVE" summarize --json >"$tmp/outcome-summary.json"
)
cmp "$tmp/outcome-store.before" "$outcome_store" \
  || fail 'outcome resolution modified the span store'
assert_file_contains "$tmp/outcome-summary.txt" 'Spans: 7'
assert_file_contains "$tmp/outcome-summary.txt" 'error       6'
jq -e '
  def named($name): .span_statuses[] | select(.name == $name);
  .statuses == [{status:"error", count:6}]
  and (named("teardown-complete") |
    .raw_status == "error" and .status == "ok"
    and .outcome == {resolved:"complete", note:"teardown-signal"})
  and (named("teardown-failed") |
    .raw_status == "error" and .status == "error"
    and .outcome == {resolved:"failed", note:"teardown-signal"})
  and (named("teardown-stopped") |
    .raw_status == "error" and .status == "error"
    and .outcome == {resolved:"stopped", note:"teardown-signal"})
  and (named("teardown-missing") |
    .raw_status == "error" and .status == "error"
    and .outcome == {resolved:"unresolved", note:"teardown-signal"})
  and (named("non-dispatch") |
    .raw_status == "error" and .status == "error" and (has("outcome") | not))
  and (named("non-signal") |
    .raw_status == "error" and .status == "error" and (has("outcome") | not))
  and (named("manual-run") |
    .raw_status == "error" and .status == "error" and (has("outcome") | not))
' "$tmp/outcome-summary.json" >/dev/null \
  || fail 'teardown span statuses did not reflect run outcomes'

empty_state="$tmp/empty-summary-state"
empty_store="$empty_state/qq/spans/$repository_name/spans.jsonl"
(
  cd "$ROOT"
  XDG_STATE_HOME="$empty_state" "$OBSERVE" summarize >"$tmp/empty-summary.txt"
)
assert_equal $'Window: all\nSpans: 0\nTraces: 0\nMalformed lines skipped: 0' \
  "$(cat "$tmp/empty-summary.txt")" 'empty store summary was not header-only'
[ ! -e "$empty_store" ] || fail 'summarize created an absent span store file'

set +e
(
  cd "$ROOT"
  XDG_STATE_HOME="$symlink_state" "$OBSERVE" summarize
) >"$tmp/summarize-symlink.stdout" 2>"$tmp/summarize-symlink.stderr"
summarize_symlink_status=$?
set -e
assert_equal 64 "$summarize_symlink_status" 'summarize accepted a symlink store leaf'
assert_file_contains "$tmp/summarize-symlink.stderr" 'span store leaf is not a regular file'
assert_equal sentinel "$(cat "$symlink_target")" 'summarize modified a symlink leaf target'

set +e
(
  cd "$ROOT"
  XDG_STATE_HOME="$summary_state" "$OBSERVE" summarize --since 2026-01-02T00:00:00
) >"$tmp/summarize-time.stdout" 2>"$tmp/summarize-time.stderr"
summarize_time_status=$?
set -e
assert_equal 64 "$summarize_time_status" 'summarize accepted a timezone-free window bound'
assert_file_contains "$tmp/summarize-time.stderr" 'timestamp requires a timezone'

outside="$tmp/not-a-worktree"
mkdir "$outside"
set +e
(
  cd "$outside"
  "$OBSERVE" record --name outside --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/outside.stdout" 2>"$tmp/outside.stderr"
outside_status=$?
set -e
assert_equal 65 "$outside_status" 'non-worktree invocation was accepted'
assert_file_contains "$tmp/outside.stderr" 'not in a Git worktree'

# Adversarial/malformed store lines must be skipped, never crash nor poison.
adversarial_state="$tmp/adversarial-state"
adversarial_store="$adversarial_state/qq/spans/$repository_name/spans.jsonl"
mkdir -p "$(dirname "$adversarial_store")"
summary_span 2026-01-02T00:00:00Z review honest delta 100 \
  66666666666666666666666666666666 ok >"$adversarial_store"
{
  python3 -c 'print("{\"schema_version\":1,\"duration_ms\":" + "9"*5000 + ",\"name\":\"big\",\"actor\":\"a\",\"start_time\":\"2026-01-02T00:00:00Z\"}")'
  jq -cn '{
    schema_version: 1, trace_id: "77777777777777777777777777777777",
    span_id: "3333333333333333", parent_span_id: null,
    root_span_id: "3333333333333333", name: "rewound", phase: "review",
    actor: "a", start_time: "2026-01-02T01:00:00Z",
    end_time: "2026-01-02T00:00:00Z", duration_ms: 5.0,
    status: "ok", source: "test-fixture", attributes: {}
  }'
  jq -cn '{
    schema_version: 1, trace_id: "88888888888888888888888888888888",
    span_id: "4444444444444444", parent_span_id: null,
    root_span_id: "4444444444444444", name: "inflated", phase: "review",
    actor: "a", start_time: "2026-01-02T00:00:00Z",
    end_time: "2026-01-02T00:01:00Z", duration_ms: 999999999.0,
    status: "ok", source: "test-fixture", attributes: {}
  }'
} >>"$adversarial_store"
(
  cd "$ROOT"
  XDG_STATE_HOME="$adversarial_state" "$OBSERVE" summarize >"$tmp/adversarial.txt"
  XDG_STATE_HOME="$adversarial_state" "$OBSERVE" summarize --json >"$tmp/adversarial.json"
)
assert_file_contains "$tmp/adversarial.txt" 'Spans: 1'
assert_file_contains "$tmp/adversarial.txt" 'Malformed lines skipped: 3'
jq -e '.spans == 1 and .skipped == 3 and (.phases[0].total_ms | isfinite)' \
  "$tmp/adversarial.json" >/dev/null \
  || fail 'JSON summary over adversarial lines was invalid or poisoned'

printf 'test-qq-observe: pass\n'
