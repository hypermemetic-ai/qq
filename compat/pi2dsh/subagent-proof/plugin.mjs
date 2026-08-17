import { randomUUID } from "node:crypto";

const SCHEMA = "qq.dsh-child-prompt-proof/v1";
const LABEL = "qq private bootstrap acceptance";
const BOOTSTRAP_PROMPT = "qq private child bootstrap prompt";
const FOLLOWUP_PROMPT = "qq cold-resume child follow-up";
const PARENT_ANCHOR = "qq durable direct-parent anchor";
const ARCHITECT_PROFILE = "dsh-architect-proof";
const RUNNER_PROFILE = "dsh-runner-proof";
const WAIT_MS = 30_000;

export const name = "qq-dsh-subagent-proof";
export const inject = [
  "agentDefaultModel",
  "agents",
  "sessions",
  "sessionPersistence",
  "subagents",
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function userMessage(text) {
  return deepFreeze({
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

function selectionSetup(selection) {
  return (agentCtx) => {
    let assembled;
    agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
      const selected = selection.current;
      const result = await next();
      assembled = selected;
      return {
        ...result,
        variables: {
          ...result.variables,
          provider: selected.provider,
          model: selected.model,
        },
      };
    });
    agentCtx.on("agent/request", async (_payload, next) => {
      const result = await next();
      if (!assembled) return result;
      const { reasoningEffort: _inherited, ...withoutInherited } = result;
      return {
        ...withoutInherited,
        provider: assembled.provider,
        model: assembled.model,
        ...(assembled.reasoningEffort
          ? { reasoningEffort: assembled.reasoningEffort }
          : {}),
      };
    });
  };
}

function textOf(message) {
  return message?.content
    ?.filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("") ?? "";
}

function assert(condition, message) {
  if (!condition) throw new Error(`qq-dsh-subagent-proof: ${message}`);
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + WAIT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

function verifyPersistedChild(inspection, expected) {
  const { childId, parentId, cwd, messageId, prompt } = expected;
  assert(inspection.meta.id === childId, "persistence returned the wrong child");
  assert(inspection.meta.parentSession === parentId, "durable direct parent changed");
  assert(inspection.meta.cwd === cwd, "spawn child did not inherit the disposable worktree");
  assert(inspection.meta.origin === "subagent", "durable child origin is not subagent");

  const descriptor = inspection.events.find((event) => event.type === "subagent/descriptor");
  assert(descriptor, "durable child descriptor is absent");
  assert(descriptor.data?.version === 2, "durable child descriptor version changed");
  assert(descriptor.data?.mode === "continuable", "durable child is not continuable");
  assert(descriptor.data?.provider === "spawn", "durable child provider is not spawn");
  assert(descriptor.data?.label === LABEL, "durable child label changed");

  const message = inspection.events.find(
    (event) => event.type === "user/message" && event.data?.id === messageId,
  );
  assert(message, "accepted message id is absent from cold DSH persistence");
  assert(textOf(message.data) === prompt, "persisted accepted prompt changed");
  return { descriptor, message };
}

async function waitForColdPersistence(services, expected) {
  return waitUntil(async () => {
    if (services.agents.get(expected.childId)) return undefined;
    if (services.sessions.get(expected.childId)) return undefined;
    const inspection = await services.persistence.inspect(expected.childId);
    const verified = verifyPersistedChild(inspection, expected);
    return { inspection, ...verified };
  }, `timed out waiting for cold durable child ${expected.childId}`);
}

function contextProbeSetup(boundary, expected, observed) {
  return (agentCtx) => {
    const capture = () => {
      const resolved = boundary.resolve();
      assert(resolved.sessionId === expected.sessionId, "active DSH session identity changed");
      assert(resolved.role === expected.role, "active DSH role changed");
      assert(resolved.profile === expected.profile, "active DSH profile changed");
      assert(resolved.runState === expected.runState, "active DSH run state changed");
      observed.context = resolved;
    };
    agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
      capture();
      return next();
    });
    agentCtx.on("agent/request", async (_payload, next) => {
      capture();
      return next();
    });
  };
}

function combinedSetup(...setups) {
  return (agentCtx) => {
    for (const setup of setups) setup(agentCtx);
  };
}

async function parentForPhase(services, config, contextSetup) {
  const persisted = (await services.persistence.list()).some(
    (header) => header.id === config.parentSessionId,
  );
  if (config.phase === "start") {
    assert(!persisted, "start phase found an existing parent session");
  } else {
    assert(persisted, "follow-up phase could not find the persisted parent session");
    assert(!services.agents.get(config.parentSessionId), "parent was already process-local");
    assert(!services.sessions.get(config.parentSessionId), "parent Session was already process-local");
    const coldParent = await services.persistence.inspect(config.parentSessionId);
    assert(coldParent.meta.cwd === config.cwd, "persisted parent workspace changed");
  }

  const selection = services.defaultModel.currentSelection();
  const options = {
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: combinedSetup(selectionSetup({ current: selection }), contextSetup),
  };
  const handle = persisted
    ? await services.agents.resume({
        resumeSessionId: config.parentSessionId,
        ...options,
      })
    : await services.agents.create({
        sessionId: config.parentSessionId,
        meta: { cwd: config.cwd },
        ...options,
      });
  await handle.agent.whenIdle();
  assert(handle.agent.session.id === config.parentSessionId, "live direct parent identity changed");
  assert(handle.agent.session.header.cwd === config.cwd, "live parent workspace changed");
  return { handle, resumed: persisted };
}

function evidence(config, parentResumed, accepted, cold, extra = {}) {
  return {
    schema: SCHEMA,
    phase: config.phase,
    host_pid: process.pid,
    service: "@deepseek-ai/dsh-subagent",
    provider: "@deepseek-ai/dsh-subagent-spawn-in-process",
    provider_name: "spawn",
    parent_session_id: config.parentSessionId,
    parent_resumed: parentResumed,
    child_session_id: accepted.childId,
    accepted_message_id: accepted.messageId,
    persistence_boundary: "sessionPersistence.inspect after Agent and Session unregistration",
    cold_persistence_read: true,
    accepted_message_seq: cold.message.seq,
    durable_descriptor_seq: cold.descriptor.seq,
    durable_parent_session_id: cold.inspection.meta.parentSession,
    durable_child_cwd: cold.inspection.meta.cwd,
    alternate_messaging_layer: false,
    qq_context_schema: "qq.session-context/v1",
    ...extra,
  };
}

async function run(ctx, config, exit) {
  await ctx.get("loader")?.await();
  assert(config.phase === "start" || config.phase === "followup", "phase must be start or followup");
  assert(/^session-[0-9a-f-]{36}$/i.test(config.parentSessionId), "parent id must be session-<UUID>");
  assert(typeof config.cwd === "string" && config.cwd.startsWith("/"), "cwd must be absolute");

  const services = {
    agents: ctx.get("agents"),
    sessions: ctx.get("sessions"),
    persistence: ctx.get("sessionPersistence"),
    subagents: ctx.get("subagents"),
    defaultModel: ctx.get("agentDefaultModel"),
  };
  assert(Object.values(services).every(Boolean), "required pinned DSH service is unavailable");
  assert(services.subagents.list().includes("spawn"), "spawn provider is not mounted");
  assert(typeof config.contextModule === "string" && config.contextModule.startsWith("/"), "qq context module path must be absolute");
  assert(typeof config.runnerState === "string" && config.runnerState.startsWith("/"), "runner state path must be absolute");

  const { createQqSessionContext } = await import(config.contextModule);
  const boundary = createQqSessionContext({
    env: process.env,
    activeDshSession: () => services.agents.currentInitiator()?.session.id,
  });
  const expectedParent = {
    sessionId: config.parentSessionId,
    role: "architect",
    profile: ARCHITECT_PROFILE,
    runState: null,
  };
  const parentBefore = boundary.resolveSession(config.parentSessionId);
  if (config.phase === "start") {
    assert(parentBefore.source === "pi-environment", "new parent unexpectedly had durable qq context");
    boundary.claim(config.parentSessionId, expectedParent);
  } else {
    assert(parentBefore.source === "dsh-session", "resumed parent lost durable qq context");
  }

  const parentObserved = {};
  const childObserved = {};
  let childContextRestored = false;
  services.subagents.registerContinuableSetup((childCtx) => {
    const expectedChild = {
      sessionId: childCtx.agent.session.id,
      role: "runner",
      profile: RUNNER_PROFILE,
      runState: config.runnerState,
    };
    const before = boundary.resolveSession(expectedChild.sessionId);
    if (config.phase === "start") {
      assert(before.source === "pi-environment", "new child unexpectedly had durable qq context");
      boundary.claim(expectedChild.sessionId, expectedChild);
    } else {
      assert(before.source === "dsh-session", "cold-resumed child lost durable qq context");
      childContextRestored = true;
    }
    contextProbeSetup(boundary, expectedChild, childObserved)(childCtx);
    return () => {};
  });

  const parentState = await parentForPhase(
    services,
    config,
    contextProbeSetup(boundary, expectedParent, parentObserved),
  );
  const parent = parentState.handle.agent;
  const activeParentContext = services.agents.withInitiator(parent, () => boundary.resolve());
  assert(activeParentContext.source === "dsh-session", "active parent did not resolve session-owned qq context");
  let result;

  if (config.phase === "start") {
    parent.followup(userMessage(PARENT_ANCHOR));
    await parent.whenIdle();
    await services.sessions.flush(parent.session);
    const parentInspection = await services.persistence.inspect(config.parentSessionId);
    assert(
      parentInspection.events.some(
        (event) => event.type === "user/message" && textOf(event.data) === PARENT_ANCHOR,
      ),
      "direct parent anchor did not reach DSH persistence",
    );

    const accepted = await services.subagents.startContinuable({
      provider: "spawn",
      label: LABEL,
      request: {
        prompt: [{ type: "text", text: BOOTSTRAP_PROMPT }],
        parent,
      },
      signal: AbortSignal.timeout(WAIT_MS),
    });
    const childWasLiveAfterAcceptance = Boolean(services.agents.get(accepted.childId));
    const cold = await waitForColdPersistence(services, {
      childId: accepted.childId,
      parentId: config.parentSessionId,
      cwd: config.cwd,
      messageId: accepted.messageId,
      prompt: BOOTSTRAP_PROMPT,
    });
    assert(parentObserved.context, "parent request did not resolve qq context");
    assert(childObserved.context, "child request did not resolve qq context");
    result = evidence(config, parentState.resumed, accepted, cold, {
      prompt_kind: "bootstrap",
      child_was_live_after_acceptance: childWasLiveAfterAcceptance,
      parent_context: activeParentContext,
      child_context: childObserved.context,
      context_isolation: activeParentContext.role !== childObserved.context.role
        && activeParentContext.profile !== childObserved.context.profile
        && activeParentContext.runState !== childObserved.context.runState,
      context_survived_continuation: false,
    });
  } else {
    assert(/^[0-9a-f-]{36}$/i.test(config.childSessionId), "follow-up phase needs the durable child id");
    assert(!services.agents.get(config.childSessionId), "child was not cold before follow-up");
    assert(!services.sessions.get(config.childSessionId), "child Session was not cold before follow-up");
    const bootstrap = await services.persistence.inspect(config.childSessionId);
    assert(
      bootstrap.events.some(
        (event) => event.type === "user/message" && textOf(event.data) === BOOTSTRAP_PROMPT,
      ),
      "cold child lost its bootstrap prompt before follow-up",
    );

    const messageId = await services.subagents.followup(
      parent,
      config.childSessionId,
      [{ type: "text", text: FOLLOWUP_PROMPT }],
      {
        source: {
          kind: "coordinator",
          form: "relay",
          senderSessionId: parent.id,
        },
        signal: AbortSignal.timeout(WAIT_MS),
      },
    );
    const accepted = { childId: config.childSessionId, messageId };
    const childWasLiveAfterAcceptance = Boolean(services.agents.get(config.childSessionId));
    const cold = await waitForColdPersistence(services, {
      childId: config.childSessionId,
      parentId: config.parentSessionId,
      cwd: config.cwd,
      messageId,
      prompt: FOLLOWUP_PROMPT,
    });
    assert(childContextRestored, "child continuation did not restore durable qq context");
    assert(childObserved.context, "continued child request did not resolve qq context");
    result = evidence(config, parentState.resumed, accepted, cold, {
      prompt_kind: "cold-followup",
      child_was_cold_before_followup: true,
      child_was_live_after_acceptance: childWasLiveAfterAcceptance,
      bootstrap_still_durable: true,
      parent_context: activeParentContext,
      child_context: childObserved.context,
      context_isolation: activeParentContext.role !== childObserved.context.role
        && activeParentContext.profile !== childObserved.context.profile
        && activeParentContext.runState !== childObserved.context.runState,
      context_survived_continuation: true,
    });
  }

  process.stdout.write(`QQ_DSH_SUBAGENT_PROOF ${JSON.stringify(result)}\n`);
  exit(0);
}

export function apply(ctx, config) {
  const exit = ctx.get("appExit");
  if (!exit) throw new Error("qq-dsh-subagent-proof: appExit is unavailable");
  run(ctx, config, exit).catch((error) => {
    process.stderr.write(`${error?.stack ?? String(error)}\n`);
    exit(1);
  });
}

export const internals = Object.freeze({
  BOOTSTRAP_PROMPT,
  FOLLOWUP_PROMPT,
  LABEL,
  PARENT_ANCHOR,
  SCHEMA,
  textOf,
  verifyPersistedChild,
});
