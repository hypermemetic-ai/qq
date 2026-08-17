#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

const bindingState = { qa: { provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high" } };
const bindingCtx = (selection = { provider: "deepseek-official", model: "deepseek-v4-flash" }, resolveCallConfig = async (value) => value) => ({
  agentDefaultModel: { currentSelection: () => selection },
  llm: { resolveCallConfig },
});
assert.deepEqual(await proof.internals.installedBinding(bindingCtx(), bindingState), {
  provider: "deepseek-official", model: "deepseek-v4-flash", reasoningEffort: "high",
});
await assert.rejects(proof.internals.installedBinding(bindingCtx(null), bindingState), /no default model selection/);
await assert.rejects(proof.internals.installedBinding(bindingCtx({ provider: "missing", model: "missing" }), bindingState), /differs from installed/);
await assert.rejects(proof.internals.installedBinding(bindingCtx(), { qa: { ...bindingState.qa, effort: "" } }), /no QA reasoning effort/);
await assert.rejects(proof.internals.installedBinding(bindingCtx(undefined, async () => { throw new Error("model unavailable"); }), bindingState), /model unavailable/);
await assert.rejects(proof.internals.installedBinding(bindingCtx(undefined, async () => { throw new Error("effort unavailable"); }), bindingState), /effort unavailable/);

const collisionCtx = (toolNames = [], sectionNames = []) => ({
  tools: { schemas: () => toolNames.map((name) => ({ name })) },
  systemPrompt: { assemble: async () => ({ sections: sectionNames.map((name) => ({ name })) }) },
});
await proof.internals.assertNoCompositionCollisions(collisionCtx());
await assert.rejects(proof.internals.assertNoCompositionCollisions(collisionCtx([proof.internals.QA_TOOL_NAME])), /collides with an installed-profile tool/);
await assert.rejects(proof.internals.assertNoCompositionCollisions(collisionCtx([], [proof.internals.COMPLETE_SECTION])), /collides with an installed-profile prompt section/);

const identityCtx = (agent, session) => ({ agents: { get: () => agent }, sessions: { get: () => session } });
assert.doesNotThrow(() => proof.internals.assertQaIdentityAvailable(identityCtx(), "session-qa"));
assert.throws(() => proof.internals.assertQaIdentityAvailable(identityCtx({ id: "session-qa" }), "session-qa"), /live Agent/);
assert.throws(() => proof.internals.assertQaIdentityAvailable(identityCtx(undefined, { id: "session-qa" }), "session-qa"), /live Session/);

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
    schema: "qq.run-handoff/v1",
    version: 1,
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
  const handoffText = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(statePath, handoffText);
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
  execFileSync("git", ["-C", worktree, "checkout", "-q", baseRef]);
  assert.throws(() => proof.internals.verifySubmittedRepository(state), /HEAD is not the exact ref/);
  execFileSync("git", ["-C", worktree, "checkout", "-q", ref]);
  execFileSync("git", ["-C", worktree, "checkout", "-q", baseRef]);
  assert.throws(() => proof.internals.verifySubmittedRepository({ ...state, baseRef: ref, ref: baseRef }), /does not descend/);
  execFileSync("git", ["-C", worktree, "checkout", "-q", ref]);
  const other = join(scratch, "other");
  execFileSync("git", ["init", "-q", "-b", "main", other]);
  execFileSync("git", ["-C", other, "fetch", "-q", main, ref]);
  assert.throws(() => proof.internals.verifySubmittedRepository({ ...state, mainRoot: other }), /do not share one repository/);

  await chmod(scratch, 0o700);
  const qaSession = "session-9a510b67-d7cb-44f7-a665-9952f782f2c0";
  const liveSession = { id: qaSession, header: { cwd: worktree } };
  const liveAgent = { id: qaSession, session: liveSession };
  const liveCtx = {
    agents: { get: (id) => id === qaSession ? liveAgent : undefined },
    sessions: { get: (id) => id === qaSession ? liveSession : undefined },
  };
  const proofPath = join(scratch, "native-qa.json");
  const boundaryVerdictPath = join(scratch, "native-qa-verdict.json");
  const boundaryProof = () => ({
    schema: proof.internals.STATE_SCHEMA,
    version: 1,
    owner: "qq",
    status: "reviewing",
    runId: state.id,
    qaSession,
    statePath,
    handoff: {
      runtime: "dsh",
      status: "submitted",
      look: 0,
      ref,
      digest: createHash("sha256").update(handoffText).digest("hex"),
    },
  });
  const writeBoundaryProof = async (value) => writeFile(proofPath, `${JSON.stringify(value, null, 2)}\n`);
  const exec = (agent = liveAgent, signal = new AbortController().signal) => ({ agent, signal });
  const makeTool = (proofState) => proof.internals.qaTool({
    ctx: liveCtx,
    proofState,
    proofPath,
    verdictPath: boundaryVerdictPath,
    statePath,
  });

  let proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  await assert.rejects(makeTool(proofState).execute(input, exec({ id: "session-other", session: { id: "session-other" } })), /not the bound QA Agent\/Session/);
  await assert.rejects(readFile(boundaryVerdictPath), /ENOENT/);

  const changedRefState = { ...state, ref: baseRef, submission: { ...state.submission, ref: baseRef } };
  await writeFile(statePath, `${JSON.stringify(changedRefState, null, 2)}\n`);
  proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  await assert.rejects(makeTool(proofState).execute(input, exec()), /handoff digest changed|run\/ref\/status\/look tuple changed/);
  await assert.rejects(readFile(boundaryVerdictPath), /ENOENT/);
  await writeFile(statePath, handoffText);

  const interrupted = new AbortController();
  interrupted.abort(new Error("interrupted"));
  proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  await assert.rejects(makeTool(proofState).execute(input, exec(liveAgent, interrupted.signal)), /interrupted/);
  await assert.rejects(readFile(boundaryVerdictPath), /ENOENT/);

  let boundaryChecks = 0;
  const boundaryInterrupt = {
    throwIfAborted() {
      boundaryChecks += 1;
      if (boundaryChecks === 4) throw new Error("interrupted at verdict commit");
    },
  };
  proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  await assert.rejects(makeTool(proofState).execute(input, exec(liveAgent, boundaryInterrupt)), /interrupted at verdict commit/);
  assert.equal(JSON.parse(await readFile(proofPath, "utf8")).status, "submitting");
  await assert.rejects(readFile(boundaryVerdictPath), /ENOENT/);

  await writeFile(join(worktree, "verdict-dirty.txt"), "dirty\n");
  proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  await assert.rejects(makeTool(proofState).execute(input, exec()), /worktree is not clean/);
  await assert.rejects(readFile(boundaryVerdictPath), /ENOENT/);
  await rm(join(worktree, "verdict-dirty.txt"));

  proofState = boundaryProof();
  await writeBoundaryProof(proofState);
  assert.deepEqual(await makeTool(proofState).execute(input, exec()), { recorded: true, verdict: "pass" });
  const durableProof = JSON.parse(await readFile(proofPath, "utf8"));
  const durableVerdict = JSON.parse(await readFile(boundaryVerdictPath, "utf8"));
  assert.equal(durableProof.status, "verdict-recorded");
  assert.equal(durableProof.qaSession, qaSession);
  assert.equal(durableProof.runId, state.id);
  assert.equal(durableProof.verdict.digest, createHash("sha256").update(await readFile(boundaryVerdictPath, "utf8")).digest("hex"));
  assert.equal(verdicts.validateQaVerdictRecord(durableVerdict), durableVerdict);

  const reviewMessage = { id: "review-message", text: proof.internals.REVIEW_MESSAGE };
  const visibleTools = ["bash", "edit", "qa_verdict", "read", "write"];
  const binding = { provider: "deepseek-official", model: "deepseek-v4-flash", reasoningEffort: "high" };
  const callId = "call-qa-verdict";
  const coldInspection = {
    meta: { id: qaSession, cwd: worktree },
    events: [
      { type: "request/header", data: { header: { config: binding, system: "exact prompt", tools: visibleTools.map((name) => ({ name })) } } },
      { type: "user/message", data: { id: reviewMessage.id, content: [{ type: "text", text: reviewMessage.text }], source: { kind: "user" } } },
      { type: "tool/call", data: { callId, name: "qa_verdict", arguments: JSON.stringify(input) } },
      { type: "tool/result", data: { message: { content: [{ type: "tool-result", toolCallId: callId, content: [{ type: "text", text: "qa verdict recorded: pass" }], isError: false }] } } },
    ],
  };
  assert.equal(proof.internals.assertPersistedQaHistory(coldInspection, {
    qaSession, cwd: worktree, prompt: "exact prompt", visibleTools, binding, reviewMessage, verdict: durableVerdict,
  }).result.type, "tool/result");
  const changedColdResult = structuredClone(coldInspection);
  changedColdResult.events[3].data.message.content[0].content[0].text = "changed";
  assert.throws(() => proof.internals.assertPersistedQaHistory(changedColdResult, {
    qaSession, cwd: worktree, prompt: "exact prompt", visibleTools, binding, reviewMessage, verdict: durableVerdict,
  }), /changed the exact qa_verdict result/);

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
  const installedTools = ["write", "read", "edit", "bash", "other", ...proof.internals.REQUIRED_QQ_PROFILE_TOOLS];
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(installedTools)).names, ["read", "bash", "edit", "write"]);
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(installedTools)).profile, proof.internals.REQUIRED_QQ_PROFILE_TOOLS);
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(["read", "bash"])).missing, ["edit", "write"]);
  assert.deepEqual(proof.internals.actualPiCapabilities(toolView(["read", "bash", "edit", "write"])).missingProfile, proof.internals.REQUIRED_QQ_PROFILE_TOOLS,
    "native DSH defaults falsely satisfied qq/pi2dsh provenance");
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-native-qa-proof: pass");
