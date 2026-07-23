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
