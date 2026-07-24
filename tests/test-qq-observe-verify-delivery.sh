#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-verify-delivery"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"

old_date=2020-01-01T00:00:00Z
window_date=2026-01-01T00:00:00Z
since=2025-01-01T00:00:00Z

commit_empty() {
  local repo="$1" subject="$2" date="$3"
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
      commit --allow-empty -qm "$subject"
}

init_repo() {
  local repo="$1"
  git init -q -b main "$repo"
  commit_empty "$repo" base "$old_date"
}

merge_subject() {
  local repo="$1" branch="$2" subject="$3"
  git -C "$repo" switch -qc "$branch"
  commit_empty "$repo" "$branch work" "$old_date"
  git -C "$repo" switch -q main
  GIT_AUTHOR_DATE="$window_date" GIT_COMMITTER_DATE="$window_date" \
    git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
      merge -q --no-ff -m "$subject" "$branch"
}

cover_pr() {
  local pr="$1"
  mkdir -p "$XDG_STATE_HOME/qq/observer/runs/pr-$pr"
  printf '{"status":"analysis_failed"}\n' \
    >"$XDG_STATE_HOME/qq/observer/runs/pr-$pr/analysis_failed.json"
}

standard_repo="$tmp/standard"
init_repo "$standard_repo"
merge_subject "$standard_repo" standard-feature \
  'Merge pull request #11 from fixture/standard-feature'
cover_pr 11
"$OBSERVE" verify-delivery --repo "$standard_repo" --since "$since" \
  >"$tmp/standard.json"
jq -e '
  .ok == true and .status == "covered"
  and .prs == [11] and .covered == [11] and .uncovered == []
  and .unresolved_commits == []
' "$tmp/standard.json" >/dev/null || fail 'standard merge was not covered'

inwindow_repo="$tmp/inwindow"
init_repo "$inwindow_repo"
git -C "$inwindow_repo" switch -qc inwindow-feature
commit_empty "$inwindow_repo" "in-window branch work" "$window_date"
git -C "$inwindow_repo" switch -q main
GIT_AUTHOR_DATE="$window_date" GIT_COMMITTER_DATE="$window_date" \
  git -C "$inwindow_repo" -c user.name=test -c user.email=test@example.invalid \
    merge -q --no-ff -m 'Merge pull request #31 from fixture/inwindow-feature' \
      inwindow-feature
cover_pr 31
"$OBSERVE" verify-delivery --repo "$inwindow_repo" --since "$since" \
  >"$tmp/inwindow.json"
jq -e '
  .ok == true and .status == "covered"
  and .prs == [31] and .covered == [31] and .uncovered == []
  and .unresolved_commits == []
' "$tmp/inwindow.json" >/dev/null || fail 'in-window branch work counted as a landed Change'

squash_repo="$tmp/squash"
init_repo "$squash_repo"
commit_empty "$squash_repo" 'Squashed fixture change (#12)' "$window_date"
cover_pr 12
"$OBSERVE" verify-delivery --repo "$squash_repo" --since "$since" \
  >"$tmp/squash.json"
jq -e '
  .ok == true and .status == "covered"
  and .prs == [12] and .covered == [12] and .uncovered == []
  and .unresolved_commits == []
' "$tmp/squash.json" >/dev/null || fail 'GitHub squash title was not covered'

ledger_repo="$tmp/ledger"
init_repo "$ledger_repo"
commit_empty "$ledger_repo" 'Ledger marker fixture (#13)' "$window_date"
ledger_run="$XDG_STATE_HOME/qq/observer/runs/pr-13"
mkdir -p "$ledger_run"
printf '%s\n' '{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture","sessions":["/fixture/session.jsonl"]},"episodes":[],"dropped_signals":[],"limitations":"Fixture."}' \
  >"$ledger_run/analysis.json"
set +e
"$OBSERVE" verify-delivery --repo "$ledger_repo" --since "$since" \
  >"$tmp/ledger-uncovered.json"
status=$?
set -e
assert_equal 1 "$status" 'successful analysis without ledger marker counted as covered'
jq -e '
  .ok == false and .status == "uncovered Changes present"
  and .prs == [13] and .covered == [] and .uncovered == [13]
' "$tmp/ledger-uncovered.json" >/dev/null || fail 'missing ledger marker was not uncovered'
printf '%s\n' \
  '{"analysis_sha256":"0000000000000000000000000000000000000000000000000000000000000000","episode_count":0,"schema":"qq-observer.ledger-applied","schema_version":1,"written_at":"2026-01-01T00:00:00.000Z","written_seq":1}' \
  >"$ledger_run/.ledger-applied"
set +e
"$OBSERVE" verify-delivery --repo "$ledger_repo" --since "$since" \
  >"$tmp/ledger-wrong-hash.json"
status=$?
set -e
assert_equal 1 "$status" 'ledger marker with the wrong analysis hash counted as covered'
analysis_sha256="$(sha256sum "$ledger_run/analysis.json" | awk '{print $1}')"
jq -cnS --arg sha "$analysis_sha256" '{
  analysis_sha256:$sha,episode_count:0,
  schema:"qq-observer.ledger-applied",schema_version:1,
  written_at:"2026-01-01T00:00:00.000Z",written_seq:1
}' >"$ledger_run/.ledger-applied"
"$OBSERVE" verify-delivery --repo "$ledger_repo" --since "$since" \
  >"$tmp/ledger-covered.json"
jq -e '.ok == true and .covered == [13] and .uncovered == []' \
  "$tmp/ledger-covered.json" >/dev/null || fail 'certified empty analysis was not covered'

# Coverage is per package variant: blind findings cannot certify a guided marker,
# while a zero-episode guided marker remains covered beside blind findings.
commit_empty "$ledger_repo" 'Blind-only coverage fixture (#14)' "$window_date"
commit_empty "$ledger_repo" 'Zero guided coverage fixture (#15)' "$window_date"
commit_empty "$ledger_repo" 'Legacy marker fixture (#16)' "$window_date"
for pr in 14 15 16; do
  run="$XDG_STATE_HOME/qq/observer/runs/pr-$pr"
  mkdir -p "$run"
  if [ "$pr" -eq 14 ]; then
    printf '%s\n' '{"episodes":[{}]}' >"$run/analysis.json"
  else
    printf '%s\n' '{"episodes":[]}' >"$run/analysis.json"
  fi
  sha="$(sha256sum "$run/analysis.json" | awk '{print $1}')"
  if [ "$pr" -eq 16 ]; then
    jq -cnS --arg sha "$sha" '{
      analysis_sha256:$sha,schema:"qq-observer.ledger-applied",schema_version:1
    }' >"$run/.ledger-applied"
  else
    count=0
    [ "$pr" -eq 14 ] && count=1
    jq -cnS --arg sha "$sha" --argjson pr "$pr" --argjson count "$count" '{
      analysis_sha256:$sha,episode_count:$count,
      schema:"qq-observer.ledger-applied",schema_version:1,
      written_at:"2026-01-01T00:00:00.000Z",written_seq:$pr
    }' >"$run/.ledger-applied"
  fi
done
ledger_events="$XDG_STATE_HOME/qq/observer/ledger/events.jsonl"
mkdir -p "$(dirname "$ledger_events")"
for pr in 14 15; do
  jq -cn --argjson pr "$pr" '{
    schema:"qq-observer.ledger-event",schema_version:1,written_seq:$pr,
    ts:"2026-01-01T00:00:00.000Z",type:"finding_seen",pr:$pr,variant:"blind",
    recurrence_key:("blind-"+($pr|tostring)),kind:"waste",title:"Blind finding",
    rank:1,confidence:"high",no_signal:false,
    cost:{turns:1,tokens:1,duration_ms:1}
  }' >>"$ledger_events"
done
set +e
"$OBSERVE" verify-delivery --repo "$ledger_repo" --since "$since" \
  >"$tmp/ledger-variant-coverage.json"
status=$?
set -e
assert_equal 1 "$status" 'blind finding or legacy marker produced complete coverage'
jq -e '
  .covered == [13,15] and .uncovered == [14,16]
' "$tmp/ledger-variant-coverage.json" >/dev/null \
  || fail 'delivery coverage was not variant-aware and legacy-fail-closed'

custom_repo="$tmp/custom"
init_repo "$custom_repo"
merge_subject "$custom_repo" custom-feature 'Release the custom fixture'
custom_oid="$(git -C "$custom_repo" rev-parse main)"
set +e
"$OBSERVE" verify-delivery --repo "$custom_repo" --since "$since" \
  >"$tmp/custom.json"
status=$?
set -e
assert_equal 1 "$status" 'custom-title merge history did not fail closed'
jq -e --arg oid "$custom_oid" '
  .ok == false and .status == "unparseable history present"
  and .prs == [] and .covered == [] and .uncovered == []
  and .unresolved_commits == [{oid:$oid,subject:"Release the custom fixture"}]
' "$tmp/custom.json" >/dev/null || fail 'custom-title merge was silently omitted'

mixed_repo="$tmp/mixed"
init_repo "$mixed_repo"
merge_subject "$mixed_repo" mixed-standard \
  'Merge pull request #21 from fixture/mixed-standard'
commit_empty "$mixed_repo" 'Mixed squash change (#22)' "$window_date"
merge_subject "$mixed_repo" mixed-custom 'Mixed custom merge title'
cover_pr 21
set +e
"$OBSERVE" verify-delivery --repo "$mixed_repo" --since "$since" \
  >"$tmp/mixed.json"
status=$?
set -e
assert_equal 1 "$status" 'mixed unresolved and uncovered history did not fail closed'
jq -e '
  .ok == false and .status == "unparseable history present"
  and .prs == [21,22] and .covered == [21] and .uncovered == [22]
  and [.unresolved_commits[].subject] == ["Mixed custom merge title"]
' "$tmp/mixed.json" >/dev/null || fail 'mixed history report dropped a landed commit'

"$OBSERVE" verify-delivery --repo "$mixed_repo" --since 2030-01-01T00:00:00Z \
  >"$tmp/empty.json"
jq -e '
  .ok == true and .status == "no landed Changes in window"
  and .prs == [] and .covered == [] and .uncovered == []
  and .unresolved_commits == []
' "$tmp/empty.json" >/dev/null || fail 'empty window was not distinguished from unresolved history'

printf 'test-qq-observe-verify-delivery: pass\n'
