import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const review = await import(pathToFileURL(join(root, "bin/lib/review.mjs")));
const workshop = await import(pathToFileURL(join(root, "bin/lib/workshop.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/review-flow.ts")));
const qaResult = await import(pathToFileURL(join(root, "extensions/qa-result.ts")));

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
    schema: "qq.workshop-handoff/v1", version: 1, id: "task-1-x", project: "qq",
    task: { id: "TASK-1", title: "One task" }, status: "running", look: 0,
    mainRoot, baseBranch: "main", baseRef: "base", branch: "qq/task-1-x", worktree,
    pane: "w2T:p9", architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    ticketPath: join(scratch, "ticket.md"), transcriptPath: join(scratch, "transcript.md"),
    notePath: join(scratch, "note.md"), gatePath: join(scratch, "gate.md"), statePath,
    qa: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  };
  await workshop.atomicPrivateJson(statePath, base);
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: "refsha\n", stderr: "" };
    if (command === "git" && args[0] === "status") return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "git" && args[0] === "diff") return { code: 0, stdout: "2\t1\tsrc/a.ts\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const prepared = await review.prepareDone(run, worktree, statePath, "HEAD");
  assert.equal(prepared.look, 1);
  assert.equal(prepared.status, "reviewing");
  assert.equal(prepared.ref, "refsha");
  assert.ok(calls.some(({ args }) => args[0] === "merge-base"));

  prepared.status = "proposal";
  prepared.pack = { summary: "small fix", files: [{ path: "src/a.ts", added: 2, deleted: 1 }] };
  await workshop.atomicPrivateJson(statePath, prepared);
  await review.landHandoff(run, statePath);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");
  const operations = calls.filter(({ command }) => command === "git").map(({ args }) => args[0]);
  assert.ok(operations.includes("merge-tree"));
  assert.ok(operations.includes("merge"));
  assert.ok(operations.includes("worktree"));
  assert.ok(operations.includes("branch"));
  assert.ok(calls.some(({ args }) => args[0] === "task" && args[1] === "edit" && args[2] === "TASK-1" && args.includes("Done")));

  prepared.status = "running";
  prepared.look = 0;
  await workshop.atomicPrivateJson(statePath, prepared);
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
  extension.default(pi, { env: { QQ_AGENT_ROLE: "runner", QQ_WORKSHOP_STATE: statePath }, exec: run, launchReview(path) { launched = path; return 99; } });
  const runnerReviewTool = tools.find(({ name }) => name === "review");
  assert.match(`${runnerReviewTool.promptSnippet} ${runnerReviewTool.description}`, /runs/);
  assert.doesNotMatch(`${runnerReviewTool.promptSnippet} ${runnerReviewTool.description}`, /workshop/i);
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
  const workshopDir = join(xdg, "qq", "workshops", "qq");
  const listEnv = { HOME: scratch, XDG_STATE_HOME: xdg, QQ_AGENT_PROJECT: "qq" };
  const proposalState = {
    ...prepared, status: "proposal", look: 1, ref: "refsha",
    pack: { summary: "small fix", files: [{ path: "src/a.ts", added: 2, deleted: 1 }] },
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
  const commentedPath = join(workshopDir, "task-commented", "handoff.json");
  const laterPath = join(workshopDir, "task-later", "handoff.json");
  await workshop.atomicPrivateJson(commentedPath, {
    ...proposalState, id: "task-commented", status: "commented", operatorComment: "old note",
    task: { id: "TASK-2", title: "Commented task" }, statePath: commentedPath, updatedAt: "2026-04-01T00:00:01.000Z",
  });
  await workshop.atomicPrivateJson(laterPath, {
    ...proposalState, id: "task-later", task: { id: "TASK-3", title: "Later task" }, statePath: laterPath,
  });
  const listedProposals = await review.listProposals("qq", listEnv);
  const listedReviews = await review.listReviews("qq", listEnv);
  assert.deepEqual(listedProposals.map((item) => item.id), ["task-later"]);
  assert.deepEqual(listedReviews.map((item) => item.id), ["task-later", "task-commented"]);

  const boardCalls = [];
  const messages = [];
  const architectTools = [];
  const architectEvents = new Map();
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
  extension.default(architectPi, { env: { ...listEnv, QQ_AGENT_ROLE: "architect" }, exec: architectRun });
  const reviewTool = architectTools.find(({ name }) => name === "review");
  const choices = [];
  const queued = ["later"];
  const ctx = {
    cwd: mainRoot,
    hasUI: true,
    isIdle: () => true,
    ui: {
      async select(pack, options) { choices.push({ pack, options }); return queued.shift() ?? "later"; },
      async input() { return "tighten the summary"; },
      notify() {},
    },
  };
  await architectEvents.get("session_start")({}, ctx);
  assert.deepEqual(choices.map((item) => item.options), [["approve", "discuss", "later"]]);
  assert.equal(choices[0].pack, "small fix\nsrc/a.ts +2/-1");

  queued.push("discuss", "later");
  const laterAgain = await reviewTool.execute("r", {}, undefined, undefined, ctx);
  assert.equal(laterAgain.details.status, "offered");
  assert.equal(laterAgain.details.count, 2);
  assert.equal(choices.length, 3);
  assert.ok(choices.some((item) => item.pack === "small fix\nsrc/a.ts +2/-1" && item.options.includes("approve")));
  const commented = JSON.parse(await readFile(laterPath, "utf8"));
  assert.equal(commented.status, "commented");
  assert.equal(commented.ref, "refsha");
  assert.equal(commented.operatorComment, "tighten the summary");
  assert.deepEqual(boardCalls.at(-1).slice(0, 5), ["task", "edit", "TASK-3", "--status", "To Do"]);
  assert.equal(messages[0].payload.content, "TASK-3 discuss:\ntighten the summary\n\nsmall fix\nsrc/a.ts +2/-1");
  assert.deepEqual(messages[0].options, { triggerTurn: true, deliverAs: "steer" });
  assert.deepEqual((await review.listProposals("qq", listEnv)).map((item) => item.id), []);
  assert.deepEqual((await review.listReviews("qq", listEnv)).map((item) => item.id).sort(), ["task-commented", "task-later"]);

  const afterComment = [];
  await reviewTool.execute("r2", {}, undefined, undefined, {
    ...ctx,
    ui: { ...ctx.ui, async select(pack, options) { afterComment.push({ pack, options }); return "later"; } },
  });
  assert.equal(afterComment.length, 2);
  assert.ok(afterComment.every((item) => item.options.includes("approve")));
  await architectEvents.get("session_shutdown")();

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
    await workshop.atomicPrivateJson(statePath, caseState);
    const verdictPath = join(scratch, "state", `qa-look-${look}.json`);
    const caseCalls = [];
    let agentGets = 0;
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
      if (command === "herdr" && args[0] === "agent" && args[1] === "start" && args.includes("--system-prompt")) {
        const promptPath = args[args.indexOf("--system-prompt") + 1];
        qaPromptAtLaunch = {
          path: promptPath,
          content: await readFile(promptPath, "utf8"),
          mode: (await stat(promptPath)).mode & 0o777,
        };
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "prompt" && String(args[3]).startsWith(`Look ${look}`)) {
        await workshop.atomicPrivateJson(verdictPath, {
          schema: "qq.qa-verdict/v1", version: 1, verdict, summary, feedback, tests_modified: testsModified,
        });
      }
      if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
        const agent_status = agentGets++ === 0 ? "idle" : "done";
        return { code: 0, stdout: JSON.stringify({ id: "cli:agent:get", result: { type: "agent_info", agent: { agent_status } } }), stderr: "" };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "process-info") {
        return { code: 0, stdout: availableShell, stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    const state = await review.conductReview(caseRun, statePath, { env: listEnv });
    return { state, calls: caseCalls, qaPromptAtLaunch };
  };

  const committedTests = await runQaCase({
    head: "qa-tests-ref", changedPaths: ["tests/test-review-flow.mjs"], testsModified: true,
  });
  assert.equal(committedTests.state.status, "proposal");
  assert.equal(committedTests.state.ref, "qa-tests-ref");
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
  const qaStartIndex = committedTests.calls.findIndex(({ args }) => args[0] === "agent" && args[1] === "start");
  assert.ok(runnerStop >= 0 && runnerStop < firstShellCheck && firstShellCheck < qaStartIndex);
  assert.ok(!committedTests.calls.some(({ args }) => args[0] === "pane" && args[1] === "wait-output"));
  const firstLookPrompt = committedTests.calls.find(({ args }) => args[0] === "agent" && args[1] === "prompt");
  assert.match(firstLookPrompt.args[3], /own test quality/);
  assert.match(firstLookPrompt.args[3], /commit test-only changes/);

  const dirtyPass = await runQaCase({ dirty: " M tests/test-review-flow.mjs\n", testsModified: true });
  assert.equal(dirtyPass.state.status, "waiting_fix");
  assert.equal(dirtyPass.state.qaVerdict.verdict, "fail");
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
  assert.match(dirtyLook2.state.qaVerdict.feedback, /uncommitted worktree changes/);

  const productionLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, head: "qa-look2-production",
    changedPaths: ["src/a.ts"], testsModified: false,
  });
  assert.equal(productionLook2.state.status, "blocked");
  assert.equal(productionLook2.state.ref, "refsha");
  assert.equal(productionLook2.state.qaVerdict.verdict, "fail");
  assert.match(productionLook2.state.qaVerdict.feedback, /committed production-code changes: src\/a\.ts/);
  assert.ok(!productionLook2.calls.some(({ args }) => args[0] === "agent" && args[1] === "start" && args[2] === review.runnerAgentName(productionLook2.state)));

  const rewrittenLook2 = await runQaCase({
    look: 2, qaSessionId: failedRewrite.state.qaSessionId, head: "rewritten-look2",
    changedPaths: ["tests/a.test.ts"], descendant: false,
  });
  assert.equal(rewrittenLook2.state.status, "blocked");
  assert.equal(rewrittenLook2.state.ref, "refsha");
  assert.equal(rewrittenLook2.state.qaVerdict.verdict, "fail");
  assert.match(rewrittenLook2.state.qaVerdict.feedback, /replaced or rewrote the reviewed commit/);

  prepared.status = "commented";
  prepared.ref = "refsha";
  await workshop.atomicPrivateJson(statePath, prepared);
  await review.landHandoff(run, statePath);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).status, "landed");
  assert.ok(calls.some(({ args }) => args[0] === "task" && args[1] === "edit" && args[2] === "TASK-1" && args.includes("Done")));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-review-flow: pass");
