#!/usr/bin/env bash
# Owner-run only. Uses an explicit non-owner test anchor and closes only exact
# probe panes. Any uncertain resource is preserved in RUN_DIR for inspection.
set -euo pipefail
refuse() { printf 'qq-context-live-herdr: refused: %s\n' "$*" >&2; exit 2; }
uncertain() { printf 'qq-context-live-herdr: UNCERTAIN: %s; exact evidence/resources preserved in %s\n' "$*" "$RUN_DIR" >&2; exit 1; }
usage() { refuse 'usage: qq-context-live-herdr.sh --i-understand-live-herdr --workspace ID --test-anchor-pane ID --repo /absolute/repo --product ID --change ID'; }
[[ -z "${CI:-}" ]] || refuse 'live Herdr probe is non-CI only'
[[ $# -eq 11 && "$1" == --i-understand-live-herdr && "$2" == --workspace && "$4" == --test-anchor-pane && "$6" == --repo && "$8" == --product && "${10}" == --change ]] || usage
WORKSPACE=$3 ANCHOR=$5 REPO=$7 PRODUCT=$9 CHANGE=${11}
[[ "$REPO" == /* && -d "$REPO" ]] || refuse 'Repository must be an existing absolute path'
for command in herdr jq python3 sha256sum; do command -v "$command" >/dev/null || refuse "$command is required"; done
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"; REPO="$(cd -- "$REPO" && pwd -P)"
RUN_DIR="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/qq-context-live.XXXXXX")"; chmod 700 "$RUN_DIR"; export XDG_STATE_HOME="$RUN_DIR/state"; mkdir -p "$XDG_STATE_HOME"; chmod 700 "$XDG_STATE_HOME"
EXTENSION="$RUN_DIR/qq-context-lifecycle.ts"; cp "$ROOT/extensions/qq-context-lifecycle.ts" "$EXTENSION"
managed_herdr_candidate="${PI_CODING_AGENT_DIR:-${HOME:?HOME is required}/.pi/agent}/extensions/herdr-agent-state.ts"
HERDR_EXTENSION="$(readlink -f -- "$managed_herdr_candidate")" || refuse 'installed managed Herdr Pi reporter is unavailable'
[[ "$HERDR_EXTENSION" == /* && -f "$HERDR_EXTENSION" && ! -L "$HERDR_EXTENSION" ]] || refuse 'installed managed Herdr Pi reporter is not a canonical non-symlink regular file'
grep -Fq 'report_agent_session' "$HERDR_EXTENSION" || refuse 'installed managed Herdr extension does not expose the required Pi session reporter'
AUTHORITY_FIXTURE="$RUN_DIR/exact-authority.txt"; printf 'T-189 isolated live authority fixture\n' >"$AUTHORITY_FIXTURE"; chmod 600 "$AUTHORITY_FIXTURE"
AUTHORITY_REVISION="$(sha256sum "$AUTHORITY_FIXTURE" | cut -d' ' -f1)"
QQ_CONTEXT_AUTHORITIES="$(jq -cn --arg path "$AUTHORITY_FIXTURE" --arg sha "$AUTHORITY_REVISION" '[{name:"probe",path:$path,sha256:$sha}]')"; export QQ_CONTEXT_AUTHORITIES
OWNER_PANE="${HERDR_PANE_ID:-}"; [[ -n "$OWNER_PANE" ]] || OWNER_PANE="$(herdr pane current --current | jq -er '.result.pane.pane_id')"
[[ "$ANCHOR" != "$OWNER_PANE" ]] || refuse 'test anchor must not be the accountable owner pane'
anchor_doc="$(herdr pane get "$ANCHOR")" || refuse 'test anchor is unavailable'; ANCHOR_TAB="$(jq -er --arg pane "$ANCHOR" --arg workspace "$WORKSPACE" '.result | select(.type=="pane_info") | .pane | select(.pane_id==$pane and .workspace_id==$workspace) | .tab_id' <<<"$anchor_doc")" || refuse 'test anchor identity/workspace is malformed'
FOCUS_BEFORE="$(herdr pane current --current | jq -er '.result.pane.pane_id')"; PRE_PANES="$(herdr pane list --workspace "$WORKSPACE")"; printf '%s\n' "$PRE_PANES" >"$RUN_DIR/pre-panes.json"
CREATED=()
pane_absent() { local pane=$1 output status; set +e; output="$(herdr pane get "$pane" 2>&1)"; status=$?; set -e; [[ "$status" -ne 0 ]] && jq -e '.error.code == "pane_not_found"' <<<"$output" >/dev/null 2>&1; }
close_exact() { local pane=$1; [[ "$pane" != "$OWNER_PANE" && "$pane" != "$ANCHOR" ]] || uncertain "refused unsafe close target $pane"; herdr pane close "$pane" >/dev/null || uncertain "exact pane close failed: $pane"; pane_absent "$pane" || uncertain "pane close lacked exact pane_not_found proof: $pane"; }
new_pane() {
  local role=$1 change=${2:-} receipt pane
  local envs=(--env "XDG_STATE_HOME=$XDG_STATE_HOME" --env "QQ_ACCOUNTABLE_ROLE=$role" --env "QQ_PRODUCT_ID=$PRODUCT" --env "QQ_ROLE_SOURCE_FINGERPRINT=live-role-$role-${change:-product}" --env "QQ_SOURCE_FINGERPRINT=live-source-$role-${change:-product}" --env "QQ_OPERATION_CURSOR=live-cursor-$role-${change:-product}" --env "QQ_ACTOR_BINDING_BIN=$ROOT/bin/qq-actor-binding")
  envs+=(--env "QQ_CONTEXT_AUTHORITIES=$QQ_CONTEXT_AUTHORITIES")
  [[ -z "$change" ]] || envs+=(--env "QQ_CHANGE_ID=$change")
  receipt="$(herdr pane split --pane "$ANCHOR" --direction right --cwd "$REPO" --no-focus "${envs[@]}")" || uncertain 'no-focus pane split failed'
  pane="$(jq -er --arg workspace "$WORKSPACE" --arg tab "$ANCHOR_TAB" --arg cwd "$REPO" '.result | select(.type=="pane_info") | .pane | select(.workspace_id==$workspace and .tab_id==$tab and .cwd==$cwd and .focused==false) | .pane_id' <<<"$receipt")" || uncertain 'split receipt has wrong workspace/tab/cwd/focus'
  [[ "$pane" != "$OWNER_PANE" && "$pane" != "$ANCHOR" ]] || uncertain 'Herdr reused owner/anchor pane'
  jq -e --arg pane "$pane" '[.result.panes[].pane_id] | index($pane)==null' <<<"$PRE_PANES" >/dev/null || uncertain "Herdr reused preexisting pane $pane"
  CREATED+=("$pane"); LAST_PANE=$pane
}
binding_args() { local role=$1 pane=$2 change=${3:-}; BIND=(--repo "$REPO" --product "$PRODUCT" --role "$role" --pane "$pane" --role-source-fingerprint "live-role-$role-${change:-product}" --source-fingerprint "live-source-$role-${change:-product}" --operation-cursor "live-cursor-$role-${change:-product}"); [[ -z "$change" ]] || BIND+=(--change "$change"); }
live_agent_name() { local purpose=$1 role=$2 seed=$3 tag digest; case "$role" in architect) tag=a;; coordinator) tag=c;; change_owner) tag=o;; *) return 2;; esac; digest="$(printf '%s|%s|%s' "$purpose" "$role" "$seed" | sha256sum | cut -c1-12)"; printf 'qq-live-%s-%s-%s\n' "$purpose" "$tag" "$digest"; }
start_pi() {
  local pane=$1 name=$2 receipt session=''
  receipt="$(herdr agent start "$name" --kind pi --pane "$pane" --timeout 60000 -- --approve --no-extensions --extension "$EXTENSION" --extension "$HERDR_EXTENSION")" || uncertain "Pi start uncertain in $pane"
  jq -e --arg pane "$pane" --arg workspace "$WORKSPACE" --arg tab "$ANCHOR_TAB" --arg cwd "$REPO" --arg name "$name" --arg ext "$EXTENSION" --arg herdr_ext "$HERDR_EXTENSION" '.result | select(.type=="agent_started" and .argv==["pi","--approve","--no-extensions","--extension",$ext,"--extension",$herdr_ext]) | .agent | select(.pane_id==$pane and .workspace_id==$workspace and .tab_id==$tab and (.cwd==$cwd or .foreground_cwd==$cwd) and .agent=="pi" and .name==$name and .interactive_ready==true and (.launch_pending==false or .launch_pending==null) and (.agent_session==null or (.agent_session.agent=="pi" and .agent_session.kind=="path")))' <<<"$receipt" >/dev/null || uncertain 'Pi start receipt malformed'
  for _ in $(seq 1 50); do session="$(agent_session "$pane" "$name" allow-unpersisted 2>/dev/null || true)"; [[ -n "$session" ]] && break; sleep 0.2; done
  [[ "$session" == /* && ! -L "$session" ]] || uncertain "Pi session reporter did not bind exact agent $name in $pane"; LAST_SESSION=$session; LAST_AGENT_NAME=$name
}
agent_session() { local pane=$1 name=${2:-} mode=${3:-persisted} doc session; doc="$(herdr agent get "$pane")" || return 1; session="$(jq -er --arg pane "$pane" --arg name "$name" '.result | select(.type=="agent_info") | .agent | select(.pane_id==$pane and .agent=="pi" and ($name=="" or .name==$name) and .interactive_ready==true and (.launch_pending==false or .launch_pending==null) and .agent_session.agent=="pi" and .agent_session.kind=="path") | .agent_session.value' <<<"$doc")" || return 1; [[ "$session" == /* && ! -L "$session" ]] || return 1; [[ "$mode" == allow-unpersisted || -f "$session" ]] || return 1; printf '%s\n' "$session"; }

prove_reset() {
  local role=$1 change=${2:-} pane old new="" suffix
  suffix=${change:-product}
  new_pane "$role" "$change"; pane=$LAST_PANE; binding_args "$role" "$pane" "$change"; "$ROOT/bin/qq-actor-binding" create "${BIND[@]}" >/dev/null || uncertain "binding create failed for $role"
  start_pi "$pane" "$(live_agent_name reset "$role" "$pane-$suffix")"; old=$LAST_SESSION
  herdr agent prompt "$pane" 'Isolated T-189 probe: call request_context_reset now with every safe-edge testimony boolean true. Do not use any other tool and do not modify files.' --wait --until idle --until "done" --timeout 180000 >/dev/null || uncertain "reset request did not settle for $role"
  for _ in $(seq 1 50); do new="$(agent_session "$pane" 2>/dev/null || true)"; [[ -n "$new" && "$new" != "$old" ]] && break; sleep 0.2; done
  [[ -n "$new" && "$new" != "$old" && -f "$old" && -f "$new" ]] || uncertain "old/new persisted Pi files were not both proven for $role"
  [[ "$(herdr pane current --current | jq -er '.result.pane.pane_id')" == "$FOCUS_BEFORE" ]] || uncertain "same-pane reset changed focus for $role"
  printf 'PASS reset role=%s pane=%s old_file=%s new_file=%s\n' "$role" "$pane" "$old" "$new"; close_exact "$pane"
}
prove_reset architect
prove_reset coordinator
prove_reset change_owner "$CHANGE-reset"

recovery_args() {
  local change=$1 expected=$2
  REC=(--repo "$REPO" --product "$PRODUCT" --role change_owner --change "$change" --expected-current "$expected" --workspace "$WORKSPACE" --cwd "$REPO" --role-source-fingerprint "live-role-change_owner-$change" --source-fingerprint "live-source-change_owner-$change" --operation-cursor "live-cursor-change_owner-$change")
}
make_predecessor() {
  local change=$1 persisted; new_pane change_owner "$change"; PRED=$LAST_PANE; binding_args change_owner "$PRED" "$change"; "$ROOT/bin/qq-actor-binding" create "${BIND[@]}" >/dev/null || uncertain 'recovery predecessor binding failed'; start_pi "$PRED" "$(live_agent_name recovery change_owner "$PRED-$change")"
  herdr agent prompt "$PRED" 'Persist this isolated recovery-predecessor probe turn. Reply only READY and call no tool.' --wait --until idle --until "done" --timeout 180000 >/dev/null || uncertain 'recovery predecessor persistence turn was uncertain'
  persisted="$(agent_session "$PRED" "$LAST_AGENT_NAME" 2>/dev/null || true)"; [[ -n "$persisted" && -f "$persisted" ]] || uncertain 'recovery predecessor did not persist its exact Pi session before recovery proof'
}

# Production spawn/commit: candidate acknowledgement is written by the actual
# read-only extension tool; commit reads durable facts and performs bounded
# reload/runtime acknowledgement before closing exactly the predecessor pane.
REC_CHANGE="$CHANGE-recovery"; make_predecessor "$REC_CHANGE"; recovery_args "$REC_CHANGE" "$PRED"
spawn="$("$ROOT/bin/qq-context-recover" spawn "${REC[@]}" --label live-recovery --extension-path "$EXTENSION" --herdr-extension-path "$HERDR_EXTENSION" --policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane)" || uncertain 'production recovery spawn failed'
CANDIDATE="$(jq -er '.candidate_pane_id' <<<"$spawn")"; CREATED+=("$CANDIDATE")
jq -e '.status=="ready_for_external_commit" and .durable_readiness_acknowledged and .durable_read_only and .durable_no_mutation and .no_focus' <<<"$spawn" >/dev/null || uncertain 'spawn did not prove candidate read-only readiness facts'
FORBIDDEN_TARGET="$RUN_DIR/candidate-mutation-must-not-exist"
herdr agent prompt "$CANDIDATE" "Live read-only fence probe: attempt exactly one write tool call that would create $FORBIDDEN_TARGET with text escaped. Do not call any other tool. Report if write is unavailable or mechanically refused." --wait --until idle --until "done" --until blocked --timeout 180000 >"$RUN_DIR/candidate-read-only-receipt.json" || uncertain 'candidate read-only tool probe was uncertain'
[[ ! -e "$FORBIDDEN_TARGET" ]] || uncertain 'candidate write tool escaped the mechanical read-only fence'
jq -e --arg pane "$CANDIDATE" '.result.candidate.pane_id==$pane and .result.candidate.phase=="candidate" and .result.candidate.read_only==true and .result.candidate.acknowledged==true and .result.candidate.mutated==false and .result.candidate.runtime_active==false' <<<"$("$ROOT/bin/qq-actor-binding" inspect --repo "$REPO" --product "$PRODUCT" --role change_owner --change "$REC_CHANGE")" >/dev/null || uncertain 'candidate read-only probe changed durable mutation/readiness facts'
commit="$("$ROOT/bin/qq-context-recover" commit "${REC[@]}" --candidate "$CANDIDATE" --extension-path "$EXTENSION" --herdr-extension-path "$HERDR_EXTENSION" --policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane)" || uncertain 'production recovery commit failed'
jq -e --arg pane "$CANDIDATE" '.status=="activated" and .current_pane_id==$pane and .pointer_changes==1 and .stale_predecessor_refused and .runtime_activation_acknowledged and .closed_scope=="exact_pane_only"' <<<"$commit" >/dev/null || uncertain 'commit activation/stale/exact-close proof malformed'
pane_absent "$PRED" || uncertain 'predecessor close lacks exact pane_not_found proof'; [[ "$(herdr pane current --current | jq -er '.result.pane.pane_id')" == "$FOCUS_BEFORE" ]] || uncertain 'recovery changed focus'; close_exact "$CANDIDATE"

# Explicit inactive-leftover cleanup uses the production cleanup transaction.
CLEAN_CHANGE="$CHANGE-cleanup"; make_predecessor "$CLEAN_CHANGE"; recovery_args "$CLEAN_CHANGE" "$PRED"
new_pane change_owner "$CLEAN_CHANGE"; LEFTOVER=$LAST_PANE; binding_args change_owner "$LEFTOVER" "$CLEAN_CHANGE"; "$ROOT/bin/qq-actor-binding" candidate-create "${BIND[@]}" --expected-current "$PRED" --policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane >/dev/null || uncertain 'leftover candidate setup failed'
cleanup="$("$ROOT/bin/qq-context-recover" cleanup "${REC[@]}" --candidate "$LEFTOVER")" || uncertain 'production leftover cleanup failed'; jq -e '.status=="inactive_leftover_cleaned" and .pointer_changes==0' <<<"$cleanup" >/dev/null || uncertain 'cleanup receipt malformed'; close_exact "$PRED"

# Pre-first-mutation reversal: remove only the private extension copy after a
# ready spawn so /reload cannot produce runtime activation acknowledgement.
# The production commit may reverse only if Herdr still proves the predecessor's
# persisted live Pi agent_session.value; it then closes exactly the candidate.
REV_CHANGE="$CHANGE-reverse"; cp "$ROOT/extensions/qq-context-lifecycle.ts" "$EXTENSION"; make_predecessor "$REV_CHANGE"; recovery_args "$REV_CHANGE" "$PRED"
spawn="$("$ROOT/bin/qq-context-recover" spawn "${REC[@]}" --label live-reverse --extension-path "$EXTENSION" --herdr-extension-path "$HERDR_EXTENSION" --policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane)" || uncertain 'reverse-case spawn failed'; REV_CANDIDATE="$(jq -er '.candidate_pane_id' <<<"$spawn")"; CREATED+=("$REV_CANDIDATE")
# Keep the exact path present for transaction validation but replace the private
# copy with an inert module. The already-loaded old runtime accepts the private
# command; /reload cannot write the new-runtime acknowledgement.
printf 'export default function () {}\n' >"$EXTENSION"
set +e; reverse_output="$("$ROOT/bin/qq-context-recover" commit "${REC[@]}" --candidate "$REV_CANDIDATE" --extension-path "$EXTENSION" --herdr-extension-path "$HERDR_EXTENSION" --policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane 2>&1)"; reverse_status=$?; set -e
[[ "$reverse_status" -eq 1 ]] || uncertain "reverse fault did not report activation failure: $reverse_output"
jq -e --arg pred "$PRED" '.result.current.pane_id==$pred and .result.candidate==null' <<<"$("$ROOT/bin/qq-actor-binding" inspect --repo "$REPO" --product "$PRODUCT" --role change_owner --change "$REV_CHANGE")" >/dev/null || uncertain 'activation failure did not exact-reverse to live predecessor'
pane_absent "$REV_CANDIDATE" || uncertain 'reversed candidate close lacks exact pane_not_found proof'
close_exact "$PRED"

[[ "$(herdr pane current --current | jq -er '.result.pane.pane_id')" == "$FOCUS_BEFORE" ]] || uncertain 'probe changed focus'
POST_PANES="$(herdr pane list --workspace "$WORKSPACE")" || uncertain 'post-run pane list is unavailable'; printf '%s\n' "$POST_PANES" >"$RUN_DIR/post-panes.json"
jq -e '.result.type == "pane_list" and ([.result.panes[].pane_id] | length == (unique|length))' <<<"$POST_PANES" >/dev/null || uncertain 'post-run pane evidence is malformed or ambiguous'
for pane in "${CREATED[@]}"; do
  [[ "$pane" == "$OWNER_PANE" || "$pane" == "$ANCHOR" ]] && uncertain 'created set contains protected pane'
  jq -e --arg pane "$pane" '[.result.panes[].pane_id] | index($pane) == null' <<<"$POST_PANES" >/dev/null || uncertain "probe-created pane leaked: $pane"
done
printf 'qq-context-live-herdr: PASS exact persisted resets, production spawn/commit/cleanup, one pointer change, stale refusal, activation, no focus theft/reuse/tab close/pane leak; evidence=%s\n' "$RUN_DIR"
