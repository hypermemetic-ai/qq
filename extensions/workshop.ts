// @ts-nocheck
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";
import { awaitBriefGate, discardWorkshop, formatTicket, prepareWorkshop, spawnWorkshop } from "../bin/lib/workshop.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(QQ_ROOT, "node_modules", ".bin", "backlog");

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

export default function registerWorkshop(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  let role = env.QQ_AGENT_ROLE || "runner";
  pi.events.on("qq:role-selected", (selection) => { if (selection?.role) role = selection.role; });

  pi.registerTool({
    name: "sketch", label: "Sketch", promptSnippet: "Create one small board sketch",
    description: "Create a task on this repository's board. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string", minLength: 1 }, note: { type: "string" } } },
    async execute(_id, params, signal, _update, ctx) {
      if (role !== "architect") return result("sketch is available only in an architect session.");
      const args = ["task", "create", params.title, "--plain"];
      if (params.note) args.push("--notes", params.note);
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
      if (role !== "architect") return result("note is available only in an architect session.");
      const execution = await run(BACKLOG, ["task", "edit", params.id, "--append-notes", params.text, "--plain"], { cwd: ctx.cwd, signal });
      if (execution?.code !== 0) return result(`note refused: ${commandReason(execution, "Backlog failed")}`);
      return result(`Noted ${params.id}.`, { task_id: params.id });
    },
  });

  pi.registerTool({
    name: "delegate", label: "Delegate", promptSnippet: "Prepare a note, obtain operator approval, and spawn one aligned task",
    description: "Prepare a note for one To Do ticket, wait for approval or cancellation in an operator-owned Glow pane, then create an isolated worktree and start a messaging-enabled runner if approved. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
    async execute(_id, params, signal, _update, ctx) {
      if (role !== "architect") return result("delegate is available only in an architect session.");
      let claimedTask;
      let prepared;
      let outboundNote;
      try {
        const task = await taskView(run, ctx.cwd, params.id, signal);
        if (task.status !== "To Do") return result(`delegate refused: ${task.id} is ${task.status}, not To Do.`, { task_id: task.id });
        const { note, transcript, qaBinding } = await (deps.makeNote ?? makeNote)(ctx, task, deps);
        outboundNote = note;
        const project = env.QQ_AGENT_PROJECT || basename(resolve(ctx.cwd));
        prepared = await (deps.prepareWorkshop ?? prepareWorkshop)({ cwd: ctx.cwd, env, project, task, note, transcript });
        const decision = await (deps.awaitBriefGate ?? awaitBriefGate)({
          run, env, prepared, signal,
          pluginRoot: deps.briefGatePluginPath ?? join(QQ_ROOT, "plugins", "brief-gate"),
        });
        if (decision === "cancelled") {
          await (deps.discardWorkshop ?? discardWorkshop)(prepared);
          prepared = undefined;
          return result(`Cancelled ${task.id}; runner not started.`, { status: "cancelled", task_id: task.id });
        }

        const moved = await run(BACKLOG, ["task", "edit", task.id, "--status", "In Progress", "--plain"], { cwd: ctx.cwd, signal });
        if (moved?.code !== 0) throw new Error(`cannot align ${task.id}: ${commandReason(moved, "Backlog failed")}`);
        claimedTask = task.id;
        await (deps.spawnWorkshop ?? spawnWorkshop)({
          run, cwd: ctx.cwd, env, task, prepared, qaBinding, project,
          architectSession: ctx.sessionManager.getSessionId(),
        });
        prepared = undefined;
        return result(`Approved ${task.id}; runner started.`, { status: "approved", task_id: task.id });
      } catch (error) {
        if (claimedTask) await run(BACKLOG, ["task", "edit", claimedTask, "--status", "To Do", "--plain"], { cwd: ctx.cwd }).catch(() => {});
        if (prepared) {
          try { await (deps.discardWorkshop ?? discardWorkshop)(prepared); } catch {}
        }
        const message = error instanceof Error ? error.message : String(error);
        const safeMessage = outboundNote && message.includes(outboundNote) ? "runs operation failed" : message;
        return result(`delegate refused: ${safeMessage}`, { status: "refused" });
      }
    },
  });
}
