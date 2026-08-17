import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/run.mjs")));
const bootstrap = await import(pathToFileURL(join(root, "bin/lib/bootstrap.mjs")));
const dshRun = await import(pathToFileURL(join(root, "bin/lib/dsh-run.mjs")));
const sessionContexts = await import(pathToFileURL(join(root, "bin/lib/session-context.mjs")));
const runEvents = await import(pathToFileURL(join(root, "bin/lib/run-events.mjs")));
const reviewFlow = await import(pathToFileURL(join(root, "extensions/review-flow.ts")));
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
const promptRequests = [];
await lib.submitAgentPrompt("w2T:p9", "private prompt", {
  async request(method, params) {
    promptRequests.push({ method, params });
    return { id: "qq:test", result: { type: "agent_prompted", agent: { pane_id: params.target } } };
  },
});
assert.deepEqual(promptRequests, [{ method: "agent.prompt", params: { target: "w2T:p9", text: "private prompt" } }]);
assert.equal("wait" in promptRequests[0].params, false);

let stalledPollSignal;
let stalledPollTimeout;
let stalledWatchdog;
await Promise.race([
  assert.rejects(lib.verifyPromptAcceptance((_paneId, options) => {
    stalledPollSignal = options.signal;
    stalledPollTimeout = options.timeoutMs;
    return new Promise(() => {});
  }, "w2T:p-stalled", "[qq-bootstrap:stalled]", { timeoutMs: 20 }), /not recorded within 20ms/),
  new Promise((_, reject) => { stalledWatchdog = setTimeout(() => reject(new Error("stalled agent inspection remained pending")), 500); }),
]).finally(() => clearTimeout(stalledWatchdog));
assert.equal(stalledPollSignal.aborted, true, "a stalled agent inspection must be cancelled at the verification deadline");
assert.ok(stalledPollTimeout > 0 && stalledPollTimeout <= 20, "each inspection must be bounded by the remaining deadline");

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
  const cleanupRepo = join(scratch, "cleanup-main");
  const cleanupWorktree = join(scratch, "cleanup-worktree");
  await mkdir(join(cleanupRepo, "openwiki", "guides"), { recursive: true });
  await writeFile(join(cleanupRepo, "openwiki", "guides", "start.md"), "start here\n");
  execFileSync("git", ["-C", cleanupRepo, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", cleanupRepo, "config", "user.name", "qq-test"]);
  execFileSync("git", ["-C", cleanupRepo, "config", "user.email", "qq-test.invalid"]);
  execFileSync("git", ["-C", cleanupRepo, "add", "."]);
  execFileSync("git", ["-C", cleanupRepo, "commit", "-q", "-m", "initial"]);
  execFileSync("git", ["-C", cleanupRepo, "worktree", "add", "-q", "-b", "qq/cleanup", cleanupWorktree]);
  execFileSync(join(root, "bin", "qq-openwiki-materialize"), ["freeze", cleanupWorktree]);
  const assertCleanupWorktreeFrozen = async () => {
    assert.equal((await lstat(join(cleanupWorktree, "openwiki"))).mode & 0o777, 0o555);
    assert.equal((await lstat(join(cleanupWorktree, "openwiki", "guides"))).mode & 0o777, 0o555);
    assert.equal((await lstat(join(cleanupWorktree, "openwiki", "guides", "start.md"))).mode & 0o777, 0o444);
  };
  await assertCleanupWorktreeFrozen();
  const filesystemRun = async (command, args, options = {}) => {
    const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });
    return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  await writeFile(join(cleanupWorktree, "local.txt"), "keep the worktree registered\n");
  await assert.rejects(lib.removeWorktree(filesystemRun, cleanupRepo, cleanupWorktree), /worktree cleanup failed/);
  await access(cleanupWorktree);
  assert.ok(execFileSync("git", ["-C", cleanupRepo, "worktree", "list", "--porcelain"], { encoding: "utf8" }).includes(`worktree ${cleanupWorktree}\n`));
  await assertCleanupWorktreeFrozen();

  const cancellation = new AbortController();
  cancellation.abort();
  const cancellationCalls = [];
  const cancellationRun = async (command, args, options = {}) => {
    cancellationCalls.push({ command, args, options });
    if (command === "git" && args[0] === "worktree" && args[1] === "remove") throw new Error("cleanup cancelled");
    return filesystemRun(command, args, options);
  };
  await assert.rejects(lib.removeWorktree(cancellationRun, cleanupRepo, cleanupWorktree, {
    force: true, signal: cancellation.signal,
  }), /cleanup cancelled/);
  assert.deepEqual(cancellationCalls.filter(({ command }) => command.endsWith("/bin/qq-openwiki-materialize")).map(({ args }) => args[0]), ["thaw", "freeze"]);
  assert.equal(cancellationCalls.at(-1).options.signal, undefined);
  await access(cleanupWorktree);
  await assertCleanupWorktreeFrozen();

  await lib.removeWorktree(filesystemRun, cleanupRepo, cleanupWorktree, { force: true });
  await assert.rejects(access(cleanupWorktree), { code: "ENOENT" });
  assert.doesNotMatch(execFileSync("git", ["-C", cleanupRepo, "worktree", "list", "--porcelain"], { encoding: "utf8" }), /cleanup-worktree/);
  execFileSync("git", ["-C", cleanupRepo, "branch", "-D", "qq/cleanup"]);

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
  const preparedBootstrap = await lib.prepareBootstrapRequest({
    cwd: "/repo", env, task, prepared, qaBinding: { model: "qa" },
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
  });
  assert.equal((await lstat(preparedBootstrap.bootstrapPath)).mode & 0o077, 0);
  assert.equal((await lib.readBootstrapRequest(preparedBootstrap.bootstrapPath)).marker, preparedBootstrap.marker);
  assert.doesNotMatch(preparedBootstrap.marker, /PRIVATE|Do the task/);
  await rm(preparedBootstrap.bootstrapPath);

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

  const proofPath = join(scratch, "runner-session.jsonl");
  const agentInfo = (paneId, sessionPath, status = "working") => JSON.stringify({
    id: "cli:agent:get",
    result: { type: "agent_info", agent: {
      agent: "pi", pane_id: paneId, agent_status: status,
      agent_session: { agent: "pi", kind: "path", source: "herdr:pi", value: sessionPath },
    } },
  });
  const userMessage = (text) => `${JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text }] } })}\n`;
  const inspectAgentAt = (sessionPath) => async (paneId) => JSON.parse(agentInfo(paneId, sessionPath));
  const spawnCalls = [];
  const submittedPrompts = [];
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
  const startSignal = new AbortController().signal;
  let statusAtPrompt;
  const state = await lib.startRun({
    run: spawnRun, cwd: "/repo", env, task, prepared, signal: startSignal,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    qaBinding: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
    inspectAgent: inspectAgentAt(proofPath),
    async submitPrompt(paneId, prompt) {
      statusAtPrompt = JSON.parse(await readFile(prepared.statePath, "utf8")).status;
      submittedPrompts.push({ paneId, prompt });
      await writeFile(proofPath, userMessage(prompt));
    },
  });
  assert.equal(statusAtPrompt, "starting");
  assert.equal(state.pane, "w2T:p9");
  assert.equal(state.status, "running");
  assert.equal(state.schema, "qq.run-handoff/v1");
  assert.equal(state.ticketPath, prepared.ticketPath);
  assert.equal(state.transcriptPath, prepared.transcriptPath);
  assert.equal(state.notePath, prepared.notePath);
  assert.equal(state.gatePath, prepared.gatePath);
  assert.equal(state.bootstrapProof.sessionPath, proofPath);
  assert.equal(await readFile(state.notePath, "utf8"), `${exactNote}\n`);
  assert.equal(JSON.parse(await readFile(state.statePath, "utf8")).status, "running");
  assert.ok(spawnCalls.every(({ options }) => options.signal === startSignal));
  const worktreeAddIndex = spawnCalls.findIndex(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "add");
  const materializeIndex = spawnCalls.findIndex(({ command, args }) => command.endsWith("/bin/qq-openwiki-materialize") && args[0] === "freeze");
  const firstHerdrIndex = spawnCalls.findIndex(({ command }) => command === "herdr");
  assert.ok(worktreeAddIndex < materializeIndex && materializeIndex < firstHerdrIndex);
  assert.deepEqual(spawnCalls[materializeIndex].args, ["freeze", prepared.worktree]);
  assert.equal(spawnCalls[materializeIndex].options.cwd, prepared.worktree);
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
  assert.equal(herdrOps.includes("agent prompt"), false, "the private prompt must not be placed in CLI argv");
  assert.equal(herdrOps.includes("agent get"), false, "prompt verification must not spawn a Herdr CLI poll");
  const start = spawnCalls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "start");
  assert.deepEqual(start.args, [
    "agent", "start", `runner-${prepared.slug}-${prepared.nonce}`,
    "--kind", "pi", "--pane", "w2T:p9", "--", "--approve",
  ]);
  assert.equal(spawnCalls.some(({ args }) => args.some((arg) => /^(?:config|trust|--config(?:=|$)|--trust(?:=|$))/.test(arg))), false,
    "runner admission must not persist Pi trust or config state");
  assert.equal(submittedPrompts.length, 1);
  const prompt = submittedPrompts[0].prompt;
  assert.match(prompt, /^\[qq-bootstrap:/);
  assert.match(prompt, /call done with ref HEAD/);
  assert.match(prompt, /# TASK-1 — One task/);
  assert.match(prompt, /## Architect notes \/ scratch/);
  assert.ok(prompt.endsWith(exactNote));

  const droppedTask = { id: "TASK-5", title: "Dropped prompt" };
  const droppedPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: droppedTask, note: exactNote });
  const droppedCalls = [];
  let statusAtDroppedPrompt;
  let droppedSubmissions = 0;
  const droppedRun = async (command, args, options = {}) => {
    droppedCalls.push({ command, args, options });
    return spawnRun(command, args, options);
  };
  await assert.rejects(lib.startRun({
    run: droppedRun, cwd: "/repo", env, task: droppedTask, prepared: droppedPreparation,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
    async submitPrompt() {
      droppedSubmissions += 1;
      statusAtDroppedPrompt = JSON.parse(await readFile(droppedPreparation.statePath, "utf8")).status;
      throw new Error(`agent_prompt_rejected: ${exactNote}`);
    },
  }), (error) => {
    assert.match(error.message, /agent_prompt_rejected/);
    assert.doesNotMatch(error.message, new RegExp(exactNote));
    return true;
  });
  assert.equal(statusAtDroppedPrompt, "starting");
  assert.equal(droppedSubmissions, 1);
  const droppedOps = droppedCalls.map(({ command, args }) => `${command} ${args[0]} ${args[1]}`);
  assert.ok(droppedOps.indexOf("herdr agent start") < droppedOps.indexOf("herdr pane close"));
  assert.equal(droppedOps.includes("herdr agent prompt"), false);
  const droppedThawIndex = droppedCalls.findIndex(({ command, args }) => command.endsWith("/bin/qq-openwiki-materialize") && args[0] === "thaw");
  const droppedRemoveIndex = droppedCalls.findIndex(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove");
  assert.ok(droppedThawIndex >= 0 && droppedThawIndex < droppedRemoveIndex);
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
    inspectAgent: inspectAgentAt(proofPath),
    async submitPrompt(_paneId, prompt) { await writeFile(proofPath, userMessage(prompt)); },
  });
  assert.equal(existingState.pane, "w2T:p-new");
  assert.equal(existingCalls.some(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create"), false);
  assert.equal(existingCalls.some(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "rename"), false);
  const split = existingCalls.find(({ command }) => command === "qq-herdr-pane-add");
  assert.deepEqual(split.args.slice(0, 5), [
    "--pane", "w2T:p-right", "--cwd", existingPreparation.worktree, "--no-focus",
  ]);

  const coldTask = { id: "TASK-10", title: "Cold runner" };
  const coldPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: coldTask, note: exactNote });
  const coldSessionPath = join(scratch, "cold-session.jsonl");
  const coldCalls = [];
  let coldPrompt;
  let coldSubmissions = 0;
  let coldInspections = 0;
  let coldClock = 0;
  const coldRun = async (command, args, options = {}) => {
    coldCalls.push({ command, args, options });
    if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
      return { code: 0, stdout: agentInfo(args[2], coldSessionPath, "working"), stderr: "" };
    }
    return spawnRun(command, args, options);
  };
  const coldState = await lib.startRun({
    run: coldRun, cwd: "/repo", env, task: coldTask, prepared: coldPreparation,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
    async inspectAgent(paneId) {
      coldInspections += 1;
      return JSON.parse(agentInfo(paneId, coldSessionPath));
    },
    verificationTimeoutMs: 30_000, verificationIntervalMs: 6_001,
    now: () => coldClock,
    async sleep(ms) {
      assert.equal(JSON.parse(await readFile(coldPreparation.statePath, "utf8")).status, "starting");
      coldClock += ms;
      await writeFile(coldSessionPath, userMessage(coldPrompt));
    },
    async submitPrompt(_paneId, prompt) {
      coldSubmissions += 1;
      coldPrompt = prompt;
      await writeFile(coldSessionPath, `${JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: prompt }] } })}\n`);
    },
  });
  assert.equal(coldSubmissions, 1);
  assert.ok(coldClock > 5_000, "cold prompt proof should be allowed beyond Herdr's old five-second heuristic");
  assert.equal(coldInspections, 2);
  assert.equal(coldCalls.some(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "get"), false);
  assert.equal(coldState.status, "running");

  const timeoutTask = { id: "TASK-11", title: "Unproved prompt" };
  const timeoutPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: timeoutTask, note: exactNote });
  const timeoutSessionPath = join(scratch, "timeout-session.jsonl");
  const timeoutCalls = [];
  let timeoutClock = 0;
  let timeoutSubmissions = 0;
  const timeoutRun = async (command, args, options = {}) => {
    timeoutCalls.push({ command, args, options });
    if (command === "herdr" && args[0] === "agent" && args[1] === "get") {
      return { code: 0, stdout: agentInfo(args[2], timeoutSessionPath, "working"), stderr: "" };
    }
    return spawnRun(command, args, options);
  };
  await assert.rejects(lib.startRun({
    run: timeoutRun, cwd: "/repo", env, task: timeoutTask, prepared: timeoutPreparation,
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9", qaBinding: {},
    inspectAgent: inspectAgentAt(timeoutSessionPath),
    verificationTimeoutMs: 30_000, verificationIntervalMs: 10_000,
    now: () => timeoutClock,
    async sleep(ms) {
      assert.equal(JSON.parse(await readFile(timeoutPreparation.statePath, "utf8")).status, "starting");
      timeoutClock += ms;
    },
    async submitPrompt(_paneId, prompt) {
      timeoutSubmissions += 1;
      await writeFile(timeoutSessionPath, `${JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: prompt }] } })}\n`);
    },
  }), /not recorded within 30000ms/);
  assert.equal(timeoutSubmissions, 1, "timed-out prompts must not be retried");
  assert.equal(timeoutClock, 30_000);
  assert.equal(timeoutCalls.some(({ command, args }) => command === "herdr" && args[0] === "pane" && args[1] === "close"), true);
  assert.equal(timeoutCalls.some(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove"), true);
  await assert.rejects(access(timeoutPreparation.stateDir), { code: "ENOENT" });

  const nativeTask = { id: "TASK-14", title: "Native runner" };
  const nativePreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: nativeTask, note: exactNote });
  const nativeArchitect = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
  const nativeChild = "621eeb4e-3796-4d58-92d2-9a45e4f133b0";
  const nativeMessage = "1f69c7ed-19bb-4c42-9745-cf17d24d55d1";
  const nativeProfile = {
    name: "dsh-runner", provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high",
  };
  let nativeInitiator;
  const nativeBoundary = sessionContexts.createQqSessionContext({
    env,
    activeDshSession: () => nativeInitiator?.session?.id,
  });
  nativeBoundary.claimExclusive(nativeArchitect, {
    role: "architect", profile: "dsh-architect", runState: null,
  });
  const nativeAgents = new Map();
  const architectAgent = { session: { id: nativeArchitect } };
  nativeAgents.set(nativeArchitect, architectAgent);
  nativeInitiator = architectAgent;
  let parentMessage;
  let childPrompt;
  let childStarts = 0;
  let nativeChildFlushes = 0;
  let nativeChildInspections = 0;
  let nativeStartClock = 0;
  let nativeSetup;
  let retainedParent;
  const nativeCommands = [];
  const nativeCommandRun = async (command, args, options = {}) => {
    nativeCommands.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "native-base\n", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const nativeServices = {
    agents: {
      currentInitiator: () => nativeInitiator,
      get: (id) => nativeAgents.get(id),
      async create(options) {
        const parent = {
          session: { id: options.sessionId, header: { cwd: options.meta.cwd } },
          async whenIdle() {},
          followup(message) { parentMessage = message; },
        };
        options.setup?.({ on() {} });
        nativeAgents.set(options.sessionId, parent);
        return {
          agent: parent,
          async dispose() { nativeAgents.delete(options.sessionId); },
        };
      },
      async withInitiator(agent, operation) {
        const previous = nativeInitiator;
        nativeInitiator = agent;
        try { return await operation(); } finally { nativeInitiator = previous; }
      },
    },
    sessions: {
      get(id) { return nativeAgents.get(id)?.session; },
      async flush(session) {
        if (session.id !== nativeChild) return;
        assert.equal(nativeAgents.get(nativeChild)?.session, session);
        assert.equal(nativeChildInspections, 1, "the accepted marker must be observed before the live durability barrier");
        nativeChildFlushes += 1;
        return true;
      },
    },
    persistence: {
      async inspect(id) {
        if (id !== nativeChild) return {
          meta: { id },
          events: parentMessage ? [{ type: "user/message", data: parentMessage }] : [],
        };
        assert.equal(JSON.parse(await readFile(nativePreparation.statePath, "utf8")).status, "starting");
        assert.equal(nativeChildFlushes, nativeChildInspections, "the marker is re-inspected only after the live durability barrier");
        assert.ok(nativeAgents.has(nativeChild), "persistence must be inspected before the accepted child settles");
        nativeChildInspections += 1;
        return {
          meta: { id, parentSession: retainedParent?.parentId ?? [...nativeAgents.keys()].find((key) => key.startsWith("session-") && key !== nativeArchitect), cwd: nativePreparation.worktree, origin: "subagent" },
          events: [
            { type: "subagent/descriptor", data: { version: 2, mode: "continuable", provider: "spawn", label: "qq delegated runner" } },
            { type: "user/message", data: { id: nativeMessage, role: "user", content: [{ type: "text", text: childPrompt }] } },
          ],
        };
      },
    },
    subagents: {
      registerContinuableSetup(setup) { nativeSetup = setup; return () => { nativeSetup = undefined; }; },
      async startContinuable(spec) {
        childStarts += 1;
        assert.equal(spec.provider, "spawn");
        assert.equal(spec.label, "qq delegated runner");
        childPrompt = spec.request.prompt[0].text;
        const child = {
          session: { id: nativeChild, header: { parentSession: spec.request.parent.session.id } },
        };
        nativeAgents.set(nativeChild, child);
        nativeSetup({ agent: child, on() {} });
        return { childId: nativeChild, messageId: nativeMessage };
      },
      async drainContinuableDescendants() {},
    },
  };
  const nativeState = await dshRun.startDshRun({
    run: nativeCommandRun, cwd: "/repo", env, task: nativeTask, prepared: nativePreparation,
    architectSession: nativeArchitect, qaBinding: { model: "qa" }, marker: "[qq-bootstrap:task-14-native]",
    runnerProfile: nativeProfile, services: nativeServices, sessionContext: nativeBoundary,
    verificationTimeoutMs: 20, verificationIntervalMs: 10, now: () => nativeStartClock,
    async sleep(ms) { nativeStartClock += ms; },
    retainParent(owned) { retainedParent = owned; },
  });
  assert.equal(nativeState.runtime, "dsh");
  assert.equal(nativeState.status, "running");
  assert.equal(nativeState.callerSession, nativeArchitect);
  assert.equal(nativeState.bootstrapParentSession, retainedParent.parentId);
  assert.equal(nativeState.runnerSession, nativeChild);
  assert.equal(nativeState.bootstrapProof.messageId, nativeMessage);
  assert.equal(nativeState.bootstrapProof.persistence, "sessionPersistence.inspect");
  assert.equal(childStarts, 1);
  assert.equal(nativeChildFlushes, 1);
  assert.equal(nativeChildInspections, 2);
  assert.equal(nativeStartClock, 0);
  assert.ok(nativeAgents.has(nativeChild), "the accepted runner remains live after prompt verification");
  assert.match(childPrompt, /^\[qq-bootstrap:task-14-native\]/);
  assert.match(childPrompt, /# TASK-14 — Native runner/);
  assert.match(childPrompt, /do not call done/);
  assert.doesNotMatch(childPrompt, /call done with ref HEAD/);
  assert.equal(nativeCommands.some(({ command }) => command === "herdr" || command === "pi"), false);
  assert.deepEqual(nativeBoundary.resolveSession(nativeChild), {
    schema: "qq.session-context/v1", sessionId: nativeChild, role: "runner", profile: "dsh-runner",
    runState: nativePreparation.statePath, source: "dsh-session",
  });
  assert.equal((await lstat(nativePreparation.statePath)).mode & 0o077, 0);

  let absentClock = 0;
  let absentInspections = 0;
  await assert.rejects(dshRun.verifyDshPromptAcceptance({
    agents: { get: () => undefined },
    sessions: { get: () => undefined },
    persistence: { async inspect() { absentInspections += 1; return { meta: { id: nativeChild }, events: [] }; } },
  }, {
    childId: nativeChild, parentId: retainedParent.parentId, worktree: nativePreparation.worktree,
    messageId: nativeMessage, marker: "[qq-bootstrap:task-14-native]",
  }, {
    timeoutMs: 20, intervalMs: 10, now: () => absentClock,
    async sleep(ms) { absentClock += ms; },
  }), /not durable within 20ms/);
  assert.equal(absentInspections, 2);

  const absentTask = { id: "TASK-15", title: "Absent native persistence" };
  const absentPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: absentTask, note: exactNote });
  const absentChild = "c24ee08f-0824-4dfa-b123-d2f04bcec9d7";
  let absentSetup;
  let absentParentId;
  let absentStarts = 0;
  let absentStartClock = 0;
  const absentServices = {
    ...nativeServices,
    persistence: {
      async inspect(id) {
        if (id !== absentChild) return {
          meta: { id }, events: parentMessage ? [{ type: "user/message", data: parentMessage }] : [],
        };
        assert.equal(JSON.parse(await readFile(absentPreparation.statePath, "utf8")).status, "starting");
        return {
          meta: { id, parentSession: absentParentId, cwd: absentPreparation.worktree, origin: "subagent" },
          events: [{ type: "subagent/descriptor", data: {
            version: 2, mode: "continuable", provider: "spawn", label: "qq delegated runner",
          } }],
        };
      },
    },
    subagents: {
      registerContinuableSetup(setup) { absentSetup = setup; return () => { absentSetup = undefined; }; },
      async startContinuable(spec) {
        absentStarts += 1;
        absentParentId = spec.request.parent.session.id;
        absentSetup({
          agent: { session: { id: absentChild, header: { parentSession: absentParentId } } },
          on() {},
        });
        return { childId: absentChild, messageId: "802a1a1d-f0c6-49cf-96f5-bc5cf8977720" };
      },
      async drainContinuableDescendants() {},
    },
  };
  const absentCommandIndex = nativeCommands.length;
  await assert.rejects(dshRun.startDshRun({
    run: nativeCommandRun, cwd: "/repo", env, task: absentTask, prepared: absentPreparation,
    architectSession: nativeArchitect, qaBinding: {}, marker: "[qq-bootstrap:task-15-absent]",
    runnerProfile: nativeProfile, services: absentServices, sessionContext: nativeBoundary,
    verificationTimeoutMs: 20, verificationIntervalMs: 10, now: () => absentStartClock,
    async sleep(ms) { absentStartClock += ms; },
  }), (error) => {
    assert.match(error.message, /not durable within 20ms/);
    assert.doesNotMatch(error.message, new RegExp(exactNote));
    return true;
  });
  assert.equal(absentStarts, 1, "durability failure must not reinject the private prompt");
  assert.equal(absentStartClock, 20);
  assert.equal(nativeBoundary.resolveSession(absentChild).source, "pi-environment");
  await assert.rejects(access(absentPreparation.stateDir), { code: "ENOENT" });
  const absentCommands = nativeCommands.slice(absentCommandIndex);
  assert.equal(absentCommands.some(({ command, args }) => command === "git" && args[0] === "worktree" && args[1] === "remove"), true);
  assert.equal(absentCommands.some(({ command, args }) => command === "git" && args[0] === "branch" && args[1] === "-D"), true);

  const refusedTask = { id: "TASK-16", title: "Refused native model" };
  const refusedPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: refusedTask, note: exactNote });
  const refusedServices = {
    ...nativeServices,
    agents: {
      ...nativeServices.agents,
      async create() { throw new Error(`raw model refusal ${exactNote}`); },
    },
  };
  await assert.rejects(dshRun.startDshRun({
    run: nativeCommandRun, cwd: "/repo", env, task: refusedTask, prepared: refusedPreparation,
    architectSession: nativeArchitect, qaBinding: {}, marker: "[qq-bootstrap:task-16-refused]",
    runnerProfile: nativeProfile, services: refusedServices, sessionContext: nativeBoundary,
  }), (error) => {
    assert.match(error.message, /bootstrap parent was refused/);
    assert.doesNotMatch(error.message, new RegExp(exactNote));
    assert.doesNotMatch(error.message, /raw model refusal/);
    return true;
  });
  await assert.rejects(access(refusedPreparation.stateDir), { code: "ENOENT" });

  await assert.rejects(dshRun.startDshRun({
    run: async () => assert.fail("wrong architect must fail before workspace creation"),
    cwd: "/repo", env, task: nativeTask, prepared: nativePreparation,
    architectSession: "session-a5dd905c-fe41-4d3e-bda6-52f227c40267", qaBinding: {},
    marker: "[qq-bootstrap:wrong-architect]", runnerProfile: nativeProfile,
    services: nativeServices, sessionContext: nativeBoundary,
  }), /exact owned architect session/);

  const cancelledNative = new AbortController();
  cancelledNative.abort();
  await assert.rejects(dshRun.verifyDshPromptAcceptance({
    agents: { get: () => undefined }, sessions: { get: () => undefined },
    persistence: { async inspect() { assert.fail("cancelled verification must not inspect"); } },
  }, {
    childId: nativeChild, parentId: retainedParent.parentId, worktree: nativePreparation.worktree,
    messageId: nativeMessage, marker: "[qq-bootstrap:task-14-native]",
  }, { signal: cancelledNative.signal }), /cancelled/);

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

  const persistenceTask = { id: "TASK-11", title: "Persistence rollback" };
  const persistencePreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: persistenceTask, note: exactNote });
  const persistenceRequest = await lib.prepareBootstrapRequest({
    cwd: "/repo", env, task: persistenceTask, prepared: persistencePreparation, qaBinding: {},
    architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a8",
  });
  let persistenceBoardRollback = false;
  let persistenceFailureOutcome;
  let persistenceFailureNotification;
  const persistenceEnv = { ...env, TEST_API_TOKEN: "persistence-credential" };
  await assert.rejects(bootstrap.bootstrapRun(async () => ({ code: 0, stdout: "", stderr: "" }), persistenceRequest.bootstrapPath, {
    env: persistenceEnv,
    async sleep() {},
    async startRun() { throw new Error(`agent refused ${exactNote} persistence-credential`); },
    async setBoardStatus(_run, cwd, id, status) {
      assert.deepEqual({ cwd, id, status }, { cwd: "/repo", id: persistenceTask.id, status: "To Do" });
      persistenceBoardRollback = true;
    },
    async persistBootstrapFailure() {
      await access(persistencePreparation.stateDir);
      throw new Error(`cannot persist ${exactNote}`);
    },
    async sendRunEvent(outcome, kind) {
      assert.equal(kind, runEvents.RUN_BOOTSTRAP_FAILED_KIND);
      await assert.rejects(access(persistencePreparation.stateDir), { code: "ENOENT" });
      persistenceFailureOutcome = outcome;
    },
    async notify(taskId, reason) {
      assert.equal(taskId, persistenceTask.id);
      await assert.rejects(access(persistencePreparation.stateDir), { code: "ENOENT" });
      persistenceFailureNotification = reason;
    },
  }), (error) => {
    assert.match(error.message, /notification persistence failed/);
    assert.doesNotMatch(error.message, new RegExp(exactNote));
    assert.doesNotMatch(error.message, /persistence-credential/);
    return true;
  });
  assert.equal(persistenceBoardRollback, true, "board rollback must survive failure-outbox persistence failure");
  assert.match(persistenceFailureOutcome.bootstrapFailureReason, /notification persistence failed/);
  assert.equal(persistenceFailureNotification, persistenceFailureOutcome.bootstrapFailureReason);
  assert.doesNotMatch(JSON.stringify(persistenceFailureOutcome), new RegExp(exactNote));
  assert.doesNotMatch(JSON.stringify(persistenceFailureOutcome), /persistence-credential/);
  await Promise.all([
    persistencePreparation.stateDir, persistenceRequest.bootstrapPath, persistencePreparation.ticketPath,
    persistencePreparation.notePath, persistencePreparation.gatePath, persistencePreparation.statePath,
  ].map((path) => assert.rejects(access(path), { code: "ENOENT" })));

  const workerTask = { id: "TASK-12", title: "Worker rollback" };
  const workerPreparation = await lib.prepareRun({ cwd: "/repo", env, project: "qq", task: workerTask, note: exactNote });
  const dshArchitectSession = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
  const workerRequest = await lib.prepareBootstrapRequest({
    cwd: "/repo", env, task: workerTask, prepared: workerPreparation, qaBinding: {},
    architectSession: dshArchitectSession,
  });
  let boardAttempts = 0;
  let eventAttempts = 0;
  let outboxPersistedBeforeCleanup = false;
  let notificationBody;
  const failurePayloads = [];
  const workerEnv = { ...env, TEST_API_TOKEN: "credential-secret" };
  await assert.rejects(bootstrap.bootstrapRun(async () => ({ code: 0, stdout: "", stderr: "" }), workerRequest.bootstrapPath, {
    env: workerEnv,
    now: () => new Date("2026-08-15T20:00:00.000Z"),
    async sleep() {},
    async startRun(options) {
      assert.equal(options.signal, undefined, "detached worker must not inherit the architect turn signal");
      throw new Error(`agent refused ${exactNote} credential-secret`);
    },
    async setBoardStatus(_run, cwd, id, status) {
      boardAttempts += 1;
      assert.deepEqual({ cwd, id, status }, { cwd: "/repo", id: workerTask.id, status: "To Do" });
      await access(workerPreparation.stateDir);
      if (boardAttempts === 1) throw new Error("temporary board failure");
    },
    async persistBootstrapFailure(outcome, options) {
      await access(workerPreparation.stateDir);
      outboxPersistedBeforeCleanup = true;
      return bootstrap.persistBootstrapFailure(outcome, options);
    },
    async sendRunEvent(outcome, kind) {
      eventAttempts += 1;
      assert.equal(kind, runEvents.RUN_BOOTSTRAP_FAILED_KIND);
      await assert.rejects(access(workerPreparation.stateDir), { code: "ENOENT" });
      failurePayloads.push(runEvents.runEventPayload(outcome, kind));
      throw new Error("qq-relay unavailable");
    },
    async notify(taskId, reason) {
      await assert.rejects(access(workerPreparation.stateDir), { code: "ENOENT" });
      assert.equal(taskId, workerTask.id);
      assert.doesNotMatch(reason, new RegExp(exactNote));
      assert.doesNotMatch(reason, /credential-secret/);
      notificationBody = `${taskId}: bootstrap failed`;
    },
  }), (error) => {
    assert.doesNotMatch(error.message, new RegExp(exactNote));
    assert.doesNotMatch(error.message, /credential-secret/);
    return true;
  });
  assert.equal(boardAttempts, 2, "idempotent board rollback should retry once");
  assert.equal(eventAttempts, 2, "bootstrap may attempt immediate idempotent delivery twice");
  assert.equal(outboxPersistedBeforeCleanup, true);
  assert.deepEqual(failurePayloads[0], failurePayloads[1]);
  assert.equal(failurePayloads[1].architect_session, dshArchitectSession, "the bootstrap failure producer changed the DSH architect address");
  assert.equal(failurePayloads[1].bootstrap.task_returned, true);
  assert.doesNotMatch(JSON.stringify(failurePayloads[1]), new RegExp(exactNote));
  assert.doesNotMatch(JSON.stringify(failurePayloads[1]), /credential-secret/);
  assert.equal(notificationBody, `${workerTask.id}: bootstrap failed`);
  const outboxRoot = bootstrap.bootstrapFailureOutboxRoot(workerEnv);
  const pendingOutbox = await readdir(outboxRoot);
  assert.equal(pendingOutbox.length, 1, "sustained qq-relay unavailability must leave a durable failure outbox entry");
  assert.equal((await lstat(outboxRoot)).mode & 0o077, 0);
  assert.equal((await lstat(join(outboxRoot, pendingOutbox[0]))).mode & 0o077, 0);
  let drainedEvents = 0;
  assert.deepEqual(await bootstrap.retryBootstrapFailureOutbox("019ff7ad-2cba-75a9-adc2-c15a0a92d6aa", {
    env: workerEnv,
    async sendRunEvent() { drainedEvents += 1; },
  }), { attempted: 0, delivered: 0 }, "another architect must not drain this failure");
  assert.deepEqual(await bootstrap.retryBootstrapFailureOutbox(workerRequest.architectSession, {
    env: workerEnv,
    async sendRunEvent(outcome, kind) {
      drainedEvents += 1;
      failurePayloads.push(runEvents.runEventPayload(outcome, kind));
    },
  }), { attempted: 1, delivered: 1 });
  assert.equal(drainedEvents, 1);
  assert.deepEqual(failurePayloads[2], failurePayloads[1]);
  assert.deepEqual(await readdir(outboxRoot), []);
  const failureDelivery = {
    record: {
      event_id: "evt_bootstrap", product_id: "qq", kind: runEvents.RUN_BOOTSTRAP_FAILED_KIND,
      producer_id: "qq/start-worker", origin_id: "qq/start-worker",
      recipient_id: runEvents.runEventRecipient(workerRequest.architectSession), envelope: { payload: failurePayloads[1] },
    },
  };
  const parsedFailure = runEvents.parseRunEvent(failureDelivery, workerRequest.architectSession);
  assert.equal(parsedFailure.payload.architect_session, dshArchitectSession, "the bootstrap failure parser changed the DSH architect address");
  const failureMessage = reviewFlow.runOutcomeMessage(parsedFailure);
  assert.equal(failureMessage.customType, "qq-run-bootstrap-failed");
  assert.match(failureMessage.content, /TASK-12/);
  assert.match(failureMessage.content, /returned to To Do/);
  assert.equal(failureMessage.details.event_id, "evt_bootstrap");

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

  const fakeChild = new EventEmitter();
  fakeChild.pid = 4241;
  fakeChild.kill = () => {};
  fakeChild.disconnect = () => {};
  fakeChild.unref = () => {};
  let fakeSpawn;
  let launchSettled = false;
  const launchAccepted = extension.detachedBootstrapWorker("/private/bootstrap.json", env, {
    timeoutMs: 1_000,
    spawn(command, args, options) {
      fakeSpawn = { command, args, options };
      return fakeChild;
    },
  });
  launchAccepted.then(() => { launchSettled = true; });
  await new Promise((accept) => setImmediate(accept));
  assert.equal(launchSettled, false, "a bare spawn must not be reported as an accepted worker");
  assert.equal(fakeSpawn.options.detached, true);
  assert.deepEqual(fakeSpawn.options.stdio, ["ignore", "ignore", "ignore", "ipc"]);
  assert.equal(fakeSpawn.args.at(-1), "/private/bootstrap.json");
  assert.doesNotMatch(JSON.stringify(fakeSpawn.args), new RegExp(exactNote));
  fakeChild.emit("message", { type: "qq-bootstrap-accepted" });
  assert.equal(await launchAccepted, 4241);

  const approvalOrder = [];
  const approvalStatuses = [];
  const approvalSignal = new AbortController().signal;
  const approvedPreparation = { taskId: task.id, stateDir: "/private/gate", notePath: "/private/gate/note.md", gatePath: "/private/gate/gate.md" };
  let detachedWorkPending = true;
  const approvedTool = delegateHarness({
    run: backlogRun(approvalStatuses, approvalOrder),
    async makeNote() { approvalOrder.push("scribe"); assert.deepEqual(approvalStatuses, ["In Progress"]); return { note: exactNote, qaBinding: { model: "qa" } }; },
    async prepareRun(options) { approvalOrder.push("prepare"); assert.equal(options.note, exactNote); assert.deepEqual(approvalStatuses, ["In Progress"]); return approvedPreparation; },
    async awaitBriefGate(options) { approvalOrder.push("gate"); assert.equal(options.prepared, approvedPreparation); assert.equal(options.signal, approvalSignal); assert.deepEqual(approvalStatuses, ["In Progress"]); return "approved"; },
    async prepareBootstrapRequest(options) {
      approvalOrder.push("bootstrap");
      assert.equal(options.prepared, approvedPreparation);
      assert.equal(options.signal, approvalSignal);
      return { bootstrapPath: "/private/gate/bootstrap.json" };
    },
    launchBootstrap(path) {
      approvalOrder.push("launch");
      assert.equal(path, "/private/gate/bootstrap.json");
      void new Promise(() => {}).finally(() => { detachedWorkPending = false; });
      return 4242;
    },
    async discardRun() { approvalOrder.push("discard"); },
  });
  const approved = await approvedTool.execute("approve", { id: task.id }, approvalSignal, undefined, ctx);
  assert.deepEqual(approvalOrder, ["status:In Progress", "scribe", "prepare", "gate", "bootstrap", "launch"]);
  assert.deepEqual(approvalStatuses, ["In Progress"]);
  assert.equal(detachedWorkPending, true, "delegate must not await detached bootstrap work");
  assert.equal(approved.content[0].text, `Approved ${task.id}; runner starting.`);
  assert.equal(approved.details.worker_pid, 4242);
  assert.equal(approved.content[0].text.includes("\n"), false);
  assert.doesNotMatch(JSON.stringify(approved), new RegExp(exactNote));

  const nativeArchitectSession = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
  const nativeSessionContext = {
    observeSelection() {},
    resolve() {
      return {
        schema: "qq.session-context/v1", sessionId: nativeArchitectSession,
        role: "architect", profile: "dsh-architect", runState: null, source: "dsh-session",
      };
    },
  };
  const nativeOrder = [];
  let piFallbackLaunched = false;
  const nativeTool = delegateHarness({
    sessionContext: nativeSessionContext,
    run: backlogRun([], nativeOrder),
    async makeNote() { nativeOrder.push("scribe"); return { note: exactNote, qaBinding: { model: "qa" } }; },
    async prepareRun() { nativeOrder.push("prepare"); return approvedPreparation; },
    async awaitBriefGate() { nativeOrder.push("gate"); return "approved"; },
    async readExecutionPolicy() {
      nativeOrder.push("profile");
      return {
        roles: { runner: { default: "dsh-runner", profiles: {
          "dsh-runner": { provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high" },
        } } },
      };
    },
    async prepareBootstrapRequest(options) {
      nativeOrder.push("bootstrap");
      assert.deepEqual(options.runnerProfile, {
        name: "dsh-runner", provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high",
      });
      assert.equal(options.architectSession, nativeArchitectSession);
      return { bootstrapPath: "/private/gate/bootstrap.json" };
    },
    async launchNativeBootstrap(path, options) {
      nativeOrder.push("native-launch");
      assert.equal(path, "/private/gate/bootstrap.json");
      assert.equal(options.architectSession, nativeArchitectSession);
      return {
        bootstrapParentSession: "session-1bfba388-5ac3-492a-a578-a4e05a32d790",
        runnerSession: "621eeb4e-3796-4d58-92d2-9a45e4f133b0",
      };
    },
    launchBootstrap() { piFallbackLaunched = true; },
  });
  const nativeCtx = { ...ctx, sessionManager: { getSessionId: () => nativeArchitectSession } };
  const nativeApproved = await nativeTool.execute("native-approve", { id: task.id }, undefined, undefined, nativeCtx);
  assert.deepEqual(nativeOrder, ["status:In Progress", "scribe", "prepare", "gate", "profile", "bootstrap", "native-launch"]);
  assert.equal(piFallbackLaunched, false);
  assert.equal(nativeApproved.content[0].text, `Approved ${task.id}; native runner started.`);
  assert.equal(nativeApproved.details.status, "running");
  assert.equal(nativeApproved.details.runner_session, "621eeb4e-3796-4d58-92d2-9a45e4f133b0");
  assert.doesNotMatch(JSON.stringify(nativeApproved), new RegExp(exactNote));

  const unavailableStatuses = [];
  let unavailableDiscarded = false;
  const unavailableNativeTool = delegateHarness({
    sessionContext: nativeSessionContext,
    run: backlogRun(unavailableStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async readExecutionPolicy() {
      return { roles: { runner: { default: "dsh-runner", profiles: {
        "dsh-runner": { provider: "deepseek-official", model: "deepseek-v4-flash", effort: "high" },
      } } } };
    },
    async prepareBootstrapRequest() { return { bootstrapPath: "/private/gate/bootstrap.json" }; },
    async discardRun() { unavailableDiscarded = true; },
  });
  const unavailableNative = await unavailableNativeTool.execute("native-unavailable", { id: task.id }, undefined, undefined, nativeCtx);
  assert.match(unavailableNative.content[0].text, /native DSH launch adapter is unavailable/);
  assert.deepEqual(unavailableStatuses, ["In Progress", "To Do"]);
  assert.equal(unavailableDiscarded, true);

  const cancelOrder = [];
  const cancelStatuses = [];
  let cancelStarted = false;
  const cancelledTool = delegateHarness({
    run: backlogRun(cancelStatuses, cancelOrder),
    async makeNote() { cancelOrder.push("scribe"); return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { cancelOrder.push("prepare"); return approvedPreparation; },
    async awaitBriefGate() { cancelOrder.push("gate"); assert.deepEqual(cancelStatuses, ["In Progress"]); return "cancelled"; },
    async discardRun() { cancelOrder.push("discard"); },
    async launchBootstrap() { cancelStarted = true; },
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
    async prepareBootstrapRequest() { return { bootstrapPath: "/private/gate/bootstrap.json" }; },
    async launchBootstrap() { throw new Error(`start failed: ${exactNote}`); },
    async discardRun() { rollbackDiscarded = true; },
  });
  const rolledBack = await rollbackTool.execute("start-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(rolledBack.content[0].text, /runs operation failed/);
  assert.doesNotMatch(JSON.stringify(rolledBack), new RegExp(exactNote));
  assert.deepEqual(rollbackStatuses, ["In Progress", "To Do"]);
  assert.equal(rollbackDiscarded, true);

  const malformedBootstrapPath = join(scratch, "malformed-bootstrap.json");
  await writeFile(malformedBootstrapPath, "not json\n", { mode: 0o600 });
  const readFailureStatuses = [];
  let readFailureDiscarded = false;
  const readFailureTool = delegateHarness({
    run: backlogRun(readFailureStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async prepareBootstrapRequest() { return { bootstrapPath: malformedBootstrapPath }; },
    launchBootstrap(path) { return extension.detachedBootstrapWorker(path, env, { timeoutMs: 2_000 }); },
    async discardRun() { readFailureDiscarded = true; },
  });
  const readFailure = await readFailureTool.execute("read-failure", { id: task.id }, undefined, undefined, ctx);
  assert.match(readFailure.content[0].text, /could not read its private request|exited before accepting its request/);
  assert.deepEqual(readFailureStatuses, ["In Progress", "To Do"]);
  assert.equal(readFailureDiscarded, true, "the delegating architect retains rollback ownership until request acceptance");

  const abortStatuses = [];
  let abortDiscarded = false;
  let abortLaunched = false;
  const abortController = new AbortController();
  const abortTool = delegateHarness({
    run: backlogRun(abortStatuses),
    async makeNote() { return { note: exactNote, qaBinding: {} }; },
    async prepareRun() { return approvedPreparation; },
    async awaitBriefGate() { return "approved"; },
    async prepareBootstrapRequest() {
      abortController.abort(new Error("operator aborted"));
      return { bootstrapPath: "/private/gate/bootstrap.json" };
    },
    launchBootstrap() { abortLaunched = true; },
    async discardRun() { abortDiscarded = true; },
  });
  const aborted = await abortTool.execute("abort", { id: task.id }, abortController.signal, undefined, ctx);
  assert.match(aborted.content[0].text, /operator aborted/);
  assert.equal(abortLaunched, false);
  assert.equal(abortDiscarded, true);
  assert.deepEqual(abortStatuses, ["In Progress", "To Do"]);

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
      async prepareBootstrapRequest({ task: admittedTask }) {
        calls.starts.push(admittedTask.id);
        return { bootstrapPath: `/private/${admittedTask.id}/bootstrap.json` };
      },
      launchBootstrap() { return 99; },
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
  assert.equal(firstOverlapResult.content[0].text, "Approved TASK-6; runner starting.");
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
    "Approved TASK-8; runner starting.", "Approved TASK-9; runner starting.",
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
