import assert from "node:assert/strict";
import { access, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/run.mjs")));
const admission = await import(pathToFileURL(join(root, "bin/lib/admission.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/board.ts")));

assert.equal(lib.taskSlug("TASK-1"), "task-1");
assert.equal(lib.taskSlug("T-1"), "t-1");
assert.equal(lib.taskSlug("A-71.12"), "a-71-12");
assert.throws(() => lib.taskSlug("bad task"), /T-1/);
assert.equal(
  lib.formatNoteTake("A later take.", new Date(2025, 0, 2, 3, 4)),
  "---\n\n2025-01-02 03:04\n\nA later take.",
);
assert.throws(() => lib.formatNoteTake("A later take.", "not a date"), /timestamp is invalid/);
const paneResponse = JSON.stringify({ id: "cli:pane:split", result: { type: "pane_info", pane: { pane_id: "w2T:p9" } } });
assert.equal(lib.parseHerdr(paneResponse, "pane_info").pane.pane_id, "w2T:p9");
assert.throws(() => lib.parseHerdr(paneResponse, "tab_created"), /pane_info, expected tab_created/);
assert.throws(() => lib.parseHerdr("created w2T:p9"), /malformed JSON/);
assert.throws(() => lib.parseHerdr("{}"), /malformed response/);
assert.throws(() => lib.parseHerdr(JSON.stringify({ result: [] })), /malformed response/);
assert.deepEqual(extension.parseAdmissionDecision('{"decision":"clear"}'), { decision: "clear" });
assert.deepEqual(extension.parseAdmissionDecision("BOUNCE: review.mjs is already live"), {
  decision: "bounce", reason: "review.mjs is already live",
});
assert.throws(() => extension.parseAdmissionDecision('{"decision":"bounce"}'), /malformed decision/);
assert.deepEqual(admission.parseWorktreeList([
  "worktree /repo", "HEAD aaa", "branch refs/heads/main", "", "worktree /runs/t-1", "HEAD bbb", "branch refs/heads/qq/t-1-nonce", "",
].join("\n")), [
  { path: "/repo", head: "aaa", branch: "main" },
  { path: "/runs/t-1", head: "bbb", branch: "qq/t-1-nonce" },
]);
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

const scratch = await mkdtemp(join(homedir(), "qq-delegation-test."));
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
  let vetRequest;
  const completionCtx = {
    signal: undefined,
    sessionManager: { getBranch: () => branch },
    modelRegistry: {
      find(provider, model) { assert.equal(`${provider}/${model}`, "test/scribe"); return { provider, id: model }; },
      async complete(_model, request, options) {
        if (request.systemPrompt.startsWith("Vet one proposed delegation")) {
          vetRequest = { request, options };
          return { stopReason: "stop", content: [{ type: "text", text: '{"decision":"bounce","reason":"review.mjs is already live"}' }] };
        }
        scribeRequest = { request, options };
        return { stopReason: "stop", content: [{ type: "text", text: exactNote }] };
      },
    },
  };
  const generated = await extension.makeNote(completionCtx, task, { policyPath, scribePromptPath: join(root, "prompts", "services", "scribe.md") });
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
  const vetDecision = await extension.makeAdmissionDecision(completionCtx, "live evidence", {
    policyPath, admissionPromptPath: join(root, "prompts", "services", "admission-vet.md"),
  });
  assert.deepEqual(vetDecision, { decision: "bounce", reason: "review.mjs is already live" });
  assert.equal(vetRequest.options.reasoning, "low");
  assert.equal(vetRequest.options.cacheRetention, "none");
  assert.notEqual(vetRequest.options.sessionId, scribeRequest.options.sessionId);
  assert.equal(vetRequest.request.messages[0].content[0].text, "live evidence");

  const prepared = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task, note: exactNote, transcript });
  assert.equal(await readFile(prepared.ticketPath, "utf8"), `${ticket}\n`);
  assert.equal(await readFile(prepared.transcriptPath, "utf8"), `${transcript}\n`);
  assert.equal(await readFile(prepared.notePath, "utf8"), `${exactNote}\n`);
  assert.equal(await readFile(prepared.gatePath, "utf8"), lib.formatGateDocument(ticket, exactNote));
  assert.equal((await lstat(prepared.stateDir)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.ticketPath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.transcriptPath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.notePath)).mode & 0o077, 0);
  assert.equal((await lstat(prepared.gatePath)).mode & 0o077, 0);
  assert.equal(await admission.findExistingBrief({ taskId: task.id, project: "qq", env }), exactNote);

  const lockOrder = [];
  let releaseFirstLock;
  let firstLockEntered;
  const firstEntered = new Promise((resolveEntered) => { firstLockEntered = resolveEntered; });
  const firstLock = admission.withAdmissionLock({ run: async () => assert.fail("commonDir avoids git"), cwd: "/repo", commonDir: scratch }, async () => {
    lockOrder.push("first:enter");
    firstLockEntered();
    await new Promise((resolveRelease) => { releaseFirstLock = resolveRelease; });
    lockOrder.push("first:leave");
  });
  await firstEntered;
  const secondLock = admission.withAdmissionLock({ run: async () => assert.fail("commonDir avoids git"), cwd: "/repo", commonDir: scratch, intervalMs: 1 }, async () => {
    lockOrder.push("second:enter");
  });
  await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
  assert.deepEqual(lockOrder, ["first:enter"]);
  releaseFirstLock();
  await Promise.all([firstLock, secondLock]);
  assert.deepEqual(lockOrder, ["first:enter", "first:leave", "second:enter"]);
  await assert.rejects(access(join(scratch, "qq-admit.lock")), { code: "ENOENT" });

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
  const state = await lib.startRun({
    run: spawnRun, cwd: "/repo", env, task, prepared,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    qaBinding: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });
  assert.equal(state.pane, "w2T:p9");
  assert.equal(state.status, "running");
  assert.equal(state.schema, "qq.run-handoff/v1");
  assert.equal(state.ticketPath, prepared.ticketPath);
  assert.equal(state.transcriptPath, prepared.transcriptPath);
  assert.equal(state.notePath, prepared.notePath);
  assert.equal(state.gatePath, prepared.gatePath);
  assert.equal(await readFile(state.notePath, "utf8"), `${exactNote}\n`);
  assert.equal(JSON.parse(await readFile(state.statePath, "utf8")).status, "running");
  const create = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create");
  assert.deepEqual(create.args.slice(0, 6), ["tab", "create", "--workspace", "w2T", "--label", "runs"]);
  assert.ok(create.args.includes("QQ_AGENT_ROLE=runner"));
  assert.ok(create.args.some((arg) => arg.startsWith("QQ_RUN_STATE=")));
  assert.ok(create.args.some((arg) => arg.startsWith("QQ_RUN_ID=")));
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
  assert.equal(prompt.args.at(-1), "--wait");

  const droppedTask = { id: "TASK-5", title: "Dropped prompt" };
  const droppedPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: droppedTask, note: exactNote });
  const droppedCalls = [];
  let statusAtDroppedPrompt;
  const droppedRun = async (command, args, options = {}) => {
    droppedCalls.push({ command, args, options });
    if (command === "herdr" && args[0] === "agent" && args[1] === "prompt") {
      statusAtDroppedPrompt = JSON.parse(await readFile(droppedPreparation.statePath, "utf8")).status;
      return args.includes("--wait")
        ? { code: 1, stdout: "", stderr: "agent_prompt_stalled" }
        : { code: 0, stdout: "", stderr: "" };
    }
    return spawnRun(command, args, options);
  };
  await assert.rejects(lib.startRun({
    run: droppedRun, cwd: "/repo", env, task: droppedTask, prepared: droppedPreparation,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
  }), /cannot send the ticket and note/);
  assert.equal(statusAtDroppedPrompt, "starting");
  const droppedOps = droppedCalls.map(({ command, args }) => `${command} ${args[0]} ${args[1]}`);
  assert.ok(droppedOps.indexOf("herdr agent start") < droppedOps.indexOf("herdr agent prompt"));
  assert.ok(droppedOps.indexOf("herdr agent prompt") < droppedOps.indexOf("herdr pane close"));
  const droppedPrompt = droppedCalls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "prompt");
  assert.equal(droppedPrompt.args.at(-1), "--wait");
  assert.ok(droppedCalls.some(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove"));
  assert.ok(droppedCalls.some(({ command, args }) => command === "git" && args[0] === "branch" && args[1] === "-D"));
  await assert.rejects(access(droppedPreparation.stateDir), { code: "ENOENT" });

  const existingTask = { id: "TASK-4", title: "Reuse runs" };
  const existingPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: existingTask, note: exactNote });
  const existingCalls = [];
  const existingRun = async (command, args, options = {}) => {
    existingCalls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123\n", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "list") {
      return { code: 0, stdout: JSON.stringify({ id: "cli:tab:list", result: { type: "tab_list", tabs: [{ tab_id: "w2T:tR", label: "runs" }] } }), stderr: "" };
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
  const existingState = await lib.startRun({
    run: existingRun, cwd: "/repo", env, task: existingTask, prepared: existingPreparation,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
  });
  assert.equal(existingState.pane, "w2T:p-new");
  assert.equal(existingCalls.some(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create"), false);
  assert.equal(existingCalls.some(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "rename"), false);
  const split = existingCalls.find(({ command }) => command === "qq-herdr-pane-add");
  assert.deepEqual(split.args.slice(0, 5), [
    "--pane", "w2T:p-right", "--cwd", existingPreparation.worktree, "--no-focus",
  ]);

  const cancelledPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: { id: "TASK-2", title: "Cancel" }, note: exactNote });
  await lib.discardRun(cancelledPreparation);
  await assert.rejects(access(cancelledPreparation.stateDir), { code: "ENOENT" });

  const failedGate = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: { id: "TASK-3", title: "Fail" }, note: exactNote });
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
  await lib.discardRun(failedGate);

  function delegateHarness({ run, ...deps }) {
    const registrations = [];
    const events = new Map();
    const admitDelegate = deps.admitDelegate ?? (async (ctx, id) => {
      const viewed = await run("backlog", ["task", "view", id, "--json"], { cwd: ctx.cwd });
      const admittedTask = JSON.parse(viewed.stdout).task;
      const moved = await run("backlog", ["task", "edit", id, "--status", "In Progress", "--plain"], { cwd: ctx.cwd });
      assert.equal(moved.code, 0);
      return { kind: "claimed", task: admittedTask, project: "qq", commonDir: "/repo/.git" };
    });
    extension.default({
      registerTool(tool) { registrations.push(tool); },
      events: { on(name, fn) { events.set(name, fn); } },
    }, { env, exec: run, admitDelegate, ...deps });
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
    async makeNote() { approvalOrder.push("scribe"); assert.deepEqual(approvalStatuses, ["In Progress"]); return { note: exactNote, qaBinding: { model: "qa" } }; },
    async prepareRun(options) { approvalOrder.push("prepare"); assert.equal(options.note, exactNote); assert.deepEqual(approvalStatuses, ["In Progress"]); return approvedPreparation; },
    async awaitBriefGate(options) { approvalOrder.push("gate"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, ["In Progress"]); return "approved"; },
    async startRun(options) { approvalOrder.push("start"); assert.equal(options.prepared, approvedPreparation); assert.deepEqual(approvalStatuses, ["In Progress"]); return { pane: "runner" }; },
    async discardRun() { approvalOrder.push("discard"); },
  });
  const approved = await approvedTool.execute("approve", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(approvalOrder, ["status:In Progress", "scribe", "prepare", "gate", "start"]);
  assert.deepEqual(approvalStatuses, ["In Progress"]);
  assert.equal(approved.content[0].text, `Approved ${task.id}; runner started.`);
  assert.equal(approved.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(approved), new RegExp(exactNote));

  const cancelOrder = [];
  const cancelStatuses = [];
  let cancelStarted = false;
  const cancelledTool = delegateHarness({
    run: backlogRun(cancelStatuses, cancelOrder),
    async makeNote() { cancelOrder.push("scribe"); return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { cancelOrder.push("prepare"); return approvedPreparation; },
    async awaitBriefGate() { cancelOrder.push("gate"); assert.deepEqual(cancelStatuses, ["In Progress"]); return "cancelled"; },
    async discardRun() { cancelOrder.push("discard"); },
    async startRun() { cancelStarted = true; },
  });
  const cancelled = await cancelledTool.execute("cancel", { id: task.id }, undefined, undefined, ctx);
  assert.deepEqual(cancelOrder, ["status:In Progress", "scribe", "prepare", "gate", "status:To Do", "discard"]);
  assert.deepEqual(cancelStatuses, ["In Progress", "To Do"]);
  assert.equal(cancelStarted, false);
  assert.equal(cancelled.content[0].text, `Cancelled ${task.id}; runner not started.`);
  assert.equal(cancelled.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(cancelled), new RegExp(exactNote));

  const failureStatuses = [];
  let failureDiscarded = false;
  const failedTool = delegateHarness({
    run: backlogRun(failureStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { return approvedPreparation; },
    async awaitBriefGate() { throw new Error("gate unavailable"); },
    async discardRun() { failureDiscarded = true; },
  });
  const gateFailure = await failedTool.execute("gate-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(gateFailure.content[0].text, /gate unavailable/);
  assert.deepEqual(failureStatuses, ["In Progress", "To Do"]);
  assert.equal(failureDiscarded, true);

  const rollbackStatuses = [];
  let rollbackDiscarded = false;
  const rollbackTool = delegateHarness({
    run: backlogRun(rollbackStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async startRun() { throw new Error(`start failed: ${exactNote}`); },
    async discardRun() { rollbackDiscarded = true; },
  });
  const rolledBack = await rollbackTool.execute("start-failure", { id: task.id }, undefined, undefined, ctx);
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
  assert.deepEqual(noteFailureStatuses, ["In Progress", "To Do"]);

  function admissionBoardRun(board, boardEvents) {
    return async (_command, args) => {
      if (args[0] === "task" && args[1] === "view") {
        const viewed = board.get(args[2]);
        return viewed
          ? { code: 0, stdout: JSON.stringify({ task: viewed }), stderr: "" }
          : { code: 1, stdout: "", stderr: "missing" };
      }
      if (args[0] === "task" && args[1] === "list") {
        const status = args[args.indexOf("--status") + 1];
        return {
          code: 0,
          stdout: JSON.stringify({ tasks: [...board.values()].filter((entry) => entry.status === status).map(({ id, title, status: taskStatus }) => ({ id, title, status: taskStatus })) }),
          stderr: "",
        };
      }
      if (args[0] === "task" && args[1] === "edit") {
        const edited = board.get(args[2]);
        edited.status = args[args.indexOf("--status") + 1];
        boardEvents.push(`status:${edited.id}:${edited.status}`);
        return { code: 0, stdout: "", stderr: "" };
      }
      throw new Error(`unexpected admission command: ${args.join(" ")}`);
    };
  }

  function actualAdmissionTool(board, boardEvents, overrides = {}) {
    const run = admissionBoardRun(board, boardEvents);
    const calls = { notes: [], gates: [], starts: [] };
    const tool = delegateHarness({
      run,
      admitDelegate: extension.admitDelegate,
      async withAdmissionLock(options, action) {
        return admission.withAdmissionLock({ ...options, commonDir: scratch, intervalMs: 1 }, action);
      },
      async collectLiveWorktreeDiffs() {
        return [{ path: "/runs/t-25", name: "t-25", branch: "qq/t-25-live", files: ["bin/lib/review.mjs"] }];
      },
      async findExistingBrief() { return undefined; },
      makeAdmissionDecision: overrides.makeAdmissionDecision,
      async makeNote(_ctx, admittedTask) {
        calls.notes.push(admittedTask.id);
        return { note: `${exactNote} for ${admittedTask.id}`, qaBinding: {} };
      },
      async prepareRun({ task: admittedTask }) {
        return { taskId: admittedTask.id, stateDir: `/private/${admittedTask.id}`, notePath: `/private/${admittedTask.id}/note.md` };
      },
      async awaitBriefGate({ prepared: gatePreparation }) {
        calls.gates.push(gatePreparation.taskId);
        if (overrides.awaitBriefGate) return overrides.awaitBriefGate(gatePreparation);
        return "approved";
      },
      async startRun({ task: admittedTask }) { calls.starts.push(admittedTask.id); },
      async discardRun() {},
    });
    return { tool, calls };
  }

  const overlapBoard = new Map([
    ["TASK-6", { id: "TASK-6", title: "Change board flow", status: "To Do", implementationNotes: "Edit extensions/board.ts" }],
    ["TASK-7", { id: "TASK-7", title: "Also change board flow", status: "To Do", implementationNotes: "Edit extensions/board.ts" }],
  ]);
  const overlapEvents = [];
  let releaseOverlapVet;
  let overlapVetEntered;
  const overlapVetWaiting = new Promise((resolveEntered) => { overlapVetEntered = resolveEntered; });
  const overlap = actualAdmissionTool(overlapBoard, overlapEvents, {
    async makeAdmissionDecision(_ctx, evidence) {
      const incomingId = /Incoming ticket:\n\n\{\n  "id": "([^"]+)"/.exec(evidence)?.[1];
      assert.match(evidence, /bin\/lib\/review\.mjs/);
      if (incomingId === "TASK-6") {
        overlapVetEntered();
        await new Promise((resolveRelease) => { releaseOverlapVet = resolveRelease; });
        return { decision: "clear" };
      }
      assert.match(evidence, /"id": "TASK-6"[\s\S]*?"status": "In Progress"/);
      return { decision: "bounce", reason: "extensions/board.ts is already claimed by TASK-6" };
    },
  });
  const firstOverlap = overlap.tool.execute("overlap-1", { id: "TASK-6" }, undefined, undefined, ctx);
  await overlapVetWaiting;
  const secondOverlap = overlap.tool.execute("overlap-2", { id: "TASK-7" }, undefined, undefined, ctx);
  releaseOverlapVet();
  const [firstOverlapResult, secondOverlapResult] = await Promise.all([firstOverlap, secondOverlap]);
  assert.equal(firstOverlapResult.content[0].text, "Approved TASK-6; runner started.");
  assert.equal(secondOverlapResult.content[0].text, "Bounced TASK-7: extensions/board.ts is already claimed by TASK-6");
  assert.equal(secondOverlapResult.content[0].text.includes("\n"), false);
  assert.equal(overlapBoard.get("TASK-7").status, "To Do");
  assert.deepEqual(overlap.calls.notes, ["TASK-6"]);
  assert.deepEqual(overlap.calls.gates, ["TASK-6"]);
  assert.deepEqual(overlap.calls.starts, ["TASK-6"]);

  const clearBoard = new Map([
    ["TASK-8", { id: "TASK-8", title: "Change board", status: "To Do", implementationNotes: "Edit board.ts" }],
    ["TASK-9", { id: "TASK-9", title: "Change telemetry", status: "To Do", implementationNotes: "Edit telemetry-lib.sh" }],
  ]);
  const clearEvents = [];
  let releaseClearVet;
  let clearVetEntered;
  let activeGates = 0;
  let maximumActiveGates = 0;
  const clearVetWaiting = new Promise((resolveEntered) => { clearVetEntered = resolveEntered; });
  const clear = actualAdmissionTool(clearBoard, clearEvents, {
    async makeAdmissionDecision(_ctx, evidence) {
      const incomingId = /Incoming ticket:\n\n\{\n  "id": "([^"]+)"/.exec(evidence)?.[1];
      if (incomingId === "TASK-8") {
        clearVetEntered();
        await new Promise((resolveRelease) => { releaseClearVet = resolveRelease; });
      } else {
        assert.equal(clearBoard.get("TASK-8").status, "In Progress");
        clearEvents.push("second-vet-after-first-claim");
      }
      return { decision: "clear" };
    },
    async awaitBriefGate() {
      activeGates += 1;
      maximumActiveGates = Math.max(maximumActiveGates, activeGates);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      activeGates -= 1;
      return "approved";
    },
  });
  const firstClear = clear.tool.execute("clear-1", { id: "TASK-8" }, undefined, undefined, ctx);
  await clearVetWaiting;
  const secondClear = clear.tool.execute("clear-2", { id: "TASK-9" }, undefined, undefined, ctx);
  releaseClearVet();
  const clearResults = await Promise.all([firstClear, secondClear]);
  assert.deepEqual(clearResults.map((value) => value.content[0].text).sort(), [
    "Approved TASK-8; runner started.", "Approved TASK-9; runner started.",
  ]);
  assert.ok(clearEvents.indexOf("status:TASK-8:In Progress") < clearEvents.indexOf("second-vet-after-first-claim"));
  assert.deepEqual(clear.calls.notes.sort(), ["TASK-8", "TASK-9"]);
  assert.deepEqual(clear.calls.starts.sort(), ["TASK-8", "TASK-9"]);
  assert.equal(maximumActiveGates, 1);

  const registrations = [];
  const events = new Map();
  extension.default({ registerTool(tool) { registrations.push(tool); }, events: { on(name, fn) { events.set(name, fn); } } }, { env, exec: backlogRun([]) });
  assert.deepEqual(registrations.map(({ name }) => name), ["sketch", "note", "delegate"]);
  const runnerRefusal = await registrations.find(({ name }) => name === "delegate").execute("runner", { id: task.id }, undefined, undefined, {});
  assert.match(runnerRefusal.content[0].text, /architect session/);

  const noteCalls = [];
  const architectTools = [];
  extension.default({
    registerTool(tool) { architectTools.push(tool); },
    events: { on() {} },
  }, {
    env: { ...env, QQ_AGENT_ROLE: "architect" },
    now: () => new Date(2025, 0, 2, 3, 4),
    async exec(_command, args) {
      noteCalls.push(args);
      return { code: 0, stdout: args[1] === "create" ? "Task TASK-2 created\n" : "", stderr: "" };
    },
  });
  const sketchResult = await architectTools.find(({ name }) => name === "sketch")
    .execute("sketch", { title: "A sketch", note: "The first take." }, undefined, undefined, { cwd: "/repo" });
  const noteResult = await architectTools.find(({ name }) => name === "note")
    .execute("note", { id: "TASK-2", text: "A later take." }, undefined, undefined, { cwd: "/repo" });
  assert.equal(sketchResult.content[0].text, "Sketched TASK-2: A sketch");
  assert.equal(noteResult.content[0].text, "Noted TASK-2.");
  assert.deepEqual(noteCalls, [
    ["task", "create", "A sketch", "--plain", "--notes", "---\n\n2025-01-02 03:04\n\nThe first take."],
    ["task", "edit", "TASK-2", "--append-notes", "---\n\n2025-01-02 03:04\n\nA later take.", "--plain"],
  ]);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-delegation: pass");
