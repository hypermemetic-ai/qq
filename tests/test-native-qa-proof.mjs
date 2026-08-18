#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const verdicts = await import(pathToFileURL(join(root, "bin/lib/qa-verdict.mjs")));

const input = {
  verdict: "pass",
  summary: "boundary passed",
  feedback: "focused checks passed",
  tests_modified: false,
};
const record = verdicts.createQaVerdict(input, { createdAt: "2026-08-17T00:00:00.000Z" });
assert.equal(verdicts.validateQaVerdictRecord(record), record);
assert.equal(record.schema, verdicts.QA_VERDICT_SCHEMA);
assert.throws(() => verdicts.createQaVerdict({ ...input, extra: true }), /wrong fields/);
assert.throws(() => verdicts.createQaVerdict({ ...input, verdict: "maybe" }), /pass or fail/);
assert.throws(() => verdicts.createQaVerdict({ ...input, summary: "" }), /summary/);
assert.throws(() => verdicts.createQaVerdict({ ...input, feedback: "x".repeat(8001) }), /feedback/);
assert.throws(() => verdicts.validateQaVerdictRecord({ ...record, owner: "proof" }), /malformed/);

const scratch = await mkdtemp(join(tmpdir(), "qq-native-qa-test-"));
try {
  const verdictRoot = join(scratch, "verdicts");
  await chmod(scratch, 0o755);
  const verdictPath = join(verdictRoot, "verdict.json");
  await verdicts.writeQaVerdict(verdictPath, record);
  assert.deepEqual(JSON.parse(await readFile(verdictPath, "utf8")), record);
  assert.equal((await lstat(verdictRoot)).mode & 0o077, 0);
  assert.equal((await lstat(verdictPath)).mode & 0o077, 0);
  await assert.rejects(verdicts.writeQaVerdict(verdictPath, verdicts.createQaVerdict({ ...input, verdict: "fail" })), /already submitted/);
  assert.deepEqual(JSON.parse(await readFile(verdictPath, "utf8")), record, "exclusive verdict writer replaced its first record");
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-native-qa-proof: pass");
