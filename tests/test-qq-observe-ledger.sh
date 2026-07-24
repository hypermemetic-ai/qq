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
' "$run_1/.ledger-applied" >/dev/null || fail 'ledger marker lacks its internal write time'
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

# A retry after events were fsynced but before the marker was written is a no-op.
rm "$run_2/.ledger-applied"
before="$(wc -l <"$events")"
"$OBSERVE" ledger-update --run "$run_2" >"$tmp/update-after-marker-crash.json"
assert_equal "$before" "$(wc -l <"$events")" \
  'marker-write crash recovery duplicated finding events'
jq -e '.findings == 0 and .promoted == 0 and .already_applied == false' \
  "$tmp/update-after-marker-crash.json" >/dev/null \
  || fail 'marker-write crash recovery has the wrong result'
[ -f "$run_2/.ledger-applied" ] || fail 'marker-write crash recovery did not write the marker'

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
  (.[0].pr == 4 and .[0].failed == true and .[0].discussed == false)
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
assert_file_contains "$tmp/digest.md" '| 9 | 2 | `alpha`' \
  'accepted recurrence did not receive its 1.5 multiplier'
assert_file_contains "$tmp/digest.md" '| 3 | 2 | `beta`' \
  'rejected recurrence did not receive its 0.5 multiplier'
assert_file_contains "$tmp/digest.md" '| 3 | 1 | `gamma`' \
  'open finding ranking is wrong'
assert_file_contains "$tmp/digest.md" \
  '| 3 | 2 | `tied` | Latest tied opportunity | `friction` | #10, #11 | low, high | rejected (×0.5) |' \
  'equal-timestamp finding or disposition did not resolve by ledger position'
assert_file_contains "$tmp/digest.md" 'guided-only'
assert_file_contains "$tmp/digest.md" 'blind-only'
assert_file_contains "$tmp/digest.md" 'unabsorbed'
assert_file_contains "$tmp/digest.md" 'Coverage: 5 finalized, 1 failed.'
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
jq -c '.ts = "2026-10-21T10:00:00.300Z"' "$rebuild_21/discussed.json" \
  >"$tmp/rebuild-discussed-record-21.json"
mv "$tmp/rebuild-discussed-record-21.json" "$rebuild_21/discussed.json"
"$OBSERVE" record-comparison --guided "$rebuild_20" --blind "$rebuild_20_blind" \
  >"$tmp/rebuild-comparison-20.json"
jq -c '.written_at = "2026-10-21T10:00:00.400Z"' "$rebuild_20/comparison.json" \
  >"$tmp/rebuild-comparison-record-20.json"
mv "$tmp/rebuild-comparison-record-20.json" "$rebuild_20/comparison.json"
touch -d '2030-01-01T00:00:00.100Z' "$rebuild_21/.ledger-applied"
touch -d '2030-01-01T00:00:00.000Z' "$rebuild_20/.ledger-applied"
touch -d '2030-01-01T00:00:00.000Z' \
  "$rebuild_21/discussed.json" "$rebuild_20/comparison.json"
jq -cS 'if .type == "disposition" or .type == "signal_tune_candidate" then del(.ts) else . end' \
  "$events" >"$tmp/pre-loss-events.jsonl"

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
jq -cS 'if .type == "disposition" or .type == "signal_tune_candidate" then del(.ts) else . end' \
  "$events" >"$tmp/rebuilt-events.jsonl"
cmp "$tmp/pre-loss-events.jsonl" "$tmp/rebuilt-events.jsonl" >/dev/null \
  || fail 'chronological rebuild did not reproduce the pre-loss event sequence'
jq -s -e '
  ([.[] | .type] | sort) ==
    ["disposition","finding_seen","finding_seen","finding_seen","finding_seen","promoted","signal_tune_candidate"]
  and ([.[] | select(.type == "disposition")] | length == 1
       and .[0].outcomes[0].note == "Keep it.")
  and ([.[] | select(.type == "signal_tune_candidate")] | length == 1
       and .[0].recurrence_key == "beta" and .[0].direction == "prune")
' "$events" >/dev/null || fail 'rebuild did not restore every durable event kind'
jq -s -e '
  ([.[] | select(.type == "disposition") | .ts] == ["2026-10-21T10:00:00.300Z"])
  and ([.[] | select(.type == "signal_tune_candidate") | .ts] == ["2026-10-21T10:00:00.400Z"])
' "$events" >/dev/null || fail 'replayed durable events do not use internal record timestamps'

before="$(wc -l <"$events")"
"$OBSERVE" ledger-rebuild >"$tmp/rebuilt-again.json"
assert_equal "$before" "$(wc -l <"$events")" 'second rebuild appended events'
jq -e '
  .runs_seen == 6 and .runs_replayed == 2
  and .events_appended == 0 and .events_skipped == 7
' "$tmp/rebuilt-again.json" >/dev/null || fail 'second rebuild was not a full no-op'

# Equal mtimes cannot reverse same-second disposition chronology during recovery.
export XDG_STATE_HOME="$tmp/chronology-state"
runs="$XDG_STATE_HOME/qq/observer/runs"
events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
chronology_episode="$(make_episode chronology waste 'Chronology opportunity')"
chronology_episodes="$(jq -cn --argjson episode "$chronology_episode" '[$episode]')"
chronology_2="$(make_run pr-2 2 guided 2026-11-02T10:00:00Z "$chronology_episodes")"
chronology_3="$(make_run pr-3 3 guided 2026-11-03T10:00:00Z "$chronology_episodes")"
"$OBSERVE" ledger-update --run "$chronology_2" >"$tmp/chronology-update-2.json"
"$OBSERVE" ledger-update --run "$chronology_3" >"$tmp/chronology-update-3.json"
jq -c 'del(.written_at)' "$chronology_3/.ledger-applied" \
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
  ts:"2026-11-04T10:00:00.100Z",type:"disposition",pr:3,outcomes:$outcomes
}' >"$chronology_3/discussed.json"
"$OBSERVE" mark-discussed --run "$chronology_3" --outcomes "$accepted_outcome" \
  >"$tmp/chronology-discussed-3.json"
jq -cn --argjson outcomes "$(cat "$rejected_outcome")" '{
  schema:"qq-observer.ledger-event",schema_version:1,
  ts:"2026-11-04T10:00:00.900Z",type:"disposition",pr:2,outcomes:$outcomes
}' >"$chronology_2/discussed.json"
"$OBSERVE" mark-discussed --run "$chronology_2" --outcomes "$rejected_outcome" \
  >"$tmp/chronology-discussed-2.json"
touch -d '2030-01-01T00:00:00.000Z' \
  "$chronology_3/discussed.json" "$chronology_2/discussed.json"
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
sed '/^        append_ledger_events(fd, events)$/i\
        raise SystemExit(99)' >"$script"
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
