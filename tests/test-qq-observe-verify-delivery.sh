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

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2" = "repo view" ]
repository="${3#*github.com:}"
repository="${repository#https://github.com/}"
repository="${repository%.git}"
printf '{"nameWithOwner":"%s"}\n' "$repository"
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"

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
  current_repository="fixture/$(basename "$repo")"
  git -C "$repo" remote add origin "git@github.com:${current_repository}.git"
  git -C "$repo" config branch.main.remote origin
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
  local pr="$1" owner="${current_repository%%/*}" name="${current_repository#*/}"
  local run="$XDG_STATE_HOME/qq/observer/runs/by-repository/$owner/$name/pr-$pr"
  mkdir -p "$run"
  printf '%s\n' \
    '{"reason":"fixture analysis failure","schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed"}' \
    >"$run/analysis_failed.json"
}

standard_repo="$tmp/standard"
init_repo "$standard_repo"
merge_subject "$standard_repo" standard-feature \
  'Merge pull request #11 from fixture/standard-feature'
cover_pr 11
set +e
"$OBSERVE" verify-delivery --repo "$standard_repo" --since "$since" \
  >"$tmp/standard.json"
status=$?
set -e
assert_equal 1 "$status" 'analysis failure reported healthy delivery'
jq -e '
  .ok == false and .status == "analysis failures present"
  and .prs == [11] and .covered == [] and .analysis_failed == [11]
  and .uncovered == [] and .unresolved_commits == []
' "$tmp/standard.json" >/dev/null || fail 'standard analysis failure was not distinct'

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
set +e
"$OBSERVE" verify-delivery --repo "$inwindow_repo" --since "$since" \
  >"$tmp/inwindow.json"
status=$?
set -e
assert_equal 1 "$status" 'in-window analysis failure reported healthy delivery'
jq -e '
  .ok == false and .status == "analysis failures present"
  and .prs == [31] and .covered == [] and .analysis_failed == [31]
  and .uncovered == [] and .unresolved_commits == []
' "$tmp/inwindow.json" >/dev/null \
  || fail 'in-window analysis failure was not distinct'

squash_repo="$tmp/squash"
init_repo "$squash_repo"
commit_empty "$squash_repo" 'Squashed fixture change (#12)' "$window_date"
cover_pr 12
set +e
"$OBSERVE" verify-delivery --repo "$squash_repo" --since "$since" \
  >"$tmp/squash.json"
status=$?
set -e
assert_equal 1 "$status" 'squash analysis failure reported healthy delivery'
jq -e '
  .ok == false and .status == "analysis failures present"
  and .prs == [12] and .covered == [] and .analysis_failed == [12]
  and .uncovered == [] and .unresolved_commits == []
' "$tmp/squash.json" >/dev/null || fail 'squash analysis failure was not distinct'

ledger_repo="$tmp/ledger"
init_repo "$ledger_repo"
commit_empty "$ledger_repo" 'Finalized analysis fixture (#13)' "$window_date"
commit_empty "$ledger_repo" 'Finding analysis fixture (#14)' "$window_date"
commit_empty "$ledger_repo" 'Uncovered fixture (#15)' "$window_date"
ledger_runs="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/ledger"
write_package() {
  local pr="$1"
  local run="$ledger_runs/pr-$pr"
  mkdir -p "$run"
  jq -cn --arg repo "$ledger_repo" --argjson pr "$pr" '{
    assembled_at:"2026-01-01T00:00:00Z",branch:"fixture",merge_commit:"aaaaaaaa",
    merged_at:"2026-01-01T00:00:00Z",pr:$pr,repo:$repo,repository:"fixture/ledger",
    schema:"qq-observer.package",schema_version:2,sessions:[],unknown_entries:[],
    variant:"guided",warnings:[]
  }' >"$run/package.json"
}
write_package 13
printf '%s\n' '{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture/ledger#13","sessions":["/fixture/session.jsonl"]},"episodes":[],"dropped_signals":[],"limitations":"Fixture."}' \
  >"$ledger_runs/pr-13/analysis.json"
write_package 14
cat >"$ledger_runs/pr-14/analysis.json" <<'JSON'
{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture/ledger#14","sessions":["/fixture/session.jsonl"]},"episodes":[{"kind":"waste","title":"Covered finding","sessions":["/fixture/session.jsonl"],"evidence":[{"session":"/fixture/session.jsonl","entries":[1],"quote":"fixture"}],"what_happened":"Fixture.","root_cause":"Fixture.","root_cause_location":"harness-design","cost":{"turns":1,"tokens":1,"duration_ms":1,"source":"facts:/fixture/session.jsonl"},"remedy":{"type":"process","smallest_change":"Fix it."},"confidence":"high","confidence_why":"Fixture.","recurrence_key":"covered-finding","rank":1,"no_signal":false}],"dropped_signals":[],"limitations":"Fixture."}
JSON
set +e
"$OBSERVE" verify-delivery --repo "$ledger_repo" --since "$since" \
  >"$tmp/analysis-coverage.json"
status=$?
set -e
assert_equal 1 "$status" 'uncovered Change reported healthy delivery'
jq -e '
  .ok == false and .status == "uncovered Changes present"
  and .prs == [13,14,15] and .covered == [13,14]
  and .analysis_failed == [] and .uncovered == [15]
' "$tmp/analysis-coverage.json" >/dev/null \
  || fail 'delivery coverage did not derive from finalized live analyses'

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
  and .prs == [] and .covered == [] and .analysis_failed == [] and .uncovered == []
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
  and .prs == [21,22] and .covered == [] and .analysis_failed == [21]
  and .uncovered == [22]
  and [.unresolved_commits[].subject] == ["Mixed custom merge title"]
' "$tmp/mixed.json" >/dev/null || fail 'mixed history report dropped a landed commit'

"$OBSERVE" verify-delivery --repo "$mixed_repo" --since 2030-01-01T00:00:00Z \
  >"$tmp/empty.json"
jq -e '
  .ok == true and .status == "no landed Changes in window"
  and .prs == [] and .covered == [] and .analysis_failed == [] and .uncovered == []
  and .unresolved_commits == []
' "$tmp/empty.json" >/dev/null || fail 'empty window was not distinguished from unresolved history'

printf 'test-qq-observe-verify-delivery: pass\n'
