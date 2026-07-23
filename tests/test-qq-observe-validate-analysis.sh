#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-validate-analysis"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export XDG_STATE_HOME="$tmp/state"

session_a="$tmp/session-a.jsonl"
cat >"$session_a" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-23T00:00:00Z"}
{"type":"message","timestamp":"2026-07-23T00:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"expected"}]}}
{"type":"message","timestamp":"2026-07-23T00:00:02Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"event"}]}}
{"type":"message","timestamp":"2026-07-23T00:00:03Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call-1","name":"read","arguments":{"path":"fixture"}}]}}
{"type":"message","timestamp":"2026-07-23T00:00:04Z","message":{"role":"assistant","content":"plain string content"}}
JSONL
session_b="$tmp/session-b.jsonl"
cat >"$session_b" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-23T00:00:00Z"}
{"type":"message","timestamp":"2026-07-23T00:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}
JSONL
session_a_dot="$tmp/./session-a.jsonl"
session_a_link="$tmp/session-a-link.jsonl"
ln -s "$session_a" "$session_a_link"

facts_a="$tmp/facts-a.json"
cat >"$facts_a" <<'JSON'
{"schema":"qq-observe.facts","schema_version":2,"turns_by_role":{"assistant":4},"token_usage":{"input":7,"output":3},"token_usage_records":1,"wall_clock":{"duration_ms":1000}}
JSON
facts_b="$tmp/facts-b.json"
cat >"$facts_b" <<'JSON'
{"schema":"qq-observe.facts","schema_version":2,"turns_by_role":{"assistant":1},"token_usage":{"input":40,"output":10},"token_usage_records":1,"wall_clock":{"duration_ms":2000}}
JSON
facts_a_null="$tmp/facts-a-null.json"
cat >"$facts_a_null" <<'JSON'
{"schema":"qq-observe.facts","schema_version":2,"turns_by_role":{"assistant":4},"token_usage":{"input":null,"output":null},"token_usage_records":0,"wall_clock":{"duration_ms":1000}}
JSON
facts_b_null="$tmp/facts-b-null.json"
cat >"$facts_b_null" <<'JSON'
{"schema":"qq-observe.facts","schema_version":2,"turns_by_role":{"assistant":1},"token_usage":{"input":null,"output":null},"token_usage_records":0,"wall_clock":{"duration_ms":2000}}
JSON

valid="$tmp/valid.json"
jq -n --arg a "$session_a" --arg b "$session_b" '
  def episode($title; $confidence; $session; $quote; $turns; $tokens; $duration_ms; $kind; $location): {
    kind:$kind,
    title:$title,
    sessions:[$session],
    evidence:[{session:$session,entries:[2],quote:$quote}],
    what_happened:"A cited event happened.",
    root_cause:"A cited harness cause.",
    root_cause_location:$location,
    cost:{turns:$turns,tokens:$tokens,duration_ms:$duration_ms,source:("facts:" + $session)},
    remedy:{type:"harness-redesign",smallest_change:"Change one harness rule."},
    confidence:$confidence,
    confidence_why:"The citation is direct.",
    recurrence_key:$title
  };
  {
    schema:"qq-observer.analysis",
    schema_version:1,
    run:{change:"T-142-fixture",sessions:[$a,$b]},
    episodes:[
      episode("Low tokens high";"high";$a;"expected";4;10;1000;"waste";"agent-behavior"),
      episode("High tokens high";"high";$b;"done";1;50;2000;"design-question";"harness-design"),
      episode("Medium huge";"medium";$b;"done";1;50;2000;"friction";"instruction"),
      episode("Zulu low tie";"low";$a;"expected";4;10;1000;"substrate";"substrate"),
      episode("Alpha low tie";"low";$a;"expected";4;10;1000;"failure";"tool")
    ],
    dropped_signals:[{kind:"compaction",entries:[2],why:"Benign fixture signal."}],
    limitations:"Fixture analysis."
  }
' >"$valid"

package_args=(
  "$session_a" "$session_b"
  --facts "$session_a=$facts_a"
  --facts "$session_b=$facts_b"
)

expect_analysis_success() {
  local name="$1" analysis="$2"
  shift 2
  local -a supplied=("${package_args[@]}")
  if [ "$#" -gt 0 ]; then
    supplied=("$@")
  fi
  if ! (
    cd "$ROOT"
    "$OBSERVE" validate-analysis "$analysis" "${supplied[@]}"
  ) >"$tmp/$name.stdout" 2>"$tmp/$name.stderr"; then
    sed -n '1,20p' "$tmp/$name.stdout" >&2
    sed -n '1,20p' "$tmp/$name.stderr" >&2
    fail "$name did not validate"
  fi
  [ ! -s "$tmp/$name.stderr" ] || fail "$name emitted stderr"
  jq -e '.schema == "qq-observer.analysis"' "$tmp/$name.stdout" >/dev/null \
    || fail "$name did not emit analysis JSON"
}

expect_analysis_failure() {
  local name="$1" analysis="$2"
  shift 2
  local -a supplied=("${package_args[@]}")
  if [ "$#" -gt 0 ]; then
    supplied=("$@")
  fi
  set +e
  (
    cd "$ROOT"
    "$OBSERVE" validate-analysis "$analysis" "${supplied[@]}"
  ) >"$tmp/$name.stdout" 2>"$tmp/$name.stderr"
  local status=$?
  set -e
  assert_equal 1 "$status" "$name did not exit 1"
  [ ! -s "$tmp/$name.stderr" ] || fail "$name emitted stderr instead of failure JSON"
  jq -e '
    .schema == "qq-observer.analysis"
    and .schema_version == 1
    and .status == "analysis_failed"
    and (.reason | type) == "string"
  ' "$tmp/$name.stdout" >/dev/null || fail "$name did not emit analysis_failed JSON"
}

expect_analysis_success ranked "$valid"
mv "$tmp/ranked.stdout" "$tmp/ranked.json"
jq -e '
  [.episodes[].title] == [
    "High tokens high",
    "Low tokens high",
    "Medium huge",
    "Alpha low tie",
    "Zulu low tie"
  ]
  and [.episodes[].rank] == [1,2,3,4,5]
' "$tmp/ranked.json" >/dev/null \
  || fail 'valid analysis was not ranked by confidence, tokens, then title'
expect_analysis_success revalidated "$tmp/ranked.json"
if ! cmp -s "$tmp/ranked.json" "$tmp/revalidated.stdout"; then
  diff -u "$tmp/ranked.json" "$tmp/revalidated.stdout" >&2 || true
  fail 'ranked output did not revalidate to the same ranked analysis'
fi
expect_analysis_success analysis-path-alias "$tmp/./valid.json"

jq --arg canonical "$session_a" --arg alias "$session_a_dot" '
  .run.sessions |= map(if . == $canonical then $alias else . end)
  | .episodes |= map(
      if .sessions[0] == $canonical then
        .sessions[0] = $alias
        | .evidence[0].session = $alias
        | .cost.source = ("facts:" + $alias)
      else . end
    )
' "$valid" >"$tmp/canonicalized-analysis-paths.json"
expect_analysis_success canonicalized-analysis-paths "$tmp/canonicalized-analysis-paths.json" \
  "$session_a" "$session_b" \
  --facts "$session_a=$tmp/./facts-a.json" --facts "$session_b=$facts_b"
jq -e --arg canonical "$session_a" '
  .run.sessions[0] == $canonical
  and ([.episodes[] | select(.sessions[0] == $canonical)] | length) == 3
  and ([.episodes[].evidence[] | select(.session == $canonical)] | length) == 3
  and ([.episodes[] | select(.sessions[0] == $canonical) | .cost.source]
    | all(. == ("facts:" + $canonical)))
' "$tmp/canonicalized-analysis-paths.stdout" >/dev/null \
  || fail 'analysis path aliases were not emitted canonically'

jq '.episodes[0].evidence[0].quote = "unrelated event"' \
  "$valid" >"$tmp/bogus-quote.json"
expect_analysis_failure bogus-quote "$tmp/bogus-quote.json"
assert_file_contains "$tmp/bogus-quote.stdout" 'citation quote is not verbatim' \
  'bogus quote failure did not explain the mismatch'

jq --arg session "$session_a" '
  .episodes = [.episodes[0]]
  | .episodes[0].evidence[0] = {
      session:$session, entries:[2,3], quote:"expected\n   event"
    }
' "$valid" >"$tmp/spanning-quote.json"
expect_analysis_success spanning-quote "$tmp/spanning-quote.json"

jq --arg session "$session_a" '
  .episodes = [.episodes[0]]
  | .episodes[0].evidence[0] = {
      session:$session, entries:[5], quote:"plain string content"
    }
' "$valid" >"$tmp/plain-string-quote.json"
expect_analysis_success plain-string-quote "$tmp/plain-string-quote.json"

jq --arg session "$session_a" '
  .episodes[0].evidence[0] = {session:$session,entries:[4,2],quote:"expected"}
' "$valid" >"$tmp/textless-entry.json"
expect_analysis_failure textless-entry "$tmp/textless-entry.json"
assert_file_contains "$tmp/textless-entry.stdout" 'citation carries no quotable text' \
  'textless citation failure did not use the required reason'

jq '.episodes[0].evidence[0] = {
  session:.episodes[0].evidence[0].session,
  entries:[2,2],
  quote:"expected expected"
}' "$valid" >"$tmp/duplicate-citation-entry.json"
expect_analysis_failure duplicate-citation-entry "$tmp/duplicate-citation-entry.json"
assert_file_contains "$tmp/duplicate-citation-entry.stdout" 'duplicate entry in citation' \
  'duplicate citation entry did not use the required reason'

jq '.episodes[0].evidence = [
  .episodes[0].evidence[0],
  .episodes[0].evidence[0]
]' "$valid" >"$tmp/shared-entry-citations.json"
expect_analysis_success shared-entry-citations "$tmp/shared-entry-citations.json"

jq '.episodes[0].evidence[0].entries = [99]' "$valid" >"$tmp/bad-index.json"
expect_analysis_failure bad-index "$tmp/bad-index.json"

jq '.episodes[0].evidence[0].session = "/not/in/the/package.jsonl"' \
  "$valid" >"$tmp/unknown-session.json"
expect_analysis_failure unknown-session "$tmp/unknown-session.json"

jq --arg session "$session_a" --arg alias "$session_a_dot" '
  .episodes[0].sessions = [$session,$alias]
  | .episodes[0].cost = {
      turns:8, tokens:20, duration_ms:2000, source:("facts:" + $session)
    }
' "$valid" >"$tmp/duplicate-episode-session.json"
expect_analysis_failure duplicate-episode-session "$tmp/duplicate-episode-session.json"
assert_file_contains "$tmp/duplicate-episode-session.stdout" \
  'duplicate session in episode.sessions' \
  'alias-duplicate episode session did not use the required reason'

jq --arg a "$session_a" --arg alias "$session_a_dot" --arg b "$session_b" \
  '.run.sessions = [$a,$alias,$b]' "$valid" >"$tmp/duplicate-run-session.json"
expect_analysis_failure duplicate-run-session "$tmp/duplicate-run-session.json"
assert_file_contains "$tmp/duplicate-run-session.stdout" 'duplicate session in run.sessions' \
  'alias-duplicate run session did not use the required reason'

expect_analysis_failure duplicate-facts-alias "$valid" \
  "$session_a" "$session_b" \
  --facts "$session_a=$facts_a" --facts "$session_a_dot=$facts_a" \
  --facts "$session_b=$facts_b"
assert_file_contains "$tmp/duplicate-facts-alias.stdout" 'duplicate --facts session:' \
  'alias-duplicate facts pair did not use the required reason'

expect_analysis_failure duplicate-symlink-session "$valid" \
  "$session_a" "$session_a_link" "$session_b" \
  --facts "$session_a=$facts_a" --facts "$session_b=$facts_b"
assert_file_contains "$tmp/duplicate-symlink-session.stdout" 'duplicate session JSONL path' \
  'symlinked session alias did not use the required reason'

expect_analysis_failure missing-facts "$valid" \
  "$session_a" "$session_b" --facts "$session_a=$facts_a"

expect_analysis_failure unknown-facts "$valid" \
  "$session_a" "$session_b" \
  --facts "$session_a=$facts_a" --facts "$session_b=$facts_b" \
  --facts "$tmp/unknown-session.jsonl=$facts_a"

printf '{' >"$tmp/malformed-facts.json"
expect_analysis_failure malformed-facts "$valid" \
  "$session_a" "$session_b" \
  --facts "$session_a=$facts_a" --facts "$session_b=$tmp/malformed-facts.json"

jq '.episodes[0].cost.turns = 5' "$valid" >"$tmp/bad-turns.json"
expect_analysis_failure bad-turns "$tmp/bad-turns.json"
assert_file_contains "$tmp/bad-turns.stdout" 'cost.turns mismatch: expected 4, actual 5' \
  'turn mismatch did not report expected and actual values'

jq '.episodes[0].cost.tokens = 11' "$valid" >"$tmp/bad-tokens.json"
expect_analysis_failure bad-tokens "$tmp/bad-tokens.json"
assert_file_contains "$tmp/bad-tokens.stdout" 'cost.tokens mismatch: expected 10, actual 11' \
  'token mismatch did not report expected and actual values'

jq '.episodes[0].cost.duration_ms = 1001' "$valid" >"$tmp/bad-duration.json"
expect_analysis_failure bad-duration "$tmp/bad-duration.json"
assert_file_contains "$tmp/bad-duration.stdout" \
  'cost.duration_ms mismatch: expected 1000, actual 1001' \
  'duration mismatch did not report expected and actual values'

jq '.episodes[0].cost.source = "not a facts pointer"' "$valid" >"$tmp/bad-source.json"
expect_analysis_failure bad-source "$tmp/bad-source.json"
assert_file_contains "$tmp/bad-source.stdout" 'cost.source mismatch:' \
  'source mismatch did not identify the field'

for field in turns tokens duration_ms; do
  python3 - "$valid" "$tmp/huge-$field.json" "$field" <<'PY'
import json
import sys
source, destination, field = sys.argv[1:]
with open(source, encoding="utf-8") as handle:
    analysis = json.load(handle)
analysis["episodes"][0]["cost"][field] = 10 ** 400
with open(destination, "w", encoding="utf-8") as handle:
    json.dump(analysis, handle, separators=(",", ":"))
    handle.write("\n")
PY
  expect_analysis_failure "huge-$field" "$tmp/huge-$field.json"
  assert_file_contains "$tmp/huge-$field.stdout" 'magnitude exceeds 1000000000000000' \
    "huge $field did not fail at the sane-session bound"
done

jq --arg a "$session_a" --arg b "$session_b" '
  .episodes = [.episodes[0]]
  | .episodes[0].sessions = [$a,$b]
  | .episodes[0].cost = {
      turns:5, tokens:50, duration_ms:3000, source:("facts:" + $a)
    }
' "$valid" >"$tmp/null-usage-mixed.json"
expect_analysis_success null-usage-mixed "$tmp/null-usage-mixed.json" \
  "$session_a" "$session_b" \
  --facts "$session_a=$facts_a_null" --facts "$session_b=$facts_b"

expect_analysis_success null-usage-unchecked "$valid" \
  "$session_a" "$session_b" \
  --facts "$session_a=$facts_a_null" --facts "$session_b=$facts_b_null"

jq '.episodes += [.episodes[0]]' "$valid" >"$tmp/six-episodes.json"
expect_analysis_failure six-episodes "$tmp/six-episodes.json"

jq 'del(.episodes[0].root_cause)' "$valid" >"$tmp/missing-field.json"
expect_analysis_failure missing-field "$tmp/missing-field.json"

jq '.episodes[0].kind = "not-a-kind"' "$valid" >"$tmp/bad-kind.json"
expect_analysis_failure bad-kind "$tmp/bad-kind.json"

jq '.episodes[0].evidence[0].quote = ([range(0;201)] | map("x") | join(""))' \
  "$valid" >"$tmp/long-quote.json"
expect_analysis_failure long-quote "$tmp/long-quote.json"

jq '.episodes[0].rank = 0' "$valid" >"$tmp/bad-rank.json"
expect_analysis_failure bad-rank "$tmp/bad-rank.json"

failed_input="$tmp/failed-input.json"
cat >"$failed_input" <<'JSON'
{"schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed","reason":"observer could not read its package"}
JSON
expect_analysis_success failed-pass-through "$failed_input"
jq -S -c . "$failed_input" >"$tmp/failed-expected.json"
if ! cmp -s "$tmp/failed-expected.json" "$tmp/failed-pass-through.stdout"; then
  diff -u "$tmp/failed-expected.json" "$tmp/failed-pass-through.stdout" >&2 || true
  fail 'valid analysis_failed input did not pass through'
fi

printf 'test-qq-observe-validate-analysis: pass\n'
