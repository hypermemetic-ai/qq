#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [matrixPath, inspectionPath, stdoutPath, stderrPath] = process.argv.slice(2);
if (!stderrPath) {
  throw new Error("usage: verify.mjs <matrix.json> <inspection.json> <stdout.log> <stderr.log>");
}

const [matrix, inspection, stdout, stderr] = await Promise.all([
  readFile(matrixPath, "utf8").then(JSON.parse),
  readFile(inspectionPath, "utf8").then(JSON.parse),
  readFile(stdoutPath, "utf8"),
  readFile(stderrPath, "utf8"),
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
assert.match(stderr, /session_start handler failed: Error: Pi supplied a non-canonical session ID/);
assert.match(stderr, /MISSING_CREDENTIAL/);

console.log("qq pi2dsh compatibility evidence verified");
