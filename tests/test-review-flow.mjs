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
    briefPath: join(scratch, "brief.md"), statePath,
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

  prepared.status = "reviewing";
  prepared.look = 1;
  prepared.ref = "refsha";
  prepared.qaSessionId = undefined;
  prepared.pane = "w2T:p9";
  await workshop.atomicPrivateJson(statePath, prepared);
  const failLook = join(scratch, "state", "qa-look-1.json");
  const herdrCalls = [];
  let qaPromptAtLaunch;
  const reviewRun = async (command, args, options = {}) => {
    herdrCalls.push({ command, args, options });
    if (command === "herdr" && args[0] === "agent" && args[1] === "start" && args.includes("--system-prompt")) {
      const promptPath = args[args.indexOf("--system-prompt") + 1];
      qaPromptAtLaunch = {
        path: promptPath,
        content: await readFile(promptPath, "utf8"),
        mode: (await stat(promptPath)).mode & 0o777,
      };
    }
    if (command === "git" && args[0] === "status") return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "diff") return { code: 0, stdout: "2\t1\tsrc/a.ts\n", stderr: "" };
    if (command === "herdr" && args[0] === "agent" && args[1] === "prompt" && args[2] === "w2T:p9") {
      await workshop.atomicPrivateJson(failLook, {
        schema: "qq.qa-verdict/v1", version: 1, verdict: "fail", summary: "needs one fix",
        feedback: "tighten tests", tests_modified: false,
      });
    }
    if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
      return { code: 0, stdout: JSON.stringify({ result: { agent_status: "done" } }), stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const afterFail = await review.conductReview(reviewRun, statePath, { env: listEnv });
  assert.equal(afterFail.status, "waiting_fix");
  assert.equal(afterFail.look, 1);
  assert.ok(afterFail.qaSessionId);
  const started = herdrCalls.filter(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "start");
  assert.equal(started.length, 2);
  assert.equal(started[0].args[2], review.qaAgentName(afterFail));
  assert.equal(started[0].args[4], "pi");
  assert.equal(started[0].args[6], "w2T:p9");
  assert.equal(qaPromptAtLaunch.path, join(scratch, "state", "qa-system-prompt-1.md"));
  assert.equal(qaPromptAtLaunch.mode, 0o600);
  assert.match(qaPromptAtLaunch.content, /Don't invent importance/);
  assert.match(qaPromptAtLaunch.content, /End by calling qa_verdict exactly once/);
  assert.ok(!started[0].args.some((arg) => String(arg).includes("Don't invent importance")));
  assert.ok(!started[0].args.some((arg) => String(arg).includes("\n")));
  await assert.rejects(access(qaPromptAtLaunch.path), { code: "ENOENT" });
  assert.ok(!started[0].args.includes("--print"));
  assert.ok(!herdrCalls.some(({ command, args }) => command === "pi" || args.includes("--print")));
  assert.equal(started[1].args[2], review.runnerAgentName(afterFail));
  assert.equal(started[1].args[6], "w2T:p9");
  assert.ok(!herdrCalls.some(({ args }) => args[0] === "pane" && args[1] === "close"));
  assert.ok(!herdrCalls.some(({ args }) => args[0] === "tab" && args[1] === "create"));
  const returned = herdrCalls.find(({ args }) => args[0] === "agent" && args[1] === "prompt" && args[2] === "w2T:p9" && String(args[3]).includes("call done again"));
  assert.ok(returned);

  prepared.status = "reviewing";
  prepared.look = 2;
  prepared.qaSessionId = afterFail.qaSessionId;
  await workshop.atomicPrivateJson(statePath, prepared);
  const passLook = join(scratch, "state", "qa-look-2.json");
  const passCalls = [];
  const passRun = async (command, args, options = {}) => {
    passCalls.push({ command, args, options });
    if (command === "git" && args[0] === "status") return { code: 0, stdout: "", stderr: "" };
    if (command === "git" && args[0] === "diff") return { code: 0, stdout: "2\t1\tsrc/a.ts\n", stderr: "" };
    if (command === "herdr" && args[0] === "agent" && args[1] === "prompt" && args[2] === "w2T:p9") {
      await workshop.atomicPrivateJson(passLook, {
        schema: "qq.qa-verdict/v1", version: 1, verdict: "pass", summary: "looks right",
        feedback: "", tests_modified: false,
      });
    }
    if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
      return { code: 0, stdout: JSON.stringify({ result: { agent_status: "done" } }), stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const afterPass = await review.conductReview(passRun, statePath, { env: listEnv });
  assert.equal(afterPass.status, "proposal");
  assert.equal(afterPass.look, 2);
  assert.equal(afterPass.qaSessionId, afterFail.qaSessionId);
  const passStarts = passCalls.filter(({ args }) => args[0] === "agent" && args[1] === "start");
  assert.equal(passStarts.length, 1);
  assert.equal(passStarts[0].args[2], review.qaAgentName(afterPass));
  assert.equal(passStarts[0].args[6], "w2T:p9");
  assert.ok(passStarts[0].args.includes("--session"));
  assert.ok(!passStarts[0].args.includes("--print"));
  assert.ok(passCalls.some(({ args }) => args[0] === "pane" && args[1] === "close" && args[2] === "w2T:p9"));
  assert.ok(!passCalls.some(({ args }) => args[0] === "tab" && args[1] === "create"));

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
