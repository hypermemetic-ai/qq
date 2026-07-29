#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-observe-routing
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home" XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"

run="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/source/pr-4"
mkdir -p "$run"
cat >"$run/package.json" <<JSON
{"assembled_at":"2026-08-01T00:00:00Z","branch":"source","merge_commit":"aaaaaaaa","merged_at":"2026-08-01T00:00:00Z","pr":4,"repo":"$ROOT","repository":"fixture/source","schema":"qq-observer.package","schema_version":2,"sessions":[],"unknown_entries":[],"variant":"guided","warnings":[]}
JSON
cat >"$run/analysis.json" <<'JSON'
{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture/source#4","sessions":["/fixture/session.jsonl"]},"episodes":[{"kind":"waste","title":"Route alpha","sessions":["/fixture/session.jsonl"],"evidence":[{"session":"/fixture/session.jsonl","entries":[1],"quote":"fixture"}],"what_happened":"Fixture.","root_cause":"Fixture.","root_cause_location":"harness-design","cost":{"turns":1,"tokens":1,"duration_ms":1,"source":"facts:/fixture/session.jsonl"},"remedy":{"type":"process","smallest_change":"Route it."},"confidence":"high","confidence_why":"Fixture.","recurrence_key":"alpha","rank":1,"no_signal":false}],"dropped_signals":[],"limitations":"Fixture."}
JSON
"$OBSERVE" ledger-update --run "$run" >/dev/null
# Global Architect context groups exact uncovered occurrences across Repositories.
second="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/other/pr-5"
mkdir -p "$second"
cat >"$second/package.json" <<JSON
{"assembled_at":"2026-08-02T00:00:00Z","branch":"other","merge_commit":"bbbbbbbb","merged_at":"2026-08-02T00:00:00Z","pr":5,"repo":"$ROOT","repository":"fixture/other","schema":"qq-observer.package","schema_version":2,"sessions":[],"unknown_entries":[],"variant":"guided","warnings":[]}
JSON
jq '.run.change="fixture/other#5" | .episodes[0].title="Route alpha again" | .episodes += [{"kind":"friction","title":"Leave beta untouched","sessions":["/fixture/session.jsonl"],"evidence":[{"session":"/fixture/session.jsonl","entries":[2],"quote":"beta evidence"}],"what_happened":"Beta.","root_cause":"Beta.","root_cause_location":"harness-design","cost":{"turns":1,"tokens":1,"duration_ms":1,"source":"facts:/fixture/session.jsonl"},"remedy":{"type":"process","smallest_change":"Route beta."},"confidence":"medium","confidence_why":"Fixture.","recurrence_key":"beta","rank":2,"no_signal":false}]' "$run/analysis.json" >"$second/analysis.json"
"$OBSERVE" ledger-update --run "$second" >/dev/null

# Architect health is a bounded, non-selectable view over Repository-qualified
# guided rounds whose observation failed or has not completed.
health_root="$XDG_STATE_HOME/qq/observer/runs/by-repository/health/repo"
health_failed="$health_root/pr-11"
health_pending="$health_root/pr-12"
health_partial="$health_root/pr-13"
health_blind="$health_root/pr-14-blind"
mkdir -p "$health_failed" "$health_pending" "$health_blind"
for spec in \
  "$health_failed:11:guided:2026-08-11T00:00:00Z" \
  "$health_pending:12:guided:2026-08-12T00:00:00Z" \
  "$health_blind:14:blind:2026-08-14T00:00:00Z"; do
  IFS=: read -r dir pr variant assembled <<<"$spec"
  jq -cn --arg repo "$ROOT" --argjson pr "$pr" --arg variant "$variant" \
    --arg assembled "$assembled" '{
      assembled_at:$assembled,branch:"health",merge_commit:"abababab",
      merged_at:$assembled,pr:$pr,repo:$repo,repository:"health/repo",
      schema:"qq-observer.package",schema_version:2,sessions:[],
      unknown_entries:[],variant:$variant,warnings:[]
    }' >"$dir/package.json"
done
long_failure_reason="$(printf 'x%.0s' {1..600})"
jq -cnS --arg reason "$long_failure_reason" '{
  reason:$reason,schema:"qq-observer.analysis",schema_version:1,
  status:"analysis_failed"
}' >"$health_failed/analysis_failed.json"
printf '%s\n' \
  '{"reason":"blind failure","schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed"}' \
  >"$health_blind/analysis_failed.json"

# Historical finalized analyses predate the one-entry rule: routed readers
# (architect context, batch verification, resolution) must ACCEPT multi-entry
# evidence in immutable history, while validate-analysis still refuses it for
# newly authored analyses (covered in test-qq-observe-validate-analysis.sh).
cp "$second/analysis.json" "$tmp/second-analysis-one-entry.json"
jq -cS '.episodes[0].evidence[0].entries = [1,2]' \
  "$second/analysis.json" >"$tmp/multi-entry-analysis.json"
mv "$tmp/multi-entry-analysis.json" "$second/analysis.json"
# Keep the fixture's ledger marker bound to its own (rewritten) analysis, as a
# run finalized under the pre-one-entry rule would record it.
cp "$second/.ledger-applied" "$tmp/marker-original.json"
new_hash="$(sha256sum "$second/analysis.json" | awk '{print $1}')"
jq -cS --arg hash "$new_hash" '.analysis_sha256 = $hash' \
  "$second/.ledger-applied" >"$tmp/marker.json"
mv "$tmp/marker.json" "$second/.ledger-applied"
"$OBSERVE" architect-context >"$tmp/multi-entry.out" 2>"$tmp/multi-entry.err" \
  || { cat "$tmp/multi-entry.err" >&2; fail 'Architect context refused a historical multi-entry evidence object'; }
mv "$tmp/second-analysis-one-entry.json" "$second/analysis.json"
mv "$tmp/marker-original.json" "$second/.ledger-applied"

# A stale ledger marker must not authorize replaced analysis bytes.
cp "$second/analysis.json" "$tmp/second-analysis-applied.json"
jq -cS '.episodes[0].title = "Replaced after ledger application"' "$second/analysis.json" >"$tmp/replaced-analysis.json"
mv "$tmp/replaced-analysis.json" "$second/analysis.json"
set +e
"$OBSERVE" architect-context >"$tmp/stale-ledger.out" 2>"$tmp/stale-ledger.err"
status=$?
set -e
assert_equal 65 "$status" 'stale ledger marker authorized replaced analysis'
mv "$tmp/second-analysis-applied.json" "$second/analysis.json"
"$OBSERVE" architect-context >"$tmp/context-health-before.json"
jq -e '
  .schema == "qq-observer.architect-context" and .schema_version == 3
  and (.context_id | test("^context-[0-9a-f]{32}$"))
  and .observer_health.omitted_rounds == 0
  and [.observer_health.rounds[] | {status,pr}] == [
    {status:"pending",pr:12},{status:"analysis_failed",pr:11}
  ]
  and (.observer_health.rounds[] | select(.pr == 11)
    | (.reason | length) == 500 and .reason_truncated == true)
  and all(.observer_health.rounds[]; .repository == "health/repo" and .pr != 14)
' "$tmp/context-health-before.json" >/dev/null \
  || fail 'Architect context did not expose bounded failed/pending guided health'
health_context_before="$(jq -r .context_id "$tmp/context-health-before.json")"
mkdir -p "$health_partial"
jq -cn --arg repo "$ROOT" '{
  assembled_at:"2026-08-13T00:00:00Z",branch:"health",merge_commit:"cdcdcdcd",
  merged_at:"2026-08-13T00:00:00Z",pr:13,repo:$repo,repository:"health/repo",
  schema:"qq-observer.package",schema_version:2,sessions:[],unknown_entries:[],
  variant:"guided",warnings:[]
}' >"$health_partial/package.json"
cp "$second/analysis.json" "$health_partial/analysis.json"
"$OBSERVE" architect-context >"$tmp/context-1.json"
jq -e --arg before "$health_context_before" '
  .schema == "qq-observer.architect-context" and .schema_version == 3
  and .context_id != $before and (.context_id | test("^context-[0-9a-f]{32}$"))
  and .pending_intakes == [] and .omitted_findings == 0 and (.findings | length) == 2
  and [.observer_health.rounds[] | {status,pr,reason}] == [
    {status:"pending",pr:13,reason:"successful analysis is not ledger-applied"},
    {status:"pending",pr:12,reason:"analysis is not finalized"},
    {status:"analysis_failed",pr:11,reason:("x" * 500)}
  ]
  and ([.findings[] | select(.recurrence_key == "alpha") | .occurrences[].source.repository] | sort) == ["fixture/other","fixture/source"]
  and ([.findings[].occurrences[].occurrence_id] | unique | length) == 3
' "$tmp/context-1.json" >/dev/null || fail 'global context lost finding evidence or health freshness'
context_id="$(jq -r .context_id "$tmp/context-1.json")"
alpha_first="$(jq -r '.findings[] | select(.recurrence_key=="alpha") | .occurrences[] | select(.source.repository=="fixture/source") | .occurrence_id' "$tmp/context-1.json")"
jq -cn --arg occurrence "$alpha_first" '[{recurrence_key:"alpha",occurrence_ids:[$occurrence],action:"set_aside",scope:"",note:"Current source evidence is set aside."}]' >"$tmp/set-aside.json"
"$OBSERVE" prepare-handoff --context "$context_id" --decisions "$tmp/set-aside.json" >"$tmp/set-aside-result.json"
set_aside_dir="$(jq -r .batch_dir "$tmp/set-aside-result.json")"
jq -e '.handoff_path == null and .batch.schema == "qq-observer.architect-batch" and .batch.decisions[0].action == "set_aside"' "$tmp/set-aside-result.json" >/dev/null \
  || fail 'set-aside-only global decision created a handoff or lost selective state'
[ ! -e "$set_aside_dir/handoff.json" ] || fail 'set-aside-only batch created accountable intake'
"$OBSERVE" architect-context >"$tmp/context-2.json"
jq -e --arg covered "$alpha_first" '
  ([.findings[].occurrences[].occurrence_id] | index($covered)) == null
  and any(.findings[]; .recurrence_key == "alpha" and (.occurrences | length) == 1)
  and any(.findings[]; .recurrence_key == "beta")
' "$tmp/context-2.json" >/dev/null || fail 'selective settlement hid untouched findings or retained the covered occurrence'

# A later same-key occurrence reopens and can join one multi-source routed batch.
third="$XDG_STATE_HOME/qq/observer/runs/by-repository/third/repo/pr-6"
mkdir -p "$third"
cat >"$third/package.json" <<JSON
{"assembled_at":"2026-08-03T00:00:00Z","branch":"third","merge_commit":"cccccccc","merged_at":"2026-08-03T00:00:00Z","pr":6,"repo":"$ROOT","repository":"third/repo","schema":"qq-observer.package","schema_version":2,"sessions":[],"unknown_entries":[],"variant":"guided","warnings":[]}
JSON
jq '.run.change="third/repo#6" | .episodes=[.episodes[0]] | .episodes[0].title="Later alpha occurrence"' "$run/analysis.json" >"$third/analysis.json"
"$OBSERVE" ledger-update --run "$third" >/dev/null
"$OBSERVE" architect-context >"$tmp/context-3.json"
jq -e 'any(.findings[]; .recurrence_key == "alpha" and ([.occurrences[].source.repository] | sort) == ["fixture/other","third/repo"])' "$tmp/context-3.json" >/dev/null \
  || fail 'later same-key occurrence did not reopen with exact source identity'
context_id="$(jq -r .context_id "$tmp/context-3.json")"
jq '[
  (.findings[] | select(.recurrence_key=="alpha") | {recurrence_key,occurrence_ids:([.occurrences[].occurrence_id]|sort),action:"route",scope:"Route current alpha evidence across both Repositories.",note:""}),
  (.findings[] | select(.recurrence_key=="beta") | {recurrence_key,occurrence_ids:([.occurrences[].occurrence_id]|sort),action:"set_aside",scope:"",note:"Explicitly set aside."})
]' "$tmp/context-3.json" >"$tmp/global-route.json"
"$OBSERVE" prepare-handoff --context "$context_id" --decisions "$tmp/global-route.json" >"$tmp/global-prepared.json"
global_batch="$(jq -r .batch_dir "$tmp/global-prepared.json")"
global_handoff="$global_batch/handoff.json"
jq -e --arg context "$context_id" '
  .handoff_path != null and .batch.schema_version == 2 and .batch.kind == "global_decision_batch"
  and .batch.context_id == $context and ([.batch.occurrences[].source.repository] | unique | sort) == ["fixture/other","third/repo"]
  and ([.batch.source_hashes[] | keys | sort] | all(. == ["analysis_sha256","package_sha256"]))
  and ([.batch.decisions[] | select(.action=="route") | .decision_id] | length) == 1
' "$tmp/global-prepared.json" >/dev/null || fail 'global handoff lost multi-source evidence, hashes, or exact routed decision identity'
cp "$global_handoff" "$tmp/global-handoff-before.json"
# The content-addressed Observer prepare seam is idempotent; the interactive tool separately rejects replay.
"$OBSERVE" prepare-handoff --context "$context_id" --decisions "$tmp/global-route.json" >"$tmp/global-again.json"
jq -e '.status == "already confirmed"' "$tmp/global-again.json" >/dev/null
cmp "$tmp/global-handoff-before.json" "$global_handoff" || fail 'idempotent global retry rewrote immutable handoff'
global_handoff_id="$(jq -r .handoff_id "$global_handoff")"
# Prepared routed intake is explicit, exact, and not offered for re-decision.
"$OBSERVE" architect-context >"$tmp/pending-context.json"
jq -e --arg batch "$global_batch" --arg handoff "$global_handoff" '
  (.pending_intakes | length) == 1
  and .pending_intakes[0].batch_dir == $batch and .pending_intakes[0].handoff_path == $handoff
  and .pending_intakes[0].status == "prepared"
  and .pending_intakes[0].attempt_statuses == []
  and ([.pending_intakes[0].decisions[] | select(.action == "route") | .scope] == ["Route current alpha evidence across both Repositories."])
  and ([.pending_intakes[0].occurrences[].occurrence_id] | length) == 3
  and all(.findings[]; .recurrence_key != "alpha" and .recurrence_key != "beta")
' "$tmp/pending-context.json" >/dev/null || fail 'pending routed intake was hidden, inexact, or re-exposed as a finding'
# Existing attempt files remain validated read-only history; no command authors new ones.
mkdir -p "$global_batch/attempts"
jq -cnS --arg id "$global_handoff_id" '{
  schema:"qq-handoff/v1",version:1,engine:"qq-handoff",action:"intake-start",
  status:"error",message:"historical fixture",handoff_id:$id,rails:[]
}' >"$tmp/historical-attempt.json"
historical_attempt_hash="$(sha256sum "$tmp/historical-attempt.json" | awk '{print $1}')"
cp "$tmp/historical-attempt.json" \
  "$global_batch/attempts/attempt-$historical_attempt_hash.json"
"$OBSERVE" architect-context >"$tmp/historical-attempt-context.json"
jq -e '
  .pending_intakes[0].status == "attempted_awaiting_result"
  and .pending_intakes[0].attempt_statuses == ["error"]
  and (.pending_intakes[0].attempt_paths | length) == 1
' "$tmp/historical-attempt-context.json" >/dev/null \
  || fail 'existing intake attempt history was not preserved read-only'
# A new same-key occurrence remains independently unsettled while the older immutable batch stays pending.
fourth="$XDG_STATE_HOME/qq/observer/runs/by-repository/fourth/repo/pr-7"
mkdir -p "$fourth"
cat >"$fourth/package.json" <<JSON
{"assembled_at":"2026-08-04T00:00:00Z","branch":"fourth","merge_commit":"dddddddd","merged_at":"2026-08-04T00:00:00Z","pr":7,"repo":"$ROOT","repository":"fourth/repo","schema":"qq-observer.package","schema_version":2,"sessions":[],"unknown_entries":[],"variant":"guided","warnings":[]}
JSON
jq '.run.change="fourth/repo#7" | .episodes=[.episodes[0]] | .episodes[0].title="Pending sibling alpha"' "$run/analysis.json" >"$fourth/analysis.json"
"$OBSERVE" ledger-update --run "$fourth" >/dev/null
"$OBSERVE" architect-context >"$tmp/pending-sibling.json"
jq -e '
  (.pending_intakes | length) == 1
  and any(.findings[]; .recurrence_key == "alpha" and (.occurrences | length) == 1 and .occurrences[0].source.repository == "fourth/repo")
  and ([.pending_intakes[0].occurrences[] | select(.recurrence_key == "alpha") | .source.repository] | sort) == ["fixture/other","third/repo"]
' "$tmp/pending-sibling.json" >/dev/null || fail 'new same-key occurrence was conflated with older pending intake'
# Canonical path and source-hash checks fail closed.
ln -s "$global_batch" "$XDG_STATE_HOME/qq/observer/architect/batches/batch-ffffffffffffffffffffffffffffffff"
set +e
"$OBSERVE" architect-context >"$tmp/global-symlink.out" 2>"$tmp/global-symlink.err"
status=$?
set -e
assert_equal 65 "$status" 'symlinked global batch was accepted'
rm "$XDG_STATE_HOME/qq/observer/architect/batches/batch-ffffffffffffffffffffffffffffffff"
cp "$third/analysis.json" "$tmp/third-analysis-before.json"
printf '\n' >>"$third/analysis.json"
set +e
"$OBSERVE" architect-context >"$tmp/global-changed.out" 2>"$tmp/global-changed.err"
status=$?
set -e
assert_equal 65 "$status" 'changed global source analysis was accepted'
mv "$tmp/third-analysis-before.json" "$third/analysis.json"

accepted="$tmp/accepted.json"
printf '[{"recurrence_key":"alpha","verdict":"accepted","scope":"Implement only alpha.","note":"Approved for intake."}]\n' >"$accepted"
"$OBSERVE" prepare-handoff --run "$run" --outcomes "$accepted" >"$tmp/prepared.json"
handoff="$run/routing/handoff.json"
jq -e --arg run "$run" '
  .status == "prepared" and .handoff.schema == "qq-observer.handoff"
  and .handoff.round.run_dir == $run and .handoff.round.repository == "fixture/source"
  and .handoff.outcomes[0].scope == "Implement only alpha."
  and .handoff.evidence[0].episode.evidence[0].quote == "fixture"
  and ([.handoff.source_hashes[] | test("^[0-9a-f]{64}$")] | all)
' "$tmp/prepared.json" >/dev/null || fail 'typed handoff omitted identity, scope, citation, or hashes'
cp "$handoff" "$tmp/handoff-before.json"
"$OBSERVE" prepare-handoff --run "$run" --outcomes "$accepted" >"$tmp/prepared-again.json"
cmp "$tmp/handoff-before.json" "$handoff" || fail 'idempotent handoff retry rewrote intent'
jq '.[0].scope = "Different scope"' "$accepted" >"$tmp/different.json"
set +e
"$OBSERVE" prepare-handoff --run "$run" --outcomes "$tmp/different.json" 2>"$tmp/conflict.err"
status=$?
set -e
assert_equal 65 "$status" 'differing handoff retry was accepted'
assert_file_contains "$tmp/conflict.err" 'append-only conflict'

# Routed outcomes cannot be discussed before complete verified Task evidence.
set +e
"$OBSERVE" mark-discussed --run "$run" --outcomes "$accepted" >"$tmp/premature.out" 2>"$tmp/premature.err"
status=$?
set -e
assert_equal 64 "$status" 'routed round was discussed before a verified result'
[ ! -e "$run/discussed.json" ] || fail 'premature discussion wrote a mark'

handoff_id="$(jq -r .handoff_id "$handoff")"
# Build current born-in-worktree Task evidence for result and resolution.
repo="$tmp/tasks-repo"; checkout="$tmp/task-change"
git init -q -b main "$repo"
mkdir -p "$repo/bin/lib" "$repo/backlog"
printf '%s\n' 'task_prefix: "feat"' >"$repo/backlog/config.yml"
cp "$OBSERVE" "$repo/bin/qq-observe"
cp "$ROOT/bin/lib/qq-bin.sh" "$repo/bin/lib/qq-bin.sh"
cp "$ROOT/bin/lib/qq_task_identity.py" "$repo/bin/lib/qq_task_identity.py"
fixture_observe="$repo/bin/qq-observe"
git -C "$repo" remote add origin git@github.com:fixture/tasks.git
git -C "$repo" config branch.main.remote origin
git -C "$repo" add bin backlog
git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -qm base
git -C "$repo" worktree add -qb feature/task "$checkout" main >/dev/null
mkdir -p "$checkout/backlog/tasks" "$checkout/backlog/docs/plans"
task_path="$checkout/backlog/tasks/feat-201.3 - Fixture.md"
plan_path="$checkout/backlog/docs/plans/doc-201 - Fixture.md"
printf '%s\n' '---' 'id: FEAT-201.3' 'status: In Progress' 'modified_files:' '  - tests/a-valid-list-scalar-that-Backlog-wraps' '    across-lines.sh' 'documentation:' '  - doc-201' '---' '<!-- SECTION:DESCRIPTION:BEGIN -->' '## Decision ledger' '- approved' '<!-- SECTION:DESCRIPTION:END -->' >"$task_path"
printf '%s\n' '---' 'id: doc-201' '---' '**Status:** APPROVED' >"$plan_path"
task_sha="$(sha256sum "$task_path" | awk '{print $1}')"
plan_sha="$(sha256sum "$plan_path" | awk '{print $1}')"
result="$tmp/result.json"
jq -cn --arg id "$handoff_id" --arg checkout "$(realpath "$checkout")" \
  --arg task "$task_path" --arg plan "$plan_path" --arg common "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" --arg tsha "$task_sha" --arg psha "$plan_sha" '{
  schema:"qq-handoff/intake-result-v1",version:1,status:"done",handoff_id:$id,
  mapping:[{item:"alpha",task_ids:["FEAT-201.3"]}],
  tasks:[{task_id:"FEAT-201.3",task_path:$task,status:"In Progress",decision_ledger:"present",
    plan_paths:[$plan],branch:"feature/task",checkout:$checkout,common_dir:$common,
    repository:"fixture/tasks",task_sha256:$tsha,plan_sha256:{($plan):$psha}}],
  verified_at:"2026-08-02T00:00:00.000Z"
}' >"$result"
# Duplicate Task ids elsewhere in the Repository topology do not override the
# receipt's explicit named-checkout subject.
duplicate_checkout="$tmp/task-duplicate"
git -C "$repo" worktree add -qb feature/duplicate "$duplicate_checkout" main >/dev/null
mkdir -p "$duplicate_checkout/backlog/tasks" "$duplicate_checkout/backlog/docs/plans"
cp "$task_path" "$duplicate_checkout/backlog/tasks/$(basename "$task_path")"
cp "$plan_path" "$duplicate_checkout/backlog/docs/plans/$(basename "$plan_path")"
jq --arg checkout "$(realpath "$duplicate_checkout")" \
  '.tasks[0].checkout=$checkout | .tasks[0].branch="feature/duplicate"' \
  "$result" >"$tmp/wrong-named-checkout-result.json"
set +e
"$fixture_observe" record-handoff-result --run "$run" \
  --receipt "$tmp/wrong-named-checkout-result.json" \
  >"$tmp/wrong-named-checkout.out" 2>"$tmp/wrong-named-checkout.err"
status=$?
set -e
assert_equal 65 "$status" 'receipt Task path outside its named checkout was accepted'
assert_file_contains "$tmp/wrong-named-checkout.err" "named checkout's backlog/tasks" \
  'wrong named checkout refusal did not identify the failed invariant'
[ ! -e "$run/routing/result.json" ] || fail 'wrong named checkout mutated the Observer run'

set +e
"$OBSERVE" record-handoff-result --run "$run" --receipt "$result"   >"$tmp/foreign-result.out" 2>"$tmp/foreign-result.err"
status=$?
set -e
assert_equal 65 "$status" 'foreign Repository Task result was accepted by the qq Observer'
assert_file_contains "$tmp/foreign-result.err" 'running qq topology'
[ ! -e "$run/routing/result.json" ] || fail 'foreign Task result mutated the Observer run'
# Generic intake shape is not authority to use another Repository prefix.
jq '(.mapping[].task_ids[], .tasks[].task_id) = "T-201.3"' "$result" \
  >"$tmp/mismatched-prefix-result.json"
set +e
"$fixture_observe" record-handoff-result --run "$run" \
  --receipt "$tmp/mismatched-prefix-result.json" \
  >"$tmp/mismatched-prefix.out" 2>"$tmp/mismatched-prefix.err"
status=$?
set -e
assert_equal 65 "$status" 'mismatched configured Task prefix was accepted by Observer intake'
[ ! -e "$run/routing/result.json" ] \
  || fail 'mismatched configured Task prefix mutated the Observer run'
"$fixture_observe" record-handoff-result --run "$run" --receipt "$result" >/dev/null
[ -f "$run/routing/result.json" ] \
  || fail 'complete named-checkout evidence was rejected because another worktree shares its Task id'
# Global results map every routed decision ID (set-aside decisions remain Task-free).
global_decision_id="$(jq -r '.decisions[] | select(.action=="route") | .decision_id' "$global_handoff")"
jq --arg id "$global_handoff_id" --arg item "$global_decision_id" '.handoff_id=$id | .mapping=[{item:$item,task_ids:["FEAT-201.3"]}]' "$result" >"$tmp/global-result.json"
"$fixture_observe" record-handoff-result --batch "$global_batch" --receipt "$tmp/global-result.json" >/dev/null
[ -f "$global_batch/result.json" ] || fail 'verified global intake result was not recorded beside its batch'
"$OBSERVE" architect-context >"$tmp/completed-global-context.json"
jq -e '
  .pending_intakes == []
  and any(.findings[]; .recurrence_key == "alpha" and (.occurrences | length) == 1 and .occurrences[0].source.repository == "fourth/repo")
  and all(.findings[]; all(.occurrences[]; .source.repository != "fixture/other" and .source.repository != "third/repo"))
' "$tmp/completed-global-context.json" >/dev/null || fail 'verified result did not retire exact pending routed occurrences'
jq '.mapping=[]' "$tmp/global-result.json" >"$tmp/global-incomplete-result.json"
set +e
"$fixture_observe" record-handoff-result --batch "$global_batch" --receipt "$tmp/global-incomplete-result.json" 2>"$tmp/global-incomplete.err"
status=$?
set -e
assert_equal 65 "$status" 'incomplete global decision mapping was accepted'
cp "$task_path" "$tmp/task-before-stale-check"
cp "$plan_path" "$tmp/plan-before-stale-check"
printf '%s\n' '---' 'id: FEAT-201.3' 'status: In Progress' 'documentation: []' '---' >"$task_path"
printf '%s\n' '---' 'id: doc-201' '---' 'not approved' >"$plan_path"
set +e
"$OBSERVE" mark-discussed --run "$run" --outcomes "$accepted" >"$tmp/stale-mark.out" 2>"$tmp/stale-mark.err"
status=$?
set -e
assert_equal 65 "$status" 'routed round was discussed after its verified Task/plan evidence became stale'
[ ! -e "$run/discussed.json" ] || fail 'stale routed evidence wrote a discussion mark'
mv "$tmp/task-before-stale-check" "$task_path"
mv "$tmp/plan-before-stale-check" "$plan_path"
printf '\n## Implementation Notes\n\nWork started after verified intake.\n' >>"$task_path"
"$OBSERVE" mark-discussed --run "$run" --outcomes "$accepted" >/dev/null
[ -f "$run/discussed.json" ] || fail 'verified routed result did not permit explicit discussion mark'
"$OBSERVE" rounds >"$tmp/rounds.json"
jq -e --arg run "$run" 'any(.[]; .run_dir == $run and .task_ids == ["FEAT-201.3"] and .resolved == false)' "$tmp/rounds.json" >/dev/null \
  || fail 'rounds omitted routed unresolved Task identity'

# A valid historical guided disposition covers only that round's exact occurrence;
# an undisposed sibling occurrence remains global. Identity/key mismatch refuses.
historical="$XDG_STATE_HOME/qq/observer/runs/by-repository/history/repo/pr-8"
historical_sibling="$XDG_STATE_HOME/qq/observer/runs/by-repository/history/repo/pr-9"
for pair in "$historical:8:2026-08-05T00:00:00Z" "$historical_sibling:9:2026-08-06T00:00:00Z"; do
  IFS=: read -r dir pr assembled <<<"$pair"
  mkdir -p "$dir"
  jq -cn --arg repo "$ROOT" --argjson pr "$pr" --arg assembled "$assembled" '{assembled_at:$assembled,branch:"history",merge_commit:"eeeeeeee",merged_at:$assembled,pr:$pr,repo:$repo,repository:"history/repo",schema:"qq-observer.package",schema_version:2,sessions:[],unknown_entries:[],variant:"guided",warnings:[]}' >"$dir/package.json"
  jq --argjson pr "$pr" '.run.change=("history/repo#"+($pr|tostring)) | .episodes=[.episodes[0]] | .episodes[0].recurrence_key="historical-key" | .episodes[0].title=("Historical "+($pr|tostring))' "$run/analysis.json" >"$dir/analysis.json"
  "$OBSERVE" ledger-update --run "$dir" >/dev/null
done
printf '[{"recurrence_key":"historical-key","verdict":"rejected","scope":"","note":"Discussed previously."}]\n' >"$tmp/historical-outcomes.json"
"$OBSERVE" mark-discussed --run "$historical" --outcomes "$tmp/historical-outcomes.json" >/dev/null
"$OBSERVE" architect-context >"$tmp/historical-context.json"
jq -e 'any(.findings[]; .recurrence_key == "historical-key" and (.occurrences | length) == 1 and .occurrences[0].source.pr == 9)' "$tmp/historical-context.json" >/dev/null \
  || fail 'historical disposition did not cover only its exact analysis occurrence'
cp "$historical/discussed.json" "$tmp/historical-mark.json"
jq -cS '.repository="foreign/repo"' "$tmp/historical-mark.json" >"$historical/discussed.json"
set +e
"$OBSERVE" architect-context >"$tmp/mismatched-mark.out" 2>"$tmp/mismatched-mark.err"; status=$?
set -e
assert_equal 65 "$status" 'mismatched historical disposition identity was accepted'
jq -cS '.outcomes[0].recurrence_key="wrong-key"' "$tmp/historical-mark.json" >"$historical/discussed.json"
set +e
"$OBSERVE" architect-context >"$tmp/malformed-mark.out" 2>"$tmp/malformed-mark.err"; status=$?
set -e
assert_equal 65 "$status" 'historical disposition with mismatched analysis keys was accepted'
cp "$tmp/historical-mark.json" "$historical/discussed.json"

# Large canonical evidence remains behind source paths; the model digest is capped and reports omissions.
large="$XDG_STATE_HOME/qq/observer/runs/by-repository/large/repo/pr-10"
mkdir -p "$large"
cat >"$large/package.json" <<JSON
{"assembled_at":"2026-08-07T00:00:00Z","branch":"large","merge_commit":"ffffffff","merged_at":"2026-08-07T00:00:00Z","pr":10,"repo":"$ROOT","repository":"large/repo","schema":"qq-observer.package","schema_version":2,"sessions":[],"unknown_entries":[],"variant":"guided","warnings":[]}
JSON
python3 - "$run/analysis.json" "$large/analysis.json" <<'PYFIXTURE'
import copy, json, sys
with open(sys.argv[1]) as source: analysis=json.load(source)
base=analysis["episodes"][0]
episodes=[]
for index in range(55):
    episode=copy.deepcopy(base); episode["recurrence_key"]=f"large-{index:02d}"; episode["title"]=f"Large {index:02d}"
    episode["rank"]=index+1; episode["evidence"][0]["quote"]="DO_NOT_INLINE_LARGE_EVIDENCE_" + "x"*5000
    episodes.append(episode)
analysis["run"]["change"]="large/repo#10"; analysis["episodes"]=episodes
with open(sys.argv[2], "w") as target: json.dump(analysis,target,separators=(",",":"),sort_keys=True); target.write("\n")
PYFIXTURE
"$OBSERVE" ledger-update --run "$large" >/dev/null
# More than the health cap remains deterministically summarized without raising
# the finding cap or context byte bound.
for pr in $(seq 20 41); do
  dir="$health_root/pr-$pr"
  mkdir -p "$dir"
  jq -cn --arg repo "$ROOT" --argjson pr "$pr" --arg assembled \
    "2026-09-01T00:$(printf '%02d' "$pr"):00Z" '{
      assembled_at:$assembled,branch:"health",merge_commit:"efefefef",
      merged_at:$assembled,pr:$pr,repo:$repo,repository:"health/repo",
      schema:"qq-observer.package",schema_version:2,sessions:[],
      unknown_entries:[],variant:"guided",warnings:[]
    }' >"$dir/package.json"
done
"$OBSERVE" architect-context >"$tmp/bounded-context.json"
[ "$(wc -c <"$tmp/bounded-context.json")" -le 131072 ] || fail 'Architect model context exceeded byte cap'
jq -e '
  (.observer_health.rounds | length) == 20
  and .observer_health.omitted_rounds == 5
  and [.observer_health.rounds[].pr] == ([.observer_health.rounds[].pr] | sort | reverse)
' "$tmp/bounded-context.json" >/dev/null || fail 'Architect health did not enforce its independent bound'
! grep -q 'DO_NOT_INLINE_LARGE_EVIDENCE' "$tmp/bounded-context.json" || fail 'Architect model context inlined quoted evidence'
! grep -q 'analysis_sha256\|package_sha256\|"episode"\|authoritative_evidence' "$tmp/bounded-context.json" || fail 'Architect model context exposed internal evidence/hash payloads'
jq -e --arg large "$large" '(.findings | length) <= 50 and .omitted_findings > 0 and any(.findings[].occurrences[]; .source.run_dir == $large)' "$tmp/bounded-context.json" >/dev/null \
  || fail 'Architect digest omitted source provenance or failed to report deterministic cap'

fake_gh="$tmp/gh"; gh_log="$tmp/gh.log"
local_head="$(git -C "$checkout" rev-parse HEAD)"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$GH_LOG"
if [ "$1 $2" = "repo view" ]; then printf '{"nameWithOwner":"fixture/tasks"}\n'; exit 0; fi
[ "$1 $2 $3 $4 $5" = "pr view feature/task --repo fixture/tasks" ]
jq -cn --arg state "$GH_PR_STATE" --arg oid "$GH_HEAD_OID" \
  --arg owner "$GH_HEAD_OWNER" --arg repo "$GH_HEAD_REPOSITORY" '{
  number:201,state:$state,headRefOid:$oid,headRefName:"feature/task",
  headRepository:{name:$repo},headRepositoryOwner:{login:$owner},
  url:"https://github.com/fixture/tasks/pull/201"
}'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh" GH_LOG="$gh_log" GH_HEAD_OID="$local_head"
export GH_HEAD_OWNER=fixture GH_HEAD_REPOSITORY=tasks
for state in OPEN CLOSED; do
  export GH_PR_STATE="$state"
  set +e
  "$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" >"$tmp/$state.out" 2>"$tmp/$state.err"
  status=$?
  set -e
  assert_equal 65 "$status" "$state pull request was recorded resolved"
done
export GH_PR_STATE=MERGED GH_HEAD_OID=0000000000000000000000000000000000000000
set +e
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" >"$tmp/wrong-oid.out" 2>"$tmp/wrong-oid.err"
status=$?
set -e
assert_equal 65 "$status" 'same-branch pull request with a different head OID was recorded resolved'
export GH_HEAD_OID="$local_head" GH_HEAD_OWNER=foreign
set +e
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" >"$tmp/foreign-head.out" 2>"$tmp/foreign-head.err"
status=$?
set -e
assert_equal 65 "$status" 'foreign-head pull request was recorded resolved'
export GH_HEAD_OWNER=fixture GH_HEAD_REPOSITORY=tasks
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" >"$tmp/resolved.json"
jq -e --arg head "$local_head" '
  .status == "resolved" and .receipt.state == "MERGED"
  and .receipt.repository == "fixture/tasks" and .receipt.head_oid == $head
' "$tmp/resolved.json" >/dev/null
assert_file_contains "$gh_log" 'pr view feature/task --repo fixture/tasks --json number,state,headRefOid,headRefName,headRepository,headRepositoryOwner,url'
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" >"$tmp/resolved-again.json"
jq -e '.status == "already resolved"' "$tmp/resolved-again.json" >/dev/null
"$OBSERVE" resolve-task --batch "$global_batch" --task FEAT-201.3 --repo "$repo" >"$tmp/global-resolved.json"
jq -e --arg id "$global_handoff_id" '.status == "resolved" and .receipt.handoff_id == $id and .receipt.state == "MERGED"' "$tmp/global-resolved.json" >/dev/null \
  || fail 'exact MERGED proof did not resolve the global routed Task'
"$OBSERVE" rounds >"$tmp/resolved-rounds.json"
jq -e --arg run "$run" 'any(.[]; .run_dir == $run and .resolved and .resolved_task_ids == ["FEAT-201.3"])' "$tmp/resolved-rounds.json" >/dev/null

resolution="$run/routing/resolutions/FEAT-201.3.json"
cp "$resolution" "$tmp/valid-resolution.json"
assert_bad_resolution() {
  local label="$1" filter="$2"
  jq -cS "$filter" "$tmp/valid-resolution.json" >"$resolution"
  set +e
  "$OBSERVE" rounds >"$tmp/$label.out" 2>"$tmp/$label.err"
  status=$?
  set -e
  assert_equal 65 "$status" "$label resolution receipt was accepted"
  cp "$tmp/valid-resolution.json" "$resolution"
}
assert_bad_resolution truncated 'del(.url)'
# Retry reads use the same strict validator rather than accepting a partial receipt.
jq -cS 'del(.url)' "$tmp/valid-resolution.json" >"$resolution"
set +e
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo"   >"$tmp/truncated-retry.out" 2>"$tmp/truncated-retry.err"
status=$?
set -e
assert_equal 65 "$status" 'resolution retry accepted a truncated existing receipt'
cmp -s "$resolution" "$tmp/valid-resolution.json" && fail 'resolution retry rewrote malformed evidence'
cp "$tmp/valid-resolution.json" "$resolution"
# While the Change is live, retry comparison still rejects a different full OID.
jq -cS '.head_oid = "1111111111111111111111111111111111111111"' \
  "$tmp/valid-resolution.json" >"$resolution"
set +e
"$OBSERVE" resolve-task --run "$run" --task FEAT-201.3 --repo "$repo" \
  >"$tmp/forged-head-retry.out" 2>"$tmp/forged-head-retry.err"
status=$?
set -e
assert_equal 65 "$status" 'resolution retry accepted an existing receipt for a different head OID'
cp "$tmp/valid-resolution.json" "$resolution"
assert_bad_resolution forged-branch '.branch = "feature/other"'
assert_bad_resolution forged-repo '.repository = "fixture/other"'
assert_bad_resolution malformed-head '.head_oid = "111111111111111111111111111111111111111"'
assert_bad_resolution forged-hash '.task_evidence_sha256 = "2222222222222222222222222222222222222222222222222222222222222222"'
assert_bad_resolution extra-field '.extra = true'
jq . "$tmp/valid-resolution.json" >"$resolution"
set +e
"$OBSERVE" rounds >"$tmp/noncanonical.out" 2>"$tmp/noncanonical.err"
status=$?
set -e
assert_equal 65 "$status" 'noncanonical resolution receipt was accepted'
cp "$tmp/valid-resolution.json" "$resolution"

# Resolution remains durable after normal post-land linked-checkout retirement.
cp "$task_path" "$tmp/retired-task.md"
cp "$plan_path" "$tmp/retired-plan.md"
git -C "$repo" worktree remove --force "$checkout"
git -C "$repo" branch -D feature/task >/dev/null
"$OBSERVE" rounds >"$tmp/retired-resolution-rounds.json"
jq -e --arg run "$run" '
  any(.[]; .run_dir == $run and .resolved and .resolved_task_ids == ["FEAT-201.3"])
' "$tmp/retired-resolution-rounds.json" >/dev/null \
  || fail 'retiring the resolved Task checkout made append-only resolution unreadable'
# Reconstitute fixture evidence needed by the independent legacy recovery case below.
git -C "$repo" worktree add -qb feature/task "$checkout" "$local_head"
mkdir -p "$(dirname "$task_path")" "$(dirname "$plan_path")"
cp "$tmp/retired-task.md" "$task_path"
cp "$tmp/retired-plan.md" "$plan_path"

# Legacy flat package evidence remains visible and unchanged while separate
# recovery routing/result/discussion records may be appended beside it.
task_sha="$(sha256sum "$task_path" | awk '{print $1}')"
plan_sha="$(sha256sum "$plan_path" | awk '{print $1}')"
legacy="$XDG_STATE_HOME/qq/observer/runs/pr-4"
mkdir -p "$legacy"
printf '{"schema":"qq-observer.package","schema_version":1,"pr":4,"variant":"guided","assembled_at":"2026-07-01T00:00:00Z","repo":"/legacy/source","sessions":[]}\n' >"$legacy/package.json"
printf '{"schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed","reason":"legacy malformed"}\n' >"$legacy/analysis_failed.json"
cp "$legacy/package.json" "$tmp/legacy-package-before.json"
cp "$legacy/analysis_failed.json" "$tmp/legacy-failure-before.json"
"$OBSERVE" rounds >"$tmp/legacy-rounds.json"
jq -e --arg legacy "$legacy" 'any(.[]; .run_dir == $legacy and .legacy and .repository == null and .failed and (.discussed|not))' "$tmp/legacy-rounds.json" >/dev/null \
  || fail 'legacy flat round was not visibly enumerated in place'
printf '[{"recurrence_key":"recovery","verdict":"accepted","scope":"Recover correct assembly.","note":""}]\n' >"$tmp/legacy-outcomes.json"
"$OBSERVE" prepare-handoff --run "$legacy" --outcomes "$tmp/legacy-outcomes.json" >"$tmp/legacy-prepared.json"
legacy_handoff="$legacy/routing/handoff.json"
jq -e --arg legacy "$legacy" '
  .handoff.kind == "failed_round_recovery"
  and .handoff.round == {run_dir:$legacy,repo:"/legacy/source",repository:null,legacy:true,pr:4,variant:"guided"}
  and .handoff.evidence[0].reason == "legacy malformed"
' "$tmp/legacy-prepared.json" >/dev/null || fail 'legacy recovery handoff lost explicit legacy identity or evidence'
set +e
"$OBSERVE" mark-discussed --run "$legacy" --outcomes "$tmp/legacy-outcomes.json" 2>"$tmp/legacy-premature.err"
status=$?
set -e
assert_equal 64 "$status" 'legacy recovery was discussed before verified Task intake'
legacy_id="$(jq -r .handoff_id "$legacy_handoff")"
jq -cn --arg id "$legacy_id" --arg checkout "$(realpath "$checkout")" \
  --arg task "$task_path" --arg plan "$plan_path" --arg common "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" --arg tsha "$task_sha" --arg psha "$plan_sha" '{
  schema:"qq-handoff/intake-result-v1",version:1,status:"done",handoff_id:$id,
  mapping:[{item:"recovery",task_ids:["FEAT-201.3"]}],
  tasks:[{task_id:"FEAT-201.3",task_path:$task,status:"In Progress",decision_ledger:"present",
    plan_paths:[$plan],branch:"feature/task",checkout:$checkout,common_dir:$common,
    repository:"fixture/tasks",task_sha256:$tsha,plan_sha256:{($plan):$psha}}],
  verified_at:"2026-08-02T00:00:00.000Z"
}' >"$tmp/legacy-result.json"
"$fixture_observe" record-handoff-result --run "$legacy" --receipt "$tmp/legacy-result.json" >/dev/null
"$OBSERVE" mark-discussed --run "$legacy" --outcomes "$tmp/legacy-outcomes.json" >/dev/null
[ -f "$legacy/discussed.json" ] || fail 'verified legacy recovery did not permit explicit discussion mark'
cmp "$tmp/legacy-package-before.json" "$legacy/package.json" || fail 'legacy package evidence was rewritten'
cmp "$tmp/legacy-failure-before.json" "$legacy/analysis_failed.json" || fail 'legacy failure evidence was rewritten'

printf 'test-qq-observe-routing: pass\n'
