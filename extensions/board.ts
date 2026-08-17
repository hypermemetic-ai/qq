// @ts-nocheck
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";
import { createQqSessionContext } from "../bin/lib/session-context.mjs";
import { collectLiveWorktreeDiffs, findExistingBrief, withAdmissionLock } from "../bin/lib/admission.mjs";
import { awaitBriefGate, discardRun, formatNoteTake, formatTicket, prepareBootstrapRequest, prepareRun } from "../bin/lib/run.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(QQ_ROOT, "node_modules", ".bin", "backlog");

export function detachedBootstrapWorker(requestPath, env, options = {}) {
  const spawnProcess = options.spawn ?? spawn;
  const timeoutMs = options.timeoutMs ?? 5_000;
  return new Promise((accept, reject) => {
    const child = spawnProcess(process.execPath, [join(QQ_ROOT, "bin", "qq-start-worker.mjs"), requestPath], {
      cwd: QQ_ROOT, env: { ...process.env, ...env }, detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("runner bootstrap worker did not accept its request")), timeoutMs);
    timer.unref?.();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners?.();
      if (error) {
        try { child.kill?.(); } catch {}
        try { child.disconnect?.(); } catch {}
        child.unref?.();
        reject(error);
      } else {
        try { child.disconnect?.(); } catch {}
        child.unref?.();
        accept(child.pid);
      }
    };
    child.once("error", () => finish(new Error("cannot launch runner bootstrap worker")));
    child.once("exit", () => finish(new Error("runner bootstrap worker exited before accepting its request")));
    child.on("message", (message) => {
      if (message?.type === "qq-bootstrap-accepted") finish();
      else if (message?.type === "qq-bootstrap-rejected") finish(new Error("runner bootstrap worker could not read its private request"));
    });
  });
}

export { formatTicket };

function result(message, details = {}) {
  return { content: [{ type: "text", text: message }], details: { ...details, message } };
}

function commandReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

async function taskView(run, cwd, id, signal) {
  const execution = await run(BACKLOG, ["task", "view", id, "--json"], { cwd, signal });
  if (execution?.code !== 0) throw new Error(commandReason(execution, `task ${id} is unavailable`));
  let value;
  try { value = JSON.parse(execution.stdout); } catch { throw new Error("Backlog returned malformed task JSON"); }
  if (!value?.task?.id || !value?.task?.title || !value?.task?.status) throw new Error("Backlog returned an incomplete task");
  return value.task;
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text).join("\n");
}

function latestOperatorTurnEntries(branch, limit = 100) {
  if (!Array.isArray(branch)) return [];
  const operatorTurns = [];
  for (let index = 0; index < branch.length; index += 1) {
    if (branch[index]?.type === "message" && branch[index].message?.role === "user") operatorTurns.push(index);
  }
  if (operatorTurns.length === 0) return [];
  return branch.slice(operatorTurns[Math.max(0, operatorTurns.length - limit)]);
}

export function serializeTranscript(branch, limit = 100) {
  const parts = [];
  for (const entry of latestOperatorTurnEntries(branch, limit)) {
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (message?.role === "user") {
      const text = textContent(message.content);
      if (text) parts.push(`[User]: ${text}`);
      continue;
    }
    if (message?.role !== "assistant") continue;
    const text = textContent(message.content);
    if (text) parts.push(`[Assistant]: ${text}`);
    const tools = Array.isArray(message.content)
      ? message.content.filter((block) => block?.type === "toolCall" && typeof block.name === "string").map((block) => block.name)
      : [];
    if (tools.length) parts.push(`[Assistant tools]: ${tools.join(", ")}`);
  }
  return parts.join("\n\n");
}

function fileOperations(entries) {
  const read = new Set();
  const modified = new Set();
  for (const entry of entries) {
    const message = entry?.type === "message" ? entry.message : entry;
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type !== "toolCall" || typeof block.arguments?.path !== "string") continue;
      if (block.name === "read") read.add(block.arguments.path);
      if (block.name === "edit" || block.name === "write") modified.add(block.arguments.path);
    }
  }
  return {
    read: [...read].filter((path) => !modified.has(path)).sort(),
    modified: [...modified].sort(),
  };
}

function oneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

export function parseAdmissionDecision(source) {
  const text = source.trim();
  let value;
  try { value = JSON.parse(text); } catch {
    if (/^clear$/i.test(text)) return { decision: "clear" };
    const bounce = /^bounce:\s*(.+)$/i.exec(text);
    if (bounce) return { decision: "bounce", reason: oneLine(bounce[1]) };
    throw new Error("admission vet returned a malformed decision");
  }
  if (value?.decision === "clear" && Object.keys(value).length === 1) return { decision: "clear" };
  if (value?.decision === "bounce" && typeof value.reason === "string" && oneLine(value.reason)) {
    return { decision: "bounce", reason: oneLine(value.reason) };
  }
  throw new Error("admission vet returned a malformed decision");
}

function admissionTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    description: task.description ?? null,
    dependencies: task.dependencies ?? [],
    implementationPlan: task.implementationPlan ?? null,
    implementationNotes: task.implementationNotes ?? null,
    acceptanceCriteria: task.acceptanceCriteria ?? [],
    definitionOfDone: task.definitionOfDone ?? [],
    comments: task.comments ?? [],
  };
}

export function formatAdmissionEvidence({ incoming, tasks, worktrees, existingBrief }) {
  return [
    "Incoming ticket:",
    JSON.stringify(admissionTask(incoming), null, 2),
    existingBrief ? `Existing brief for the incoming ticket:\n${existingBrief}` : "Existing brief for the incoming ticket: none",
    "Current To Do and In Progress tickets:",
    JSON.stringify(tasks.map(admissionTask), null, 2),
    "Live worktree diffs since each worktree's common base with main HEAD (an empty files array means no live diff):",
    JSON.stringify(worktrees, null, 2),
  ].join("\n\n");
}

async function taskList(run, cwd, status, signal) {
  const execution = await run(BACKLOG, ["task", "list", "--status", status, "--json"], { cwd, signal });
  if (execution?.code !== 0) throw new Error(commandReason(execution, `cannot list ${status} tasks`));
  let value;
  try { value = JSON.parse(execution.stdout); } catch { throw new Error("Backlog returned a malformed task list"); }
  if (!Array.isArray(value?.tasks) || value.tasks.some((task) => typeof task?.id !== "string")) {
    throw new Error("Backlog returned a malformed task list");
  }
  return value.tasks;
}

async function admissionTasks(run, cwd, incoming, signal) {
  const summaries = [
    ...await taskList(run, cwd, "To Do", signal),
    ...await taskList(run, cwd, "In Progress", signal),
  ];
  const found = new Map([[incoming.id, incoming]]);
  for (const { id } of summaries) {
    if (!found.has(id)) found.set(id, await taskView(run, cwd, id, signal));
  }
  return [...found.values()];
}

export async function makeAdmissionDecision(ctx, evidence, deps = {}) {
  const policy = await readExecutionPolicy(deps.policyPath);
  const prompt = await readFile(deps.admissionPromptPath ?? join(QQ_ROOT, "prompts", "services", "admission-vet.md"), "utf8");
  const model = ctx.modelRegistry.find(policy.scribe.provider, policy.scribe.model);
  if (!model) throw new Error(`admission vet model is unavailable: ${policy.scribe.provider}/${policy.scribe.model}`);
  const response = await ctx.modelRegistry.complete(
    model,
    { systemPrompt: prompt.trim(), messages: [{ role: "user", content: [{ type: "text", text: evidence }], timestamp: Date.now() }] },
    { reasoning: "low", cacheRetention: "none", sessionId: randomUUID(), signal: ctx.signal },
  );
  if (response.stopReason === "aborted") throw new Error("admission vet was cancelled");
  const source = response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
  return parseAdmissionDecision(source);
}

export async function admitDelegate(ctx, id, options = {}) {
  const { run, env = process.env, signal, deps = {} } = options;
  const project = env.QQ_AGENT_PROJECT || basename(resolve(ctx.cwd));
  return (deps.withAdmissionLock ?? withAdmissionLock)({ run, cwd: ctx.cwd, signal }, async ({ commonDir }) => {
    const incoming = await taskView(run, ctx.cwd, id, signal);
    if (incoming.status !== "To Do") return { kind: "refused", task: incoming };
    const tasks = await admissionTasks(run, ctx.cwd, incoming, signal);
    const worktrees = await (deps.collectLiveWorktreeDiffs ?? collectLiveWorktreeDiffs)({ run, cwd: ctx.cwd, signal });
    const existingBrief = await (deps.findExistingBrief ?? findExistingBrief)({ taskId: incoming.id, project, env });
    const evidence = formatAdmissionEvidence({ incoming, tasks, worktrees, existingBrief });
    const decision = await (deps.makeAdmissionDecision ?? makeAdmissionDecision)(ctx, evidence, deps);
    if (decision.decision === "bounce") return { kind: "bounced", task: incoming, reason: decision.reason };

    const current = await taskView(run, ctx.cwd, id, signal);
    if (current.status !== "To Do") return { kind: "refused", task: current };
    const moved = await run(BACKLOG, ["task", "edit", current.id, "--status", "In Progress", "--plain"], { cwd: ctx.cwd, signal });
    if (moved?.code !== 0) throw new Error(`cannot claim ${current.id}: ${commandReason(moved, "Backlog failed")}`);
    return { kind: "claimed", task: current, project, commonDir };
  });
}

const glowTails = new Map();

export async function withGlowTurn(key, action) {
  const previous = glowTails.get(key) ?? Promise.resolve();
  let release;
  const held = new Promise((resolveHeld) => { release = resolveHeld; });
  const tail = previous.then(() => held);
  glowTails.set(key, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (glowTails.get(key) === tail) glowTails.delete(key);
  }
}

export async function makeNote(ctx, task, deps = {}) {
  const policy = await readExecutionPolicy(deps.policyPath);
  const prompt = await readFile(deps.scribePromptPath ?? join(QQ_ROOT, "prompts", "services", "scribe.md"), "utf8");
  const model = ctx.modelRegistry.find(policy.scribe.provider, policy.scribe.model);
  if (!model) throw new Error(`scribe model is unavailable: ${policy.scribe.provider}/${policy.scribe.model}`);
  const entries = latestOperatorTurnEntries(ctx.sessionManager.getBranch());
  const transcript = serializeTranscript(entries);
  const files = fileOperations(entries);
  const fileText = [
    files.read.length ? `Read files:\n${files.read.map((path) => `- ${path}`).join("\n")}` : "",
    files.modified.length ? `Modified files:\n${files.modified.map((path) => `- ${path}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const attachments = [
    `Attached ticket (ticket.md):\n\n${formatTicket(task)}`,
    `Attached architect transcript (transcript.md):\n\n${transcript}`,
    fileText,
  ].filter(Boolean).join("\n\n");
  const userMessage = {
    role: "user",
    content: [{ type: "text", text: attachments }],
    timestamp: Date.now(),
  };
  const response = await ctx.modelRegistry.complete(
    model,
    { systemPrompt: prompt.trim(), messages: [userMessage] },
    { reasoning: policy.scribe.effort, cacheRetention: "none", sessionId: randomUUID(), signal: ctx.signal },
  );
  if (response.stopReason === "aborted") throw new Error("note generation was cancelled");
  const note = response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
  if (!note) throw new Error("scribe returned an empty note");
  return { note, transcript, qaBinding: policy.qa };
}

export default function registerBoard(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const now = deps.now ?? (() => new Date());
  const sessionContext = deps.sessionContext ?? createQqSessionContext({ env });
  pi.events.on("qq:role-selected", (selection) => { sessionContext.observeSelection(selection); });

  pi.registerTool({
    name: "sketch", label: "Sketch", promptSnippet: "Create one small board sketch",
    description: "Create a task on this repository's board. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string", minLength: 1 }, note: { type: "string" } } },
    async execute(_id, params, signal, _update, ctx) {
      if (sessionContext.resolve(ctx).role !== "architect") return result("sketch is available only in an architect session.");
      const args = ["task", "create", params.title, "--plain"];
      if (params.note) args.push("--notes", formatNoteTake(params.note, now()));
      const execution = await run(BACKLOG, args, { cwd: ctx.cwd, signal });
      if (execution?.code !== 0) return result(`sketch refused: ${commandReason(execution, "Backlog failed")}`);
      const id = execution.stdout.match(/Task ([A-Za-z]+-[0-9.]+)/)?.[1];
      return result(id ? `Sketched ${id}: ${params.title}` : `Sketched: ${params.title}`, { task_id: id ?? "" });
    },
  });

  pi.registerTool({
    name: "note", label: "Note", promptSnippet: "Append a note to one board item",
    description: "Append implementation notes to an existing task. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string", minLength: 1 } } },
    async execute(_id, params, signal, _update, ctx) {
      if (sessionContext.resolve(ctx).role !== "architect") return result("note is available only in an architect session.");
      const execution = await run(BACKLOG, ["task", "edit", params.id, "--append-notes", formatNoteTake(params.text, now()), "--plain"], { cwd: ctx.cwd, signal });
      if (execution?.code !== 0) return result(`note refused: ${commandReason(execution, "Backlog failed")}`);
      return result(`Noted ${params.id}.`, { task_id: params.id });
    },
  });

  pi.registerTool({
    name: "delegate", label: "Delegate", promptSnippet: "Vet and claim one aligned task, then prepare its note and approval gate",
    description: "Vet one To Do ticket against active work, bounce conflicts in chat, or claim it; then prepare its note, wait for approval or cancellation in an operator-owned Glow pane, and start an isolated messaging-enabled runner if approved. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
    async execute(_id, params, signal, _update, ctx) {
      if (sessionContext.resolve(ctx).role !== "architect") return result("delegate is available only in an architect session.");
      let claimedTask;
      let prepared;
      let outboundNote;
      try {
        const operationSignal = signal ?? ctx.signal;
        const operationCtx = { ...ctx, signal: operationSignal };
        const admission = await (deps.admitDelegate ?? admitDelegate)(operationCtx, params.id, { run, env, signal: operationSignal, deps });
        const task = admission?.task;
        if (admission?.kind === "refused") {
          return result(`delegate refused: ${task.id} is ${task.status}, not To Do.`, { task_id: task.id });
        }
        if (admission?.kind === "bounced") {
          return result(`Bounced ${task.id}: ${oneLine(admission.reason)}`, { status: "bounced", task_id: task.id });
        }
        if (admission?.kind !== "claimed" || !task?.id) throw new Error("delegate admission returned a malformed claim");
        claimedTask = task.id;
        const project = admission.project || env.QQ_AGENT_PROJECT || basename(resolve(ctx.cwd));

        const { note, transcript, qaBinding } = await (deps.makeNote ?? makeNote)(operationCtx, task, deps);
        outboundNote = note;
        prepared = await (deps.prepareRun ?? prepareRun)({ cwd: ctx.cwd, env, project, task, note, transcript });
        const decision = await (deps.withGlowTurn ?? withGlowTurn)(admission.commonDir || project, () => (deps.awaitBriefGate ?? awaitBriefGate)({
          run, env, prepared, signal: operationSignal,
          pluginRoot: deps.briefGatePluginPath ?? join(QQ_ROOT, "plugins", "brief-gate"),
        }));
        if (decision === "cancelled") {
          const returned = await run(BACKLOG, ["task", "edit", task.id, "--status", "To Do", "--plain"], { cwd: ctx.cwd, signal });
          if (returned?.code !== 0) throw new Error(`cannot return ${task.id} to To Do: ${commandReason(returned, "Backlog failed")}`);
          claimedTask = undefined;
          await (deps.discardRun ?? discardRun)(prepared);
          prepared = undefined;
          return result(`Cancelled ${task.id}; runner not started.`, { status: "cancelled", task_id: task.id });
        }

        const bootstrap = await (deps.prepareBootstrapRequest ?? prepareBootstrapRequest)({
          cwd: ctx.cwd, env, task, prepared, qaBinding, project, signal: operationSignal,
          architectSession: ctx.sessionManager.getSessionId(),
        });
        if (operationSignal?.aborted) throw operationSignal.reason ?? new Error("delegation was cancelled");
        const workerPid = await (deps.launchBootstrap ?? ((path) => detachedBootstrapWorker(path, env)))(bootstrap.bootstrapPath);
        claimedTask = undefined;
        prepared = undefined;
        return result(`Approved ${task.id}; runner starting.`, { status: "starting", task_id: task.id, worker_pid: workerPid });
      } catch (error) {
        if (claimedTask) await run(BACKLOG, ["task", "edit", claimedTask, "--status", "To Do", "--plain"], { cwd: ctx.cwd }).catch(() => {});
        if (prepared) {
          try { await (deps.discardRun ?? discardRun)(prepared); } catch {}
        }
        const message = error instanceof Error ? error.message : String(error);
        const safeMessage = outboundNote && message.includes(outboundNote) ? "runs operation failed" : message;
        return result(`delegate refused: ${safeMessage}`, { status: "refused" });
      }
    },
  });
}
