#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-ledger-scan"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home" XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"

repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" remote add origin git@github.com:fixture/scan.git
git -C "$repo" config branch.main.remote origin
mkdir -p "$repo/bin/lib" "$repo/backlog"/{tasks,completed,drafts,docs,decisions,archive,milestones}
cp "$ROOT/bin/qq-observe" "$repo/bin/qq-observe"
cp "$ROOT/bin/lib/qq-bin.sh" "$ROOT/bin/lib/qq_task_identity.py" "$repo/bin/lib/"
cp "$ROOT/backlog/config.yml" "$repo/backlog/config.yml"
OBSERVE="$repo/bin/qq-observe"
commit_fixture() {
  local subject="$1" date="$2"
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
      commit --allow-empty -qm "$subject"
}
commit_fixture base 2020-01-01T00:00:00Z
commit_fixture 'First finalized analysis (#1)' 2026-01-01T00:00:00Z
commit_fixture 'Second finalized analysis (#2)' 2026-01-02T00:00:00Z

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2" = "repo view" ]
printf '{"nameWithOwner":"fixture/scan"}\n'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"

runs="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/scan"
write_package() {
  local pr="$1" assembled="$2"
  local run="$runs/pr-$pr"
  mkdir -p "$run"
  jq -cn --arg repo "$repo" --argjson pr "$pr" --arg assembled "$assembled" '{
    assembled_at:$assembled,branch:"fixture",merge_commit:"aaaaaaaa",
    merged_at:$assembled,pr:$pr,repo:$repo,repository:"fixture/scan",
    schema:"qq-observer.package",schema_version:2,sessions:[],
    unknown_entries:[],variant:"guided",warnings:[]
  }' >"$run/package.json"
}
write_analysis() {
  local pr="$1" title="$2"
  local run="$runs/pr-$pr"
  jq -cn --argjson pr "$pr" --arg title "$title" '{
    schema:"qq-observer.analysis",schema_version:1,
    run:{change:("fixture/scan#"+($pr|tostring)),sessions:["/fixture/session.jsonl"]},
    episodes:[{
      kind:"waste",title:$title,sessions:["/fixture/session.jsonl"],
      evidence:[{session:"/fixture/session.jsonl",entries:[1],quote:"fixture"}],
      what_happened:"Fixture.",root_cause:"Fixture.",
      root_cause_location:"harness-design",
      cost:{turns:1,tokens:1,duration_ms:1,source:"facts:/fixture/session.jsonl"},
      remedy:{type:"process",smallest_change:"Fix it."},confidence:"high",
      confidence_why:"Fixture.",recurrence_key:"scan-key",rank:1,no_signal:false
    },{
      kind:"friction",title:"Decision-covered fixture",sessions:["/fixture/session.jsonl"],
      evidence:[{session:"/fixture/session.jsonl",entries:[2],quote:"decision fixture"}],
      what_happened:"Fixture.",root_cause:"Fixture.",
      root_cause_location:"harness-design",
      cost:{turns:1,tokens:1,duration_ms:1,source:"facts:/fixture/session.jsonl"},
      remedy:{type:"process",smallest_change:"Keep the decision."},confidence:"medium",
      confidence_why:"Fixture.",recurrence_key:"explicit-decision-settlement-zebra-984",rank:2,no_signal:false
    }],dropped_signals:[],limitations:"Fixture."
  }' >"$run/analysis.json"
}

write_package 1 2026-01-01T00:00:00Z
write_analysis 1 'Run one title'
jq 'del(.episodes[0].rank)' "$runs/pr-1/analysis.json" >"$tmp/historical-analysis.json"
mv "$tmp/historical-analysis.json" "$runs/pr-1/analysis.json"
write_package 2 2026-01-02T00:00:00Z
write_analysis 2 'Run two title'
touch -d 2026-01-01T01:00:00Z "$runs/pr-1/analysis.json"
touch -d 2026-01-02T01:00:00Z "$runs/pr-2/analysis.json"

# Seed the fixture store's managed Observer-dispositions document.
created="$(cd "$repo" && backlog doc create -t specification "Observer dispositions")"
dispositions_id="$(printf '%s\n' "$created" | grep -oE 'doc-[0-9]+' | head -1)"
dispositions_body=$(cat <<'EOF'
# Observer dispositions

The operator-settled dispositions of Observer Architect findings. Append
only through `backlog doc update --content` with the complete body
(qq-observe owns the append; never hand-edit). Coverage of a recurrence
key = a settled entry here, or a Backlog decision-record hit for the key
(Task, plan, and doc mentions never settle).

## Entries

(none yet)
EOF
)
(cd "$repo" && backlog doc update "$dispositions_id" --content "$dispositions_body" >/dev/null)

# Only settlement-grade surfaces cover: Task and document hits for scan-key do
# not cover it, while a decision-record hit covers its separate recurrence key.
(cd "$repo" && backlog task create "Task mentions scan-key" --description "scan-key" --plain >/dev/null)
other_doc="$(cd "$repo" && backlog doc create -t specification "Document mentions scan-key")"
other_doc_id="$(printf '%s\n' "$other_doc" | grep -oE 'doc-[0-9]+' | head -1)"
(cd "$repo" && backlog doc update "$other_doc_id" --content "scan-key" >/dev/null)
(cd "$repo" && backlog decision create -s accepted \
  "Settlement for explicit-decision-settlement-zebra-984" >/dev/null)

write_package 3 2026-01-03T00:00:00Z
printf '%s\n' \
  '{"reason":"fixture failure","schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed"}' \
  >"$runs/pr-3/analysis_failed.json"

observer_root="$XDG_STATE_HOME/qq/observer"
ledger_dir="$observer_root/ledger"
assert_no_ledger() {
  [ ! -e "$ledger_dir" ] || fail 'computed Observer view created a ledger directory'
}

# The doc-backed disposition is proposed, appears pending, then settles the key.
"$OBSERVE" architect-context >"$tmp/context-uncovered.json"
jq -e '
  .schema_version == 4 and .pending_intakes == []
  and any(.findings[]; .recurrence_key == "scan-key" and .covered == false
    and (.occurrences | length) == 2)
  and all(.findings[]; .recurrence_key != "explicit-decision-settlement-zebra-984")
' "$tmp/context-uncovered.json" >/dev/null \
  || fail 'Architect context did not expose the uncovered fixture key'
context_id="$(jq -r .context_id "$tmp/context-uncovered.json")"
jq '[.findings[] | select(.recurrence_key == "scan-key") |
  {recurrence_key,occurrence_ids:([.occurrences[].occurrence_id]|sort),action:"set_aside",scope:"",note:"Fixture."}]
' "$tmp/context-uncovered.json" >"$tmp/disposition-decisions.json"
"$OBSERVE" disposition-propose --context "$context_id" \
  --decisions "$tmp/disposition-decisions.json" >"$tmp/disposition-proposed.json"
batch_id="$(jq -r .batch_id "$tmp/disposition-proposed.json")"
"$OBSERVE" architect-context >"$tmp/context-pending.json"
jq -e --arg batch "$batch_id" --arg birth "$context_id" '
  (.pending_intakes | length) == 1 and .pending_intakes[0].batch_id == $batch
  and .pending_intakes[0].status == "proposed"
  and .pending_intakes[0].context_id == $birth and .context_id != $birth
  and all(.findings[]; .recurrence_key != "scan-key")
' "$tmp/context-pending.json" >/dev/null || fail 'doc-backed proposal lost its birth context or did not become pending'
"$OBSERVE" disposition-confirm --context "$context_id" --batch "$batch_id" \
  >"$tmp/disposition-confirmed.json"
"$OBSERVE" architect-context >"$tmp/context-covered.json"
jq -e '
  .pending_intakes == [] and all(.findings[]; .recurrence_key != "scan-key")
' "$tmp/context-covered.json" >/dev/null || fail 'settled disposition did not cover its key'

"$OBSERVE" digest >"$tmp/digest.md"
assert_file_contains "$tmp/digest.md" 'Run two title'
assert_file_contains "$tmp/digest.md" 'fixture/scan#1, fixture/scan#2'
assert_file_contains "$tmp/digest.md" 'rejected (×0.5)'
assert_file_contains "$tmp/digest.md" 'Coverage: 2 finalized, 1 failed.'
assert_no_ledger
rm -rf "$ledger_dir"

"$OBSERVE" rounds >"$tmp/rounds.json"
jq -e --arg run "$runs/pr-2" '
  any(.[]; .run_dir == $run and .analyzed == true and .failed == false and .covered == true
    and (has("discussed")|not) and (has("handoff")|not) and (has("task_ids")|not))
' "$tmp/rounds.json" >/dev/null || fail 'rounds did not use doc-backed run coverage'
assert_no_ledger

# Delivery coverage is computed from the same live analysis scan.
set +e
"$OBSERVE" verify-delivery --repo "$repo" --since 2025-01-01T00:00:00Z \
  >"$tmp/covered.json"
status=$?
set -e
assert_equal 0 "$status" 'finalized analyses did not cover landed Changes'
jq -e '.covered == [1,2] and .uncovered == []' "$tmp/covered.json" >/dev/null \
  || fail 'delivery coverage did not count computed findings'
mv "$runs/pr-2/analysis.json" "$tmp/pr-2-analysis.json"
set +e
"$OBSERVE" verify-delivery --repo "$repo" --since 2025-01-01T00:00:00Z \
  >"$tmp/uncovered.json"
status=$?
set -e
assert_equal 1 "$status" 'missing finalized analysis remained covered'
jq -e '.covered == [1] and .uncovered == [2]' "$tmp/uncovered.json" >/dev/null \
  || fail 'delivery coverage did not expose the missing finalized analysis'
mv "$tmp/pr-2-analysis.json" "$runs/pr-2/analysis.json"
assert_no_ledger

# Successful finalize remains the sole writer of analysis outputs and does not
# create any ledger-side marker or event store.
finalize_run="$runs/pr-4"
write_package 4 2026-01-04T00:00:00Z
mkdir -p "$finalize_run/sessions" "$finalize_run/facts"
session="$finalize_run/sessions/observer.jsonl"
cat >"$session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-01-04T00:00:00Z"}
{"type":"message","timestamp":"2026-01-04T00:00:01Z","message":{"role":"user","content":"fixture"}}
JSONL
"$OBSERVE" facts "$session" >"$finalize_run/facts/observer.json"
facts="$finalize_run/facts/observer.json"
jq --arg facts "$facts" '.sessions=[{label:"observer",facts:$facts}]' \
  "$finalize_run/package.json" >"$tmp/finalize-package.json"
mv "$tmp/finalize-package.json" "$finalize_run/package.json"
cat >"$tmp/finalize-analysis.json" <<JSON
{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture/scan#4","sessions":["$session"]},"episodes":[],"dropped_signals":[],"limitations":"Fixture."}
JSON
cp "$session" "$tmp/analyst-trace.jsonl"
"$OBSERVE" finalize --run "$finalize_run" \
  --analysis "$tmp/finalize-analysis.json" --analyst-trace "$tmp/analyst-trace.jsonl" \
  >"$tmp/finalize.json"
jq -e '.status == "finalized" and (.written | sort) == ["analysis.json","analysis.md","analyst-trace.jsonl"]' \
  "$tmp/finalize.json" >/dev/null || fail 'successful finalize lost its output contract'
legacy_suffix=applied
[ ! -e "$finalize_run/.ledger-$legacy_suffix" ] \
  || fail 'finalize wrote a retired application marker'
assert_no_ledger

for retired in record id summarize read-session; do
  set +e
  "$OBSERVE" "$retired" fixture >"$tmp/$retired.out" 2>"$tmp/$retired.err"
  status=$?
  set -e
  assert_equal 64 "$status" "$retired command remains available"
  assert_file_contains "$tmp/$retired.err" 'usage:'
done

# F-1 regression coverage: behaviors that survived the store deletion keep
# their Checks here (review finding, T-186.9).

# (1) A recurrence key seen in two or more sources is promoted; the digest
# sections promoted rows under "Opportunities ledger" and the rest under
# "Open findings". The shared scan-key spans pr-1 and pr-2 above.
write_package 5 2026-01-05T00:00:00Z
jq '.episodes = [(.episodes[0] | .recurrence_key = "solo-key")]' \
  "$runs/pr-2/analysis.json" >"$tmp/pr-5-analysis.json"
mkdir -p "$runs/pr-5"
cp "$tmp/pr-5-analysis.json" "$runs/pr-5/analysis.json"
"$OBSERVE" digest >"$tmp/digest-sectioned.md"
awk '/^## Opportunities ledger$/{s=1} /^## Open findings$/{s=2} {print s, $0}' \
  "$tmp/digest-sectioned.md" >"$tmp/sections.txt"
grep -q '^1 .*`scan-key`' "$tmp/sections.txt" \
  || fail 'promoted key missing from Opportunities ledger'
if grep -q '^2 .*`scan-key`' "$tmp/sections.txt"; then
  fail 'promoted key also rendered under Open findings'
fi
grep -q '^2 .*`solo-key`' "$tmp/sections.txt" \
  || fail 'single-source key missing from Open findings'
if grep -q '^1 .*`solo-key`' "$tmp/sections.txt"; then
  fail 'single-source key promoted with one source'
fi
assert_no_ledger

# (2) digest --since windowing and the stored digest file.
"$OBSERVE" digest --since 2026-06-01T00:00:00Z >"$tmp/digest-windowed.md"
assert_file_contains "$tmp/digest-windowed.md" '| — | — | None'
digest_dir="$observer_root/digests"
[ -d "$digest_dir" ] || fail 'digest did not persist into the digests store'
stored_count="$(find "$digest_dir" -maxdepth 1 -name '*.md' | wc -l)"
[ "$stored_count" -ge 1 ] || fail 'no stored digest file written'
latest="$(ls -t "$digest_dir"/*.md | head -1)"
cmp "$latest" "$tmp/digest-windowed.md" \
  || fail 'stored digest does not match the emitted digest'
"$OBSERVE" digest --since 2026-06-01T00:00:00Z >"$tmp/digest-windowed-2.md"
stored_count_2="$(find "$digest_dir" -maxdepth 1 -name '*.md' | wc -l)"
[ "$stored_count_2" -gt "$stored_count" ] \
  || fail 'repeated digest did not suffix a new stored digest'
assert_no_ledger

printf 'test-qq-observe-ledger-scan: pass\n'
