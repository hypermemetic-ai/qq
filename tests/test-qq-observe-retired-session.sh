#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-retired-session"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home" XDG_STATE_HOME="$tmp/state" QQ_DISPATCH_RUNTIME_ROOT="$tmp/delegate"
mkdir -p "$HOME" "$QQ_DISPATCH_RUNTIME_ROOT"

repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" remote add origin git@github.com:fixture/session-observer.git
git -C "$repo" config branch.main.remote origin
printf 'fixture\n' >"$repo/README.md"
git -C "$repo" add README.md
git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -qm base

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2" = "repo view" ]
printf '{"nameWithOwner":"fixture/session-observer"}\n'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"

# architect-context resolves Backlog even though this fixture has no managed
# disposition write. Keep the Check hermetic on CI, where Backlog is absent.
fake_backlog="$tmp/backlog"
printf '%s\n' '#!/usr/bin/env bash' 'exit 99' >"$fake_backlog"
chmod +x "$fake_backlog"
export QQ_BACKLOG_BIN="$fake_backlog"

fake_delegate="$tmp/qq-delegate"
cat >"$fake_delegate" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "$1" = start ] && [ "$2 $3" = "--role observer" ] && [ "$4" = "--cwd" ] && [ "$6" = "--brief" ]
brief="$7"
run_dir="$(dirname "$brief")"
case "${DELEGATE_MODE:-accepted}" in
  fail)
    printf 'fixture dispatch setup failed\n' >&2
    exit 71
    ;;
  invalid-json)
    printf '{"schema":"qq-run-launch"}\n' >"$run_dir/LAUNCH"
    printf 'not-json\n'
    exit 0
    ;;
  accepted) ;;
  *) exit 99 ;;
esac
printf '{"schema":"qq-run-launch"}\n' >"$run_dir/LAUNCH"
printf '{"schema":"qq-run-start","version":1,"run_id":"11111111-1111-4111-8111-111111111111","run_dir":"%s","state":"accepted"}\n' "$run_dir"
SH
chmod +x "$fake_delegate"
export QQ_QQ_DELEGATE_BIN="$fake_delegate"

session="$tmp/accountable.jsonl"
cp "$TESTS_DIR/fixtures/observer/pi-accountable-session.jsonl" "$session"
receipt="$tmp/retirement.json"
write_receipt() {
  local path="$1" role="$2" source="$3" retirement_id="$4"
  local ready="${5:-true}" compaction_count="${6:-1}"
  local boundary=atomic_swap_complete
  [ "$role" != architect ] || boundary=alignment_transaction_drained
  jq -cn --arg role "$role" --arg source "$source" --arg id "$retirement_id" \
    --arg boundary "$boundary" --argjson ready "$ready" \
    --argjson compaction_count "$compaction_count" '{
    schema:"qq-accountable-session.retirement",schema_version:1,
    retirement_id:$id,role:$role,session:$source,state:"retired",
    retired_at:"2026-08-03T00:00:11Z",whole_session:true,
    compaction_count:$compaction_count,
    succession_ready:$ready,retirement_boundary:$boundary,pane_closure_independent:true
  }' >"$path"
}
write_receipt "$receipt" architect "$session" retirement-architect-fixture

"$OBSERVE" retire-session --role architect --session "$session" --repo "$repo" \
  --retirement "$receipt" >"$tmp/started.json"
run_dir="$(jq -r .run_dir "$tmp/started.json")"
jq -e '.status == "started" and .duplicate == false' "$tmp/started.json" >/dev/null \
  || fail 'retirement seam did not return after asynchronous acceptance'
jq -e --arg session "$(realpath "$session")" '
  .schema_version == 3 and .integrity_status == "bound"
  and .audit_unit.kind == "accountable_session"
  and .audit_unit.role == "architect" and .audit_unit.whole_session == true
  and .audit_unit.compaction_count == 1 and .audit_unit.session_path == $session
  and (.sessions | length) == 1
  and .sessions[0].storage == "external-bound"
  and .sessions[0].source_path == $session
  and (.sessions[0].sha256 | test("^[0-9a-f]{64}$"))
' "$run_dir/package.json" >/dev/null || fail 'whole-session package binding has the wrong shape'
[ ! -e "$run_dir/sessions" ] || fail 'accountable-session package copied the transcript'
assert_file_contains "$(jq -r .dispatch_run_dir "$tmp/started.json")/BRIEF.md" \
  'no transcript copy and permits no selected range' \
  'asynchronous Observer brief did not preserve whole-session/no-copy semantics'

"$OBSERVE" session-status --role architect --session "$session" \
  --repository fixture/session-observer >"$tmp/status-started.json"
jq -e '.state == "started"' "$tmp/status-started.json" >/dev/null \
  || fail 'package-only accountable session was not projected as started'

"$OBSERVE" retire-session --role architect --session "$session" --repo "$repo" \
  --retirement "$receipt" >"$tmp/duplicate.json"
jq -e '.status == "started" and .duplicate == true' "$tmp/duplicate.json" >/dev/null \
  || fail 'identical retirement trigger was not idempotent'
conflict="$tmp/conflict.json"
write_receipt "$conflict" architect "$session" another-retirement-id
set +e
"$OBSERVE" retire-session --role architect --session "$session" --repo "$repo" \
  --retirement "$conflict" >"$tmp/conflict.out" 2>"$tmp/conflict.err"
status=$?
set -e
assert_equal 65 "$status" 'conflicting duplicate retirement trigger was accepted'
assert_file_contains "$tmp/conflict.err" 'conflicting duplicate retirement trigger'

# A dead accepted delegate is converted from started to canonical failure.
dead_session="$tmp/dead-delegate-session.jsonl"
cp "$session" "$dead_session"
dead_receipt="$tmp/dead-delegate-retirement.json"
write_receipt "$dead_receipt" architect "$dead_session" retirement-dead-delegate
"$OBSERVE" retire-session --role architect --session "$dead_session" --repo "$repo" \
  --retirement "$dead_receipt" >"$tmp/dead-started.json"
dead_dispatch="$(jq -r .dispatch_run_dir "$tmp/dead-started.json")"
printf '{"schema":"qq-run-terminal"}\n' >"$dead_dispatch/TERMINAL"
set +e
"$OBSERVE" retire-session --role architect --session "$dead_session" --repo "$repo" \
  --retirement "$dead_receipt" >"$tmp/dead.out" 2>"$tmp/dead.err"
status=$?
set -e
assert_equal 65 "$status" 'dead Observer delegate remained permanently started'
"$OBSERVE" session-status --role architect --session "$dead_session" \
  --repository fixture/session-observer >"$tmp/status-dead.json"
jq -e '.state == "failed" and (.reason | contains("terminated before finalizing"))' \
  "$tmp/status-dead.json" >/dev/null \
  || fail 'dead Observer delegate did not project canonical failure'

# Setup and malformed acceptance receipts fail terminally rather than wedging started.
invalid_session="$tmp/invalid-acceptance-session.jsonl"
cp "$session" "$invalid_session"
invalid_receipt="$tmp/invalid-acceptance-retirement.json"
write_receipt "$invalid_receipt" coordinator "$invalid_session" retirement-invalid-acceptance
export DELEGATE_MODE=invalid-json
set +e
"$OBSERVE" retire-session --role coordinator --session "$invalid_session" --repo "$repo" \
  --retirement "$invalid_receipt" >"$tmp/invalid.out" 2>"$tmp/invalid.err"
status=$?
set -e
unset DELEGATE_MODE
assert_equal 65 "$status" 'non-JSON delegate acceptance did not fail terminally'
"$OBSERVE" session-status --role coordinator --session "$invalid_session" \
  --repository fixture/session-observer >"$tmp/status-invalid.json"
jq -e '.state == "failed" and (.reason | contains("invalid JSON"))' \
  "$tmp/status-invalid.json" >/dev/null \
  || fail 'non-JSON delegate acceptance remained silently started'

setup_session="$tmp/setup-failure-session.jsonl"
cp "$session" "$setup_session"
setup_receipt="$tmp/setup-failure-retirement.json"
write_receipt "$setup_receipt" coordinator "$setup_session" retirement-setup-failure
export DELEGATE_MODE=fail
set +e
"$OBSERVE" retire-session --role coordinator --session "$setup_session" --repo "$repo" \
  --retirement "$setup_receipt" >"$tmp/setup.out" 2>"$tmp/setup.err"
status=$?
set -e
unset DELEGATE_MODE
assert_equal 65 "$status" 'delegate setup failure did not fail terminally'
"$OBSERVE" session-status --role coordinator --session "$setup_session" \
  --repository fixture/session-observer >"$tmp/status-setup.json"
jq -e '.state == "failed" and (.reason | contains("dispatch failed"))' \
  "$tmp/status-setup.json" >/dev/null \
  || fail 'delegate setup failure remained silently started'

# Retirement may precede compaction, but a second compaction is forbidden.
zero_session="$tmp/zero-compaction-session.jsonl"
grep -v '"type":"compaction"' "$session" >"$zero_session"
zero_receipt="$tmp/zero-compaction-retirement.json"
write_receipt "$zero_receipt" architect "$zero_session" retirement-zero-compaction true 0
"$OBSERVE" retire-session --role architect --session "$zero_session" --repo "$repo" \
  --retirement "$zero_receipt" >"$tmp/zero-started.json"
zero_run="$(jq -r .run_dir "$tmp/zero-started.json")"
jq -e '.audit_unit.compaction_count == 0' "$zero_run/package.json" >/dev/null \
  || fail 'eligible zero-compaction retirement was not preserved'

twice_session="$tmp/twice-compacted-session.jsonl"
cp "$session" "$twice_session"
printf '%s\n' '{"type":"compaction","timestamp":"2026-08-03T00:00:11Z","summary":"Forbidden second compaction."}' >>"$twice_session"
twice_receipt="$tmp/twice-compacted-retirement.json"
write_receipt "$twice_receipt" architect "$twice_session" retirement-twice-compacted true 2
set +e
"$OBSERVE" retire-session --role architect --session "$twice_session" --repo "$repo" \
  --retirement "$twice_receipt" >"$tmp/twice.out" 2>"$tmp/twice.err"
status=$?
set -e
assert_equal 65 "$status" 'second accountable-session compaction was accepted'
"$OBSERVE" session-status --role architect --session "$twice_session" \
  --repository fixture/session-observer >"$tmp/status-twice.json"
jq -e '.state == "failed"' "$tmp/status-twice.json" >/dev/null \
  || fail 'second-compaction refusal was not durable'

# Finalize one whole Architect session under the four-lens role contract.
facts="$tmp/accountable-facts.json"
"$OBSERVE" facts "$session" >"$facts"
analysis="$tmp/accountable-analysis.json"
audit="$(jq -c .audit_unit "$run_dir/package.json")"
turns="$(jq '[.turns_by_role[]] | add' "$facts")"
tokens="$(jq '(.token_usage.input // 0) + (.token_usage.output // 0)' "$facts")"
duration="$(jq '.wall_clock.duration_ms' "$facts")"
jq -n --arg session "$(realpath "$session")" --argjson audit "$audit" \
  --argjson turns "$turns" --argjson tokens "$tokens" --argjson duration "$duration" '
  def cite: [{session:$session,entries:[2],quote:"/bro"}];
  def lens($name;$status): {name:$name,status:$status,summary:"Whole role walk completed.",evidence: cite};
  def role($category): {category:$category,assessment:(if $category == "correction" then "violation" else "conformant" end),summary:"Whole-session evidence inspected.",evidence: cite};
  def skill($phase): {phase:$phase,assessment:"conformant",summary:"Mechanical phase facts inspected.",facts_sessions:[$session],evidence: cite};
  {
    schema:"qq-observer.analysis",schema_version:2,audit_unit:$audit,
    run:{id:"retirement-architect-fixture",sessions:[$session]},
    lenses:[lens("Simplicity";"clear"),lens("Fidelity";"finding"),lens("Trustworthiness";"clear"),lens("Efficiency";"clear")],
    entity_audit:[{entity:"Retired session",function:"Bind accountable evidence",authority:"original Pi transcript",state:"frozen",lifecycle:"existing Observer run",assessment:"necessary",evidence: cite}],
    fidelity:{kind:"accountable_session",role:"architect",walk:(["stakes_clarity","ask_comprehensibility","alignment_timing_truth","operator_decisions","scope_control","correction"]|map(role(.)))},
    skill_conformity:(["alignment","realignment","operator_facing"]|map(skill(.))),
    episodes:[{
      kind:"operator-seam.misread-direction",primary_lens:"Fidelity",
      title:"Retired-session fixture finding",sessions:[$session],evidence: cite,
      what_happened:"A cited correction was required.",root_cause:"The fixture tests role Fidelity.",
      root_cause_location:"agent-behavior",
      cost:{turns:$turns,tokens:$tokens,duration_ms:$duration,source:("facts:"+$session)},
      remedy:{type:"process",smallest_change:"Keep correction explicit."},
      confidence:"high",confidence_why:"Direct fixture evidence.",
      recurrence_key:"retired-session-fixture-key"
    }],dropped_signals:[],limitations:"full-read whole session"
  }
' >"$analysis"
"$OBSERVE" finalize --run "$run_dir" --analysis "$analysis" >"$tmp/finalized.json"
"$OBSERVE" session-status --role architect --session "$session" \
  --repository fixture/session-observer >"$tmp/status-completed.json"
jq -e '.state == "completed"' "$tmp/status-completed.json" >/dev/null \
  || fail 'successful accountable-session analysis was not projected as completed'

# Semantic failure is terminal and visible while facts remain independently reproducible.
coordinator_receipt="$tmp/coordinator-retirement.json"
write_receipt "$coordinator_receipt" coordinator "$session" retirement-coordinator-fixture
"$OBSERVE" retire-session --role coordinator --session "$session" --repo "$repo" \
  --retirement "$coordinator_receipt" >"$tmp/coordinator-started.json"
coordinator_run="$(jq -r .run_dir "$tmp/coordinator-started.json")"
"$OBSERVE" finalize --run "$coordinator_run" --failed 'semantic fixture failure' \
  >"$tmp/coordinator-failed.json"
"$OBSERVE" session-status --role coordinator --session "$session" \
  --repository fixture/session-observer >"$tmp/status-semantic-failed.json"
jq -e '.state == "failed" and .reason == "semantic fixture failure"' \
  "$tmp/status-semantic-failed.json" >/dev/null \
  || fail 'semantic analysis failure was not projected as failed'
"$OBSERVE" facts "$session" >"$tmp/facts-after-semantic-failure.json"
cmp -s "$facts" "$tmp/facts-after-semantic-failure.json" \
  || fail 'semantic failure discarded independently reproducible mechanical facts'

# Missing and prematurely closed evidence become durable failure records.
missing="$tmp/missing-session.jsonl"
missing_receipt="$tmp/missing-retirement.json"
write_receipt "$missing_receipt" architect "$missing" retirement-missing-fixture
set +e
"$OBSERVE" retire-session --role architect --session "$missing" --repo "$repo" \
  --retirement "$missing_receipt" >"$tmp/missing.out" 2>"$tmp/missing.err"
status=$?
set -e
assert_equal 65 "$status" 'missing accountable session did not fail'
"$OBSERVE" session-status --role architect --session "$missing" \
  --repository fixture/session-observer >"$tmp/status-missing-failed.json"
jq -e '.state == "failed"' "$tmp/status-missing-failed.json" >/dev/null \
  || fail 'missing accountable-session failure was not durable'
missing_run="$(jq -r .run_dir "$tmp/status-missing-failed.json")"
jq -e '.schema_version == 2 and .status == "analysis_failed"' \
  "$missing_run/analysis_failed.json" >/dev/null || fail 'missing session lacked canonical v2 failure record'

premature_session="$tmp/premature.jsonl"
cp "$session" "$premature_session"
premature_receipt="$tmp/premature-retirement.json"
write_receipt "$premature_receipt" architect "$premature_session" retirement-premature-fixture false
set +e
"$OBSERVE" retire-session --role architect --session "$premature_session" --repo "$repo" \
  --retirement "$premature_receipt" >"$tmp/premature.out" 2>"$tmp/premature.err"
status=$?
set -e
assert_equal 65 "$status" 'premature retirement receipt was accepted'
"$OBSERVE" session-status --role architect --session "$premature_session" \
  --repository fixture/session-observer >"$tmp/status-premature.json"
jq -e '.state == "failed"' "$tmp/status-premature.json" >/dev/null \
  || fail 'premature closure did not project failed lifecycle'

malformed_session="$tmp/malformed-receipt-session.jsonl"
cp "$session" "$malformed_session"
malformed_receipt="$tmp/malformed-retirement.json"
printf '{\n' >"$malformed_receipt"
set +e
"$OBSERVE" retire-session --role architect --session "$malformed_session" --repo "$repo" \
  --retirement "$malformed_receipt" >"$tmp/malformed.out" 2>"$tmp/malformed.err"
status=$?
set -e
assert_equal 65 "$status" 'malformed retirement evidence did not fail'
"$OBSERVE" session-status --role architect --session "$malformed_session" \
  --repository fixture/session-observer >"$tmp/status-malformed.json"
jq -e '.state == "failed"' "$tmp/status-malformed.json" >/dev/null \
  || fail 'malformed retirement evidence did not leave a durable failed projection'

oversized_session="$tmp/oversized-session.jsonl"
printf '%s\n' '{"type":"session","version":3,"timestamp":"2026-08-03T00:00:00Z"}' >"$oversized_session"
truncate -s 16777217 "$oversized_session"
oversized_receipt="$tmp/oversized-retirement.json"
write_receipt "$oversized_receipt" architect "$oversized_session" retirement-oversized-fixture
set +e
"$OBSERVE" retire-session --role architect --session "$oversized_session" --repo "$repo" \
  --retirement "$oversized_receipt" >"$tmp/oversized.out" 2>"$tmp/oversized.err"
status=$?
set -e
assert_equal 65 "$status" 'oversized whole-session evidence did not fail'
"$OBSERVE" session-status --role architect --session "$oversized_session" \
  --repository fixture/session-observer >"$tmp/status-oversized.json"
jq -e '.state == "failed"' "$tmp/status-oversized.json" >/dev/null \
  || fail 'oversized whole-session evidence did not leave a durable failed projection'

# A source mutation invalidates even a previously completed semantic record;
# restoring the bound bytes restores the mechanically derived projection.
cp "$session" "$tmp/original-session"
printf '%s\n' '{"type":"message","timestamp":"2026-08-03T00:00:12Z","message":{"role":"user","content":"late mutation"}}' >>"$session"
"$OBSERVE" session-status --role architect --session "$session" \
  --repository fixture/session-observer >"$tmp/status-mutated.json"
jq -e '.state == "failed" and (.reason | contains("changed"))' "$tmp/status-mutated.json" >/dev/null \
  || fail 'mutated whole-session binding was not projected as failed'
cp "$tmp/original-session" "$session"

started_session="$tmp/still-started.jsonl"
cp "$session" "$started_session"
started_receipt="$tmp/still-started-retirement.json"
write_receipt "$started_receipt" coordinator "$started_session" retirement-still-started
"$OBSERVE" retire-session --role coordinator --session "$started_session" --repo "$repo" \
  --retirement "$started_receipt" >"$tmp/still-started.json"

"$OBSERVE" architect-context >"$tmp/architect-context.json"
jq -e '
  any(.observer_health.rounds[]; .audit_unit.kind == "accountable_session" and .status == "started")
  and any(.observer_health.rounds[]; .audit_unit.kind == "accountable_session" and .status == "completed")
  and any(.observer_health.rounds[]; .audit_unit.kind == "accountable_session" and .status == "failed")
  and any(.findings[]; .recurrence_key == "retired-session-fixture-key"
    and any(.occurrences[]; .source.audit_unit.kind == "accountable_session"))
' "$tmp/architect-context.json" >/dev/null \
  || fail 'existing Observer context did not project accountable-session started/completed/failed records'

printf 'test-qq-observe-retired-session: pass\n'
