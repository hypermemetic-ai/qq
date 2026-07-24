#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-assemble"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
export TMPDIR="$tmp/tmp"
mkdir -p "$HOME" "$TMPDIR"

repo="$tmp/repo"
worktree_root="$HOME/.herdr/worktrees/repo"
strong_worktree="$worktree_root/strong"
mkdir -p "$worktree_root"
git init -q -b main "$repo"
mkdir -p "$repo/bin" "$repo/extensions" "$repo/skills/fixture" "$repo/delegation/manifests"
printf '# agents\n' >"$repo/AGENTS.md"
printf '# concepts\n' >"$repo/CONCEPTS.md"
printf '# review\n' >"$repo/REVIEW.md"
printf '#!/bin/sh\n' >"$repo/bin/qq-fixture"
printf 'export {};\n' >"$repo/extensions/fixture.ts"
cat >"$repo/skills/fixture/SKILL.md" <<'EOF'
---
name: fixture
description: Fixture skill at merge time.
---
# Fixture
EOF
printf '# fixture manifest\n' >"$repo/delegation/manifests/fixture.md"
git -C "$repo" add .
GIT_AUTHOR_DATE=2020-01-01T00:00:00Z GIT_COMMITTER_DATE=2020-01-01T00:00:00Z \
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -qm base
git -C "$repo" worktree add -qb feature "$strong_worktree" main
printf 'feature\n' >"$strong_worktree/change.txt"
git -C "$strong_worktree" add change.txt
GIT_AUTHOR_DATE=2020-01-02T00:00:00Z GIT_COMMITTER_DATE=2020-01-02T00:00:00Z \
  git -C "$strong_worktree" -c user.name=test -c user.email=test@example.invalid commit -qm feature
GIT_AUTHOR_DATE=2026-07-20T12:00:00Z GIT_COMMITTER_DATE=2026-07-20T12:00:00Z \
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
    merge -q --no-ff -m 'Merge pull request #41 from fixture/feature' feature
merge_41="$(git -C "$repo" rev-parse HEAD)"

git -C "$repo" switch -qc solo
git -C "$repo" switch -q main
printf 'solo\n' >"$repo/solo.txt"
git -C "$repo" add solo.txt
GIT_AUTHOR_DATE=2020-01-03T00:00:00Z GIT_COMMITTER_DATE=2020-01-03T00:00:00Z \
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid commit -qm solo
solo_commit="$(git -C "$repo" rev-parse HEAD)"
# Rebuild this as a PR-shaped merge while retaining a local solo branch.
git -C "$repo" reset -q --hard "$merge_41"
git -C "$repo" branch -f solo "$solo_commit"
GIT_AUTHOR_DATE=2026-07-20T13:00:00Z GIT_COMMITTER_DATE=2026-07-20T13:00:00Z \
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
    merge -q --no-ff -m 'Merge pull request #42 from fixture/solo' solo
merge_42="$(git -C "$repo" rev-parse HEAD)"
git -C "$repo" switch -qc outside-main
GIT_AUTHOR_DATE=2020-01-04T00:00:00Z GIT_COMMITTER_DATE=2020-01-04T00:00:00Z \
  git -C "$repo" -c user.name=test -c user.email=test@example.invalid \
    commit --allow-empty -qm 'outside main'
outside_main="$(git -C "$repo" rev-parse HEAD)"
git -C "$repo" switch -q main

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${GH_MUST_NOT_RUN:-}" ]; then
  : >"$GH_MUST_NOT_RUN"
  exit 99
fi
[ "$1 $2" = "pr view" ]
pr="$3"
case "$pr" in
  41) oid="$MERGE_41"; branch=feature ;;
  42) oid="$MERGE_42"; branch=solo ;;
  43) oid="$OUTSIDE_MAIN"; branch=outside-main ;;
  *) printf '{"state":"OPEN"}\n'; exit 0 ;;
esac
jq -cn --arg oid "$oid" --arg branch "$branch" '{
  state:"MERGED",headRefName:$branch,mergeCommit:{oid:$oid},mergedAt:"2026-07-20T12:00:00Z"
}'
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh"
export MERGE_41="$merge_41" MERGE_42="$merge_42" OUTSIDE_MAIN="$outside_main"

runtime="$TMPDIR/pi-subagents-uid-$(id -u)"
export QQ_DISPATCH_RUNTIME_ROOT="$runtime"
mkdir -p "$runtime/async-subagent-runs" "$runtime/runs"
parent_strong="$tmp/2026-07-20T00-00-00_parent-strong.jsonl"
parent_weak="$tmp/2026-07-20T00-00-00_parent-weak.jsonl"
parent_weak_missing="$tmp/2026-07-20T00-00-00_parent-weak-missing.jsonl"
cat >"$parent_strong" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z","branch":"feature"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"work feature"}}
JSONL
cat >"$parent_weak" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"retired feature and solo worktrees"}}
JSONL
cat >"$parent_weak_missing" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"retired feature worktree with missing delegate transcript"}}
JSONL
make_run() {
  local run_id="$1" cwd="$2" parent="$3" session_hash="$4" transcript_text="${5:-delegate $1}"
  local session_dir="$TMPDIR/pi-subagent-sessions/$session_hash"
  local session_file="$session_dir/run-0/session.jsonl"
  mkdir -p "$runtime/async-subagent-runs/$run_id" "$runtime/runs/$run_id" \
    "$(dirname "$session_file")"
  jq -cn --arg cwd "$cwd" --arg parent "$parent" \
    --arg session_file "$session_file" --arg session_dir "$session_dir" '{
    sessionId:$parent,sessionFile:$session_file,sessionDir:$session_dir,cwd:$cwd,
    startedAt:"2026-07-20T10:00:00Z",lastActivityAt:1784541600000,
    mode:"async",isNested:false,state:"complete"
  }' >"$runtime/async-subagent-runs/$run_id/status.json"
  jq -cn --arg text "$transcript_text" '
    {type:"session",version:3,timestamp:"2026-07-20T10:00:00Z"},
    {type:"message",timestamp:"2026-07-20T10:00:02Z",message:{role:"assistant",content:[{type:"text",text:$text}],usage:{input:2,output:3}}}
  ' >"$session_file"
}
make_run strong-run "$strong_worktree" "$parent_strong" strong-hash
make_run weak-run "$worktree_root/retired-a" "$parent_weak" weak-hash 'delegate feature work'
make_run weak-other-run "$worktree_root/retired-b" "$parent_weak" weak-other-hash 'delegate solo work'
make_run missing-run "$strong_worktree" "$parent_strong" missing-hash
missing_session_file="$TMPDIR/pi-subagent-sessions/missing-hash/run-0/session.jsonl"
rm "$missing_session_file"
make_run weak-missing-run "$worktree_root/retired-missing" "$parent_weak_missing" \
  weak-missing-hash 'delegate feature work'
weak_missing_session_file="$TMPDIR/pi-subagent-sessions/weak-missing-hash/run-0/session.jsonl"
rm "$weak_missing_session_file"
mkdir -p "$TMPDIR/pi-subagent-sessions/strong-hash/async-strong-run"
cat >"$TMPDIR/pi-subagent-sessions/strong-hash/async-strong-run/session.jsonl" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:30:00Z"}
{"type":"message","timestamp":"2026-07-20T10:30:01Z","message":{"role":"assistant","content":[{"type":"text","text":"continued strong-run"}],"usage":{"input":1,"output":2}}}
JSONL
printf '{"schema":"span"}\n' >"$runtime/runs/strong-run/spans.jsonl"
mkdir -p "$runtime/async-subagent-runs/malformed-run"
printf '{not json\n' >"$runtime/async-subagent-runs/malformed-run/status.json"

set +e
"$OBSERVE" assemble --pr 43 --repo "$repo" \
  >"$tmp/outside-main.stdout" 2>"$tmp/outside-main.stderr"
status=$?
set -e
assert_equal 65 "$status" 'assemble accepted a merge commit outside local main'
assert_file_contains "$tmp/outside-main.stderr" 'not an ancestor of local main'
[ ! -e "$XDG_STATE_HOME/qq/observer/runs/pr-43" ] \
  || fail 'outside-main refusal left a run directory'

"$OBSERVE" assemble --pr 41 --repo "$repo" >"$tmp/assembled-41.json"
run_41="$XDG_STATE_HOME/qq/observer/runs/pr-41"
jq -e --arg repo "$(realpath "$repo")" --arg missing "$missing_session_file" \
  --arg weak_other "$TMPDIR/pi-subagent-sessions/weak-other-hash/run-0/session.jsonl" \
  --arg weak_missing "$weak_missing_session_file" '
  .schema == "qq-observer.package" and .schema_version == 1
  and .pr == 41 and .branch == "feature" and .repo == $repo
  and .variant == "guided"
  and ([.sessions[] | select(.role == "delegate" and .evidence == "live-worktree-branch")] | length) == 2
  and ([.sessions[] | select(
    .role == "delegate" and .evidence == "retired-worktree-content" and .run_id == "weak-run"
  )] | length) == 1
  and ([.sessions[] | select(.run_id == "weak-other-run" or .run_id == "weak-missing-run")] | length) == 0
  and ([.sessions[] | select(.role == "accountable" and .evidence == "parent-of-delegate")] | length) == 2
  and ([.sessions[] | select(.label == "accountable-parent-weak-missing")] | length) == 0
  and ([.unknown_entries[] | select(.path == $missing and (.reason | length > 0))] | length) == 1
  and ([.unknown_entries[] | select(.path == $weak_other and (.reason | contains("does not mention")))] | length) == 1
  and ([.unknown_entries[] | select(.path == $weak_missing and (.reason | contains("missing")))] | length) == 1
  and ([.unknown_entries[] | select(.path | endswith("spans.jsonl"))] | length) == 1
  and ([.unknown_entries[] | select(.path | endswith("malformed-run/status.json"))] | length) == 1
' "$run_41/package.json" >/dev/null || fail 'external delegate sessions were not assembled defensively'
[ -f "$run_41/inventory.json" ] || fail 'inventory was not written'
[ -f "$run_41/corpus/skills/fixture/SKILL.md" ] || fail 'merge-time corpus was not snapshotted'
jq -e '.skills == [{name:"fixture",description:"Fixture skill at merge time."}]' \
  "$run_41/inventory.json" >/dev/null || fail 'skill inventory did not preserve the merge-time description'
assert_equal 5 "$(find "$run_41/sessions" -type f | wc -l)" 'session transcript count is wrong'
assert_equal 5 "$(find "$run_41/facts" -type f | wc -l)" 'facts count is wrong'
assert_equal 5 "$(find "$run_41/signals" -type f | wc -l)" 'signals count is wrong'
jq -e '[.sessions[] | has("signals")] | all' "$run_41/package.json" >/dev/null \
  || fail 'guided package omitted a session signals pointer'

# Blind calibration packages derive only from the frozen guided package. They do
# not repeat gh/runtime/session discovery after the accountable transcript advances.
export GH_MUST_NOT_RUN="$tmp/blind-touched-gh"
"$OBSERVE" assemble --pr 41 --repo "$repo" --variant blind \
  >"$tmp/assembled-41-blind.json"
unset GH_MUST_NOT_RUN
[ ! -e "$tmp/blind-touched-gh" ] || fail 'blind assembly touched gh instead of deriving from guided'
blind_run_41="$XDG_STATE_HOME/qq/observer/runs/pr-41-blind"
jq -e '
  .schema == "qq-observer.package" and .schema_version == 1
  and .variant == "blind" and .derived_from == "pr-41"
  and ([.sessions[] | has("signals")] | all | not)
' "$blind_run_41/package.json" >/dev/null \
  || fail 'blind package manifest did not derive from guided without signal pointers'
jq -S 'del(.variant,.derived_from) | .sessions |= map(del(.facts,.signals))' \
  "$blind_run_41/package.json" >"$tmp/blind-comparable.json"
jq -S 'del(.variant) | .sessions |= map(del(.facts,.signals))' \
  "$run_41/package.json" >"$tmp/guided-comparable.json"
cmp "$tmp/guided-comparable.json" "$tmp/blind-comparable.json" \
  || fail 'blind package identity or session inputs differ from guided'
assert_equal 5 "$(find "$blind_run_41/sessions" -type f | wc -l)" \
  'blind session transcript count is wrong'
assert_equal 5 "$(find "$blind_run_41/facts" -type f | wc -l)" \
  'blind facts count is wrong'
[ ! -e "$blind_run_41/signals" ] || fail 'blind package wrote a signals directory'
[ "$blind_run_41" != "$run_41" ] || fail 'guided and blind variants shared a run directory'
"$OBSERVE" assemble --pr 41 --repo "$repo" --variant blind \
  >"$tmp/reassembled-41-blind.json"
jq -e '.status == "already assembled"' "$tmp/reassembled-41-blind.json" >/dev/null \
  || fail 'blind reassembly was not idempotent'

export GH_MUST_NOT_RUN="$tmp/absent-guided-touched-gh"
set +e
"$OBSERVE" assemble --pr 99 --repo "$repo" --variant blind \
  >"$tmp/absent-guided.stdout" 2>"$tmp/absent-guided.stderr"
status=$?
set -e
unset GH_MUST_NOT_RUN
assert_equal 65 "$status" 'blind assembly without guided package was accepted'
[ ! -e "$tmp/absent-guided-touched-gh" ] \
  || fail 'blind assembly consulted gh when guided package was absent'
assert_file_contains "$tmp/absent-guided.stderr" 'guided package is required'
[ ! -e "$XDG_STATE_HOME/qq/observer/runs/pr-99-blind" ] \
  || fail 'absent guided package left a blind run directory'

"$OBSERVE" assemble --pr 41 --repo "$repo" >"$tmp/reassembled-41.json"
jq -e '.status == "already assembled"' "$tmp/reassembled-41.json" >/dev/null \
  || fail 'reassembly was not idempotent'

# No selected delegates: discover the accountable session from the Repository-home Pi directory.
runtime_solo="$tmp/solo-runtime"
mkdir -p "$runtime_solo/async-subagent-runs"
export QQ_DISPATCH_RUNTIME_ROOT="$runtime_solo"
encoded="-$(realpath "$repo" | tr / -)--"
repo_sessions="$HOME/.pi/agent/sessions/$encoded"
mkdir -p "$repo_sessions"
solo_session="$repo_sessions/2026-07-20T00-00-00_solo-parent.jsonl"
cat >"$solo_session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T11:00:00Z"}
{"type":"message","timestamp":"2026-07-20T11:00:01Z","message":{"role":"user","content":"please implement solo"}}
JSONL
printf '{"schema":"not-a-session"}\n' >"$repo_sessions/not-session.jsonl"
"$OBSERVE" assemble --pr 42 --repo "$repo" >"$tmp/assembled-42.json"
run_42="$XDG_STATE_HOME/qq/observer/runs/pr-42"
jq -e '
  ([.sessions[] | select(.role == "accountable" and .evidence == "content-search")] | length) == 1
  and ([.unknown_entries[] | select(.path | endswith("not-session.jsonl"))] | length) == 1
  and (.warnings | length) >= 1
' "$run_42/package.json" >/dev/null || fail 'accountable-only content search did not preserve evidence'

# Run-scoped commands may act only beneath the observer runs store.
outside_finalize="$tmp/outside-finalize"
mkdir "$outside_finalize"
set +e
"$OBSERVE" finalize --run "$outside_finalize" --failed 'outside store' \
  >"$tmp/outside-finalize.stdout" 2>"$tmp/outside-finalize.stderr"
status=$?
set -e
assert_equal 65 "$status" 'finalize accepted a run outside the observer store'
assert_file_contains "$tmp/outside-finalize.stderr" 'outside observer runs root'
[ ! -e "$outside_finalize/analysis_failed.json" ] \
  || fail 'outside finalize wrote analysis_failed.json'

# A finalized successful analysis must pass the full package validator before
# rendering. Its run session set and episode costs come from the assembled package.
session_path="$run_41/sessions/delegate-strong-run-primary.jsonl"
facts_path="$run_41/facts/delegate-strong-run-primary.json"
run_sessions="$(find "$run_41/sessions" -type f -print | sort | jq -Rsc 'split("\n")[:-1]')"
turns="$(jq '[.turns_by_role[]] | add' "$facts_path")"
tokens="$(jq '(.token_usage.input // 0) + (.token_usage.output // 0)' "$facts_path")"
duration="$(jq '.wall_clock.duration_ms' "$facts_path")"
analysis="$tmp/analysis.json"
jq -n --arg session "$session_path" --argjson sessions "$run_sessions" \
  --argjson turns "$turns" --argjson tokens "$tokens" --argjson duration "$duration" '{
  schema:"qq-observer.analysis",schema_version:1,
  run:{change:"PR-41",sessions:$sessions},
  episodes:[{
    kind:"friction",title:"Fixture episode",sessions:[$session],
    evidence:[{session:$session,entries:[2],quote:"delegate strong-run"}],
    what_happened:"Fixture behavior happened.",root_cause:"Fixture root cause.",
    root_cause_location:"instruction",
    cost:{turns:$turns,tokens:$tokens,duration_ms:$duration,source:("facts:"+$session)},
    remedy:{type:"process",smallest_change:"Use the fixture remedy."},
    confidence:"high",confidence_why:"Direct fixture evidence.",recurrence_key:"fixture-key"
  }],
  dropped_signals:[{kind:"compaction",entries:[2],why:"Not relevant."}],
  limitations:"Fixture limitation."
}' >"$analysis"

jq '.episodes[0].cost.turns += 1' "$analysis" >"$tmp/invalid-analysis.json"
set +e
"$OBSERVE" finalize --run "$run_41" --analysis "$tmp/invalid-analysis.json" \
  --analyst-trace "$parent_strong" >"$tmp/invalid-finalize.stdout" \
  2>"$tmp/invalid-finalize.stderr"
status=$?
set -e
assert_equal 65 "$status" 'finalize accepted an analysis with facts-ungrounded cost'
assert_file_contains "$tmp/invalid-finalize.stderr" '--failed'
for absent in analysis.json analysis.md analyst-trace.jsonl; do
  [ ! -e "$run_41/$absent" ] || fail "invalid finalize wrote $absent"
done

set +e
"$OBSERVE" finalize --run "$run_41" --analysis "$analysis" \
  >"$tmp/missing-trace.stdout" 2>"$tmp/missing-trace.stderr"
status=$?
set -e
assert_equal 64 "$status" 'finalize accepted successful analysis without analyst trace'
assert_file_contains "$tmp/missing-trace.stderr" '--analyst-trace is required'
[ ! -e "$run_41/analysis.json" ] || fail 'missing-trace refusal wrote analysis.json'

"$OBSERVE" finalize --run "$run_41" --analysis "$analysis" \
  --analyst-trace "$parent_strong" >"$tmp/finalized-41.json"
"$OBSERVE" render-doc --run "$run_41" >"$tmp/rendered-41.json"
jq -e '.status == "rendered"' "$tmp/rendered-41.json" >/dev/null \
  || fail 'render-doc did not accept a run inside the observer store'
outside_render="$tmp/outside-render"
cp -a "$run_41" "$outside_render"
set +e
"$OBSERVE" render-doc --run "$outside_render" \
  >"$tmp/outside-render.stdout" 2>"$tmp/outside-render.stderr"
status=$?
set -e
assert_equal 65 "$status" 'render-doc accepted a run outside the observer store'
assert_file_contains "$tmp/outside-render.stderr" 'outside observer runs root'
assert_file_contains "$run_41/analysis.md" '## Session facts'
assert_file_contains "$run_41/analysis.md" '### 1. Fixture episode'
assert_file_contains "$run_41/analysis.md" '## Dropped signals'
assert_file_contains "$run_41/analysis.md" 'Fixture limitation.'
"$OBSERVE" finalize --run "$run_41" --analysis "$analysis" \
  --analyst-trace "$parent_strong" >"$tmp/finalized-identical.json"
jq -e '.written == []' "$tmp/finalized-identical.json" >/dev/null \
  || fail 'identical finalize was not a no-op'
jq '.episodes[0].title = "Differing episode"' "$analysis" >"$tmp/differing-analysis.json"
set +e
"$OBSERVE" finalize --run "$run_41" --analysis "$tmp/differing-analysis.json" \
  --analyst-trace "$parent_strong" \
  >"$tmp/differing.stdout" 2>"$tmp/differing.stderr"
status=$?
set -e
assert_equal 65 "$status" 'differing finalized analysis did not hit append-only refusal'
assert_file_contains "$tmp/differing.stderr" 'append-only conflict'

# Delivery is incomplete until every local landed Change has a terminal marker.
set +e
"$OBSERVE" verify-delivery --repo "$repo" --since 2026-07-01T00:00:00Z \
  >"$tmp/gap.json"
status=$?
set -e
assert_equal 1 "$status" 'verify-delivery did not report the uncovered PR'
jq -e '.ok == false and .uncovered == [42]' "$tmp/gap.json" >/dev/null \
  || fail 'gap report did not identify PR 42'

"$OBSERVE" finalize --run "$run_42" --failed 'observer fixture failed' \
  --analyst-trace "$solo_session" >"$tmp/failed-42.json"
cmp "$solo_session" "$run_42/analyst-trace.jsonl" \
  || fail 'analyst trace was not copied byte-for-byte'
jq -e '
  .schema == "qq-observer.analysis" and .schema_version == 1
  and .status == "analysis_failed" and .reason == "observer fixture failed"
' "$run_42/analysis_failed.json" >/dev/null || fail 'analysis_failed marker has the wrong shape'
"$OBSERVE" verify-delivery --repo "$repo" --since 2026-07-01T00:00:00Z \
  >"$tmp/covered.json"
jq -e '.ok == true and .uncovered == [] and .covered == [41,42]' \
  "$tmp/covered.json" >/dev/null || fail 'covered delivery window did not pass'

printf 'test-qq-observe-assemble: pass\n'
