#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-observe-seam-signals"
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export XDG_STATE_HOME="$tmp/state"

unacknowledged="$tmp/unacknowledged.jsonl"
cat >"$unacknowledged" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-24T00:00:00Z"}
{"type":"message","timestamp":"2026-07-24T00:00:01Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"request-1","name":"operator_stage","arguments":{"command":"printf proceed","description":"Run the approved command","danger":"low"}}]}}
{"type":"message","timestamp":"2026-07-24T00:00:02Z","message":{"role":"toolResult","toolCallId":"request-1","toolName":"operator_stage","content":[{"type":"text","text":"Command staged for the operator."}],"isError":false}}
{"type":"future_pi_entry","timestamp":"2026-07-24T00:00:03Z"}
JSONL
"$OBSERVE" signals "$unacknowledged" >"$tmp/unacknowledged-signals.json"
"$OBSERVE" facts "$unacknowledged" >"$tmp/unacknowledged-facts.json"
jq -e '
  .episodes == [{kind:"operator_request_unacknowledged",entries:[2,3]}]
' "$tmp/unacknowledged-signals.json" >/dev/null \
  || fail 'operator request without a later user entry was not cited with its result'
jq -e '
  .unknown_entries == {
    total:1,
    by_shape:{"pi:future_pi_entry":1},
    entries:[{entry:4,shape:"pi:future_pi_entry"}]
  }
' "$tmp/unacknowledged-facts.json" >/dev/null \
  || fail 'seam analysis dropped an unknown Pi entry instead of counting it'

stalled="$tmp/stalled.jsonl"
{
  printf '%s\n' '{"type":"session","version":3,"timestamp":"2026-07-24T00:00:00Z"}'
  printf '%s\n' '{"type":"message","timestamp":"2026-07-24T00:00:01Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"request-2","name":"bash","arguments":{"command":"herdr notification show Attention --body Please-review"}}]}}'
  printf '%s\n' '{"type":"message","timestamp":"2026-07-24T00:00:02Z","message":{"role":"toolResult","toolCallId":"request-2","toolName":"bash","content":[{"type":"text","text":"shown"}],"isError":false}}'
  for index in $(seq 1 39); do
    printf '{"type":"message","timestamp":"2026-07-24T00:00:%02dZ","message":{"role":"assistant","content":[{"type":"text","text":"agent-side %d"}]}}\n' "$((index + 2))" "$index"
  done
  printf '%s\n' '{"type":"message","timestamp":"2026-07-24T00:00:59Z","message":{"role":"user","content":[{"type":"text","text":"I am here now."}]}}'
} >"$stalled"
"$OBSERVE" signals "$stalled" >"$tmp/stalled-signals.json"
jq -e '
  .episodes == [{kind:"operator_request_stalled",entries:[2,3,43]}]
' "$tmp/stalled-signals.json" >/dev/null \
  || fail 'request with forty intervening agent-side entries was not stalled'

claims="$tmp/claims.jsonl"
cat >"$claims" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-24T00:00:00Z"}
{"type":"message","timestamp":"2026-07-24T00:00:01Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"write-1","name":"write","arguments":{"path":"fixture","content":"one"}}]}}
{"type":"message","timestamp":"2026-07-24T00:00:02Z","message":{"role":"toolResult","toolCallId":"write-1","toolName":"write","content":[{"type":"text","text":"wrote fixture"}],"isError":false}}
{"type":"message","timestamp":"2026-07-24T00:00:03Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"check-1","name":"bash","arguments":{"command":"bash tests/test-fixture.sh"}}]}}
{"type":"message","timestamp":"2026-07-24T00:00:04Z","message":{"role":"toolResult","toolCallId":"check-1","toolName":"bash","content":[{"type":"text","text":"pass"}],"isError":false}}
{"type":"message","timestamp":"2026-07-24T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"All tests pass."}]}}
{"type":"message","timestamp":"2026-07-24T00:00:06Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"edit-1","name":"edit","arguments":{"path":"fixture","oldText":"one","newText":"two"}}]}}
{"type":"message","timestamp":"2026-07-24T00:00:07Z","message":{"role":"toolResult","toolCallId":"edit-1","toolName":"edit","content":[{"type":"text","text":"edited fixture"}],"isError":false}}
{"type":"message","timestamp":"2026-07-24T00:00:08Z","message":{"role":"assistant","content":[{"type":"text","text":"Ready to merge."}]}}
JSONL
"$OBSERVE" signals "$claims" >"$tmp/claim-signals.json"
jq -e '
  .episodes == [{kind:"unverified_completion_claim",entries:[7,9]}]
' "$tmp/claim-signals.json" >/dev/null \
  || fail 'verified and unverified completion claims were not distinguished'

session="$tmp/analysis-session.jsonl"
cat >"$session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-24T00:00:00Z"}
{"type":"message","timestamp":"2026-07-24T00:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"seam evidence"}]}}
JSONL
facts="$tmp/analysis-facts.json"
"$OBSERVE" facts "$session" >"$facts"
kinds=(
  operator-seam.unconfirmed-assumption
  operator-seam.unseen-request
  operator-seam.misread-direction
  operator-seam.misleading-claim
  operator-seam.stale-world
  operator-seam.cross-session
  operator-seam.abandonment
)
for kind in "${kinds[@]}"; do
  analysis="$tmp/${kind##*.}.json"
  jq -n --arg session "$session" --arg kind "$kind" '{
    schema:"qq-observer.analysis",schema_version:1,
    run:{change:"seam-fixture",sessions:[$session]},
    episodes:[{
      kind:$kind,title:"Seam fixture",sessions:[$session],
      evidence:[{session:$session,entries:[2],quote:"seam evidence"}],
      what_happened:"A seam event happened.",root_cause:"A seam cause was cited.",
      root_cause_location:"agent-behavior",
      cost:{turns:1,tokens:0,duration_ms:1000,source:("facts:"+$session)},
      remedy:{type:"process",smallest_change:"Keep the exchange explicit."},
      confidence:"high",confidence_why:"Direct evidence.",
      recurrence_key:$kind,no_signal:true
    }],
    dropped_signals:[],limitations:"Full-read fixture."
  }' >"$analysis"
  "$OBSERVE" validate-analysis "$analysis" "$session" \
    --facts "$session=$facts" >"$tmp/${kind##*.}.validated.json"
  jq -e --arg kind "$kind" \
    '.episodes == [(.episodes[0] | select(.kind == $kind and .no_signal == true))]' \
    "$tmp/${kind##*.}.validated.json" >/dev/null \
    || fail "validator did not accept taxonomy kind $kind with no_signal"
done

jq '.episodes[0].evidence[0].entries = [99]' \
  "$tmp/unconfirmed-assumption.json" >"$tmp/non-resolving.json"
set +e
"$OBSERVE" validate-analysis "$tmp/non-resolving.json" "$session" \
  --facts "$session=$facts" >"$tmp/non-resolving.out" 2>"$tmp/non-resolving.err"
status=$?
set -e
assert_equal 1 "$status" 'new seam taxonomy bypassed citation resolution'
jq -e '
  .status == "analysis_failed" and (.reason | contains("does not exist"))
' "$tmp/non-resolving.out" >/dev/null \
  || fail 'non-resolving seam citation did not produce analysis_failed'

jq -e --argjson kinds "$(printf '%s\n' "${kinds[@]}" | jq -R . | jq -s .)" '
  ([.["$defs"].episode.properties.kind.enum[] | select(startswith("operator-seam."))] | sort)
    == ($kinds | sort)
  and .["$defs"].episode.properties.no_signal == {type:"boolean"}
' "$ROOT/delegation/manifests/observer-analysis.schema.json" >/dev/null \
  || fail 'analysis JSON schema does not carry the complete seam taxonomy and no_signal'

printf 'test-qq-observe-seam-signals: pass\n'
