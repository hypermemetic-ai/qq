// @ts-nocheck
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicPrivateJson, readHandoff } from "../bin/lib/workshop.mjs";
import { formatPack, listProposals, prepareDone, projectFromCwd } from "../bin/lib/review.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function result(message, details = {}) {
  return { content: [{ type: "text", text: message }], details: { ...details, message } };
}

function detachedWorker(path, statePath, env) {
  const child = spawn(process.execPath, [path, statePath], { cwd: QQ_ROOT, env, detached: true, stdio: "ignore" });
  child.unref();
  return child.pid;
}

function commandReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

export default function registerReviewFlow(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const launchReview = deps.launchReview ?? ((statePath) => detachedWorker(join(QQ_ROOT, "bin", "qq-review-worker.mjs"), statePath, { ...process.env, ...env }));
  let role = env.QQ_AGENT_ROLE || "runner";
  let currentContext;
  let timer;
  let showing = false;
  const shown = new Set();

  pi.registerTool({
    name: "done", label: "Done", promptSnippet: "Submit the delegated ref to independent qa and stop",
    description: "Final runner call for delegated work. Validates a clean committed ref, starts the pinned two-look qa service asynchronously, and stops this run. It never merges.",
    parameters: { type: "object", additionalProperties: false, required: ["ref"], properties: { ref: { type: "string", minLength: 1 } } },
    async execute(_id, params, signal, _update, ctx) {
      const statePath = env.QQ_WORKSHOP_STATE;
      if (role !== "runner" || !statePath) return result("done is available only to a delegated workshop runner.", { status: "refused" });
      try {
        const state = await prepareDone(run, ctx.cwd, statePath, params.ref);
        const pid = await launchReview(statePath);
        const message = `Submitted ${state.task.id} to qa look ${state.look}. The runner is finished; stop now.`;
        setTimeout(() => { try { ctx.abort?.(); } catch {} }, 25).unref?.();
        return result(message, { status: "reviewing", look: state.look, worker_pid: pid, state_path: statePath });
      } catch (error) {
        return result(`done refused: ${error instanceof Error ? error.message : String(error)}`, { status: "refused" });
      }
    },
  });

  async function land(state, ctx) {
    const common = await run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: state.mainRoot });
    if (common?.code !== 0) throw new Error(commandReason(common, "cannot find the main git directory"));
    const lockPath = join(common.stdout.trim(), "qq-land.lock");
    const execution = await run("flock", [lockPath, process.execPath, join(QQ_ROOT, "bin", "qq-land-worker.mjs"), state.statePath], { cwd: state.mainRoot });
    if (execution?.code !== 0) throw new Error(commandReason(execution, "land failed"));
    ctx.ui.notify(`Landed ${state.task.id}.`, "info");
  }

  async function offer(state, ctx) {
    const key = `${state.id}:${state.updatedAt}`;
    if (shown.has(key) || showing || role !== "architect" || !ctx.hasUI || ctx.isIdle?.() === false) return;
    showing = true;
    shown.add(key);
    try {
      const pack = formatPack(state.pack ?? { summary: state.blockedReason || "qa blocked", files: [] });
      const choices = state.status === "proposal" ? ["approve", "comment", "later"] : ["comment", "later"];
      const choice = await ctx.ui.select(pack, choices);
      if (choice === "approve") {
        await land(state, ctx);
      } else if (choice === "comment") {
        const comment = await ctx.ui.input("Operator comment");
        if (!comment) return;
        state.status = "commented";
        state.operatorComment = comment;
        state.updatedAt = new Date().toISOString();
        await atomicPrivateJson(state.statePath, state);
        pi.sendMessage({ customType: "qq-operator-comment", content: `${comment}\n\n${pack}`, display: true, details: { task: state.task.id } }, { triggerTurn: true, deliverAs: "steer" });
      }
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      showing = false;
    }
  }

  async function poll() {
    const ctx = currentContext;
    if (!ctx || role !== "architect") return;
    const project = projectFromCwd(ctx.cwd, env);
    for (const state of await listProposals(project, env)) await offer(state, ctx);
  }

  pi.events.on("qq:role-selected", (selection) => {
    if (!selection?.role) return;
    role = selection.role;
    if (role === "architect") void poll();
  });
  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    timer = setInterval(() => { void poll(); }, 2_000);
    timer.unref?.();
    await poll();
  });
  pi.on("agent_settled", async () => { await poll(); });
  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    currentContext = undefined;
    showing = false;
  });
}
