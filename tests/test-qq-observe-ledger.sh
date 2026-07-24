#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-ledger"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"

make_episode() {
  local key="$1" kind="$2" title="$3" confidence="${4:-high}"
  jq -cn --arg key "$key" --arg kind "$kind" --arg title "$title" \
    --arg confidence "$confidence" '{
    kind:$kind,title:$title,sessions:["/fixture/session.jsonl"],
    evidence:[{session:"/fixture/session.jsonl",entries:[1],quote:"fixture"}],
    what_happened:"Fixture event.",root_cause:"Fixture cause.",
    root_cause_location:"harness-design",
    cost:{turns:2,tokens:10,duration_ms:100,source:"facts:/fixture/session.jsonl"},
    remedy:{type:"process",smallest_change:"Use the fixture remedy."},
    confidence:$confidence,confidence_why:"Fixture confidence.",recurrence_key:$key,
    rank:1,no_signal:false
  }'
}

make_run() {
  local name="$1" pr="$2" variant="$3" timestamp="$4" episodes="$5" dropped="${6:-[]}"
  local run="$runs/$name"
  mkdir -p "$run"
  jq -cn --argjson pr "$pr" --arg variant "$variant" --arg ts "$timestamp" \
    --arg repo "$ROOT" '{
      schema:"qq-observer.package",schema_version:1,pr:$pr,variant:$variant,
      assembled_at:$ts,repo:$repo,sessions:[]
    }' >"$run/package.json"
  jq -cn --argjson episodes "$episodes" --argjson dropped "$dropped" '{
    schema:"qq-observer.analysis",schema_version:1,
    run:{change:"fixture",sessions:["/fixture/session.jsonl"]},
    episodes:$episodes,dropped_signals:$dropped,limitations:"Fixture."
  }' >"$run/analysis.json"
  printf '%s\n' "$run"
}

alpha="$(make_episode alpha waste 'Alpha opportunity')"
beta="$(make_episode beta friction 'Beta opportunity')"
first_episodes="$(jq -cn --argjson alpha "$alpha" --argjson beta "$beta" '[$alpha,$beta]')"
run_1="$(make_run pr-1 1 guided 2026-08-01T10:00:00Z "$first_episodes")"
run_1_blind="$(make_run pr-1-blind 1 blind 2026-08-01T10:01:00Z "$first_episodes")"
run_2="$(make_run pr-2 2 guided 2026-08-02T10:00:00Z "$first_episodes")"

# Opening the append log repairs a crash-torn tail before reading or appending.
mkdir -p "$(dirname "$events")"
printf '%s\n' '{"schema":"qq-observer.ledger-event","schema_version":1,"ts":"2026-08-01T09:00:00Z","type":"disposition","pr":99,"outcomes":[]}' >"$events"
printf '%s' '{"schema":"qq-observer.ledger-event","schema_version":1,"ts":' >>"$events"
chmod 600 "$events"
"$OBSERVE" ledger-update --run "$run_1" >"$tmp/update-1.json"
jq -e '.findings == 2 and .promoted == 0 and .already_applied == false' \
  "$tmp/update-1.json" >/dev/null || fail 'first ledger update has the wrong result'
jq -s -e '
  length == 3
  and .[0].type == "disposition" and .[0].pr == 99
  and ([.[] | select(.type == "finding_seen") | .recurrence_key] == ["alpha","beta"])
' "$events" >/dev/null || fail 'torn ledger tail was not repaired before append'
[ -f "$run_1/.ledger-applied" ] || fail 'torn-tail recovery did not write the applied marker'
jq -e '
  .schema == "qq-observer.ledger-applied" and .schema_version == 1
  and (.analysis_sha256 | test("^[0-9a-f]{64}$"))
  and (.written_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))
  and .written_seq == 1
' "$run_1/.ledger-applied" >/dev/null || fail 'ledger marker lacks its durable write order'
jq -s -e '
  [.[] | select(.type == "finding_seen")]
  | length == 2
    and all(.[]; (.ts | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$")))
' "$events" >/dev/null || fail 'generated ledger timestamps do not have millisecond UTC precision'
assert_equal 2 "$(jq -s '[.[] | select(.type == "finding_seen")] | length' "$events")" \
  'first ledger update did not emit one finding per episode'
assert_equal 0 "$(jq -s '[.[] | select(.type == "promoted")] | length' "$events")" \
  'one-PR findings were promoted'
assert_equal 600 "$(stat -c '%a' "$events")" 'ledger event store is not private'

"$OBSERVE" ledger-update --run "$run_1_blind" >"$tmp/update-same-pr.json"
assert_equal 0 "$(jq '.promoted' "$tmp/update-same-pr.json")" \
  'a second run of the same PR caused promotion'
"$OBSERVE" ledger-update --run "$run_2" >"$tmp/update-2.json"
jq -e '.findings == 2 and .promoted == 2' "$tmp/update-2.json" >/dev/null \
  || fail 'second distinct PR did not promote both recurrence keys'
jq -s -e '
  [.[] | select(.type == "promoted") | {key:.recurrence_key,prs}] == [
    {key:"alpha",prs:[1,2]}, {key:"beta",prs:[1,2]}
  ]
' "$events" >/dev/null || fail 'promotion events have the wrong distinct-PR evidence'

before="$(wc -l <"$events")"
"$OBSERVE" ledger-update --run "$run_2" >"$tmp/update-idempotent.json"
assert_equal "$before" "$(wc -l <"$events")" 're-updating a run appended ledger events'
jq -e '.already_applied == true and .findings == 0 and .promoted == 0' \
  "$tmp/update-idempotent.json" >/dev/null || fail 'idempotent update result is wrong'
[ -f "$run_2/.ledger-applied" ] || fail 'ledger-applied marker was not written'

# A retry after the source marker was fsynced but before its events completes the feed.
run_2_seq="$(jq '.written_seq' "$run_2/.ledger-applied")"
cp "$run_2/.ledger-applied" "$tmp/run-2-marker-before-retry.json"
before="$(wc -l <"$events")"
jq -c --argjson seq "$run_2_seq" 'select(.written_seq != $seq)' "$events" \
  >"$tmp/events-before-run-2.jsonl"
mv "$tmp/events-before-run-2.jsonl" "$events"
chmod 600 "$events"
"$OBSERVE" ledger-update --run "$run_2" >"$tmp/update-after-event-crash.json"
assert_equal "$before" "$(wc -l <"$events")" \
  'source-first crash recovery restored the wrong event count'
jq -e '.findings == 2 and .promoted == 2 and .already_applied == false' \
  "$tmp/update-after-event-crash.json" >/dev/null \
  || fail 'source-first crash recovery has the wrong result'
cmp "$tmp/run-2-marker-before-retry.json" "$run_2/.ledger-applied" >/dev/null \
  || fail 'source-first crash recovery rewrote the durable marker'
jq -s -e --argjson seq "$run_2_seq" '
  all(.[] | select((.type == "finding_seen" and .pr == 2) or .type == "promoted");
      .written_seq == $seq)
' "$events" >/dev/null || fail 'recovered events lost their source marker sequence'

# Successful finalize feeds the ledger without a separate ledger-update command.
run_3="$runs/pr-3"
mkdir -p "$run_3/sessions" "$run_3/facts"
session_3="$run_3/sessions/fixture.jsonl"
cat >"$session_3" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-08-03T10:00:00Z"}
{"type":"message","timestamp":"2026-08-03T10:00:00.100Z","message":{"role":"assistant","content":"finalize fixture","usage":{"input":4,"output":6}}}
JSONL
"$OBSERVE" facts "$session_3" >"$run_3/facts/fixture.json"
jq -cn --arg repo "$ROOT" --arg ts 2026-08-03T10:00:00Z '{
  schema:"qq-observer.package",schema_version:1,pr:3,variant:"guided",
  assembled_at:$ts,repo:$repo,
  sessions:[{label:"fixture",role:"accountable",evidence:"fixture"}]
}' >"$run_3/package.json"
turns="$(jq '[.turns_by_role[]] | add' "$run_3/facts/fixture.json")"
tokens="$(jq '(.token_usage.input // 0) + (.token_usage.output // 0)' "$run_3/facts/fixture.json")"
duration="$(jq '.wall_clock.duration_ms' "$run_3/facts/fixture.json")"
analysis_3="$tmp/analysis-3.json"
jq -n --arg session "$session_3" --argjson turns "$turns" \
  --argjson tokens "$tokens" --argjson duration "$duration" '{
  schema:"qq-observer.analysis",schema_version:1,
  run:{change:"PR-3",sessions:[$session]},
  episodes:[{
    kind:"tool-gap.tool-missing",title:"Gamma opportunity",sessions:[$session],
    evidence:[{session:$session,entries:[2],quote:"finalize fixture"}],
    what_happened:"Fixture event.",root_cause:"Fixture cause.",
    root_cause_location:"tool",
    cost:{turns:$turns,tokens:$tokens,duration_ms:$duration,source:("facts:"+$session)},
    remedy:{type:"tool",smallest_change:"Use the fixture remedy."},
    confidence:"high",confidence_why:"Direct fixture.",recurrence_key:"gamma"
  }],dropped_signals:[],limitations:"Fixture."
}' >"$analysis_3"
"$OBSERVE" finalize --run "$run_3" --analysis "$analysis_3" \
  --analyst-trace "$session_3" >"$tmp/finalized-3.json"
jq -s -e '[.[] | select(.type == "finding_seen" and .pr == 3 and .recurrence_key == "gamma")] | length == 1' \
  "$events" >/dev/null || fail 'finalize did not auto-feed the ledger'
[ -f "$run_3/.ledger-applied" ] || fail 'finalize did not mark the ledger update applied'

# A ledger failure leaves the analysis durable but not covered until repair.
coverage_repo="$tmp/coverage-repo"
git init -q -b main "$coverage_repo"
GIT_AUTHOR_DATE=2026-08-07T10:00:00Z GIT_COMMITTER_DATE=2026-08-07T10:00:00Z \
  git -C "$coverage_repo" -c user.name=test -c user.email=test@example.invalid \
    commit --allow-empty -qm 'Ledger failure fixture (#7)'
run_7="$runs/pr-7"
mkdir -p "$run_7/sessions" "$run_7/facts"
session_7="$run_7/sessions/fixture.jsonl"
cat >"$session_7" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-08-07T10:00:00Z"}
{"type":"message","timestamp":"2026-08-07T10:00:00.100Z","message":{"role":"assistant","content":"ledger failure fixture","usage":{"input":4,"output":6}}}
JSONL
"$OBSERVE" facts "$session_7" >"$run_7/facts/fixture.json"
jq -cn --arg repo "$coverage_repo" '{
  schema:"qq-observer.package",schema_version:1,pr:7,variant:"guided",
  assembled_at:"2026-08-03T11:00:00Z",repo:$repo,
  sessions:[{label:"fixture",role:"accountable",evidence:"fixture"}]
}' >"$run_7/package.json"
turns="$(jq '[.turns_by_role[]] | add' "$run_7/facts/fixture.json")"
tokens="$(jq '(.token_usage.input // 0) + (.token_usage.output // 0)' "$run_7/facts/fixture.json")"
duration="$(jq '.wall_clock.duration_ms' "$run_7/facts/fixture.json")"
analysis_7="$tmp/analysis-7.json"
jq -n --arg session "$session_7" --argjson turns "$turns" \
  --argjson tokens "$tokens" --argjson duration "$duration" '{
  schema:"qq-observer.analysis",schema_version:1,
  run:{change:"PR-7",sessions:[$session]},
  episodes:[{
    kind:"waste",title:"Ledger failure opportunity",sessions:[$session],
    evidence:[{session:$session,entries:[2],quote:"ledger failure fixture"}],
    what_happened:"Fixture event.",root_cause:"Fixture cause.",
    root_cause_location:"harness-design",
    cost:{turns:$turns,tokens:$tokens,duration_ms:$duration,source:("facts:"+$session)},
    remedy:{type:"process",smallest_change:"Use the fixture remedy."},
    confidence:"high",confidence_why:"Direct fixture.",recurrence_key:"ledger-failure"
  }],dropped_signals:[],limitations:"Fixture."
}' >"$analysis_7"
chmod 400 "$events"
set +e
"$OBSERVE" finalize --run "$run_7" --analysis "$analysis_7" \
  --analyst-trace "$session_7" >"$tmp/finalized-7.stdout" 2>"$tmp/finalized-7.stderr"
status=$?
chmod 600 "$events"
set -e
assert_equal 65 "$status" 'finalize succeeded when the ledger was unavailable'
assert_file_contains "$tmp/finalized-7.stderr" 'ledger event store'
[ -f "$run_7/analysis.json" ] || fail 'ledger failure discarded analysis.json'
[ -f "$run_7/analysis.md" ] || fail 'ledger failure discarded analysis.md'
[ ! -e "$run_7/.ledger-applied" ] || fail 'ledger failure wrote the applied marker'
set +e
"$OBSERVE" verify-delivery --repo "$coverage_repo" --since 2026-01-01T00:00:00Z \
  >"$tmp/uncovered-7.json"
status=$?
set -e
assert_equal 1 "$status" 'analysis without a ledger marker counted as covered'
jq -e '.covered == [] and .uncovered == [7]' "$tmp/uncovered-7.json" >/dev/null \
  || fail 'ledger failure was not reported as uncovered'
"$OBSERVE" ledger-update --run "$run_7" >"$tmp/repaired-7.json"
[ -f "$run_7/.ledger-applied" ] || fail 'ledger repair did not write the applied marker'
"$OBSERVE" verify-delivery --repo "$coverage_repo" --since 2026-01-01T00:00:00Z \
  >"$tmp/covered-7.json"
jq -e '.ok == true and .covered == [7] and .uncovered == []' \
  "$tmp/covered-7.json" >/dev/null || fail 'ledger repair did not restore coverage'

# A source marker alone does not certify coverage until every episode is in the feed.
GIT_AUTHOR_DATE=2026-08-08T10:00:00Z GIT_COMMITTER_DATE=2026-08-08T10:00:00Z \
  git -C "$coverage_repo" -c user.name=test -c user.email=test@example.invalid \
    commit --allow-empty -qm 'Marker crash fixture (#8)'
run_8="$(make_run pr-8 8 guided 2026-08-08T10:00:00Z "$first_episodes")"
"$OBSERVE" ledger-update --run "$run_8" >"$tmp/update-8.json"
run_8_seq="$(jq '.written_seq' "$run_8/.ledger-applied")"
jq -c --argjson seq "$run_8_seq" 'select(.written_seq != $seq)' "$events" \
  >"$tmp/events-without-8.jsonl"
mv "$tmp/events-without-8.jsonl" "$events"
chmod 600 "$events"
set +e
"$OBSERVE" verify-delivery --repo "$coverage_repo" --since 2026-01-01T00:00:00Z \
  >"$tmp/uncovered-8.json"
status=$?
set -e
assert_equal 1 "$status" 'marker with two missing finding events counted as covered'
jq -e '.covered == [7] and .uncovered == [8]' "$tmp/uncovered-8.json" >/dev/null \
  || fail 'incomplete marker coverage was not reported for its PR'
jq -e '.episode_count == 2' "$run_8/.ledger-applied" >/dev/null \
  || fail 'ledger marker did not certify its analysis episode count'
"$OBSERVE" ledger-update --run "$run_8" >"$tmp/repaired-8.json"
"$OBSERVE" verify-delivery --repo "$coverage_repo" --since 2026-01-01T00:00:00Z \
  >"$tmp/covered-8.json"
jq -e '.ok == true and .covered == [7,8] and .uncovered == []' \
  "$tmp/covered-8.json" >/dev/null || fail 'event retry did not complete marker coverage'

# A certified empty analysis is covered by exactly zero finding events.
GIT_AUTHOR_DATE=2026-08-09T10:00:00Z GIT_COMMITTER_DATE=2026-08-09T10:00:00Z \
  git -C "$coverage_repo" -c user.name=test -c user.email=test@example.invalid \
    commit --allow-empty -qm 'Empty analysis fixture (#9)'
run_9="$(make_run pr-9 9 guided 2026-08-09T10:00:00Z '[]')"
"$OBSERVE" ledger-update --run "$run_9" >"$tmp/update-9.json"
jq -e '.episode_count == 0' "$run_9/.ledger-applied" >/dev/null \
  || fail 'empty analysis marker does not certify zero episodes'
"$OBSERVE" verify-delivery --repo "$coverage_repo" --since 2026-01-01T00:00:00Z \
  >"$tmp/covered-9.json"
jq -e '.ok == true and .covered == [7,8,9] and .uncovered == []' \
  "$tmp/covered-9.json" >/dev/null || fail 'empty analysis was not covered by zero findings'

# Failed finalize is terminal coverage, but never a finding source.
run_4="$runs/pr-4"
mkdir -p "$run_4"
jq -cn --arg repo "$ROOT" '{
  schema:"qq-observer.package",schema_version:1,pr:4,variant:"guided",
  assembled_at:"2026-08-04T10:00:00Z",repo:$repo,sessions:[]
}' >"$run_4/package.json"
"$OBSERVE" finalize --run "$run_4" --failed 'fixture failure' >"$tmp/failed-4.json"
[ ! -e "$run_4/.ledger-applied" ] || fail 'failed finalize was ledger-applied'

outcomes="$tmp/outcomes.json"
cat >"$outcomes" <<'JSON'
[
  {"recurrence_key":"alpha","verdict":"accepted","task_refs":["T-201"],"note":"Keep it."},
  {"recurrence_key":"beta","verdict":"rejected","task_refs":[],"note":"Do not pursue."}
]
JSON
# Simulate a crash after the discussed mark was fsynced but before its event.
jq -cn --argjson outcomes "$(cat "$outcomes")" '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-08-02T11:00:00Z",type:"disposition",pr:2,outcomes:$outcomes
}' >"$run_2/discussed.json"
disposition_before="$(jq -s '[.[] | select(.type == "disposition")] | length' "$events")"
"$OBSERVE" mark-discussed --run "$run_2" --outcomes "$outcomes" >"$tmp/discussed.json"
jq -e '.type == "disposition" and .pr == 2 and .outcomes[0].verdict == "accepted"' \
  "$run_2/discussed.json" >/dev/null || fail 'discussed mark has the wrong shape'
disposition_count="$(jq -s '[.[] | select(.type == "disposition")] | length' "$events")"
assert_equal "$((disposition_before + 1))" "$disposition_count" \
  'retry with only a discussed mark did not append exactly one disposition'
jq -e '.status == "discussed"' "$tmp/discussed.json" >/dev/null \
  || fail 'discussed mark recovery reported the wrong status'
"$OBSERVE" mark-discussed --run "$run_2" --outcomes "$outcomes" >"$tmp/discussed-again.json"
assert_equal "$disposition_count" \
  "$(jq -s '[.[] | select(.type == "disposition")] | length' "$events")" \
  'identical discussed mark appended another disposition'
jq -e '.status == "already discussed"' "$tmp/discussed-again.json" >/dev/null \
  || fail 'identical discussed mark and event were not a full no-op'

jq '.[0].note = "different"' "$outcomes" >"$tmp/different-outcomes.json"
set +e
"$OBSERVE" mark-discussed --run "$run_2" --outcomes "$tmp/different-outcomes.json" \
  >"$tmp/different.stdout" 2>"$tmp/different.stderr"
status=$?
set -e
assert_equal 65 "$status" 'differing second discussed mark was accepted'
assert_file_contains "$tmp/different.stderr" 'append-only conflict'
printf '{"outcomes":[]}\n' >"$tmp/malformed-outcomes.json"
set +e
"$OBSERVE" mark-discussed --run "$run_1" --outcomes "$tmp/malformed-outcomes.json" \
  >"$tmp/malformed.stdout" 2>"$tmp/malformed.stderr"
status=$?
set -e
assert_equal 65 "$status" 'malformed outcomes were accepted'
[ ! -e "$run_1/discussed.json" ] || fail 'malformed outcomes wrote a discussed mark'

"$OBSERVE" rounds >"$tmp/rounds.json"
jq -e '
  (.[0].pr == 9 and .[0].analyzed == true and .[0].discussed == false)
  and any(.[]; .pr == 4 and .failed == true and .discussed == false)
  and (.[-1].pr == 2 and .[-1].discussed == true)
  and ([.[] | select(.discussed == false) | .ts] ==
       ([.[] | select(.discussed == false) | .ts] | sort | reverse))
  and all(.[]; keys == ["analyzed","discussed","failed","pr","ts","variant"])
' "$tmp/rounds.json" >/dev/null || fail 'rounds were not undiscussed-first then newest-first'

# Guided/blind comparison records both set differences and unabsorbed signals.
common="$(make_episode common friction 'Common episode')"
guided_only="$(make_episode guided-only waste 'Guided-only episode')"
blind_only="$(make_episode blind-only tool-gap 'Blind-only episode')"
guided_episodes="$(jq -cn --argjson common "$common" --argjson only "$guided_only" '[$common,$only]')"
blind_episodes="$(jq -cn --argjson common "$common" --argjson only "$blind_only" '[$common,$only]')"
dropped='[{"kind":"compaction","entries":[2],"why":"Unabsorbed fixture."},{"kind":"friction","entries":[2],"why":"Matched fixture."}]'
run_5="$(make_run pr-5 5 guided 2026-08-05T10:00:00Z "$guided_episodes" "$dropped")"
run_5_blind="$(make_run pr-5-blind 5 blind 2026-08-05T10:01:00Z "$blind_episodes")"
"$OBSERVE" record-comparison --guided "$run_5" --blind "$run_5_blind" \
  >"$tmp/comparison.json"
jq -e '.candidates == 3' "$tmp/comparison.json" >/dev/null \
  || fail 'comparison emitted the wrong candidate count'
jq -e --arg guided "$run_5" --arg blind "$run_5_blind" '
  .schema == "qq-observer.comparison" and .schema_version == 1
  and .guided == $guided and .blind == $blind
  and (.written_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))
  and (.written_seq | type == "number") and .written_seq > 0
  and (.candidates | length == 3)
' "$run_5/comparison.json" >/dev/null || fail 'comparison record has the wrong shape'
jq -s -e '
  [.[] | select(.type == "signal_tune_candidate" and .pr == 5)
    | {direction,evidence,signal_kind:(.signal_kind // null)}] == [
    {direction:"prune",evidence:"guided-only",signal_kind:null},
    {direction:"promote",evidence:"blind-only",signal_kind:null},
    {direction:"prune",evidence:"unabsorbed",signal_kind:"compaction"}
  ]
' "$events" >/dev/null || fail 'comparison evidence directions are wrong'
comparison_before="$(wc -l <"$events")"
cp "$run_5/comparison.json" "$tmp/comparison-record-before.json"
"$OBSERVE" record-comparison --guided "$run_5" --blind "$run_5_blind" \
  >"$tmp/comparison-again.json"
assert_equal "$comparison_before" "$(wc -l <"$events")" \
  'identical comparison appended candidates'
cmp "$tmp/comparison-record-before.json" "$run_5/comparison.json" >/dev/null \
  || fail 'identical comparison rewrote its durable record'
cp "$run_5_blind/analysis.json" "$tmp/blind-analysis-before.json"
jq --argjson episode "$guided_only" '.episodes += [$episode]' \
  "$run_5_blind/analysis.json" >"$tmp/blind-analysis-different.json"
cp "$tmp/blind-analysis-different.json" "$run_5_blind/analysis.json"
set +e
"$OBSERVE" record-comparison --guided "$run_5" --blind "$run_5_blind" \
  >"$tmp/comparison-different.stdout" 2>"$tmp/comparison-different.stderr"
status=$?
set -e
cp "$tmp/blind-analysis-before.json" "$run_5_blind/analysis.json"
assert_equal 65 "$status" 'differing second comparison was accepted'
assert_file_contains "$tmp/comparison-different.stderr" 'append-only conflict'
assert_equal "$comparison_before" "$(wc -l <"$events")" \
  'differing comparison appended candidates before refusing'

# Promotion and disposition state remain global when findings are windowed.
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-08-31T10:00:00Z",type:"finding_seen",pr:8,
  recurrence_key:"windowed",kind:"waste",title:"Windowed opportunity",
  rank:1,confidence:"high",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-08-31T11:00:00Z",type:"promoted",
  recurrence_key:"windowed",kind:"waste",prs:[8,9]
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-08-31T12:00:00Z",type:"disposition",pr:8,
  outcomes:[{recurrence_key:"windowed",verdict:"accepted",task_refs:["T-202"],note:"Learned globally."}]
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-09-02T10:00:00Z",type:"finding_seen",pr:9,
  recurrence_key:"windowed",kind:"waste",title:"Windowed opportunity",
  rank:1,confidence:"high",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"

# Equal timestamps resolve by ledger position for findings and dispositions.
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-09-03T10:00:00.123Z",type:"finding_seen",pr:10,
  recurrence_key:"tied",kind:"waste",title:"Stale tied opportunity",
  rank:2,confidence:"low",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-09-03T10:00:00.123Z",type:"finding_seen",pr:11,
  recurrence_key:"tied",kind:"friction",title:"Latest tied opportunity",
  rank:1,confidence:"high",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-09-03T11:00:00.456Z",type:"disposition",pr:10,
  outcomes:[{recurrence_key:"tied",verdict:"accepted",task_refs:[],note:"Stale tie."}]
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-09-03T11:00:00.456Z",type:"disposition",pr:11,
  outcomes:[{recurrence_key:"tied",verdict:"rejected",task_refs:[],note:"Latest tie."}]
}' >>"$events"

# Unknown event shapes are counted rather than silently interpreted.
printf '{"schema":"qq-observer.future-event","schema_version":99}\n' >>"$events"
"$OBSERVE" digest >"$tmp/digest.md"
assert_file_contains "$tmp/digest.md" '| 13.5 | 3 | `alpha`' \
  'accepted recurrence did not receive its 1.5 multiplier'
assert_file_contains "$tmp/digest.md" '| 4.5 | 3 | `beta`' \
  'rejected recurrence did not receive its 0.5 multiplier'
assert_file_contains "$tmp/digest.md" '| 3 | 1 | `gamma`' \
  'open finding ranking is wrong'
assert_file_contains "$tmp/digest.md" \
  '| 3 | 2 | `tied` | Latest tied opportunity | `friction` | #10, #11 | low, high | rejected (×0.5) |' \
  'equal-timestamp finding or disposition did not resolve by ledger position'
assert_file_contains "$tmp/digest.md" 'guided-only'
assert_file_contains "$tmp/digest.md" 'blind-only'
assert_file_contains "$tmp/digest.md" 'unabsorbed'
assert_file_contains "$tmp/digest.md" 'Coverage: 7 finalized, 1 failed.'
assert_file_contains "$tmp/digest.md" 'Unknown ledger entries: 1.'
digest_path="$(find "$XDG_STATE_HOME/qq/observer/digests" -type f -name '*.md')"
cmp "$tmp/digest.md" "$digest_path" >/dev/null || fail 'stored digest differs from stdout'

# Freeze the embedded Python clock so two digests collide in the same millisecond.
real_python="$(command -v python3)"
clock_python="$tmp/frozen-python3"
cat >"$clock_python" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != - ]; then
  exec "$REAL_PYTHON3" "$@"
fi
script="$CLOCK_TMP/frozen-clock-$$.py"
trap 'rm -f "$script"' EXIT
sed 's/dt\.datetime\.now(dt\.timezone\.utc)/dt.datetime(2040, 1, 2, 3, 4, 5, 6000, tzinfo=dt.timezone.utc)/g' >"$script"
"$REAL_PYTHON3" "$script" "${@:2}"
SH
chmod 700 "$clock_python"
REAL_PYTHON3="$real_python" CLOCK_TMP="$tmp" QQ_PYTHON3_BIN="$clock_python" \
  "$OBSERVE" digest --since 2026-09-01T00:00:00Z >"$tmp/windowed-digest.md"
REAL_PYTHON3="$real_python" CLOCK_TMP="$tmp" QQ_PYTHON3_BIN="$clock_python" \
  "$OBSERVE" digest --since 2026-09-01T00:00:00Z >"$tmp/windowed-digest-2.md"
assert_file_contains "$tmp/windowed-digest.md" 'Generated: `2040-01-02T03:04:05.006Z`'
cmp "$tmp/windowed-digest.md" "$tmp/windowed-digest-2.md" >/dev/null \
  || fail 'equal-millisecond digests differ'
digest_dir="$XDG_STATE_HOME/qq/observer/digests"
[ -f "$digest_dir/2040-01-02T03:04:05.006Z.md" ] \
  || fail 'equal-millisecond digest base file is missing'
[ -f "$digest_dir/2040-01-02T03:04:05.006Z-2.md" ] \
  || fail 'equal-millisecond digest suffix file is missing'
assert_file_contains "$tmp/windowed-digest.md" \
  '| 9 | 2 | `windowed` | Windowed opportunity | `waste` | #8, #9 | high, high | accepted (×1.5) |' \
  'windowed finding lost global recurrence or disposition state'
awk '
  /^## Opportunities ledger$/ { opportunities = 1; next }
  /^## Open findings$/ { opportunities = 0 }
  opportunities && /`windowed`/ { found = 1 }
  END { exit found ? 0 : 1 }
' "$tmp/windowed-digest.md" || fail 'globally promoted finding appeared open in a windowed digest'
assert_file_not_matches "$tmp/windowed-digest.md" '`alpha`' \
  'finding whose latest event predates --since was listed'

# The ledger is derived: marked analyses can reconstruct it after total loss.
primary_state="$XDG_STATE_HOME"
primary_runs="$runs"
primary_events="$events"
export XDG_STATE_HOME="$tmp/rebuild-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
rebuild_20="$(make_run pr-20 20 guided 2026-10-20T10:00:00Z "$first_episodes")"
rebuild_20_blind_episodes="$(jq -cn --argjson alpha "$alpha" '[$alpha]')"
rebuild_20_blind="$(make_run pr-20-blind 20 blind 2026-10-20T10:01:00Z "$rebuild_20_blind_episodes")"
gamma="$(make_episode gamma waste 'Gamma opportunity')"
rebuild_21_episodes="$(jq -cn --argjson alpha "$alpha" --argjson gamma "$gamma" '[$alpha,$gamma]')"
rebuild_21="$(make_run pr-21 21 guided 2026-10-21T10:00:00Z "$rebuild_21_episodes")"
rebuild_failed="$(make_run pr-22 22 guided 2026-10-22T10:00:00Z '[]')"
rm "$rebuild_failed/analysis.json"
printf '%s\n' '{"schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed","reason":"fixture"}' \
  >"$rebuild_failed/analysis_failed.json"
rebuild_missing="$runs/pr-23"
mkdir -p "$rebuild_missing"
jq -cn --arg repo "$ROOT" '{
  schema:"qq-observer.package",schema_version:1,pr:23,variant:"guided",
  assembled_at:"2026-10-23T10:00:00Z",repo:$repo,sessions:[]
}' >"$rebuild_missing/package.json"
rebuild_unmarked="$(make_run pr-24 24 guided 2026-10-24T10:00:00Z "$first_episodes")"

"$OBSERVE" ledger-update --run "$rebuild_21" >"$tmp/rebuild-update-21.json"
"$OBSERVE" ledger-update --run "$rebuild_20" >"$tmp/rebuild-update-20.json"
"$OBSERVE" mark-discussed --run "$rebuild_21" --outcomes "$outcomes" \
  >"$tmp/rebuild-discussed-21.json"
"$OBSERVE" record-comparison --guided "$rebuild_20" --blind "$rebuild_20_blind" \
  >"$tmp/rebuild-comparison-20.json"
jq -s -e 'map(.written_seq) == [1,2,3,4]' \
  "$rebuild_21/.ledger-applied" "$rebuild_20/.ledger-applied" \
  "$rebuild_21/discussed.json" "$rebuild_20/comparison.json" >/dev/null \
  || fail 'ledger-feeding records did not receive monotonic cross-kind sequences'
jq -s -e '
  all(.[] | select(.type == "finding_seen" and .pr == 21); .written_seq == 1)
  and all(.[] | select((.type == "finding_seen" and .pr == 20) or .type == "promoted"); .written_seq == 2)
  and all(.[] | select(.type == "disposition"); .written_seq == 3)
  and all(.[] | select(.type == "signal_tune_candidate"); .written_seq == 4)
' "$events" >/dev/null || fail 'ledger events do not carry their source record sequence'
touch -d '2030-01-01T00:00:00.400Z' "$rebuild_21/.ledger-applied"
touch -d '2030-01-01T00:00:00.300Z' "$rebuild_20/.ledger-applied"
touch -d '2030-01-01T00:00:00.200Z' "$rebuild_21/discussed.json"
touch -d '2030-01-01T00:00:00.100Z' "$rebuild_20/comparison.json"
cp "$events" "$tmp/pre-loss-events.jsonl"

"$OBSERVE" ledger-rebuild >"$tmp/rebuild-intact.json"
jq -e '
  .runs_seen == 6 and .runs_replayed == 2
  and .events_appended == 0 and .events_skipped == 7
' "$tmp/rebuild-intact.json" >/dev/null || fail 'intact-ledger rebuild was not a no-op'

rm -rf "$(dirname "$events")"
"$OBSERVE" ledger-rebuild >"$tmp/rebuilt.json"
jq -e '
  .runs_seen == 6 and .runs_replayed == 2
  and .events_appended == 7 and .events_skipped == 0
' "$tmp/rebuilt.json" >/dev/null || fail 'lost-ledger rebuild summary is wrong'
cmp "$tmp/pre-loss-events.jsonl" "$events" >/dev/null \
  || fail 'sequence-ordered rebuild did not reproduce the pre-loss ledger bytes'
jq -s -e '
  ([.[] | .type] | sort) ==
    ["disposition","finding_seen","finding_seen","finding_seen","finding_seen","promoted","signal_tune_candidate"]
  and ([.[] | select(.type == "disposition")] | length == 1
       and .[0].outcomes[0].note == "Keep it.")
  and ([.[] | select(.type == "signal_tune_candidate")] | length == 1
       and .[0].recurrence_key == "beta" and .[0].direction == "prune")
' "$events" >/dev/null || fail 'rebuild did not restore every durable event kind'

before="$(wc -l <"$events")"
"$OBSERVE" ledger-rebuild >"$tmp/rebuilt-again.json"
assert_equal "$before" "$(wc -l <"$events")" 'second rebuild appended events'
jq -e '
  .runs_seen == 6 and .runs_replayed == 2
  and .events_appended == 0 and .events_skipped == 7
' "$tmp/rebuilt-again.json" >/dev/null || fail 'second rebuild was not a full no-op'

# Loss of the derived ledger still allocates above every durable source sequence.
rebuild_25="$(make_run pr-25 25 guided 2026-10-25T10:00:00Z "$first_episodes")"
rm -rf "$(dirname "$events")"
"$OBSERVE" ledger-update --run "$rebuild_25" >"$tmp/rebuild-update-25.json"
jq -e '.written_seq == 5' "$rebuild_25/.ledger-applied" >/dev/null \
  || fail 'source records did not allocate max written_seq plus one'
jq -s -e 'length == 2 and all(.[]; .written_seq == 5)' "$events" >/dev/null \
  || fail 'post-recovery events collided with pre-loss record sequences'

# Nanosecond mtimes preserve same-timestamp legacy disposition chronology during recovery.
export XDG_STATE_HOME="$tmp/chronology-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
chronology_episode="$(make_episode chronology waste 'Chronology opportunity')"
chronology_episodes="$(jq -cn --argjson episode "$chronology_episode" '[$episode]')"
chronology_2="$(make_run pr-2 2 guided 2026-11-02T10:00:00Z "$chronology_episodes")"
chronology_3="$(make_run pr-3 3 guided 2026-11-03T10:00:00Z "$chronology_episodes")"
"$OBSERVE" ledger-update --run "$chronology_2" >"$tmp/chronology-update-2.json"
"$OBSERVE" ledger-update --run "$chronology_3" >"$tmp/chronology-update-3.json"
jq -c 'del(.written_at, .written_seq, .episode_count)' "$chronology_3/.ledger-applied" \
  >"$tmp/chronology-legacy-marker-3.json"
mv "$tmp/chronology-legacy-marker-3.json" "$chronology_3/.ledger-applied"
touch -d '2099-01-01T00:00:00.000Z' "$chronology_3/.ledger-applied"
accepted_outcome="$tmp/chronology-accepted.json"
rejected_outcome="$tmp/chronology-rejected.json"
jq -cn '[{recurrence_key:"chronology",verdict:"accepted",task_refs:[],note:"Older."}]' \
  >"$accepted_outcome"
jq -cn '[{recurrence_key:"chronology",verdict:"rejected",task_refs:[],note:"Newer."}]' \
  >"$rejected_outcome"
jq -cn --argjson outcomes "$(cat "$accepted_outcome")" '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-11-04T10:00:00.000Z",type:"disposition",pr:3,outcomes:$outcomes
}' >"$chronology_3/discussed.json"
"$OBSERVE" mark-discussed --run "$chronology_3" --outcomes "$accepted_outcome" \
  >"$tmp/chronology-discussed-3.json"
jq -cn --argjson outcomes "$(cat "$rejected_outcome")" '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-11-04T10:00:00.000Z",type:"disposition",pr:2,outcomes:$outcomes
}' >"$chronology_2/discussed.json"
"$OBSERVE" mark-discussed --run "$chronology_2" --outcomes "$rejected_outcome" \
  >"$tmp/chronology-discussed-2.json"
touch -d '2030-01-01T00:00:00.000000100Z' "$chronology_3/discussed.json"
touch -d '2030-01-01T00:00:00.000000900Z' "$chronology_2/discussed.json"
"$OBSERVE" digest >"$tmp/chronology-before-loss.md"
assert_file_contains "$tmp/chronology-before-loss.md" \
  '| 3 | 2 | `chronology` | Chronology opportunity | `waste` | #2, #3 | high, high | rejected (×0.5) |' \
  'original disposition chronology did not end with rejection'
rm -rf "$(dirname "$events")"
"$OBSERVE" ledger-rebuild >"$tmp/chronology-rebuild.json"
jq -e 'has("written_at") | not' "$chronology_3/.ledger-applied" >/dev/null \
  || fail 'legacy ledger marker was not replayed lawfully by mtime'
"$OBSERVE" digest >"$tmp/chronology-after-loss.md"
assert_file_contains "$tmp/chronology-after-loss.md" \
  '| 3 | 2 | `chronology` | Chronology opportunity | `waste` | #2, #3 | high, high | rejected (×0.5) |' \
  'equal-mtime rebuild reversed internal disposition chronology'

# A record-first comparison retry completes events after an interrupted first attempt.
export XDG_STATE_HOME="$tmp/comparison-crash-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
crash_common="$(make_episode crash-common friction 'Crash common episode')"
crash_only="$(make_episode crash-only waste 'Crash guided-only episode')"
crash_guided_episodes="$(jq -cn --argjson common "$crash_common" --argjson only "$crash_only" '[$common,$only]')"
crash_blind_episodes="$(jq -cn --argjson common "$crash_common" '[$common]')"
crash_guided="$(make_run pr-30 30 guided 2026-12-01T10:00:00Z "$crash_guided_episodes")"
crash_blind="$(make_run pr-30-blind 30 blind 2026-12-01T10:01:00Z "$crash_blind_episodes")"
real_python="$(command -v python3)"
crash_python="$tmp/crash-python3"
cat >"$crash_python" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != - ]; then
  exec "$REAL_PYTHON3" "$@"
fi
script="$CRASH_TMP/comparison-crash-$$.py"
trap 'rm -f "$script"' EXIT
"$REAL_PYTHON3" -c '
import sys
source = sys.stdin.read()
needle = '\''            status = "recorded"\n        previous, _ = read_ledger_events(fd)\n'\''
if source.count(needle) != 1:
    raise SystemExit("comparison record/events boundary not found")
replacement = '\''            status = "recorded"\n            raise SystemExit(99)\n        previous, _ = read_ledger_events(fd)\n'\''
sys.stdout.write(source.replace(needle, replacement))
' >"$script"
"$REAL_PYTHON3" "$script" "${@:2}"
SH
chmod 700 "$crash_python"
set +e
REAL_PYTHON3="$real_python" CRASH_TMP="$tmp" QQ_PYTHON3_BIN="$crash_python" \
  "$OBSERVE" record-comparison --guided "$crash_guided" --blind "$crash_blind" \
  >"$tmp/comparison-crash.stdout" 2>"$tmp/comparison-crash.stderr"
status=$?
set -e
assert_equal 99 "$status" 'comparison crash injection did not fire'
[ -f "$crash_guided/comparison.json" ] \
  || fail 'comparison crash did not leave its durable record'
assert_equal 0 "$(jq -s '[.[] | select(.type == "signal_tune_candidate" and .pr == 30)] | length' "$events")" \
  'comparison crash appended candidates before the injected exit'
"$OBSERVE" record-comparison --guided "$crash_guided" --blind "$crash_blind" \
  >"$tmp/comparison-crash-retry.json"
assert_equal 1 "$(jq -s '[.[] | select(.type == "signal_tune_candidate" and .pr == 30)] | length' "$events")" \
  'comparison crash retry did not append exactly one candidate event'
jq -cS . "$events" >"$tmp/comparison-before-loss.jsonl"
rm -rf "$(dirname "$events")"
"$OBSERVE" ledger-rebuild >"$tmp/comparison-rebuild.json"
jq -cS . "$events" >"$tmp/comparison-after-loss.jsonl"
cmp "$tmp/comparison-before-loss.jsonl" "$tmp/comparison-after-loss.jsonl" >/dev/null \
  || fail 'comparison event set changed after rebuild from durable record'

# Identical candidates in two durable comparison records are globally unique.
export XDG_STATE_HOME="$tmp/comparison-dedupe-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
dedupe_common="$(make_episode dedupe-common friction 'Dedupe common episode')"
dedupe_only="$(make_episode dedupe-only waste 'Dedupe guided-only episode')"
dedupe_guided_episodes="$(jq -cn --argjson common "$dedupe_common" --argjson only "$dedupe_only" '[$common,$only]')"
dedupe_blind_episodes="$(jq -cn --argjson common "$dedupe_common" '[$common]')"
dedupe_guided_1="$(make_run pr-40-a 40 guided 2026-12-02T10:00:00Z "$dedupe_guided_episodes")"
dedupe_blind_1="$(make_run pr-40-a-blind 40 blind 2026-12-02T10:01:00Z "$dedupe_blind_episodes")"
dedupe_guided_2="$(make_run pr-40-b 40 guided 2026-12-02T10:02:00Z "$dedupe_guided_episodes")"
dedupe_blind_2="$(make_run pr-40-b-blind 40 blind 2026-12-02T10:03:00Z "$dedupe_blind_episodes")"
"$OBSERVE" record-comparison --guided "$dedupe_guided_1" --blind "$dedupe_blind_1" \
  >"$tmp/comparison-dedupe-1.json"
"$OBSERVE" record-comparison --guided "$dedupe_guided_2" --blind "$dedupe_blind_2" \
  >"$tmp/comparison-dedupe-2.json"
jq -s -e 'map(.written_seq) == [1,2]' \
  "$dedupe_guided_1/comparison.json" "$dedupe_guided_2/comparison.json" >/dev/null \
  || fail 'duplicate comparison records did not retain distinct source sequences'
assert_equal 1 "$(jq -s '[.[] | select(.type == "signal_tune_candidate")] | length' "$events")" \
  'duplicate comparison records emitted duplicate live candidates'
jq -cS . "$events" >"$tmp/comparison-dedupe-before-loss.jsonl"
rm -rf "$(dirname "$events")"
"$OBSERVE" ledger-rebuild >"$tmp/comparison-dedupe-rebuild.json"
assert_equal 1 "$(jq -s '[.[] | select(.type == "signal_tune_candidate")] | length' "$events")" \
  'duplicate comparison records emitted duplicate rebuilt candidates'
jq -cS . "$events" >"$tmp/comparison-dedupe-after-loss.jsonl"
cmp "$tmp/comparison-dedupe-before-loss.jsonl" "$tmp/comparison-dedupe-after-loss.jsonl" >/dev/null \
  || fail 'globally deduplicated comparison rebuild was not byte-exact'

# Logical written_seq, not physical append position, orders every ledger consumer.
export XDG_STATE_HOME="$tmp/logical-order-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
mkdir -p "$(dirname "$events")"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:2,
  ts:"2026-12-03T10:00:00Z",type:"disposition",pr:51,
  outcomes:[{recurrence_key:"logical",verdict:"accepted",task_refs:[],note:"Latest logically."}]
}' >"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:6,
  ts:"2026-12-03T10:00:00Z",type:"finding_seen",pr:52,
  recurrence_key:"logical",kind:"friction",title:"Latest logical opportunity",
  rank:1,confidence:"high",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:4,
  ts:"2026-12-03T10:00:00Z",type:"signal_tune_candidate",pr:51,
  direction:"prune",episode_title:"Second logical candidate",
  recurrence_key:"logical-second",evidence:"guided-only"
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:1,
  ts:"2026-12-03T10:00:00Z",type:"disposition",pr:50,
  outcomes:[{recurrence_key:"logical",verdict:"rejected",task_refs:[],note:"Stale logically."}]
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:5,
  ts:"2026-12-03T10:00:00Z",type:"finding_seen",pr:51,
  recurrence_key:"logical",kind:"waste",title:"Stale logical opportunity",
  rank:2,confidence:"low",no_signal:false,
  cost:{turns:1,tokens:1,duration_ms:1}
}' >>"$events"
jq -cn '{
  schema:"qq-observer.ledger-event",schema_version:1,written_seq:3,
  ts:"2026-12-03T10:00:00Z",type:"signal_tune_candidate",pr:50,
  direction:"promote",episode_title:"First logical candidate",
  recurrence_key:"logical-first",evidence:"blind-only"
}' >>"$events"
chmod 600 "$events"
"$OBSERVE" digest >"$tmp/logical-order-a.md"
assert_file_contains "$tmp/logical-order-a.md" \
  '| 9 | 2 | `logical` | Latest logical opportunity | `friction` | #51, #52 | low, high | accepted (×1.5) |' \
  'digest latest state followed physical append order instead of written_seq'
first_candidate_line="$(grep -n 'First logical candidate' "$tmp/logical-order-a.md" | cut -d: -f1)"
second_candidate_line="$(grep -n 'Second logical candidate' "$tmp/logical-order-a.md" | cut -d: -f1)"
[ "$first_candidate_line" -lt "$second_candidate_line" ] \
  || fail 'signal-tuning candidates followed physical append order instead of written_seq'
jq -cs 'reverse[]' "$events" >"$tmp/logical-order-reversed.jsonl"
mv "$tmp/logical-order-reversed.jsonl" "$events"
chmod 600 "$events"
"$OBSERVE" digest >"$tmp/logical-order-b.md"
sed '/^Generated:/d' "$tmp/logical-order-a.md" >"$tmp/logical-order-a-normalized.md"
sed '/^Generated:/d' "$tmp/logical-order-b.md" >"$tmp/logical-order-b-normalized.md"
cmp "$tmp/logical-order-a-normalized.md" "$tmp/logical-order-b-normalized.md" >/dev/null \
  || fail 'digest changed when only ledger physical order changed'

# A store-wide writer lock serializes rebuilds with every other ledger mutator.
export XDG_STATE_HOME="$tmp/concurrent-ledger-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
lock_episode="$(make_episode serialized waste 'Serialized opportunity')"
lock_episodes="$(jq -cn --argjson episode "$lock_episode" '[$episode]')"
lock_run_1="$(make_run pr-61 61 guided 2026-12-04T10:00:00Z "$lock_episodes")"
lock_run_2="$(make_run pr-62 62 guided 2026-12-04T10:01:00Z "$lock_episodes")"
lock_run_3="$(make_run pr-63 63 guided 2026-12-04T10:02:00Z "$lock_episodes")"
"$OBSERVE" ledger-update --run "$lock_run_1" >"$tmp/lock-seed-1.json"
"$OBSERVE" ledger-update --run "$lock_run_2" >"$tmp/lock-seed-2.json"
rm "$events"
real_python="$(command -v python3)"
serialized_python="$tmp/serialized-python3"
cat >"$serialized_python" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != - ]; then
  exec "$REAL_PYTHON3" "$@"
fi
printf 'ready\n' >>"$SERIAL_READY"
while [ ! -e "$SERIAL_GATE" ]; do sleep 0.01; done
script="$SERIAL_TMP/serialized-$$.py"
trap 'rm -f "$script"' EXIT
"$REAL_PYTHON3" -c '
import sys
source = sys.stdin.read()
needle = "    finally:\n        close_ledger_events(fd)\n    existing_findings = {\n"
if source.count(needle) != 1:
    raise SystemExit("ledger rebuild read/replay boundary not found")
replacement = "    finally:\n        close_ledger_events(fd)\n    __import__(\"time\").sleep(0.25)\n    existing_findings = {\n"
sys.stdout.write(source.replace(needle, replacement))
' >"$script"
"$REAL_PYTHON3" "$script" "${@:2}"
SH
chmod 700 "$serialized_python"
serial_ready="$tmp/serial-ready"
serial_gate="$tmp/serial-gate"
: >"$serial_ready"
(
  REAL_PYTHON3="$real_python" SERIAL_READY="$serial_ready" SERIAL_GATE="$serial_gate" \
    SERIAL_TMP="$tmp" QQ_PYTHON3_BIN="$serialized_python" \
    "$OBSERVE" ledger-rebuild >"$tmp/concurrent-rebuild-1.json"
) &
rebuild_pid_1=$!
(
  REAL_PYTHON3="$real_python" SERIAL_READY="$serial_ready" SERIAL_GATE="$serial_gate" \
    SERIAL_TMP="$tmp" QQ_PYTHON3_BIN="$serialized_python" \
    "$OBSERVE" ledger-rebuild >"$tmp/concurrent-rebuild-2.json"
) &
rebuild_pid_2=$!
(
  REAL_PYTHON3="$real_python" SERIAL_READY="$serial_ready" SERIAL_GATE="$serial_gate" \
    SERIAL_TMP="$tmp" QQ_PYTHON3_BIN="$serialized_python" \
    "$OBSERVE" ledger-update --run "$lock_run_3" >"$tmp/concurrent-update.json"
) &
update_pid=$!
while [ "$(wc -l <"$serial_ready")" -lt 3 ]; do sleep 0.01; done
: >"$serial_gate"
wait "$rebuild_pid_1"
wait "$rebuild_pid_2"
wait "$update_pid"
jq -s -e '
  ([.[] | select(.type == "finding_seen")] | length == 3)
  and ([.[] | select(.type == "promoted")] | length == 1)
' "$events" >/dev/null || fail 'concurrent ledger writers replayed stale membership'

# Compare with the sequential composition selected by the winning writer.
actual_promoted_with_63="$(jq -s '[.[] | select(.type == "promoted" and (.prs | index(63)))] | length' "$events")"
actual_state="$XDG_STATE_HOME"
actual_events="$events"
export XDG_STATE_HOME="$tmp/sequential-ledger-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
sequential_run_1="$(make_run pr-61 61 guided 2026-12-04T10:00:00Z "$lock_episodes")"
sequential_run_2="$(make_run pr-62 62 guided 2026-12-04T10:01:00Z "$lock_episodes")"
sequential_run_3="$(make_run pr-63 63 guided 2026-12-04T10:02:00Z "$lock_episodes")"
"$OBSERVE" ledger-update --run "$sequential_run_1" >"$tmp/sequential-seed-1.json"
"$OBSERVE" ledger-update --run "$sequential_run_2" >"$tmp/sequential-seed-2.json"
rm "$events"
if [ "$actual_promoted_with_63" -eq 1 ]; then
  "$OBSERVE" ledger-update --run "$sequential_run_3" >"$tmp/sequential-update.json"
  "$OBSERVE" ledger-rebuild >"$tmp/sequential-rebuild-1.json"
  "$OBSERVE" ledger-rebuild >"$tmp/sequential-rebuild-2.json"
else
  "$OBSERVE" ledger-rebuild >"$tmp/sequential-rebuild-1.json"
  "$OBSERVE" ledger-rebuild >"$tmp/sequential-rebuild-2.json"
  "$OBSERVE" ledger-update --run "$sequential_run_3" >"$tmp/sequential-update.json"
fi
jq -cS -s 'sort_by(.written_seq, .type, (.pr // 0), (.recurrence_key // ""))[]' \
  "$actual_events" >"$tmp/concurrent-events-canonical.jsonl"
jq -cS -s 'sort_by(.written_seq, .type, (.pr // 0), (.recurrence_key // ""))[]' \
  "$events" >"$tmp/sequential-events-canonical.jsonl"
cmp "$tmp/concurrent-events-canonical.jsonl" "$tmp/sequential-events-canonical.jsonl" >/dev/null \
  || fail 'concurrent writer result differs from its sequential composition'

# An unusable lock path refuses mutation rather than proceeding unlocked.
export XDG_STATE_HOME="$actual_state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$actual_events"
ledger_lock="$(dirname "$events")/.lock"
[ -f "$ledger_lock" ] || fail 'ledger writer lock file was not created'
assert_equal 600 "$(stat -c '%a' "$ledger_lock")" 'ledger writer lock is not private'
rm "$ledger_lock"
mkdir "$ledger_lock"
lock_run_4="$(make_run pr-64 64 guided 2026-12-04T10:03:00Z "$lock_episodes")"
set +e
"$OBSERVE" ledger-update --run "$lock_run_4" \
  >"$tmp/lock-path.stdout" 2>"$tmp/lock-path.stderr"
status=$?
set -e
assert_equal 65 "$status" 'ledger update proceeded without acquiring its writer lock'
[ ! -e "$lock_run_4/.ledger-applied" ] \
  || fail 'failed writer-lock acquisition fabricated ledger state'
rm -rf "$ledger_lock"

export XDG_STATE_HOME="$primary_state"
runs="$primary_runs"
events="$primary_events"

# Refusal paths do not fabricate events or state.
missing="$runs/pr-6"
missing_blind="$runs/pr-6-blind"
mkdir -p "$missing" "$missing_blind"
for spec in "$missing:guided" "$missing_blind:blind"; do
  path="${spec%:*}"
  variant="${spec##*:}"
  jq -cn --arg repo "$ROOT" --arg variant "$variant" '{
    schema:"qq-observer.package",schema_version:1,pr:6,variant:$variant,
    assembled_at:"2026-08-06T10:00:00Z",repo:$repo,sessions:[]
  }' >"$path/package.json"
done
set +e
"$OBSERVE" record-comparison --guided "$missing" --blind "$missing_blind" \
  >"$tmp/missing-comparison.stdout" 2>"$tmp/missing-comparison.stderr"
status=$?
set -e
assert_equal 65 "$status" 'comparison without analysis.json was accepted'
assert_file_contains "$tmp/missing-comparison.stderr" 'lacks analysis.json'
set +e
"$OBSERVE" ledger-update --run "$missing" \
  >"$tmp/missing-update.stdout" 2>"$tmp/missing-update.stderr"
status=$?
set -e
assert_equal 65 "$status" 'ledger-update without finalized analysis was accepted'

outside="$tmp/outside-run"
mkdir "$outside"
set +e
"$OBSERVE" ledger-update --run "$outside" \
  >"$tmp/outside.stdout" 2>"$tmp/outside.stderr"
status=$?
set -e
assert_equal 65 "$status" 'ledger-update accepted a run outside the observer store'
assert_file_contains "$tmp/outside.stderr" 'outside observer runs root'

printf 'test-qq-observe-ledger: pass\n'
