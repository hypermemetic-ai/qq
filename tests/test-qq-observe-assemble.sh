#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016,SC2034
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
git -C "$repo" remote add origin git@github.com:fixture/repo.git
git -C "$repo" config branch.main.remote origin
repository=fixture/repo
qualified_runs="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/repo"
mkdir -p "$repo/bin" "$repo/extensions" "$repo/skills/fixture" \
  "$repo/delegation/manifests/agents"
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

Dispatch with `timeoutMs:1800000`.
EOF
printf '# fixture manifest\n' >"$repo/delegation/manifests/fixture.md"
cat >"$repo/delegation/manifests/agents/implementer.md" <<'EOF'
---
name: implementer
timeoutMs: 2700000
---
# Canonical implementer policy at merge time
EOF
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
printf '%s\n' '---' 'name: fixture' 'description: Later fixture skill.' '---' \
  '# Later fixture' 'Dispatch with `timeoutMs:600000`.' >"$repo/skills/fixture/SKILL.md"
printf '%s\n' '---' 'name: implementer' 'timeoutMs: 600000' '---' \
  '# Later canonical implementer policy' >"$repo/delegation/manifests/agents/implementer.md"
git -C "$repo" add solo.txt skills/fixture/SKILL.md \
  delegation/manifests/agents/implementer.md
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
printf '%s\n' "$*" >>"$GH_LOG"
if [ "$1 $2" = "repo view" ]; then
  [ "$4 $5" = "--json nameWithOwner" ]
  case "$3" in
    git@github.com:fixture/repo.git) repository=fixture/repo ;;
    git@github.com:fixture/other.git) repository=fixture/other ;;
    *) exit 98 ;;
  esac
  printf '{"nameWithOwner":"%s"}\n' "$repository"
  exit 0
fi
if [ -n "${GH_MUST_NOT_RUN:-}" ]; then
  : >"$GH_MUST_NOT_RUN"
  exit 99
fi
[ "$1 $2" = "pr view" ]
pr="$3"
[ "$4" = "--repo" ]
case "$5" in fixture/repo|fixture/other) ;; *) exit 97 ;; esac
[ "$6" = "--json" ]
[ "$7" = "headRefName,mergeCommit,mergedAt,state" ]
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
export GH_LOG="$tmp/gh.log"
: >"$GH_LOG"
export MERGE_41="$merge_41" MERGE_42="$merge_42" OUTSIDE_MAIN="$outside_main"

runtime="$XDG_STATE_HOME/qq/delegate"
# No QQ_DISPATCH_RUNTIME_ROOT override anywhere in this suite except the
# solo case below: $runtime IS the engine default when XDG_STATE_HOME is
# set, so every assembly pins the default derivation qq-delegate owns.
# The delegate evidence root is durable qq state: it must never sit beneath
# the volatile TMPDIR that reboots clear.
case "$runtime" in
  "$TMPDIR"/*) fail 'delegate runtime root is volatile' ;;
esac
mkdir -p "$runtime/async-subagent-runs" "$runtime/runs" \
  "$runtime/nested-subagent-events" "$runtime/async-subagent-results" \
  "$runtime/owner-review"
printf '{"legacy":"scratch"}\n' >"$runtime/wrapper-events.jsonl"
parent_uuid='019f9324-8966-7ba8-abe4-07cba639cfaf'
parent_strong_dir="$HOME/.pi/agent/sessions/--fixture-accountable--"
parent_strong="$parent_strong_dir/2026-07-20T00-00-00_${parent_uuid}.jsonl"
parent_weak="$tmp/2026-07-20T00-00-00_parent-weak.jsonl"
parent_weak_missing="$tmp/2026-07-20T00-00-00_parent-weak-missing.jsonl"
collision_parent_a="$tmp/collision-a/parent-session.jsonl"
collision_parent_b="$tmp/collision-b/parent-session.jsonl"
mkdir -p "$parent_strong_dir" "$(dirname "$collision_parent_a")" \
  "$(dirname "$collision_parent_b")"
cat >"$parent_strong" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-19T09:00:00Z","branch":"feature"}
{"type":"message","timestamp":"2026-07-19T09:00:01Z","message":{"role":"user","content":"capture PR 39 — an earlier Change"}}
{"type":"message","timestamp":"2026-07-19T09:05:00Z","message":{"role":"assistant","content":[{"type":"text","text":"earlier change work"}]}}
{"type":"message","timestamp":"2026-07-20T09:59:58Z","message":{"role":"user","content":"originating brief for PR 41"}}
{"type":"message","timestamp":"2026-07-20T09:59:59Z","message":{"role":"assistant","content":[{"type":"text","text":"dispatching strong-run"}]}}
{"type":"message","timestamp":"2026-07-20T10:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"strong-run dispatched"}]}}
{"type":"message","timestamp":"2026-07-20T10:02:00Z","message":{"role":"assistant","content":[{"type":"text","text":"post-dispatch accountable work"}]}}
JSONL
cat >"$parent_weak" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"retired feature and solo worktrees"}}
JSONL
cat >"$parent_weak_missing" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"retired feature worktree with missing delegate transcript"}}
JSONL
for collision_parent in "$collision_parent_a" "$collision_parent_b"; do
  cat >"$collision_parent" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z","branch":"feature"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"user","content":"distinct accountable session with a shared basename"}}
JSONL
done
stale_uuid='5a1e7c20-0000-4000-8000-000000000042'
stale_parent_dir="$HOME/.pi/agent/sessions/--fixture-stale--"
stale_parent="$stale_parent_dir/2026-07-19T00-00-00_${stale_uuid}.jsonl"
mkdir -p "$stale_parent_dir"
# Every entry predates the Change's first dispatch: the accountable member
# cannot be Change-bounded, so it is copied whole with a warning.
cat >"$stale_parent" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-19T09:00:00Z"}
{"type":"message","timestamp":"2026-07-19T09:00:01Z","message":{"role":"user","content":"stale session with no dispatch-era entries"}}
JSONL
make_run() {
  local run_id="$1" cwd="$2" parent="$3" session_hash="$4" transcript_text="${5:-delegate $1}"
  local run_dir="$runtime/$run_id"
  local session_dir="${6:-$run_dir/sessions}"
  local session_file="$session_dir/run-0/session.jsonl"
  mkdir -p "$run_dir" "$(dirname "$session_file")"
  jq -cn --arg run_id "$run_id" --arg cwd "$cwd" --arg parent "$parent" \
    --arg run_dir "$run_dir" --arg session_dir "$session_dir" '{
    schema:"qq-run-terminal",version:2,run_id:$run_id,agent:"reviewer",
    cwd:$cwd,exit_code:0,started_at:"2026-07-20T10:00:00Z",
    ended_at:"2026-07-20T10:01:00Z",timed_out:false,
    run_dir:$run_dir,sessions_dir:$session_dir,parent_session:$parent
  }' >"$run_dir/TERMINAL"
  jq -cn --arg text "$transcript_text" '
    {type:"session",version:3,timestamp:"2026-07-20T10:00:00Z"},
    {type:"message",timestamp:"2026-07-20T10:00:02Z",message:{role:"assistant",content:[{type:"text",text:$text}],usage:{input:2,output:3}}}
  ' >"$session_file"
}
strong_session_dir="$runtime/strong-run/sessions"
make_run strong-run "$strong_worktree" "$parent_uuid" strong-hash \
  'delegate strong-run was killed at exactly 1800000ms' "$strong_session_dir" single
make_run collision-a-run "$strong_worktree" "$collision_parent_a" collision-a-hash \
  'delegate collision-a-run'
make_run collision-b-run "$strong_worktree" "$collision_parent_b" collision-b-hash \
  'delegate collision-b-run'
collision_parent_b_label="accountable-parent-session-$(
  printf '%s' "$(realpath "$collision_parent_b")" | sha256sum | cut -c1-12
)"
make_run weak-run "$worktree_root/retired-a" "$parent_weak" weak-hash 'delegate feature work'
make_run weak-other-run "$worktree_root/retired-b" "$parent_weak" weak-other-hash 'delegate solo work'
make_run missing-run "$strong_worktree" "$parent_strong" missing-hash
missing_session_file="$runtime/missing-run/sessions/run-0/session.jsonl"
rm "$missing_session_file"
make_run weak-missing-run "$worktree_root/retired-missing" "$parent_weak_missing" \
  weak-missing-hash 'delegate feature work'
weak_missing_session_file="$runtime/weak-missing-run/sessions/run-0/session.jsonl"
rm "$weak_missing_session_file"
make_run stale-run "$strong_worktree" "$stale_uuid" stale-hash
nested_quoted_session="$strong_session_dir/session.jsonl"
cat >"$nested_quoted_session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:30:00Z"}
{"type":"message","timestamp":"2026-07-20T10:30:01Z","message":{"role":"assistant","content":[{"type":"text","text":"quoted notes about the solo package"}],"usage":{"input":1,"output":2}}}
JSONL
# Matching symlinks are not accountable-session candidates.
mkdir -p "$HOME/.pi/agent/sessions/--fixture-symlink--"
ln -s "$parent_strong" \
  "$HOME/.pi/agent/sessions/--fixture-symlink--/other_${parent_uuid}.jsonl"

weak_invalid_uuid='319f9324-8966-7ba8-abe4-07cba639cfaf'
weak_invalid_parent="$HOME/.pi/agent/sessions/--fixture-weak-invalid--/bad_${weak_invalid_uuid}.jsonl"
mkdir -p "$(dirname "$weak_invalid_parent")"
printf '{"schema":"not-pi","content":"retired feature worktree"}\n' >"$weak_invalid_parent"
make_run weak-invalid-run "$worktree_root/retired-invalid" "$weak_invalid_uuid" \
  weak-invalid-hash 'delegate feature work'

weak_absolute_invalid="$tmp/weak-absolute-invalid.jsonl"
printf '{"schema":"not-pi","content":"retired feature worktree"}\n' \
  >"$weak_absolute_invalid"
make_run weak-absolute-invalid-run "$worktree_root/retired-absolute-invalid" \
  "$weak_absolute_invalid" weak-absolute-invalid-hash 'delegate feature work'
weak_absolute_symlink="$tmp/weak-absolute-symlink.jsonl"
ln -s "$parent_weak" "$weak_absolute_symlink"
make_run weak-absolute-symlink-run "$worktree_root/retired-absolute-symlink" \
  "$weak_absolute_symlink" weak-absolute-symlink-hash 'delegate feature work'

make_run weak-invalid-delegate-run "$worktree_root/retired-invalid-delegate" \
  "$parent_uuid" weak-invalid-delegate-hash 'delegate feature work'
weak_invalid_delegate="$runtime/weak-invalid-delegate-run/sessions/run-0/session.jsonl"
printf '{"schema":"not-pi","content":"delegate feature work"}\n' \
  >"$weak_invalid_delegate"
mkdir -p "$runtime/weak-invalid-delegate-run/sessions/extra"
cat >"$runtime/weak-invalid-delegate-run/sessions/extra/session.jsonl" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-20T10:00:00Z"}
{"type":"message","timestamp":"2026-07-20T10:00:01Z","message":{"role":"assistant","content":"unrelated sibling"}}
JSONL

ambiguous_uuid='119f9324-8966-7ba8-abe4-07cba639cfaf'
for directory in ambiguous-a ambiguous-b; do
  mkdir -p "$HOME/.pi/agent/sessions/$directory"
  cp "$parent_strong" \
    "$HOME/.pi/agent/sessions/$directory/fixture_${ambiguous_uuid}.jsonl"
done
make_run ambiguous-run "$strong_worktree" "$ambiguous_uuid" ambiguous-hash
make_run parent-zero-run "$strong_worktree" \
  '00000000-0000-0000-0000-000000000000' parent-zero-hash
make_run branch-mismatch-run "$repo" "$parent_uuid" branch-mismatch-hash

printf '{"schema":"span"}\n' >"$runtime/runs/spans.jsonl"
mkdir -p "$runtime/malformed-run"
printf '{not json\n' >"$runtime/malformed-run/TERMINAL"
make_run invalid-relative-run "$repo" 'relative/session.jsonl' invalid-relative-hash
ln -s "$runtime/strong-run" "$runtime/linked-run"
strong_session_file="$strong_session_dir/run-0/session.jsonl"
touch "$strong_session_file"
jq -e --arg uuid "$parent_uuid" --arg run "$runtime/strong-run" \
  --arg session_dir "$strong_session_dir" '
  .schema == "qq-run-terminal" and .version == 2 and .run_id == "strong-run"
  and .parent_session == $uuid and .run_dir == $run and .sessions_dir == $session_dir
' "$runtime/strong-run/TERMINAL" >/dev/null \
  || fail 'qq run TERMINAL fixture has the wrong shape'

set +e
"$OBSERVE" assemble --pr 43 --repo "$repo" \
  >"$tmp/outside-main.stdout" 2>"$tmp/outside-main.stderr"
status=$?
set -e
assert_equal 65 "$status" 'assemble accepted a merge commit outside local main'
assert_file_contains "$tmp/outside-main.stderr" 'not an ancestor of local main'
[ ! -e "$qualified_runs/pr-43" ] \
  || fail 'outside-main refusal left a run directory'

# A /tmp wipe (reboot semantics: contents gone, directory kept) must lose no
# delegate evidence: every run dir lives beneath the durable state root.
find "$TMPDIR" -mindepth 1 -delete

"$OBSERVE" assemble --pr 41 --repo "$repo" >"$tmp/assembled-41.json"
run_41="$qualified_runs/pr-41"
jq -e --arg repo "$(realpath "$repo")" \
  --arg missing_terminal "$runtime/missing-run/TERMINAL" \
  --arg malformed_terminal "$runtime/malformed-run/TERMINAL" \
  --arg parent_strong "$parent_strong" --arg collision_parent_a "$collision_parent_a" \
  --arg collision_parent_b "$collision_parent_b" \
  --arg collision_parent_b_label "$collision_parent_b_label" \
  --arg accountable_strong "accountable-$parent_uuid" \
  --arg ambiguous_uuid "$ambiguous_uuid" \
  --arg nested_quoted "$nested_quoted_session" \
  --arg weak_invalid_uuid "$weak_invalid_uuid" \
  --arg runtime "$runtime" '
  .schema == "qq-observer.package" and .schema_version == 2
  and .repository == "fixture/repo"
  and .pr == 41 and .branch == "feature" and .repo == $repo
  and .variant == "guided"
  and ([.sessions[] | select(
    .role == "delegate" and .evidence == "named-branch-terminal-lineage"
  )] | length) == 6
  and ([.sessions[] | select(
    .role == "accountable" and .source_path == $parent_strong and .label == $accountable_strong
  )] | length) == 1
  and ([.sessions[] | select(
    .source_path == $collision_parent_a and .label == "accountable-parent-session"
  )] | length) == 1
  and ([.sessions[] | select(
    .source_path == $collision_parent_b and .label == $collision_parent_b_label
  )] | length) == 1
  and ([.sessions[].label] | length) == ([.sessions[].label] | unique | length)
  and ([.sessions[] | select(.role == "accountable" and .evidence == "parent-of-delegate")] | length) == 4
  and ([.sessions[] | select(.role == "delegate" and .run_id == "ambiguous-run")] | length) == 1
  and ([.sessions[] | select(.role == "delegate" and .run_id == "parent-zero-run")] | length) == 1
  and ([.sessions[] | select(.source_path | contains($ambiguous_uuid))] | length) == 0
  and ([.sessions[] | select(.source_path == $nested_quoted)] | length) == 0
  and ([.sessions[] | select((.run_id // "") | startswith("weak-"))] | length) == 0
  and ([.unknown_entries[] | select(.path == $missing_terminal and (.reason | length > 0))] | length) == 1
  and ([.unknown_entries[] | select(.path == $malformed_terminal and .reason == "malformed delegate TERMINAL")] | length) == 1
  and ([.unknown_entries[] | select(.reason | (contains($ambiguous_uuid) and contains("matched 2 regular files")))] | length) == 1
  and ([.unknown_entries[] | select(.reason | (contains($weak_invalid_uuid) and contains("is not Pi v3")))] | length) == 1
  and ([.unknown_entries[] | select(
    .path == ($runtime + "/async-subagent-runs")
    or .path == ($runtime + "/runs")
    or .path == ($runtime + "/nested-subagent-events")
    or .path == ($runtime + "/async-subagent-results")
    or .path == ($runtime + "/owner-review")
    or .path == ($runtime + "/wrapper-events.jsonl")
    or .path == ($runtime + "/linked-run")
  )] | length) == 0
  and ([.sessions[] | has("facts") or has("signals")] | any | not)
  and any(.warnings[]; contains("outside the explicit named-branch lineage"))
  and any(.warnings[]; contains("parent-zero-run accountable session is unavailable"))
  and any(.warnings[]; contains("could not be Change-bounded"))
' "$run_41/package.json" >/dev/null \
  || fail 'explicit terminal/run-parent lineage was not the sole package membership source'
[ -f "$run_41/inventory.json" ] || fail 'inventory was not written'
# The corpus and the facts/signals derivatives are derivable-on-read views;
# the package stores only transcripts and the merge-time inventory.
[ ! -e "$run_41/corpus" ] || fail 'assemble persisted a derivable corpus'
assert_file_contains "$run_41/sessions/delegate-strong-run-primary.jsonl" \
  'killed at exactly 1800000ms' \
  'package transcript lost exact runtime timeout evidence'
jq -e '.skills == [{name:"fixture",description:"Fixture skill at merge time."}]' \
  "$run_41/inventory.json" >/dev/null || fail 'skill inventory did not preserve the merge-time description'
# Accountable members are Change-bounded: the suffix from the Change's first
# dispatch plus the originating operator brief, never the cross-Change whole.
accountable_session="$run_41/sessions/accountable-$parent_uuid.jsonl"
assert_equal 4 "$(wc -l <"$accountable_session")" \
  'bounded accountable member has the wrong shape'
assert_file_contains "$accountable_session" 'originating brief for PR 41' \
  'bounded accountable member lost the originating operator brief'
assert_file_contains "$accountable_session" 'strong-run dispatched' \
  'bounded accountable member lost the dispatch-era suffix'
assert_file_contains "$accountable_session" 'post-dispatch accountable work' \
  'bounded accountable member lost the post-dispatch suffix'
assert_file_not_matches "$accountable_session" 'earlier change work' \
  'bounded accountable member kept the pre-Change prefix'
assert_file_not_matches "$accountable_session" 'dispatching strong-run' \
  'bounded accountable member kept pre-dispatch entries'
jq -e --arg label "accountable-$parent_uuid" '
  [.sessions[] | select(.label == $label
    and .bounded_from_entry == 5 and .bounded_brief_entry == 3)]
  | length == 1
' "$run_41/package.json" >/dev/null || fail 'bounded provenance was not recorded'
# An accountable session with no dispatch-era entries is copied whole.
assert_equal 2 "$(wc -l <"$run_41/sessions/accountable-$stale_uuid.jsonl")" \
  'unbounded accountable member was not copied whole'
assert_equal 10 "$(find "$run_41/sessions" -type f | wc -l)" 'session transcript count is wrong'
[ ! -e "$run_41/facts" ] || fail 'assemble eagerly created a facts directory'
[ ! -e "$run_41/signals" ] || fail 'assemble eagerly created a signals directory'

missing_package_run="$qualified_runs/pr-96"
mkdir "$missing_package_run"
set +e
"$OBSERVE" finalize --run "$missing_package_run" --failed 'no package' \
  >"$tmp/missing-package.stdout" 2>"$tmp/missing-package.stderr"
status=$?
set -e
assert_equal 64 "$status" 'finalize accepted a run without package.json'
assert_file_contains "$tmp/missing-package.stderr" "$missing_package_run"
rmdir "$missing_package_run"


# Equal PR numbers in another multi-remote Repository remain distinct and every
# GitHub lookup carries the canonical primary-main tracking Repository.
repo_other="$tmp/repo-other"
git clone -q "$repo" "$repo_other"
git -C "$repo_other" remote set-url origin git@github.com:fixture/other.git
git -C "$repo_other" remote add upstream https://github.com/upstream/other.git
git -C "$repo_other" config branch.main.remote origin
"$OBSERVE" assemble --pr 41 --repo "$repo_other" >"$tmp/assembled-other-41.json"
other_run="$XDG_STATE_HOME/qq/observer/runs/by-repository/fixture/other/pr-41"
jq -e --arg repo "$(realpath "$repo_other")" '
  .schema_version == 2 and .repository == "fixture/other" and .repo == $repo and .pr == 41
' "$other_run/package.json" >/dev/null || fail 'second Repository package identity was conflated'
[ "$other_run" != "$run_41" ] || fail 'equal PR numbers shared one run identity'
assert_file_contains "$GH_LOG" 'pr view 41 --repo fixture/repo --json'
assert_file_contains "$GH_LOG" 'pr view 41 --repo fixture/other --json'
if grep -E '^pr view 41 --json|^pr view 41$' "$GH_LOG"; then
  fail 'assembly performed a cwd-only GitHub PR lookup'
fi

"$OBSERVE" assemble --pr 41 --repo "$repo" >"$tmp/reassembled-41.json"
jq -e '.status == "already assembled"' "$tmp/reassembled-41.json" >/dev/null \
  || fail 'reassembly was not idempotent'

# No selected delegates: discover the accountable session from the Repository-home Pi directory.
runtime_solo="$tmp/solo-runtime"
mkdir -p "$runtime_solo"
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
run_42="$qualified_runs/pr-42"
jq -e --arg solo "$solo_session" '
  .sessions == []
  and ([.sessions[] | select(.source_path == $solo)] | length) == 0
  and any(.warnings[]; . == "no delegate runs have explicit named-branch terminal lineage")
' "$run_42/package.json" >/dev/null \
  || fail 'test-created Pi session was promoted without explicit lineage'

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
facts_path="$tmp/facts-strong-run.json"
"$OBSERVE" facts "$session_path" >"$facts_path"
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
  >"$tmp/invalid-finalize.stdout" \
  2>"$tmp/invalid-finalize.stderr"
status=$?
set -e
assert_equal 65 "$status" 'finalize accepted an analysis with facts-ungrounded cost'
assert_file_contains "$tmp/invalid-finalize.stderr" '--failed'
for absent in analysis.json analysis.md analyst-trace.jsonl; do
  [ ! -e "$run_41/$absent" ] || fail "invalid finalize wrote $absent"
done

"$OBSERVE" finalize --run "$run_41" --analysis "$analysis" \
  >"$tmp/finalized-41.json"
[ ! -e "$run_41/analyst-trace.jsonl" ] \
  || fail 'finalize persisted a derivable analyst trace'
set +e
"$OBSERVE" finalize --run "$run_41" --analysis "$run_41/analysis.json" \
  >"$tmp/run-analysis-input.stdout" \
  2>"$tmp/run-analysis-input.stderr"
status=$?
set -e
assert_equal 65 "$status" 'finalize accepted the run analysis path as analyst capture input'
assert_file_contains "$tmp/run-analysis-input.stderr" 'sole writer' \
  'run analysis path refusal did not identify finalize as sole writer'
assert_file_contains "$run_41/analysis.md" '## Session facts'
assert_file_contains "$run_41/analysis.md" '### 1. Fixture episode'
assert_file_contains "$run_41/analysis.md" '## Dropped signals'
assert_file_contains "$run_41/analysis.md" 'Fixture limitation.'
"$OBSERVE" finalize --run "$run_41" --analysis "$analysis" \
  >"$tmp/finalized-identical.json"
jq -e '.written == []' "$tmp/finalized-identical.json" >/dev/null \
  || fail 'identical finalize was not a no-op'
jq '.episodes[0].title = "Differing episode"' "$analysis" >"$tmp/differing-analysis.json"
set +e
"$OBSERVE" finalize --run "$run_41" --analysis "$tmp/differing-analysis.json" \
  >"$tmp/differing.stdout" 2>"$tmp/differing.stderr"
status=$?
set -e
assert_equal 65 "$status" 'differing finalized analysis did not hit append-only refusal'
assert_file_contains "$tmp/differing.stderr" 'append-only conflict'

"$OBSERVE" finalize --run "$run_42" --failed 'observer fixture failed' \
  >"$tmp/failed-42.json"
[ ! -e "$run_42/analyst-trace.jsonl" ] \
  || fail 'finalize persisted a derivable analyst trace'
jq -e '
  .schema == "qq-observer.analysis" and .schema_version == 1
  and .status == "analysis_failed" and .reason == "observer fixture failed"
' "$run_42/analysis_failed.json" >/dev/null || fail 'analysis_failed marker has the wrong shape'
# run-finalized reports terminal observer state for the retire rail:
# finalized, finalized-failed, not-yet-finalized, and missing runs.
set +e
"$OBSERVE" run-finalized --pr 41 --repository fixture/repo >"$tmp/finalized-41.json"
status=$?
set -e
assert_equal 0 "$status" 'run-finalized did not accept the finalized run'
jq -e '.finalized == true and .reason == "finalized"' "$tmp/finalized-41.json" >/dev/null \
  || fail 'run-finalized misreported the finalized run'
set +e
"$OBSERVE" run-finalized --pr 42 --repository fixture/repo >"$tmp/finalized-42.json"
status=$?
set -e
assert_equal 0 "$status" 'run-finalized did not accept the failed-but-final run'
jq -e '.finalized == true and .reason == "finalized-failed"' "$tmp/finalized-42.json" >/dev/null \
  || fail 'run-finalized misreported the failed analysis'
mv "$run_41/analysis.json" "$tmp/analysis-41.json"
set +e
"$OBSERVE" run-finalized --pr 41 --repository fixture/repo >"$tmp/unfinalized-41.json"
status=$?
set -e
assert_equal 1 "$status" 'run-finalized accepted an unfinalized run'
jq -e '.finalized == false and .reason == "analysis-not-finalized"' "$tmp/unfinalized-41.json" >/dev/null \
  || fail 'run-finalized did not expose the missing analysis'
mv "$tmp/analysis-41.json" "$run_41/analysis.json"
set +e
"$OBSERVE" run-finalized --pr 99 --repository fixture/repo >"$tmp/missing-99.json"
status=$?
set -e
assert_equal 1 "$status" 'run-finalized accepted a missing run'
jq -e '.finalized == false and .reason == "missing-or-invalid"' "$tmp/missing-99.json" >/dev/null \
  || fail 'run-finalized did not expose the missing run'

printf 'test-qq-observe-assemble: pass\n'
