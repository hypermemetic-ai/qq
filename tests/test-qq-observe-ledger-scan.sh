#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-ledger-scan"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home" XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"

repo="$tmp/repo"
git init -q -b main "$repo"
git -C "$repo" remote add origin git@github.com:fixture/scan.git
git -C "$repo" config branch.main.remote origin
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

# A durable disposition is scanned with the analyses; old sequence fields are
# accepted by readers but new records do not need one.
jq -cnS '{
  schema:"qq-observer.ledger-event",schema_version:2,
  repository:"fixture/scan",ts:"2026-01-03T00:00:00.000Z",type:"disposition",
  pr:1,variant:"guided",written_seq:99,
  outcomes:[{recurrence_key:"scan-key",verdict:"rejected",scope:"",note:"Fixture."}]
}' >"$runs/pr-1/discussed.json"

write_package 3 2026-01-03T00:00:00Z
printf '%s\n' \
  '{"reason":"fixture failure","schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed"}' \
  >"$runs/pr-3/analysis_failed.json"

observer_root="$XDG_STATE_HOME/qq/observer"
ledger_dir="$observer_root/ledger"
assert_no_ledger() {
  [ ! -e "$ledger_dir" ] || fail 'computed Observer view created a ledger directory'
}

"$OBSERVE" digest >"$tmp/digest.md"
assert_file_contains "$tmp/digest.md" 'Run two title'
assert_file_contains "$tmp/digest.md" 'fixture/scan#1, fixture/scan#2'
assert_file_contains "$tmp/digest.md" 'rejected (×0.5)'
assert_file_contains "$tmp/digest.md" 'Coverage: 2 finalized, 1 failed.'
assert_no_ledger
rm -rf "$ledger_dir"

"$OBSERVE" rounds >"$tmp/rounds.json"
jq -e --arg run "$runs/pr-2" '
  any(.[]; .run_dir == $run and .analyzed == true and .failed == false)
' "$tmp/rounds.json" >/dev/null || fail 'rounds did not recognize a finalized analysis'
assert_no_ledger

"$OBSERVE" architect-context >"$tmp/context.json"
jq -e '
  any(.findings[]; .recurrence_key == "scan-key"
    and (.occurrences | length) == 1
    and .occurrences[0].source.pr == 2)
' "$tmp/context.json" >/dev/null \
  || fail 'Architect occurrences did not derive from live analyses and dispositions'
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

printf 'test-qq-observe-ledger-scan: pass\n'
