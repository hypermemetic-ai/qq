import { randomUUID } from "node:crypto";

const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function userMessage(text) {
  return freeze({
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

function selectionSetup(selection) {
  return (agentCtx) => {
    let assembled;
    agentCtx.on(
      "system-prompt/assemble",
      async (_assembly, _context, next) => {
        const selected = selection.current;
        const result = await next();
        assembled = selected;
        if (!selected) return result;
        return {
          ...result,
          variables: {
            ...result.variables,
            provider: selected.provider,
            model: selected.model,
          },
        };
      },
    );
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

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function waitForIdle(agent, currentAgent = () => agent) {
  // Cordis may hand a caller a traced service view whose scalar properties are
  // snapshots. Re-read the registry's exact live Agent while wake/cancel
  // converges; DSH remains the lifecycle authority.
  while (currentAgent().status !== "idle") {
    await currentAgent().whenIdle();
    if (currentAgent().status !== "idle") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

/**
 * Adapt the configured DSH Agent/Session services to the HTML surface. DSH's
 * registry and persistence remain the only session catalog, transcript, status,
 * and cancellation authorities. The map only deduplicates in-process resume;
 * it contains no browser/client state.
 */
export function createDshSessionBackend(ctx, config) {
  const defaultSessionId = String(config.sessionId ?? "");
  if (!SESSION_ID.test(defaultSessionId)) {
    throw new Error("qq-dsh-console: sessionId must be session-<UUID>");
  }
  if (typeof config.cwd !== "string" || !config.cwd.startsWith("/")) {
    throw new Error("qq-dsh-console: cwd must be an absolute path");
  }

  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const persistence = ctx.get("sessionPersistence");
  const defaultModel = ctx.get("agentDefaultModel");
  if (!agents || !sessions || !persistence || !defaultModel) {
    throw new Error("qq-dsh-console: required DSH services are unavailable");
  }

  const agentPromises = new Map();
  const defaultCreatedAt = Date.now();

  async function persistedHeaders() {
    return (await persistence.list()).filter((header) => SESSION_ID.test(header?.id));
  }

  async function agentForSession(sessionId) {
    if (!SESSION_ID.test(sessionId)) throw httpError(404, "DSH session not found");
    const live = agents.get(sessionId);
    if (live) return live;
    const pending = agentPromises.get(sessionId);
    if (pending) return pending;

    const promise = (async () => {
      await ctx.get("loader")?.await();
      const appeared = agents.get(sessionId);
      if (appeared) return appeared;

      const headers = await persistedHeaders();
      const persisted = headers.some((header) => header.id === sessionId);
      if (!persisted && sessionId !== defaultSessionId) {
        throw httpError(404, "DSH session not found");
      }

      const current = defaultModel.currentSelection();
      const setup = selectionSetup({ current });
      const options = {
        agentOptions: { provider: current.provider, model: current.model },
        setup,
      };
      const handle = persisted
        ? await agents.resume({ resumeSessionId: sessionId, ...options })
        : await agents.create({
            sessionId,
            meta: { cwd: config.cwd },
            ...options,
          });
      return handle.agent;
    })();
    agentPromises.set(sessionId, promise);

    try {
      return await promise;
    } catch (error) {
      if (agentPromises.get(sessionId) === promise) agentPromises.delete(sessionId);
      throw error;
    }
  }

  async function list() {
    const headers = await persistedHeaders();
    const byId = new Map(
      headers.map((header) => [header.id, {
        id: header.id,
        createdAt: header.createdAt,
        cwd: header.cwd,
      }]),
    );
    const liveAgents = typeof agents.list === "function"
      ? agents.list()
      : [agents.get(defaultSessionId)].filter(Boolean);
    for (const agent of liveAgents) {
      if (!SESSION_ID.test(agent?.session?.id) || byId.has(agent.session.id)) continue;
      byId.set(agent.session.id, {
        id: agent.session.id,
        createdAt: agent.session.id === defaultSessionId ? defaultCreatedAt : 0,
        cwd: agent.session.id === defaultSessionId ? config.cwd : undefined,
      });
    }
    if (!byId.has(defaultSessionId)) {
      byId.set(defaultSessionId, {
        id: defaultSessionId,
        createdAt: defaultCreatedAt,
        cwd: config.cwd,
      });
    }
    return [...byId.values()].sort(
      (left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id),
    );
  }

  return Object.freeze({
    defaultSessionId,
    list,
    async read(sessionId) {
      const agent = await agentForSession(sessionId);
      return {
        id: agent.session.id,
        events: agent.session.events,
        agentStatus: agent.status,
      };
    },
    async prompt(sessionId, text) {
      const agent = await agentForSession(sessionId);
      agent.followup(userMessage(text));
      await waitForIdle(agent, () => agents.get(sessionId) ?? agent);
      await sessions.flush(agent.session);
    },
    async interrupt(sessionId) {
      const agent = await agentForSession(sessionId);
      const wasRunning = agent.status === "running";
      agent.cancel({ kind: "user" });
      if (wasRunning) {
        await waitForIdle(agent, () => agents.get(sessionId) ?? agent);
        await sessions.flush(agent.session);
      }
      return wasRunning;
    },
  });
}

export const internals = Object.freeze({ SESSION_ID, httpError, selectionSetup, userMessage, waitForIdle });
