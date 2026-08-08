#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-actor-binding"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"; ENGINE="$ROOT/bin/qq-actor-binding"; RECOVERY="$ROOT/bin/qq-context-recover"
[ -x "$RECOVERY" ] || fail 'missing unavailable-pane recovery transaction'; bash -n "$RECOVERY"
for contract in 'pane split' '--no-focus' 'agent start' 'agent prompt' 'acknowledged == true' 'swap' 'stale predecessor' 'activation acknowledgement' 'reverse' 'pane close' 'cleanup-claim'; do assert_file_contains "$RECOVERY" "$contract" "recovery transaction lost contract: $contract"; done
assert_file_not_matches "$RECOVERY" 'tab (create|close)' 'recovery can create or close a whole tab'
assert_file_not_matches "$RECOVERY" 'readiness-acknowledged\) READY|candidate-no-mutation-observed\) NO' 'commit still trusts caller readiness booleans'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
mkdir -p "$TMP/repo" "$TMP/store/products" "$TMP/store/qq" "$TMP/resource" "$TMP/state-home"
export XDG_STATE_HOME="$TMP/state-home"; BINDING_ROOT="$XDG_STATE_HOME/qq/actor-bindings"; ln -s "$TMP/store/qq" "$TMP/repo/backlog"
cat >"$TMP/store/products/qq.yaml" <<EOF
schema_version: 1
id: qq
task_collections:
  - qq
resource_roots:
  - $TMP/resource
EOF
base=(--repo "$TMP/repo" --product qq --role change_owner --change T-189); fences=(--role-source-fingerprint role-a --source-fingerprint source-a --operation-cursor cursor-a); authority=(--policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane)
run() { "$ENGINE" "$@"; }
refuse() { local output status; set +e; output="$("$ENGINE" "$@")"; status=$?; set -e; [ "$status" -eq 2 ] || fail "expected refusal, got $status: $output"; jq -e '.ok == false and .error.code == "refused"' <<<"$output" >/dev/null || fail "malformed refusal: $output"; printf '%s' "$output"; }

refuse inspect "${base[@]}" >/dev/null
[ ! -e "$BINDING_ROOT" ] || fail 'absent binding inspection created the binding namespace'
created="$(run create "${base[@]}" --pane w:p1 "${fences[@]}")"
jq -e '.result.current.pane_id == "w:p1" and .result.current.read_only == false and .result.current.runtime_active == true and .result.current.activation_nonce == null and .result.candidate == null' <<<"$created" >/dev/null
path="$(run path "${base[@]}" | jq -r .result.path)"; [ "$(stat -c %a "$BINDING_ROOT")" = 700 ] || fail 'binding namespace mode'; [ "$(stat -c %a "$path")" = 600 ] || fail 'record mode'
run candidate-create "${base[@]}" --expected-current w:p1 --pane w:p2 "${fences[@]}" "${authority[@]}" >/dev/null
jq -e '.result.state == "candidate"' <<<"$(run classify "${base[@]}" --pane w:p2 "${fences[@]}")" >/dev/null
refuse guard "${base[@]}" --pane w:p2 "${fences[@]}" --mutation >/dev/null
refuse candidate-ready "${base[@]}" --expected-current w:p1 --pane w:p2 --role-source-fingerprint role-a --source-fingerprint changed --operation-cursor cursor-a >/dev/null
run candidate-ready "${base[@]}" --expected-current w:p1 --pane w:p2 "${fences[@]}" >/dev/null
refuse swap "${base[@]}" --expected-current w:p1 --pane w:p2 >/dev/null
swapped="$(run swap "${base[@]}" --expected-current w:p1 --pane w:p2 --activation-nonce nonce-a)"
jq -e '.result.current.pane_id == "w:p2" and .result.current.read_only == true and .result.current.runtime_active == false and .result.current.activation_nonce == "nonce-a" and .result.candidate.pane_id == "w:p1" and .result.candidate.phase == "predecessor"' <<<"$swapped" >/dev/null
assert_contains "$(refuse guard "${base[@]}" --pane w:p1 "${fences[@]}" --acknowledgement)" 'stale pane refused'
# The activating current has not acknowledged/mutated, so exact live reversal is allowed.
run reverse "${base[@]}" --expected-current w:p2 --predecessor w:p1 --predecessor-live >/dev/null
jq -e '.result.current.pane_id == "w:p1" and .result.current.runtime_active and .result.candidate == null' <<<"$(run inspect "${base[@]}")" >/dev/null

run candidate-create "${base[@]}" --expected-current w:p1 --pane w:p2 "${fences[@]}" "${authority[@]}" >/dev/null
run candidate-ready "${base[@]}" --expected-current w:p1 --pane w:p2 "${fences[@]}" >/dev/null
run swap "${base[@]}" --expected-current w:p1 --pane w:p2 --activation-nonce nonce-b >/dev/null
refuse guard "${base[@]}" --pane w:p2 "${fences[@]}" --mutation >/dev/null
run runtime-activate "${base[@]}" --pane w:p2 "${fences[@]}" --activation-nonce nonce-b >/dev/null
run guard "${base[@]}" --pane w:p2 "${fences[@]}" --mutation >/dev/null
refuse reverse "${base[@]}" --expected-current w:p2 --predecessor w:p1 --predecessor-live >/dev/null
run finalize "${base[@]}" --pane w:p2 >/dev/null
jq -e '.result.current.pane_id == "w:p2" and .result.current.mutated and .result.current.runtime_active and .result.candidate == null' <<<"$(run inspect "${base[@]}")" >/dev/null

# Cleanup is a two-phase exact claim so a close failure cannot silently lose the slot.
base2=(--repo "$TMP/repo" --product qq --role coordinator)
run create "${base2[@]}" --pane w:c1 "${fences[@]}" >/dev/null; run candidate-create "${base2[@]}" --expected-current w:c1 --pane w:c2 "${fences[@]}" "${authority[@]}" >/dev/null
refuse cleanup-claim "${base2[@]}" --expected-current w:other --pane w:c2 >/dev/null
run cleanup-claim "${base2[@]}" --expected-current w:c1 --pane w:c2 >/dev/null; jq -e '.result.candidate.phase == "cleanup"' <<<"$(run inspect "${base2[@]}")" >/dev/null
run cleanup-finalize "${base2[@]}" --expected-current w:c1 --pane w:c2 >/dev/null; jq -e '.result.current.pane_id == "w:c1" and .result.candidate == null' <<<"$(run inspect "${base2[@]}")" >/dev/null

# Exact identity and namespace uniqueness.
refuse create --repo "$TMP/repo" --product qq --role architect --change T-1 --pane w:a1 "${fences[@]}" >/dev/null
refuse create --repo "$TMP/repo" --product qq --role change_owner --pane w:x1 "${fences[@]}" >/dev/null
refuse create --repo "$TMP/repo" --product qq --role architect --pane w:p2 "${fences[@]}" >/dev/null

# Production recovery engine with deterministic Herdr receipts/resources.
FAKE="$TMP/fake"; mkdir -p "$FAKE"; LOG="$TMP/herdr.log"; : >"$LOG"
cat >"$FAKE/herdr" <<'PY'
#!/usr/bin/env python3
import hashlib, json, os, pathlib, subprocess, sys
args=sys.argv[1:]; log=pathlib.Path(os.environ['FAKE_LOG']); log.write_text(log.read_text()+" ".join(args)+"\n")
state=pathlib.Path(os.environ['FAKE_STATE']); state.mkdir(exist_ok=True)
scenario=os.environ.get('SCENARIO','ok'); expected='w:pPred'; candidate='w:pCandidate'; workspace='w'; tab='w:tRole'; cwd=os.environ['FAKE_CWD']; focus='w:pFocus'
def emit(result): print(json.dumps({'result':result},separators=(',',':')))
def refuse(code): print(json.dumps({'error':{'code':code,'message':code}},separators=(',',':')))
def session(pane): return str(state/f'{pane.replace(":","-")}.jsonl')
def recovery_name(pane): return f'qq-recovery-o-{hashlib.sha256(f"change_owner|{pane}".encode()).hexdigest()[:16]}'
def pane(p, focused=False):
    ws=workspace; tb=tab; cd=cwd
    if p==expected and scenario=='focused-predecessor': focused=True
    if p==candidate:
      if scenario=='wrong-workspace': ws='wrong'
      if scenario=='wrong-tab': tb='w:tWrong'
      if scenario=='wrong-cwd': cd=str(pathlib.Path(os.environ['FAKE_REPO']).parent)
      if scenario=='focused': focused=True
    return {'pane_id':p,'terminal_id':'term','workspace_id':ws,'tab_id':tb,'focused':focused,'agent_status':'idle','revision':1,'cwd':cd,'foreground_cwd':cd,'agent':None,'agent_session':None}
def agent(p,name=None,live=True):
    launch_pending=None if live and os.environ.get('NULL_LAUNCH_PENDING','0')=='1' else False
    d={'terminal_id':'term','agent_status':'idle','workspace_id':workspace,'tab_id':tab,'pane_id':p,'focused':False,'revision':1,'cwd':cwd,'foreground_cwd':cwd,'interactive_ready':live,'launch_pending':launch_pending,'screen_detection_skipped':False,'agent':'pi' if live else None,'agent_session':{'agent':'pi','kind':'path','source':'pi','value':session(p)} if live else None,'name':name}
    return d
key=args[:2]
if key==['pane','current']: emit({'type':'pane_current','pane':pane(focus,True)}); raise SystemExit
if key==['pane','list']: emit({'type':'pane_list','panes':[pane(expected),pane(focus,True)]}); raise SystemExit
if key==['pane','get']:
    p=args[2]
    if (state/f'closed-{p}').exists():
      if scenario=='close-get-transport': raise SystemExit(1)
      if scenario=='close-get-malformed': print('{}'); raise SystemExit(1)
      refuse('pane_not_found'); raise SystemExit(1)
    focused=p==focus
    if p==expected and scenario=='focused-predecessor-recheck':
      counter=state/'pred-get-count'; count=int(counter.read_text())+1 if counter.exists() else 1; counter.write_text(str(count)); focused=count>=2
    emit({'type':'pane_info','pane':pane(p,focused)}); raise SystemExit
if key==['pane','split']:
    if scenario=='malformed-split': print('{}'); raise SystemExit
    p=expected if scenario=='reuse' else candidate; emit({'type':'pane_info','pane':pane(p,scenario=='focused')}); raise SystemExit
if key==['pane','close']:
    (state/f'closed-{args[2]}').touch(); emit({'type':'ok'}); raise SystemExit
if key==['agent','start']:
    p=args[args.index('--pane')+1]; name=args[2]
    if scenario in ('start-fail-no-agent','start-fail-uncertain'): raise SystemExit(1)
    pathlib.Path(session(p)).write_text('{"type":"session"}\n')
    argv=['pi']+args[args.index('--')+1:]
    if scenario=='reversed-extension-receipt' and argv==['pi','--approve','--no-extensions','--extension',os.environ['LIFECYCLE_EXT'],'--extension',os.environ['HERDR_EXT']]: argv=['pi','--approve','--no-extensions','--extension',os.environ['HERDR_EXT'],'--extension',os.environ['LIFECYCLE_EXT']]
    started_agent=agent(p,name)
    if scenario=='async-session-report': started_agent['agent_session']=None
    emit({'type':'agent_started','agent':started_agent,'argv':argv}); raise SystemExit
if key==['agent','get']:
    p=args[2]
    if scenario=='start-fail-no-agent': emit({'type':'agent_info','agent':agent(p,None,False)}); raise SystemExit
    live=not (p==expected and os.environ.get('PRED_LIVE','1')!='1')
    if live: pathlib.Path(session(p)).touch()
    observed_name=recovery_name(p) if p==candidate else None
    emit({'type':'agent_info','agent':agent(p,observed_name,live)}); raise SystemExit
if key==['agent','prompt']:
    p=args[2]; text=args[3]; pathlib.Path(session(p)).touch()
    if text.startswith('Read-only'):
      cmd=[os.environ['FAKE_ENGINE'],'candidate-ready','--repo',os.environ['FAKE_REPO'],'--product','qq','--role','change_owner','--change',os.environ['FAKE_CHANGE'],'--expected-current',expected,'--pane',candidate,'--role-source-fingerprint','role-a','--source-fingerprint','source-a','--operation-cursor','cursor-a']
      subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL)
    elif text.startswith('/qq-context-activate') and os.environ.get('ACTIVATE_FAIL','0')!='1':
      nonce=text.split()[1]
      cmd=[os.environ['FAKE_ENGINE'],'runtime-activate','--repo',os.environ['FAKE_REPO'],'--product','qq','--role','change_owner','--change',os.environ['FAKE_CHANGE'],'--pane',candidate,'--role-source-fingerprint','role-a','--source-fingerprint','source-a','--operation-cursor','cursor-a','--activation-nonce',nonce]
      subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL)
    emit({'type':'agent_prompted','agent':agent(p,recovery_name(p))}); raise SystemExit
raise SystemExit(99)
PY
chmod +x "$FAKE/herdr"
export PATH="$FAKE:$PATH" FAKE_LOG="$LOG" FAKE_STATE="$TMP/herdr-state" FAKE_CWD="$TMP/repo" FAKE_REPO="$TMP/repo" FAKE_ENGINE="$ENGINE" FAKE_CHANGE=T-Recover
recovery_base=(--repo "$TMP/repo" --product qq --role change_owner --change T-Recover --expected-current w:pPred --workspace w --cwd "$TMP/repo" "${fences[@]}")
recovery_auth=(--policy-proved-unavailable --continuation-required --recovery-reason unavailable-pane)
LIFECYCLE_EXT="$TMP/lifecycle.ts"; HERDR_EXT="$TMP/herdr-agent-state.ts"; export LIFECYCLE_EXT HERDR_EXT; printf 'export default function() {}\n' >"$LIFECYCLE_EXT"; printf 'export default function() {}\n' >"$HERDR_EXT"
explicit_extensions=(--extension-path "$LIFECYCLE_EXT" --herdr-extension-path "$HERDR_EXT")
AUTHORITY_FIXTURE="$TMP/exact-authority.txt"; printf 'exact recovery authority\n' >"$AUTHORITY_FIXTURE"; AUTHORITY_SHA="$(sha256sum "$AUTHORITY_FIXTURE" | cut -d' ' -f1)"; QQ_CONTEXT_AUTHORITIES="$(jq -cn --arg path "$AUTHORITY_FIXTURE" --arg sha "$AUTHORITY_SHA" '[{name:"task",path:$path,sha256:$sha}]')"; export QQ_CONTEXT_AUTHORITIES
reset_recovery() { rm -rf "$FAKE_STATE" "$BINDING_ROOT"; mkdir -p "$FAKE_STATE" "$BINDING_ROOT"; chmod 700 "$FAKE_STATE" "$BINDING_ROOT"; : >"$LOG"; SCENARIO=ok; export SCENARIO; PRED_LIVE=1; export PRED_LIVE; ACTIVATE_FAIL=0; export ACTIVATE_FAIL; NULL_LAUNCH_PENDING=0; export NULL_LAUNCH_PENDING; run create --repo "$TMP/repo" --product qq --role change_owner --change T-Recover --pane w:pPred "${fences[@]}" >/dev/null; }
recover_status() { local out status; set +e; out="$($RECOVERY "$@")"; status=$?; set -e; printf '%s\n%s' "$status" "$out"; }

reset_recovery
spawn="$($RECOVERY spawn "${recovery_base[@]}" --label recovery "${explicit_extensions[@]}" "${recovery_auth[@]}")"; jq -e '.status == "ready_for_external_commit" and .durable_readiness_acknowledged and .candidate_pane_id == "w:pCandidate"' <<<"$spawn" >/dev/null
commit="$($RECOVERY commit "${recovery_base[@]}" --candidate w:pCandidate "${explicit_extensions[@]}" "${recovery_auth[@]}")"; jq -e '.status == "activated" and .closed_scope == "exact_pane_only" and .pointer_changes == 1' <<<"$commit" >/dev/null
grep -F -- "-- --approve --no-extensions --extension $LIFECYCLE_EXT --extension $HERDR_EXT" "$LOG" >/dev/null || fail 'candidate argv omitted one explicit lifecycle/Herdr extension path'
grep -F -- "QQ_CONTEXT_AUTHORITIES=$QQ_CONTEXT_AUTHORITIES" "$LOG" >/dev/null || fail 'validated authority allowlist was not passed to the candidate pane'
grep -F -- "QQ_ACTOR_BINDING_BIN=$ENGINE" "$LOG" >/dev/null || fail 'candidate pane did not receive the exact pre-merge actor-binding executable'
grep -Fxq 'pane close w:pPred' "$LOG" || fail 'commit did not close exact predecessor pane'; assert_file_not_matches "$LOG" '^tab (close|create)' 'recovery touched a whole tab'

expect_spawn_refusal_without_split() {
  local label=$1; shift; reset_recovery
  set +e; "$RECOVERY" spawn "${recovery_base[@]}" --label "$label" "$@" "${recovery_auth[@]}" >/dev/null; status=$?; set -e
  [[ "$status" -eq 2 ]] || fail "$label did not refuse malformed explicit integration: $status"
  assert_file_not_matches "$LOG" '^pane split ' "$label split a pane before refusing"
}
expect_spawn_refusal_without_split lifecycle-only --extension-path "$LIFECYCLE_EXT"
expect_spawn_refusal_without_split herdr-only --herdr-extension-path "$HERDR_EXT"
expect_spawn_refusal_without_split same-extension --extension-path "$LIFECYCLE_EXT" --herdr-extension-path "$LIFECYCLE_EXT"
expect_spawn_refusal_without_split missing-extension --extension-path "$TMP/missing-lifecycle.ts" --herdr-extension-path "$HERDR_EXT"
ln -s "$LIFECYCLE_EXT" "$TMP/lifecycle-link.ts"
expect_spawn_refusal_without_split symlink-extension --extension-path "$TMP/lifecycle-link.ts" --herdr-extension-path "$HERDR_EXT"
reset_recovery; set +e; QQ_CONTEXT_AUTHORITIES='not-json' "$RECOVERY" spawn "${recovery_base[@]}" --label malformed-authority "${recovery_auth[@]}" >/dev/null 2>&1; status=$?; set -e; [[ "$status" -eq 2 ]] || fail 'malformed QQ_CONTEXT_AUTHORITIES did not refuse'; assert_file_not_matches "$LOG" '^pane split ' 'malformed authority split a pane'
reset_recovery; SCENARIO=reversed-extension-receipt; export SCENARIO
"$RECOVERY" spawn "${recovery_base[@]}" --label reversed-explicit "${explicit_extensions[@]}" "${recovery_auth[@]}" >/dev/null || fail 'exact argv validation depended on one extension being the first occurrence'
reset_recovery; SCENARIO=async-session-report; export SCENARIO
"$RECOVERY" spawn "${recovery_base[@]}" --label async-session "${explicit_extensions[@]}" "${recovery_auth[@]}" >/dev/null || fail 'asynchronous Herdr Pi session report was not polled after a valid start receipt'

# Focused predecessors refuse before any split/swap/close. Commit rechecks the
# same no-focus fact immediately before its pointer CAS.
reset_recovery; SCENARIO=focused-predecessor; export SCENARIO
set +e; "$RECOVERY" spawn "${recovery_base[@]}" --label focused-pred "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 2 ]] || fail 'focused predecessor spawn did not refuse'
assert_file_not_matches "$LOG" '^(pane split|pane close) ' 'focused predecessor spawn changed pane resources'; jq -e '.result.current.pane_id=="w:pPred" and .result.candidate==null' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null
reset_recovery; "$RECOVERY" spawn "${recovery_base[@]}" --label commit-focus "${recovery_auth[@]}" >/dev/null; : >"$LOG"; SCENARIO=focused-predecessor-recheck; export SCENARIO
set +e; "$RECOVERY" commit "${recovery_base[@]}" --candidate w:pCandidate "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 2 ]] || fail 'focused predecessor commit did not refuse'
assert_file_not_matches "$LOG" '^(pane split|pane close) ' 'focused predecessor commit changed pane resources'; jq -e '.result.current.pane_id=="w:pPred" and .result.candidate.pane_id=="w:pCandidate" and .result.candidate.phase=="candidate"' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null

# Wrong resource/receipt/reuse/focus evidence is refused or preserved, never
# cleaned by a whole-tab operation.
for scenario in wrong-workspace wrong-tab wrong-cwd focused reuse malformed-split; do
  reset_recovery; SCENARIO=$scenario; export SCENARIO
  set +e; "$RECOVERY" spawn "${recovery_base[@]}" --label bad "${recovery_auth[@]}" >/dev/null; status=$?; set -e
  [[ "$status" -ne 0 ]] || fail "$scenario unexpectedly spawned"
  assert_file_not_matches "$LOG" '^tab (close|create)' "$scenario touched a tab"
done

# Installed Herdr may report null when no launch remains pending; all other
# ready Pi identity/session/cwd evidence remains exact.
reset_recovery; NULL_LAUNCH_PENDING=1; export NULL_LAUNCH_PENDING
"$RECOVERY" spawn "${recovery_base[@]}" --label nullable-launch "${recovery_auth[@]}" >/dev/null
"$RECOVERY" commit "${recovery_base[@]}" --candidate w:pCandidate "${recovery_auth[@]}" >/dev/null
jq -e '.result.current.pane_id=="w:pCandidate" and .result.candidate==null' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null

# A proven pre-agent startup failure cleans only candidate pane+slot; uncertain
# startup preserves both for inspection.
reset_recovery; SCENARIO=start-fail-no-agent; export SCENARIO
set +e; "$RECOVERY" spawn "${recovery_base[@]}" --label pre-agent "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'proven startup failure status'
jq -e '.result.current.pane_id == "w:pPred" and .result.candidate == null' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null; grep -Fxq 'pane close w:pCandidate' "$LOG" || fail 'proven candidate cleanup missing'
reset_recovery; SCENARIO=start-fail-uncertain; export SCENARIO
set +e; "$RECOVERY" spawn "${recovery_base[@]}" --label uncertain "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'uncertain startup status'; jq -e '.result.candidate.pane_id == "w:pCandidate"' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null

# Explicit restart cleanup requires exact inactive/unacknowledged/unmutated facts.
reset_recovery; run candidate-create --repo "$TMP/repo" --product qq --role change_owner --change T-Recover --expected-current w:pPred --pane w:pCandidate "${fences[@]}" "${authority[@]}" >/dev/null
cleanup="$($RECOVERY cleanup "${recovery_base[@]}" --candidate w:pCandidate)"; jq -e '.status == "inactive_leftover_cleaned" and .pointer_changes == 0' <<<"$cleanup" >/dev/null

# Only the exact pane_not_found refusal proves absence. Transport/malformed get
# failures retain predecessor/candidate slots, so finalize never guesses.
reset_recovery; "$RECOVERY" spawn "${recovery_base[@]}" --label close-transport "${recovery_auth[@]}" >/dev/null; SCENARIO=close-get-transport; export SCENARIO
set +e; "$RECOVERY" commit "${recovery_base[@]}" --candidate w:pCandidate "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'transport uncertainty after predecessor close did not stop commit'
jq -e '.result.current.pane_id=="w:pCandidate" and .result.current.runtime_active==true and .result.candidate.pane_id=="w:pPred" and .result.candidate.phase=="predecessor"' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null || fail 'finalize cleared predecessor evidence under transport uncertainty'
reset_recovery; run candidate-create --repo "$TMP/repo" --product qq --role change_owner --change T-Recover --expected-current w:pPred --pane w:pCandidate "${fences[@]}" "${authority[@]}" >/dev/null; SCENARIO=close-get-malformed; export SCENARIO
set +e; "$RECOVERY" cleanup "${recovery_base[@]}" --candidate w:pCandidate >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'malformed absence evidence did not stop cleanup'
jq -e '.result.current.pane_id=="w:pPred" and .result.candidate.pane_id=="w:pCandidate" and .result.candidate.phase=="cleanup"' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null || fail 'cleanup-finalize cleared candidate evidence under malformed uncertainty'

# Activation failure reverses only to an exact persisted live Pi predecessor.
reset_recovery; "$RECOVERY" spawn "${recovery_base[@]}" --label reverse-live "${recovery_auth[@]}" >/dev/null; ACTIVATE_FAIL=1; export ACTIVATE_FAIL
set +e; "$RECOVERY" commit "${recovery_base[@]}" --candidate w:pCandidate "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'live reversal did not report activation failure'; jq -e '.result.current.pane_id == "w:pPred" and .result.candidate == null' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null; grep -Fxq 'pane close w:pCandidate' "$LOG" || fail 'reversed candidate pane not closed'
reset_recovery; "$RECOVERY" spawn "${recovery_base[@]}" --label reverse-shell "${recovery_auth[@]}" >/dev/null; ACTIVATE_FAIL=1; PRED_LIVE=0; export ACTIVATE_FAIL PRED_LIVE
set +e; "$RECOVERY" commit "${recovery_base[@]}" --candidate w:pCandidate "${recovery_auth[@]}" >/dev/null; status=$?; set -e; [[ "$status" -eq 1 ]] || fail 'shell predecessor activation failure status'; jq -e '.result.current.pane_id == "w:pCandidate" and .result.current.runtime_active == false and .result.candidate.pane_id == "w:pPred"' <<<"$(run inspect --repo "$TMP/repo" --product qq --role change_owner --change T-Recover)" >/dev/null

printf 'test-qq-actor-binding: pass\n'
