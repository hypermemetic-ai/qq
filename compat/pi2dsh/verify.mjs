#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [matrixPath, inspectionPath, stdoutPath, stderrPath, relayRequestPath, sessionIdPath, receiptProbePath, sessionLogPath] = process.argv.slice(2);
if (!sessionLogPath) {
  throw new Error("usage: verify.mjs <matrix.json> <inspection.json> <stdout.log> <stderr.log> <relay-request.json> <dsh-session-id.txt> <relay-receipts.jsonl> <session.jsonl>");
}

const [matrix, inspection, stdout, stderr, relayRequest, dshSessionId, receiptEvents, sessionEvents] = await Promise.all([
  readFile(matrixPath, "utf8").then(JSON.parse),
  readFile(inspectionPath, "utf8").then(JSON.parse),
  readFile(stdoutPath, "utf8"),
  readFile(stderrPath, "utf8"),
  readFile(relayRequestPath, "utf8").then(JSON.parse),
  readFile(sessionIdPath, "utf8").then((value) => value.trim()),
  readFile(receiptProbePath, "utf8").then((value) => value.trim().split("\n").filter(Boolean).map(JSON.parse)),
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
assert.equal(relayRequest.consumer_type, "recipient");
assert.equal(relayRequest.consumer_id, `agents/${dshSessionId}`, "the DSH identity changed before becoming the live relay address");
assert.equal(relayRequest.generation, 0);
assert.match(relayRequest.endpoint_token, /^agent-messages\/[a-f0-9-]{36}$/);
assert.equal(relayRequest.wait_ms, 30_000);

const relayContent = "pi2dsh durable receipt probe";
const receiptContent = `[message evt_pi2dsh_durable_receipt from 019ff7b9-2fcd-78cd-bc16-c770a9ccff11 — qq / architect — tasks: T-63.3]\n${relayContent}`;
const durableReceipt = sessionEvents.find((event) => event.type === "user/message" && event.data?.source?.piCustomType === "qq-agent-message");
assert.ok(durableReceipt, "the pinned DSH log has no qq agent-message receipt entry");
assert.equal(durableReceipt.data.role, "user");
assert.deepEqual(durableReceipt.data.source, {
  kind: "plugin", plugin: "pi2dsh:qq", piCustomType: "qq-agent-message",
});
assert.deepEqual(durableReceipt.data.content, [{ type: "text", text: receiptContent }]);

assert.ok(receiptEvents.some((event) => event.operation === "retry"), "the capture stub never observed pre-persistence retry");
const acknowledgements = receiptEvents.filter((event) => event.operation === "acknowledge");
assert.equal(acknowledgements.length, 1, "the durable receipt did not produce exactly one relay acknowledgement");
const acknowledgement = acknowledgements[0];
assert.equal(acknowledgement.request.event_id, "evt_pi2dsh_durable_receipt");
assert.ok(acknowledgement.observed_at >= durableReceipt.time, "relay acknowledgement preceded the matching DSH durable entry");
assert.equal(receiptEvents.at(-1).operation, "acknowledge");

console.log("qq pi2dsh compatibility evidence verified");
