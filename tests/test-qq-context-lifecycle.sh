#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-context-lifecycle"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
[ -x "$ROOT/tests/probes/qq-context-exact-model.mjs" ] || fail 'missing owner-run exact-model corpus runner'
[ -x "$ROOT/tests/probes/qq-context-live-herdr.sh" ] || fail 'missing isolated live-Herdr probe'
assert_file_contains "$ROOT/tests/probes/qq-context-exact-model.mjs" 'runCompactorAttempt' 'exact-model runner does not execute the production compactor'
assert_file_contains "$ROOT/tests/probes/qq-context-live-herdr.sh" 'qq-context-recover' 'live probe bypasses the production recovery transaction'
assert_file_contains "$ROOT/tests/probes/qq-context-live-herdr.sh" 'OWNER_PANE' 'live probe does not fence the accountable owner pane'
assert_file_not_matches "$ROOT/extensions/qq-context-lifecycle.ts" 'qq-event-plane|pi-intercom|Continue\.' 'shared lifecycle activated Event Plane/messaging or owning-role recovery policy'
assert_file_not_matches "$ROOT/extensions/qq-context-lifecycle.ts" 'pi\.sendUserMessage|sendUserMessage\(' 'private commands are incorrectly dispatched as model user messages'
assert_file_not_matches "$ROOT/extensions/qq-context-lifecycle.ts" 'pi\.on\("turn_end"' 'threshold compaction is still registered on turn_end'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$ROOT/extensions/qq-context-lifecycle.ts" "$TMP/lifecycle.mjs"
node --input-type=module - "$TMP/lifecycle.mjs" "$ROOT/delegation/policies/execution-profiles.json" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const [modulePath, policyPath, scratch] = process.argv.slice(2);
const lifecycle = await import(pathToFileURL(modulePath));
const { CONTEXT_LIFECYCLE_LIMITS: limits, COMPACTOR_TOOL_NAMES, ROLE_APPENDICES, resolveCompactorProfile, shouldTriggerCompaction, contextCut, buildCompactorInput, createCompactorTools, validateCheckpoint, runCompactorAttempt, default: register } = lifecycle;

const resolved = await resolveCompactorProfile(undefined, policyPath);
assert.deepEqual(resolved.profile, { provider: "kimi-coding", model: "k3", effort: "max", serviceClass: "provider-default" });
assert.match(resolved.hash, /^[0-9a-f]{64}$/);
assert.equal(shouldTriggerCompaction(84_999, 100_000, 200_000), false);
assert.equal(shouldTriggerCompaction(85_000, 100_000, 200_000), true);
assert.deepEqual(COMPACTOR_TOOL_NAMES, ["history_search", "history_read", "authority_read", "submit_checkpoint"]);
assert.deepEqual(Object.keys(ROLE_APPENDICES).sort(), ["architect", "change_owner", "coordinator"]);

const user = (id, tokens, text = "u") => ({ type: "message", id, message: { role: "user", content: text.repeat(tokens * 4) } });
const assistant = (id, tokens, tool = false) => ({ type: "message", id, message: { role: "assistant", content: tool ? [{ type: "toolCall", name: "x", arguments: { text: "a".repeat(tokens * 4) } }] : [{ type: "text", text: "a".repeat(tokens * 4) }] } });
const result = (id, tokens) => ({ type: "message", id, message: { role: "toolResult", toolCallId: id, toolName: "x", content: [{ type: "text", text: "r".repeat(tokens * 4) }] } });
let entries = [];
for (let n = 1; n <= 6; n++) entries.push(user(`u${n}`, 4000), assistant(`a${n}`, 4000));
const whole = contextCut(entries); assert.equal(entries[whole.firstKeptEntryIndex].message.role, "user"); assert.equal(whole.isSplitTurn, false);
const huge = [user("hu", 4000), assistant("call", 18_000, true), result("res", 18_000), assistant("tail", 2000)];
const split = contextCut(huge); assert.equal(split.isSplitTurn, true); assert.notEqual(huge[split.firstKeptEntryIndex].id, "res");
const old = user("old-raw", 1, "ONLY-THROUGH-PRIOR-INDEX");
const priorSummary = "live index ONLY-THROUGH-PRIOR-INDEX => h:old-raw; planted stale claim SETTLED-WITHOUT-AUTHORITY";
const repeatedEntries = [old, user("kept", 1), { type: "compaction", id: "cmp", firstKeptEntryId: "kept", summary: priorSummary }, user("new", 9000), assistant("new-a", 9000), user("new2", 9000), assistant("new2-a", 9000), user("new3", 9000), assistant("new3-a", 9000)];
const repeatedCut = contextCut(repeatedEntries);
const metadata = { role: "change_owner", sessionId: "s1", cut: repeatedCut.firstKeptEntryId, snapshot: "snap", profileHash: resolved.hash, operationCursor: "cursor", roleSourceFingerprint: "role", sourceFingerprint: "source" };
const indexedRevision = "b".repeat(64);
const built = buildCompactorInput(repeatedEntries, repeatedCut, metadata, [{ name: "task", revision: indexedRevision }]);
assert.match(built, /previous-checkpoint-untrusted-index/); assert.match(built, /h:old-raw/); assert.match(built, /UNTRUSTED RETRIEVAL INDEX ONLY/);
assert.match(built, new RegExp(`<authority-tool-index>.*task.*${indexedRevision}`)); assert.doesNotMatch(built, /<raw-history>/);
assert.throws(() => buildCompactorInput(repeatedEntries, repeatedCut, metadata, [{ name: "task", revision: indexedRevision }, { name: "task", revision: indexedRevision }]), /malformed or duplicated/);

const authorityPath = `${scratch}/authority.txt`; await writeFile(authorityPath, "durable exact state\n", "utf8");
const crypto = await import("node:crypto"); const revision = crypto.createHash("sha256").update("durable exact state\n").digest("hex");
const history = new Map([["h:e1", JSON.stringify({ id: "e1", operator: "exact" })]]); const handles = new Set(); const budget = { readCalls: 0, evidenceTokens: 0 };
const tools = createCompactorTools({ budget, history, authorities: new Map([["task", { path: authorityPath, sha256: revision }]]), handles, submit: async () => "ok" });
assert.match(await tools[0].run({ query: "operator", limit: 2 }), /"proves":false/); assert.equal(handles.size, 0);
await tools[1].run({ handle: "h:e1" }); assert.ok(handles.has("h:e1"));
const authority = JSON.parse(await tools[2].run({ name: "task", revision })); assert.equal(authority.handle, `a:task:${revision}`); assert.ok(handles.has(authority.handle));
await writeFile(authorityPath, "changed\n", "utf8"); await assert.rejects(tools[2].run({ name: "task", revision }), /revision mismatch/);

// Mechanical evidence hazards poison the attempt and never make their refused
// handles citeable. Malformed model arguments remain ordinary correctable refusals.
const oversizedHandles = new Set();
const oversizedTool = createCompactorTools({ budget: { readCalls: 0, evidenceTokens: 0 }, history: new Map([["h:huge", "x".repeat(32 * 1024 * 4 + 1)]]), authorities: new Map(), handles: oversizedHandles, submit: async () => "" })[1];
await assert.rejects(oversizedTool.run({ handle: "h:huge" }), /truncation.*unsafe/); assert.equal(oversizedHandles.has("h:huge"), false);
const exhaustedHandles = new Set();
const exhaustedTool = createCompactorTools({ budget: { readCalls: limits.readCalls, evidenceTokens: 0 }, history: new Map([["h:e25", "exact"]]), authorities: new Map(), handles: exhaustedHandles, submit: async () => "" })[1];
await assert.rejects(exhaustedTool.run({ handle: "h:e25" }), /24-read budget exhausted/); assert.equal(exhaustedHandles.has("h:e25"), false);
const tokenHandles = new Set();
const tokenTool = createCompactorTools({ budget: { readCalls: 0, evidenceTokens: limits.evidenceTokens - 1 }, history: new Map([["h:tokens", "12345678"]]), authorities: new Map(), handles: tokenHandles, submit: async () => "" })[1];
await assert.rejects(tokenTool.run({ handle: "h:tokens" }), /evidence-token budget exhausted/); assert.equal(tokenHandles.has("h:tokens"), false);
await assert.rejects(createCompactorTools({ budget: {readCalls:0,evidenceTokens:0}, history: new Map(), authorities: new Map(), handles: new Set(), submit: async()=>"" })[1].run({handle:"model-typo"}), /absent/);
const changedAuthorityHandles = new Set();
const changedAuthorityTool = createCompactorTools({ budget: { readCalls: 0, evidenceTokens: 0 }, history: new Map(), authorities: new Map([["task", { path: authorityPath, sha256: revision }]]), handles: changedAuthorityHandles, submit: async () => "" })[2];
await assert.rejects(changedAuthorityTool.run({ name: "task", revision }), /revision mismatch.*unsafe/); assert.equal(changedAuthorityHandles.size, 0);

function sourced(text, sources = ["h:e1"]) { return { text, sources }; }
function checkpoint(role = "change_owner", source = "h:e1") {
  const category = { architect: "alignment_thread", coordinator: "frontier", change_owner: "change_identity" }[role];
  const s = (text) => sourced(text, [source]);
  return { status: "active", synopsis: "Working", objective: s("Deliver exact scope"), decisions: [], state: [s("Source remains active")], obligations: [s("Run checks")], contradictions: [], role_context: { role, entries: [{ category, ...s("Role continuity") }] }, next_actions: [s("Read source state")], reset_evidence: { useful: false, safe_edge: false, facts: [] }, retrieval_index: [{ label: "current", handles: [source] }] };
}
let validation = validateCheckpoint(checkpoint(), { role: "change_owner", sourceHandles: new Set(["h:e1"]), metadata });
assert.equal(validation.ok, true); assert.match(validation.rendered, /operation=cursor; role_source=role; source=source/);
assert.equal(validateCheckpoint(checkpoint("coordinator"), { role: "change_owner", sourceHandles: new Set(["h:e1"]), metadata }).ok, false);

const model = { provider: "kimi-coding", id: "k3", contextWindow: 200_000 };
const modelCtx = { modelRegistry: { async getApiKeyAndHeaders() { return { ok: true, apiKey: "secret" }; } } };
let call = 0;
const completeSuccess = async (_model, request) => {
  call += 1;
  if (!request.messages.some((message) => message.role === "toolResult")) return { role: "assistant", content: [{ type: "toolCall", id: "read", name: "history_read", arguments: { handle: "h:e1" } }], stopReason: "toolUse", usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: 1 };
  return { role: "assistant", content: [{ type: "toolCall", id: "submit", name: "submit_checkpoint", arguments: checkpoint() }], stopReason: "toolUse", usage: { input: 7, output: 11, cacheRead: 0, cacheWrite: 0, totalTokens: 18, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: 2 };
};
const attempt = await runCompactorAttempt({ ctx: modelCtx, model, profile: resolved.profile, role: "change_owner", entries: [{ type: "message", id: "e1", message: { role: "user", content: "exact" } }], initialEvidence: "index", metadata, authoritiesRaw: "", complete: completeSuccess, verifyProfile: async () => true });
assert.equal(attempt.kind, "success"); assert.equal(attempt.usage.input, 9); assert.equal(attempt.usage.output, 14); assert.equal(attempt.budget.readCalls, 1);
const websocketUnavailable = await runCompactorAttempt({ ctx: modelCtx, model, profile: resolved.profile, role: "change_owner", entries: [{ type: "message", id: "e1", message: { role: "user", content: "exact" } }], initialEvidence: "index", metadata, authoritiesRaw: "", verifyProfile: async () => true, complete: async () => { throw new Error("WebSocket closed 1006"); } });
assert.equal(websocketUnavailable.kind, "unavailable", "transient provider socket closure was misclassified as an unsafe candidate");

const budgetEntries = Array.from({ length: 25 }, (_, index) => ({ type: "message", id: `budget-${index + 1}`, message: { role: "user", content: `exact-${index + 1}` } }));
let budgetRound = 0;
const unsafeBudgetAttempt = await runCompactorAttempt({ ctx: modelCtx, model, profile: resolved.profile, role: "change_owner", entries: budgetEntries, initialEvidence: "bounded index", metadata, authoritiesRaw: "", verifyProfile: async () => true, complete: async () => {
  budgetRound += 1;
  if (budgetRound <= 25) return { role: "assistant", content: [{ type: "toolCall", id: `budget-read-${budgetRound}`, name: "history_read", arguments: { handle: `h:budget-${budgetRound}` } }], stopReason: "toolUse", timestamp: budgetRound };
  return { role: "assistant", content: [{ type: "toolCall", id: "unsafe-submit", name: "submit_checkpoint", arguments: checkpoint("change_owner", "h:budget-25") }], stopReason: "toolUse", timestamp: 30 };
} });
assert.equal(unsafeBudgetAttempt.kind, "unsafe"); assert.match(unsafeBudgetAttempt.reason, /24-read budget exhausted/); assert.equal(budgetRound, 25); assert.equal(unsafeBudgetAttempt.budget, undefined, "unsafe attempt must never masquerade as validated success");

// Prior checkpoints are indexes, not citeable history. A fake repeated-case model
// follows h:old-raw to the old raw fact and explicitly refuses the planted stale claim.
const repeatedModelEntries = [old, { type: "compaction", id: "prior", firstKeptEntryId: "old-raw", summary: priorSummary }, user("fresh", 1, "no copy of old fact")];
let repeatedRound = 0;
const repeatedOutcome = await runCompactorAttempt({ ctx: modelCtx, model, profile: resolved.profile, role: "change_owner", entries: repeatedModelEntries, initialEvidence: buildCompactorInput(repeatedModelEntries, { firstKeptEntryIndex: 2, firstKeptEntryId: "fresh" }, metadata), metadata, authoritiesRaw: "", verifyProfile: async () => true, complete: async () => {
  repeatedRound += 1;
  if (repeatedRound === 1) return { role: "assistant", content: [{ type: "toolCall", id: "old", name: "history_read", arguments: { handle: "h:old-raw" } }], stopReason: "toolUse", timestamp: 1 };
  const cp = checkpoint("change_owner", "h:old-raw"); cp.state = [sourced("ONLY-THROUGH-PRIOR-INDEX remains live", ["h:old-raw"])]; cp.contradictions = [sourced("SETTLED-WITHOUT-AUTHORITY is only an untrusted prior claim", ["h:old-raw"])];
  return { role: "assistant", content: [{ type: "toolCall", id: "done", name: "submit_checkpoint", arguments: cp }], stopReason: "toolUse", timestamp: 2 };
} });
assert.equal(repeatedOutcome.kind, "success"); assert.match(repeatedOutcome.rendered, /ONLY-THROUGH-PRIOR-INDEX remains live/); assert.match(repeatedOutcome.rendered, /untrusted prior claim/);
await assert.rejects(createCompactorTools({ budget: {readCalls:0,evidenceTokens:0}, history: new Map(), authorities: new Map(), handles: new Set(), submit: async()=>"" })[1].run({handle:"h:prior"}), /absent/);

function endpoint(pane, { readOnly = false, active = true, acknowledged = false, mutated = false } = {}) { return { pane_id: pane, source: { operation_cursor: "cursor-a", role_source_fingerprint: "role-a", source_fingerprint: "source-a" }, read_only: readOnly, acknowledged, mutated, runtime_active: active, activation_nonce: null }; }
function makeHarness(initial = "current", options = {}) {
  const listeners = new Map(); const commands = new Map(); const registeredTools = new Map(); const notifications = []; const messages = []; const customEntries = []; const injected = []; const execCalls = []; const scheduled = [];
  let activeTools = options.activeTools ?? ["read", "bash", "edit", "write", "operator_stage"]; let compactCalls = 0; let leaf = "leaf-tool"; let pending = false; let idle = true; let sessionId = "session-old"; let sessionFile = `${scratch}/session-old.jsonl`; let gitStatus = "# branch.oid abc";
  writeFileSync(sessionFile, '{"type":"session","id":"session-old"}\n', "utf8");
  const env = { QQ_ACCOUNTABLE_ROLE: "change_owner", QQ_PRODUCT_ID: "qq", QQ_CHANGE_ID: "T-189", QQ_TASK_ID: "T-189", QQ_ROLE_SOURCE_FINGERPRINT: "role-a", QQ_SOURCE_FINGERPRINT: "source-a", QQ_OPERATION_CURSOR: "cursor-a", HERDR_PANE_ID: "w:p1", QQ_CONTEXT_AUTHORITIES: "" };
  let record = { schema: "qq.actor-binding/v1", version: 1, identity: { product: "qq", role: "change_owner", change: "T-189" }, current: endpoint(initial === "current" ? "w:p1" : "w:current"), candidate: null };
  if (initial === "candidate") record.candidate = { ...endpoint("w:p1", { readOnly: true, active: false }), expected_current_pane_id: "w:current", phase: "candidate" };
  if (initial === "stale") record.candidate = { ...endpoint("w:p1", { readOnly: true, active: false }), expected_current_pane_id: "w:current", phase: "predecessor" };
  const clone = (v) => structuredClone(v);
  const classify = () => record.current.pane_id === "w:p1" ? (record.current.runtime_active && !record.current.read_only ? "current" : "activating") : record.candidate?.pane_id === "w:p1" ? (record.candidate.phase === "candidate" ? "candidate" : "stale") : "unbound";
  const bindingCall = async (action, _ctx, extra = []) => {
    if (action === "inspect") return { value: clone(record) };
    if (action === "classify") return { value: { state: classify(), record: clone(record) } };
    if (action === "guard") {
      if (classify() !== "current") return { value: undefined, reason: `stale pane refused: ${classify()}` };
      if (extra.includes("--mutation")) record.current.mutated = true; if (extra.includes("--acknowledgement")) record.current.acknowledged = true;
      return { value: clone(record) };
    }
    if (action === "candidate-ready") { assert.equal(classify(), "candidate"); assert.deepEqual(extra, ["--expected-current", "w:current"]); record.candidate.acknowledged = true; return { value: clone(record) }; }
    if (action === "runtime-activate") { assert.equal(classify(), "activating"); assert.equal(extra[1], record.current.activation_nonce); record.current.runtime_active = true; record.current.read_only = false; record.current.activation_nonce = null; return { value: clone(record) }; }
    throw new Error(action);
  };
  const pi = {
    on(name, handler) { assert.equal(listeners.has(name), false, `duplicate listener ${name}`); listeners.set(name, handler); },
    registerCommand(name, def) { commands.set(name, def); }, registerTool(def) { registeredTools.set(def.name, def); },
    sendMessage(message) { messages.push(message); }, appendEntry(customType, data) { customEntries.push({ type: "custom", customType, data }); },
    getActiveTools() { return [...activeTools]; }, setActiveTools(names) { activeTools = [...names]; }, getAllTools() { return [...registeredTools].map(([name]) => ({name})); },
  };
  const sol = { provider: "kimi-coding", id: "k3", contextWindow: 200_000 }; const actor = { provider: "other", id: "actor", contextWindow: 180_000 };
  const sessionManager = { getSessionId: () => sessionId, getLeafId: () => leaf, getSessionFile: () => sessionFile, getEntries: () => customEntries, getBranch: () => customEntries };
  const ctx = { mode: "tui", hasUI: true, cwd: scratch, model: actor, sessionManager, modelRegistry: { find(provider, id) { return provider === sol.provider && id === sol.id ? sol : undefined; }, async getApiKeyAndHeaders() { return { ok: true, apiKey: "secret" }; } }, ui: { notify(message, level) { notifications.push({ message, level }); } }, isIdle: () => idle, getContextUsage: () => ({ tokens: 170_000, contextWindow: 180_000 }), compact(options) { compactCalls += 1; assert.equal(idle, true); assert.equal(pending, false); options.onComplete?.(); }, hasPendingMessages: () => pending, async waitForIdle() { assert.equal(idle, true); }, async newSession(options) { const newFile = `${scratch}/session-new.jsonl`; let resetEntry; const next = { sessionManager: { getSessionId: () => "session-new", getSessionFile: () => newFile, appendCustomEntry(customType, data) { assert.equal(customType, "qq-context-reset-root/v1"); resetEntry = { type: "custom", customType, data }; return "reset-root"; }, appendMessage(message) { assert.equal(message.role, "assistant"); assert.deepEqual(message.content, []); writeFileSync(newFile, `${JSON.stringify({ type: "session", id: "session-new" })}\n${JSON.stringify(resetEntry)}\n${JSON.stringify({ type: "message", message })}\n`, "utf8"); return "persistence-sentinel"; } }, ui: ctx.ui }; await options.withSession(next); sessionId = "session-new"; sessionFile = newFile; return { cancelled: false }; }, async reload() { await listeners.get("session_start")({ reason: "reload" }, ctx); } };
  const exec = async (command, args) => {
    execCalls.push([command, ...args]);
    if (command === "git") {
      const key = args.slice(2).join(" ");
      const values = { "rev-parse --show-toplevel": `${scratch}\n`, "rev-parse --abbrev-ref HEAD": "feat/test\n", "rev-parse --verify HEAD": `${"a".repeat(40)}\n`, "status --porcelain=v2 --branch --untracked-files=all": `${gitStatus}\n` };
      return { code: 0, stdout: values[key] ?? "", stderr: "" };
    }
    if (command === "herdr") {
      const text = args.at(-1); injected.push(text);
      return { code: 0, stdout: JSON.stringify({ result: { type: "agent_prompted", agent: { pane_id: "w:p1", agent: "pi", interactive_ready: true, agent_session: { agent: "pi", kind: "path", value: sessionFile } } } }), stderr: "" };
    }
    throw new Error(command);
  };
  register(pi, { env, policyPath, complete: options.complete ?? completeSuccess, bindingCall, exec, schedule(callback) { scheduled.push(callback); }, async privatePrompt(pane, command) { assert.equal(pane, "w:p1"); injected.push(command); const [name, arg] = command.slice(1).split(" "); await commands.get(name).handler(arg, ctx); return { code: 0, stdout: JSON.stringify({ result: { type: "agent_prompted", agent: { pane_id: pane, agent: "pi", interactive_ready: true, agent_session: { agent: "pi", kind: "path", value: sessionFile } } } }), stderr: "" }; } });
  async function start(reason = "startup") { await listeners.get("session_start")({ reason }, ctx); }
  return { listeners, commands, registeredTools, notifications, messages, customEntries, injected, execCalls, ctx, env, start, async flushScheduled() { while (scheduled.length) await scheduled.shift()(); await new Promise((resolve) => setTimeout(resolve, 0)); }, activeTools: () => activeTools, compactCalls: () => compactCalls, record: () => record, setRecord(v) { record = v; }, setLeaf(v) { leaf = v; }, setPending(v) { pending = v; }, setIdle(v) { idle = v; }, setGitStatus(v) { gitStatus = v; } };
}

let h = makeHarness("current"); await h.start();
assert.equal(h.listeners.has("turn_end"), false); assert.equal(h.activeTools().includes("request_context_reset"), true);
await h.listeners.get("agent_settled")({}, h.ctx); assert.equal(h.compactCalls(), 1, "settled threshold did not compact");
h.setIdle(false); await h.listeners.get("agent_settled")({}, h.ctx); assert.equal(h.compactCalls(), 1, "active run was compacted/aborted"); h.setIdle(true);
await h.listeners.get("session_compact")({ fromExtension: false, compactionEntry: { id: "native" } }, h.ctx); await h.listeners.get("session_compact")({ fromExtension: true, compactionEntry: { id: "custom" } }, h.ctx);
assert.equal(h.messages.length, 1, "first native/custom compaction notice repeated");
await h.listeners.get("session_start")({ reason: "reload" }, h.ctx); await h.listeners.get("session_compact")({ fromExtension: false, compactionEntry: { id: "later" } }, h.ctx); assert.equal(h.messages.length, 1, "reload duplicated persisted notice");

const callerBudgetEntries = Array.from({ length: 25 }, (_, index) => ({ type: "message", id: `caller-budget-${index + 1}`, message: { role: "user", content: `exact-${index + 1}` } }));
const callerModels = []; let callerRound = 0;
h = makeHarness("current", { complete: async (usedModel) => { callerModels.push(usedModel.id); callerRound += 1; return { role: "assistant", content: [{ type: "toolCall", id: `caller-read-${callerRound}`, name: "history_read", arguments: { handle: `h:caller-budget-${callerRound}` } }], stopReason: "toolUse", timestamp: callerRound }; } }); await h.start();
const callerUnsafe = await h.listeners.get("session_before_compact")({ branchEntries: callerBudgetEntries, preparation: { tokensBefore: 100 }, signal: undefined }, h.ctx);
assert.equal(callerUnsafe, undefined); assert.equal(callerRound, 25); assert.deepEqual(new Set(callerModels), new Set(["k3"]), "unsafe compactor evidence retried the Actor instead of falling directly to native Pi"); assert.ok(h.notifications.some((note) => /unsafe\/invalid.*native compaction/.test(note.message)));

// Real Pi 0.81.1 compatibility: the tool returns a terminating result, the full
// run settles, then a one-shot deferred external command rechecks and replaces the session.
// No literal model message, pi.exec-owned self-prompt, or narrative handoff is used.
h = makeHarness("current"); await h.start();
const testimony = { useful: true, safe_edge: true, no_atomic_operation_in_flight: true, queued_inputs_preserved: true, source_reread_on_resume: true };
assert.equal((await h.listeners.get("tool_call")({ toolName: "request_context_reset", input: testimony, toolCallId: "t" }, h.ctx)), undefined);
let reset = await h.registeredTools.get("request_context_reset").execute("t", testimony, undefined, undefined, h.ctx); assert.equal(reset.details.status, "requested"); assert.equal(reset.terminate, true); assert.equal(h.injected.length, 0);
h.setLeaf("persisted-tool-result-leaf"); await h.listeners.get("agent_settled")({}, h.ctx); assert.equal(h.injected.length, 0, "reset ran reentrantly inside agent_settled"); await h.flushScheduled(); assert.equal(h.injected.length, 1); assert.match(h.injected[0], /^\/qq-context-reset [0-9a-f]{48}$/); assert.equal(h.compactCalls(), 0, "reset edge also triggered compaction");
assert.ok(h.notifications.some((note) => /persisted Pi session changed from .*session-old\.jsonl to .*session-new\.jsonl/.test(note.message)));
const resetRoot = await readFile(`${scratch}/session-new.jsonl`, "utf8"); assert.match(resetRoot, /qq-context-reset-root\/v1/); assert.doesNotMatch(resetRoot, /handoff|summary|narrative/i);
assert.equal(h.env.HERDR_PANE_ID, "w:p1"); assert.equal(h.execCalls.some((call) => call[0] === "herdr"), false);

// Runtime source drift after the persisted edge fails closed before /new.
h = makeHarness("current"); await h.start(); await h.registeredTools.get("request_context_reset").execute("t", testimony, undefined, undefined, h.ctx); h.setLeaf("edge"); await h.listeners.get("agent_settled")({}, h.ctx); h.setGitStatus("# changed after edge"); await h.flushScheduled(); assert.ok(h.notifications.some((note) => /runtime_fingerprint_changed/.test(note.message)));

// Candidate gets checkout-local reads plus one bounded accountable-context
// inspector. Readiness requires a fresh unchanged inspection, not booleans.
const candidateAuthorityPath = `${scratch}/candidate-authority.txt`; const candidateAuthorityText = "exact candidate authority\n"; await writeFile(candidateAuthorityPath, candidateAuthorityText, "utf8");
const candidateAuthorityRevision = crypto.createHash("sha256").update(candidateAuthorityText).digest("hex");
const candidateAuthoritiesRaw = JSON.stringify([{ name: "task", path: candidateAuthorityPath, sha256: candidateAuthorityRevision }]);
const readinessParams = { conflict_free: true, durable_sources_reconstructed: true, contradictions: [] };
h = makeHarness("candidate", { activeTools: ["read", "write", "request_context_reset", "acknowledge_context_candidate", "inspect_accountable_context"] }); h.env.QQ_CONTEXT_AUTHORITIES = candidateAuthoritiesRaw; await h.start();
assert.deepEqual(new Set(h.activeTools()), new Set(["read", "grep", "find", "ls", "inspect_accountable_context", "acknowledge_context_candidate"]));
assert.deepEqual(h.customEntries.find((entry) => entry.customType === "qq-context-candidate-tools/v1").data.names, ["read", "write"], "lifecycle-only tools were persisted as pre-candidate runtime tools");
assert.equal((await h.listeners.get("tool_call")({ toolName: "read", input: { path: "." } }, h.ctx)), undefined);
assert.equal((await h.listeners.get("tool_call")({ toolName: "read", input: { path: "/etc/passwd" } }, h.ctx)).block, true, "external non-allowlisted read escaped checkout fence");
for (const toolName of ["bash", "edit", "write", "operator_stage", "browser", "unknown_future_tool"]) assert.equal((await h.listeners.get("tool_call")({ toolName, input: {} }, h.ctx)).block, true, `${toolName} escaped candidate fence`);
assert.equal((await h.listeners.get("user_bash")({ command: "touch escaped" }, h.ctx)).result.exitCode, 126);
let ack = await h.registeredTools.get("acknowledge_context_candidate").execute("a", readinessParams, undefined, undefined, h.ctx); assert.equal(ack.details.status, "refused"); assert.equal(h.record().candidate.acknowledged, false, "boolean testimony bypassed required inspection");

h = makeHarness("candidate"); h.env.QQ_CONTEXT_AUTHORITIES = candidateAuthoritiesRaw; await h.start();
let inspected = await h.registeredTools.get("inspect_accountable_context").execute("i", {}, undefined, undefined, h.ctx); assert.equal(inspected.details.status, "inspected"); h.setGitStatus("# changed after candidate inspection");
ack = await h.registeredTools.get("acknowledge_context_candidate").execute("a", readinessParams, undefined, undefined, h.ctx); assert.equal(ack.details.status, "refused"); assert.equal(h.record().candidate.acknowledged, false);

h = makeHarness("candidate"); h.env.QQ_CONTEXT_AUTHORITIES = candidateAuthoritiesRaw; await h.start(); inspected = await h.registeredTools.get("inspect_accountable_context").execute("i", {}, undefined, undefined, h.ctx); assert.equal(inspected.details.status, "inspected");
await writeFile(candidateAuthorityPath, "changed candidate authority\n", "utf8"); ack = await h.registeredTools.get("acknowledge_context_candidate").execute("a", readinessParams, undefined, undefined, h.ctx); assert.equal(ack.details.status, "refused"); assert.equal(h.record().candidate.acknowledged, false);
h = makeHarness("candidate"); h.env.QQ_CONTEXT_AUTHORITIES = candidateAuthoritiesRaw; await h.start(); inspected = await h.registeredTools.get("inspect_accountable_context").execute("i", {}, undefined, undefined, h.ctx); assert.equal(inspected.details.status, "refused"); assert.doesNotMatch(inspected.content[0].text, /changed candidate authority/, "mismatched authority content leaked from inspector");

await writeFile(candidateAuthorityPath, candidateAuthorityText, "utf8");
h = makeHarness("candidate"); h.env.QQ_CONTEXT_AUTHORITIES = candidateAuthoritiesRaw; await h.start(); inspected = await h.registeredTools.get("inspect_accountable_context").execute("i", {}, undefined, undefined, h.ctx); assert.equal(inspected.details.status, "inspected");
const inspectionDocument = JSON.parse(inspected.content[0].text); assert.equal(inspectionDocument.binding.identity.change, "T-189"); assert.equal(inspectionDocument.binding.candidate.source.source_fingerprint, "source-a"); assert.equal(inspectionDocument.git.repository_root, scratch); assert.equal(inspectionDocument.git.branch, "feat/test"); assert.equal(inspectionDocument.git.head, "a".repeat(40)); assert.equal(inspectionDocument.authorities[0].revision, candidateAuthorityRevision); assert.equal(inspectionDocument.authorities[0].content, candidateAuthorityText);
ack = await h.registeredTools.get("acknowledge_context_candidate").execute("a", readinessParams, undefined, undefined, h.ctx); assert.equal(ack.details.status, "acknowledged"); assert.equal(h.record().candidate.acknowledged, true);

// After external swap, the old candidate runtime remains read-only. The private
// nonce command reloads; only the new runtime durably activates and restores tools.
const swapped = h.record(); swapped.current = { ...swapped.candidate, read_only: true, acknowledged: false, runtime_active: false, activation_nonce: "nonce-activation" }; delete swapped.current.expected_current_pane_id; delete swapped.current.phase; swapped.candidate = { ...endpoint("w:current", { readOnly: true, active: false }), expected_current_pane_id: "w:p1", phase: "predecessor" }; h.setRecord(swapped);
assert.equal((await h.listeners.get("tool_call")({ toolName: "write", input: {} }, h.ctx)).block, true);
await h.commands.get("qq-context-activate").handler("nonce-activation", h.ctx);
assert.equal(h.record().current.runtime_active, true); assert.equal(h.activeTools().includes("write"), true); assert.equal(h.activeTools().includes("request_context_reset"), true); assert.equal(h.activeTools().includes("acknowledge_context_candidate"), false);

// Settled/compaction hooks freshly classify instead of trusting cached current
// state after an external pointer swap, so a stale predecessor starts no model work.
h = makeHarness("current"); await h.start();
const externallySwapped = h.record(); externallySwapped.current = endpoint("w:new-current"); externallySwapped.candidate = { ...endpoint("w:p1", { readOnly: true, active: false }), expected_current_pane_id: "w:new-current", phase: "predecessor" }; h.setRecord(externallySwapped);
await h.listeners.get("agent_settled")({}, h.ctx); assert.equal(h.compactCalls(), 0);
call = 0; const staleCompaction = await h.listeners.get("session_before_compact")({ branchEntries: [{ type: "message", id: "e1", message: { role: "user", content: "exact" } }], preparation: { tokensBefore: 1 }, signal: undefined }, h.ctx); assert.equal(staleCompaction, undefined); assert.equal(call, 0, "stale predecessor started a compactor model call");

// A stale predecessor can inspect but cannot mutate or acknowledge. Current
// runtime tool calls and user Bash both hit the durable guard before side effects.
h = makeHarness("stale"); await h.start(); assert.equal((await h.listeners.get("tool_call")({ toolName: "read", input: { path: "." } }, h.ctx)), undefined); assert.equal((await h.listeners.get("tool_call")({ toolName: "request_context_reset", input: testimony }, h.ctx)).block, true); assert.equal((await h.listeners.get("user_bash")({ command: "true" }, h.ctx)).result.exitCode, 126);
h = makeHarness("current"); await h.start(); assert.equal((await h.listeners.get("tool_call")({ toolName: "write", input: {} }, h.ctx)), undefined); assert.equal(h.record().current.mutated, true); assert.equal(await h.listeners.get("user_bash")({ command: "touch x" }, h.ctx), undefined);

console.log("test-qq-context-lifecycle: deterministic unit checks pass");
JS
node "$ROOT/tests/probes/qq-context-exact-model.mjs" --validate-corpus-only --corpus "$ROOT/tests/fixtures/qq-context-exact-model-corpus.json" >/dev/null
printf 'test-qq-context-lifecycle: pass\n'
