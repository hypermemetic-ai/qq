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
# M1: the store's config is unavailable on CI (dangling symlink); the fixture
# writes its own (identical task_prefix).
printf 'task_prefix: "t"\n' >"$repo/backlog/config.yml"
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

# backlog.md is not installed on CI runners; a faithful stub implements the
# exact verbs this suite and bin/qq-observe call, so both venues exercise the
# identical path (PATH-prepended + explicit override).
mkdir -p "$tmp/bin"
cat >"$tmp/bin/backlog" <<'SH'
#!/usr/bin/env bash
# Fixture backlog.md stub: doc create/update, task create, and decision
# create, over the caller's nearest backlog/ directory.
set -euo pipefail
fail() { printf 'backlog-stub: %s\n' "$*" >&2; exit 1; }

root=""
dir="$(pwd -P)"
while [ "$dir" != "/" ]; do
  if [ -d "$dir/backlog" ]; then root="$dir/backlog"; break; fi
  dir="$(dirname "$dir")"
done
[ -n "$root" ] || fail "no backlog directory found from $(pwd -P)"

next_id() {
  local max=0 n base
  for f in "$root/$1"/*.md; do
    [ -e "$f" ] || continue
    base="${f##*/}"
    n="$(printf '%s' "$base" | sed -n "s/^$2-\([0-9][0-9]*\) -.*/\1/p")"
    [ -n "$n" ] && [ "$n" -gt "$max" ] && max="$n"
  done
  printf '%s-%d' "$2" "$((max + 1))"
}
slug() { printf '%s' "$1" | tr ' ' '-'; }

case "${1:-}" in
  doc)
    case "${2:-}" in
      create)
        [ "${3:-}" = "-t" ] || fail "usage: doc create -t <type> <title>"
        doctype="$4"; shift 4
        id="$(next_id docs doc)"
        file="$root/docs/$id - $(slug "$*").md"
        printf -- "---\nid: %s\ntitle: %s\ntype: %s\n---\n\n" "$id" "$*" "$doctype" >"$file"
        printf 'Path: %s\n' "$file"
        ;;
      update)
        id="${3:-}"
        [ "${4:-}" = "--content" ] || fail "usage: doc update <id> --content <body>"
        file="$(grep -rl "^id: $id\$" "$root/docs" --include='*.md' | head -1)"
        [ -n "$file" ] || fail "no document with id $id"
        last="$(awk '/^---$/{c++; if(c==2){print NR; exit}}' "$file")"
        [ -n "$last" ] || fail "document $id has malformed frontmatter"
        head -n "$last" "$file" >"$file.tmp"
        printf '%s\n' "${5:-}" >>"$file.tmp"
        mv "$file.tmp" "$file"
        printf 'Path: %s\n' "$file"
        ;;
      *) fail "unsupported doc verb: ${2:-}" ;;
    esac
    ;;
  task)
    [ "${2:-}" = "create" ] || fail "usage: task create <title> [--description X] [--plain]"
    shift 2; title=""; desc=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --description) desc="$2"; shift 2 ;;
        --plain) shift ;;
        *) title="${title:+$title }$1"; shift ;;
      esac
    done
    id="$(next_id tasks t)"
    file="$root/tasks/$id - $(slug "$title").md"
    printf -- "---\nid: %s\ntitle: %s\nstatus: To Do\n---\n\n%s\n" \
      "$(printf '%s' "$id" | tr 'a-z' 'A-Z')" "$title" "$desc" >"$file"
    printf 'File: %s\n' "$file"
    ;;
  decision)
    [ "${2:-}" = "create" ] || fail "usage: decision create [-s status] <title>"
    shift 2; status="proposed"; title=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -s) status="$2"; shift 2 ;;
        *) title="${title:+$title }$1"; shift ;;
      esac
    done
    id="$(next_id decisions decision)"
    file="$root/decisions/$id - $(slug "$title").md"
    printf -- "---\nid: %s\ntitle: %s\ndate: '2026-01-01 00:00'\nstatus: %s\n---\n## Context\n\n## Decision\n\n## Consequences\n" \
      "$id" "$title" "$status" >"$file"
    printf 'Path: %s\n' "$file"
    ;;
  *) fail "unsupported verb: ${1:-}" ;;
esac
SH
chmod +x "$tmp/bin/backlog"
export PATH="$tmp/bin:$PATH"
export QQ_BACKLOG_BIN="$tmp/bin/backlog"

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
key = a settled entry here, or an exact-substring hit for the key in a
Backlog decision record (Task, plan, and doc mentions never settle).

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


# One settle validates against current occurrences, derives identities
# internally, and covers the key; the settled entry appends as one JSON line.
"$OBSERVE" architect-context >"$tmp/context-uncovered.json"
jq -e '
  .schema_version == 5
  and ((has("context_id") or has("pending_intakes")) | not)
  and any(.findings[]; .recurrence_key == "scan-key" and .covered == false
    and (.occurrences | length) == 2)
  and all(.findings[]; .recurrence_key != "explicit-decision-settlement-zebra-984")
' "$tmp/context-uncovered.json" >/dev/null \
  || fail 'Architect context did not expose the uncovered fixture key'
jq -cn '[
  {recurrence_key:"scan-key",action:"set_aside",scope:"",note:"fixture note"}
]' >"$tmp/settle-decisions.json"
"$OBSERVE" disposition-settle --decisions "$tmp/settle-decisions.json" >"$tmp/settled.json"
jq -e '.status == "settled" and .settled == ["scan-key"]' "$tmp/settled.json" >/dev/null \
  || fail 'disposition-settle did not settle the fixture key'
"$OBSERVE" architect-context >"$tmp/context-covered.json"
jq -e 'all(.findings[]; .recurrence_key != "scan-key")' "$tmp/context-covered.json" >/dev/null \
  || fail 'settled disposition did not cover its key'
doc_file="$(grep -rl '^title: Observer dispositions$' "$repo/backlog/docs" | head -1)"
[ -n "$doc_file" ] || fail 'dispositions document not found in the fixture store'
jq -e '.recurrence_key == "scan-key" and .action == "set_aside"
  and .scope == "" and .note == "fixture note"
  and (.occurrence_ids | length) == 2 and (.settled_at | endswith("Z"))' \
  < <(tail -n 1 "$doc_file") >/dev/null \
  || fail 'settled entry did not append with derived occurrence identities'

# Re-settling a settled key and settling an unknown key both refuse.
set +e
"$OBSERVE" disposition-settle --decisions "$tmp/settle-decisions.json" \
  >"$tmp/resettle.stdout" 2>"$tmp/resettle.stderr"
status=$?
set -e
assert_equal 65 "$status" 're-settling a settled key did not refuse'
assert_file_contains "$tmp/resettle.stderr" 'no unresolved occurrences'
jq -cn '[{recurrence_key:"never-seen-key",action:"set_aside",scope:"",note:""}]' \
  >"$tmp/unknown-decisions.json"
set +e
"$OBSERVE" disposition-settle --decisions "$tmp/unknown-decisions.json" \
  >"$tmp/unknown.stdout" 2>"$tmp/unknown.stderr"
status=$?
set -e
assert_equal 65 "$status" 'settling an unknown key did not refuse'
assert_file_contains "$tmp/unknown.stderr" 'no unresolved occurrences'

# The live key inventory lists every unsettled key for observer reuse:
# settled keys drop out; decision-covered keys stay.
"$OBSERVE" recurrence-keys >"$tmp/recurrence-keys.txt"
assert_equal 1 "$(wc -l <"$tmp/recurrence-keys.txt")" \
  'recurrence-keys did not list exactly the unsettled keys'
grep -Fxq 'explicit-decision-settlement-zebra-984' "$tmp/recurrence-keys.txt" \
  || fail 'recurrence-keys omitted an unsettled key'
if grep -Fxq 'scan-key' "$tmp/recurrence-keys.txt"; then
  fail 'recurrence-keys listed a settled key'
fi

# Successful finalize remains the sole writer of analysis outputs.
finalize_run="$runs/pr-4"
write_package 4 2026-01-04T00:00:00Z
mkdir -p "$finalize_run/sessions"
session="$finalize_run/sessions/observer.jsonl"
cat >"$session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-01-04T00:00:00Z"}
{"type":"message","timestamp":"2026-01-04T00:00:01Z","message":{"role":"user","content":"fixture"}}
JSONL
jq '.sessions=[{label:"observer"}]' \
  "$finalize_run/package.json" >"$tmp/finalize-package.json"
mv "$tmp/finalize-package.json" "$finalize_run/package.json"
cat >"$tmp/finalize-analysis.json" <<JSON
{"schema":"qq-observer.analysis","schema_version":1,"run":{"change":"fixture/scan#4","sessions":["$session"]},"episodes":[],"dropped_signals":[],"limitations":"Fixture."}
JSON
"$OBSERVE" finalize --run "$finalize_run" \
  --analysis "$tmp/finalize-analysis.json" >"$tmp/finalize.json"
jq -e '.status == "finalized" and (.written | sort) == ["analysis.json","analysis.md"]' \
  "$tmp/finalize.json" >/dev/null || fail 'successful finalize lost its output contract'
[ ! -e "$finalize_run/analyst-trace.jsonl" ] \
  || fail 'finalize persisted a derivable analyst trace'

for retired in record id summarize read-session verify-delivery render-doc digest rounds; do
  set +e
  "$OBSERVE" "$retired" fixture >"$tmp/$retired.out" 2>"$tmp/$retired.err"
  status=$?
  set -e
  assert_equal 64 "$status" "$retired command remains available"
  assert_file_contains "$tmp/$retired.err" 'usage:'
done

printf 'test-qq-observe-ledger-scan: pass\n'
