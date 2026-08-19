import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

import {
  DSH_RUN_APPROVAL_SCHEMA,
  atomicPrivateJson,
  cleanupRunWorkspace,
  createRunWorkspace,
  formatRunnerPrompt,
} from "./run.mjs";

const ACCEPTANCE_TIMEOUT_MS = 30_000;
const BOOTSTRAP_PARENT_ANCHOR = "qq native delegation bootstrap parent";
const CONTINUABLE_LABEL = "qq delegated runner";

class NativeRunError extends Error {}

function textOf(message) {
  return message?.content
    ?.filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("") ?? "";
}

function userMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text })]),
    source: Object.freeze({ kind: "user" }),
  });
}

function exactMarkerMessage(event, messageId, marker) {
  return event?.type === "user/message" && event.data?.id === messageId &&
    textOf(event.data).split(/\r?\n/).includes(marker);
}

function verifyPersistedRunner(inspection, expected) {
  if (inspection?.meta?.id !== expected.childId || inspection.meta.parentSession !== expected.parentId ||
      inspection.meta.cwd !== expected.worktree || inspection.meta.origin !== "subagent") return false;
  const descriptor = inspection.events?.find((event) => event?.type === "subagent/descriptor");
  if (descriptor?.data?.version !== 2 || descriptor.data.mode !== "continuable" ||
      descriptor.data.provider !== "spawn" || descriptor.data.label !== CONTINUABLE_LABEL) return false;
  return inspection.events.some((event) => exactMarkerMessage(event, expected.messageId, expected.marker));
}

export async function verifyDshPromptAcceptance(services, expected, options = {}) {
  const timeoutMs = options.timeoutMs ?? ACCEPTANCE_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? 100;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let lastReason = "the accepted marker is not durable";
  while (now() < deadline) {
    if (options.signal?.aborted) throw new NativeRunError("native DSH runner verification was cancelled");
    let inspection;
    try {
      inspection = await services.persistence.inspect(expected.childId, options.signal);
    } catch {
      lastReason = "durable runner history is unavailable";
    }
    if (verifyPersistedRunner(inspection, expected)) {
      const liveSession = services.sessions.get(expected.childId) ??
        services.agents.get(expected.childId)?.session;
      if (!liveSession) return inspection;
      let flushed = false;
      let flushFailed = false;
      try { flushed = await services.sessions.flush(liveSession); }
      catch {
        flushFailed = true;
        lastReason = "live runner durability checkpoint is unavailable";
      }
      if (flushed) {
        try {
          const durable = await services.persistence.inspect(expected.childId, options.signal);
          if (verifyPersistedRunner(durable, expected)) return durable;
          lastReason = "the accepted marker is not durable";
        } catch {
          lastReason = "durable runner history is unavailable";
        }
      } else if (!flushFailed) {
        lastReason = "live runner durability checkpoint did not participate";
      }
    } else if (inspection) {
      lastReason = "the accepted marker is not durable";
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw new NativeRunError(`native DSH runner prompt acceptance was not durable within ${timeoutMs}ms: ${lastReason}`);
}

function installModelSelection(agentCtx, selection) {
  let assembled;
  agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
    const result = await next();
    assembled = selection;
    return {
      ...result,
      variables: { ...result.variables, provider: selection.provider, model: selection.model },
    };
  });
  agentCtx.on("agent/request", async (_payload, next) => {
    const result = await next();
    if (!assembled) return result;
    const { reasoningEffort: _inherited, ...request } = result;
    return {
      ...request,
      provider: assembled.provider,
      model: assembled.model,
      reasoningEffort: assembled.effort,
    };
  });
}

async function serviceCall(action, failure) {
  try { return await action(); } catch { throw new NativeRunError(failure); }
}

function contextForParent(profile) {
  return { role: "runner", profile: profile.name, runState: null };
}

function contextForChild(profile, statePath) {
  return { role: "runner", profile: profile.name, runState: statePath };
}

export async function startDshRun(options) {
  const {
    run, cwd, env = process.env, task, prepared, architectSession, qaBinding, marker,
    services, sessionContext, signal,
  } = options;
  if (typeof run !== "function" || !services?.agents || !services?.sessions ||
      !services?.persistence || !services?.subagents || !sessionContext) {
    throw new NativeRunError("native DSH launch services are unavailable");
  }
  const caller = services.agents.currentInitiator();
  const callerContext = sessionContext.resolveSession(architectSession);
  if (caller?.session?.id !== architectSession || services.agents.get(architectSession) !== caller ||
      callerContext.source !== "dsh-session" || callerContext.role !== "architect") {
    throw new NativeRunError("native DSH launch requires the exact owned architect session");
  }
  const approval = options.approval;
  if (!approval || approval.schema !== DSH_RUN_APPROVAL_SCHEMA || approval.runtime !== "dsh" ||
      approval.status !== "approved" || approval.runId !== `${prepared.slug}-${prepared.nonce}` ||
      approval.taskId !== task?.id || approval.architectSession !== architectSession ||
      typeof approval.approvedAt !== "string" || Number.isNaN(Date.parse(approval.approvedAt))) {
    throw new NativeRunError("native DSH launch requires a durable approved gate record");
  }
  const profile = options.runnerProfile;
  if (!profile || typeof profile.name !== "string" || typeof profile.provider !== "string" ||
      typeof profile.model !== "string" || typeof profile.effort !== "string") {
    throw new NativeRunError("native DSH launch requires an explicit runner execution profile");
  }
  if (!new Set(["off", "high", "max"]).has(profile.effort)) {
    throw new NativeRunError(`native DSH launch cannot honor runner effort ${profile.effort}`);
  }

  const {
    project, slug, nonce, stateDir, statePath, ticketPath, transcriptPath, notePath, gatePath,
  } = prepared;
  let workspace;
  let parentHandle;
  let parentId;
  let childId;
  let parentClaimed = false;
  let childClaimed = false;
  let unregisterSetup;
  let runnerTicket = "";
  let prompt = "";
  const parentContext = contextForParent(profile);
  const childContext = contextForChild(profile, statePath);
  try {
    runnerTicket = await readFile(ticketPath, "utf8");
    workspace = await createRunWorkspace(run, cwd, prepared, { env, signal });

    parentId = `session-${randomUUID()}`;
    sessionContext.claimExclusive(parentId, parentContext);
    parentClaimed = true;
    parentHandle = await serviceCall(() => services.agents.create({
      sessionId: parentId,
      meta: { cwd: workspace.worktree },
      agentOptions: { provider: profile.provider, model: profile.model },
      setup(agentCtx) { installModelSelection(agentCtx, profile); },
    }), "native DSH bootstrap parent was refused");
    const parent = parentHandle.agent;
    await serviceCall(async () => {
      await parent.whenIdle();
      parent.followup(userMessage(BOOTSTRAP_PARENT_ANCHOR));
      await parent.whenIdle();
      await services.sessions.flush(parent.session);
      const persisted = await services.persistence.inspect(parentId, signal);
      if (!persisted.events?.some((event) => event?.type === "user/message" && textOf(event.data) === BOOTSTRAP_PARENT_ANCHOR)) {
        throw new Error("parent anchor missing");
      }
    }, "native DSH bootstrap parent did not become durable");

    const createdAt = new Date().toISOString();
    const state = {
      schema: "qq.run-handoff/v1", version: 1, runtime: "dsh", id: `${slug}-${nonce}`, project,
      task: { id: task.id, title: task.title }, status: "starting", look: 0,
      ...workspace, architectSession, callerSession: architectSession,
      bootstrapParentSession: parentId, runnerSession: null,
      ticketPath, transcriptPath, notePath, gatePath, statePath, qa: qaBinding,
      approval: { ...approval }, runnerProfile: { ...profile }, createdAt, updatedAt: createdAt,
    };
    await atomicPrivateJson(statePath, state);

    unregisterSetup = services.subagents.registerContinuableSetup((childCtx) => {
      if (childCtx.agent.session.header.parentSession !== parentId) return () => {};
      if (childId) throw new Error("native DSH runner context collision");
      childId = childCtx.agent.session.id;
      sessionContext.claimExclusive(childId, childContext);
      childClaimed = true;
      installModelSelection(childCtx, profile);
      return () => {};
    });
    prompt = formatRunnerPrompt(marker, runnerTicket, { ticketPath, runtime: "dsh" });
    const startSignal = signal ?? AbortSignal.timeout(options.startTimeoutMs ?? ACCEPTANCE_TIMEOUT_MS);
    const accepted = await serviceCall(() => services.agents.withInitiator(parent, () =>
      services.subagents.startContinuable({
        provider: "spawn",
        label: CONTINUABLE_LABEL,
        request: { prompt: [{ type: "text", text: prompt }], parent },
        signal: startSignal,
      })), "native DSH runner was refused");
    unregisterSetup();
    unregisterSetup = undefined;
    if (!childClaimed || childId !== accepted.childId) throw new NativeRunError("native DSH runner context ownership was not established");
    state.runnerSession = childId;
    state.bootstrapProof = { marker, messageId: accepted.messageId, persistence: "sessionPersistence.inspect" };
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);

    await verifyDshPromptAcceptance(services, {
      childId, parentId, worktree: workspace.worktree, messageId: accepted.messageId, marker,
    }, {
      signal,
      timeoutMs: options.verificationTimeoutMs,
      intervalMs: options.verificationIntervalMs,
      sleep: options.sleep,
      now: options.now,
    });
    state.status = "running";
    state.bootstrapProof.acceptedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    options.retainParent?.({ runId: state.id, parentId, childId, handle: parentHandle });
    parentHandle = undefined;
    return state;
  } catch (error) {
    try { unregisterSetup?.(); } catch {}
    const cleanupFailures = [];
    if (parentHandle) {
      try { await services.subagents.drainContinuableDescendants([parentHandle.agent]); }
      catch { cleanupFailures.push("native DSH child cleanup failed"); }
      try { await parentHandle.dispose(); }
      catch { cleanupFailures.push("native DSH parent cleanup failed"); }
    }
    if (childClaimed && childId) {
      try { sessionContext.release(childId, childContext); }
      catch { cleanupFailures.push("native DSH runner context cleanup failed"); }
    }
    if (parentClaimed && parentId) {
      try { sessionContext.release(parentId, parentContext); }
      catch { cleanupFailures.push("native DSH parent context cleanup failed"); }
    }
    if (workspace) {
      try { await cleanupRunWorkspace(run, workspace); }
      catch (cleanupError) {
        for (const failure of cleanupError?.errors ?? [cleanupError]) cleanupFailures.push(failure.message);
      }
    }
    if (!options.preserveStateOnFailure) {
      try { await rm(stateDir, { recursive: true, force: true }); }
      catch { cleanupFailures.push("runner state cleanup failed"); }
    }
    const safe = error instanceof NativeRunError ? error.message : "native DSH runner bootstrap failed";
    throw new Error(cleanupFailures.length ? `${safe}; ${cleanupFailures.join("; ")}` : safe);
  }
}

export const dshRunInternals = Object.freeze({
  BOOTSTRAP_PARENT_ANCHOR,
  CONTINUABLE_LABEL,
  exactMarkerMessage,
  verifyPersistedRunner,
});
