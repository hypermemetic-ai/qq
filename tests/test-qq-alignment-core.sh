#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-alignment-core"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for schema in \
  alignment-episode.v1 aligner-request.v1 orchestrator-projection.v1 \
  evidence-capability.v1 operator-disposition-receipt.v1 sealed-alignment-package.v1; do
  file="$ROOT/delegation/manifests/$schema.schema.json"
  [ -f "$file" ] || fail "missing schema $file"
  jq -e '.type == "object" and .additionalProperties == false' "$file" >/dev/null
 done
jq -e '.properties.allowed_range.required == ["start","length"] and (.properties.allowed_range.properties | has("end") | not) and .properties.canonical_target.pattern == "^/" and (.properties | has("trace_reference") | not)' "$ROOT/delegation/manifests/evidence-capability.v1.schema.json" >/dev/null
jq -e '.properties.material.properties.trace_references.maxItems == 0' "$ROOT/delegation/manifests/orchestrator-projection.v1.schema.json" >/dev/null
jq -e '.oneOf[-1].properties.payload.required == ["receipt"] and ."$defs".receipt.additionalProperties == false' "$ROOT/delegation/manifests/aligner-request.v1.schema.json" >/dev/null
jq -e '(.allOf | length) == 3' "$ROOT/delegation/manifests/orchestrator-projection.v1.schema.json" >/dev/null

# Aligner requests have no execution/scheduling authority even as schema fields.
if jq -r '.. | objects | .properties? // {} | keys[]' \
  "$ROOT/delegation/manifests/aligner-request.v1.schema.json" \
  | grep -E '^(agent|role|task|cwd|branch|command|priority|schedule|dispatch|retry|stop|merge|task_state|delivery_state)$'; then
  fail 'aligner request schema exposes a forbidden authority field'
fi

ROOT="$ROOT" TMP="$TMP" node --experimental-strip-types --input-type=module <<'JS'
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.ROOT;
const scratch = process.env.TMP;
const contracts = await import(pathToFileURL(join(root, "extensions/lib/qq-alignment-contracts.ts")));
const { AlignmentBroker, registerEvidenceCapability } = await import(pathToFileURL(join(root, "extensions/lib/qq-alignment-broker.ts")));
const trace = "1".repeat(32);
const change = "T-165.1";
const id = (prefix) => `${prefix}-${randomUUID()}`;

function request(kind, exchange, requestId, replyTo, operatorText, payload) {
  return { version: 1, change_id: change, exchange_id: exchange, trace_id: trace, request_id: requestId, reply_to: replyTo, kind, operator_text: operatorText, interpretation: `Interpretation of ${operatorText}`, payload };
}
function projection(kind, lifecycle, req, options = {}) {
  return {
    version: 1, change_id: req.change_id, exchange_id: req.exchange_id, trace_id: req.trace_id,
    packet_id: id("packet"), reply_to: req.request_id, lifecycle, kind,
    material: {
      facts: options.facts ?? ["Observed fact"], inferences: options.inferences ?? [], recommendation: options.recommendation ?? null,
      uncertainties: options.uncertainties ?? [], evidence_capability_ids: options.evidence ?? [],
      trace_references: options.refs ?? [],
      worker_run_ids: options.workers ?? [], decision: options.decision ?? null, next_operator_input: options.next ?? null,
    },
  };
}

const validReq = request("intent", id("exchange"), id("request"), trace, "Build the approved core.", { text: "Approved operator intent." });
contracts.validateAlignerRequest(validReq);
const structuralCompletion = projection("completion", "complete", validReq); contracts.validateOrchestratorProjection(structuralCompletion);
assert.throws(() => contracts.validateOrchestratorProjection({ ...structuralCompletion, lifecycle: "running" }));
const structuralFailure = projection("failure", "failed", validReq); contracts.validateOrchestratorProjection(structuralFailure);
assert.throws(() => contracts.validateOrchestratorProjection({ ...structuralFailure, lifecycle: "running" }));
assert.throws(() => contracts.validateOrchestratorProjection(projection("decision", "waiting", validReq)));
for (const mutate of [
  (v) => { v.command = "git status"; },
  (v) => { v.payload.role = "implementer"; },
  (v) => { v.version = 2; },
  (v) => { v.trace_id = "bad"; },
  (v) => { v.kind = "dispatch"; },
]) {
  const candidate = structuredClone(validReq); mutate(candidate);
  assert.throws(() => contracts.validateAlignerRequest(candidate), contracts.AlignmentContractError);
}
const episode = {
  version: 1, change_id: change, exchange_id: validReq.exchange_id, trace_id: trace, episode: "initial", outcome: "ready", criteria_trigger: null,
  presentation: { spoken: "The approved outcome is ready.", visual: { format: "markdown", content: "## Outcome\nReady with cited evidence.", provenance: [id("cap")] } },
};
contracts.validateAlignmentEpisode(episode);
assert.throws(() => contracts.validateAlignmentEpisode({ ...episode, unexpected: true }));
contracts.validateAlignmentEpisode({ ...episode, presentation: { spoken: "same", visual: { format: "markdown", content: "same", provenance: [id("cap")] } } });
assert.throws(() => contracts.validateAlignmentEpisode({ ...episode, episode: "realignment" }));

class Events {
  constructor() { this.handlers = new Map(); this.spawnCount = 0; this.stopCount = 0; this.status = "stopped"; this.stopError = null; this.statusError = null; this.statusRunId = "orchestrator-run-1"; }
  on(name, fn) { const rows = this.handlers.get(name) ?? []; rows.push(fn); this.handlers.set(name, rows); return () => this.handlers.set(name, rows.filter((row) => row !== fn)); }
  emit(name, value) {
    if (name === "subagents:rpc:v1:request") {
      if (value.method === "spawn") this.spawnCount += 1;
      if (value.method === "stop") this.stopCount += 1;
      const error = value.method === "stop" ? this.stopError : value.method === "status" ? this.statusError : null;
      if (error !== null) {
        queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: false, error: { code: error, message: `${value.method} fixture ${error}` } }));
        return;
      }
      const data = value.method === "spawn" ? { details: { runId: "orchestrator-run-1" } }
        : value.method === "stop" ? { runId: "orchestrator-run-1", previousState: "running", state: "stopping", message: "stop requested" }
        : { text: `Run: ${this.statusRunId}\nState: ${this.status}`, details: { mode: "single", results: [] } };
      queueMicrotask(() => this.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: true, data }));
      return;
    }
    for (const fn of this.handlers.get(name) ?? []) fn(value);
  }
}
const events = new Events();
const alignerMessages = [];
const pi = { events, sendUserMessage(message) { alignerMessages.push(message); } };
const stateRoot = join(scratch, "state");
const runtimeRoot = join(scratch, "runtime");
const rootSessionFile = join(scratch, "root-session.jsonl");
await writeFile(rootSessionFile, '{"type":"session","version":3}\n', { mode: 0o600 });
const overlap = new AlignmentBroker(pi, { cwd: root, stateRoot: join(scratch, "overlap"), runtimeRoot: join(scratch, "overlap", "transport"), sessionId: "session-overlap", traceId: "6".repeat(32) });
await assert.rejects(() => overlap.initialize(), /must not overlap/);
// Projection authority is published only by one successful combined journal
// record. Failed commits leave every live authority set unchanged, and
// fallible proposal cleanup after commit cannot reverse acceptance.
const atomicBroker = new AlignmentBroker(pi, {
  cwd: root, stateRoot: join(scratch, "atomic-state"), runtimeRoot: join(scratch, "atomic-runtime"),
  sessionId: "session-atomic", traceId: trace,
});
await atomicBroker.initialize();
atomicBroker.changeId = change;
const atomicStatusReq = request("status_request", id("exchange"), id("request"), trace, "atomic status", { scope: "change" });
atomicBroker.requestPackets.set(atomicStatusReq.exchange_id, atomicStatusReq);
const originalAtomicJournal = atomicBroker.journal.bind(atomicBroker);
atomicBroker.journal = async (type, payload) => {
  if (type === "orchestrator-projection") throw new Error("forced journal failure");
  return originalAtomicJournal(type, payload);
};
await assert.rejects(() => atomicBroker.acceptProjection(projection("status", "running", atomicStatusReq), atomicStatusReq, "orchestrator-projection"), /forced journal failure/);
assert.equal(atomicBroker.directProjectionKinds.has(atomicStatusReq.request_id), false);
const unauthorizedAfterFailure = projection("completion", "complete", atomicStatusReq);
await writeFile(join(atomicBroker.channelRoot, "notifications", `notification-${randomUUID()}.json`), `${JSON.stringify(unauthorizedAfterFailure)}\n`, { mode: 0o600 });
await assert.rejects(() => atomicBroker.drainNotifications(), /ineligible/);
assert.equal(atomicBroker.projections.has(unauthorizedAfterFailure.packet_id), false);
for (const name of await readdir(join(atomicBroker.channelRoot, "notifications"))) await rm(join(atomicBroker.channelRoot, "notifications", name), { recursive: true, force: true });

const atomicTarget = join(scratch, "atomic-evidence.txt");
await writeFile(atomicTarget, "atomic evidence", { mode: 0o600 });
const atomicDecisionReq = request("clarification", id("exchange"), id("request"), trace, "atomic decision", { text: "decide atomically" });
atomicBroker.requestPackets.set(atomicDecisionReq.exchange_id, atomicDecisionReq);
const atomicCapability = await registerEvidenceCapability(atomicBroker.channelRoot, {
  change_id: change, exchange_id: atomicDecisionReq.exchange_id, target: atomicTarget, media_type: "text/plain",
  start: 0, length: 6, retention_until: new Date(Date.now() + 60_000).toISOString(),
});
const atomicDecision = { decision_id: "decision-atomic", question: "Atomic?", issued_for_operator_text: atomicDecisionReq.operator_text };
const atomicPacket = projection("decision", "waiting", atomicDecisionReq, {
  decision: atomicDecision, evidence: [atomicCapability.capability_id], workers: ["worker-atomic"],
});
await assert.rejects(() => atomicBroker.acceptProjection(atomicPacket, atomicDecisionReq, "orchestrator-projection"), /forced journal failure/);
assert.equal(atomicBroker.projections.has(atomicPacket.packet_id), false);
assert.equal(atomicBroker.directProjectionKinds.has(atomicDecisionReq.request_id), false);
assert.equal(atomicBroker.lastProjectionId, trace);
assert.equal(atomicBroker.workflowLifecycle, "not-started");
assert.equal(atomicBroker.decisionIds.has(atomicDecision.decision_id), false);
assert.equal(atomicBroker.openDecisions.has(atomicDecision.decision_id), false);
assert.equal(atomicBroker.evidenceIds.has(atomicCapability.capability_id), false);
assert.equal(atomicBroker.workerRunIds.has("worker-atomic"), false);
assert.equal(atomicBroker.traceReferences.size, 0);
await assert.rejects(() => atomicBroker.openEvidence(atomicCapability.capability_id, 0, 1), /not promoted/);
await lstat(join(atomicBroker.sessionStateRoot, "capabilities", `${atomicCapability.capability_id}.json`));

const atomicProposalPath = join(atomicBroker.channelRoot, "evidence", `${atomicCapability.capability_id}.json`);
atomicBroker.journal = async (type, payload) => {
  const journalEntryId = await originalAtomicJournal(type, payload);
  if (type === "orchestrator-projection") {
    await rm(atomicProposalPath, { force: true });
    await mkdir(atomicProposalPath);
    await writeFile(join(atomicProposalPath, "cleanup-blocker"), "x");
  }
  return journalEntryId;
};
assert.equal((await atomicBroker.acceptProjection(atomicPacket, atomicDecisionReq, "orchestrator-projection")).packet_id, atomicPacket.packet_id);
assert.equal(atomicBroker.directProjectionKinds.get(atomicDecisionReq.request_id), "decision");
assert.ok(atomicBroker.projections.has(atomicPacket.packet_id));
assert.ok(atomicBroker.openDecisions.has(atomicDecision.decision_id));
assert.ok(atomicBroker.evidenceIds.has(atomicCapability.capability_id));
assert.ok(atomicBroker.workerRunIds.has("worker-atomic"));
assert.equal(atomicBroker.workflowLifecycle, "waiting");
assert.equal(atomicBroker.traceReferences.size, 1);
assert.equal((await atomicBroker.openEvidence(atomicCapability.capability_id, 0, 6)).text, "atomic");
await assert.rejects(() => atomicBroker.acceptProjection(atomicPacket, atomicDecisionReq, "orchestrator-projection"), /stale|more than one/);
const atomicJournalEntries = (await readFile(atomicBroker.journalPath, "utf8")).trim().split("\n").map(JSON.parse);
const atomicProjectionEntries = atomicJournalEntries.filter((entry) => entry.type === "orchestrator-projection");
assert.equal(atomicProjectionEntries.length, 1);
assert.deepEqual(atomicProjectionEntries[0].payload.evidence_capabilities, [atomicCapability]);
assert.equal(atomicJournalEntries.some((entry) => entry.type === "evidence-capability"), false);
await rm(atomicProposalPath, { recursive: true, force: true });

const broker = new AlignmentBroker(pi, { cwd: root, stateRoot, runtimeRoot, sessionId: "session-test", traceId: trace, piSessionFile: rootSessionFile, pollMs: 5, exchangeTimeoutMs: 2000 });
await broker.initialize();
assert.equal((await lstat(stateRoot)).mode & 0o777, 0o700);
assert.equal((await lstat(runtimeRoot)).mode & 0o777, 0o700);
await broker.startOrchestrator();
assert.equal(events.spawnCount, 1);
clearInterval(broker.notificationTimer); broker.notificationTimer = null;
await assert.rejects(() => broker.startOrchestrator(), /exactly one orchestrator/);

async function answer(req, packet) {
  const path = join(broker.channelRoot, "responses", `${req.exchange_id}.json`);
  await writeFile(path, `${JSON.stringify(packet)}\n`, { mode: 0o600 });
}

// Multiple exchanges retain one orchestrator run and no exchange-count cap.
let replyTo = trace;
for (let index = 0; index < 4; index += 1) {
  const text = `Operator exchange ${index}`;
  await broker.recordOperatorInput(text);
  const req = request(index === 0 ? "intent" : "status_request", id("exchange"), id("request"), replyTo, text, index === 0 ? { text: "Do the approved work." } : { scope: "change" });
  const packet = projection("status", "running", req, { workers: index === 3 ? ["worker-run-1"] : [] });
  setTimeout(() => answer(req, packet), 10);
  const result = await broker.exchange(req);
  replyTo = result.packet_id;
}
assert.equal(events.spawnCount, 1);
assert.ok(broker.workerRunIds.has("worker-run-1"));
// Sealing refuses while an exchange/write is pending.
await broker.recordOperatorInput("pending seal probe");
const pendingReq = request("status_request", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { scope: "change" });
const pendingPacket = projection("status", "running", pendingReq);
const pendingExchange = broker.exchange(pendingReq);
await new Promise((resolve) => setTimeout(resolve, 10));
await assert.rejects(() => broker.seal("finalized"), /exchange is pending/);
await answer(pendingReq, pendingPacket); replyTo = (await pendingExchange).packet_id;
await broker.recordOperatorInput("stale probe");
const stale = request("status_request", id("exchange"), id("request"), trace, "stale probe", { scope: "change" });
await assert.rejects(() => broker.exchange(stale), /reply_to is stale/);

// Open decision and exact current-verbatim disposition binding.
await broker.recordOperatorInput("Which boundary?");
const decisionReq = request("clarification", id("exchange"), id("request"), replyTo, "Which boundary?", { text: "Resolve the boundary." });
const decision = { decision_id: "decision-1", question: "Use the narrow boundary?", issued_for_operator_text: decisionReq.operator_text };
const decisionPacket = projection("decision", "waiting", decisionReq, { decision, next: "Accept, reject, or reshape." });
setTimeout(() => answer(decisionReq, decisionPacket), 10);
const decisionResult = await broker.exchange(decisionReq);
replyTo = decisionResult.packet_id;
await broker.recordOperatorInput("Yes, use the narrow boundary verbatim.");
await assert.rejects(() => broker.captureDisposition({ decision_id: "decision-1", outcome: "accepted", operator_response: broker.lastOperatorText }), /substantive operator disposition retained/);
assert.equal(broker.pendingDispositions.get("decision-1").operator_response, "Yes, use the narrow boundary verbatim.");
await broker.recordOperatorInput(" accept ");
await assert.rejects(() => broker.captureDisposition({ decision_id: "fabricated", outcome: "accepted", operator_response: broker.lastOperatorText }), /open decision/);
await assert.rejects(() => broker.captureDisposition({ decision_id: "decision-1", outcome: "accepted", operator_response: broker.lastOperatorText }), /exact confirmation token/);
assert.ok(broker.pendingDispositions.has("decision-1"));
await broker.recordOperatorInput("accept");
await assert.rejects(() => broker.captureDisposition({ decision_id: "decision-1", outcome: "rejected", operator_response: broker.lastOperatorText }), /retained decision and outcome/);
const receipt = await broker.captureDisposition({ decision_id: "decision-1", outcome: "accepted", operator_response: broker.lastOperatorText });
contracts.validateDispositionReceipt(receipt);
assert.throws(() => contracts.validateDispositionReceipt({ ...receipt, confirmation: "reject" }), /does not match outcome/);
assert.equal(receipt.operator_response, "Yes, use the narrow boundary verbatim.");
assert.equal(receipt.confirmation, "accept");
const dispositionReq = request("disposition", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { receipt });
const ack = projection("ack", "running", dispositionReq);
setTimeout(() => answer(dispositionReq, ack), 10);
replyTo = (await broker.exchange(dispositionReq)).packet_id;

// Exact evidence capabilities: no path API, no sibling authority, bounded text,
// digest/inode/symlink/expiry/binary attacks all refuse.
const evidenceDir = join(scratch, "evidence"); await mkdir(evidenceDir);
const target = join(evidenceDir, "exact.txt");
await writeFile(target, "0123456789abcdef", { mode: 0o600 });
await broker.recordOperatorInput("Show the exact evidence.");
const evidenceReq = request("evidence_request", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { text: "Supply exact evidence." });
for (const name of await readdir(join(broker.channelRoot, "requests"))) if (name.endsWith(".json")) await rm(join(broker.channelRoot, "requests", name));
const childTools = new Map();
const { default: registerChannel } = await import(pathToFileURL(join(root, "delegation/extensions/qq-alignment-channel.ts")));
await registerChannel({ registerTool(tool) { childTools.set(tool.name, tool); } });
const evidenceExchange = broker.exchange(evidenceReq);
await new Promise((resolve) => setTimeout(resolve, 10));
const received = await childTools.get("qq_alignment_receive").execute("receive-1", {}, new AbortController().signal);
assert.equal(received.details.request_id, evidenceReq.request_id);
const capResult = await childTools.get("qq_register_evidence").execute("evidence-1", {
  change_id: change, exchange_id: evidenceReq.exchange_id, target, media_type: "text/plain", start: 2, length: 10,
  retention_until: new Date(Date.now() + 60_000).toISOString(),
});
const capPath = join(broker.channelRoot, "evidence", `${capResult.details.capability_id}.json`);
const cap = JSON.parse(await readFile(capPath, "utf8"));
await assert.rejects(() => broker.openEvidence(cap.capability_id, 0, 1), /authoritative evidence capability/);
const boundedTarget = join(evidenceDir, "bounded-large.txt");
const boundedBytes = Buffer.alloc(3 * 65536, 97); boundedBytes.write("bounded-subrange", 2 * 65536 + 7);
await writeFile(boundedTarget, boundedBytes, { mode: 0o600 });
const boundedCap = await registerEvidenceCapability(broker.channelRoot, {
  change_id: change, exchange_id: evidenceReq.exchange_id, target: boundedTarget, media_type: "text/plain",
  start: 2 * 65536, length: 64, retention_until: new Date(Date.now() + 60_000).toISOString(),
});
const oversizedTarget = join(evidenceDir, "oversized-sparse.txt");
await writeFile(oversizedTarget, "x"); await truncate(oversizedTarget, 4 * 1024 * 1024 + 1);
await assert.rejects(() => registerEvidenceCapability(broker.channelRoot, {
  change_id: change, exchange_id: evidenceReq.exchange_id, target: oversizedTarget, media_type: "text/plain",
  start: 0, length: 1, retention_until: new Date(Date.now() + 60_000).toISOString(),
}), /4194304-byte object bound/);
const evidencePacket = projection("evidence", "running", evidenceReq, { evidence: [cap.capability_id, boundedCap.capability_id] });
assert.equal((await childTools.get("qq_alignment_reply").execute("reply-1", { packet: evidencePacket })).isError, undefined);
replyTo = (await evidenceExchange).packet_id;
await assert.rejects(() => lstat(capPath), /ENOENT/);
await writeFile(capPath, `${JSON.stringify({ ...cap, allowed_range: { start: 0, length: 10 } })}\n`, { mode: 0o600 });
const openedEvidence = await broker.openEvidence(cap.capability_id, 1, 4);
assert.equal(openedEvidence.text, "3456");
assert.equal((await broker.openEvidence(boundedCap.capability_id, 7, 16)).text, "bounded-subrange");
contracts.validateTraceReference(openedEvidence.trace_receipt);
assert.equal(openedEvidence.trace_receipt.trace_id, trace);
assert.equal(openedEvidence.trace_receipt.span_id, broker.brokerSpanId);
// The broker, not the writable child channel, authoritatively refuses an
// unsolicited result when this exact request's direct projection was analysis.
await broker.recordOperatorInput("analyze before notifying");
const analysisReq = request("analysis_request", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { text: "Analyze only." });
const analysisPacket = projection("analysis", "running", analysisReq);
const analysisExchange = broker.exchange(analysisReq); await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal((await childTools.get("qq_alignment_receive").execute("receive-analysis", {}, new AbortController().signal)).details.request_id, analysisReq.request_id);
assert.equal((await childTools.get("qq_alignment_reply").execute("reply-analysis", { packet: analysisPacket })).isError, undefined);
replyTo = (await analysisExchange).packet_id;
assert.equal(broker.directProjectionKinds.get(analysisReq.request_id), "analysis");
const ineligibleDecision = projection("decision", "waiting", analysisReq, {
  decision: { decision_id: "decision-after-analysis", question: "Must refuse?", issued_for_operator_text: analysisReq.operator_text },
});
await writeFile(join(broker.channelRoot, "notifications", `notification-${randomUUID()}.json`), `${JSON.stringify(ineligibleDecision)}\n`, { mode: 0o600 });
await assert.rejects(() => broker.drainNotifications(), /ineligible/);
assert.equal(broker.openDecisions.has("decision-after-analysis"), false);
assert.equal(broker.projections.has(ineligibleDecision.packet_id), false);
assert.equal(alignerMessages.length, 0);
// Establish an ack/status exchange before child-only notifications.
await broker.recordOperatorInput("notification channel");
const notifyReq = request("status_request", id("exchange"), id("request"), replyTo, broker.lastOperatorText, { scope: "change" });
const notifyExchange = broker.exchange(notifyReq); await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal((await childTools.get("qq_alignment_receive").execute("receive-2", {}, new AbortController().signal).then((r) => r.details.request_id)), notifyReq.request_id);
const statusPacket = projection("status", "running", notifyReq);
await childTools.get("qq_alignment_reply").execute("reply-2", { packet: statusPacket }); replyTo = (await notifyExchange).packet_id;
assert.equal(broker.directProjectionKinds.get(notifyReq.request_id), "status");
// A direct writable-channel proposal has no authority and is independently
// revalidated before root-only promotion.
const forgedId = `cap-${randomUUID()}`;
await writeFile(join(broker.channelRoot, "evidence", `${forgedId}.json`), `${JSON.stringify({
  ...cap, capability_id: forgedId, issuing_exchange_id: notifyReq.exchange_id, sha256: "0".repeat(64),
})}\n`, { mode: 0o600 });
const forgedFailure = projection("failure", "failed", notifyReq, { evidence: [forgedId] });
assert.equal((await childTools.get("qq_alignment_notify").execute("notify-forged", { packet: forgedFailure })).isError, undefined);
await assert.rejects(() => broker.drainNotifications(), /digest drifted before broker promotion/);
assert.equal(broker.evidenceIds.has(forgedId), false); assert.equal(broker.workflowLifecycle, "running");
// Child-only notifications are typed, correlated, atomic, and consumed once.
const foreign = projection("decision", "waiting", notifyReq, { decision: { decision_id: "foreign", question: "bad", issued_for_operator_text: notifyReq.operator_text } }); foreign.trace_id = "f".repeat(32);
assert.equal((await childTools.get("qq_alignment_notify").execute("notify-bad", { packet: foreign })).isError, true);
const notifiedDecision = projection("decision", "waiting", notifyReq, { decision: { decision_id: "decision-notified", question: "Continue?", issued_for_operator_text: notifyReq.operator_text } });
assert.equal((await childTools.get("qq_alignment_notify").execute("notify-decision", { packet: notifiedDecision })).isError, undefined);
await broker.drainNotifications();
assert.ok(broker.openDecisions.has("decision-notified")); assert.equal(alignerMessages.length, 1);
await broker.drainNotifications(); assert.equal(alignerMessages.length, 1);
await broker.recordOperatorInput("accept");
const directReceipt = await broker.captureDisposition({ decision_id: "decision-notified", outcome: "accepted", operator_response: "accept" });
assert.equal(directReceipt.operator_response, "accept"); assert.equal(directReceipt.confirmation, "accept");
const notifiedCompletion = projection("completion", "complete", notifyReq);
assert.equal((await childTools.get("qq_alignment_notify").execute("notify-complete", { packet: notifiedCompletion })).isError, undefined);
await broker.drainNotifications(); assert.equal(broker.workflowLifecycle, "complete"); assert.equal(broker.orchestratorLifecycle, "running"); assert.equal(alignerMessages.length, 2);
assert.equal((await broker.openEvidence(cap.capability_id, 1, 4)).text, "3456");
await assert.rejects(() => broker.openEvidence(target, 0, 1), /capability id/);
await assert.rejects(() => broker.openEvidence(cap.capability_id, 9, 2), /granted range/);
await assert.rejects(() => broker.openEvidence(cap.capability_id, 0, 65537), /read bound/);
await writeFile(target, "0123456789abcdeX");
await assert.rejects(() => broker.openEvidence(cap.capability_id, 0, 1), /digest drifted/);
await rm(target);
const swapTarget = join(evidenceDir, "swap.txt"); await writeFile(swapTarget, "0123456789abcdef"); await symlink(swapTarget, target);
await assert.rejects(() => broker.openEvidence(cap.capability_id, 0, 1), /direct regular|identity drifted/);
await rm(target); await writeFile(target, "0123456789abcdef");
const linkedTarget = join(evidenceDir, "linked.txt"); await symlink(target, linkedTarget);
await assert.rejects(() => registerEvidenceCapability(broker.channelRoot, { change_id: change, exchange_id: dispositionReq.exchange_id, target: linkedTarget, media_type: "text/plain", start: 0, length: 1, retention_until: new Date(Date.now() + 60_000).toISOString() }), /direct regular|canonical/);
const binary = join(evidenceDir, "binary"); await writeFile(binary, Buffer.from([1, 0, 2]));
await assert.rejects(() => registerEvidenceCapability(broker.channelRoot, { change_id: change, exchange_id: dispositionReq.exchange_id, target: binary, media_type: "text/plain", start: 0, length: 1, retention_until: new Date(Date.now() + 60_000).toISOString() }), /binary/);
await assert.rejects(() => registerEvidenceCapability(broker.channelRoot, { change_id: change, exchange_id: dispositionReq.exchange_id, target, media_type: "text/plain", start: 0, length: 1, retention_until: new Date(Date.now() - 1).toISOString() }), /future/);

// Derived orientation is private, provenance-bound, script-free, and never opened.
const artifact = await broker.createArtifact({ kind: "markdown", title: "Explanation", body: "# Derived", provenance: [cap.capability_id] });
assert.equal(artifact.automatically_opened, false);
assert.equal(artifact.temporary, true);
assert.equal(await readFile(join(broker.channelRoot, "presentations", `${artifact.artifact_id}.md`), "utf8"), "# Derived\n");
await assert.rejects(() => broker.createArtifact({ kind: "static-page", title: "bad", body: "<script>alert(1)</script>", provenance: [cap.capability_id] }), /active content/);
await assert.rejects(() => broker.createArtifact({ kind: "markdown", title: "bad", body: "x", provenance: ["cap-00000000-0000-0000-0000-000000000000"] }), /provenance/);

// Sealing waits for a notification drain that already passed its entry guard.
const racingPacket = projection("completion", "complete", notifyReq);
assert.equal((await childTools.get("qq_alignment_notify").execute("notify-race", { packet: racingPacket })).isError, undefined);
const acceptProjection = broker.acceptProjection.bind(broker);
let releaseDrain; const drainGate = new Promise((resolve) => { releaseDrain = resolve; });
let enteredDrain; const drainEntered = new Promise((resolve) => { enteredDrain = resolve; });
broker.acceptProjection = async (...args) => { enteredDrain(); await drainGate; return acceptProjection(...args); };
const racingDrain = broker.drainNotifications(); await drainEntered;
events.status = "stopped";
let sealSettled = false;
const sealing = broker.seal("finalized").then((value) => { sealSettled = true; return value; });
await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(sealSettled, false);
releaseDrain(); await racingDrain;
const sealed = await sealing;
assert.equal(events.stopCount, 1);
contracts.validateSealedPackage(sealed);
assert.throws(() => contracts.validateSealedPackage({ ...sealed, orchestrator_lifecycle: "recovery-recorded" }), /terminal proof/);
assert.equal(sealed.trace_id, trace);
assert.deepEqual(sealed.root_session_files, [rootSessionFile]);
assert.ok(sealed.exchange_ids.length >= 6);
assert.ok(sealed.disposition_receipt_ids.includes(receipt.receipt_id));
assert.ok(sealed.evidence_capability_ids.includes(cap.capability_id));
assert.ok(sealed.worker_run_ids.includes("worker-run-1"));
assert.ok(sealed.trace_references.length > 0);
assert.equal(sealed.journal_sha256, (await import("node:crypto")).createHash("sha256").update(await readFile(sealed.journal_path)).digest("hex"));
const sealedJournal = await readFile(sealed.journal_path, "utf8");
const sealedJournalEntryIds = new Set(sealedJournal.trim().split("\n").map((line) => JSON.parse(line).journal_entry_id));
assert.ok(sealed.trace_references.every((ref) => ref.trace_id === trace && ref.span_id === broker.brokerSpanId && sealedJournalEntryIds.has(ref.journal_entry_id)));
assert.doesNotMatch(sealedJournal, /calibration_state/);
assert.match(sealedJournal, /Yes, use the narrow boundary verbatim\./);
assert.equal((await lstat(sealed.journal_path)).mode & 0o777, 0o400);
assert.throws(() => broker.recordOperatorInput("after seal"), /sealed/);
await broker.handleAsyncComplete({ runId: "orchestrator-run-1", state: "failed" });
assert.equal(sealed.journal_sha256, (await import("node:crypto")).createHash("sha256").update(await readFile(sealed.journal_path)).digest("hex"));
await broker.shutdown("quit");
await assert.rejects(() => lstat(broker.channelRoot), /ENOENT/);

// Public async completion is exact-run filtered and makes a dead child fail
// the next exchange immediately. Production channel defaults below the exact
// dispatch runtime rather than broad XDG/tmp state.
const dispatchRuntime = join(scratch, "production-dispatch-runtime"); await mkdir(dispatchRuntime, { mode: 0o700 });
process.env.QQ_DISPATCH_RUNTIME_ROOT = dispatchRuntime;
const dead = new AlignmentBroker(pi, { cwd: root, stateRoot: join(scratch, "dead-state"), sessionId: "session-dead", traceId: "3".repeat(32), pollMs: 5, exchangeTimeoutMs: 2000 });
await dead.initialize(); assert.ok(dead.channelRoot.startsWith(`${dispatchRuntime}/alignment/`));
await dead.startOrchestrator();
events.emit("subagent:async-complete", { runId: "foreign-run", state: "failed" }); await new Promise((resolve) => setTimeout(resolve, 5)); assert.equal(dead.orchestratorLifecycle, "running");
events.emit("subagent:async-complete", { runId: "orchestrator-run-1", state: "failed" }); await new Promise((resolve) => setTimeout(resolve, 5)); assert.equal(dead.orchestratorLifecycle, "failed");
dead.lastOperatorText = "dead";
await assert.rejects(() => dead.exchange(request("status_request", id("exchange"), id("request"), dead.traceId, "dead", { scope: "change" })), /not running/);
await dead.shutdown("quit");
const stuck = new AlignmentBroker(pi, { cwd: root, stateRoot: join(scratch, "stuck-state"), runtimeRoot: join(scratch, "stuck-runtime"), sessionId: "session-stuck", traceId: "7".repeat(32), pollMs: 5, stopTimeoutMs: 20 });
await stuck.initialize(); await stuck.startOrchestrator(); events.status = "running";
await assert.rejects(() => stuck.shutdown("quit"), /terminal state was not proven/);
await lstat(stuck.channelRoot); await lstat(join(stuck.sessionStateRoot, "recovery.json")); assert.equal(stuck.journalClosed, false);
events.status = "stopped"; await stuck.shutdown("quit"); await assert.rejects(() => lstat(stuck.channelRoot), /ENOENT/);
const completed = new AlignmentBroker(pi, { cwd: root, stateRoot: join(scratch, "completed-state"), sessionId: "session-completed", traceId: "5".repeat(32), pollMs: 5 });
assert.equal(completed.exchangeTimeoutMs, null);
await completed.initialize(); await completed.startOrchestrator();
events.emit("subagent:async-complete", { runId: "orchestrator-run-1", success: true, execution: { status: "completed" } });
await new Promise((resolve) => setTimeout(resolve, 5)); assert.equal(completed.orchestratorLifecycle, "complete");
await completed.shutdown("quit"); delete process.env.QQ_DISPATCH_RUNTIME_ROOT;

// Completion may race the detached spawn reply; buffer it until the exact run
// identity is known and fail startup instead of marking a dead child running.
class EarlyEvents extends Events {
  emit(name, value) {
    if (name === "subagents:rpc:v1:request" && value.method === "spawn") {
      this.spawnCount += 1;
      super.emit("subagent:async-complete", { runId: "orchestrator-run-1", state: "failed" });
      queueMicrotask(() => super.emit(`subagents:rpc:v1:reply:${value.requestId}`, { version: 1, requestId: value.requestId, success: true, data: { details: { runId: "orchestrator-run-1" } } }));
      return;
    }
    return super.emit(name, value);
  }
}
const early = new AlignmentBroker({ events: new EarlyEvents(), sendUserMessage() {} }, { cwd: root, stateRoot: join(scratch, "early-state"), runtimeRoot: join(scratch, "early-runtime"), sessionId: "session-early", traceId: "4".repeat(32), pollMs: 5 });
await early.initialize();
await assert.rejects(() => early.startOrchestrator(), /ended during startup \(failed\)/);
await early.shutdown("quit");

// A proven replacement preserves one alignment identity and journal, including
// an already-open decision that remains disposable in the replacement root.
const continuityEvents = new Events();
const continuityPi = { events: continuityEvents, sendUserMessage() {} };
const continuityState = join(scratch, "continuity-state");
const continuityRuntime = join(scratch, "continuity-runtime");
const oldPiSession = join(scratch, "continuity-old.jsonl");
const newPiSession = join(scratch, "continuity-new.jsonl");
await writeFile(oldPiSession, '{"type":"session","version":3}\n', { mode: 0o600 });
await writeFile(newPiSession, '{"type":"session","version":3}\n', { mode: 0o600 });
const continuityTrace = "8".repeat(32);
const predecessor = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  sessionId: "session-continuity", traceId: continuityTrace, piSessionFile: oldPiSession,
  pollMs: 5, stopTimeoutMs: 100,
});
await predecessor.initialize(); await predecessor.startOrchestrator();
await predecessor.recordOperatorInput("Report status before the continuing boundary");
const continuingStatusRequest = {
  ...request("status_request", id("exchange"), id("request"), continuityTrace, predecessor.lastOperatorText, { scope: "change" }),
  trace_id: continuityTrace,
};
const continuingStatus = projection("status", "running", continuingStatusRequest);
setTimeout(() => writeFile(join(predecessor.channelRoot, "responses", `${continuingStatusRequest.exchange_id}.json`), `${JSON.stringify(continuingStatus)}\n`, { mode: 0o600 }), 10);
await predecessor.exchange(continuingStatusRequest);
const continuingCompletion = projection("completion", "complete", continuingStatusRequest);
await predecessor.acceptProjection(continuingCompletion, continuingStatusRequest, "orchestrator-unsolicited");
await predecessor.recordOperatorInput("Choose the continuing boundary");
const continuingRequest = {
  ...request("clarification", id("exchange"), id("request"), predecessor.lastProjectionId, predecessor.lastOperatorText, { text: "Keep this decision open across resume." }),
  trace_id: continuityTrace,
};
const continuingDecision = { decision_id: "decision-continuity", question: "Continue?", issued_for_operator_text: continuingRequest.operator_text };
const continuityEvidenceTarget = join(scratch, "continuity-evidence.txt");
await writeFile(continuityEvidenceTarget, "continuity evidence", { mode: 0o600 });
const continuityCapability = await registerEvidenceCapability(predecessor.channelRoot, {
  change_id: change, exchange_id: continuingRequest.exchange_id, target: continuityEvidenceTarget, media_type: "text/plain",
  start: 0, length: 10, retention_until: new Date(Date.now() + 60_000).toISOString(),
});
const continuingPacket = projection("decision", "waiting", continuingRequest, {
  decision: continuingDecision, evidence: [continuityCapability.capability_id], workers: ["worker-continuity"],
});
setTimeout(() => writeFile(join(predecessor.channelRoot, "responses", `${continuingRequest.exchange_id}.json`), `${JSON.stringify(continuingPacket)}\n`, { mode: 0o600 }), 10);
await predecessor.exchange(continuingRequest);
await predecessor.recordOperatorInput("reshape it to scope X");
await assert.rejects(() => predecessor.captureDisposition({
  decision_id: continuingDecision.decision_id, outcome: "reshaped", operator_response: predecessor.lastOperatorText,
}), /substantive operator disposition retained/);
const continuousJournal = predecessor.journalPath;
const alignmentSessionId = predecessor.sessionId;
await predecessor.prepareReplacement("resume", newPiSession);
assert.equal(predecessor.journalClosed, false);
const continuationPath = predecessor.continuationPath(oldPiSession);
const readyContinuation = JSON.parse(await readFile(continuationPath, "utf8"));
await writeFile(continuationPath, `${JSON.stringify({
  ...readyContinuation,
  snapshot: { open_decisions: [["decision-forged", { decision_id: "decision-forged", packet_id: "packet-forged", exchange_id: "exchange-forged" }]] },
})}\n`, { mode: 0o600 });
const forgedReplacement = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  piSessionFile: newPiSession, resumeFromSessionFile: oldPiSession, sessionReason: "resume",
});
await assert.rejects(() => forgedReplacement.initialize(), /wrong shape/);
assert.equal(continuityEvents.spawnCount, 1);
const validContinuousJournal = await readFile(continuousJournal, "utf8");
const history = validContinuousJournal.trimEnd().split("\n");
const forgedHistoryPacket = projection("decision", "waiting", continuingRequest, {
  decision: { decision_id: "decision-forged", question: "Forged?", issued_for_operator_text: continuingRequest.operator_text },
});
const directIndex = history.findIndex((line) => JSON.parse(line).payload?.packet?.packet_id === continuingPacket.packet_id);
assert.notEqual(directIndex, -1);
history.splice(directIndex + 1, 0, JSON.stringify({
  version: 1, journal_entry_id: "journal-forged", at: new Date().toISOString(), type: "orchestrator-projection",
  payload: { packet: forgedHistoryPacket, evidence_capabilities: [], broker_span_id: "1".repeat(16) },
}));
const forgedJournal = `${history.join("\n")}\n`;
await writeFile(continuousJournal, forgedJournal, { mode: 0o600 });
await writeFile(continuationPath, `${JSON.stringify({
  ...readyContinuation, journal_sha256: createHash("sha256").update(forgedJournal).digest("hex"),
})}\n`, { mode: 0o600 });
const forgedHistoryReplacement = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  piSessionFile: newPiSession, resumeFromSessionFile: oldPiSession, sessionReason: "resume",
});
await assert.rejects(() => forgedHistoryReplacement.initialize(), /more than one direct response/);
assert.equal(continuityEvents.spawnCount, 1);
const duplicateHistory = validContinuousJournal.replace(/\n([^\n]+)\n$/, `\n${validContinuousJournal.split("\n")[0]}\n$1\n`);
await writeFile(continuousJournal, duplicateHistory, { mode: 0o600 });
await writeFile(continuationPath, `${JSON.stringify({
  ...readyContinuation, journal_sha256: createHash("sha256").update(duplicateHistory).digest("hex"),
})}\n`, { mode: 0o600 });
const duplicateHistoryReplacement = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  piSessionFile: newPiSession, resumeFromSessionFile: oldPiSession, sessionReason: "resume",
});
await assert.rejects(() => duplicateHistoryReplacement.initialize(), /invalid identity/);
assert.equal(continuityEvents.spawnCount, 1);
const missingDirectJournal = `${validContinuousJournal.trimEnd().split("\n").filter((line) => {
  const entry = JSON.parse(line);
  return entry.payload?.packet?.packet_id !== continuingPacket.packet_id && entry.type !== "operator-disposition-pending";
}).join("\n")}\n`;
await writeFile(continuousJournal, missingDirectJournal, { mode: 0o600 });
await writeFile(continuationPath, `${JSON.stringify({
  ...readyContinuation, journal_sha256: createHash("sha256").update(missingDirectJournal).digest("hex"),
})}\n`, { mode: 0o600 });
const missingDirectReplacement = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  piSessionFile: newPiSession, resumeFromSessionFile: oldPiSession, sessionReason: "resume",
});
await assert.rejects(() => missingDirectReplacement.initialize(), /continuous journal-backed lineage/);
assert.equal(continuityEvents.spawnCount, 1);
await writeFile(continuousJournal, validContinuousJournal, { mode: 0o600 });
await writeFile(continuationPath, `${JSON.stringify(readyContinuation)}\n`, { mode: 0o600 });
const replacement = new AlignmentBroker(continuityPi, {
  cwd: root, stateRoot: continuityState, runtimeRoot: continuityRuntime,
  sessionId: "unused-replacement-id", traceId: "9".repeat(32), piSessionFile: newPiSession,
  resumeFromSessionFile: oldPiSession, sessionReason: "resume", pollMs: 5, stopTimeoutMs: 100,
});
await replacement.initialize();
assert.equal(replacement.sessionId, alignmentSessionId);
assert.equal(replacement.traceId, continuityTrace);
assert.equal(replacement.journalPath, continuousJournal);
assert.ok(replacement.openDecisions.has(continuingDecision.decision_id));
assert.equal(replacement.pendingDispositions.get(continuingDecision.decision_id).operator_response, "reshape it to scope X");
assert.equal(replacement.directProjectionKinds.get(continuingStatusRequest.request_id), "status");
assert.equal(replacement.directProjectionKinds.get(continuingRequest.request_id), "decision");
assert.ok(replacement.projections.has(continuingPacket.packet_id));
assert.ok(replacement.decisionIds.has(continuingDecision.decision_id));
assert.ok(replacement.evidenceIds.has(continuityCapability.capability_id));
assert.ok(replacement.workerRunIds.has("worker-continuity"));
assert.equal(replacement.workflowLifecycle, "waiting");
const restoredProjectionEntry = validContinuousJournal.trim().split("\n").map(JSON.parse)
  .find((entry) => entry.payload?.packet?.packet_id === continuingPacket.packet_id);
assert.ok(replacement.traceReferences.has(restoredProjectionEntry.journal_entry_id));
assert.equal((await replacement.openEvidence(continuityCapability.capability_id, 0, 10)).text, "continuity");
await replacement.startOrchestrator();
assert.equal(continuityEvents.spawnCount, 2);
const restoredEligibleCompletion = projection("completion", "complete", continuingStatusRequest);
await writeFile(join(replacement.channelRoot, "notifications", `notification-${randomUUID()}.json`), `${JSON.stringify(restoredEligibleCompletion)}\n`, { mode: 0o600 });
await replacement.drainNotifications();
assert.ok(replacement.projections.has(restoredEligibleCompletion.packet_id));
await replacement.recordOperatorInput("reshape");
const continuingReceipt = await replacement.captureDisposition({ decision_id: continuingDecision.decision_id, outcome: "reshaped", operator_response: "reshape" });
assert.equal(continuingReceipt.decision_id, continuingDecision.decision_id);
assert.equal(continuingReceipt.operator_response, "reshape it to scope X");
assert.equal(continuingReceipt.confirmation, "reshape");
assert.equal(replacement.openDecisions.has(continuingDecision.decision_id), false);
const continuitySealed = await replacement.seal("finalized");
assert.deepEqual(new Set(continuitySealed.root_session_files), new Set([oldPiSession, newPiSession]));
assert.equal(continuitySealed.session_id, alignmentSessionId);
assert.ok((await readFile(continuousJournal, "utf8")).includes(continuingReceipt.receipt_id));

// Failed terminal proof leaves exactly one blocked continuation. A replacement
// instance claims nothing and therefore cannot spawn a second orchestrator.
const blockedEvents = new Events(); blockedEvents.status = "running";
const blockedPi = { events: blockedEvents, sendUserMessage() {} };
const blockedState = join(scratch, "blocked-state");
const blockedRuntime = join(scratch, "blocked-runtime");
const blockedOldSession = join(scratch, "blocked-old.jsonl");
const blockedNewSession = join(scratch, "blocked-new.jsonl");
await writeFile(blockedOldSession, '{"type":"session","version":3}\n');
await writeFile(blockedNewSession, '{"type":"session","version":3}\n');
const blocked = new AlignmentBroker(blockedPi, {
  cwd: root, stateRoot: blockedState, runtimeRoot: blockedRuntime,
  sessionId: "session-blocked", traceId: "a".repeat(32), piSessionFile: blockedOldSession,
  pollMs: 2, stopTimeoutMs: 15,
});
await blocked.initialize(); await blocked.startOrchestrator();
await assert.rejects(() => blocked.prepareReplacement("resume", blockedNewSession), /terminal state was not proven/);
assert.equal(blockedEvents.spawnCount, 1);
assert.equal(blocked.journalClosed, false);
await lstat(blocked.channelRoot); await lstat(join(blocked.sessionStateRoot, "recovery.json"));
const blockedContinuations = await readdir(join(blockedState, "continuations"));
assert.equal(blockedContinuations.length, 1);
assert.equal(JSON.parse(await readFile(join(blockedState, "continuations", blockedContinuations[0]), "utf8")).state, "blocked");
const blockedReplacement = new AlignmentBroker(blockedPi, {
  cwd: root, stateRoot: blockedState, runtimeRoot: blockedRuntime,
  piSessionFile: blockedNewSession, resumeFromSessionFile: blockedOldSession,
  sessionReason: "resume", pollMs: 2, stopTimeoutMs: 15,
});
await assert.rejects(() => blockedReplacement.initialize(), /shutdown is unresolved/);
assert.equal(blockedEvents.spawnCount, 1);

// RPC not_found is merely a refusal, never terminal evidence for the exact run.
const missingEvents = new Events(); missingEvents.stopError = "not_found"; missingEvents.statusError = "not_found";
const missingPi = { events: missingEvents, sendUserMessage() {} };
const missingState = join(scratch, "missing-state");
const missingOldSession = join(scratch, "missing-old.jsonl");
const missingNewSession = join(scratch, "missing-new.jsonl");
await writeFile(missingOldSession, '{"type":"session","version":3}\n');
await writeFile(missingNewSession, '{"type":"session","version":3}\n');
const missing = new AlignmentBroker(missingPi, {
  cwd: root, stateRoot: missingState, runtimeRoot: join(scratch, "missing-runtime"),
  sessionId: "session-missing", traceId: "b".repeat(32), piSessionFile: missingOldSession,
  pollMs: 2, stopTimeoutMs: 15,
});
await missing.initialize(); await missing.startOrchestrator();
await assert.rejects(() => missing.prepareReplacement("new", missingNewSession), /terminal state was not proven.*not_found/);
assert.equal(missingEvents.spawnCount, 1);
const missingContinuation = JSON.parse(await readFile(missing.continuationPath(missingOldSession), "utf8"));
assert.equal(missingContinuation.state, "blocked");

console.log("alignment contracts/broker: pass");
JS

# Immutable launch/profile structure and independent architect refusal.
assert_file_contains "$ROOT/bin/pi" '--no-extensions --extension "$env_extension" --extension "$execution_profile_extension" --extension "$profile_extension" --extension "$vendor_extension"'
assert_file_contains "$ROOT/extensions/qq-aligner.ts" 'pi.on("resources_discover"'
assert_file_contains "$ROOT/bin/pi" '--no-skills --no-prompt-templates --no-context-files --no-tools'
assert_file_contains "$ROOT/bin/pi" 'PI_SUBAGENT_CHILD_AGENT'
assert_file_contains "$ROOT/extensions/qq-aligner.ts" 'systemPrompt: prompt'
assert_file_contains "$ROOT/extensions/qq-aligner.ts" 'active-tool drift'
assert_file_not_matches "$ROOT/extensions/qq-aligner.ts" 'registerArchitectDiscussion|sendUserMessage\(.*architect'
assert_file_contains "$ROOT/bin/qq-architect" 'qq cannot create a background interactive Herdr tab without an owned no-focus API'
if "$ROOT/bin/qq-architect" --background >"$TMP/architect.out" 2>"$TMP/architect.err"; then
  fail 'background architect launcher unexpectedly guessed a Herdr API'
fi
assert_file_contains "$TMP/architect.err" 'no-focus API'
if env -u PI_SUBAGENT_CHILD_AGENT "$ROOT/bin/pi" --tools read >"$TMP/conflict.out" 2>"$TMP/conflict.err"; then
  fail 'root profile accepted conflicting --tools'
fi
assert_file_contains "$TMP/conflict.err" 'owns resource, prompt, and tool selection'
# Installed runtime identity is exercised through isolated fixtures in
# test-qq-pi-runtime.sh; core workflow checks never require host activation.

# Trusted topology and depth controls are source-owned and exact.
jq -e '.roles.orchestrator == {access:"orchestrator-write", policyIdentity:"qq-orchestrator-change-runtime-write-v1"}' "$ROOT/delegation/policies/roles.json" >/dev/null
assert_file_contains "$ROOT/delegation/manifests/agents/orchestrator.md" 'tools: read, grep, find, ls, bash, edit, write, subagent, subagent_wait, qq_alignment_receive, qq_alignment_reply, qq_alignment_notify, qq_register_evidence'
assert_file_contains "$ROOT/delegation/manifests/agents/orchestrator.md" 'maxSubagentDepth: 2'
assert_file_contains "$ROOT/extensions/qq-subagent-env.ts" 'Number(process.env.PI_SUBAGENT_DEPTH ?? "0") >= 1'
assert_file_contains "$ROOT/extensions/qq-subagent-env.ts" 'orchestrator: join(agentDir, "orchestrator.md")'
assert_file_contains "$ROOT/bin/qq-dispatch" 'orchestrator) observation_phase=orchestration'

# No calibration surface, focus call, focus restoration, broad evidence lookup,
# or anti-chatter/exchange cap exists on the profile/channel surface.
assert_file_not_matches "$ROOT/extensions/qq-aligner.ts" 'calibration|herdr focus|qq-handoff|exchange-count|maxExchanges|glob|search|path-to-capability'
assert_file_not_matches "$ROOT/extensions/lib/qq-alignment-broker.ts" 'calibration_state|maxExchanges'
assert_file_not_matches "$ROOT/delegation/extensions/qq-alignment-channel.ts" 'intercom|PI_SUPERVISOR'

printf 'test-qq-alignment-core: pass\n'
