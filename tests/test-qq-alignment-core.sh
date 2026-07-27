#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-alignment-core"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d "${TMPDIR:?TMPDIR is required}/qq-alignment-core.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

for schema in alignment-episode.v1 aligner-request.v1 orchestrator-projection.v1 operator-disposition-receipt.v1; do
  jq -e '.type == "object" and .additionalProperties == false' "$ROOT/delegation/manifests/$schema.schema.json" >/dev/null
done
jq -e '.properties.operator_response.maxLength == 16384' "$ROOT/delegation/manifests/operator-disposition-receipt.v1.schema.json" >/dev/null
[ ! -e "$ROOT/delegation/manifests/evidence-capability.v1.schema.json" ] || fail 'evidence capability schema remains'
[ ! -e "$ROOT/delegation/manifests/sealed-alignment-package.v1.schema.json" ] || fail 'sealed package schema remains'
jq -e '
  ."$defs".suppliedMaterial.maxItems == 16
  and ."$defs".suppliedMaterial.items.additionalProperties == false
  and ."$defs".suppliedMaterial.items.properties.text.maxLength == 16384
  and ."$defs".source.additionalProperties == false
  and (.properties.material.properties | has("evidence_capability_ids") | not)
  and (.properties.material.properties | has("trace_references") | not)
' "$ROOT/delegation/manifests/orchestrator-projection.v1.schema.json" >/dev/null
if jq -r '.. | objects | .properties? // {} | keys[]' "$ROOT/delegation/manifests/aligner-request.v1.schema.json" \
  | grep -E '^(agent|role|task|cwd|branch|command|priority|schedule|dispatch|retry|stop|merge|task_state|delivery_state)$'; then
  fail 'aligner request schema exposes forbidden authority'
fi

ROOT="$ROOT" TMP="$TMP" node --experimental-strip-types --input-type=module <<'JS'
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.ROOT; const scratch = process.env.TMP;
const contracts = await import(pathToFileURL(join(root, "extensions/lib/qq-alignment-contracts.ts")));
const { AlignmentBroker, childContinuityProjection, protocolState, readNativeSessionBranch, reduceProtocolState, alignmentBrokerConstants } = await import(pathToFileURL(join(root, "extensions/lib/qq-alignment-broker.ts")));
const trace = "1".repeat(32); const change = "T-165.1"; const id = (prefix) => `${prefix}-${randomUUID()}`;
function request(kind, exchange, requestId, replyTo, operatorText, payload) {
  return { version: 1, change_id: change, exchange_id: exchange, trace_id: trace, request_id: requestId, reply_to: replyTo, kind, operator_text: operatorText, interpretation: `Interpretation of ${operatorText}`, payload };
}
function supplied(index = 1, text = "bounded source excerpt") {
  return { material_id: `material-${index}`, text, source: { source_id: `source-${index}`, kind: "repository", reference: `extensions/example.ts:L${index}` } };
}
function projection(kind, lifecycle, req, options = {}) {
  return { version: 1, change_id: req.change_id, exchange_id: req.exchange_id, trace_id: req.trace_id, packet_id: id("packet"), reply_to: req.request_id, lifecycle, kind,
    material: { facts: options.facts ?? ["Observed fact"], inferences: options.inferences ?? [], recommendation: options.recommendation ?? null,
      uncertainties: options.uncertainties ?? [], supplied_material: options.material ?? [], worker_run_ids: options.workers ?? [], decision: options.decision ?? null, next_operator_input: options.next ?? null } };
}
const validReq = request("intent", id("exchange"), id("request"), trace, "Build the approved core.", { text: "Approved operator intent." });
contracts.validateAlignerRequest(validReq);
const validProjection = projection("status", "running", validReq, { material: [supplied()] });
contracts.validateOrchestratorProjection(validProjection);
for (const mutate of [
  (v) => { v.material.supplied_material[0].path = "/repo/secret"; },
  (v) => { v.material.supplied_material[0].capability_id = "cap-forbidden"; },
  (v) => { v.material.supplied_material[0].source.range = { start: 0, length: 1 }; },
  (v) => { v.material.supplied_material[0].source.source_id = "bad id"; },
  (v) => { v.material.supplied_material[0].source.reference = "one\ntwo"; },
  (v) => { v.material.supplied_material[0].text = "x".repeat(16385); },
]) { const candidate = structuredClone(validProjection); mutate(candidate); assert.throws(() => contracts.validateOrchestratorProjection(candidate), contracts.AlignmentContractError); }
const tooMany = structuredClone(validProjection); tooMany.material.supplied_material = Array.from({ length: 17 }, (_, index) => supplied(index + 1));
assert.throws(() => contracts.validateOrchestratorProjection(tooMany), /at most 16/);
const aggregate = structuredClone(validProjection); aggregate.material.supplied_material = Array.from({ length: 5 }, (_, index) => supplied(index + 1, "é".repeat(8192)));
assert.throws(() => contracts.validateOrchestratorProjection(aggregate), /aggregate text bound/);
const exactBound = structuredClone(validProjection); exactBound.material.supplied_material = []; exactBound.material.facts = Array.from({ length: 52 }, () => "x".repeat(20000));
exactBound.material.facts.push("x");
const finalFactBytes = contracts.MAX_ALIGNMENT_PACKET_BYTES - Buffer.byteLength(JSON.stringify(exactBound), "utf8") + 1;
assert.ok(finalFactBytes > 0 && finalFactBytes <= 20000); exactBound.material.facts[exactBound.material.facts.length - 1] = "x".repeat(finalFactBytes);
assert.equal(Buffer.byteLength(JSON.stringify(exactBound), "utf8"), contracts.MAX_ALIGNMENT_PACKET_BYTES);
contracts.validateOrchestratorProjection(exactBound);
const overBound = structuredClone(exactBound); overBound.material.facts[overBound.material.facts.length - 1] += "x";
assert.equal(Buffer.byteLength(JSON.stringify(overBound), "utf8"), contracts.MAX_ALIGNMENT_PACKET_BYTES + 1);
assert.throws(() => contracts.validateOrchestratorProjection(overBound), /serialized packet bound/);
const reproducedOversize = structuredClone(validProjection); reproducedOversize.material.supplied_material = []; reproducedOversize.material.facts = Array.from({ length: 53 }, () => "x".repeat(20000));
assert.throws(() => contracts.validateOrchestratorProjection(reproducedOversize), /serialized packet bound/);
const multibyteReceipt = { version: 1, receipt_id: "receipt-multibyte", change_id: change, exchange_id: "exchange-multibyte", trace_id: trace,
  decision_id: "decision-multibyte", decision_packet_id: "packet-multibyte", outcome: "accepted", operator_response: "é".repeat(8192), confirmation: "accept", captured_at: new Date().toISOString() };
contracts.validateDispositionReceipt(multibyteReceipt);
assert.equal(Buffer.byteLength(multibyteReceipt.operator_response, "utf8"), contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES);
assert.throws(() => contracts.validateDispositionReceipt({ ...multibyteReceipt, operator_response: `${multibyteReceipt.operator_response}é` }), /UTF-8 byte bound/);
assert.throws(() => contracts.validateOrchestratorProjection({ ...validProjection, material: { ...validProjection.material, evidence_capability_ids: [] } }), /unknown field/);
assert.throws(() => contracts.validateOrchestratorProjection({ ...validProjection, material: { ...validProjection.material, trace_references: [] } }), /unknown field/);

class NativeStore {
  constructor(file) { this.file = file; this.entries = []; this.next = 1; this.failEvent = null; }
  append(customType, data, parentId = undefined) {
    if (this.failEvent === "*" || this.failEvent === data.event) throw new Error(`fixture append failure: ${data.event}`);
    const entry = { type: "custom", id: `entry-${this.next++}`, parentId: parentId === undefined ? this.entries.at(-1)?.id ?? null : parentId,
      timestamp: new Date().toISOString(), customType, data: structuredClone(data) };
    this.entries.push(entry); return entry.id;
  }
  manager() { return { getSessionFile: () => this.file, getBranch: () => [...this.entries] }; }
  async persist(parentSession = undefined) {
    const header = { type: "session", version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd: root, ...(parentSession ? { parentSession } : {}) };
    await writeFile(this.file, `${[header, ...this.entries].map(JSON.stringify).join("\n")}\n`, { mode: 0o600 });
  }
}
class Events {
  constructor() { this.handlers = new Map(); this.spawnCount = 0; this.spawnTasks = []; this.stopCount = 0; this.status = "stopped"; this.statusRunId = null; this.listStatusText = null; this.stopError = null; this.unavailable = false; }
  on(name, fn) { const rows = this.handlers.get(name) ?? []; rows.push(fn); this.handlers.set(name, rows); return () => this.handlers.set(name, rows.filter((row) => row !== fn)); }
  emit(name, value) {
    if (name === "subagents:rpc:v1:request") {
      if (this.unavailable) { queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: false, error: { code: "no_active_session", message: "fixture RPC unavailable" } })); return; }
      if (value.method === "spawn") { this.spawnCount += 1; this.spawnTasks.push(value.params?.task); }
      if (value.method === "stop") this.stopCount += 1;
      if (value.method === "stop" && this.stopError) {
        queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: false, error: { code: this.stopError, message: "fixture stop refusal" } })); return;
      }
      const runId = value.method === "spawn" ? `orchestrator-run-${this.spawnCount}` : value.params?.id;
      if (value.method === "spawn") this.statusRunId = runId;
      const data = value.method === "spawn" ? { details: { runId } } : value.method === "stop" ? { runId, state: "stopping" }
        : value.params?.id ? { text: `Run: ${this.statusRunId}\nState: ${this.status}`, details: { mode: "management", results: [] } }
        : { text: this.listStatusText ?? `Spawn budget: unlimited\n${this.statusRunId !== null && this.status === "running" ? `Active async runs: 1\n\n- ${this.statusRunId} | running` : "No active async runs."}`, details: { mode: "single", results: [] } };
      queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: true, data })); return;
    }
    for (const fn of this.handlers.get(name) ?? []) fn(value);
  }
}
function fixture(label, events = new Events()) {
  const file = join(scratch, `${label}.jsonl`); const store = new NativeStore(file); const messages = [];
  const pi = { events, appendEntry: (type, data) => store.append(type, data), sendUserMessage: (message) => messages.push(message) };
  return { file, store, events, messages, pi };
}
async function atomicPacket(path, packet) {
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, JSON.stringify(packet), { flag: "wx", mode: 0o600 }); await rename(temporary, path);
}
async function answeredExchange(broker, req, packet) {
  const pending = broker.exchange(req); await new Promise((resolve) => setTimeout(resolve, 10));
  await atomicPacket(join(broker.channelRoot, "responses", `${req.exchange_id}.json`), packet); return pending;
}

// The rejected publication pattern deterministically mutates ctime after the
// watched name exists; production and response fixtures publish final bytes once.
const ctimeTemporary = join(scratch, "ctime.tmp"); const ctimePublished = join(scratch, "ctime.json");
await writeFile(ctimeTemporary, "{}", { mode: 0o600 }); await rename(ctimeTemporary, ctimePublished);
const ctimeBefore = (await lstat(ctimePublished, { bigint: true })).ctimeNs; await chmod(ctimePublished, 0o600);
assert.notEqual((await lstat(ctimePublished, { bigint: true })).ctimeNs, ctimeBefore);

const f = fixture("root"); await f.store.persist();
const broker = new AlignmentBroker(f.pi, { cwd: root, runtimeRoot: join(scratch, "runtime"), sessionId: "session-native", traceId: trace,
  piSessionFile: f.file, sessionManager: f.store.manager(), pollMs: 5, exchangeTimeoutMs: 1000, stopTimeoutMs: 100 });
await broker.initialize(); await broker.startOrchestrator(); assert.equal(f.events.spawnCount, 1);
assert.equal((await readdir(broker.channelRoot)).includes("evidence"), false);
assert.equal(typeof broker.openEvidence, "undefined"); assert.equal(typeof broker.seal, "undefined");
let replyTo = trace; let latestRequest;
for (let index = 0; index < 4; index += 1) {
  const text = `operator ${index}`; broker.recordOperatorInput(text);
  const req = request(index ? "status_request" : "intent", id("exchange"), id("request"), replyTo, text, index ? { scope: "change" } : { text: "approved" }); latestRequest = req;
  const packet = projection("status", "running", req, { workers: index === 3 ? ["worker-1"] : [] });
  replyTo = (await answeredExchange(broker, req, packet)).packet_id;
}
assert.equal(f.events.spawnCount, 1); assert.ok(broker.workerRunIds.has("worker-1"));
const notified = projection("completion", "complete", latestRequest);
await atomicPacket(join(broker.channelRoot, "notifications", `notification-${randomUUID()}.json`), notified);
await broker.drainNotifications(); assert.equal(f.messages.length, 1); assert.ok(broker.projections.has(notified.packet_id)); replyTo = notified.packet_id;

broker.recordOperatorInput("Choose the boundary");
const decisionReq = request("clarification", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { text: "decide" });
const decision = { decision_id: "decision-1", question: "Use narrow boundary?", issued_for_operator_text: decisionReq.operator_text };
const material = supplied(50, "The retained boundary is exact.");
const decisionPacket = projection("decision", "waiting", decisionReq, { decision, material: [material] });
replyTo = (await answeredExchange(broker, decisionReq, decisionPacket)).packet_id;
assert.deepEqual(broker.suppliedMaterial.get(material.material_id), material); assert.deepEqual(broker.sourceReferences.get(material.source.source_id), material.source);
const artifact = await broker.createArtifact({ kind: "markdown", title: "Bounded explanation", body: "# Explanation", provenance: [material.material_id, material.source.source_id] });
assert.equal(artifact.temporary, true); assert.deepEqual(artifact.source_references, [material.source]);
await assert.rejects(() => broker.createArtifact({ kind: "markdown", title: "bad", body: "x", provenance: ["/raw/path"] }), /supplied material/);

broker.recordOperatorInput("Yes, use it exactly.");
await assert.rejects(() => broker.captureDisposition({ decision_id: decision.decision_id, outcome: "accepted", operator_response: broker.lastOperatorText }), /substantive operator disposition retained/);
broker.recordOperatorInput("accept");
const receipt = await broker.captureDisposition({ decision_id: decision.decision_id, outcome: "accepted", operator_response: "accept" });
assert.equal(receipt.operator_response, "Yes, use it exactly."); assert.equal(receipt.confirmation, "accept");
broker.recordOperatorInput("unrelated later operator turn");
const staleDispositionReq = request("disposition", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { receipt });
const entriesBeforeStaleDisposition = f.store.entries.length;
await assert.rejects(() => broker.exchange(staleDispositionReq), /receipt-backed by the current operator turn/);
assert.equal(f.store.entries.length, entriesBeforeStaleDisposition); broker.recordOperatorInput("accept");
const dispositionReq = request("disposition", id("exchange"), id("request"), replyTo, "accept", { receipt });
const ack = projection("ack", "running", dispositionReq); replyTo = (await answeredExchange(broker, dispositionReq, ack)).packet_id;

// Pending exchanges block completion and replacement without weakening exact terminal proof.
broker.recordOperatorInput("pending");
const pendingReq = request("status_request", id("exchange"), id("request"), replyTo, "pending", { scope: "change" });
const pendingPacket = projection("status", "running", pendingReq); const pending = broker.exchange(pendingReq); await new Promise((resolve) => setTimeout(resolve, 10));
await assert.rejects(() => broker.finalize(), /pending/); await atomicPacket(join(broker.channelRoot, "responses", `${pendingReq.exchange_id}.json`), pendingPacket); replyTo = (await pending).packet_id;

// A native replacement, not a private continuation file, preserves open decision state.
broker.recordOperatorInput("Continue after resume");
const continueReq = request("clarification", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { text: "preserve open state" });
const continuingDecision = { decision_id: "decision-continuity", question: "Continue?", issued_for_operator_text: continueReq.operator_text };
const continuePacket = projection("decision", "waiting", continueReq, { decision: continuingDecision, material: [supplied(60)] });
await answeredExchange(broker, continueReq, continuePacket);
broker.recordOperatorInput("reshape to X");
await assert.rejects(() => broker.captureDisposition({ decision_id: continuingDecision.decision_id, outcome: "reshaped", operator_response: "reshape to X" }), /substantive/);
const replacementFile = join(scratch, "replacement.jsonl"); const replacementStore = new NativeStore(replacementFile); await replacementStore.persist(f.file);
f.events.status = "stopped"; await broker.prepareReplacement("resume", replacementFile); await f.store.persist();
assert.equal(f.events.stopCount, 1); assert.equal(f.store.entries.at(-1).data.event, "session-replacement");
assert.equal((await readdir(scratch)).some((name) => name.includes("continuation") || name === "journal.jsonl"), false);
const replacementPi = { events: f.events, appendEntry: (type, data) => replacementStore.append(type, data), sendUserMessage: (message) => f.messages.push(message) };
const replacement = new AlignmentBroker(replacementPi, { cwd: root, runtimeRoot: join(scratch, "runtime"), piSessionFile: replacementFile,
  resumeFromSessionFile: f.file, sessionReason: "resume", sessionManager: replacementStore.manager(), pollMs: 5, stopTimeoutMs: 100 });
await replacement.initialize();
assert.equal(replacement.sessionId, "session-native"); assert.equal(replacement.traceId, trace); assert.ok(replacement.openDecisions.has(continuingDecision.decision_id));
assert.equal(replacement.pendingDispositions.get(continuingDecision.decision_id).operator_response, "reshape to X");
await replacement.startOrchestrator(); assert.equal(f.events.spawnCount, 2);
const childProjection = JSON.parse(f.events.spawnTasks.at(-1).split("\n").at(-1));
assert.deepEqual(Object.keys(childProjection), ["version", "change_id", "open_decisions", "pending_dispositions", "accepted_dispositions"]);
assert.deepEqual(childProjection.accepted_dispositions, [{ decision_id: decision.decision_id, outcome: "accepted", operator_response: "Yes, use it exactly." }]);
const childJson = JSON.stringify(childProjection); const rootAuditJson = JSON.stringify(f.store.entries);
for (const excluded of [receipt.receipt_id, receipt.captured_at, material.source.reference, "worker-1", decisionPacket.packet_id, "Observed fact"]) assert.equal(childJson.includes(excluded), false);
for (const retained of [receipt.receipt_id, receipt.captured_at, material.source.reference, "worker-1", decisionPacket.packet_id, "Observed fact"]) assert.equal(rootAuditJson.includes(retained), true);
replacement.recordOperatorInput("reshape"); const continuingReceipt = await replacement.captureDisposition({ decision_id: continuingDecision.decision_id, outcome: "reshaped", operator_response: "reshape" });
assert.equal(continuingReceipt.operator_response, "reshape to X");
f.events.statusRunId = replacement.orchestratorRunId; f.events.status = "stopped";
const completed = await replacement.finalize();
assert.equal(completed.change_id, change); assert.equal(completed.orchestrator_lifecycle, "stopped");
assert.equal(replacementStore.entries.at(-1).data.event, "completion");
assert.equal((await readdir(scratch)).some((name) => /sealed|package|journal/.test(name)), false);

// One reducer admits live and replayed native state transactionally.
function bareBroker(label, events = new Events()) {
  const subject = fixture(label, events); const broker = new AlignmentBroker(subject.pi, { cwd: root, runtimeRoot: join(scratch, `${label}-runtime`), sessionId: `session-${label}`, traceId: trace,
    piSessionFile: subject.file, sessionManager: subject.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
  return { subject, broker };
}
async function openDecision(broker, index, question = "Fit?") {
  const req = request("clarification", `state-exchange-${index}`, `state-request-${index}`, broker.lastProjectionId, `operator-${index}`, { text: "decide" });
  const choice = { decision_id: `state-decision-${index}`, question, issued_for_operator_text: req.operator_text };
  const packet = projection("decision", "waiting", req, { decision: choice }); packet.packet_id = `state-packet-${index}`;
  await broker.record("request", { packet: req }); await broker.record("projection", { source: "direct", packet });
  return { decision_id: choice.decision_id, decision_packet_id: packet.packet_id, exchange_id: req.exchange_id };
}
function pendingPayload(ids, response, outcome = "accepted") { return { pending: { ...ids, outcome, operator_response: response } }; }
function receiptPayload(ids, response, index = ids.decision_id) {
  return { receipt: { version: 1, receipt_id: `receipt-${index}`, change_id: change, exchange_id: ids.exchange_id, trace_id: trace,
    decision_id: ids.decision_id, decision_packet_id: ids.decision_packet_id, outcome: "accepted", operator_response: response, confirmation: "accept", captured_at: "2026-07-27T00:00:00.000Z" } };
}
async function acceptDecision(broker, index, response) {
  const ids = await openDecision(broker, index); await broker.record("disposition-pending", pendingPayload(ids, response)); await broker.record("disposition", receiptPayload(ids, response, index)); return ids;
}

const equivalent = bareBroker("equivalent"); const eq = equivalent.broker; const eqRun = "equivalent-run";
const eqReq = request("clarification", "equivalent-exchange", "equivalent-request", trace, "operator exact", { text: "decide" });
const eqDecision = { decision_id: "equivalent-decision", question: "Choose?", issued_for_operator_text: eqReq.operator_text };
const eqMaterial = supplied(91, "audit-only supplied text"); const eqPacket = projection("decision", "waiting", eqReq, { decision: eqDecision, material: [eqMaterial], workers: ["worker-audit"] }); eqPacket.packet_id = "equivalent-packet";
const eqIds = { decision_id: eqDecision.decision_id, decision_packet_id: eqPacket.packet_id, exchange_id: eqReq.exchange_id };
const eqReceipt = receiptPayload(eqIds, "exact disposition", "equivalent");
const nativeEvents = [
  ["lifecycle", { reason: "startup", pi_session_file: equivalent.subject.file }],
  ["orchestrator-start", { run_id: eqRun, resumed: false }],
  ["request", { packet: eqReq }],
  ["projection", { source: "direct", packet: eqPacket }],
  ["disposition-pending", pendingPayload(eqIds, "exact disposition")],
  ["disposition", eqReceipt],
  ["presentation", { version: 1, change_id: change, exchange_id: eqReq.exchange_id, trace_id: trace, episode: "initial", outcome: "ready", criteria_trigger: null, provenance: [eqMaterial.material_id] }],
  ["artifact", { artifact_id: "artifact-equivalent", kind: "markdown", title: "Exact", provenance: [eqMaterial.source.source_id], sha256: "a".repeat(64) }],
  ["operator-turn-opened", { receipt: { version: 1, change_id: change, exchange_id: eqReq.exchange_id, trace_id: trace, episode: "initial", opening_reason: "decision", opened_at: "2026-07-27T00:00:01.000Z" } }],
  ["recovery", { run_id: eqRun, reason: "fixture", error: "rebound required" }],
  ["orchestrator-terminal", { run_id: eqRun, state: "stopped", proof: "status" }],
  ["session-replacement", { reason: "reload", from_pi_session_file: equivalent.subject.file, target_pi_session_file: null, orchestrator_lifecycle: "stopped" }],
  ["completion", { state: { version: 1, change_id: change, trace_id: trace, session_id: eq.sessionId, completed_at: "2026-07-27T00:00:02.000Z", orchestrator_lifecycle: "stopped", root_session_file: equivalent.subject.file } }],
  ["shutdown", { reason: "quit", orchestrator_lifecycle: "stopped" }],
];
for (const [event, payload] of nativeEvents) await eq.record(event, payload);
assert.deepEqual(new Set(nativeEvents.map(([event]) => event)), new Set(["lifecycle", "request", "projection", "disposition-pending", "disposition", "orchestrator-start", "orchestrator-terminal", "recovery", "session-replacement", "presentation", "artifact", "operator-turn-opened", "completion", "shutdown"]));
const replayed = bareBroker("replayed"); replayed.broker.restoreNative(equivalent.subject.store.entries, "equivalence replay");
assert.deepEqual(protocolState(replayed.broker), protocolState(eq));

// Invalid input and append failure install no candidate and append nothing.
for (const index of [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13]) {
  const value = bareBroker(`append-${index}`); value.broker.restoreNative(equivalent.subject.store.entries.slice(0, index), `append prefix ${index}`);
  const before = protocolState(value.broker); const count = value.subject.store.entries.length; value.subject.store.failEvent = "*";
  await assert.rejects(() => value.broker.record(nativeEvents[index][0], nativeEvents[index][1]), /native alignment state append failed/);
  assert.deepEqual(protocolState(value.broker), before); assert.equal(value.subject.store.entries.length, count);
}
const invalid = bareBroker("invalid-event"); const invalidBefore = protocolState(invalid.broker);
await assert.rejects(() => invalid.broker.record("request", { packet: { version: 1 } }), /missing|malformed|shape/);
assert.deepEqual(protocolState(invalid.broker), invalidBefore); assert.equal(invalid.subject.store.entries.length, 0);

// UTF-8 and aggregate child-projection bounds are reducer admission rules.
const exactMultibyte = bareBroker("exact-multibyte"); const exactMultiIds = await openDecision(exactMultibyte.broker, "multibyte");
exactMultibyte.broker.recordOperatorInput("é".repeat(8192)); const exactMultiBefore = exactMultibyte.subject.store.entries.length;
await assert.rejects(() => exactMultibyte.broker.captureDisposition({ decision_id: exactMultiIds.decision_id, outcome: "accepted", operator_response: exactMultibyte.broker.lastOperatorText }), /substantive/);
assert.equal(exactMultibyte.subject.store.entries.length, exactMultiBefore + 1);
exactMultibyte.broker.recordOperatorInput("accept"); assert.equal((await exactMultibyte.broker.captureDisposition({ decision_id: exactMultiIds.decision_id, outcome: "accepted", operator_response: "accept" })).operator_response, "é".repeat(8192));
const overMultibyte = bareBroker("over-multibyte"); const overMultiIds = await openDecision(overMultibyte.broker, "multibyte-over");
overMultibyte.broker.recordOperatorInput("é".repeat(8193)); const overMultiBefore = overMultibyte.subject.store.entries.length;
await assert.rejects(() => overMultibyte.broker.captureDisposition({ decision_id: overMultiIds.decision_id, outcome: "accepted", operator_response: overMultibyte.broker.lastOperatorText }), /UTF-8 byte bound/);
assert.equal(overMultibyte.subject.store.entries.length, overMultiBefore); assert.equal(overMultibyte.broker.pendingDispositions.size, 0);

const aggregateState = bareBroker("aggregate");
for (let index = 0; index < 7; index += 1) await acceptDecision(aggregateState.broker, index, "x".repeat(contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES));
const aggregateIds = await openDecision(aggregateState.broker, "candidate"); const escaped = (count) => '"\\\n'.repeat(count);
let low = 0; let high = Math.floor(contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES / 3) + 1;
while (low + 1 < high) {
  const middle = Math.floor((low + high) / 2);
  try { reduceProtocolState(protocolState(aggregateState.broker), "disposition-pending", pendingPayload(aggregateIds, escaped(middle))); low = middle; } catch { high = middle; }
}
assert.ok(low > 0 && high * 3 <= contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES);
const aggregateBefore = protocolState(aggregateState.broker); const aggregateAppends = aggregateState.subject.store.entries.length;
await assert.rejects(() => aggregateState.broker.record("disposition-pending", pendingPayload(aggregateIds, escaped(high))), /aggregate bound/);
assert.deepEqual(protocolState(aggregateState.broker), aggregateBefore); assert.equal(aggregateState.subject.store.entries.length, aggregateAppends);
await aggregateState.broker.record("disposition-pending", pendingPayload(aggregateIds, escaped(low)));
assert.ok(Buffer.byteLength(JSON.stringify(childContinuityProjection(aggregateState.broker)), "utf8") <= alignmentBrokerConstants.MAX_CHILD_CONTINUITY_BYTES);

const manyPending = bareBroker("many-pending"); let pendingRefused = false; let refusedPendingIds = null;
for (let index = 0; index < 20; index += 1) {
  const ids = await openDecision(manyPending.broker, `pending-${index}`); const before = protocolState(manyPending.broker); const appends = manyPending.subject.store.entries.length;
  try { await manyPending.broker.record("disposition-pending", pendingPayload(ids, "z".repeat(contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES))); }
  catch (error) { assert.match(error.message, /aggregate bound/); assert.deepEqual(protocolState(manyPending.broker), before); assert.equal(manyPending.subject.store.entries.length, appends); refusedPendingIds = ids; pendingRefused = true; break; }
}
assert.equal(pendingRefused, true);
// The same oversized pending event, if found in experimental persisted state,
// refuses the active branch before channel establishment or spawn.
manyPending.subject.store.append(alignmentBrokerConstants.CUSTOM_TYPE, { version: 1, alignment_session_id: manyPending.broker.sessionId, trace_id: trace,
  event: "disposition-pending", payload: pendingPayload(refusedPendingIds, "z".repeat(contracts.MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES)) });
const replayRuntime = join(scratch, "many-pending-replay-runtime");
const oversizedReplay = new AlignmentBroker(manyPending.subject.pi, { cwd: root, runtimeRoot: replayRuntime, piSessionFile: manyPending.subject.file, sessionManager: manyPending.subject.store.manager() });
await assert.rejects(() => oversizedReplay.initialize(), /aggregate bound/); assert.equal(oversizedReplay.started, false); assert.equal(manyPending.subject.events.spawnCount, 0);
await assert.rejects(() => lstat(join(replayRuntime, manyPending.broker.sessionId)), (error) => error.code === "ENOENT");
const manyOpen = bareBroker("many-open"); let openRefused = false;
for (let index = 0; index < 20; index += 1) {
  const before = protocolState(manyOpen.broker); const appends = manyOpen.subject.store.entries.length;
  try { await openDecision(manyOpen.broker, `open-${index}`, "q".repeat(20000)); }
  catch (error) { assert.match(error.message, /aggregate bound/); assert.equal(manyOpen.subject.store.entries.length, appends + 1); assert.equal(manyOpen.broker.openDecisions.size, before.openDecisions.size); openRefused = true; break; }
}
assert.equal(openRefused, true);

// Claimed packets remain recoverable when native projection append fails.
const packetRecovery = fixture("packet-recovery"); await packetRecovery.store.persist();
const packetBroker = new AlignmentBroker(packetRecovery.pi, { cwd: root, runtimeRoot: join(scratch, "packet-runtime"), sessionId: "session-packet", traceId: trace,
  piSessionFile: packetRecovery.file, sessionManager: packetRecovery.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
await packetBroker.initialize(); await packetBroker.startOrchestrator(); packetBroker.recordOperatorInput("packet");
const packetReq = request("status_request", "packet-exchange", "packet-request", trace, "packet", { scope: "change" }); await packetBroker.record("request", { packet: packetReq });
const packetAck = projection("ack", "running", packetReq); packetAck.packet_id = "packet-ack"; await packetBroker.record("projection", { source: "direct", packet: packetAck });
const notification = projection("completion", "complete", packetReq); notification.packet_id = "packet-notification";
const notificationName = `notification-${randomUUID()}.json`; const notificationPath = join(packetBroker.channelRoot, "notifications", notificationName); await atomicPacket(notificationPath, notification);
const packetBefore = protocolState(packetBroker); packetRecovery.store.failEvent = "projection";
await assert.rejects(() => packetBroker.drainNotifications(), /append failed/);
assert.deepEqual(protocolState(packetBroker), packetBefore); assert.equal((await readdir(join(packetBroker.channelRoot, "notifications"))).includes(notificationName), true);
packetRecovery.store.failEvent = null; await packetBroker.drainNotifications(); assert.ok(packetBroker.projections.has(notification.packet_id));
packetBroker.recordOperatorInput("response retry");
const responseReq = request("status_request", "response-exchange", "response-request", notification.packet_id, "response retry", { scope: "change" }); await packetBroker.record("request", { packet: responseReq });
const responsePacket = projection("status", "running", responseReq); responsePacket.packet_id = "response-packet";
const responsePath = join(packetBroker.channelRoot, "responses", `${responseReq.exchange_id}.json`); await atomicPacket(responsePath, responsePacket);
const responseBefore = protocolState(packetBroker); packetRecovery.store.failEvent = "projection";
await assert.rejects(() => packetBroker.drainRecoveredResponses(), /append failed/); assert.deepEqual(protocolState(packetBroker), responseBefore); assert.equal((await lstat(responsePath)).isFile(), true);
packetRecovery.store.failEvent = null; await packetBroker.drainRecoveredResponses(); assert.ok(packetBroker.projections.has(responsePacket.packet_id));
packetRecovery.events.status = "stopped"; await packetBroker.shutdown("quit");

// Empty-root proof accepts only the pinned vendor's exact unlimited or finite
// spawn-budget prefix; malformed or CR-hidden active content refuses pre-spawn.
for (const [index, statusText] of [
  "Spawn budget: not-a-vendor-summary\nNo active async runs.",
  "Spawn budget: unlimited\rActive async runs: 1\nNo active async runs.",
  ["Spawn budget: unlimited\nNo active async runs."],
].entries()) {
  const invalidStatus = fixture(`invalid-status-${index}`); await invalidStatus.store.persist(); invalidStatus.events.listStatusText = statusText;
  const invalidStatusBroker = new AlignmentBroker(invalidStatus.pi, { cwd: root, runtimeRoot: join(scratch, `invalid-status-runtime-${index}`), sessionId: `session-invalid-status-${index}`, traceId: trace,
    piSessionFile: invalidStatus.file, sessionManager: invalidStatus.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
  await invalidStatusBroker.initialize(); await assert.rejects(() => invalidStatusBroker.startOrchestrator(), /active root session is not empty|status text is malformed/); assert.equal(invalidStatus.events.spawnCount, 0);
}
const finiteStatus = fixture("finite-status"); await finiteStatus.store.persist();
finiteStatus.events.listStatusText = "Spawn budget: 0/10 used, 10 remaining (configured 10; granted 0; grant allowance 10)\nNo active async runs.";
const finiteStatusBroker = new AlignmentBroker(finiteStatus.pi, { cwd: root, runtimeRoot: join(scratch, "finite-status-runtime"), sessionId: "session-finite-status", traceId: trace,
  piSessionFile: finiteStatus.file, sessionManager: finiteStatus.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
await finiteStatusBroker.initialize(); await finiteStatusBroker.startOrchestrator(); assert.equal(finiteStatus.events.spawnCount, 1);
finiteStatus.events.status = "stopped"; await finiteStatusBroker.shutdown("quit");

// Spawn response without a durable start entry is ambiguous and never retried.
const ambiguous = fixture("ambiguous"); await ambiguous.store.persist(); ambiguous.store.failEvent = "orchestrator-start";
const ambiguousBroker = new AlignmentBroker(ambiguous.pi, { cwd: root, runtimeRoot: join(scratch, "ambiguous-runtime"), sessionId: "session-ambiguous", traceId: trace,
  piSessionFile: ambiguous.file, sessionManager: ambiguous.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
await ambiguousBroker.initialize(); const ambiguousBefore = protocolState(ambiguousBroker);
await assert.rejects(() => ambiguousBroker.startOrchestrator(), /refusing ambiguous run/); assert.deepEqual(protocolState(ambiguousBroker), ambiguousBefore); assert.equal(ambiguous.events.spawnCount, 1);
await assert.rejects(() => ambiguousBroker.startOrchestrator(), /exactly one orchestrator/); assert.equal(ambiguous.events.spawnCount, 1);

// Active-branch reconstruction ignores a foreign abandoned branch, but malformed
// or mixed qq state on the active branch refuses instead of being sanitized.
const branchFile = join(scratch, "branch.jsonl");
const base = { type: "custom", id: "base-entry", parentId: null, customType: alignmentBrokerConstants.CUSTOM_TYPE,
  data: { version: 1, alignment_session_id: "session-branch", trace_id: "2".repeat(32), event: "lifecycle", payload: { reason: "startup", pi_session_file: branchFile } } };
const abandoned = { ...base, id: "abandoned-entry", parentId: "base-entry", data: { ...base.data, alignment_session_id: "foreign-session" } };
const active = { type: "custom", id: "active-entry", parentId: "base-entry", customType: "other-extension", data: {} };
await writeFile(branchFile, `${JSON.stringify({ type: "session", version: 3 })}\n${JSON.stringify(base)}\n${JSON.stringify(abandoned)}\n${JSON.stringify(active)}\n`);
assert.deepEqual((await readNativeSessionBranch(branchFile)).map((entry) => entry.id), ["base-entry", "active-entry"]);
const malformed = fixture("malformed"); malformed.store.append(alignmentBrokerConstants.CUSTOM_TYPE, { version: 1, alignment_session_id: "session-x", trace_id: "3".repeat(32), event: "lifecycle", payload: { reason: "startup", pi_session_file: malformed.file }, extra: true });
await assert.rejects(() => new AlignmentBroker(malformed.pi, { cwd: root, runtimeRoot: join(scratch, "malformed-runtime"), piSessionFile: malformed.file, sessionManager: malformed.store.manager() }).initialize(), /wrong shape/);
const foreign = fixture("foreign");
foreign.store.append(alignmentBrokerConstants.CUSTOM_TYPE, { version: 1, alignment_session_id: "session-a", trace_id: "5".repeat(32), event: "lifecycle", payload: { reason: "startup", pi_session_file: foreign.file } });
foreign.store.append(alignmentBrokerConstants.CUSTOM_TYPE, { version: 1, alignment_session_id: "session-b", trace_id: "6".repeat(32), event: "lifecycle", payload: { reason: "startup", pi_session_file: foreign.file } });
await assert.rejects(() => new AlignmentBroker(foreign.pi, { cwd: root, runtimeRoot: join(scratch, "foreign-runtime"), piSessionFile: foreign.file, sessionManager: foreign.store.manager() }).initialize(), /foreign qq alignment state/);

// Persisted crashed-root and recovery state remains inert until the rebound RPC
// bridge proves the exact recorded run terminal; only then may replacement spawn.
const blocked = fixture("blocked"); await blocked.store.persist(); blocked.events.status = "running"; blocked.events.stopError = "not_found";
const stuck = new AlignmentBroker(blocked.pi, { cwd: root, runtimeRoot: join(scratch, "blocked-runtime"), sessionId: "session-blocked", traceId: "4".repeat(32), piSessionFile: blocked.file,
  sessionManager: blocked.store.manager(), pollMs: 2, stopTimeoutMs: 15 });
await stuck.initialize(); await stuck.startOrchestrator();
await assert.rejects(() => stuck.prepareReplacement("new", null), /terminal state was not proven/);
assert.equal(blocked.store.entries.at(-1).data.event, "recovery"); assert.equal(blocked.events.spawnCount, 1); await blocked.store.persist();
const recovered = new AlignmentBroker(blocked.pi, { cwd: root, runtimeRoot: join(scratch, "blocked-runtime"), piSessionFile: blocked.file,
  sessionManager: blocked.store.manager(), pollMs: 2, stopTimeoutMs: 15 });
await recovered.initialize(); assert.equal(recovered.recoveredRunId, "orchestrator-run-1");
await assert.rejects(() => recovered.startOrchestrator(), /recovery is required/); assert.equal(blocked.events.spawnCount, 1);
blocked.events.unavailable = true; await assert.rejects(() => recovered.reconcileRecoveredOrchestrator(), /terminal state was not proven/); blocked.events.unavailable = false;
assert.equal(blocked.store.entries.at(-1).data.event, "recovery"); assert.equal(recovered.recoveredRunId, "orchestrator-run-1"); assert.equal(blocked.events.spawnCount, 1);
blocked.events.status = "stopped"; blocked.events.statusRunId = "foreign-run";
await assert.rejects(() => recovered.reconcileRecoveredOrchestrator(), /terminal state was not proven/);
blocked.events.statusRunId = null; await assert.rejects(() => recovered.reconcileRecoveredOrchestrator(), /terminal state was not proven/);
blocked.events.stopError = null; blocked.events.statusRunId = "orchestrator-run-1"; await recovered.reconcileRecoveredOrchestrator();
assert.equal(recovered.recoveredRunId, null); assert.equal(recovered.orchestratorLifecycle, "stopped");
await recovered.startOrchestrator(); assert.equal(blocked.events.spawnCount, 2);
const recoveryEvents = blocked.store.entries.map((entry) => entry.data.event);
assert.ok(recoveryEvents.lastIndexOf("orchestrator-terminal") < recoveryEvents.lastIndexOf("orchestrator-start"));

// A crash after terminal proof but before replacement receipt permits one later
// spawn; exact terminal state, rather than a stale running run, is replayed.
const terminalCrash = fixture("terminal-crash"); await terminalCrash.store.persist();
const terminalBroker = new AlignmentBroker(terminalCrash.pi, { cwd: root, runtimeRoot: join(scratch, "terminal-runtime"), sessionId: "session-terminal", traceId: trace,
  piSessionFile: terminalCrash.file, sessionManager: terminalCrash.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
await terminalBroker.initialize(); await terminalBroker.startOrchestrator(); await terminalBroker.record("orchestrator-terminal", { run_id: terminalBroker.orchestratorRunId, state: "stopped", proof: "async-complete" }); await terminalCrash.store.persist();
const terminalRestart = new AlignmentBroker(terminalCrash.pi, { cwd: root, runtimeRoot: join(scratch, "terminal-runtime"), piSessionFile: terminalCrash.file,
  sessionManager: terminalCrash.store.manager(), pollMs: 2, stopTimeoutMs: 20 });
await terminalRestart.initialize(); assert.equal(terminalRestart.orchestratorLifecycle, "stopped"); await terminalRestart.startOrchestrator(); assert.equal(terminalCrash.events.spawnCount, 2);
terminalCrash.events.status = "stopped"; await terminalRestart.shutdown("quit");

console.log("alignment contracts/native broker: pass");
JS

assert_file_not_matches "$ROOT/extensions/qq-aligner.ts" 'open_alignment_evidence|seal_alignment_package|registerCommand\("architect"'
assert_file_not_matches "$ROOT/extensions/lib/qq-alignment-broker.ts" 'journal\.jsonl|sealed-alignment|evidence capability|canonical_target|allowed_range'
assert_file_not_matches "$ROOT/delegation/extensions/qq-alignment-channel.ts" 'qq_register_evidence|canonical_target|allowed_range'
assert_file_not_matches "$ROOT/delegation/manifests/agents/orchestrator.md" 'qq_register_evidence|capability ids'
assert_file_contains "$ROOT/extensions/lib/qq-alignment-broker.ts" 'sessionManager.getBranch()'
assert_file_not_matches "$ROOT/extensions/lib/qq-alignment-broker.ts" 'rename\(temporary, path\); await chmod\(path'
assert_file_not_matches "$ROOT/delegation/extensions/qq-alignment-channel.ts" 'rename\(temporary, path\); await chmod\(path'
assert_file_contains "$ROOT/extensions/lib/qq-alignment-broker.ts" 'MAX_JSON_BYTES = MAX_ALIGNMENT_PACKET_BYTES'
assert_file_contains "$ROOT/extensions/qq-aligner.ts" 'pi.appendEntry(type, data)'
assert_file_contains "$ROOT/extensions/qq-aligner.ts" 'complete_alignment'

printf 'test-qq-alignment-core: pass\n'
