// @ts-nocheck
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";
import { awaitBriefGate, discardWorkshop, prepareWorkshop, spawnWorkshop } from "../bin/lib/workshop.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(QQ_ROOT, "node_modules", ".bin", "backlog");

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

function fileOperations(messages) {
  const read = new Set();
  const modified = new Set();
  for (const message of messages) {
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

export async function makeBrief(ctx, task, deps = {}) {
  const policy = await readExecutionPolicy(deps.policyPath);
  const prompt = await readFile(deps.briefPromptPath ?? join(QQ_ROOT, "prompts", "services", "brief.md"), "utf8");
  const model = ctx.modelRegistry.find(policy.compactor.provider, policy.compactor.model);
  if (!model) throw new Error(`compactor model is unavailable: ${policy.compactor.provider}/${policy.compactor.model}`);
  const messages = ctx.sessionManager.buildSessionContext().messages;
  const helpers = deps.messageHelpers ?? await import("@earendil-works/pi-coding-agent");
  const conversation = helpers.serializeConversation(helpers.convertToLlm(messages));
  const files = fileOperations(messages);
  const fileText = [
    files.read.length ? `Read files:\n${files.read.map((path) => `- ${path}`).join("\n")}` : "",
    files.modified.length ? `Modified files:\n${files.modified.map((path) => `- ${path}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const userMessage = {
    role: "user",
    content: [{ type: "text", text: `Task ${task.id}: ${task.title}\n\n${task.description ?? ""}\n\n<conversation>\n${conversation}\n</conversation>${fileText ? `\n\n${fileText}` : ""}` }],
    timestamp: Date.now(),
  };
  const response = await ctx.modelRegistry.complete(
    model,
    { systemPrompt: prompt.trim(), messages: [userMessage] },
    { reasoning: policy.compactor.effort, cacheRetention: "none", sessionId: randomUUID(), signal: ctx.signal },
  );
  if (response.stopReason === "aborted") throw new Error("brief generation was cancelled");
  const brief = response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
  if (!brief) throw new Error("compactor returned an empty brief");
  return { brief, qaBinding: policy.qa };
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
    name: "delegate", label: "Delegate", promptSnippet: "Brief, obtain operator approval, and spawn one aligned task",
    description: "Brief one To Do task, wait for approval or cancellation in an operator-owned Glow pane, then create an isolated worktree and start a messaging-enabled runner if approved. Architect sessions only.",
    parameters: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
    async execute(_id, params, signal, _update, ctx) {
      if (role !== "architect") return result("delegate is available only in an architect session.");
      let claimedTask;
      let prepared;
      let outboundBrief;
      try {
        const task = await taskView(run, ctx.cwd, params.id, signal);
        if (task.status !== "To Do") return result(`delegate refused: ${task.id} is ${task.status}, not To Do.`, { task_id: task.id });
        const { brief, qaBinding } = await (deps.makeBrief ?? makeBrief)(ctx, task, deps);
        outboundBrief = brief;
        const project = env.QQ_AGENT_PROJECT || basename(resolve(ctx.cwd));
        prepared = await (deps.prepareWorkshop ?? prepareWorkshop)({ cwd: ctx.cwd, env, project, task, brief });
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
        const safeMessage = outboundBrief && message.includes(outboundBrief) ? "workshop operation failed" : message;
        return result(`delegate refused: ${safeMessage}`, { status: "refused" });
      }
    },
  });
}
