// @ts-nocheck
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";

import { retryBootstrapFailureOutbox } from "../bin/lib/bootstrap.mjs";
import { RelayClient } from "../bin/lib/qq-relay-client.mjs";
import { atomicPrivateJson, readHandoff, stateHome } from "../bin/lib/run.mjs";
import { createQqSessionContext } from "../bin/lib/session-context.mjs";
import { compilePacket, formatPack, formatPacket, isFailedLand, isQaPassedProposal, listProposals, prepareDone, projectFromCwd, routePacket } from "../bin/lib/review.mjs";
import { RUN_BLOCKED_KIND, RUN_BOOTSTRAP_FAILED_KIND, parseRunEvent, runEventDeliveryGuard, runEventEndpoint, runEventRecipient } from "../bin/lib/run-events.mjs";

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

async function completeFromContext(ctx, { system, user }) {
  if (typeof ctx.modelRegistry?.find !== "function" || typeof ctx.modelRegistry?.complete !== "function") return "";
  try {
    const policy = await readExecutionPolicy();
    const model = ctx.modelRegistry.find(policy.scribe.provider, policy.scribe.model);
    if (!model) return "";
    const response = await ctx.modelRegistry.complete(
      model,
      { systemPrompt: system, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] },
      { reasoning: "low", cacheRetention: "none", sessionId: randomUUID(), signal: ctx.signal },
    );
    return (response?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
  } catch {
    return "";
  }
}

export function runOutcomeMessage(event) {
  const payload = event.payload;
  if (event.kind === RUN_BOOTSTRAP_FAILED_KIND) {
    return {
      customType: "qq-run-bootstrap-failed",
      content: [
        `Runner start failed for ${payload.task.id} — ${payload.task.title}`,
        `At: ${payload.bootstrap.failed_at}`,
        `Reason: ${payload.bootstrap.reason}`,
        payload.bootstrap.task_returned ? "The task was returned to To Do." : "The task could not be returned automatically; operator action is required.",
      ].join("\n"),
      display: true,
      details: { ...payload, event_id: event.eventId },
    };
  }
  if (event.kind === RUN_BLOCKED_KIND) {
    const pack = formatPack({ summary: payload.review.summary, files: payload.review.files });
    return {
      customType: "qq-run-blocked",
      content: [
        `QA blocked ${payload.task.id} after look ${payload.review.look} — ${payload.task.title}`,
        `Ref: ${payload.review.ref}`,
        `At: ${payload.review.blocked_at}`,
        `Reason: ${payload.review.reason}`,
        "",
        payload.packet ? formatPacket(payload.packet) : pack,
      ].join("\n"),
      display: true,
      details: { ...payload, event_id: event.eventId },
    };
  }
  const pack = formatPack({ summary: payload.landing.summary, files: payload.landing.files });
  return {
    customType: "qq-run-landed",
    content: [
      `Landed ${payload.task.id} — ${payload.task.title}`,
      `Ref: ${payload.landing.ref}`,
      `Target: ${payload.landing.target_branch}`,
      `At: ${payload.landing.landed_at}`,
      "",
      payload.packet ? formatPacket(payload.packet) : pack,
    ].join("\n"),
    display: true,
    details: { ...payload, event_id: event.eventId },
  };
}

export default function registerReviewFlow(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const launchReview = deps.launchReview ?? ((statePath) => detachedWorker(join(QQ_ROOT, "bin", "qq-review-worker.mjs"), statePath, { ...process.env, ...env }));
  const eventClient = deps.eventClient ?? new RelayClient(join(stateHome(env), "qq-relay", "qq-relay.sock"));
  const retryBootstrapFailures = deps.retryBootstrapFailureOutbox ?? retryBootstrapFailureOutbox;
  const finishRun = deps.prepareDone ?? prepareDone;
  const buildPacket = deps.compilePacket ?? compilePacket;
  const stampRoute = deps.routePacket ?? routePacket;
  const sleep = deps.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const sessionContext = deps.sessionContext ?? createQqSessionContext({ env });
  let currentContext;
  let timer;
  let receiverActive = false;
  let receiverEpoch = 0;
  let showing = false;
  let retryingBootstrapFailures = false;
  const shown = new Set();
  const injectedRunEvents = new Set();

  pi.registerTool({
    name: "done", label: "Done", promptSnippet: "Submit the delegated ref and stop",
    description: "Final runner call for delegated work. Validates a clean committed ref. Compiles the sniff packet and routes review or land. Pi/Herdr hands the pane to pinned two-look QA when route stamps review; native DSH records an awaiting-native-review handoff without starting QA. Route-stamped land merges, then relays the packet. It never merges from the runner process except through the land worker.",
    parameters: { type: "object", additionalProperties: false, required: ["ref"], properties: { ref: { type: "string", minLength: 1 } } },
    async execute(_id, params, signal, _update, ctx) {
      const qqContext = sessionContext.resolve(ctx);
      const statePath = qqContext.runState;
      if (qqContext.role !== "runner" || !statePath) return result("done is available only to a delegated runs runner.", { status: "refused" });
      try {
        const state = await finishRun(run, ctx.cwd, statePath, params.ref, { callerContext: qqContext });
        if (state.runtime === "dsh") {
          const message = `Submitted ${state.task.id}; it is awaiting native review. No QA look was started; stop now.`;
          return result(message, {
            status: "submitted", runtime: "dsh", awaiting: "native-review",
            ref: state.ref, runner_session: state.runnerSession, state_path: statePath,
          });
        }
        if (state.look === 1) {
          const packet = await buildPacket(run, state);
          const mark = await stampRoute(packet, {
            complete: deps.complete ?? ((request) => completeFromContext(ctx, request)),
          });
          packet.mark = mark;
          state.packet = packet;
          state.pack = { summary: mark === "land" ? "land" : state.pack?.summary ?? "review", files: packet.files };
          await atomicPrivateJson(statePath, state);
          if (mark === "land") {
            await land(state);
            const landed = await readHandoff(statePath);
            const message = `Landed ${landed.task.id}. The packet was relayed for sniff. The runner is finished; stop now.`;
            setTimeout(() => { try { ctx.shutdown?.(); } catch { try { ctx.abort?.(); } catch {} } }, 25).unref?.();
            return result(message, { status: "landed", mark, ref: landed.ref, state_path: statePath });
          }
        }
        const pid = await launchReview(statePath);
        const message = `Submitted ${state.task.id} to qa look ${state.look}. The runner is finished; stop now.`;
        setTimeout(() => { try { ctx.shutdown?.(); } catch { try { ctx.abort?.(); } catch {} } }, 25).unref?.();
        return result(message, { status: "reviewing", look: state.look, mark: state.packet?.mark ?? "review", worker_pid: pid, state_path: statePath });
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
    if (showing || sessionContext.resolve(ctx).role !== "architect" || !ctx.hasUI || !ownsHandoff(state, ctx)) return;
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
    if (!ctx || sessionContext.resolve(ctx).role !== "architect") return;
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (!retryingBootstrapFailures && typeof sessionId === "string" && sessionId.length > 0) {
      retryingBootstrapFailures = true;
      void retryBootstrapFailures(sessionId, { env, client: eventClient })
        .catch(() => {})
        .finally(() => { retryingBootstrapFailures = false; });
    }
    const project = projectFromCwd(ctx.cwd, env);
    for (const state of await listProposals(project, env)) {
      if (!ownsHandoff(state, ctx) || (state.status === "blocked" && !isFailedLand(state))) continue;
      await offer(state, ctx);
    }
  }

  function runEventReceiptExists(message) {
    let entries;
    try { entries = currentContext?.sessionManager?.getEntries?.(); }
    catch { return false; }
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (entry?.type === "custom_message") {
        return entry.customType === message.customType
          && entry.details?.event_id === message.details?.event_id;
      }
      const blocks = entry?.message?.content;
      return entry?.type === "message"
        && entry.message?.role === "user"
        && Array.isArray(blocks)
        && blocks.length === 1
        && blocks[0]?.type === "text"
        && blocks[0]?.text === message.content;
    });
  }

  async function receiveRunEvent(delivery, sessionId, localEpoch) {
    const guard = runEventDeliveryGuard(delivery);
    const event = parseRunEvent(delivery, sessionId);
    if (!event) {
      await eventClient.block({ ...guard, reason: "unsupported qq run outcome" });
      return;
    }
    const message = runOutcomeMessage(event);
    if (runEventReceiptExists(message)) {
      await eventClient.acknowledge(guard);
      injectedRunEvents.delete(event.eventId);
      return;
    }
    if (injectedRunEvents.has(event.eventId)) {
      await eventClient.retry({ ...guard, reason: "durable session entry not yet observable" });
      return;
    }
    if (!receiverActive || localEpoch !== receiverEpoch || !currentContext) return;
    injectedRunEvents.add(event.eventId);
    const options = currentContext.isIdle?.() === false
      ? { triggerTurn: true, deliverAs: "steer" }
      : { triggerTurn: true };
    try {
      await pi.sendMessage(message, options);
    } catch (error) {
      injectedRunEvents.delete(event.eventId);
      throw error;
    }
    if (runEventReceiptExists(message)) {
      await eventClient.acknowledge(guard);
      injectedRunEvents.delete(event.eventId);
    } else {
      await eventClient.retry({ ...guard, reason: "durable session entry not yet observable" });
    }
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
    if (receiverActive || !currentContext || sessionContext.resolve(currentContext).role !== "architect") return;
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
    sessionContext.observeSelection(selection);
    const currentSessionId = currentContext ? sessionContext.activeSessionId(currentContext) : undefined;
    if (selection.sessionId && currentSessionId && selection.sessionId !== currentSessionId) return;
    if (selection.role === "architect") {
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
