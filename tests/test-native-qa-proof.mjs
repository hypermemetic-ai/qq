#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const verdicts = await import(pathToFileURL(join(root, "bin/lib/qa-verdict.mjs")));
const proof = await import(pathToFileURL(join(root, "compat/pi2dsh/native-qa-proof/plugin.mjs")));

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

  const main = join(scratch, "main");
  const worktree = join(scratch, "worktree");
  execFileSync("git", ["init", "-q", "-b", "main", main]);
  execFileSync("git", ["-C", main, "config", "user.name", "qa-test"]);
  execFileSync("git", ["-C", main, "config", "user.email", "qa-test.invalid"]);
  await writeFile(join(main, "README.md"), "base\n");
  execFileSync("git", ["-C", main, "add", "README.md"]);
  execFileSync("git", ["-C", main, "commit", "-qm", "base"]);
  const baseRef = execFileSync("git", ["-C", main, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  execFileSync("git", ["-C", main, "worktree", "add", "-qb", "qa/test", worktree]);
  await writeFile(join(worktree, "proof.txt"), "submitted\n");
  execFileSync("git", ["-C", worktree, "add", "proof.txt"]);
  execFileSync("git", ["-C", worktree, "commit", "-qm", "submitted"]);
  const ref = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const statePath = join(scratch, "handoff.json");
  const architect = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
  const parent = "session-1bfba388-5ac3-492a-a578-a4e05a32d790";
  const runner = "621eeb4e-3796-4d58-92d2-9a45e4f133b0";
  const state = {
    runtime: "dsh",
    id: "t-6315-proof",
    task: { id: "T-6315", title: "proof" },
    status: "submitted",
    look: 0,
    statePath,
    mainRoot: main,
    worktree,
    baseRef,
    ref,
    architectSession: architect,
    callerSession: architect,
    bootstrapParentSession: parent,
    runnerSession: runner,
    approval: {
      schema: "qq.dsh-run-approval/v1",
      runtime: "dsh",
      status: "approved",
      runId: "t-6315-proof",
      taskId: "T-6315",
      architectSession: architect,
      approvedAt: "2026-08-17T00:00:00.000Z",
    },
    submission: {
      schema: "qq.dsh-run-submission/v1",
      runtime: "dsh",
      ref,
      awaiting: "native-review",
      submittedAt: "2026-08-17T00:01:00.000Z",
      continuation: {
        architectSession: architect,
        bootstrapParentSession: parent,
        runnerSession: runner,
        runState: statePath,
        worktree,
      },
    },
  };
  assert.equal(proof.internals.validateSubmittedHandoff(state, statePath), state);
  assert.equal(proof.internals.verifySubmittedRepository(state), ref);

  const invalid = [
    [{ ...state, status: "reviewing" }, /untouched native submission/],
    [{ ...state, look: 1 }, /untouched native submission/],
    [{ ...state, approval: { ...state.approval, runId: "other" } }, /approval identity/],
    [{ ...state, submission: { ...state.submission, ref: baseRef } }, /submission record/],
    [{ ...state, submission: { ...state.submission, continuation: { ...state.submission.continuation, runnerSession: "other" } } }, /continuation identity/],
    [{ ...state, callerSession: parent }, /architect\/caller/],
  ];
  for (const [candidate, pattern] of invalid) assert.throws(() => proof.internals.validateSubmittedHandoff(candidate, statePath), pattern);

  await writeFile(join(worktree, "dirty.txt"), "dirty\n");
  assert.throws(() => proof.internals.verifySubmittedRepository(state), /worktree is not clean/);
  await rm(join(worktree, "dirty.txt"));
  assert.throws(() => proof.internals.verifySubmittedRepository({ ...state, baseRef: ref, ref: baseRef }), /does not descend/);
  const other = join(scratch, "other");
  execFileSync("git", ["init", "-q", "-b", "main", other]);
  execFileSync("git", ["-C", other, "fetch", "-q", main, ref]);
  assert.throws(() => proof.internals.verifySubmittedRepository({ ...state, mainRoot: other }), /do not share one repository/);

  const complete = proof.internals.completeQaPrompt(
    { ...state, qa: { provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high" } },
    "ticket body",
    "delegate note",
    { provider: "deepseek-official", model: "deepseek-v4-flash", reasoningEffort: "high" },
    ["read", "bash", "edit", "write"],
  );
  for (const section of ["# Role", "# Handoff", "## Outbound ticket", "## Delegate note", "# Review instructions", "# Restrictions", "# Verdict contract"]) {
    assert.match(complete, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(complete, /exactly: read, bash, edit, write, qa_verdict/);

  const toolView = (names) => ({ tools: { schemas: () => names.map((name) => ({ name })), get: (name) => names.includes(name) ? { name } : undefined } });
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(["write", "read", "edit", "bash", "other"])).names, ["read", "bash", "edit", "write"]);
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(["read", "bash"])).missing, ["edit", "write"]);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-native-qa-proof: pass");
