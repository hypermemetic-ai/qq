#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-reap"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
REAP="$ROOT/bin/qq-reap"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

init_fixture() {
  local fixture_root="$1"
  fixture_remote="$fixture_root/remote.git"
  fixture_repo="$fixture_root/repo"
  mkdir -p "$fixture_root"
  git init -q --bare "$fixture_remote"
  git clone -q "$fixture_remote" "$fixture_repo" 2>/dev/null
  git -C "$fixture_repo" config user.name test
  git -C "$fixture_repo" config user.email test@example.com
  git -C "$fixture_repo" switch -qc main
  fixture_store="$fixture_root/store"
  git init -q "$fixture_store"
  git -C "$fixture_store" config user.name test
  git -C "$fixture_store" config user.email test@example.com
  mkdir -p "$fixture_store/docs" "$fixture_repo/live"
  ln -s "$fixture_store" "$fixture_repo/backlog"
  printf 'live\n' >"$fixture_repo/live/path.txt"
  printf '# Fixture\n' >"$fixture_repo/README.md"
}

commit_and_push_base() {
  local repo="$1"
  git -C "$repo/backlog" add .
  git -C "$repo/backlog" commit -qm base --allow-empty
  git -C "$repo" add .
  git -C "$repo" commit -qm base
  git -C "$repo" push -qu origin main
}

run_reap() {
  local expected_exit="$1"
  local output="$2"
  shift 2
  set +e
  "$REAP" "$@" >"$output"
  actual_exit=$?
  set -e
  if [ "$actual_exit" -ne "$expected_exit" ]; then
    printf 'qq-reap output: %s\n' "$(<"$output")" >&2
    fail "unexpected qq-reap exit for: $*"
  fi
  jq -e . "$output" >/dev/null
}

fake_herdr="$tmp/herdr"
cat >"$fake_herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_HERDR_LOG"
case "${1:-} ${2:-}" in
  "workspace list")
    if [ -n "${FAKE_CLEAN_WORKTREE:-}" ] && [ -d "$FAKE_CLEAN_WORKTREE" ]; then
      agent_status=idle
      [ "${FAKE_HERDR_RAIL:-}" != live ] || agent_status=working
      jq -cn --arg checkout "$FAKE_CLEAN_WORKTREE" \
        --arg agent_status "$agent_status" '
        {result:{workspaces:[
          {workspace_id:"clean-ws",agent_status:$agent_status,
           worktree:{checkout_path:$checkout,is_linked_worktree:true}}
        ]}}'
    else
      printf '%s\n' '{"result":{"workspaces":[]}}'
    fi
    ;;
  "api snapshot")
    focused_workspace=home-ws
    agents='[]'
    if [ "${FAKE_HERDR_RAIL:-}" = focus ]; then
      focused_workspace=clean-ws
    elif [ "${FAKE_HERDR_RAIL:-}" = live ]; then
      agents='[{"workspace_id":"clean-ws","agent_status":"working","pane_id":"clean-ws:agent"}]'
    fi
    jq -cn --arg focused_workspace "$focused_workspace" \
      --argjson agents "$agents" \
      '{result:{focused_workspace_id:$focused_workspace,agents:$agents}}'
    ;;
  "pane list")
    if [ "${FAKE_HERDR_RAIL:-}" = pane ]; then
      printf '%s\n' '{"result":{"panes":[{"pane_id":"clean-ws:p1","tab_id":"clean-ws:t1"},{"pane_id":"clean-ws:p2","tab_id":"clean-ws:t1"}]}}'
    else
      printf '%s\n' '{"result":{"panes":[{"pane_id":"clean-ws:p1","tab_id":"clean-ws:t1"}]}}'
    fi
    ;;
  "worktree remove")
    [ "${3:-}" = --workspace ] || exit 64
    [ "${4:-}" = clean-ws ] || exit 65
    git -C "$FAKE_REPO" worktree remove "$FAKE_CLEAN_WORKTREE"
    printf '%s\n' '{"result":{"removed":true}}'
    ;;
  *)
    printf 'unexpected fake herdr command: %s\n' "$*" >&2
    exit 66
    ;;
esac
SH
chmod +x "$fake_herdr"
export QQ_HERDR_BIN="$fake_herdr"
export FAKE_HERDR_LOG="$tmp/herdr.log"

# Rich fixture: live/stale/mixed docs, merged/unmerged branches, and clean,
# dirty, and unmerged linked worktrees.
init_fixture "$tmp/rich"
repo="$fixture_repo"
printf '%s\n' \
  'Only live refs: `live/path.txt` and `README.md`.' \
  'Non-repo code: `~/.local/bin`, `https://example.test/path`, `<repo>/bin`.' \
  '```text' '`live/fenced-missing.txt`' '```' \
  >"$repo/backlog/docs/live.md"
printf 'Dead ref: `live/missing.txt`.\n' \
  >"$repo/backlog/docs/stale.md"
printf 'Mixed refs: `live/path.txt`, `live/other-missing.txt`, and `REVIEW.md`.\n' \
  >"$repo/backlog/docs/mixed.md"
commit_and_push_base "$repo"

git -C "$repo" switch -qc merged-feature
printf 'merged\n' >"$repo/merged.txt"
git -C "$repo" add merged.txt
git -C "$repo" commit -qm merged-feature
git -C "$repo" switch -q main
git -C "$repo" merge -q --no-ff merged-feature -m 'merge feature'
git -C "$repo" push -q origin main

git -C "$repo" switch -qc unmerged-feature
printf 'unmerged\n' >"$repo/unmerged.txt"
git -C "$repo" add unmerged.txt
git -C "$repo" commit -qm unmerged-feature
git -C "$repo" switch -q main

clean_worktree="$tmp/rich-clean-worktree"
dirty_worktree="$tmp/rich-dirty-worktree"
unmerged_worktree="$tmp/rich-unmerged-worktree"
git -C "$repo" worktree add -q -b clean-wt "$clean_worktree" main
git -C "$repo" worktree add -q -b dirty-wt "$dirty_worktree" main
printf 'dirty\n' >"$dirty_worktree/untracked.txt"
git -C "$repo" worktree add -q -b unmerged-wt "$unmerged_worktree" main
printf 'worktree-only\n' >"$unmerged_worktree/worktree-only.txt"
git -C "$unmerged_worktree" add worktree-only.txt
git -C "$unmerged_worktree" commit -qm unmerged-worktree

export FAKE_REPO="$repo"
export FAKE_CLEAN_WORKTREE="$clean_worktree"
export XDG_STATE_HOME="$tmp/rich-state"

status_before="$(git -C "$repo" status --porcelain --untracked-files=all)"
store_status_before="$(git -C "$repo/backlog" status --porcelain --untracked-files=all)"
branches_before="$(git -C "$repo" for-each-ref --format='%(refname)' refs/heads)"
worktrees_before="$(git -C "$repo" worktree list --porcelain)"
scan_json="$tmp/rich-scan.json"
run_reap 0 "$scan_json" scan --repo "$repo"
jq -e '
  .status == "done"
  and (.state.report_path | type == "string" and length > 0)
  and .state.nomination_counts == {docs:2,branches:1,worktrees:1,total:4}
' "$scan_json" >/dev/null
scan_report="$(jq -r '.state.report_path' "$scan_json")"
[ -f "$scan_report" ] || fail 'scan did not write its dated report'
[ -L "$XDG_STATE_HOME/qq-reap/reports/latest" ] \
  || fail 'scan did not refresh latest symlink'
assert_equal "$(basename "$scan_report")" \
  "$(readlink "$XDG_STATE_HOME/qq-reap/reports/latest")" \
  'latest does not point to the scan report'
assert_equal "$status_before" \
  "$(git -C "$repo" status --porcelain --untracked-files=all)" \
  'scan changed the primary working tree'
assert_equal "$store_status_before" \
  "$(git -C "$repo/backlog" status --porcelain --untracked-files=all)" \
  'scan changed the backlog store'
assert_equal "$branches_before" \
  "$(git -C "$repo" for-each-ref --format='%(refname)' refs/heads)" \
  'scan changed local branches'
assert_equal "$worktrees_before" "$(git -C "$repo" worktree list --porcelain)" \
  'scan changed registered worktrees'

assert_file_contains "$scan_report" '"id":"doc:docs/stale.md"'
assert_file_contains "$scan_report" '"id":"doc:docs/mixed.md"'
assert_file_contains "$scan_report" '"dead_paths":["live/other-missing.txt","REVIEW.md"]'
assert_file_contains "$scan_report" \
  '"command":"git -C \"'"$repo"'/backlog\" rm -- \"docs/stale.md\""'
assert_file_contains "$scan_report" '"id":"branch:refs/heads/merged-feature"'
assert_file_contains "$scan_report" '"command":"git branch -d merged-feature"'
assert_file_contains "$scan_report" "\"id\":\"worktree:$clean_worktree\""
assert_file_contains "$scan_report" \
  '"command":"herdr worktree remove --workspace clean-ws"'
assert_not_contains "$(<"$scan_report")" 'doc:docs/live.md' \
  'live doc was nominated'
assert_not_contains "$(<"$scan_report")" 'branch:refs/heads/unmerged-feature' \
  'unmerged branch was nominated'
assert_not_contains "$(<"$scan_report")" 'branch:refs/heads/clean-wt' \
  'checked-out branch was nominated as a branch'
assert_not_contains "$(<"$scan_report")" "worktree:$dirty_worktree" \
  'dirty worktree was nominated'
assert_not_contains "$(<"$scan_report")" "worktree:$unmerged_worktree" \
  'unmerged worktree was nominated'
assert_not_contains "$(<"$scan_report")" 'branch:refs/heads/main' 'main was nominated'
assert_not_contains "$(<"$scan_report")" "worktree:$repo" \
  'primary checkout was nominated'
assert_file_contains "$scan_report" '## Fetch boundary'
assert_file_contains "$scan_report" \
  '`git fetch --no-tags origin main` refreshes `FETCH_HEAD`'

# Every retirement census rail is rechecked at apply. A live agent, an extra
# pane, or operator focus refuses only the worktree and prints the observed
# state; the other nominations remain independently inspectable.
rich_ids=(doc:docs/stale.md doc:docs/mixed.md \
  branch:refs/heads/merged-feature "worktree:$clean_worktree")
for scan_rail in live pane focus; do
  export FAKE_HERDR_RAIL="$scan_rail"
  rail_scan_json="$tmp/$scan_rail-scan.json"
  run_reap 2 "$rail_scan_json" scan --repo "$repo"
  jq -e --arg id "worktree:$clean_worktree" '
    .status == "refused"
    and .state.nomination_counts == {docs:2,branches:1,worktrees:0,total:3}
    and any(.state.worktree_refusals[];
      .id == $id and (.observed_state | type == "object"))
  ' "$rail_scan_json" >/dev/null
  assert_not_contains "$(<"$(jq -r '.state.report_path' "$rail_scan_json")")" \
    '"kind":"worktree"' "$scan_rail rail was nominated during scan"
done

export FAKE_HERDR_RAIL=live
live_rail_json="$tmp/live-rail.json"
run_reap 2 "$live_rail_json" inspect apply "${rich_ids[@]}" --repo "$repo"
jq -e --arg id "worktree:$clean_worktree" '
  .status == "refused"
  and .state.applied_count == 0
  and .state.skipped_count == 4
  and any(.state.skipped[];
    .id == $id
    and .observed_state.agent_status == "working"
    and .observed_state.live_agent_count == 1)
' "$live_rail_json" >/dev/null

export FAKE_HERDR_RAIL=pane
pane_rail_json="$tmp/pane-rail.json"
run_reap 2 "$pane_rail_json" inspect apply "${rich_ids[@]}" --repo "$repo"
jq -e --arg id "worktree:$clean_worktree" '
  .status == "refused"
  and any(.state.skipped[];
    .id == $id
    and .observed_state.pane_count == 2
    and .observed_state.tab_count == 1)
' "$pane_rail_json" >/dev/null

export FAKE_HERDR_RAIL=focus
focus_rail_json="$tmp/focus-rail.json"
run_reap 2 "$focus_rail_json" inspect apply "${rich_ids[@]}" --repo "$repo"
jq -e --arg id "worktree:$clean_worktree" '
  .status == "refused"
  and any(.state.skipped[];
    .id == $id
    and .observed_state.focused_workspace == "clean-ws")
' "$focus_rail_json" >/dev/null
unset FAKE_HERDR_RAIL

# Scan dry-run and both apply inspection spellings retain Repository state.
dry_scan_json="$tmp/dry-scan.json"
run_reap 0 "$dry_scan_json" --repo "$repo" --dry-run
jq -e '.state.dry_run == true and .state.nomination_counts.total == 4' \
  "$dry_scan_json" >/dev/null
inspect_json="$tmp/inspect.json"
run_reap 0 "$inspect_json" inspect apply "${rich_ids[@]}" --repo "$repo"
jq -e '.state.inspect == true and .state.applied_count == 0 and .state.skipped_count == 4' \
  "$inspect_json" >/dev/null
dry_apply_json="$tmp/dry-apply.json"
run_reap 0 "$dry_apply_json" apply "${rich_ids[@]}" --repo "$repo" --dry-run
jq -e '.state.dry_run == true and .state.applied_count == 0 and .state.skipped_count == 4' \
  "$dry_apply_json" >/dev/null

# Malformed, unknown, and duplicate requested ids are errors before any
# derivation work and apply nothing.
unknown_json="$tmp/unknown.json"
run_reap 1 "$unknown_json" apply unknown:merged-feature --repo "$repo"
jq -e '.status == "error" and (.message | contains("unknown nomination id"))' \
  "$unknown_json" >/dev/null

path_json="$tmp/path.json"
run_reap 1 "$path_json" apply "$scan_report" --repo "$repo"
jq -e '.status == "error" and (.message | contains("unknown nomination id"))' \
  "$path_json" >/dev/null

duplicate_json="$tmp/duplicate.json"
run_reap 1 "$duplicate_json" apply \
  doc:docs/stale.md doc:docs/stale.md --repo "$repo"
jq -e '.status == "error" and (.message | contains("duplicate nomination id"))' \
  "$duplicate_json" >/dev/null

empty_argv_json="$tmp/empty-argv.json"
run_reap 1 "$empty_argv_json" apply --repo "$repo"
jq -e '.status == "error" and (.message | startswith("usage:"))' \
  "$empty_argv_json" >/dev/null

assert_equal "$status_before" \
  "$(git -C "$repo" status --porcelain --untracked-files=all)" \
  'inspection changed the primary working tree'
assert_equal "$branches_before" \
  "$(git -C "$repo" for-each-ref --format='%(refname)' refs/heads)" \
  'inspection changed local branches'
assert_equal "$worktrees_before" "$(git -C "$repo" worktree list --porcelain)" \
  'inspection changed registered worktrees'

# Omit one id as the operator veto, then apply the remainder by name.
head_before="$(git -C "$repo" rev-parse HEAD)"
store_head_before="$(git -C "$repo/backlog" rev-parse HEAD)"
apply_json="$tmp/apply.json"
run_reap 0 "$apply_json" apply \
  doc:docs/mixed.md branch:refs/heads/merged-feature \
  "worktree:$clean_worktree" --repo "$repo"
jq -e '
  .status == "done"
  and .state.applied_count == 3
  and .state.skipped_count == 0
  and .state.requested_count == 3
  and .state.stale_count == 0
  and .state.unrequested_count == 1
  and (.state.report_path | type == "string" and length > 0)
' "$apply_json" >/dev/null
apply_report="$(jq -r '.state.report_path' "$apply_json")"
[ -f "$apply_report" ] || fail 'apply did not write its dated report'
assert_file_contains "$apply_report" '## Current nominations not requested'
assert_file_contains "$apply_report" 'doc:docs/stale.md'
assert_file_contains "$apply_report" '- not requested: 1'
assert_file_contains "$apply_report" \
  'Review staged store-doc deletions with `git -C '"\"$repo/backlog\""' diff --cached -- docs/`; then commit them in the store. qq-reap never commits.'
[ -f "$repo/backlog/docs/stale.md" ] || fail 'apply deleted the vetoed doc'
[ ! -e "$repo/backlog/docs/mixed.md" ] || fail 'apply left an authorized stale doc'
assert_file_contains <(git -C "$repo/backlog" diff --cached --name-status) \
  $'D\tdocs/mixed.md' 'stale-doc deletion was not staged in the store'
assert_equal "$head_before" "$(git -C "$repo" rev-parse HEAD)" \
  'apply changed the code Repository HEAD'
assert_equal "$store_head_before" "$(git -C "$repo/backlog" rev-parse HEAD)" \
  'apply committed the staged store-doc deletion'
if git -C "$repo" show-ref --verify --quiet refs/heads/merged-feature; then
  fail 'apply left an authorized merged branch'
fi
[ ! -e "$clean_worktree" ] || fail 'apply left an authorized clean worktree'
assert_file_contains "$FAKE_HERDR_LOG" 'worktree remove --workspace clean-ws'

# A once-merged branch that advances after scan is stale at apply time.
init_fixture "$tmp/revalidate"
revalidate_repo="$fixture_repo"
printf 'Live: `live/path.txt`.\n' >"$revalidate_repo/backlog/docs/live.md"
commit_and_push_base "$revalidate_repo"
git -C "$revalidate_repo" switch -qc was-merged
printf 'first\n' >"$revalidate_repo/first.txt"
git -C "$revalidate_repo" add first.txt
git -C "$revalidate_repo" commit -qm first
git -C "$revalidate_repo" switch -q main
git -C "$revalidate_repo" merge -q --no-ff was-merged -m 'merge first'
git -C "$revalidate_repo" push -q origin main
export FAKE_REPO="$revalidate_repo"
export FAKE_CLEAN_WORKTREE=""
export XDG_STATE_HOME="$tmp/revalidate-state"
revalidate_scan_json="$tmp/revalidate-scan.json"
run_reap 0 "$revalidate_scan_json" scan --repo "$revalidate_repo"
jq -e '.state.nomination_counts == {docs:0,branches:1,worktrees:0,total:1}' \
  "$revalidate_scan_json" >/dev/null
git -C "$revalidate_repo" switch -q was-merged
printf 'advanced\n' >"$revalidate_repo/advanced.txt"
git -C "$revalidate_repo" add advanced.txt
git -C "$revalidate_repo" commit -qm advanced
git -C "$revalidate_repo" switch -q main
revalidate_apply_json="$tmp/revalidate-apply.json"
run_reap 0 "$revalidate_apply_json" apply branch:refs/heads/was-merged \
  --repo "$revalidate_repo"
jq -e '
  .state.applied_count == 0
  and .state.skipped_count == 1
  and .state.stale_count == 1
' "$revalidate_apply_json" >/dev/null
git -C "$revalidate_repo" show-ref --verify --quiet refs/heads/was-merged \
  || fail 'revalidation deleted a branch that gained an unmerged commit'
assert_file_contains "$(jq -r '.state.report_path' "$revalidate_apply_json")" \
  '"reason":"no longer a current nomination"'

# FETCH_HEAD, not a stale remote-tracking ref, is the ancestry authority. The
# configured fetch mapping deliberately excludes main while the remote rewrites
# main from an old merged feature to a different fresh feature.
init_fixture "$tmp/fetched-oid"
fetched_repo="$fixture_repo"
printf 'Live: `live/path.txt`.\n' >"$fetched_repo/backlog/docs/live.md"
commit_and_push_base "$fetched_repo"
fetched_base="$(git -C "$fetched_repo" rev-parse HEAD)"
git -C "$fetched_repo" switch -qc stale-feature
printf 'stale remote history\n' >"$fetched_repo/stale-feature.txt"
git -C "$fetched_repo" add stale-feature.txt
git -C "$fetched_repo" commit -qm stale-feature
git -C "$fetched_repo" switch -q main
git -C "$fetched_repo" merge -q --no-ff stale-feature -m 'old remote main'
git -C "$fetched_repo" push -q origin main
stale_remote_oid="$(git -C "$fetched_repo" rev-parse main)"
git -C "$fetched_repo" switch -qc fresh-feature "$fetched_base"
printf 'fresh remote history\n' >"$fetched_repo/fresh-feature.txt"
git -C "$fetched_repo" add fresh-feature.txt
git -C "$fetched_repo" commit -qm fresh-feature
fresh_remote_oid="$(git -C "$fetched_repo" rev-parse fresh-feature)"
git -C "$fetched_repo" push -q origin +fresh-feature:main
git -C "$fetched_repo" switch -q main
git -C "$fetched_repo" update-ref refs/remotes/origin/main "$stale_remote_oid"
git -C "$fetched_repo" config --unset-all remote.origin.fetch
git -C "$fetched_repo" config --add remote.origin.fetch \
  '+refs/heads/not-main:refs/remotes/origin/not-main'
export FAKE_REPO="$fetched_repo"
export FAKE_CLEAN_WORKTREE=""
export XDG_STATE_HOME="$tmp/fetched-oid-state"
fetched_json="$tmp/fetched-oid.json"
run_reap 0 "$fetched_json" scan --repo "$fetched_repo"
jq -e --arg oid "$fresh_remote_oid" '
  .state.fetched_main_oid == $oid
  and .state.nomination_counts == {docs:0,branches:1,worktrees:0,total:1}
' "$fetched_json" >/dev/null
fetched_report="$(jq -r '.state.report_path' "$fetched_json")"
assert_file_contains "$fetched_report" '"id":"branch:refs/heads/fresh-feature"'
assert_not_contains "$(<"$fetched_report")" \
  'branch:refs/heads/stale-feature' 'stale origin/main nominated the wrong branch'
assert_equal "$stale_remote_oid" \
  "$(git -C "$fetched_repo" rev-parse refs/remotes/origin/main)" \
  'explicit main fetch unexpectedly repaired the excluded tracking ref fixture'

# Without Herdr, scan refuses all worktree nominations, and apply skips the
# requested worktree with observed state while still applying docs/branches.
init_fixture "$tmp/no-herdr"
no_herdr_repo="$fixture_repo"
printf 'Dead: `live/missing-no-herdr.txt`.\n' \
  >"$no_herdr_repo/backlog/docs/stale.md"
commit_and_push_base "$no_herdr_repo"
git -C "$no_herdr_repo" switch -qc no-herdr-merged
printf 'merged\n' >"$no_herdr_repo/merged.txt"
git -C "$no_herdr_repo" add merged.txt
git -C "$no_herdr_repo" commit -qm no-herdr-merged
git -C "$no_herdr_repo" switch -q main
git -C "$no_herdr_repo" merge -q --no-ff no-herdr-merged -m 'merge no-herdr'
git -C "$no_herdr_repo" push -q origin main
no_herdr_worktree="$tmp/no-herdr-worktree"
git -C "$no_herdr_repo" worktree add -qb no-herdr-wt \
  "$no_herdr_worktree" main
export FAKE_REPO="$no_herdr_repo"
export FAKE_CLEAN_WORKTREE="$no_herdr_worktree"
export XDG_STATE_HOME="$tmp/no-herdr-state"

export QQ_HERDR_BIN="$tmp/absent-herdr"
no_herdr_scan_json="$tmp/no-herdr-scan.json"
run_reap 2 "$no_herdr_scan_json" scan --repo "$no_herdr_repo"
jq -e '
  .status == "refused"
  and .state.nomination_counts == {docs:1,branches:1,worktrees:0,total:2}
  and (.state.degraded_checks[0] | contains("all worktree nominations"))
' "$no_herdr_scan_json" >/dev/null
no_herdr_scan_report="$(jq -r '.state.report_path' "$no_herdr_scan_json")"
assert_not_contains "$(<"$no_herdr_scan_report")" \
  '"kind":"worktree"' 'Herdr-less scan nominated a worktree'

no_herdr_apply_json="$tmp/no-herdr-apply.json"
run_reap 2 "$no_herdr_apply_json" apply \
  doc:docs/stale.md branch:refs/heads/no-herdr-merged \
  "worktree:$no_herdr_worktree" --repo "$no_herdr_repo"
jq -e --arg id "worktree:$no_herdr_worktree" '
  .status == "refused"
  and .state.applied_count == 2
  and .state.skipped_count == 1
  and any(.state.skipped[];
    .id == $id and .observed_state.herdr_available == false)
' "$no_herdr_apply_json" >/dev/null
[ ! -e "$no_herdr_repo/backlog/docs/stale.md" ] \
  || fail 'Herdr-less apply did not apply the authorized stale doc'
if git -C "$no_herdr_repo" show-ref --verify --quiet \
  refs/heads/no-herdr-merged; then
  fail 'Herdr-less apply did not delete the authorized merged branch'
fi
[ -d "$no_herdr_worktree" ] \
  || fail 'Herdr-less apply removed the refused worktree'
export QQ_HERDR_BIN="$fake_herdr"

# Full refs survive a branch/tag short-name collision, and branch deletion is
# anchored to primary main even when qq-reap is invoked from a linked checkout.
init_fixture "$tmp/full-ref"
full_ref_repo="$fixture_repo"
printf 'Live: `live/path.txt`.\n' >"$full_ref_repo/backlog/docs/live.md"
commit_and_push_base "$full_ref_repo"
full_ref_base="$(git -C "$full_ref_repo" rev-parse HEAD)"
git -C "$full_ref_repo" tag foo "$full_ref_base"
tag_oid="$(git -C "$full_ref_repo" rev-parse refs/tags/foo)"
git -C "$full_ref_repo" switch -qc foo
printf 'foo branch\n' >"$full_ref_repo/foo.txt"
git -C "$full_ref_repo" add foo.txt
git -C "$full_ref_repo" commit -qm foo
git -C "$full_ref_repo" switch -q main
git -C "$full_ref_repo" merge -q --no-ff refs/heads/foo -m 'merge foo'
git -C "$full_ref_repo" push -q origin main
git -C "$full_ref_repo" branch linked-caller "$full_ref_base"
linked_caller="$tmp/full-ref-linked"
git -C "$full_ref_repo" worktree add -q "$linked_caller" linked-caller
printf 'linked-only\n' >"$linked_caller/linked-only.txt"
git -C "$linked_caller" add linked-only.txt
git -C "$linked_caller" commit -qm linked-only
export FAKE_REPO="$full_ref_repo"
export FAKE_CLEAN_WORKTREE=""
export XDG_STATE_HOME="$tmp/full-ref-state"
full_ref_scan_json="$tmp/full-ref-scan.json"
run_reap 0 "$full_ref_scan_json" scan --repo "$linked_caller"
jq -e '.state.nomination_counts == {docs:0,branches:1,worktrees:0,total:1}' \
  "$full_ref_scan_json" >/dev/null
full_ref_report="$(jq -r '.state.report_path' "$full_ref_scan_json")"
assert_file_contains "$full_ref_report" '"id":"branch:refs/heads/foo"'
assert_file_contains "$full_ref_report" '"branch":"refs/heads/foo"'
assert_file_contains "$full_ref_report" '"command":"git branch -d foo"'
git -C "$full_ref_repo" switch -q --detach
missing_main_json="$tmp/missing-main.json"
run_reap 2 "$missing_main_json" inspect apply branch:refs/heads/foo \
  --repo "$linked_caller"
jq -e --arg id 'branch:refs/heads/foo' '
  .status == "refused"
  and .state.main_checkout_count == 0
  and any(.state.skipped[];
    .id == $id and .observed_state.main_checkout_count == 0)
' "$missing_main_json" >/dev/null
git -C "$full_ref_repo" switch -q main
full_ref_apply_json="$tmp/full-ref-apply.json"
run_reap 0 "$full_ref_apply_json" apply branch:refs/heads/foo \
  --repo "$linked_caller"
git -C "$full_ref_repo" show-ref --verify --quiet refs/tags/foo \
  || fail 'branch deletion removed the colliding tag'
assert_equal "$tag_oid" "$(git -C "$full_ref_repo" rev-parse refs/tags/foo)" \
  'branch deletion moved the colliding tag'
if git -C "$full_ref_repo" show-ref --verify --quiet refs/heads/foo; then
  fail 'linked-checkout apply left the authorized merged branch'
fi

# An empty scan is still a heartbeat, including default mode selection.
init_fixture "$tmp/empty"
empty_repo="$fixture_repo"
printf 'Live: `live/path.txt` and `README.md`.\n' \
  >"$empty_repo/backlog/docs/live.md"
commit_and_push_base "$empty_repo"
export FAKE_REPO="$empty_repo"
export FAKE_CLEAN_WORKTREE=""
export XDG_STATE_HOME="$tmp/empty-state"
empty_json="$tmp/empty.json"
run_reap 0 "$empty_json" --repo "$empty_repo"
jq -e '.state.nomination_counts == {docs:0,branches:0,worktrees:0,total:0}' \
  "$empty_json" >/dev/null
empty_report="$(jq -r '.state.report_path' "$empty_json")"
[ -f "$empty_report" ] || fail 'empty scan did not write a dated heartbeat'
assert_file_contains "$empty_report" '- total: 0'
[ -L "$XDG_STATE_HOME/qq-reap/reports/latest" ] \
  || fail 'empty scan did not refresh latest'

# A malformed requested id publishes its heartbeat state and applies nothing.
# A bad verb is a usage error under the shared exit vocabulary.
empty_head_before="$(git -C "$empty_repo" rev-parse HEAD)"
empty_status_before="$(git -C "$empty_repo" status --porcelain --untracked-files=all)"
malformed_json="$tmp/malformed.json"
run_reap 1 "$malformed_json" apply 'not a qq-reap nomination id' \
  --repo "$empty_repo"
jq -e '.status == "error" and (.state.report_path | length > 0)' \
  "$malformed_json" >/dev/null
[ -f "$(jq -r '.state.report_path' "$malformed_json")" ] \
  || fail 'malformed-id error omitted its heartbeat'
assert_equal "$empty_head_before" "$(git -C "$empty_repo" rev-parse HEAD)" \
  'malformed id changed HEAD'
assert_equal "$empty_status_before" \
  "$(git -C "$empty_repo" status --porcelain --untracked-files=all)" \
  'malformed id changed the working tree'

unreadable_json="$tmp/unreadable.json"
run_reap 1 "$unreadable_json" scan --repo "$tmp/not-a-repo"
jq -e '.status == "error" and (.state.report_path | length > 0)' \
  "$unreadable_json" >/dev/null
usage_json="$tmp/usage.json"
run_reap 1 "$usage_json" unsupported
jq -e '.status == "error" and (.message | startswith("usage:"))' \
  "$usage_json" >/dev/null

assert_file_not_matches "$REAP" 'shlex|bashlex' \
  'qq-reap added a forbidden shell parser idiom'
assert_file_not_matches "$REAP" '(^|[[:space:]])git branch -D([[:space:]]|$)|--force' \
  'qq-reap contains a forced deletion path'
assert_file_not_matches "$scan_report" 'git branch -D|--force' \
  'scan report suggested a forced deletion'
assert_file_not_matches "$apply_report" 'git branch -D|--force' \
  'apply report suggested a forced deletion'
assert_file_not_matches "$FAKE_HERDR_LOG" '(^|[[:space:]])--force([[:space:]]|$)' \
  'apply used forced Herdr removal'

printf 'test-qq-reap: pass\n'
