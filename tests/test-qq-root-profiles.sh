#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-root-profiles"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d "${TMPDIR:?TMPDIR is required}/qq-root-profiles.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

ROOT="$ROOT" TMP="$TMP" node --experimental-strip-types --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.ROOT; const scratch = process.env.TMP;
const alignerPath = join(root, "extensions/qq-aligner.ts"); const alignerPrompt = await readFile(join(root, "delegation/manifests/roots/aligner.md"), "utf8");
const launcherTools = ["alignment_exchange", "create_alignment_artifact", "present_alignment", "capture_operator_disposition", "complete_alignment"];
class Bus {
  constructor() { this.handlers = new Map(); this.spawnCount = 0; this.status = "stopped"; this.stopError = null; }
  on(name, fn) { const rows = this.handlers.get(name) ?? []; rows.push(fn); this.handlers.set(name, rows); return () => this.handlers.set(name, rows.filter((row) => row !== fn)); }
  emit(name, value) {
    if (name === "subagents:rpc:v1:request") {
      if (value.method === "spawn") this.spawnCount += 1;
      const runId = value.params?.id ?? `orchestrator-${this.spawnCount}`;
      if (value.method === "stop" && this.stopError !== null) {
        queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: false, error: { code: this.stopError, message: "fixture stop refusal" } })); return;
      }
      const data = value.method === "spawn" ? { details: { runId } } : value.method === "stop" ? { runId, state: "stopping" }
        : value.params?.id ? { text: `Run: ${runId}\nState: ${this.status}`, details: { mode: "management", results: [] } }
        : { text: `Spawn budget: unlimited\n${this.spawnCount > 0 && this.status === "running" ? `Active async runs: ${this.spawnCount}` : "No active async runs."}`, details: { mode: "single", results: [] } };
      queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: true, data })); return;
    }
    for (const fn of this.handlers.get(name) ?? []) fn(value);
  }
}
function harness(label) {
  const tools = new Map(); const commands = new Map(); const handlers = new Map(); const active = [...launcherTools]; const bus = new Bus(); const notices = [];
  let shutdowns = 0; let sessionFile = join(scratch, `${label}-root.jsonl`); const stores = new Map([[sessionFile, []]]); let next = 1;
  const entries = () => stores.get(sessionFile) ?? [];
  const pi = {
    events: bus, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); },
    on(name, fn) { const rows = handlers.get(name) ?? []; rows.push(fn); handlers.set(name, rows); }, setActiveTools(names) { active.splice(0, active.length, ...names); },
    getActiveTools() { return [...active]; }, getAllTools() { return [...tools.values()]; }, sendUserMessage() {},
    appendEntry(customType, data) { const rows = entries(); rows.push({ type: "custom", id: `entry-${next++}`, parentId: rows.at(-1)?.id ?? null, timestamp: new Date().toISOString(), customType, data: structuredClone(data) }); },
  };
  const manager = { getSessionFile: () => sessionFile, getBranch: () => [...entries()] };
  const ctx = { cwd: root, mode: "tui", hasUI: true, sessionManager: manager, ui: { notify(message, level) { notices.push({ message, level }); } }, shutdown() { shutdowns += 1; } };
  async function fire(name, event = {}) { let result; for (const fn of handlers.get(name) ?? []) { const candidate = await fn(event, ctx); if (candidate !== undefined) result = candidate; } return result; }
  async function persist(file = sessionFile) { const rows = stores.get(file) ?? []; await writeFile(file, `${JSON.stringify({ type: "session", version: 3 })}\n${rows.map(JSON.stringify).join("\n")}${rows.length ? "\n" : ""}`); }
  return { pi, bus, tools, commands, active, handlers, ctx, notices, fire, persist, entries,
    setSessionFile(value) { sessionFile = value; if (!stores.has(value)) stores.set(value, []); }, sessionFile: () => sessionFile, shutdowns: () => shutdowns };
}
for (const reason of ["startup", "resume", "fork"]) {
  process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1"; const h = harness(reason); let driftPrompt = false;
  const { default: register, qqAlignerProfile } = await import(pathToFileURL(alignerPath).href + `?${reason}`); await h.persist();
  await register(h.pi, { readFile: async () => driftPrompt ? `${alignerPrompt}\ndrift` : alignerPrompt,
    brokerOptions: { runtimeRoot: join(scratch, `${reason}-runtime`), traceId: "a".repeat(32), pollMs: 5, exchangeTimeoutMs: 1000, stopTimeoutMs: 100 } });
  assert.deepEqual([...h.tools.keys()].sort(), [...qqAlignerProfile.tools].sort()); assert.equal(h.tools.has("subagent"), false);
  assert.equal(h.tools.has("open_alignment_evidence"), false); assert.equal(h.tools.has("complete_alignment"), true);
  await h.fire("session_start", { reason }); assert.equal(h.bus.spawnCount, 0);
  await h.fire("resources_discover", { reason: "startup" }); assert.equal(h.bus.spawnCount, 1); assert.deepEqual([...h.active].sort(), [...qqAlignerProfile.tools].sort());
  await h.fire("input", { source: "interactive", text: `operator ${reason}` });
  const turn = await h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
  assert.equal(turn.systemPrompt, alignerPrompt); assert.equal(turn.message.customType, "qq-alignment-session-receipt");
  await h.fire("session_compact", {}); assert.equal((await h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } })).systemPrompt, alignerPrompt);
  h.active.push("bash"); await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } }), /active-tool drift/); h.active.pop();
  await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [{ path: "AGENTS.md" }], skills: [] } }), /forbidden prompt/);
  driftPrompt = true; await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } }), /prompt source drifted/); driftPrompt = false;
  assert.equal(h.commands.has("architect"), false); await h.commands.get("handoff").handler("", h.ctx); assert.match(h.notices.at(-1).message, /does not create or focus/);
  const firstSession = JSON.parse(turn.message.content).session_id; const predecessor = h.sessionFile(); const replacement = join(scratch, `${reason}-replacement.jsonl`);
  h.setSessionFile(replacement); await h.persist(); h.setSessionFile(predecessor);
  const replacementReason = reason === "startup" ? "new" : reason;
  if (replacementReason === "fork") assert.deepEqual(await h.fire("session_before_fork", { entryId: "selected", position: "at" }), undefined);
  else assert.deepEqual(await h.fire("session_before_switch", { reason: replacementReason, ...(replacementReason === "resume" ? { targetSessionFile: replacement } : {}) }), undefined);
  await h.fire("session_shutdown", { reason: replacementReason, ...(replacementReason === "resume" ? { targetSessionFile: replacement } : {}) });
  await h.persist(predecessor); h.setSessionFile(replacement);
  await h.fire("session_start", { reason: replacementReason, previousSessionFile: predecessor }); assert.equal(h.bus.spawnCount, 1);
  await h.fire("resources_discover", { reason: "startup" }); assert.equal(h.bus.spawnCount, 2);
  const replacementTurn = await h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
  assert.equal(JSON.parse(replacementTurn.message.content).session_id, firstSession); await h.fire("session_shutdown", { reason: "quit" }); delete process.env.QQ_PI_ROOT_PROFILE;
}

// Reload reconstructs from the current active native branch and does not overlap.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1"; const reload = harness("reload"); await reload.persist();
const { default: registerReload } = await import(pathToFileURL(alignerPath).href + "?reload");
await registerReload(reload.pi, { readFile: async () => alignerPrompt, brokerOptions: { runtimeRoot: join(scratch, "reload-runtime"), traceId: "d".repeat(32), pollMs: 5, stopTimeoutMs: 100 } });
await reload.fire("session_start", { reason: "startup" }); await reload.fire("resources_discover", {});
const before = await reload.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
await reload.fire("session_shutdown", { reason: "reload" }); await reload.fire("session_start", { reason: "reload" }); assert.equal(reload.bus.spawnCount, 1);
await reload.fire("resources_discover", {}); const after = await reload.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
assert.equal(reload.bus.spawnCount, 2); assert.equal(JSON.parse(after.message.content).session_id, JSON.parse(before.message.content).session_id);
await reload.fire("session_shutdown", { reason: "quit" }); delete process.env.QQ_PI_ROOT_PROFILE;

// A persisted crashed root initializes as recovery-required without spawning.
// Reconciliation starts only after resources_discover rebinds the RPC bridge.
for (const failure of [false, true]) {
  process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1"; const recovery = harness(failure ? "recovery-fails" : "recovery-succeeds");
  recovery.pi.appendEntry("qq-alignment-state-v1", { version: 1, alignment_session_id: "session-recovered", trace_id: "e".repeat(32), event: "lifecycle", payload: { reason: "startup", pi_session_file: recovery.sessionFile() } });
  recovery.pi.appendEntry("qq-alignment-state-v1", { version: 1, alignment_session_id: "session-recovered", trace_id: "e".repeat(32), event: "orchestrator-start", payload: { run_id: "recorded-run", resumed: false } });
  await recovery.persist(); recovery.bus.status = failure ? "running" : "stopped"; recovery.bus.stopError = failure ? "not_found" : null;
  const { default: registerRecovery } = await import(pathToFileURL(alignerPath).href + `?recovery-${failure}`);
  await registerRecovery(recovery.pi, { readFile: async () => alignerPrompt, brokerOptions: { runtimeRoot: join(scratch, `recovery-runtime-${failure}`), pollMs: 2, stopTimeoutMs: 15 } });
  await recovery.fire("session_start", { reason: "startup" }); assert.equal(recovery.shutdowns(), 0); assert.equal(recovery.bus.spawnCount, 0);
  await recovery.fire("resources_discover", {});
  if (failure) {
    assert.equal(recovery.bus.spawnCount, 0); assert.equal(recovery.shutdowns(), 1); assert.equal(recovery.entries().at(-1).data.event, "recovery");
  } else {
    assert.equal(recovery.bus.spawnCount, 1); assert.equal(recovery.shutdowns(), 0);
    const events = recovery.entries().map((entry) => entry.data.event); assert.ok(events.indexOf("orchestrator-terminal") < events.lastIndexOf("orchestrator-start"));
    recovery.bus.status = "stopped"; await recovery.fire("session_shutdown", { reason: "quit" });
  }
  delete process.env.QQ_PI_ROOT_PROFILE;
}

// Visibility opens only after accepted presentation is rendered.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1"; const visibility = harness("visibility"); const visible = []; visibility.bus.on("alignment:operator-turn-opened", (event) => visible.push(event));
class VisibilityBroker {
  constructor() { this.traceId = "c".repeat(32); this.changeId = "T-165.1"; this.exchanges = new Set(["exchange-visible"]); this.provenanceIds = new Set(["source-visible"]); this.orchestratorLifecycle = "running"; this.sessionId = "visible-session"; this.closed = false; this.records = []; }
  async initialize() {} async startOrchestrator() { return "visible-run"; } async shutdown() {} async record(event, payload) { this.records.push({ event, payload }); }
  sessionReceipt() { return { version: 1, session_id: this.sessionId, trace_id: this.traceId, reply_to: this.traceId, orchestrator_run_id: "visible-run", lifecycle: "running" }; }
}
const { default: registerVisibility } = await import(pathToFileURL(alignerPath).href + "?visibility");
await registerVisibility(visibility.pi, { Broker: VisibilityBroker, readFile: async () => alignerPrompt }); await visibility.fire("session_start", { reason: "startup" }); await visibility.fire("resources_discover", {});
const episode = { version: 1, change_id: "T-165.1", exchange_id: "exchange-visible", trace_id: "c".repeat(32), episode: "realignment", outcome: "ready", criteria_trigger: "changed", presentation: { spoken: "spoken", visual: { format: "markdown", content: "visual", provenance: ["source-visible"] } } };
let result = await visibility.tools.get("present_alignment").execute("one", { episode }); assert.equal(result.isError, undefined); assert.equal(visible.length, 0);
await visibility.fire("message_end", { message: { role: "assistant", stopReason: "aborted", content: [] } }); assert.equal(visible.length, 0);
result = await visibility.tools.get("present_alignment").execute("two", { episode }); assert.equal(result.isError, undefined);
await visibility.fire("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "ready" }] } }); assert.equal(visible.length, 1); assert.equal(visible[0].opening_reason, "realignment");
delete process.env.QQ_PI_ROOT_PROFILE;

process.env.QQ_PI_ROOT_PROFILE = "qq-root-architect-v1";
await assert.rejects(async () => { const { default: register } = await import(pathToFileURL(alignerPath).href + "?wrong"); await register(harness("wrong").pi, { readFile: async () => alignerPrompt }); }, /profile marker/);
delete process.env.QQ_PI_ROOT_PROFILE;
console.log("test-qq-root-profiles: pass");
JS

[ ! -e "$ROOT/extensions/qq-architect-root.ts" ] || fail 'T-165.1 Architect root extension remains'
[ ! -e "$ROOT/delegation/manifests/roots/architect.md" ] || fail 'T-165.1 Architect root manifest remains'
[ ! -e "$ROOT/bin/qq-architect" ] || fail 'T-165.1 Architect executable remains'
printf 'test-qq-root-profiles: pass\n'
