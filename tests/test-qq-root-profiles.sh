#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-root-profiles"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ROOT="$ROOT" TMP="$TMP" node --experimental-strip-types --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.ROOT;
const scratch = process.env.TMP;
const alignerPath = join(root, "extensions/qq-aligner.ts");
const alignerPrompt = await readFile(join(root, "delegation/manifests/roots/aligner.md"), "utf8");

class Bus {
  constructor() { this.handlers = new Map(); this.spawnCount = 0; }
  on(name, fn) { const rows = this.handlers.get(name) ?? []; rows.push(fn); this.handlers.set(name, rows); return () => this.handlers.set(name, rows.filter((row) => row !== fn)); }
  emit(name, value) {
    if (name === "subagents:rpc:v1:request") {
      if (value.method === "spawn") this.spawnCount += 1;
      const runId = value.params?.id ?? `orchestrator-${this.spawnCount}`;
      const data = value.method === "spawn" ? { details: { runId } }
        : value.method === "stop" ? { runId, state: "stopping" }
        : { text: `Run: ${runId}\nState: stopped`, details: { mode: "single", results: [] } };
      queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: true, data }));
      return;
    }
    for (const fn of this.handlers.get(name) ?? []) fn(value);
  }
}

function harness(label) {
  const tools = new Map(); const commands = new Map(); const handlers = new Map(); const active = [];
  const bus = new Bus(); const notices = []; const execs = []; let shutdowns = 0;
  let sessionFile = join(scratch, `${label}-root.jsonl`);
  const pi = {
    events: bus,
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, command) { commands.set(name, command); },
    on(name, fn) { const rows = handlers.get(name) ?? []; rows.push(fn); handlers.set(name, rows); },
    setActiveTools(names) { active.splice(0, active.length, ...names); },
    getActiveTools() { return [...active]; },
    getAllTools() { return [...tools.values()]; },
    sendUserMessage() {},
    async exec(command, args, options) { execs.push({ command, args, options }); return { code: 2, stderr: "no-focus API unavailable", stdout: "", killed: false }; },
  };
  const ctx = {
    cwd: root, mode: "tui", hasUI: true,
    sessionManager: { getSessionFile() { return sessionFile; } },
    ui: { notify(message, level) { notices.push({ message, level }); } },
    shutdown() { shutdowns += 1; },
  };
  async function fire(name, event = {}) { let result; for (const fn of handlers.get(name) ?? []) { const candidate = await fn(event, ctx); if (candidate !== undefined) result = candidate; } return result; }
  return { label, pi, bus, tools, commands, active, handlers, ctx, notices, execs, fire, setSessionFile(value) { sessionFile = value; }, sessionFile: () => sessionFile, shutdowns: () => shutdowns };
}

for (const reason of ["startup", "resume", "fork"]) {
  process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1";
  const h = harness(reason);
  let driftPrompt = false;
  const { default: register, qqAlignerProfile } = await import(pathToFileURL(alignerPath).href + `?${reason}`);
  await writeFile(h.sessionFile(), '{"type":"session","version":3}\n');
  await register(h.pi, {
    readFile: async () => driftPrompt ? `${alignerPrompt}\ndrift` : alignerPrompt,
    brokerOptions: { stateRoot: join(scratch, `${reason}-state`), runtimeRoot: join(scratch, `${reason}-runtime`), traceId: "a".repeat(32), pollMs: 5, exchangeTimeoutMs: 1000 },
  });
  assert.deepEqual([...h.tools.keys()].sort(), [...qqAlignerProfile.tools].sort());
  assert.equal(h.tools.has("subagent"), false);
  await h.fire("session_start", { reason });
  assert.equal(h.bus.spawnCount, 0, `${reason} spawned before the replacement RPC bridge lifecycle`);
  await h.fire("resources_discover", { reason: "startup" });
  assert.equal(h.bus.spawnCount, 1, `${reason} did not start exactly one orchestrator`);
  assert.deepEqual([...h.active].sort(), [...qqAlignerProfile.tools].sort());
  await h.fire("input", { source: "interactive", text: `operator ${reason}` });
  const turn = await h.fire("before_agent_start", { prompt: `operator ${reason}`, systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
  assert.equal(turn.systemPrompt, alignerPrompt);
  assert.equal(turn.message.customType, "qq-alignment-session-receipt");
  // Compaction does not weaken the next turn's replacement prompt.
  await h.fire("session_compact", {});
  assert.equal((await h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } })).systemPrompt, alignerPrompt);
  h.active.push("bash");
  await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } }), /active-tool drift/);
  h.active.pop();
  await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [{ path: "AGENTS.md" }], skills: [], appendSystemPrompt: [] } }), /forbidden prompt/);
  driftPrompt = true;
  await assert.rejects(() => h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } }), /prompt source drifted/);
  driftPrompt = false;
  await h.commands.get("architect").handler("", h.ctx);
  assert.deepEqual(h.execs[0].args, ["--background"]);
  assert.match(h.notices.at(-1).message, /no-focus API/);
  await h.commands.get("handoff").handler("", h.ctx);
  assert.match(h.notices.at(-1).message, /does not create or focus a Herdr tab/);
  // A duplicate start refuses. A real Pi switch first prepares the old
  // instance, tears it down, then starts a new instance with previousSessionFile.
  // The root runtime changes, while the alignment session remains continuous.
  const firstSession = JSON.parse(turn.message.content).session_id;
  const predecessorPiSession = h.sessionFile();
  const replacementPiSession = join(scratch, `${reason}-replacement.jsonl`);
  await writeFile(replacementPiSession, '{"type":"session","version":3}\n');
  await h.fire("session_start", { reason: "reload" });
  assert.equal(h.bus.spawnCount, 1); assert.equal(h.shutdowns(), 1);
  assert.deepEqual(await h.fire("session_before_switch", { reason: "resume", targetSessionFile: replacementPiSession }), undefined);
  await h.fire("session_shutdown", { reason: "resume", targetSessionFile: replacementPiSession });
  h.setSessionFile(replacementPiSession);
  await h.fire("session_start", { reason: "resume", previousSessionFile: predecessorPiSession });
  assert.equal(h.bus.spawnCount, 1);
  await h.fire("resources_discover", { reason: "startup" });
  assert.equal(h.bus.spawnCount, 2);
  const replacement = await h.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
  assert.equal(JSON.parse(replacement.message.content).session_id, firstSession);
  await h.fire("session_shutdown", { reason: "quit" });
  delete process.env.QQ_PI_ROOT_PROFILE;
}

// /reload has no session_before_* event. The profile shutdown therefore
// prepares continuity while the old RPC bridge is still alive, and the new
// instance reclaims that exact session before resources_discover may spawn.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1";
const reloadHarness = harness("reload-lifecycle");
await writeFile(reloadHarness.sessionFile(), '{"type":"session","version":3}\n');
const { default: registerReload } = await import(pathToFileURL(alignerPath).href + "?reload-lifecycle");
await registerReload(reloadHarness.pi, {
  readFile: async () => alignerPrompt,
  brokerOptions: { stateRoot: join(scratch, "reload-state"), runtimeRoot: join(scratch, "reload-runtime"), traceId: "d".repeat(32), pollMs: 5, stopTimeoutMs: 100 },
});
await reloadHarness.fire("session_start", { reason: "startup" });
await reloadHarness.fire("resources_discover", { reason: "startup" });
const reloadBefore = await reloadHarness.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
await reloadHarness.fire("session_shutdown", { reason: "reload" });
await reloadHarness.fire("session_start", { reason: "reload" });
assert.equal(reloadHarness.bus.spawnCount, 1);
await reloadHarness.fire("resources_discover", { reason: "reload" });
const reloadAfter = await reloadHarness.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
assert.equal(reloadHarness.bus.spawnCount, 2);
assert.equal(JSON.parse(reloadAfter.message.content).session_id, JSON.parse(reloadBefore.message.content).session_id);
await reloadHarness.fire("session_shutdown", { reason: "quit" });
delete process.env.QQ_PI_ROOT_PROFILE;

// Post-render observability fires only when the accepted assistant presentation
// has finished, never at tool validation.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-aligner-v1";
const visibilityHarness = harness("visibility");
const visibilityEvents = []; visibilityHarness.bus.on("alignment:operator-turn-opened", (event) => visibilityEvents.push(event));
class VisibilityBroker {
  constructor() { this.traceId = "c".repeat(32); this.changeId = "T-165.1"; this.exchanges = new Set(["exchange-visible"]); this.evidenceIds = new Set(["cap-visible"]); this.entries = []; this.orchestratorLifecycle = "running"; this.sessionId = "visible-session"; }
  async initialize() {} async startOrchestrator() { return "visible-run"; } async shutdown() {}
  sessionReceipt() { return { version: 1, session_id: this.sessionId, trace_id: this.traceId, reply_to: this.traceId, orchestrator_run_id: "visible-run", lifecycle: "running" }; }
  async journal(type, payload) { this.entries.push({ type, payload }); }
}
const { default: registerVisibility } = await import(pathToFileURL(alignerPath).href + "?visibility");
await registerVisibility(visibilityHarness.pi, { Broker: VisibilityBroker, readFile: async () => alignerPrompt });
await visibilityHarness.fire("session_start", { reason: "startup" });
await visibilityHarness.fire("resources_discover", { reason: "startup" });
const visibleEpisode = { version: 1, change_id: "T-165.1", exchange_id: "exchange-visible", trace_id: "c".repeat(32), episode: "realignment", outcome: "ready", criteria_trigger: "criterion changed", presentation: { spoken: "spoken", visual: { format: "markdown", content: "visual", provenance: ["cap-visible"] } } };
let presented = await visibilityHarness.tools.get("present_alignment").execute("present-aborted", { episode: visibleEpisode });
assert.equal(presented.isError, undefined); assert.equal(visibilityEvents.length, 0);
await visibilityHarness.fire("message_end", { message: { role: "assistant", stopReason: "aborted", content: [] } });
await visibilityHarness.fire("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Unrelated later text" }] } });
assert.equal(visibilityEvents.length, 0);
presented = await visibilityHarness.tools.get("present_alignment").execute("present-1", { episode: visibleEpisode });
assert.equal(presented.isError, undefined);
await visibilityHarness.fire("message_end", { message: { role: "toolResult" } }); assert.equal(visibilityEvents.length, 0);
await visibilityHarness.fire("message_end", { message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "open_alignment_evidence" }] } }); assert.equal(visibilityEvents.length, 0);
await visibilityHarness.fire("message_end", { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Operator-ready realignment" }] } });
assert.equal(visibilityEvents.length, 1); assert.equal(visibilityEvents[0].opening_reason, "realignment");
assert.equal(visibilityEvents[0].exchange_id, "exchange-visible");
delete process.env.QQ_PI_ROOT_PROFILE;

// Marker drift fails at extension load, before any tool can become active.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-architect-v1";
await assert.rejects(async () => {
  const { default: register } = await import(pathToFileURL(alignerPath).href + "?wrong-marker");
  await register(harness("wrong").pi, { readFile: async () => alignerPrompt });
}, /profile marker/);
delete process.env.QQ_PI_ROOT_PROFILE;

// The immutable Architect wrapper exposes only the landed findings
// disposition/intake contract. It receives no raw sealed-package authority.
process.env.QQ_PI_ROOT_PROFILE = "qq-root-architect-v1";
const architectHarness = harness("architect");
const { default: registerArchitectRoot } = await import(pathToFileURL(join(root, "extensions/qq-architect-root.ts")).href + "?profile-test");
await registerArchitectRoot(architectHarness.pi);
await architectHarness.fire("session_start", { reason: "startup" });
assert.deepEqual(architectHarness.active, ["architect_disposition"]);
assert.equal(architectHarness.tools.has("architect_disposition"), true);
assert.equal(architectHarness.tools.has("open_sealed_alignment_package"), false);
assert.equal(architectHarness.tools.has("alignment_exchange"), false);
const architectTurn = await architectHarness.fire("before_agent_start", { systemPromptOptions: { contextFiles: [], skills: [], appendSystemPrompt: [] } });
assert.match(architectTurn.systemPrompt, /Observer owns that audit/);
assert.doesNotMatch(architectTurn.systemPrompt, /open sealed|raw sealed-package opener/i);
delete process.env.QQ_PI_ROOT_PROFILE;

console.log("test-qq-root-profiles: pass");
JS

# Runtime identity behavior is covered by isolated generation fixtures in
# test-qq-pi-runtime.sh; root-profile checks remain host-activation independent.

printf 'test-qq-root-profiles: pass\n'
