import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const review = await import(pathToFileURL(join(root, "bin/lib/review.mjs")));
const runLib = await import(pathToFileURL(join(root, "bin/lib/run.mjs")));
const runEvents = await import(pathToFileURL(join(root, "bin/lib/run-events.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/review-flow.ts")));
const qaResult = await import(pathToFileURL(join(root, "extensions/qa-result.ts")));

async function waitFor(label, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${label}`);
}

function boardStatuses(calls) {
  return calls
    .filter(({ args }) => args[0] === "task" && args[1] === "edit" && args[3] === "--status")
    .map(({ args }) => args[4]);
}

assert.deepEqual(review.parseNumstat("3\t1\tsrc/a.ts\n-\t-\tassets/x.bin\n"), [
  { path: "src/a.ts", added: 3, deleted: 1 },
  { path: "assets/x.bin", added: null, deleted: null },
]);
assert.equal(review.formatPack({ summary: "small fix", files: [{ path: "src/a.ts", added: 3, deleted: 1 }] }), "small fix\nsrc/a.ts +3/-1");

const scratch = await mkdtemp(join(homedir(), "qq-review-test."));
try {
  const availableShell = JSON.stringify({
    id: "cli:pane:process_info",
    result: { type: "pane_process_info", process_info: { shell_pid: 10, foreground_process_group_id: 10, foreground_processes: [{ pid: 10, name: "zsh" }] } },
  });
  const worktree = join(scratch, "worktree");
  const mainRoot = join(scratch, "main");
  await mkdir(worktree);
  await mkdir(mainRoot);
  const statePath = join(scratch, "state", "handoff.json");
  const base = {
    schema: "qq.run-handoff/v1", version: 1, id: "task-1-x", project: "qq",
    task: { id: "TASK-1", title: "One task" }, status: "running", look: 0,
    mainRoot, baseBranch: "main", baseRef: "base", branch: "qq/task-1-x", worktree,
    pane: "w2T:p9", architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    ticketPath: join(scratch, "ticket.md"), transcriptPath: join(scratch, "transcript.md"),
    notePath: join(scratch, "note.md"), gatePath: join(scratch, "gate.md"), statePath,
    qa: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  };
  await runLib.atomicPrivateJson(statePath, base);
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: "refsha\n", stderr: "" };
    if (command === "git" && args[0] === "status") return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "git" && args[0] === "diff" && args.includes("--name-only")) return { code: 0, stdout: "src/a.ts\0", stderr: "" };
    if (command === "git" && args[0] === "diff") return { code: 0, stdout: "2\t1\tsrc/a.ts\n", stderr: "" };
    if (command === "git" && args[0] === "merge-base" && args.at(-1) === "HEAD") return { code: 1, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "for-each-ref") return { code: 0, stdout: "origin\0refs/heads/main\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const prepared = await review.prepareDone(run, worktree, statePath, "HEAD");
  assert.equal(prepared.look, 1);
  assert.equal(prepared.status, "reviewing");
  assert.equal(prepared.ref, "refsha");
  assert.ok(calls.some(({ args }) => args[0] === "merge-base"));
  assert.deepEqual(boardStatuses(calls), []);

  prepared.status = "proposal";
  prepared.qaVerdict = {
    schema: "qq.qa-verdict/v1", version: 1, verdict: "pass", summary: "small fix", feedback: "", tests_modified: false,
  };
  prepared.pack = { summary: "small fix", files: [{ path: "src/a.ts", added: 2, deleted: 1 }] };
  assert.equal(review.isQaPassedProposal(prepared), true);
  assert.equal(review.isQaPassedProposal({ ...prepared, status: "blocked" }), false);
  assert.equal(review.isQaPassedProposal({ ...prepared, status: "commented", qaVerdict: undefined }), false);
  await runLib.atomicPrivateJson(statePath, prepared);
  const dirtyMainCalls = [];
  const dirtyMainRun = async (command, args, options = {}) => {
    dirtyMainCalls.push({ command, args, options });
    if (command === "git" && args[0] === "status" && options.cwd === mainRoot) {
      return { code: 0, stdout: " M src/local edit.js\n?? notes/untracked file.md\n", stderr: "" };
    }
    return run(command, args, options);
  };
  await assert.rejects(
    review.landHandoff(dirtyMainRun, statePath),
    /main checkout clean-checkout invariant violation; dirty paths:\n M src\/local edit\.js\n\?\? notes\/untracked file\.md/,
  );
  const dirtyMainState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(dirtyMainState.status, "blocked");
  assert.equal(dirtyMainState.ref, "refsha");
  assert.deepEqual(dirtyMainState.qaVerdict, prepared.qaVerdict);
  assert.equal(review.isQaPassedProposal(dirtyMainState), true);
  const mainStatusCall = dirtyMainCalls.find(({ command, args }) => command === "git" && args[0] === "status");
  assert.deepEqual(mainStatusCall.args, ["status", "--porcelain", "--untracked-files=all"]);
  assert.equal(mainStatusCall.options.cwd, mainRoot);
  assert.equal(dirtyMainCalls.some(({ command, args }) => command === "git" && ["merge-tree", "merge", "stash", "reset"].includes(args[0])), false);
  assert.deepEqual(boardStatuses(calls), []);

  await runLib.atomicPrivateJson(statePath, prepared);
  const generatedDiffCalls = [];
  const generatedDiffRun = async (command, args, options = {}) => {
    generatedDiffCalls.push({ command, args, options });
    if (command === "git" && args[0] === "diff" && args.includes("--name-only")) {
      return { code: 0, stdout: "src/a.ts\0openwiki/quickstart.md\0", stderr: "" };
    }
    return run(command, args, options);
  };
  await assert.rejects(
    review.landHandoff(generatedDiffRun, statePath),
    /delegated proposal changes generated OpenWiki paths: openwiki\/quickstart\.md/,
  );
  assert.equal(generatedDiffCalls.some(({ command, args }) => command === "git" && ["merge-tree", "merge", "push"].includes(args[0])), false);
  assert.equal(generatedDiffCalls.some(({ command }) => command.endsWith("/bin/qq-openwiki-materialize")), false);

  await runLib.atomicPrivateJson(statePath, prepared);
  await review.landHandoff(run, statePath);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");
  const operations = calls.filter(({ command }) => command === "git").map(({ args }) => args[0]);
  assert.ok(operations.includes("merge-tree"));
  assert.ok(operations.includes("merge"));
  assert.ok(operations.includes("push"));
  assert.ok(operations.includes("worktree"));
  assert.ok(operations.includes("branch"));
  assert.ok(operations.indexOf("merge") < operations.indexOf("push"));
  assert.ok(operations.indexOf("push") < operations.indexOf("worktree"));
  assert.ok(operations.indexOf("worktree") < operations.indexOf("branch"));
  const materializeCall = calls.find(({ command, args }) => command.endsWith("/bin/qq-openwiki-materialize") && args[0] === "freeze");
  assert.deepEqual(materializeCall?.args, ["freeze", mainRoot]);
  assert.equal(materializeCall?.options.cwd, mainRoot);
  const materializeCallIndex = calls.indexOf(materializeCall);
  const mergeCallIndex = calls.findIndex(({ command, args }) => command === "git" && args[0] === "merge");
  assert.ok(materializeCallIndex < mergeCallIndex);
  const thawCallIndex = calls.findIndex(({ command, args }) => command.endsWith("/bin/qq-openwiki-materialize") && args[0] === "thaw");
  const worktreeRemoveIndex = calls.findIndex(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove");
  assert.ok(thawCallIndex >= 0 && thawCallIndex < worktreeRemoveIndex);
  const pushCall = calls.find(({ command, args }) => command === "git" && args[0] === "push");
  assert.deepEqual(pushCall.args, ["push", "origin", "HEAD:refs/heads/main"]);
  assert.equal(pushCall.options.cwd, mainRoot);
  assert.ok(calls.some(({ args }) => args[0] === "task" && args[1] === "edit" && args[2] === "TASK-1" && args.includes("Done")));
  const successfulPushIndex = calls.findIndex(({ command, args }) => command === "git" && args[0] === "push");
  const successfulCleanupIndex = calls.findIndex(({ command, args }) => command === "git" && args[0] === "branch");
  const successfulDoneIndex = calls.findIndex(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done"));
  assert.ok(successfulPushIndex < successfulCleanupIndex && successfulCleanupIndex < successfulDoneIndex);

  await runLib.atomicPrivateJson(statePath, prepared);
  const boardStatusesBeforeFailure = boardStatuses(calls);
  const doneCallsBeforeFailure = calls.filter(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done")).length;
  const failingLandRun = async (command, args, options = {}) => {
    if (command === "git" && args[0] === "merge-tree") return { code: 1, stdout: "", stderr: "content conflict" };
    return run(command, args, options);
  };
  await assert.rejects(review.landHandoff(failingLandRun, statePath), /proposal no longer merges cleanly: content conflict/);
  const failedLand = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(failedLand.status, "blocked");
  assert.equal(failedLand.blockedReason, "proposal no longer merges cleanly: content conflict");
  assert.equal(failedLand.ref, "refsha");
  assert.deepEqual(failedLand.qaVerdict, prepared.qaVerdict);
  assert.equal(review.isFailedLand(failedLand), true);
  assert.equal(review.isQaPassedProposal(failedLand), true);
  assert.deepEqual(boardStatuses(calls), boardStatusesBeforeFailure);
  assert.equal(calls.filter(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done")).length, doneCallsBeforeFailure);
  await review.landHandoff(run, statePath);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");

  await runLib.atomicPrivateJson(statePath, prepared);
  let mergedLocally = false;
  let pushAttempts = 0;
  const publishCalls = [];
  const pushRetryRun = async (command, args, options = {}) => {
    publishCalls.push({ command, args, options });
    if (command === "git" && args[0] === "merge-base" && args.at(-1) === "HEAD") return { code: mergedLocally ? 0 : 1, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "merge") {
      mergedLocally = true;
      return { code: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "push") {
      pushAttempts += 1;
      return pushAttempts === 1
        ? { code: 1, stdout: "", stderr: "remote rejected update" }
        : { code: 0, stdout: "", stderr: "" };
    }
    return run(command, args, options);
  };
  const boardStatusesBeforePushFailure = boardStatuses(calls);
  const doneCallsBeforePushFailure = calls.filter(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done")).length;
  await assert.rejects(review.landHandoff(pushRetryRun, statePath), /cannot push target branch to its upstream: remote rejected update/);
  const failedPush = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(failedPush.status, "blocked");
  assert.equal(failedPush.blockedReason, "cannot push target branch to its upstream: remote rejected update");
  assert.deepEqual(failedPush.qaVerdict, prepared.qaVerdict);
  assert.equal(review.isQaPassedProposal(failedPush), true);
  assert.equal(publishCalls.some(({ command, args }) => command === "git" && ["worktree", "branch"].includes(args[0])), false);
  assert.deepEqual(boardStatuses(calls), boardStatusesBeforePushFailure);
  assert.equal(calls.filter(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done")).length, doneCallsBeforePushFailure);

  const retryStart = publishCalls.length;
  await review.landHandoff(pushRetryRun, statePath);
  const retryCalls = publishCalls.slice(retryStart);
  const retryGitOperations = retryCalls.filter(({ command }) => command === "git").map(({ args }) => args[0]);
  assert.equal(retryGitOperations.includes("merge-tree"), false);
  assert.equal(retryGitOperations.includes("merge"), false);
  assert.equal(retryGitOperations.filter((operation) => operation === "push").length, 1);
  assert.ok(retryGitOperations.indexOf("push") < retryGitOperations.indexOf("worktree"));
  assert.ok(retryGitOperations.indexOf("worktree") < retryGitOperations.indexOf("branch"));
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");
  assert.equal(calls.filter(({ args }) => args[0] === "task" && args[1] === "edit" && args.includes("Done")).length, doneCallsBeforePushFailure + 1);

  await runLib.atomicPrivateJson(statePath, prepared);
  const boardStatusesBeforeNoUpstream = boardStatuses(calls);
  const noUpstreamCalls = [];
  const noUpstreamRun = async (command, args, options = {}) => {
    noUpstreamCalls.push({ command, args, options });
    if (command === "git" && args[0] === "for-each-ref") return { code: 0, stdout: "\0\n", stderr: "" };
    return run(command, args, options);
  };
  await assert.rejects(review.landHandoff(noUpstreamRun, statePath), /target branch main has no upstream/);
  const noUpstream = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(noUpstream.status, "blocked");
  assert.deepEqual(noUpstream.qaVerdict, prepared.qaVerdict);
  assert.deepEqual(boardStatuses(calls), boardStatusesBeforeNoUpstream);
  assert.equal(noUpstreamCalls.some(({ command, args }) => command === "git" && args[0] === "merge"), true);
  assert.equal(noUpstreamCalls.some(({ command, args }) => command === "git" && ["push", "worktree", "branch"].includes(args[0])), false);

  prepared.status = "running";
  prepared.look = 0;
  await runLib.atomicPrivateJson(statePath, prepared);
  const tools = [];
  const events = new Map();
  let launched;
  const pi = {
    registerTool(tool) { tools.push(tool); },
    events: { on(name, fn) { events.set(name, fn); } },
    on(name, fn) { events.set(name, fn); },
    exec: run,
  };
  let shutdowns = 0;
  extension.default(pi, { env: { QQ_AGENT_ROLE: "runner", QQ_RUN_STATE: statePath }, exec: run, launchReview(path) { launched = path; return 99; } });
  assert.equal(tools.some(({ name }) => name === "review"), false);
  const done = tools.find(({ name }) => name === "done");
  const outcome = await done.execute("d", { ref: "HEAD" }, undefined, undefined, { cwd: worktree, shutdown() { shutdowns += 1; }, abort() { throw new Error("done should shut down, not abort"); } });
  assert.equal(outcome.details.status, "reviewing");
  assert.equal(outcome.details.worker_pid, 99);
  assert.equal(launched, statePath);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(shutdowns, 1);

  const verdictTools = [];
  let written;
  qaResult.default({ registerTool(tool) { verdictTools.push(tool); } }, { env: { QQ_QA_RESULT: join(scratch, "verdict.json") }, async write(path, value) { written = { path, value }; } });
  const verdict = verdictTools[0];
  const verdictOutcome = await verdict.execute("q", { verdict: "pass", summary: "looks right", feedback: "", tests_modified: false });
  assert.equal(verdictOutcome.details.verdict, "pass");
  assert.equal(written.value.schema, "qq.qa-verdict/v1");
  const duplicate = await verdict.execute("q2", { verdict: "fail", summary: "again", feedback: "x", tests_modified: false });
  assert.equal(duplicate.details.status, "refused");

  const xdg = join(scratch, "xdg");
  const runsDir = join(xdg, "qq", "runs", "qq");
  const listEnv = { HOME: scratch, XDG_STATE_HOME: xdg, QQ_AGENT_PROJECT: "qq" };
  const proposalState = {
    ...prepared, status: "proposal", look: 1, ref: "refsha",
    pack: { summary: "small fix", files: [{ path: "src/a.ts", added: 2, deleted: 1 }] },
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
  const commentedPath = join(runsDir, "task-commented", "handoff.json");
  const laterPath = join(runsDir, "task-later", "handoff.json");
  await runLib.atomicPrivateJson(commentedPath, {
    ...proposalState, id: "task-commented", status: "commented", operatorComment: "old note",
    task: { id: "TASK-2", title: "Commented task" }, statePath: commentedPath, updatedAt: "2026-04-01T00:00:01.000Z",
  });
  await runLib.atomicPrivateJson(laterPath, {
    ...proposalState, id: "task-later", task: { id: "TASK-3", title: "Later task" }, statePath: laterPath,
  });
  const listedProposals = await review.listProposals("qq", listEnv);
  assert.deepEqual(listedProposals.map((item) => item.id), ["task-later"]);

  const boardCalls = [];
  const messages = [];
  const architectTools = [];
  const architectEvents = new Map();
  const quietEventClient = {
    next() { return new Promise(() => {}); },
    async acknowledge() {},
    async block() {},
  };
  const architectRun = async (command, args) => {
    if (args[0] === "task" && args[1] === "edit") boardCalls.push(args);
    return { code: 0, stdout: "", stderr: "" };
  };
  const architectPi = {
    registerTool(tool) { architectTools.push(tool); },
    events: { on(name, fn) { architectEvents.set(name, fn); } },
    on(name, fn) { architectEvents.set(name, fn); },
    exec: architectRun,
    sendMessage(payload, options) { messages.push({ payload, options }); },
  };
  extension.default(architectPi, { env: { ...listEnv, QQ_AGENT_ROLE: "architect" }, exec: architectRun, eventClient: quietEventClient });
  assert.equal(architectTools.some(({ name }) => name === "review"), false);
  const choices = [];
  const queued = ["later"];
  const ctx = {
    cwd: mainRoot,
    hasUI: true,
    isIdle: () => true,
    sessionManager: { getSessionId() { return base.architectSession; } },
    ui: {
      async select(pack, options) { choices.push({ pack, options }); return queued.shift() ?? "later"; },
      async input() { return "tighten the summary"; },
      notify() {},
    },
  };
  await architectEvents.get("session_start")({}, ctx);
  assert.deepEqual(choices.map((item) => item.options), [["approve", "discuss", "later"]]);
  assert.equal(choices[0].pack, "small fix\nsrc/a.ts +2/-1");
  assert.equal(JSON.parse(await readFile(laterPath, "utf8")).status, "later");
  await architectEvents.get("agent_settled")();
  assert.equal(choices.length, 1);

  const laterAgain = JSON.parse(await readFile(laterPath, "utf8"));
  laterAgain.status = "proposal";
  laterAgain.updatedAt = "2026-04-01T00:00:09.000Z";
  await runLib.atomicPrivateJson(laterPath, laterAgain);
  queued.push("discuss");
  await architectEvents.get("agent_settled")();
  assert.equal(choices.length, 2);
  const commented = JSON.parse(await readFile(laterPath, "utf8"));
  assert.equal(commented.status, "commented");
  assert.equal(commented.ref, "refsha");
  assert.equal(commented.operatorComment, "tighten the summary");
  assert.deepEqual(boardCalls, []);
  assert.equal(messages[0].payload.content, "TASK-3 discuss:\ntighten the summary\n\nsmall fix\nsrc/a.ts +2/-1");
  assert.deepEqual(messages[0].options, { triggerTurn: true, deliverAs: "steer" });
  await architectEvents.get("agent_settled")();
  assert.equal(choices.length, 2);

  const blockedPath = join(runsDir, "task-blocked", "handoff.json");
  await runLib.atomicPrivateJson(blockedPath, {
    ...proposalState, id: "task-blocked", status: "blocked", look: 2,
    qaVerdict: { schema: "qq.qa-verdict/v1", version: 1, verdict: "fail", summary: "still wrong", feedback: "fix failed", tests_modified: false },
    pack: { summary: "still wrong", files: [] }, blockedReason: "fix failed",
    task: { id: "TASK-4", title: "Blocked task" }, statePath: blockedPath, updatedAt: "2026-04-01T00:00:10.000Z",
  });
  await architectEvents.get("agent_settled")();
  assert.equal(choices.length, 2);
  assert.equal(review.isQaPassedProposal(JSON.parse(await readFile(blockedPath, "utf8"))), false);
  await assert.rejects(review.landHandoff(run, blockedPath), /not a qa-passed proposal ready to land/);
  await architectEvents.get("session_shutdown")();

  const successfulLandXdg = join(scratch, "successful-land-xdg");
  const successfulLandDir = join(successfulLandXdg, "qq", "runs", "qq", "task-successful-land");
  const successfulLandPath = join(successfulLandDir, "handoff.json");
  const successfulLandEnv = { HOME: scratch, XDG_STATE_HOME: successfulLandXdg, QQ_AGENT_PROJECT: "qq", QQ_AGENT_ROLE: "architect" };
  const successfulLandState = {
    ...proposalState, id: "task-successful-land", task: { id: "TASK-6", title: "Successful land" },
    statePath: successfulLandPath, updatedAt: "2026-04-01T00:00:04.000Z",
  };
  await runLib.atomicPrivateJson(successfulLandPath, successfulLandState);
  const successfulLandTools = [];
  const successfulLandEvents = new Map();
  const successfulLandMessages = [];
  const successfulLandNotifications = [];
  const successfulLandSessionPath = join(scratch, "successful-land-session.jsonl");
  const acknowledgedRunEvents = [];
  const runEventNextCalls = [];
  let releaseRunEvent;
  let architectBusy = false;
  const successfulLandEventClient = {
    next(body) {
      runEventNextCalls.push(body);
      if (runEventNextCalls.length > 1) return new Promise(() => {});
      return new Promise((resolve) => { releaseRunEvent = resolve; });
    },
    async acknowledge(guard) { acknowledgedRunEvents.push(guard); },
    async block() { throw new Error("a valid run outcome must not be blocked"); },
  };
  const successfulLandRun = async (command, args) => {
    if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: `${join(scratch, "git-common")}\n`, stderr: "" };
    if (command === "flock") {
      const landed = JSON.parse(await readFile(args.at(-1), "utf8"));
      landed.status = "landed";
      landed.landedAt = "2026-04-01T00:00:05.000Z";
      landed.updatedAt = landed.landedAt;
      await runLib.atomicPrivateJson(landed.statePath, landed);
      architectBusy = true;
      releaseRunEvent({ delivery: {
        record: {
          event_id: "evt_run_landed", product_id: "qq", kind: runEvents.RUN_LANDED_KIND,
          producer_id: "qq/land-worker", origin_id: "qq/land-worker",
          recipient_id: runEvents.runEventRecipient(landed.architectSession),
          envelope: { payload: runEvents.runEventPayload(landed, runEvents.RUN_LANDED_KIND) },
        },
        obligation: { obligation_id: "obl_run_landed", consumer_type: "recipient", consumer_id: runEvents.runEventRecipient(landed.architectSession), generation: 0 },
        attempt_token: "try_run_landed", endpoint_token: "endpoint_run_landed",
        guard: { expected_high_water: 0, expected_gap_token: "gap_run_landed" },
      } });
      return { code: 0, stdout: `Landed ${landed.task.id}.\n`, stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const successfulLandPi = {
    registerTool(tool) { successfulLandTools.push(tool); },
    events: { on(name, fn) { successfulLandEvents.set(name, fn); } },
    on(name, fn) { successfulLandEvents.set(name, fn); },
    exec: successfulLandRun,
    async sendMessage(payload, options) {
      successfulLandMessages.push({ payload, options });
      await writeFile(successfulLandSessionPath, `${JSON.stringify({ type: "custom_message", ...payload })}\n`);
    },
  };
  extension.default(successfulLandPi, {
    env: successfulLandEnv, exec: successfulLandRun, eventClient: successfulLandEventClient,
  });
  assert.equal(successfulLandTools.some(({ name }) => name === "review"), false);
  const successfulLandCtx = {
    ...ctx,
    isIdle: () => !architectBusy,
    sessionManager: {
      getSessionId() { return successfulLandState.architectSession; },
      getSessionFile() { return successfulLandSessionPath; },
    },
    ui: {
      async select() { return "approve"; },
      async input() { throw new Error("successful land should not request input"); },
      notify(message, level) { successfulLandNotifications.push({ message, level }); },
    },
  };
  await successfulLandEvents.get("session_start")({}, successfulLandCtx);
  await waitFor("persisted landed event acknowledgement", () => acknowledgedRunEvents.length === 1);
  assert.equal(JSON.parse(await readFile(successfulLandPath, "utf8")).status, "landed");
  assert.equal(runEventNextCalls[0].consumer_id, `qq/review-flow/${successfulLandState.architectSession}`);
  assert.equal(successfulLandMessages.length, 1);
  assert.equal(successfulLandMessages[0].payload.customType, "qq-run-landed");
  assert.equal(successfulLandMessages[0].payload.display, true);
  assert.equal(successfulLandMessages[0].payload.content, [
    "Landed TASK-6 — Successful land",
    "Ref: refsha",
    "Target: main",
    "At: 2026-04-01T00:00:05.000Z",
    "",
    "small fix",
    "src/a.ts +2/-1",
  ].join("\n"));
  assert.equal(successfulLandMessages[0].payload.details.schema, "qq.run-landed/v1");
  assert.equal(successfulLandMessages[0].payload.details.event_id, "evt_run_landed");
  assert.deepEqual(successfulLandMessages[0].options, { triggerTurn: true, deliverAs: "steer" });
  assert.equal(acknowledgedRunEvents.length, 1);
  assert.deepEqual(successfulLandNotifications, []);
  await successfulLandEvents.get("session_shutdown")();

  const blockedOutcome = {
    ...proposalState,
    status: "blocked", look: 2, updatedAt: "2026-04-01T00:00:06.000Z",
    blockedReason: "the final fix is still wrong",
    pack: { summary: "still wrong", files: [{ path: "src/a.ts", added: 2, deleted: 1 }] },
  };
  const blockedPayload = runEvents.runEventPayload(blockedOutcome, runEvents.RUN_BLOCKED_KIND);
  const blockedMessages = [];
  const blockedEvents = new Map();
  const blockedSessionPath = join(scratch, "blocked-event-session.jsonl");
  const blockedRetries = [];
  const blockedAcknowledgements = [];
  const blockedReleases = [];
  const blockedDelivery = {
    record: {
      event_id: "evt_run_blocked", product_id: "qq", kind: runEvents.RUN_BLOCKED_KIND,
      producer_id: "qq/review-worker", origin_id: "qq/review-worker",
      recipient_id: runEvents.runEventRecipient(base.architectSession), envelope: { payload: blockedPayload },
    },
    obligation: { obligation_id: "obl_run_blocked", consumer_type: "recipient", consumer_id: runEvents.runEventRecipient(base.architectSession), generation: 0 },
    attempt_token: "try_run_blocked", endpoint_token: "endpoint_run_blocked",
    guard: { expected_high_water: 0, expected_gap_token: "gap_run_blocked" },
  };
  let blockedNextCalls = 0;
  const blockedEventClient = {
    async next() {
      blockedNextCalls += 1;
      if (blockedNextCalls === 1) return { delivery: blockedDelivery };
      return new Promise((resolve) => { blockedReleases.push(resolve); });
    },
    async acknowledge(guard) { blockedAcknowledgements.push(guard); },
    async retry(guard) { blockedRetries.push(guard); },
    async block() { throw new Error("a valid blocked outcome must not be blocked"); },
  };
  const blockedPi = {
    registerTool() {},
    events: { on(name, fn) { blockedEvents.set(name, fn); } },
    on(name, fn) { blockedEvents.set(name, fn); },
    sendMessage(payload, options) { blockedMessages.push({ payload, options }); },
  };
  const blockedEventEnv = { ...listEnv, XDG_STATE_HOME: join(scratch, "blocked-event-xdg"), QQ_AGENT_ROLE: "architect" };
  extension.default(blockedPi, { env: blockedEventEnv, exec: architectRun, eventClient: blockedEventClient });
  const blockedCtx = {
    ...ctx,
    sessionManager: {
      getSessionId() { return base.architectSession; },
      getSessionFile() { return blockedSessionPath; },
    },
  };
  await blockedEvents.get("session_start")({}, blockedCtx);
  await waitFor("initial blocked event retry", () => blockedRetries.length === 1);
  assert.equal(blockedMessages.length, 1);
  assert.equal(blockedMessages[0].payload.customType, "qq-run-blocked");
  assert.equal(blockedMessages[0].payload.details.schema, "qq.run-blocked/v1");
  assert.match(blockedMessages[0].payload.content, /QA blocked TASK-1 after look 2/);
  assert.deepEqual(blockedMessages[0].options, { triggerTurn: true });
  assert.equal(blockedAcknowledgements.length, 0, "run event must not be acknowledged before Pi persists it");
  assert.equal(blockedRetries.length, 1);

  blockedReleases.shift()({ delivery: blockedDelivery });
  await waitFor("redelivered blocked event retry", () => blockedRetries.length === 2);
  assert.equal(blockedMessages.length, 1, "redelivery while persistence is pending must not trigger another turn");
  assert.equal(blockedAcknowledgements.length, 0);
  assert.equal(blockedRetries.length, 2);

  await writeFile(blockedSessionPath, `${JSON.stringify({
    type: "custom_message", customType: "qq-run-blocked", details: { event_id: "evt_run_blocked" },
  })}\n`);
  blockedReleases.shift()({ delivery: blockedDelivery });
  await waitFor("persisted blocked event acknowledgement", () => blockedAcknowledgements.length === 1);
  assert.equal(blockedMessages.length, 1);
  assert.equal(blockedAcknowledgements.length, 1, "persisted run event should be acknowledged on redelivery");
  await blockedEvents.get("session_shutdown")();

  const failedLandXdg = join(scratch, "failed-land-xdg");
  const failedLandDir = join(failedLandXdg, "qq", "runs", "qq", "task-failed-land");
  const failedLandPath = join(failedLandDir, "handoff.json");
  const failedLandEnv = { HOME: scratch, XDG_STATE_HOME: failedLandXdg, QQ_AGENT_PROJECT: "qq", QQ_AGENT_ROLE: "architect" };
  await runLib.atomicPrivateJson(failedLandPath, {
    ...proposalState, id: "task-failed-land", task: { id: "TASK-6", title: "Failed land" },
    statePath: failedLandPath, updatedAt: "2026-04-01T00:00:04.000Z",
  });
  const failedLandTools = [];
  const failedLandEvents = new Map();
  let landError = "merge failed: checkout busy";
  let landAttempt = 0;
  const failedLandRun = async (command, args) => {
    if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: `${join(scratch, "git-common")}\n`, stderr: "" };
    if (command === "flock") {
      const current = JSON.parse(await readFile(args.at(-1), "utf8"));
      current.status = "blocked";
      current.blockedReason = landError;
      current.updatedAt = `2026-04-01T00:00:${String(5 + landAttempt++).padStart(2, "0")}.000Z`;
      await runLib.atomicPrivateJson(current.statePath, current);
      return { code: 1, stdout: "", stderr: landError };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const failedLandPi = {
    registerTool(tool) { failedLandTools.push(tool); },
    events: { on(name, fn) { failedLandEvents.set(name, fn); } },
    on(name, fn) { failedLandEvents.set(name, fn); },
    exec: failedLandRun,
    sendMessage() {},
  };
  extension.default(failedLandPi, { env: failedLandEnv, exec: failedLandRun, eventClient: quietEventClient });
  assert.equal(failedLandTools.some(({ name }) => name === "review"), false);
  const failedLandChoices = [];
  const failedLandQueued = ["approve"];
  const failedLandCtx = {
    ...ctx,
    ui: {
      async select(pack, options) {
        failedLandChoices.push({ pack, options });
        return failedLandQueued.shift() ?? "later";
      },
      async input() { return "leave this blocked"; },
      notify() {},
    },
  };
  await failedLandEvents.get("session_start")({}, failedLandCtx);
  assert.equal(failedLandChoices.length, 1);
  const firstFailedLand = JSON.parse(await readFile(failedLandPath, "utf8"));
  assert.equal(firstFailedLand.status, "blocked");
  assert.equal(firstFailedLand.blockedReason, "merge failed: checkout busy");
  assert.deepEqual(failedLandChoices[0].options, ["approve", "discuss", "later"]);
  await failedLandEvents.get("agent_settled")();
  assert.equal(failedLandChoices.length, 2);
  assert.deepEqual(failedLandChoices[1].options, ["approve", "discuss", "later"]);
  assert.equal(JSON.parse(await readFile(failedLandPath, "utf8")).status, "later");
  await failedLandEvents.get("agent_settled")();
  assert.equal(failedLandChoices.length, 2);
  await failedLandEvents.get("session_shutdown")();

  assert.equal(review.isTestPath("tests/test-review-flow.mjs"), true);
  assert.equal(review.isTestPath("src/widget.test.ts"), true);
  assert.equal(review.isTestPath("src/__snapshots__/widget.snap"), true);
  assert.equal(review.isTestPath("src/widget.ts"), false);

  const runQaCase = async ({
    look = 1, ref = "refsha", qaSessionId, head = ref, dirty = "", changedPaths = [], descendant = true,
    verdict = "pass", summary = "looks right", feedback = "", testsModified = false,
  } = {}) => {
    const caseState = {
      ...prepared, status: "reviewing", look, ref, qaSessionId, pane: "w2T:p9",
    };
    await runLib.atomicPrivateJson(statePath, caseState);
    const verdictPath = join(scratch, "state", `qa-look-${look}.json`);
    const caseCalls = [];
    const emittedRunEvents = [];
    let agentEvicted = false;
    let releaseGets = 0;
    let qaPromptAtLaunch;
    const caseRun = async (command, args, options = {}) => {
      caseCalls.push({ command, args, options });
      if (command === "git" && args[0] === "status") return { code: 0, stdout: dirty, stderr: "" };
      if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: `${head}\n`, stderr: "" };
      if (command === "git" && args[0] === "merge-base") return { code: descendant ? 0 : 1, stdout: "", stderr: "" };
      if (command === "git" && args[0] === "diff" && args.includes("--name-only")) {
        return { code: 0, stdout: changedPaths.length ? `${changedPaths.join("\0")}\0` : "", stderr: "" };
      }
      if (command === "git" && args[0] === "diff") {
        const paths = changedPaths.length ? changedPaths : ["src/a.ts"];
        return { code: 0, stdout: paths.map((path) => `2\t1\t${path}`).join("\n") + "\n", stderr: "" };
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "start") {
        agentEvicted = false;
        releaseGets = 0;
        if (args.includes("--system-prompt")) {
          const promptPath = args[args.indexOf("--system-prompt") + 1];
          qaPromptAtLaunch = {
            path: promptPath,
            content: await readFile(promptPath, "utf8"),
            mode: (await stat(promptPath)).mode & 0o777,
          };
        }
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "prompt" && String(args[3]).startsWith(`Look ${look}`)) {
        await runLib.atomicPrivateJson(verdictPath, {
          schema: "qq.qa-verdict/v1", version: 1, verdict, summary, feedback, tests_modified: testsModified,
        });
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "send-keys") {
        agentEvicted = true;
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
        if (!agentEvicted || releaseGets++ === 0) {
          const agent_status = agentEvicted ? "done" : "idle";
          return { code: 0, stdout: JSON.stringify({ id: "cli:agent:get", result: { type: "agent_info", agent: { agent_status } } }), stderr: "" };
        }
        return { code: 1, stdout: "", stderr: JSON.stringify({ id: "cli:agent:get", error: { code: "agent_not_found", message: "agent target not found" } }) };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "process-info") {
        return { code: 0, stdout: availableShell, stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    const state = await review.conductReview(caseRun, statePath, {
      env: listEnv,
      async emitRunEvent(outcome, kind) { emittedRunEvents.push({ outcome: structuredClone(outcome), kind }); },
    });
    return { state, calls: caseCalls, qaPromptAtLaunch, emittedRunEvents };
  };

  const committedTests = await runQaCase({
    head: "qa-tests-ref", changedPaths: ["tests/test-review-flow.mjs"], testsModified: true,
  });
  assert.equal(committedTests.state.status, "proposal");
  assert.equal(committedTests.state.ref, "qa-tests-ref");
  assert.deepEqual(boardStatuses(committedTests.calls), []);
  assert.equal(committedTests.state.qaVerdict.tests_modified, true);
  assert.deepEqual(committedTests.state.pack.files, [{ path: "tests/test-review-flow.mjs", added: 2, deleted: 1 }]);
  const qaStart = committedTests.calls.find(({ args }) => args[0] === "agent" && args[1] === "start");
  const qaTaskPrompt = committedTests.calls.find(({ args }) => args[0] === "agent" && args[1] === "prompt");
  assert.match(qaTaskPrompt.args[3], /outbound ticket and note/);
  assert.match(qaTaskPrompt.args[3], new RegExp(base.gatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(committedTests.qaPromptAtLaunch.path, join(scratch, "state", "qa-system-prompt-1.md"));
  assert.equal(committedTests.qaPromptAtLaunch.mode, 0o600);
  assert.match(committedTests.qaPromptAtLaunch.content, /own the tests and may commit test-only changes/);
  assert.match(committedTests.qaPromptAtLaunch.content, /Never edit or commit production code/);
  assert.match(committedTests.qaPromptAtLaunch.content, /Don't invent importance/);
  assert.ok(!qaStart.args.some((arg) => String(arg).includes("Don't invent importance")));
  assert.ok(!qaStart.args.some((arg) => String(arg).includes("\n")));
  await assert.rejects(access(committedTests.qaPromptAtLaunch.path), { code: "ENOENT" });
  const runnerStop = committedTests.calls.findIndex(({ args }) => args[0] === "agent" && args[1] === "send-keys");
  const firstShellCheck = committedTests.calls.findIndex(({ args }) => args[0] === "pane" && args[1] === "process-info");
  const runnerReleaseGets = committedTests.calls
    .map(({ args }, index) => ({ args, index }))
    .filter(({ args, index }) => index > runnerStop && index < firstShellCheck && args[0] === "agent" && args[1] === "get");
  const qaStartIndex = committedTests.calls.findIndex(({ args }) => args[0] === "agent" && args[1] === "start");
  assert.equal(runnerReleaseGets.length, 2);
  assert.ok(runnerStop >= 0 && runnerReleaseGets.at(-1).index < firstShellCheck && firstShellCheck < qaStartIndex);
  assert.ok(!committedTests.calls.some(({ args }) => args[0] === "pane" && args[1] === "wait-output"));
  const firstLookPrompt = committedTests.calls.find(({ args }) => args[0] === "agent" && args[1] === "prompt");
  assert.match(firstLookPrompt.args[3], /own test quality/);
  assert.match(firstLookPrompt.args[3], /commit test-only changes/);

  const dirtyPass = await runQaCase({ dirty: " M tests/test-review-flow.mjs\n", testsModified: true });
  assert.equal(dirtyPass.state.status, "waiting_fix");
  assert.equal(dirtyPass.state.qaVerdict.verdict, "fail");
  assert.deepEqual(boardStatuses(dirtyPass.calls), []);
  assert.match(dirtyPass.state.qaVerdict.feedback, /uncommitted worktree changes/);

  const productionCommit = await runQaCase({ head: "qa-production-ref", changedPaths: ["src/a.ts"] });
  assert.equal(productionCommit.state.status, "waiting_fix");
  assert.equal(productionCommit.state.ref, "refsha");
  assert.equal(productionCommit.state.qaVerdict.verdict, "fail");
  assert.match(productionCommit.state.qaVerdict.feedback, /committed production-code changes: src\/a\.ts/);

  const failedRewrite = await runQaCase({
    head: "qa-feedback-tests", changedPaths: ["tests/a.test.ts"], verdict: "fail",
    summary: "needs one fix", feedback: "tighten production code", testsModified: true,
  });
  assert.equal(failedRewrite.state.status, "waiting_fix");
  assert.equal(failedRewrite.state.ref, "refsha");
  assert.deepEqual(boardStatuses(failedRewrite.calls), []);
  assert.equal(failedRewrite.state.qaVerdict.tests_modified, true);
  const returned = failedRewrite.calls.find(({ args }) => args[0] === "agent" && args[1] === "prompt" && String(args[3]).includes("call done again"));
  assert.match(returned.args[3], /qa rewrote tests; inspect those changes/);
  const started = failedRewrite.calls.filter(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "start");
  assert.equal(started.length, 2);
  assert.equal(started[0].args[2], review.qaAgentName(failedRewrite.state));
  assert.equal(started[0].args[4], "pi");
  assert.equal(started[0].args[6], "w2T:p9");
  assert.ok(!started[0].args.includes("--print"));
  assert.ok(!failedRewrite.calls.some(({ command, args }) => command === "pi" || args.includes("--print")));
  assert.equal(started[1].args[2], review.runnerAgentName(failedRewrite.state));
  assert.equal(started[1].args[6], "w2T:p9");
  const qaStartAt = failedRewrite.calls.findIndex(({ args }) => args[0] === "agent" && args[1] === "start" && args[2] === review.qaAgentName(failedRewrite.state));
  const runnerStartAt = failedRewrite.calls.findIndex(({ args }) => args[0] === "agent" && args[1] === "start" && args[2] === review.runnerAgentName(failedRewrite.state));
  const evictDoneQa = failedRewrite.calls.findIndex(({ args }, index) => index > qaStartAt && args[0] === "agent" && args[1] === "send-keys");
  assert.ok(evictDoneQa > qaStartAt && evictDoneQa < runnerStartAt);
  assert.ok(!failedRewrite.calls.some(({ args }) => args[0] === "pane" && args[1] === "close"));
  assert.ok(!failedRewrite.calls.some(({ args }) => args[0] === "tab" && args[1] === "create"));

  const cleanLook2 = await runQaCase({ look: 2, qaSessionId: failedRewrite.state.qaSessionId });
  assert.equal(cleanLook2.state.status, "proposal");
  assert.equal(cleanLook2.state.look, 2);
  assert.deepEqual(boardStatuses(cleanLook2.calls), []);
  assert.equal(cleanLook2.state.qaSessionId, failedRewrite.state.qaSessionId);
  const passStarts = cleanLook2.calls.filter(({ args }) => args[0] === "agent" && args[1] === "start");
  assert.equal(passStarts.length, 1);
  assert.equal(passStarts[0].args[2], review.qaAgentName(cleanLook2.state));
  assert.equal(passStarts[0].args[6], "w2T:p9");
  assert.ok(passStarts[0].args.includes("--session"));
  assert.ok(!passStarts[0].args.includes("--print"));
  assert.ok(cleanLook2.calls.some(({ args }) => args[0] === "pane" && args[1] === "close" && args[2] === "w2T:p9"));
  assert.ok(!cleanLook2.calls.some(({ args }) => args[0] === "tab" && args[1] === "create"));
  const secondLookPrompt = cleanLook2.calls.find(({ args }) => args[0] === "agent" && args[1] === "prompt");
  assert.match(secondLookPrompt.args[3], /still own test quality/);
  assert.match(secondLookPrompt.args[3], /There is no third look/);

  const committedLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, head: "qa-look2-tests",
    changedPaths: ["tests/a.test.ts"], testsModified: true,
  });
  assert.equal(committedLook2.state.status, "proposal");
  assert.equal(committedLook2.state.ref, "qa-look2-tests");
  assert.equal(committedLook2.state.qaVerdict.verdict, "pass");
  assert.equal(committedLook2.state.qaVerdict.tests_modified, true);
  assert.ok(!committedLook2.calls.some(({ args }) => args[0] === "agent" && args[1] === "start" && args[2] === review.runnerAgentName(committedLook2.state)));

  const dirtyLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, dirty: " M tests/a.test.ts\n", testsModified: true,
  });
  assert.equal(dirtyLook2.state.status, "blocked");
  assert.equal(dirtyLook2.state.qaVerdict.verdict, "fail");
  assert.deepEqual(boardStatuses(dirtyLook2.calls), ["To Do"]);
  assert.match(dirtyLook2.state.qaVerdict.feedback, /uncommitted worktree changes/);
  assert.deepEqual(dirtyLook2.emittedRunEvents.map(({ kind }) => kind), [runEvents.RUN_BLOCKED_KIND]);
  const dirtyLook2Prompts = dirtyLook2.calls.filter(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "prompt");
  assert.equal(dirtyLook2Prompts.length, 1);
  assert.equal(dirtyLook2Prompts[0].args[2], "w2T:p9");

  const productionLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, head: "qa-look2-production",
    changedPaths: ["src/a.ts"], testsModified: false,
  });
  assert.equal(productionLook2.state.status, "blocked");
  assert.equal(productionLook2.state.ref, "refsha");
  assert.deepEqual(boardStatuses(productionLook2.calls), ["To Do"]);
  assert.equal(productionLook2.state.qaVerdict.verdict, "fail");
  assert.match(productionLook2.state.qaVerdict.feedback, /committed production-code changes: src\/a\.ts/);
  assert.ok(!productionLook2.calls.some(({ args }) => args[0] === "agent" && args[1] === "start" && args[2] === review.runnerAgentName(productionLook2.state)));

  const rewrittenLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, head: "rewritten-look2",
    changedPaths: ["tests/a.test.ts"], descendant: false,
  });
  assert.equal(rewrittenLook2.state.status, "blocked");
  assert.equal(rewrittenLook2.state.ref, "refsha");
  assert.deepEqual(boardStatuses(rewrittenLook2.calls), ["To Do"]);
  assert.equal(rewrittenLook2.state.qaVerdict.verdict, "fail");
  assert.match(rewrittenLook2.state.qaVerdict.feedback, /replaced or rewrote the reviewed commit/);

  const sentRunEvents = [];
  const captureRunEventClient = { async send(envelope) { sentRunEvents.push(envelope); return { record: { event_id: "evt_capture" } }; } };
  const landedForEvent = { ...successfulLandState, status: "landed", landedAt: "2026-04-01T00:00:05.000Z" };
  await runEvents.sendRunEvent(landedForEvent, runEvents.RUN_LANDED_KIND, { client: captureRunEventClient, env: successfulLandEnv });
  await runEvents.sendRunEvent(dirtyLook2.state, runEvents.RUN_BLOCKED_KIND, { client: captureRunEventClient, env: listEnv });
  assert.equal(sentRunEvents[0].producer_id, "qq/land-worker");
  assert.equal(sentRunEvents[1].producer_id, "qq/review-worker");
  assert.ok(sentRunEvents.every(({ product_id }) => product_id === "qq"));
  assert.ok(sentRunEvents.every(({ recipient_id }) => recipient_id === `qq/review-flow/${base.architectSession}`));
  assert.ok(sentRunEvents.every(({ kind }) => kind !== "agent.message"));
  assert.ok(sentRunEvents.every(({ payload }) => payload.schema !== "qq.agent-message/v2"));

  prepared.status = "commented";
  prepared.ref = "refsha";
  await runLib.atomicPrivateJson(statePath, prepared);
  await review.landHandoff(run, statePath);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");
  assert.ok(calls.some(({ args }) => args[0] === "task" && args[1] === "edit" && args[2] === "TASK-1" && args.includes("Done")));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-review-flow: pass");
