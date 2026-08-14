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
const paneResponse = JSON.stringify({ id: "cli:pane:split", result: { type: "pane_info", pane: { pane_id: "w2T:p9" } } });
assert.equal(lib.parseHerdr(paneResponse, "pane_info").pane.pane_id, "w2T:p9");
assert.throws(() => lib.parseHerdr(paneResponse, "tab_created"), /pane_info, expected tab_created/);
assert.throws(() => lib.parseHerdr("created w2T:p9"), /malformed JSON/);
assert.throws(() => lib.parseHerdr("{}"), /malformed response/);
assert.throws(() => lib.parseHerdr(JSON.stringify({ result: [] })), /malformed response/);
assert.equal(lib.paneHasAvailableShell({
  process_info: { shell_pid: 10, foreground_process_group_id: 10, foreground_processes: [{ pid: 10, name: "bash" }] },
}), true);
assert.equal(lib.paneHasAvailableShell({
  process_info: { shell_pid: 10, foreground_process_group_id: 10, foreground_processes: [{ pid: 11, name: "bash" }] },
}), false);
assert.equal(lib.paneHasAvailableShell({
  process_info: { shell_pid: 10, foreground_process_group_id: 11, foreground_processes: [{ pid: 10, name: "bash" }] },
}), false);
assert.equal(lib.paneHasAvailableShell({
  process_info: { shell_pid: 10, foreground_process_group_id: 10, foreground_processes: [{ pid: 10, name: "pi" }] },
}), false);

const scratch = await mkdtemp(join(homedir(), "qq-workshop-test."));
try {
  const exactNote = "PRIVATE exact runner note";
  const env = {
    HOME: scratch,
    XDG_STATE_HOME: join(scratch, "state"),
    QQ_WORKTREE_ROOT: join(scratch, "worktrees"),
    HERDR_WORKSPACE_ID: "w2T",
    HERDR_PANE_ID: "w2T:pA",
  };
  const task = { id: "TASK-1", title: "One task", description: "Do the task.", implementationNotes: "Try the narrow seam." };
  const ticket = lib.formatTicket(task);
  const branch = [];
  for (let index = 0; index < 102; index += 1) {
    branch.push({ type: "message", message: { role: "user", content: [{ type: "text", text: `operator-${index}` }] } });
    branch.push({ type: "message", message: { role: "assistant", content: index === 101 ? [
      { type: "thinking", thinking: "SECRET_THINKING" },
      { type: "text", text: "Observed the final turn." },
      { type: "toolCall", name: "read", arguments: { path: "src/final.ts" } },
    ] : [{ type: "text", text: `reply-${index}` }] } });
    if (index === 50) branch.push({ type: "compaction", summary: "SECRET_COMPACTION" });
  }
  branch.push({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: "SECRET_TOOL_RESULT" }] } });
  const transcript = extension.serializeTranscript(branch);
  assert.equal(transcript.includes("[User]: operator-0\n\n"), false);
  assert.equal(transcript.includes("[User]: operator-1\n\n"), false);
  assert.match(transcript, /\[User\]: operator-2/);
  assert.match(transcript, /\[User\]: operator-101/);
  assert.match(transcript, /\[Assistant tools\]: read/);
  assert.doesNotMatch(transcript, /SECRET_THINKING|SECRET_COMPACTION|SECRET_TOOL_RESULT|src\/final\.ts/);

  const policyPath = join(scratch, "execution-profiles.json");
  await writeFile(policyPath, JSON.stringify({
    schema: "qq.execution-profiles/v1", contextWindowCeiling: 200000,
    roles: {
      runner: { default: "one", profiles: { one: { provider: "test", model: "runner", effort: "high" } } },
      architect: { default: "one", profiles: { one: { provider: "test", model: "architect", effort: "high" } } },
    },
    scribe: { provider: "test", model: "scribe", effort: "low" },
    qa: { provider: "test", model: "qa", effort: "xhigh" },
  }), { mode: 0o600 });
  let scribeRequest;
  const generated = await extension.makeNote({
    signal: undefined,
    sessionManager: { getBranch: () => branch },
    modelRegistry: {
      find(provider, model) { assert.equal(`${provider}/${model}`, "test/scribe"); return { provider, id: model }; },
      async complete(_model, request, options) {
        scribeRequest = { request, options };
        return { stopReason: "stop", content: [{ type: "text", text: exactNote }] };
      },
    },
  }, task, { policyPath, scribePromptPath: join(root, "prompts", "services", "scribe.md") });
  assert.equal(generated.note, exactNote);
  assert.equal(generated.transcript, transcript);
  assert.equal(scribeRequest.request.systemPrompt, "Write a helpful note for the next agent.\nOnly what's missing in the ticket: decisions, files, names, constraints, and what's still open.\nPlain language.");
  const scribeInput = scribeRequest.request.messages[0].content[0].text;
  assert.match(scribeInput, /Attached ticket \(ticket\.md\):/);
  assert.match(scribeInput, /# TASK-1 — One task/);
  assert.match(scribeInput, /## Architect notes \/ scratch\n\nTry the narrow seam\./);
  assert.match(scribeInput, /Attached architect transcript \(transcript\.md\):/);
  assert.match(scribeInput, /Read files:\n- src\/final\.ts/);
  assert.doesNotMatch(scribeInput, /operator-0\n|operator-1\n|SECRET_THINKING|SECRET_COMPACTION|SECRET_TOOL_RESULT/);
  assert.equal(scribeRequest.options.reasoning, "low");
  assert.equal(scribeRequest.options.cacheRetention, "none");

  const prepared = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task, note: exactNote, transcript });
  assert.equal(await readFile(prepared.ticketPath, "utf8"), `${ticket}\n`);
  assert.equal(await readFile(prepared.transcriptPath, "utf8"), `${transcript}\n`);
  assert.equal(await readFile(prepared.notePath, "utf8"), `${exactNote}\n`);
  assert.equal(await readFile(prepared.gatePath, "utf8"), lib.formatGateDocument(ticket, exactNote));
  assert.equal((await lstat(prepared.stateDir)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.ticketPath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.transcriptPath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.notePath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.gatePath)).mode & 0o077, 0);

  const gateCalls = [];
  const gateRun = async (command, args, options = {}) => {
    gateCalls.push({ command, args, options });
    if (args[0] === "plugin" && args[1] === "list") {
      return { code: 0, stdout: JSON.stringify({ id: "cli:plugin", result: { type: "plugin_list", plugins: [] } }), stderr: "" };
    }
    if (args[0] === "pane" && args[1] === "list") {
      return { code: 0, stdout: JSON.stringify({ id: "cli:pane:list", result: { type: "pane_list", panes: [
        { pane_id: "w2T:pA", tab_id: "w2T:tA" },
        { pane_id: "w2T:pR", tab_id: "w2T:tA" },
        { pane_id: "w2T:pO", tab_id: "w2T:tO" },
      ] } }), stderr: "" };
    }
    if (args[0] === "plugin" && args[1] === "pane" && args[2] === "open") {
      return { code: 0, stdout: JSON.stringify({ id: "cli:plugin", result: { type: "plugin_pane_opened", plugin_pane: { pane: { pane_id: "w2T:pG" } } } }), stderr: "" };
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
  assert.ok(gateOpen.args.includes("split"));
  assert.equal(gateOpen.args.includes("zoomed"), false);
  assert.deepEqual(gateOpen.args.slice(gateOpen.args.indexOf("--target-pane"), gateOpen.args.indexOf("--target-pane") + 2), ["--target-pane", "w2T:pR"]);
  assert.deepEqual(gateOpen.args.slice(gateOpen.args.indexOf("--direction"), gateOpen.args.indexOf("--direction") + 2), ["--direction", "right"]);
  assert.equal(gateOpen.args.includes("--workspace"), false);
  assert.ok(gateOpen.args.includes(`QQ_BRIEF_GATE_DOCUMENT=${prepared.gatePath}`));
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
    if (command === "herdr" && args[0] === "tab" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ id: "cli:tab:list", result: { type: "tab_list", tabs: [] } }), stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "create") return { code: 0, stdout: JSON.stringify({ id: "cli:tab:create", result: { type: "tab_created", root_pane: { pane_id: "w2T:p9" }, tab: { tab_id: "w2T:t9" } } }), stderr: "" };
    if (command === "herdr" && args[0] === "pane" && args[1] === "process-info") {
      const ready = spawnCalls.filter((call) => call.command === "herdr" && call.args[0] === "pane" && call.args[1] === "process-info").length >= 2;
      return {
        code: 0,
        stdout: JSON.stringify({
          id: "cli:pane:process_info",
          result: {
            type: "pane_process_info",
            process_info: ready
              ? { pane_id: "w2T:p9", shell_pid: 10, foreground_process_group_id: 10, foreground_processes: [{ pid: 10, name: "-zsh" }] }
              : { pane_id: "w2T:p9" },
          },
        }),
        stderr: "",
      };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const state = await lib.spawnWorkshop({
    run: spawnRun, cwd: "/repo", env, task, prepared,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    qaBinding: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });
  assert.equal(state.pane, "w2T:p9");
  assert.equal(state.status, "running");
  assert.equal(state.ticketPath, prepared.ticketPath);
  assert.equal(state.transcriptPath, prepared.transcriptPath);
  assert.equal(state.notePath, prepared.notePath);
  assert.equal(state.gatePath, prepared.gatePath);
  assert.equal(await readFile(state.notePath, "utf8"), `${exactNote}\n`);
  assert.equal(JSON.parse(await readFile(state.statePath, "utf8")).status, "running");
  const create = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create");
  assert.deepEqual(create.args.slice(0, 6), ["tab", "create", "--workspace", "w2T", "--label", "runs"]);
  assert.ok(create.args.includes("QQ_AGENT_ROLE=runner"));
  assert.ok(create.args.some((arg) => arg.startsWith("QQ_WORKSHOP_STATE=")));
  const herdrOps = spawnCalls.filter(({ command }) => command === "herdr").map(({ args }) => `${args[0]} ${args[1]}`);
  const processInfo = herdrOps.filter((op) => op === "pane process-info");
  assert.equal(processInfo.length, 2);
  assert.ok(herdrOps.indexOf("pane process-info") > herdrOps.indexOf("pane rename"));
  assert.ok(herdrOps.lastIndexOf("pane process-info") < herdrOps.indexOf("agent start"));
  const start = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "start");
  assert.deepEqual(start.args.slice(0, 2), ["agent", "start"]);
  const prompt = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "prompt");
  assert.match(prompt.args[3], /call done with ref HEAD/);
  assert.match(prompt.args[3], /# TASK-1 — One task/);
  assert.match(prompt.args[3], /## Architect notes \/ scratch/);
  assert.ok(prompt.args[3].endsWith(exactNote));

  for (const [id, label] of [["TASK-4", "runs"], ["TASK-5", "workshop"]]) {
    const existingTask = { id, title: `Reuse ${label}` };
    const existingPreparation = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task: existingTask, note: exactNote });
    const existingCalls = [];
    const existingRun = async (command, args, options = {}) => {
      existingCalls.push({ command, args, options });
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
      if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123\n", stderr: "" };
      if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
      if (command === "herdr" && args[0] === "tab" && args[1] === "list") {
        return { code: 0, stdout: JSON.stringify({ id: "cli:tab:list", result: { type: "tab_list", tabs: [{ tab_id: "w2T:tR", label }] } }), stderr: "" };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "list") {
        return {
          code: 0,
          stdout: JSON.stringify({ id: "cli:pane:list", result: { type: "pane_list", panes: [
            { pane_id: "w2T:p0", tab_id: "w2T:t0" },
            { pane_id: "w2T:p-left", tab_id: "w2T:tR" },
            { pane_id: "w2T:p-right", tab_id: "w2T:tR" },
          ] } }),
          stderr: "",
        };
      }
      if (command === "qq-herdr-pane-add") {
        return { code: 0, stdout: JSON.stringify({ id: "cli:pane:split", result: { type: "pane_info", pane: { pane_id: "w2T:p-new" } } }), stderr: "" };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "process-info") {
        return {
          code: 0,
          stdout: JSON.stringify({ id: "cli:pane:process_info", result: { type: "pane_process_info", process_info: {
            pane_id: "w2T:p-new", shell_pid: 10, foreground_process_group_id: 10,
            foreground_processes: [{ pid: 10, name: "zsh" }],
          } } }),
          stderr: "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    const existingState = await lib.spawnWorkshop({
      run: existingRun, cwd: "/repo", env, task: existingTask, prepared: existingPreparation,
      architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
    });
    assert.equal(existingState.pane, "w2T:p-new");
    assert.equal(existingCalls.some(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create"), false);
    assert.equal(existingCalls.some(({ command, args }) => command === "herdr" &&
      args[0] === "tab" && args[1] === "rename" && args[2] === "w2T:tR" && args[3] === "runs"), label === "workshop");
    const split = existingCalls.find(({ command }) => command === "qq-herdr-pane-add");
    assert.deepEqual(split.args.slice(0, 5), [
      "--pane", "w2T:p-right", "--cwd", existingPreparation.worktree, "--no-focus",
    ]);
  }

  const cancelledPreparation = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task: { id: "TASK-2", title: "Cancel" }, note: exactNote });
  await lib.discardWorkshop(cancelledPreparation);
  await assert.rejects(access(cancelledPreparation.stateDir), { code: "ENOENT" });

  const failedGate = await lib.prepareWorkshop({ cwd: "/repo", env, project: "qq", task: { id: "TASK-3", title: "Fail" }, note: exactNote });
  let failedGateClosed = false;
  await assert.rejects(lib.awaitBriefGate({
    env, prepared: failedGate, pluginRoot: join(root, "plugins", "brief-gate"),
    async run(_command, args) {
      if (args[0] === "plugin" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ id: "cli:plugin", result: { type: "plugin_list", plugins: [{ plugin_id: "qq.brief-gate", enabled: true }] } }), stderr: "" };
      if (args[0] === "pane" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ id: "cli:pane:list", result: { type: "pane_list", panes: [{ pane_id: "w2T:pA", tab_id: "w2T:tA" }] } }), stderr: "" };
      if (args[0] === "plugin" && args[1] === "pane" && args[2] === "open") return { code: 0, stdout: JSON.stringify({ id: "cli:plugin", result: { type: "plugin_pane_opened", plugin_pane: { pane: { pane_id: "w2T:pF" } } } }), stderr: "" };
      if (args[0] === "pane" && args[1] === "wait-output") return { code: 1, stdout: exactNote, stderr: "" };
      if (args[0] === "plugin" && args[1] === "pane" && args[2] === "close") { failedGateClosed = true; return { code: 0, stdout: "", stderr: "" }; }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    },
  }), (error) => {
    assert.match(error.message, /without a decision/);
    assert.doesNotMatch(error.message, new RegExp(exactNote));
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
  const approvedPreparation = { taskId: task.id, stateDir: "/private/gate", notePath: "/private/gate/note.md", gatePath: "/private/gate/gate.md" };
  const approvedTool = delegateHarness({
    run: backlogRun(approvalStatuses, approvalOrder),
    async makeNote() { approvalOrder.push("scribe"); assert.deepEqual(approvalStatuses, []); return { note: exactNote, qaBinding: { model: "qa" } }; },
    async prepareWorkshop(options) { approvalOrder.push("prepare"); assert.equal(options.note, exactNote); assert.deepEqual(approvalStatuses, []); return approvedPreparation; },
    async awaitBriefGate(options) { approvalOrder.push("gate"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, []); return "approved"; },
    async spawnWorkshop(options) { approvalOrder.push("spawn"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, ["In Progress"]); return { pane: "runner" }; },
    async discardWorkshop() { approvalOrder.push("discard"); },
  });
  const approved = await approvedTool.execute("approve", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(approvalOrder, ["scribe", "prepare", "gate", "status:In Progress", "spawn"]);
  assert.deepEqual(approvalStatuses, ["In Progress"]);
  assert.equal(approved.content[0].text, `Approved ${task.id}; runner started.`);
  assert.equal(approved.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(approved), new RegExp(exactNote));

  const cancelOrder = [];
  const cancelStatuses = [];
  let cancelSpawned = false;
  const cancelledTool = delegateHarness({
    run: backlogRun(cancelStatuses, cancelOrder),
    async makeNote() { cancelOrder.push("scribe"); return { note: exactNote, qaBinding: {} }; },
    async prepareWorkshop() { cancelOrder.push("prepare"); return approvedPreparation; },
    async awaitBriefGate() { cancelOrder.push("gate"); assert.deepEqual(cancelStatuses, []); return "cancelled"; },
    async discardWorkshop() { cancelOrder.push("discard"); },
    async spawnWorkshop() { cancelSpawned = true; },
  });
  const cancelled = await cancelledTool.execute("cancel", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(cancelOrder, ["scribe", "prepare", "gate", "discard"]);
  assert.deepEqual(cancelStatuses, []);
  assert.equal(cancelSpawned, false);
  assert.equal(cancelled.content[0].text, `Cancelled ${task.id}; runner not started.`);
  assert.equal(cancelled.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(cancelled), new RegExp(exactNote));

  const failureStatuses = [];
  let failureDiscarded = false;
  const failedTool = delegateHarness({
    run: backlogRun(failureStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
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
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareWorkshop() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async spawnWorkshop() { throw new Error(`spawn failed: ${exactNote}`); },
    async discardWorkshop() { rollbackDiscarded = true; },
  });
  const rolledBack = await rollbackTool.execute("spawn-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(rolledBack.content[0].text, /runs operation failed/);
  assert.doesNotMatch(JSON.stringify(rolledBack), new RegExp(exactNote));
  assert.deepEqual(rollbackStatuses, ["In Progress", "To Do"]);
  assert.equal(rollbackDiscarded, true);

  const noteFailureStatuses = [];
  const noteFailureTool = delegateHarness({
    run: backlogRun(noteFailureStatuses),
    async makeNote() { throw new Error("note failed"); },
  });
  const noteFailure = await noteFailureTool.execute("note-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(noteFailure.content[0].text, /note failed/);
  assert.deepEqual(noteFailureStatuses, []);

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
