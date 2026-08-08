#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-accountable-evidence"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
ENGINE="$ROOT/bin/qq-accountable-evidence"
MODULE="$ROOT/bin/lib/qq_accountable_evidence.py"
[ -x "$ENGINE" ] || fail 'missing accountable binding-to-pane evidence command'
[ -f "$MODULE" ] || fail 'missing accountable evidence module'
bash -n "$ENGINE"
python3 - "$MODULE" <<'PY'
from pathlib import Path
import sys
compile(Path(sys.argv[1]).read_bytes(), sys.argv[1], "exec")
PY

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
REPO="$TMP/repo"; mkdir -p "$REPO"
VALID_CWD="$TMP/location-current"; VALID_FOREGROUND="$TMP/location-foreground"
UNICODE_CWD="$TMP/location-élan"; FILE_LOCATION="$TMP/not-a-directory"
mkdir -p "$VALID_CWD" "$VALID_FOREGROUND" "$UNICODE_CWD" "$TMP/fakes" "$TMP/home" "$TMP/state" "$TMP/cache"
printf 'not a directory\n' >"$FILE_LOCATION"
MISSING_LOCATION="$TMP/location-missing"
TRACE="$TMP/calls.log"; OUT="$TMP/stdout"; ERR="$TMP/stderr"
: >"$TRACE"

BINDING_FAKE="$TMP/fakes/qq-actor-binding"
cat >"$BINDING_FAKE" <<'PY'
#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
role = os.environ["EXPECT_ROLE"]
expected = ["inspect", "--repo", os.environ["TEST_REPO"], "--product", "qq", "--role", role]
change = os.environ.get("EXPECT_CHANGE") or None
if change:
    expected += ["--change", change]
with open(os.environ["CALL_TRACE"], "a", encoding="utf-8") as stream:
    stream.write("binding " + json.dumps(args, separators=(",", ":")) + "\n")
if args != expected:
    print(json.dumps({"fake_error": "unapproved binding argv", "argv": args}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(97)

def source():
    return {
        "role_source_fingerprint": "role-a",
        "source_fingerprint": "source-a",
        "operation_cursor": "cursor-a",
    }

def endpoint(pane):
    return {
        "pane_id": pane,
        "source": source(),
        "read_only": False,
        "acknowledged": True,
        "mutated": False,
        "runtime_active": True,
        "activation_nonce": None,
    }

identity = {"product": "qq", "role": role, "change": change}
current = endpoint("w:pCurrent")
candidate = None
if os.environ.get("BINDING_CANDIDATE", "0") == "1":
    candidate = endpoint("w:pCandidate")
    candidate.update({
        "expected_current_pane_id": "w:pCurrent",
        "phase": "candidate",
        "read_only": True,
        "acknowledged": False,
        "runtime_active": False,
    })
record = {
    "schema": "qq.actor-binding/v1",
    "version": 1,
    "identity": identity,
    "current": current,
    "candidate": candidate,
}
document = {"ok": True, "schema": "qq.actor-binding/v1", "result": record}
scenario = os.environ.get("BINDING_SCENARIO", "ok")
if scenario == "failure":
    print(json.dumps({"ok": False, "schema": "qq.actor-binding/v1", "error": {"code": "refused", "message": "binding unavailable"}}, separators=(",", ":")))
    raise SystemExit(2)
if scenario == "malformed":
    sys.stdout.write("{not-json\n")
    raise SystemExit
if scenario == "duplicate":
    sys.stdout.write('{"ok":true,"ok":true,"schema":"qq.actor-binding/v1","result":{}}\n')
    raise SystemExit
if scenario == "oversized":
    os.write(sys.stdout.fileno(), b"{" + (b"x" * (300 * 1024)) + b"}\n")
    raise SystemExit
if scenario == "utf8":
    os.write(sys.stdout.fileno(), b'{"ok":true,"bad":"\xff"}\n')
    raise SystemExit
if scenario == "nonfinite":
    raw = json.dumps(document, separators=(",", ":")).replace('"cursor-a"', "NaN", 1)
    sys.stdout.write(raw + "\n")
    raise SystemExit
if scenario == "identity":
    document["result"]["identity"]["product"] = "other"
if scenario == "endpoint-shape":
    document["result"]["current"]["unexpected"] = True
if scenario == "stderr":
    print("binding warning", file=sys.stderr)
print(json.dumps(document, separators=(",", ":"), ensure_ascii=True))
PY
chmod +x "$BINDING_FAKE"

HERDR_FAKE="$TMP/fakes/herdr"
cat >"$HERDR_FAKE" <<'PY'
#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
with open(os.environ["CALL_TRACE"], "a", encoding="utf-8") as stream:
    stream.write("herdr " + json.dumps(args, separators=(",", ":")) + "\n")
if len(args) != 3 or args[:2] != ["pane", "get"] or args[2] not in ("w:pCurrent", "w:pCandidate"):
    print(json.dumps({"fake_error": "unapproved Herdr argv", "argv": args}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(97)
pane_id = args[2]
slot = "CURRENT" if pane_id == "w:pCurrent" else "CANDIDATE"
scenario = os.environ.get(f"PANE_{slot}_SCENARIO", "present")
if scenario == "absent":
    print(json.dumps({"error": {"code": "pane_not_found", "message": f"pane {pane_id} does not exist"}, "id": "cli:pane:get"}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(1)
if scenario == "absence-extra":
    print(json.dumps({"error": {"code": "pane_not_found", "message": "missing", "extra": True}, "id": "cli:pane:get"}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(1)
if scenario == "failure":
    print(json.dumps({"error": {"code": "transport_failed", "message": "unavailable"}, "id": "cli:pane:get"}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(2)
if scenario == "mixed-absence":
    print("unexpected stdout")
    print(json.dumps({"error": {"code": "pane_not_found", "message": "missing"}, "id": "cli:pane:get"}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(1)
if scenario == "malformed":
    sys.stdout.write("[not-json\n")
    raise SystemExit
if scenario == "duplicate":
    sys.stdout.write('{"result":{"type":"pane_info","type":"pane_info","pane":{}}}\n')
    raise SystemExit
if scenario == "oversized":
    os.write(sys.stdout.fileno(), b"{" + (b"y" * (300 * 1024)) + b"}\n")
    raise SystemExit
if scenario == "utf8":
    os.write(sys.stdout.fileno(), b'{"result":{"type":"pane_info","pane":{"cwd":"\xff"}}}\n')
    raise SystemExit

pane = {
    "pane_id": pane_id,
    "terminal_id": "term-current" if slot == "CURRENT" else "term-candidate",
    "workspace_id": "w",
    "tab_id": "w:tAccountable",
    "cwd": os.environ["VALID_CWD"],
    "foreground_cwd": os.environ["VALID_FOREGROUND"],
    "focused": True,
    "revision": 99,
    "agent": "pi",
    "agent_status": "idle",
    "title": "must not escape",
}
if scenario == "omitted":
    pane.pop("cwd"); pane.pop("foreground_cwd")
elif scenario == "cwd-only":
    pane.pop("foreground_cwd")
elif scenario == "foreground-only":
    pane.pop("cwd")
elif scenario == "unicode-cwd":
    pane["cwd"] = os.environ["UNICODE_CWD"]
elif scenario == "wrong-pane":
    pane["pane_id"] = "w:pOther"
elif scenario == "missing-terminal":
    pane.pop("terminal_id")
elif scenario == "nonstring-workspace":
    pane["workspace_id"] = 7
elif scenario == "wrong-type":
    pass
elif scenario.startswith("cwd-"):
    kind = scenario[4:]
    pane["cwd"] = {
        "null": None,
        "number": 7,
        "relative": "relative/location",
        "missing": os.environ["MISSING_LOCATION"],
        "nul": os.environ["VALID_CWD"] + "\x00suffix",
        "surrogate": "\ud800",
        "file": os.environ["FILE_LOCATION"],
    }[kind]
elif scenario.startswith("foreground-"):
    kind = scenario[len("foreground-"):]
    pane["foreground_cwd"] = {
        "null": None,
        "number": 7,
        "relative": "relative/location",
        "missing": os.environ["MISSING_LOCATION"],
        "nul": os.environ["VALID_FOREGROUND"] + "\x00suffix",
        "surrogate": "\udfff",
        "file": os.environ["FILE_LOCATION"],
    }[kind]
result = {"type": "pane_info", "pane": pane}
document = {"id": "cli:pane:get", "result": result}
if scenario == "wrong-type":
    result["type"] = "pane_list"
if scenario == "receipt-missing":
    document.pop("id")
elif scenario == "receipt-wrong":
    document["id"] = "cli:pane:list"
elif scenario == "receipt-extra":
    document["extra"] = True
elif scenario == "receipt-duplicate":
    sys.stdout.write('{"id":"cli:pane:get","id":"cli:pane:get","result":' + json.dumps(result, separators=(",", ":"), ensure_ascii=True) + '}\n')
    raise SystemExit
elif scenario == "receipt-malformed":
    document["id"] = "cli:pane:get\x00"
elif scenario == "receipt-wrong-type":
    document["id"] = 7
if scenario == "nonfinite":
    sys.stdout.write(json.dumps(document, separators=(",", ":")).replace('"revision":99', '"revision":NaN') + "\n")
    raise SystemExit
if scenario == "overflow":
    sys.stdout.write(json.dumps(document, separators=(",", ":")).replace('"revision":99', '"revision":1e999') + "\n")
    raise SystemExit
if scenario == "stderr-success":
    print("Herdr warning", file=sys.stderr)
print(json.dumps(document, separators=(",", ":"), ensure_ascii=True))
PY
chmod +x "$HERDR_FAKE"

export QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN="$BINDING_FAKE"
export QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN="$HERDR_FAKE"
export CALL_TRACE="$TRACE" TEST_REPO="$REPO" VALID_CWD VALID_FOREGROUND UNICODE_CWD FILE_LOCATION MISSING_LOCATION
export HOME="$TMP/home" XDG_STATE_HOME="$TMP/state" XDG_CACHE_HOME="$TMP/cache" PYTHONDONTWRITEBYTECODE=1
export EXPECT_ROLE=change_owner EXPECT_CHANGE=T-214.2 BINDING_SCENARIO=ok BINDING_CANDIDATE=0
export PANE_CURRENT_SCENARIO=present PANE_CANDIDATE_SCENARIO=present
base=(--repo "$REPO" --product qq --role change_owner --change T-214.2)

invoke() {
  : >"$OUT"; : >"$ERR"
  set +e
  "$ENGINE" "$@" >"$OUT" 2>"$ERR"
  STATUS=$?
  set -e
}
assert_output_contract() {
  local expected_status=$1
  assert_equal "$expected_status" "$STATUS" "unexpected exit status; stdout=$(cat "$OUT"); stderr=$(cat "$ERR")"
  [ ! -s "$ERR" ] || fail "stderr was not empty: $(cat "$ERR")"
  assert_equal 1 "$(wc -l <"$OUT" | tr -d ' ')" 'stdout was not exactly one JSON line'
  [ "$(tail -c 1 "$OUT" | od -An -tuC | tr -d ' ')" = 10 ] || fail 'stdout did not end in exactly one newline-delimited record'
  jq -e 'type == "object" and .schema == "qq.accountable-evidence/v1"' "$OUT" >/dev/null || fail "invalid versioned JSON contract: $(cat "$OUT")"
  ! grep -qi 'traceback' "$OUT" "$ERR" || fail 'traceback escaped the refusal contract'
  [ "$(wc -c <"$OUT")" -le 65536 ] || fail 'output contract exceeded 64 KiB'
}
assert_refusal() {
  assert_output_contract 66
  jq -e '.ok == false and .error.code == "refused" and (.error.message | type == "string" and length > 0) and (keys == ["error","ok","schema"])' "$OUT" >/dev/null || fail "malformed refusal: $(cat "$OUT")"
}
reset_case() {
  : >"$TRACE"
  BINDING_SCENARIO=ok; BINDING_CANDIDATE=0
  PANE_CURRENT_SCENARIO=present; PANE_CANDIDATE_SCENARIO=present
  export BINDING_SCENARIO BINDING_CANDIDATE PANE_CURRENT_SCENARIO PANE_CANDIDATE_SCENARIO
}
assert_trace() {
  local expected="$1"
  assert_equal "$expected" "$(cat "$TRACE")" "unexpected external call order: $(cat "$TRACE")"
}

# All accountable identities are accepted, while change identity remains
# exclusive to change_owner. A current-only record causes one binding read and
# exactly one binding-named pane read.
reset_case; EXPECT_ROLE=architect; EXPECT_CHANGE=; export EXPECT_ROLE EXPECT_CHANGE
invoke --repo "$REPO" --product qq --role architect
assert_output_contract 0
jq -e --arg cwd "$VALID_CWD" --arg foreground "$VALID_FOREGROUND" '
  .ok == true
  and .result.binding == {
    "candidate":null,
    "current":{
      "acknowledged":true,"activation_nonce":null,"mutated":false,"pane_id":"w:pCurrent",
      "read_only":false,"runtime_active":true,
      "source":{"operation_cursor":"cursor-a","role_source_fingerprint":"role-a","source_fingerprint":"source-a"}
    },
    "identity":{"change":null,"product":"qq","role":"architect"},
    "schema":"qq.actor-binding/v1","version":1
  }
  and .result.panes == [{"order":0,"pane_id":"w:pCurrent","resource":{"cwd":$cwd,"foreground_cwd":$foreground,"pane_id":"w:pCurrent","tab_id":"w:tAccountable","terminal_id":"term-current","workspace_id":"w"},"slot":"current"}]
' "$OUT" >/dev/null || fail "current-only evidence mismatch: $(cat "$OUT")"
assert_trace $'binding ["inspect","--repo","'"$REPO"$'","--product","qq","--role","architect"]\nherdr ["pane","get","w:pCurrent"]'

reset_case; EXPECT_ROLE=coordinator; EXPECT_CHANGE=; export EXPECT_ROLE EXPECT_CHANGE
PANE_CURRENT_SCENARIO=omitted; export PANE_CURRENT_SCENARIO
invoke --repo "$REPO" --product qq --role coordinator
assert_output_contract 0
jq -e '.result.binding.identity.role == "coordinator" and .result.panes[0].resource == {"pane_id":"w:pCurrent","tab_id":"w:tAccountable","terminal_id":"term-current","workspace_id":"w"}' "$OUT" >/dev/null

reset_case; EXPECT_ROLE=change_owner; EXPECT_CHANGE=T-214.2; BINDING_CANDIDATE=1; export EXPECT_ROLE EXPECT_CHANGE BINDING_CANDIDATE
invoke "${base[@]}"
assert_output_contract 0
jq -e --arg cwd "$VALID_CWD" --arg foreground "$VALID_FOREGROUND" '
  .ok == true and (.result.panes | map(.slot)) == ["current","candidate"]
  and (.result.panes | map(.order)) == [0,1]
  and (.result.panes | map(.pane_id)) == ["w:pCurrent","w:pCandidate"]
  and .result.panes[1].resource == {"cwd":$cwd,"foreground_cwd":$foreground,"pane_id":"w:pCandidate","tab_id":"w:tAccountable","terminal_id":"term-candidate","workspace_id":"w"}
  and .result.binding.candidate == {
    "acknowledged":false,"activation_nonce":null,"expected_current_pane_id":"w:pCurrent",
    "mutated":false,"pane_id":"w:pCandidate","phase":"candidate","read_only":true,
    "runtime_active":false,
    "source":{"operation_cursor":"cursor-a","role_source_fingerprint":"role-a","source_fingerprint":"source-a"}
  }
' "$OUT" >/dev/null || fail "current/candidate evidence mismatch: $(cat "$OUT")"
assert_trace $'binding ["inspect","--repo","'"$REPO"$'","--product","qq","--role","change_owner","--change","T-214.2"]\nherdr ["pane","get","w:pCurrent"]\nherdr ["pane","get","w:pCandidate"]'

# Exact pane_not_found is explicit evidence. It is not a fallback and cannot
# suppress the later candidate slot named by the binding.
reset_case; BINDING_CANDIDATE=1; PANE_CURRENT_SCENARIO=absent; PANE_CANDIDATE_SCENARIO=absent
export BINDING_CANDIDATE PANE_CURRENT_SCENARIO PANE_CANDIDATE_SCENARIO
invoke "${base[@]}"; assert_output_contract 0
jq -e '.result.panes == [
  {"error":{"code":"pane_not_found"},"order":0,"pane_id":"w:pCurrent","slot":"current"},
  {"error":{"code":"pane_not_found"},"order":1,"pane_id":"w:pCandidate","slot":"candidate"}
]' "$OUT" >/dev/null || fail "absence evidence mismatch: $(cat "$OUT")"
assert_trace $'binding ["inspect","--repo","'"$REPO"$'","--product","qq","--role","change_owner","--change","T-214.2"]\nherdr ["pane","get","w:pCurrent"]\nherdr ["pane","get","w:pCandidate"]'

# Binding evidence is validated before any pane call. All malformed/unavailable
# command evidence becomes one bounded refusal and never leaks child stderr.
for scenario in failure malformed duplicate oversized utf8 nonfinite identity endpoint-shape stderr; do
  reset_case; BINDING_SCENARIO="$scenario"; export BINDING_SCENARIO
  invoke "${base[@]}"; assert_refusal
  assert_equal 1 "$(grep -c '^binding ' "$TRACE")" "$scenario did not call binding inspector exactly once"
  ! grep -q '^herdr ' "$TRACE" || fail "$scenario read a pane after invalid binding evidence"
done

for scenario in failure malformed duplicate oversized utf8 nonfinite overflow receipt-missing receipt-wrong receipt-extra receipt-duplicate receipt-malformed receipt-wrong-type wrong-pane wrong-type missing-terminal nonstring-workspace stderr-success mixed-absence absence-extra; do
  reset_case; PANE_CURRENT_SCENARIO="$scenario"; export PANE_CURRENT_SCENARIO
  invoke "${base[@]}"; assert_refusal
  assert_equal 1 "$(grep -c '^binding ' "$TRACE")" "$scenario binding call count"
  assert_equal 1 "$(grep -c '^herdr ' "$TRACE")" "$scenario pane call count"
done

# Each optional top-level location is independent. Omission is preserved as
# omission; valid exact strings are returned without canonical rewriting.
for scenario in omitted cwd-only foreground-only unicode-cwd; do
  reset_case; PANE_CURRENT_SCENARIO="$scenario"; export PANE_CURRENT_SCENARIO
  invoke "${base[@]}"; assert_output_contract 0
done
reset_case; PANE_CURRENT_SCENARIO=omitted; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; jq -e '(.result.panes[0].resource | has("cwd") | not) and (.result.panes[0].resource | has("foreground_cwd") | not)' "$OUT" >/dev/null
reset_case; PANE_CURRENT_SCENARIO=cwd-only; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; jq -e --arg value "$VALID_CWD" '.result.panes[0].resource.cwd == $value and (.result.panes[0].resource | has("foreground_cwd") | not)' "$OUT" >/dev/null
reset_case; PANE_CURRENT_SCENARIO=foreground-only; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; jq -e --arg value "$VALID_FOREGROUND" '.result.panes[0].resource.foreground_cwd == $value and (.result.panes[0].resource | has("cwd") | not)' "$OUT" >/dev/null
reset_case; PANE_CURRENT_SCENARIO=unicode-cwd; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; assert_output_contract 0; jq -e --arg value "$UNICODE_CWD" '.result.panes[0].resource.cwd == $value' "$OUT" >/dev/null

for field in cwd foreground; do
  for representation in null number relative missing nul surrogate file; do
    reset_case; PANE_CURRENT_SCENARIO="$field-$representation"; export PANE_CURRENT_SCENARIO
    invoke "${base[@]}"; assert_refusal
  done
done
reset_case; PANE_CURRENT_SCENARIO=cwd-nul; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; assert_refusal; first_refusal="$(cat "$OUT")"
reset_case; PANE_CURRENT_SCENARIO=cwd-nul; export PANE_CURRENT_SCENARIO
invoke "${base[@]}"; assert_refusal
assert_equal "$first_refusal" "$(cat "$OUT")" 'identical invalid evidence did not produce a deterministic refusal'

# Invalid CLI identity/arguments and unavailable test executables refuse before
# any external read. There is no caller-pane, checkout, or executable argument.
for argv in \
  "--repo $REPO --product qq --role change_owner" \
  "--repo $REPO --product qq --role architect --change T-1" \
  "--repo $REPO --product qq --role runner" \
  "--repo relative --product qq --role architect" \
  "--repo $REPO --product qq --role architect --caller-pane w:pX" \
  "--repo $REPO --product qq --role architect --checkout $REPO" \
  "--repo $REPO --product qq --role architect --binding-bin $BINDING_FAKE"; do
  reset_case
  # Deliberate word splitting supplies the static malformed argv table.
  # shellcheck disable=SC2086
  invoke $argv
  assert_refusal
  [ ! -s "$TRACE" ] || fail "invalid CLI reached an external command: $argv"
done
reset_case
saved_binding="$QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN"
QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN="$TMP/fakes/missing"; export QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN
invoke "${base[@]}"; assert_refusal; [ ! -s "$TRACE" ] || fail 'unavailable binding executable was invoked'
QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN="$saved_binding"; export QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN
reset_case
saved_herdr="$QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN"
QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN="$TMP/fakes/missing"; export QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN
invoke "${base[@]}"; assert_refusal
assert_equal 1 "$(grep -c '^binding ' "$TRACE")" 'binding was not read before Herdr availability refusal'
! grep -q '^herdr ' "$TRACE" || fail 'unavailable Herdr executable was invoked'
QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN="$saved_herdr"; export QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN

# The fakes themselves reject every non-inspection verb. This makes any
# accidental broadening observable rather than silently accepting it.
set +e
"$BINDING_FAKE" create --repo "$REPO" --product qq --role change_owner --change T-214.2 >/dev/null 2>&1; binding_fake_status=$?
"$HERDR_FAKE" agent list >/dev/null 2>&1; herdr_fake_status=$?
set -e
assert_equal 97 "$binding_fake_status" 'binding fake accepted a mutation verb'
assert_equal 97 "$herdr_fake_status" 'Herdr fake accepted agent list'

# Runtime and source absence proof: the inspector creates no cache/state file,
# and its only subprocess argv constructors are the exact read-only seams.
reset_case; invoke "${base[@]}"; assert_output_contract 0
[ -z "$(find "$TMP/home" "$TMP/state" "$TMP/cache" -mindepth 1 -print -quit)" ] || fail 'inspector wrote machine-local home/state/cache data'
assert_file_contains "$MODULE" '["inspect", "--repo"' 'binding inspector argv is not structurally fixed to inspect'
assert_file_contains "$MODULE" '[selected, "pane", "get", pane_id]' 'Herdr argv is not structurally fixed to pane get'
assert_file_not_matches "$MODULE" "(agent['\"]?[[:space:]]*,[[:space:]]*['\"]list|worktree|checkout|caller[_-]pane|pane['\"]?[[:space:]]*,[[:space:]]*['\"](close|split)|candidate-create|runtime-activate|recovery|admission)" 'inspector source crossed an excluded authority boundary'
assert_file_not_matches "$MODULE" 'backlog|(^|[^[:alpha:]])git([^[:alpha:]]|$)|(^|[^[:alpha:]])task([^[:alpha:]]|$)' 'inspector source can scan Task or Git state'
assert_file_not_matches "$MODULE" "(write_text|write_bytes|mkdir|unlink|replace|rename|rmdir|makedirs|open\\([^)]*,[[:space:]]*['\"][wax+])" 'inspector source contains a filesystem/state write primitive'

printf 'test-qq-accountable-evidence: pass\n'
