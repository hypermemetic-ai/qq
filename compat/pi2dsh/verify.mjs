#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [matrixPath, inspectionPath, stdoutPath, stderrPath, relayProofPath, sessionIdPath, sessionLogPath] = process.argv.slice(2);
if (!sessionLogPath) {
  throw new Error("usage: verify.mjs <matrix.json> <inspection.json> <stdout.log> <stderr.log> <relay-proof.json> <dsh-session-id.txt> <session.jsonl>");
}

const [matrix, inspection, stdout, stderr, relayProof, dshSessionId, sessionEvents] = await Promise.all([
  readFile(matrixPath, "utf8").then(JSON.parse),
  readFile(inspectionPath, "utf8").then(JSON.parse),
  readFile(stdoutPath, "utf8"),
  readFile(stderrPath, "utf8"),
  readFile(relayProofPath, "utf8").then(JSON.parse),
  readFile(sessionIdPath, "utf8").then((value) => value.trim()),
  readFile(sessionLogPath, "utf8").then((value) => value.trim().split("\n").filter(Boolean).map(JSON.parse)),
]);

function rule(group, name, level, detail) {
  const value = matrix[group]?.[name];
  assert.ok(value, `pi2dsh matrix is missing ${group}.${name}`);
  assert.equal(value.level, level, `${group}.${name} compatibility changed`);
  assert.match(value.detail, detail, `${group}.${name} semantics changed`);
}

rule("api", "events", "full", /Package-local/);
rule("events", "before_agent_start", "full", /same turn/);
rule("api", "registerTool", "partial", /native DSH tool/);
rule("api", "registerCommand", "partial", /ctx\.commands/);
rule("api", "setModel", "partial", /per-agent override/);
rule("api", "setThinkingLevel", "partial", /reasoningEffort/);
rule("api", "registerShortcut", "partial", /never fire/);
rule("events", "session_tree", "partial", /never fires/);
rule("context", "shutdown", "partial", /absorbs the request/);
rule("events", "project_trust", "unsupported", /never consulted/);
rule("context", "isProjectTrusted", "partial", /untrusted/);
rule("context", "sessionManager", "partial", /sidecar/);
rule("api", "sendMessage", "partial", /session log/);

assert.equal(inspection.schemaVersion, 1);
assert.equal(inspection.package.name, "qq");
assert.deepEqual(inspection.resources.extensions, ["extensions/index.ts"]);
assert.deepEqual(inspection.summary, { full: 66, partial: 57, unsupported: 0, fatal: 0 });
assert.equal(inspection.verdict, "review");

function finding(capability, file) {
  assert.ok(
    inspection.findings.some((item) => item.capability === capability && item.file === file),
    `qq inspection is missing ${capability} in ${file}`,
  );
}

finding("events.on", "extensions/agent-messages.ts");
finding("on(before_agent_start)", "extensions/execution-profiles.ts");
finding("registerTool", "extensions/read.ts");
finding("registerCommand", "extensions/execution-profiles.ts");
finding("setModel", "extensions/execution-profiles.ts");
finding("setThinkingLevel", "extensions/execution-profiles.ts");
finding("registerShortcut", "extensions/continue.ts");
finding("on(session_tree)", "extensions/grok-paraphrase-guard.ts");
finding("ctx.shutdown", "extensions/review-flow.ts");

assert.match(stdout, /\[pi2dsh engine\] mounting 1 Pi package\(s\): qq/);
assert.match(stdout, /\[pi2dsh\] loaded qq: 8 tools, 3 commands, 0 skill roots/);
assert.doesNotMatch(stderr, /extension entry failed|every Pi extension entry failed/);
assert.match(stderr, /constraint is not enforced by DSH and was dropped/);
assert.match(stderr, /qq startup refused: runner profile grok-high model is unavailable: xai-auth\/grok-4\.6/);
assert.doesNotMatch(stderr, /session_start handler failed/);
assert.doesNotMatch(stderr, /MISSING_CREDENTIAL/);
assert.match(stdout, /receipt probe step complete/);

assert.match(dshSessionId, /^session-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
assert.equal(relayProof.schema, "qq.pi2dsh-installed-relay-proof/v1");
assert.equal(relayProof.protocol, "qq-relay/v1");
assert.equal(relayProof.recipient_session_id, dshSessionId);
assert.equal(relayProof.sender_session_id, "019ff7b9-2fcd-78cd-bc16-c770a9ccff11");
assert.match(relayProof.event_id, /^evt_[a-f0-9]{32}$/);
assert.equal(relayProof.initial_status.record.event_id, relayProof.event_id);

const finalStatus = relayProof.final_status;
assert.equal(finalStatus.terminal, true);
assert.equal(finalStatus.terminal_failure, false);
assert.equal(finalStatus.record.event_id, relayProof.event_id);
assert.equal(finalStatus.record.producer_id, `agents/${relayProof.sender_session_id}`);
assert.equal(finalStatus.record.origin_id, `agents/${relayProof.sender_session_id}`);
assert.equal(finalStatus.record.recipient_id, `agents/${dshSessionId}`, "the DSH identity changed in relay status");
assert.equal(finalStatus.record.envelope.payload.message.from, relayProof.sender_session_id);
assert.equal(finalStatus.obligations.length, 1);
const obligation = finalStatus.obligations[0];
assert.equal(obligation.consumer_type, "recipient");
assert.equal(obligation.consumer_id, `agents/${dshSessionId}`, "the DSH identity changed at the delivery boundary");
assert.equal(obligation.generation, 0);
assert.equal(obligation.status, "acknowledged");
assert.ok(obligation.failure_count >= 1, "installed qq-relay never recorded the pre-persistence retry");
assert.ok(obligation.attempt_count >= 2, "installed qq-relay never safely redelivered after retry");

const relayContent = "installed qq-relay DSH receipt probe";
const receiptContent = `[message ${relayProof.event_id} from ${relayProof.sender_session_id} — qq / architect — tasks: T-63.5]\n${relayContent}`;
const durableReceipts = sessionEvents.filter((event) =>
  event.type === "user/message"
  && event.data?.source?.piCustomType === "qq-agent-message"
  && event.data?.content?.[0]?.text === receiptContent
);
assert.equal(durableReceipts.length, 1, "relay redelivery did not produce exactly one durable DSH receipt");
const durableReceipt = durableReceipts[0];
assert.equal(durableReceipt.data.role, "user");
assert.deepEqual(durableReceipt.data.source, {
  kind: "plugin", plugin: "pi2dsh:qq", piCustomType: "qq-agent-message",
});
assert.deepEqual(durableReceipt.data.content, [{ type: "text", text: receiptContent }]);
assert.ok(finalStatus.record.accepted_at <= durableReceipt.time, "DSH receipt predates relay acceptance");
assert.ok(obligation.terminal_at >= durableReceipt.time, "relay acknowledgement preceded the durable DSH entry");

console.log("qq pi2dsh compatibility evidence verified");
