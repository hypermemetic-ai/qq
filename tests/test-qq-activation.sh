#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-activation"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
HELPER="$ROOT/bin/lib/qq-activation.py"
PROBE="$ROOT/bin/qq-activation-probe"
WATCHER="$ROOT/extensions/qq-activation-watch.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

repo="$TMP/repo"
git init -q "$repo"
git -C "$repo" config user.name test
git -C "$repo" config user.email test@example.com
mkdir -p "$repo/extensions" "$repo/skills/demo" "$repo/.pi/prompts"
printf 'instructions\n' >"$repo/AGENTS.md"
printf 'extension\n' >"$repo/extensions/demo.ts"
printf 'skill\n' >"$repo/skills/demo/SKILL.md"
printf 'prompt\n' >"$repo/.pi/prompts/bro.md"
printf 'check in\n' >"$repo/.pi/prompts/check-in.md"
git -C "$repo" add .
git -C "$repo" commit -qm base
base="$(git -C "$repo" rev-parse HEAD)"
printf 'repository-only\n' >"$repo/DOC.md"
git -C "$repo" add DOC.md
git -C "$repo" commit -qm docs
docs="$(git -C "$repo" rev-parse HEAD)"
printf '' >"$TMP/body"
"$HELPER" classify --repo "$repo" --before "$base" --after "$docs" \
  --pr-body-file "$TMP/body" >"$TMP/none.json"
jq -e '.action == "none" and .changed_loaded_resources == [] and (.reason | contains("no globally loaded"))' \
  "$TMP/none.json" >/dev/null

printf 'compatible change\n' >>"$repo/extensions/demo.ts"
git -C "$repo" add extensions/demo.ts
git -C "$repo" commit -qm reload
reload="$(git -C "$repo" rev-parse HEAD)"
"$HELPER" classify --repo "$repo" --before "$docs" --after "$reload" \
  --pr-body-file "$TMP/body" >"$TMP/reload.json"
expected_fingerprint="$(git -C "$repo" ls-tree -rz --full-tree "$reload" -- \
  AGENTS.md skills extensions .pi/prompts/bro.md .pi/prompts/check-in.md | sha256sum | awk '{print $1}')"
jq -e --arg fingerprint "$expected_fingerprint" '
  .action == "reload"
  and .resource_fingerprint == $fingerprint
  and .changed_loaded_resources == ["extensions/demo.ts"]
  and .citation == null
' "$TMP/reload.json" >/dev/null

mkdir -p "$repo/bin"
printf '#!/bin/sh\n' >"$repo/bin/pi"
chmod +x "$repo/bin/pi"
git -C "$repo" add bin/pi
git -C "$repo" commit -qm runtime
runtime="$(git -C "$repo" rev-parse HEAD)"
set +e
"$HELPER" classify --repo "$repo" --before "$reload" --after "$runtime" \
  --pr-body-file "$TMP/body" >"$TMP/unresolved.json" 2>"$TMP/unresolved.err"
unresolved_status=$?
set -e
assert_equal 2 "$unresolved_status" "runtime change without aligned exception did not fail closed"
assert_file_contains "$TMP/unresolved.err" 'without a machine-verifiable aligned exception'

store="$TMP/store"
mkdir -p "$store/tasks" "$store/decisions"
cat >"$store/decisions/decision-42 - replacement.md" <<'EOF'
---
id: decision-42
status: accepted
---
Aligned replacement contract.
EOF
cat >"$store/tasks/t-42.1 - runtime.md" <<'EOF'
---
id: T-42.1
status: In Progress
---
Decision ledger: decision-42.
qq-activation-exception: {"schema":"qq.activation-exception","version":1,"action":"replace","resources":["bin/pi"],"replacement":"pi-session-cwd-v1","reason":"The aligned Pi runtime change requires process reconstruction.","citation":"decision-42"}
EOF
ln -s "$store" "$repo/backlog"
printf 'T-42.1 — aligned runtime replacement\n' >"$TMP/body"
"$HELPER" classify --repo "$repo" --before "$reload" --after "$runtime" \
  --pr-body-file "$TMP/body" >"$TMP/replace.json"
jq -e '
  .action == "replace"
  and .replacement == "pi-session-cwd-v1"
  and .replacement_resources == ["bin/pi"]
  and .citation == "decision-42"
  and (.reason | contains("process reconstruction"))
' "$TMP/replace.json" >/dev/null

# A loaded extension contract is reload-compatible by default, but the same
# strict Alignment evidence can mark a particular extension Change incompatible.
printf 'incompatible contract\n' >>"$repo/extensions/demo.ts"
git -C "$repo" add extensions/demo.ts
git -C "$repo" commit -qm incompatible-extension
incompatible_extension="$(git -C "$repo" rev-parse HEAD)"
python3 - "$store/tasks/t-42.1 - runtime.md" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
path.write_text(path.read_text().replace('["bin/pi"]', '["extensions/demo.ts"]'))
PY
"$HELPER" classify --repo "$repo" --before "$runtime" --after "$incompatible_extension" \
  --pr-body-file "$TMP/body" >"$TMP/extension-replace.json"
jq -e '.action == "replace" and .changed_loaded_resources == ["extensions/demo.ts"] and .replacement_resources == ["extensions/demo.ts"]' \
  "$TMP/extension-replace.json" >/dev/null

# Herdr target census binds exact pane/session authority across qq and a second Product.
cat >"$TMP/agents.json" <<'EOF'
{"result":{"agents":[
 {"agent":"pi","pane_id":"qq:p1","tab_id":"qq:t1","workspace_id":"qq","agent_status":"working","interactive_ready":true,"cwd":"/work/qq","foreground_cwd":"/work/qq","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"/sessions/qq.jsonl"},"name":"qq-owner"},
 {"agent":"pi","pane_id":"other:p1","tab_id":"other:t1","workspace_id":"other","agent_status":"idle","interactive_ready":true,"cwd":"/work/other","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"/sessions/other.jsonl"},"name":null},
 {"agent":"codex","pane_id":"other:p2","tab_id":"other:t1","workspace_id":"other","agent_status":"working","interactive_ready":true}
]}}
EOF
"$HELPER" targets <"$TMP/agents.json" >"$TMP/targets.json"
jq -e 'length == 2 and map(.workspace_id) == ["other","qq"] and all(.replacement_launch.contract == "pi-session-cwd-v1")' \
  "$TMP/targets.json" >/dev/null
jq '.result.agents[1].agent_session.value = "/sessions/qq.jsonl"' "$TMP/agents.json" >"$TMP/agents-duplicate.json"
set +e
"$HELPER" targets <"$TMP/agents-duplicate.json" >/dev/null 2>"$TMP/duplicate.err"
duplicate_status=$?
set -e
assert_equal 2 "$duplicate_status" "duplicate session authority was accepted"

# Live-probe setup is private, unique, and refuses default, reused, wrong-mode, and symlink roots.
old_xdg="${XDG_STATE_HOME-}"
export XDG_STATE_HOME="$TMP/probe-default-state"
set +e
"$PROBE" prepare "$XDG_STATE_HOME/qq/delegate" >/dev/null 2>"$TMP/default.err"
default_status=$?
set -e
assert_equal 2 "$default_status" "default/shared probe root was accepted"
if [ -n "$old_xdg" ]; then export XDG_STATE_HOME="$old_xdg"; else unset XDG_STATE_HOME; fi
probe_root="$TMP/private-probe"
exports="$($PROBE prepare "$probe_root")"
eval "$exports"
assert_equal 700 "$(stat -c %a "$probe_root")" "probe root mode"
"$PROBE" validate "$probe_root" >/dev/null
saved_probe_id="$QQ_ACTIVATION_PROBE_ID"
saved_probe_version="$QQ_ACTIVATION_EXPECTED_WATCHER_VERSION"
unset QQ_ACTIVATION_PROBE_ID
set +e
"$PROBE" verify "$probe_root" --minimum 0 >/dev/null 2>"$TMP/probe-verify-absent.err"
probe_verify_absent_status=$?
set -e
assert_equal 2 "$probe_verify_absent_status" "probe verification accepted an absent exported probe identity"
export QQ_ACTIVATION_PROBE_ID=wrong-probe
set +e
"$PROBE" verify "$probe_root" --minimum 0 >/dev/null 2>"$TMP/probe-verify-mismatch.err"
probe_verify_mismatch_status=$?
set -e
assert_equal 2 "$probe_verify_mismatch_status" "probe verification accepted a mismatched exported probe identity"
export QQ_ACTIVATION_PROBE_ID="$saved_probe_id"
export QQ_ACTIVATION_EXPECTED_WATCHER_VERSION=wrong-version
set +e
"$PROBE" verify "$probe_root" --minimum 0 >/dev/null 2>"$TMP/probe-verify-version.err"
probe_verify_version_status=$?
set -e
assert_equal 2 "$probe_verify_version_status" "probe verification accepted a mismatched exported watcher identity"
export QQ_ACTIVATION_EXPECTED_WATCHER_VERSION="$saved_probe_version"
set +e
"$PROBE" prepare "$probe_root" >/dev/null 2>"$TMP/reused.err"
reused_status=$?
set -e
assert_equal 2 "$reused_status" "reused probe root was accepted"
chmod 755 "$probe_root"
set +e
"$PROBE" validate "$probe_root" >/dev/null 2>"$TMP/mode.err"
mode_status=$?
set -e
assert_equal 2 "$mode_status" "wrong-mode probe root was accepted"
chmod 700 "$probe_root"
ln -s "$probe_root" "$TMP/probe-link"
set +e
"$PROBE" validate "$TMP/probe-link" >/dev/null 2>"$TMP/link.err"
link_status=$?
set -e
assert_equal 2 "$link_status" "symlink probe root was accepted"
unset QQ_DISPATCH_RUNTIME_ROOT QQ_ACTIVATION_PROBE_ID QQ_ACTIVATION_EXPECTED_WATCHER_VERSION

# A process interruption between fast-forward and request arming is derivable
# from its pending exact source identity and recoverable without duplicate state.
recovery_root="$TMP/recovery-runtime"
mkdir -m 700 "$recovery_root"
jq -cn --argjson classification "$(cat "$TMP/reload.json")" '
  {classification:$classification,targets:[],source:{pull_request:"42",pr_url:"https://example.test/42",merge_commit:$classification.landed_tree,source_branch:"feature",probe_id:null}}
' | "$HELPER" stage --runtime-root "$recovery_root" >"$TMP/staged.json"
recovery_run="$(jq -r .run_dir "$TMP/staged.json")"
[ -f "$recovery_run/REQUEST.pending" ] || fail 'activation stage did not preserve an unarmed request'
"$HELPER" recover-pending --runtime-root "$recovery_root" --landed-tree "$reload" \
  --merge-commit "$reload" >"$TMP/recovered.json"
jq -e '.recovered == true and .request.action == "reload"' "$TMP/recovered.json" >/dev/null
[ -f "$recovery_run/REQUEST.json" ] || fail 'interrupted publication was not armed on recovery'
[ ! -e "$recovery_run/REQUEST.pending" ] || fail 'recovery left duplicate pending state'

# The production replacement helper waits for graceful Herdr authority release,
# verifies the exact pane/tab/workspace/cwd, and resumes the durable Pi session
# with no prompt or focus operation.
replacement_cwd="$TMP/replacement-cwd"
replacement_session="$TMP/replacement-session.jsonl"
mkdir "$replacement_cwd"
printf 'session\n' >"$replacement_session"
cat >"$TMP/replacement-agents.json" <<EOF
{"result":{"agents":[{"agent":"pi","pane_id":"qq:p1","tab_id":"qq:t1","workspace_id":"qq","agent_status":"idle","interactive_ready":true,"cwd":"$replacement_cwd","foreground_cwd":"$replacement_cwd","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"$replacement_session"},"name":"qq-owner"}]}}
EOF
"$HELPER" targets <"$TMP/replacement-agents.json" >"$TMP/replacement-target.json"
replacement_root="$TMP/replacement-runtime"
mkdir -m 700 "$replacement_root"
jq -cn --argjson classification "$(cat "$TMP/replace.json")" --argjson targets "$(cat "$TMP/replacement-target.json")" '
  {classification:$classification,targets:$targets,source:{pull_request:"42",pr_url:"https://example.test/42",merge_commit:$classification.landed_tree,source_branch:"feature",probe_id:null}}
' | "$HELPER" stage --runtime-root "$replacement_root" >"$TMP/replacement-stage.json"
replacement_run_id="$(jq -r .run_id "$TMP/replacement-stage.json")"
replacement_run="$(jq -r .run_dir "$TMP/replacement-stage.json")"
"$HELPER" arm --runtime-root "$replacement_root" --run-id "$replacement_run_id" >/dev/null
replacement_token="$(jq -r '.[0].token' "$TMP/replacement-target.json")"
cat >"$TMP/herdr" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\$*" >>"$TMP/replacement-herdr.log"
case "\${1:-} \${2:-}" in
  'agent wait') printf '%s\\n' '{"result":{"status":"unknown"}}' ;;
  'pane get') printf '%s\\n' '{"result":{"pane":{"pane_id":"qq:p1","tab_id":"qq:t1","workspace_id":"qq","cwd":"$replacement_cwd"}}}' ;;
  'agent start')
    if [ "\${FAKE_START_WRONG_PANE:-}" = 1 ]; then
      printf '%s\\n' '{"result":{"type":"agent_started","agent":{"pane_id":"wrong:pane"}}}'
    else
      printf '%s\\n' '{"result":{"type":"agent_started","agent":{"pane_id":"qq:p1"}}}'
    fi
    ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$TMP/herdr"
PATH="$TMP:$PATH" "$HELPER" replace --run "$replacement_run" --target "$replacement_token" --old-pid 4242
jq -e '.status == "started" and .old_pid == 4242' "$replacement_run/helpers/$replacement_token.json" >/dev/null
assert_file_contains "$TMP/replacement-herdr.log" "agent start qq-owner --kind pi --pane qq:p1 --timeout 30000 -- --session $replacement_session"
assert_file_not_matches "$TMP/replacement-herdr.log" 'focus|prompt|send-keys|send-text' 'replacement helper used a focus/editor/model path'
rm -- "$replacement_run/helpers/$replacement_token.json"
set +e
FAKE_START_WRONG_PANE=1 PATH="$TMP:$PATH" "$HELPER" replace --run "$replacement_run" \
  --target "$replacement_token" --old-pid 4243 >/dev/null 2>"$TMP/replacement-wrong-pane.err"
wrong_pane_status=$?
set -e
assert_equal 2 "$wrong_pane_status" "recognized replacement start type with the wrong pane was accepted"
jq -e '.status == "failed" and (.error | contains("exact pane"))' \
  "$replacement_run/helpers/$replacement_token.json" >/dev/null

# Staging a later activation never raw-retires an earlier completed run.
retirement_root="$TMP/retirement-runtime"
mkdir -m 700 "$retirement_root"
jq -cn --argjson classification "$(cat "$TMP/reload.json")" --argjson targets "$(cat "$TMP/replacement-target.json")" '
  {classification:$classification,targets:$targets,source:{pull_request:"51",pr_url:"https://example.test/51",merge_commit:$classification.landed_tree,source_branch:"prior-feature",probe_id:null}}
' | "$HELPER" stage --runtime-root "$retirement_root" >"$TMP/retirement-prior-stage.json"
retirement_prior_id="$(jq -r .run_id "$TMP/retirement-prior-stage.json")"
retirement_prior_run="$(jq -r .run_dir "$TMP/retirement-prior-stage.json")"
"$HELPER" arm --runtime-root "$retirement_root" --run-id "$retirement_prior_id" >/dev/null
mkdir -m 700 "$retirement_prior_run/receipts"
retirement_fingerprint="$(jq -r .resource_fingerprint "$TMP/reload.json")"
jq -cn --arg run "$retirement_prior_id" --arg token "$replacement_token" --arg fingerprint "$retirement_fingerprint" \
  --arg session "$replacement_session" '
  {schema:"qq.activation-receipt",version:1,run_id:$run,target:$token,pane_id:"qq:p1",session_path:$session,
   status:"activated",reason:"fixture activation",action:"reload",source_watcher_version:"qq-activation-watch-v1",
   running_watcher_version:"qq-activation-watch-v1",resource_fingerprint:$fingerprint,process_id:500,recorded_at:"2026-01-01T00:00:00Z"}
' >"$retirement_prior_run/receipts/$replacement_token.json"
chmod 600 "$retirement_prior_run/receipts/$replacement_token.json"
jq -cn --argjson classification "$(cat "$TMP/extension-replace.json")" '
  {classification:$classification,targets:[],source:{pull_request:"52",pr_url:"https://example.test/52",merge_commit:$classification.landed_tree,source_branch:"later-feature",probe_id:null}}
' | "$HELPER" stage --runtime-root "$retirement_root" >"$TMP/retirement-later-stage.json"
retirement_later_run="$(jq -r .run_dir "$TMP/retirement-later-stage.json")"
[ -f "$retirement_prior_run/REQUEST.json" ] || fail 'later staging deleted a completed prior activation run'
set +e
"$HELPER" retire-change --runtime-root "$retirement_root" --source-branch later-feature \
  --pull-request 52 >/dev/null 2>"$TMP/retirement-pending.err"
retirement_pending_status=$?
set -e
assert_equal 2 "$retirement_pending_status" "activation retirement accepted a pending exact request"
[ -d "$retirement_later_run" ] || fail 'pending retirement refusal removed its run'
"$HELPER" retire-change --runtime-root "$retirement_root" --source-branch prior-feature \
  --pull-request 51 >"$TMP/retirement-complete.json"
jq -e '.status == "retired" and .matched == true and .retired == true' "$TMP/retirement-complete.json" >/dev/null
[ ! -e "$retirement_prior_run" ] || fail 'exact complete activation retirement left its run'
[ -d "$retirement_later_run" ] || fail 'exact activation retirement removed a foreign run'
"$HELPER" retire-change --runtime-root "$retirement_root" --source-branch prior-feature \
  --pull-request 51 >"$TMP/retirement-repeated.json"
jq -e '.status == "not-found" and .matched == false and .retired == false' "$TMP/retirement-repeated.json" >/dev/null

failed_retirement_root="$TMP/failed-retirement-runtime"
mkdir -m 700 "$failed_retirement_root"
jq -cn --argjson classification "$(cat "$TMP/reload.json")" --argjson targets "$(cat "$TMP/replacement-target.json")" '
  {classification:$classification,targets:$targets,source:{pull_request:"53",pr_url:"https://example.test/53",merge_commit:$classification.landed_tree,source_branch:"failed-feature",probe_id:null}}
' | "$HELPER" stage --runtime-root "$failed_retirement_root" >"$TMP/failed-retirement-stage.json"
failed_retirement_id="$(jq -r .run_id "$TMP/failed-retirement-stage.json")"
failed_retirement_run="$(jq -r .run_dir "$TMP/failed-retirement-stage.json")"
"$HELPER" arm --runtime-root "$failed_retirement_root" --run-id "$failed_retirement_id" >/dev/null
mkdir -m 700 "$failed_retirement_run/receipts"
jq -cn --arg run "$failed_retirement_id" --arg token "$replacement_token" --arg fingerprint "$retirement_fingerprint" \
  --arg session "$replacement_session" '
  {schema:"qq.activation-receipt",version:1,run_id:$run,target:$token,pane_id:"qq:p1",session_path:$session,
   status:"failed",reason:"fixture refusal",action:"reload",source_watcher_version:"qq-activation-watch-v1",
   running_watcher_version:"qq-activation-watch-v1",resource_fingerprint:$fingerprint,process_id:501,recorded_at:"2026-01-01T00:00:00Z"}
' >"$failed_retirement_run/receipts/$replacement_token.json"
chmod 600 "$failed_retirement_run/receipts/$replacement_token.json"
set +e
"$HELPER" retire-change --runtime-root "$failed_retirement_root" --source-branch failed-feature \
  --pull-request 53 >/dev/null 2>"$TMP/retirement-failed.err"
retirement_failed_status=$?
set -e
assert_equal 2 "$retirement_failed_status" "activation retirement accepted a failed target"
[ -d "$failed_retirement_run" ] || fail 'failed retirement refusal removed its run'
jq '.status = "activated" | .resource_fingerprint = ("0" * 64)' \
  "$failed_retirement_run/receipts/$replacement_token.json" \
  >"$failed_retirement_run/receipts/$replacement_token.json.tmp"
mv "$failed_retirement_run/receipts/$replacement_token.json.tmp" \
  "$failed_retirement_run/receipts/$replacement_token.json"
chmod 600 "$failed_retirement_run/receipts/$replacement_token.json"
set +e
"$HELPER" retire-change --runtime-root "$failed_retirement_root" --source-branch failed-feature \
  --pull-request 53 >/dev/null 2>"$TMP/retirement-stale.err"
retirement_stale_status=$?
set -e
assert_equal 2 "$retirement_stale_status" "activation retirement accepted stale fingerprint proof"
rm -- "$failed_retirement_run/receipts/$replacement_token.json"
set +e
"$HELPER" retire-change --runtime-root "$failed_retirement_root" --source-branch failed-feature \
  --pull-request 53 >/dev/null 2>"$TMP/retirement-missing.err"
retirement_missing_status=$?
set -e
assert_equal 2 "$retirement_missing_status" "activation retirement accepted a missing target receipt"
[ -d "$failed_retirement_run" ] || fail 'missing-receipt retirement refusal removed its run'

malformed_retirement_root="$TMP/malformed-retirement-runtime"
mkdir -m 700 "$malformed_retirement_root" "$malformed_retirement_root/.qq-activation"
mkdir -m 700 "$malformed_retirement_root/.qq-activation/malformed"
printf '%s\n' '{"schema":"qq.activation-request","source_branch":"malformed-feature"}' \
  >"$malformed_retirement_root/.qq-activation/malformed/REQUEST.json"
chmod 600 "$malformed_retirement_root/.qq-activation/malformed/REQUEST.json"
set +e
"$HELPER" retire-change --runtime-root "$malformed_retirement_root" --source-branch malformed-feature \
  --pull-request 54 >/dev/null 2>"$TMP/retirement-malformed.err"
retirement_malformed_status=$?
set -e
assert_equal 2 "$retirement_malformed_status" "activation retirement accepted malformed private state"
[ -d "$malformed_retirement_root/.qq-activation/malformed" ] || fail 'malformed retirement refusal removed its run'

cp -- "$WATCHER" "$TMP/qq-activation-watch-a.ts"
cp -- "$WATCHER" "$TMP/qq-activation-watch-b.ts"

node --experimental-strip-types --input-type=module - \
  "$TMP/qq-activation-watch-a.ts" "$TMP/qq-activation-watch-b.ts" "$TMP" "$WATCHER" <<'JS'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [watchAPath, watchBPath, tmp, productionWatchPath] = process.argv.slice(2);
const source = await readFile(watchAPath, "utf8");
assert.doesNotMatch(source, /herdr[^\n]*(?:focus|send-text|send-keys)|setEditorText|sendMessage\s*\(|triggerTurn\s*:\s*true/i,
  "activation watcher can focus/type or trigger a model turn");
assert.match(source, /await commandCtx\.reload\(\);\s*return;/,
  "reload is not terminal for the old command handler");
assert.doesNotMatch(source, /setInterval\s*\(/, "activation watcher contains production polling");
const moduleA = await import(pathToFileURL(watchAPath));
const moduleB = await import(pathToFileURL(watchBPath));
const productionModule = await import(pathToFileURL(productionWatchPath));
const fingerprint = "a".repeat(64);

async function waitFor(predicate, message, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function exists(path) {
  try { await readFile(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function fixture(name, overrides = {}) {
  const runtime = join(tmp, name);
  const activation = join(runtime, ".qq-activation");
  const runId = `land-${name}`;
  const run = join(activation, runId);
  await mkdir(run, { recursive: true, mode: 0o700 });
  const target = {
    token: createHash("sha256").update("qq:p1\0/sessions/qq.jsonl").digest("hex").slice(0, 32), pane_id: "qq:p1", tab_id: "qq:t1", workspace_id: "qq",
    session_path: "/sessions/qq.jsonl", cwd: "/work/qq", name: "qq-owner",
    observed_status: "idle",
    replacement_launch: { kind: "pi", contract: "pi-session-cwd-v1", args: ["--session", "/sessions/qq.jsonl"] },
  };
  const request = {
    schema: "qq.activation-request", version: 1, run_id: runId,
    action: overrides.action ?? "reload", before_tree: "1".repeat(40), landed_tree: "2".repeat(40),
    resource_fingerprint: fingerprint, changed_loaded_resources: ["extensions/demo.ts"],
    replacement_resources: overrides.action === "replace" ? ["extensions/demo.ts"] : [],
    replacement: overrides.action === "replace" ? "pi-session-cwd-v1" : null,
    reason: "fixture activation", citation: overrides.action === "replace" ? "decision-42" : null,
    task_id: "T-42.1", pull_request: "42", pr_url: "https://example.test/42",
    merge_commit: "2".repeat(40), source_branch: "feature", expected_watcher_version: overrides.expectedVersion ?? moduleA.WATCHER_VERSION,
    created_at: new Date().toISOString(), targets: [overrides.target ?? target], probe_id: null,
  };
  await writeFile(join(run, "REQUEST.json"), `${JSON.stringify(request)}\n`, { mode: 0o600 });
  return { runtime, run, runId, request, target };
}

function harness(module, fixture, options = {}) {
  const events = new Map();
  const integrationEvents = new Map();
  const commands = new Map();
  const messages = [];
  const warnings = [];
  let idle = options.idle ?? true;
  let pending = options.pending ?? false;
  const ctx = {
    mode: "tui", hasUI: true, cwd: options.cwd ?? "/work/qq",
    sessionManager: { getSessionFile: () => options.session ?? "/sessions/qq.jsonl" },
    isIdle: () => idle, hasPendingMessages: () => pending,
    ui: { notify: (message, level) => warnings.push({ message, level }) },
  };
  const pi = {
    events: {
      on(name, handler) {
        if (!integrationEvents.has(name)) integrationEvents.set(name, []);
        integrationEvents.get(name).push(handler);
      },
    },
    registerCommand(name, command) { commands.set(name, command); },
    on(name, handler) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(handler);
    },
    sendUserMessage(text, sendOptions) {
      messages.push({ text, options: sendOptions });
      return Promise.resolve();
    },
  };
  module.default(pi, {
    runtimeRoot: fixture.runtime,
    currentPane: options.pane ?? "qq:p1",
    fingerprint: async () => options.fingerprint ?? fingerprint,
    authority: async (target) => {
      if (options.authorityError) throw new Error(options.authorityError);
      return target;
    },
    processId: options.processId ?? 100,
    isBlocked: () => options.blocked ?? false,
    replaceProcess: options.replaceProcess,
  });
  return {
    messages, warnings, commands,
    setIdle(value) { idle = value; },
    setPending(value) { pending = value; },
    async fire(name, event = {}) {
      for (const handler of events.get(name) ?? []) await handler(event, ctx);
    },
    fireIntegration(name, event = {}) {
      for (const handler of integrationEvents.get(name) ?? []) handler(event);
    },
    async start(reason = "startup") { await this.fire("session_start", { reason }); },
    async shutdown(reason = "reload") { await this.fire("session_shutdown", { reason }); },
  };
}

// Busy, queued-continuation, tool, and injected atomic blockers all retain the request until safe.
const busyFixture = await fixture("busy");
const busy = harness(moduleA, busyFixture, { idle: false });
await busy.start();
assert.equal(busy.messages.length, 0);
busy.setIdle(true);
busy.setPending(true);
await busy.fire("agent_settled");
assert.equal(busy.messages.length, 0);
busy.setPending(false);
await busy.fire("tool_execution_start");
await busy.fire("agent_settled");
assert.equal(busy.messages.length, 0);
await busy.fire("tool_execution_end");
await busy.fire("agent_settled");
await waitFor(() => busy.messages.length === 1, "settled request was not queued");
assert.deepEqual(busy.messages[0], {
  text: `/qq-activate ${busyFixture.runId} ${busyFixture.target.token}`,
  options: { deliverAs: "followUp" },
});
assert.ok(busy.warnings.some(({ message }) => /pending/.test(message)));

const atomicFixture = await fixture("atomic");
const atomic = harness(moduleA, atomicFixture, { blocked: true });
await atomic.start();
assert.equal(atomic.messages.length, 0);
assert.ok(atomic.warnings.some(({ message }) => /atomic operation/.test(message)));
await atomic.shutdown();

// Production blocker events are balanced through pi.events. Release alone does
// not activate; a later ordinary settled event owns reconciliation.
const productionBlockedFixture = await fixture("production-blocked");
const productionBlocked = harness(moduleA, productionBlockedFixture, { idle: false });
await productionBlocked.start();
productionBlocked.fireIntegration("herdr:blocked", { active: true, label: "atomic write" });
productionBlocked.setIdle(true);
await productionBlocked.fire("agent_settled");
assert.equal(productionBlocked.messages.length, 0);
productionBlocked.fireIntegration("herdr:blocked", { active: false, label: "atomic write" });
assert.equal(productionBlocked.messages.length, 0, "blocker release activated without an ordinary reconciliation event");
await productionBlocked.fire("agent_settled");
await waitFor(() => productionBlocked.messages.length === 1, "released production blocker did not reconcile at settlement");
await productionBlocked.shutdown();

const underflowFixture = await fixture("blocker-underflow");
const underflow = harness(moduleA, underflowFixture, { idle: false });
await underflow.start();
underflow.fireIntegration("herdr:blocked", { active: false, label: "missing blocker" });
underflow.setIdle(true);
await underflow.fire("agent_settled");
assert.equal(underflow.messages.length, 0, "contradictory blocker release was sanitized into unblocked");
assert.ok(underflow.warnings.some(({ message }) => /underflowed/.test(message)));
await underflow.shutdown();

const lateBlockFixture = await fixture("late-production-block");
const lateBlock = harness(moduleA, lateBlockFixture);
await lateBlock.start();
await waitFor(() => lateBlock.messages.length === 1, "late-block fixture was not queued");
lateBlock.fireIntegration("herdr:blocked", { active: true, label: "late atomic write" });
await lateBlock.commands.get("qq-activate").handler(`${lateBlockFixture.runId} ${lateBlockFixture.target.token}`, {
  reload: async () => assert.fail("late blocker allowed reload"), shutdown() {},
});
assert.equal(await exists(join(lateBlockFixture.run, "receipts", `${lateBlockFixture.target.token}.json`)), false,
  "late blocker converted a pending activation into terminal failure");
lateBlock.fireIntegration("herdr:blocked", { active: false, label: "late atomic write" });
assert.equal(lateBlock.messages.length, 1, "late blocker release retried without ordinary settlement");
await lateBlock.fire("agent_settled");
await waitFor(() => lateBlock.messages.length === 2, "late blocker did not retry after release and settlement");
await lateBlock.shutdown();

const blockedFixture = await fixture("extension-blocked");
const blocked = harness(moduleA, blockedFixture, { authorityError: "live Herdr target is blocked" });
await blocked.start();
assert.equal(blocked.messages.length, 0);
assert.ok(blocked.warnings.some(({ message }) => /blocked/.test(message)));
await blocked.shutdown();

// Command interception invokes reload without an input/agent event or model turn.
let reloadCalls = 0;
await busy.commands.get("qq-activate").handler(`${busyFixture.runId} ${busyFixture.target.token}`, {
  reload: async () => { reloadCalls += 1; },
  shutdown: () => assert.fail("reload path requested shutdown"),
});
assert.equal(reloadCalls, 1);
const busyAttempt = JSON.parse(await readFile(join(busyFixture.run, "attempts", `${busyFixture.target.token}.json`), "utf8"));
assert.equal(busyAttempt.phase, "requested", JSON.stringify(busyAttempt));
assert.equal(busy.messages.length, 1, "activation command created an extra user/model message");
await busy.shutdown();
const postReload = harness(moduleB, busyFixture, { processId: 100 });
await postReload.start("reload");
const receiptPath = join(busyFixture.run, "receipts", `${busyFixture.target.token}.json`);
await waitFor(() => exists(receiptPath), "post-reload receipt was not written");
const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
assert.equal(receipt.status, "activated", JSON.stringify(receipt));
assert.equal(receipt.source_watcher_version, moduleA.WATCHER_VERSION);
assert.equal(receipt.running_watcher_version, moduleB.WATCHER_VERSION);
assert.equal(receipt.resource_fingerprint, fingerprint);
assert.equal(receipt.session_path, "/sessions/qq.jsonl");
await postReload.shutdown();

// Duplicate watcher instances race through one exclusive per-session claim.
const duplicateFixture = await fixture("duplicate");
const duplicateA = harness(moduleA, duplicateFixture);
const duplicateB = harness(moduleB, duplicateFixture);
await Promise.all([duplicateA.start(), duplicateB.start()]);
await waitFor(() => duplicateA.messages.length + duplicateB.messages.length === 1, "duplicate watchers did not deduplicate delivery");
await duplicateA.shutdown();
await duplicateB.shutdown();

// Runtime death after a claim but before command entry is recoverable by a new exact process identity.
const deathFixture = await fixture("death");
const dying = harness(moduleA, deathFixture, { processId: 300 });
await dying.start();
await waitFor(() => dying.messages.length === 1, "dying watcher did not claim the request");
await dying.shutdown("quit");
const recovered = harness(moduleB, deathFixture, { processId: 301 });
await recovered.start("startup");
await waitFor(() => recovered.messages.length === 1, "new process did not recover a pre-command activation claim");
await recovered.shutdown();

// Missing/mismatched pane and session authority neither consume nor satisfy a target.
const missingFixture = await fixture("missing");
const missing = harness(moduleA, missingFixture, { pane: "other:p1" });
await missing.start();
assert.equal(missing.messages.length, 0);
assert.equal(await exists(join(missingFixture.run, "claims", `${missingFixture.target.token}.json`)), false);
await missing.shutdown();
const contradictionFixture = await fixture("contradiction");
const contradiction = harness(moduleA, contradictionFixture, { session: "/sessions/wrong.jsonl" });
await contradiction.start();
assert.equal(contradiction.messages.length, 0);
assert.ok(contradiction.warnings.some(({ message }) => /contradictory/.test(message)));
await contradiction.shutdown();

// Reload refusal is terminally visible and never claims success.
const failureFixture = await fixture("failure");
const failure = harness(moduleA, failureFixture);
await failure.start();
await waitFor(() => failure.messages.length === 1, "failure request was not queued");
await failure.commands.get("qq-activate").handler(`${failureFixture.runId} ${failureFixture.target.token}`, {
  reload: async () => { throw new Error("fixture refusal"); }, shutdown() {},
});
const failureReceipt = JSON.parse(await readFile(join(failureFixture.run, "receipts", `${failureFixture.target.token}.json`), "utf8"));
assert.equal(failureReceipt.status, "failed");
assert.match(failureReceipt.reason, /fixture refusal/);
await failure.shutdown();

// A stale post-reload watcher can neither consume nor satisfy exact-version proof.
const stalePath = join(tmp, "qq-activation-watch-stale.ts");
const staleSource = (await readFile(watchAPath, "utf8")).replaceAll("qq-activation-watch-v1", "qq-activation-watch-v0");
await writeFile(stalePath, staleSource);
const staleModule = await import(pathToFileURL(stalePath));
const staleFixture = await fixture("stale");
const staleOld = harness(moduleA, staleFixture);
await staleOld.start();
await waitFor(() => staleOld.messages.length === 1, "stale fixture was not queued");
await staleOld.commands.get("qq-activate").handler(`${staleFixture.runId} ${staleFixture.target.token}`, { reload: async () => {}, shutdown() {} });
await staleOld.shutdown();
const staleNew = harness(staleModule, staleFixture);
await staleNew.start("reload");
await waitFor(() => exists(join(staleFixture.run, "receipts", `${staleFixture.target.token}.json`)), "stale watcher failure was not visible");
const staleReceipt = JSON.parse(await readFile(join(staleFixture.run, "receipts", `${staleFixture.target.token}.json`), "utf8"));
assert.equal(staleReceipt.status, "failed");
assert.match(staleReceipt.reason, /version|stale/);
await staleNew.shutdown();

// The production one-shot helper protocol returns only after the child has
// written exclusive exact-request acceptance through its inherited pipe.
const productionReplaceFixture = await fixture("production-replace-acceptance", { action: "replace" });
process.env.PATH = `${tmp}:${process.env.PATH}`;
const productionAcceptance = await productionModule.defaultReplace(
  productionReplaceFixture.run,
  productionReplaceFixture.target.token,
  199,
  productionReplaceFixture.request,
  productionReplaceFixture.target,
);
assert.equal(productionAcceptance.status, "accepted");
assert.equal(productionAcceptance.run_id, productionReplaceFixture.runId);
assert.equal(productionAcceptance.target, productionReplaceFixture.target.token);
assert.equal(productionAcceptance.old_pid, 199);

// Explicit replacement uses graceful shutdown plus durable session/cwd launch; only the new process proves success.
const replaceFixture = await fixture("replace", { action: "replace" });
let replacement;
let acceptReplacement;
const replacementAccepted = new Promise((resolve) => { acceptReplacement = resolve; });
const replaceOld = harness(moduleA, replaceFixture, {
  processId: 200,
  replaceProcess(run, token, pid) {
    replacement = { run, token, pid };
    return replacementAccepted;
  },
});
await replaceOld.start();
await waitFor(() => replaceOld.messages.length === 1, "replacement was not queued");
let shutdownCalls = 0;
const replaceCommand = replaceOld.commands.get("qq-activate").handler(`${replaceFixture.runId} ${replaceFixture.target.token}`, {
  reload: async () => assert.fail("replacement silently downgraded to reload"),
  shutdown: () => { shutdownCalls += 1; },
});
await waitFor(() => replacement !== undefined, "replacement launch was not requested");
assert.deepEqual(replacement, { run: replaceFixture.run, token: replaceFixture.target.token, pid: 200 });
assert.equal(shutdownCalls, 0, "old session shut down before helper launch acceptance");
acceptReplacement({ status: "accepted" });
await replaceCommand;
assert.equal(shutdownCalls, 1);
await replaceOld.shutdown("quit");
await mkdir(join(replaceFixture.run, "helpers"), { mode: 0o700 });
await writeFile(join(replaceFixture.run, "helpers", `${replaceFixture.target.token}.json`), JSON.stringify({
  schema: "qq.activation-replacement", version: 1, run_id: replaceFixture.runId,
  target: replaceFixture.target.token, pane_id: replaceFixture.target.pane_id,
  old_pid: 200, status: "started", expected_watcher_version: moduleB.WATCHER_VERSION,
  resource_fingerprint: fingerprint, updated_at: new Date().toISOString(),
}) + "\n", { mode: 0o600 });
const replaceNew = harness(moduleB, replaceFixture, { processId: 201 });
await replaceNew.start("startup");
await waitFor(() => exists(join(replaceFixture.run, "receipts", `${replaceFixture.target.token}.json`)), "replacement receipt was not written by new process");
const replaceReceipt = JSON.parse(await readFile(join(replaceFixture.run, "receipts", `${replaceFixture.target.token}.json`), "utf8"));
assert.equal(replaceReceipt.status, "activated");
assert.equal(replaceReceipt.action, "replace");
assert.equal(replaceReceipt.process_id, 201);
await replaceNew.shutdown();

// Launch rejection is terminally recorded while the old session remains alive.
const rejectedFixture = await fixture("replace-launch-rejected", { action: "replace" });
const rejected = harness(moduleA, rejectedFixture, {
  replaceProcess: async () => { throw new Error("fixture launch rejection"); },
});
await rejected.start();
await waitFor(() => rejected.messages.length === 1, "rejected replacement was not queued");
let rejectedShutdowns = 0;
await rejected.commands.get("qq-activate").handler(`${rejectedFixture.runId} ${rejectedFixture.target.token}`, {
  reload: async () => assert.fail("replacement launch rejection downgraded to reload"),
  shutdown: () => { rejectedShutdowns += 1; },
});
assert.equal(rejectedShutdowns, 0, "rejected helper launch shut down the old session");
const rejectedReceipt = JSON.parse(await readFile(join(rejectedFixture.run, "receipts", `${rejectedFixture.target.token}.json`), "utf8"));
assert.equal(rejectedReceipt.status, "failed");
assert.match(rejectedReceipt.reason, /launch was not accepted|fixture launch rejection/);
await rejected.shutdown();

console.log("test-qq-activation node: pass");
JS

printf 'test-qq-activation: pass\n'
