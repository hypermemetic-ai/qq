import assert from "node:assert/strict";
import { access, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/workshop.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/workshop.ts")));

assert.equal(lib.taskSlug("TASK-1"), "task-1");
assert.equal(lib.taskSlug("T-1"), "t-1");
assert.equal(lib.taskSlug("A-71.12"), "a-71-12");
assert.throws(() => lib.taskSlug("bad task"), /T-1/);
assert.equal(lib.parseHerdr(JSON.stringify({ result: { pane: { pane_id: "w2T:p9" } } })).pane.pane_id, "w2T:p9");

const scratch = await mkdtemp(join(homedir(), "qq-workshop-test."));
try {
  const exactBrief = "PRIVATE exact runner brief";
  const env = {
    HOME: scratch,
    XDG_STATE_HOME: join(scratch, "state"),
    QQ_WORKTREE_ROOT: join(scratch, "worktrees"),
    HERDR_WORKSPACE_ID: "w2T",
  };
  const task = { id: "TASK-1", title: "One task" };
  const prepared = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task, brief: exactBrief });
  assert.equal(await readFile(prepared.briefPath, "utf8"), `${exactBrief}\n`);
  assert.equal((await lstat(prepared.stateDir)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.briefPath)).mode & 0o077, 0);

  const gateCalls = [];
  const gateRun = async (command, args, options = {}) => {
    gateCalls.push({ command, args, options });
    if (args[0] === "plugin" && args[1] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { plugins: [] } }), stderr: "" };
    }
    if (args[0] === "plugin" && args[1] === "pane" && args[2] === "open") {
      return { code: 0, stdout: JSON.stringify({ result: { plugin_pane: { pane: { pane_id: "w2T:pG" } } } }), stderr: "" };
    }
    if (args[0] === "pane" && args[1] === "wait-output") {
      await writeFile(prepared.decisionPath, "approved\n", { mode: 0o600 });
      return { code: 0, stdout: "terminal snapshot intentionally ignored", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  assert.equal(await lib.awaitBriefGate({
    run: gateRun, env, prepared, pluginRoot: join(root, "plugins", "brief-gate"),
  }), "approved");
  const gateOpen = gateCalls.find(({ args }) => args[0] === "plugin" && args[1] === "pane" && args[2] === "open");
  assert.ok(gateOpen.args.includes("--focus"));
  assert.ok(gateOpen.args.includes("overlay"));
  assert.ok(gateOpen.args.includes(`QQ_BRIEF_GATE_BRIEF=${prepared.briefPath}`));
  assert.ok(gateOpen.args.includes(`QQ_BRIEF_GATE_DECISION=${prepared.decisionPath}`));
  assert.equal(gateCalls.filter(({ args }) => args[0] === "plugin" && args[1] === "pane" && args[2] === "open").length, 1);
  assert.ok(gateCalls.some(({ args }) => args[0] === "plugin" && args[1] === "link"));
  assert.ok(gateCalls.some(({ args }) => args[0] === "plugin" && args[1] === "pane" && args[2] === "close"));
  await assert.rejects(access(prepared.decisionPath), { code: "ENOENT" });

  const spawnCalls = [];
  const spawnRun = async (command, args, options = {}) => {
    spawnCalls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123\n", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ result: { tabs: [] } }), stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "create") return { code: 0, stdout: JSON.stringify({ result: { root_pane: { pane_id: "w2T:p9" }, tab: { tab_id: "w2T:t9" } } }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const state = await lib.spawnWorkshop({
    run: spawnRun, cwd: "/repo", env, task, prepared,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    qaBinding: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });
  assert.equal(state.pane, "w2T:p9");
  assert.equal(state.status, "running");
  assert.equal(state.briefPath, prepared.briefPath);
  assert.equal(await readFile(state.briefPath, "utf8"), `${exactBrief}\n`);
  assert.equal(JSON.parse(await readFile(state.statePath, "utf8")).status, "running");
  const create = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create");
  assert.ok(create.args.includes("QQ_AGENT_ROLE=runner"));
  assert.ok(create.args.some((arg) => arg.startsWith("QQ_WORKSHOP_STATE=")));
  const prompt = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "prompt");
  assert.match(prompt.args[3], /call done with ref HEAD/);
  assert.ok(prompt.args[3].endsWith(exactBrief));

  const cancelledPreparation = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task: { id: "TASK-2", title: "Cancel" }, brief: exactBrief });
  await lib.discardWorkshop(cancelledPreparation);
  await assert.rejects(access(cancelledPreparation.stateDir), { code: "ENOENT" });

  const failedGate = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task: { id: "TASK-3", title: "Fail" }, brief: exactBrief });
  let failedGateClosed = false;
  await assert.rejects(lib.awaitBriefGate({
    env, prepared: failedGate, pluginRoot: join(root, "plugins", "brief-gate"),
    async run(_command, args) {
      if (args[0] === "plugin" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ result: { plugins: [{ plugin_id: "qq.brief-gate", enabled: true }] } }), stderr: "" };
      if (args[0] === "plugin" && args[1] === "pane" && args[2] === "open") return { code: 0, stdout: JSON.stringify({ result: { plugin_pane: { pane: { pane_id: "w2T:pF" } } } }), stderr: "" };
      if (args[0] === "pane" && args[1] === "wait-output") return { code: 1, stdout: exactBrief, stderr: "" };
      if (args[0] === "plugin" && args[1] === "pane" && args[2] === "close") { failedGateClosed = true; return { code: 0, stdout: "", stderr: "" }; }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    },
  }), (error) => {
    assert.match(error.message, /without a decision/);
    assert.doesNotMatch(error.message, new RegExp(exactBrief));
    return true;
  });
  assert.equal(failedGateClosed, true);
  await lib.discardWorkshop(failedGate);

  function delegateHarness({ run, ...deps }) {
    const registrations = [];
    const events = new Map();
    extension.default({
      registerTool(tool) { registrations.push(tool); },
      events: { on(name, fn) { events.set(name, fn); } },
    }, { env, exec: run, ...deps });
    events.get("qq:role-selected")({ role: "architect" });
    return registrations.find(({ name }) => name === "delegate");
  }
  const ctx = { cwd: "/repo", sessionManager: { getSessionId() { return "session"; } } };
  function backlogRun(statusChanges, order = []) {
    return async (_command, args) => {
      if (args[0] === "task" && args[1] === "view") return { code: 0, stdout: JSON.stringify({ task: { ...task, status: "To Do", description: "Do it" } }), stderr: "" };
      if (args[0] === "task" && args[1] === "edit") {
        statusChanges.push(args[4]);
        order.push(`status:${args[4]}`);
        return { code: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
  }

  const approvalOrder = [];
  const approvalStatuses = [];
  const approvedPreparation = { taskId: task.id, stateDir: "/private/gate", briefPath: "/private/gate/brief.md" };
  const approvedTool = delegateHarness({
    run: backlogRun(approvalStatuses, approvalOrder),
    async makeBrief() { approvalOrder.push("compact"); assert.deepEqual(approvalStatuses, []); return { brief: exactBrief, qaBinding: { model: "qa" } }; },
    async prepareWorkshop(options) { approvalOrder.push("prepare"); assert.equal(options.brief, exactBrief); assert.deepEqual(approvalStatuses, []); return approvedPreparation; },
    async awaitBriefGate(options) { approvalOrder.push("gate"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, []); return "approved"; },
    async spawnWorkshop(options) { approvalOrder.push("spawn"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, ["In Progress"]); return { pane: "runner" }; },
    async discardWorkshop() { approvalOrder.push("discard"); },
  });
  const approved = await approvedTool.execute("approve", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(approvalOrder, ["compact", "prepare", "gate", "status:In Progress", "spawn"]);
  assert.deepEqual(approvalStatuses, ["In Progress"]);
  assert.equal(approved.content[0].text, `Approved ${task.id}; runner started.`);
  assert.equal(approved.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(approved), new RegExp(exactBrief));

  const cancelOrder = [];
  const cancelStatuses = [];
  let cancelSpawned = false;
  const cancelledTool = delegateHarness({
    run: backlogRun(cancelStatuses, cancelOrder),
    async makeBrief() { cancelOrder.push("compact"); return { brief: exactBrief, qaBinding: {} }; },
    async prepareWorkshop() { cancelOrder.push("prepare"); return approvedPreparation; },
    async awaitBriefGate() { cancelOrder.push("gate"); assert.deepEqual(cancelStatuses, []); return "cancelled"; },
    async discardWorkshop() { cancelOrder.push("discard"); },
    async spawnWorkshop() { cancelSpawned = true; },
  });
  const cancelled = await cancelledTool.execute("cancel", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(cancelOrder, ["compact", "prepare", "gate", "discard"]);
  assert.deepEqual(cancelStatuses, []);
  assert.equal(cancelSpawned, false);
  assert.equal(cancelled.content[0].text, `Cancelled ${task.id}; runner not started.`);
  assert.equal(cancelled.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(cancelled), new RegExp(exactBrief));

  const failureStatuses = [];
  let failureDiscarded = false;
  const failedTool = delegateHarness({
    run: backlogRun(failureStatuses),
    async makeBrief() { return { brief: exactBrief, qaBinding: {} }; },
    async prepareWorkshop() { return approvedPreparation; },
    async awaitBriefGate() { throw new Error("gate unavailable"); },
    async discardWorkshop() { failureDiscarded = true; },
  });
  const gateFailure = await failedTool.execute("gate-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(gateFailure.content[0].text, /gate unavailable/);
  assert.deepEqual(failureStatuses, []);
  assert.equal(failureDiscarded, true);

  const rollbackStatuses = [];
  let rollbackDiscarded = false;
  const rollbackTool = delegateHarness({
    run: backlogRun(rollbackStatuses),
    async makeBrief() { return { brief: exactBrief, qaBinding: {} }; },
    async prepareWorkshop() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async spawnWorkshop() { throw new Error(`spawn failed: ${exactBrief}`); },
    async discardWorkshop() { rollbackDiscarded = true; },
  });
  const rolledBack = await rollbackTool.execute("spawn-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(rolledBack.content[0].text, /workshop operation failed/);
  assert.doesNotMatch(JSON.stringify(rolledBack), new RegExp(exactBrief));
  assert.deepEqual(rollbackStatuses, ["In Progress", "To Do"]);
  assert.equal(rollbackDiscarded, true);

  const briefFailureStatuses = [];
  const briefFailureTool = delegateHarness({
    run: backlogRun(briefFailureStatuses),
    async makeBrief() { throw new Error("brief failed"); },
  });
  const briefFailure = await briefFailureTool.execute("brief-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(briefFailure.content[0].text, /brief failed/);
  assert.deepEqual(briefFailureStatuses, []);

  const registrations = [];
  const events = new Map();
  extension.default({ registerTool(tool) { registrations.push(tool); }, events: { on(name, fn) { events.set(name, fn); } } }, { env, exec: backlogRun([]) });
  assert.deepEqual(registrations.map(({ name }) => name), ["sketch", "note", "delegate"]);
  const runnerRefusal = await registrations.find(({ name }) => name === "delegate").execute("runner", { id: task.id }, undefined, undefined, {});
  assert.match(runnerRefusal.content[0].text, /architect session/);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-workshop: pass");
