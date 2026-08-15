// @ts-nocheck
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EventPlaneClient } from "../bin/lib/event-plane-client.ts";
import { atomicPrivateJson, readHandoff, stateHome } from "../bin/lib/run.mjs";
import { formatPack, isFailedLand, isQaPassedProposal, listProposals, prepareDone, projectFromCwd, setBoardStatus } from "../bin/lib/review.mjs";
import { RUN_BLOCKED_KIND, parseRunEvent, runEventDeliveryGuard, runEventEndpoint, runEventRecipient } from "../bin/lib/run-events.mjs";

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

function runOutcomeMessage(event) {
  const payload = event.payload;
  if (event.kind === RUN_BLOCKED_KIND) {
    return {
      customType: "qq-run-blocked",
      content: [
        `QA blocked ${payload.task.id} after look ${payload.review.look} — ${payload.task.title}`,
        `Ref: ${payload.review.ref}`,
        `At: ${payload.review.blocked_at}`,
        `Reason: ${payload.review.reason}`,
        "",
        formatPack({ summary: payload.review.summary, files: payload.review.files }),
      ].join("\n"),
      display: true,
      details: { ...payload, event_id: event.eventId },
    };
  }
  return {
    customType: "qq-run-landed",
    content: [
      `Landed ${payload.task.id} — ${payload.task.title}`,
      `Ref: ${payload.landing.ref}`,
      `Target: ${payload.landing.target_branch}`,
      `At: ${payload.landing.landed_at}`,
      "",
      formatPack({ summary: payload.landing.summary, files: payload.landing.files }),
    ].join("\n"),
    display: true,
    details: { ...payload, event_id: event.eventId },
  };
}

export default function registerReviewFlow(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const launchReview = deps.launchReview ?? ((statePath) => detachedWorker(join(QQ_ROOT, "bin", "qq-review-worker.mjs"), statePath, { ...process.env, ...env }));
  const eventClient = deps.eventClient ?? new EventPlaneClient(join(stateHome(env), "qq", "event-plane", "event-plane.sock"));
  const sleep = deps.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let role = env.QQ_AGENT_ROLE || "runner";
  let currentContext;
  let timer;
  let receiverActive = false;
  let receiverEpoch = 0;
  let showing = false;
  const shown = new Set();

  pi.registerTool({
    name: "done", label: "Done", promptSnippet: "Submit the delegated ref to independent qa and stop",
    description: "Final runner call for delegated work. Validates a clean committed ref, hands this pane to the pinned two-look qa service, and stops this run. It never merges.",
    parameters: { type: "object", additionalProperties: false, required: ["ref"], properties: { ref: { type: "string", minLength: 1 } } },
    async execute(_id, params, signal, _update, ctx) {
      const statePath = env.QQ_RUN_STATE;
      if (role !== "runner" || !statePath) return result("done is available only to a delegated runs runner.", { status: "refused" });
      try {
        const state = await prepareDone(run, ctx.cwd, statePath, params.ref);
        const pid = await launchReview(statePath);
        const message = `Submitted ${state.task.id} to qa look ${state.look}. The runner is finished; stop now.`;
        setTimeout(() => { try { ctx.shutdown?.(); } catch { try { ctx.abort?.(); } catch {} } }, 25).unref?.();
        return result(message, { status: "reviewing", look: state.look, worker_pid: pid, state_path: statePath });
      } catch (error) {
        return result(`done refused: ${error instanceof Error ? error.message : String(error)}`, { status: "refused" });
      }
    },
  });

  async function land(state) {
    const common = await run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: state.mainRoot });
    if (common?.code !== 0) throw new Error(commandReason(common, "cannot find the main git directory"));
    const lockPath = join(common.stdout.trim(), "qq-land.lock");
    const execution = await run("flock", [lockPath, process.execPath, join(QQ_ROOT, "bin", "qq-land-worker.mjs"), state.statePath], { cwd: state.mainRoot });
    if (execution?.code !== 0) throw new Error(commandReason(execution, "land failed"));
    const landed = await readHandoff(state.statePath);
    if (landed.status !== "landed") throw new Error("land worker completed without recording a landed handoff");
  }

  function ownsHandoff(state, ctx) {
    const sessionId = ctx.sessionManager?.getSessionId?.();
    return typeof sessionId === "string" && sessionId.length > 0 && sessionId === state.architectSession;
  }

  function offerKey(state) {
    return isFailedLand(state) ? `${state.id}:land:${state.blockedReason}` : `${state.id}:${state.updatedAt}`;
  }

  async function offer(state, ctx) {
    const key = offerKey(state);
    if (showing || role !== "architect" || !ctx.hasUI || !ownsHandoff(state, ctx)) return;
    if (shown.has(key) || ctx.isIdle?.() === false) return;
    showing = true;
    shown.add(key);
    let choice;
    try {
      const pack = formatPack(state.pack ?? { summary: state.blockedReason || "qa blocked", files: [] });
      const choices = isQaPassedProposal(state) ? ["approve", "discuss", "later"] : ["discuss", "later"];
      choice = await ctx.ui.select(pack, choices);
      if (choice === "approve") {
        await land(state);
      } else if (choice === "discuss") {
        const comment = await ctx.ui.input("Operator discuss note");
        if (!comment) return;
        if (state.status === "proposal") state.status = "commented";
        state.operatorComment = comment;
        state.updatedAt = new Date().toISOString();
        await atomicPrivateJson(state.statePath, state);
        shown.add(offerKey(state));
        await setBoardStatus(run, ctx.cwd || state.mainRoot, state.task.id, "To Do");
        pi.sendMessage({
          customType: "qq-operator-comment",
          content: `${state.task.id} discuss:\n${comment}\n\n${pack}`,
          display: true,
          details: { task: state.task.id },
        }, { triggerTurn: true, deliverAs: "steer" });
      } else if (choice === "later") {
        state.status = "later";
        state.updatedAt = new Date().toISOString();
        await atomicPrivateJson(state.statePath, state);
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
    for (const state of await listProposals(project, env)) {
      if (!ownsHandoff(state, ctx) || (state.status === "blocked" && !isFailedLand(state))) continue;
      await offer(state, ctx);
    }
  }

  async function receiveRunEvent(delivery, sessionId, localEpoch) {
    const guard = runEventDeliveryGuard(delivery);
    const event = parseRunEvent(delivery, sessionId);
    if (!event) {
      await eventClient.block({ ...guard, reason: "unsupported qq run outcome" });
      return;
    }
    if (!receiverActive || localEpoch !== receiverEpoch || !currentContext) return;
    const options = currentContext.isIdle?.() === false
      ? { triggerTurn: true, deliverAs: "steer" }
      : { triggerTurn: true };
    await pi.sendMessage(runOutcomeMessage(event), options);
    await eventClient.acknowledge(guard);
  }

  async function receiveRunEvents(sessionId, localEpoch) {
    const endpoint = runEventEndpoint();
    while (receiverActive && localEpoch === receiverEpoch) {
      try {
        const next = await eventClient.next({
          consumer_type: "recipient",
          consumer_id: runEventRecipient(sessionId),
          generation: 0,
          endpoint_token: endpoint,
          wait_ms: 30_000,
        });
        if (next?.delivery) await receiveRunEvent(next.delivery, sessionId, localEpoch);
      } catch {
        if (receiverActive && localEpoch === receiverEpoch) await sleep(500);
      }
    }
  }

  function startRunEventReceiver() {
    if (receiverActive || role !== "architect" || !currentContext) return;
    const sessionId = currentContext.sessionManager?.getSessionId?.();
    if (typeof sessionId !== "string" || sessionId.length === 0) return;
    receiverActive = true;
    receiverEpoch += 1;
    void receiveRunEvents(sessionId, receiverEpoch);
  }

  function stopRunEventReceiver() {
    receiverActive = false;
    receiverEpoch += 1;
  }

  pi.events.on("qq:role-selected", (selection) => {
    if (!selection?.role) return;
    role = selection.role;
    if (role === "architect") {
      startRunEventReceiver();
      void poll();
    } else {
      stopRunEventReceiver();
    }
  });
  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    timer = setInterval(() => { void poll(); }, 2_000);
    timer.unref?.();
    startRunEventReceiver();
    await poll();
  });
  pi.on("agent_settled", async () => { await poll(); });
  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    stopRunEventReceiver();
    currentContext = undefined;
    showing = false;
  });
}
