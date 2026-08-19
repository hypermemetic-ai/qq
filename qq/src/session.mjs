import { randomUUID } from "node:crypto";

import { createAliasBook, defaultAliasFile, defaultLegacyAliasFile } from "./alias.mjs";

const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_OBSERVE_MS = 100;

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

/** Compact change token for one catalog + session snapshot. */
export function snapshotFingerprint(snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const last = events.at(-1);
  const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
  return JSON.stringify([
    snapshot?.id,
    snapshot?.agentStatus,
    events.length,
    last?.seq,
    last?.type,
    last?.data?.reason?.kind,
    sessions.map((session) => [session.id, session.createdAt, session.alias]),
    snapshot?.alias,
  ]);
}

/**
 * Notify `listener(error, snapshot)` on the first snapshot and later changes.
 * Returns a disposer. Presentation-neutral: no HTML or transport.
 */
export function observeSnapshot(load, listener, options = {}) {
  if (typeof load !== "function" || typeof listener !== "function") {
    throw new Error("qq: observe requires load and listener functions");
  }
  const intervalMs = options.intervalMs ?? DEFAULT_OBSERVE_MS;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error("qq: observe intervalMs must be a positive integer");
  }
  let cancelled = false;
  let timer;
  let fingerprint = options.fingerprint;
  const tick = async () => {
    if (cancelled) return;
    try {
      const snapshot = await load();
      const next = snapshotFingerprint(snapshot);
      if (next !== fingerprint) {
        fingerprint = next;
        try { listener(null, snapshot); } catch {}
      }
    } catch (error) {
      try { listener(error); } catch {}
    }
    if (cancelled) return;
    timer = setTimeout(tick, intervalMs);
    timer.unref?.();
  };
  void tick();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/** Add `observe()` over a list/read backend. Used by fixtures and tests. */
export function attachObserve(backend, options = {}) {
  if (!backend || typeof backend.read !== "function" || typeof backend.list !== "function") {
    throw new Error("qq: attachObserve requires list and read");
  }
  if (typeof backend.observe === "function") return backend;
  return Object.freeze({
    ...backend,
    observe(sessionId, listener, extra = {}) {
      return observeSnapshot(async () => {
        const snapshot = await backend.read(sessionId);
        const available = await backend.list();
        if (!available.some((session) => session.id === snapshot.id)) {
          available.unshift({ id: snapshot.id, createdAt: 0 });
        }
        return { ...snapshot, sessions: available };
      }, listener, { ...options, ...extra });
    },
  });
}

/**
 * Adapt configured DSH Agent/Session services to a presentation-neutral API.
 * DSH remains the only session catalog, transcript, status, and cancellation
 * authority. The map only deduplicates in-process resume.
 */
export function createQqService(ctx, config) {
  const defaultSessionId = String(config.sessionId ?? "");
  if (!SESSION_ID.test(defaultSessionId)) {
    throw new Error("qq: sessionId must be session-<UUID>");
  }
  if (typeof config.cwd !== "string" || !config.cwd.startsWith("/")) {
    throw new Error("qq: cwd must be an absolute path");
  }
  const provider = String(config.provider ?? "");
  const model = String(config.model ?? "");
  if (!provider || !model) {
    throw new Error("qq: provider and model must be selected explicitly");
  }
  const selectedModel = Object.freeze({
    provider,
    model,
    ...(config.reasoningEffort ? { reasoningEffort: String(config.reasoningEffort) } : {}),
  });

  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const persistence = ctx.get("sessionPersistence");
  if (!agents || !sessions || !persistence) {
    throw new Error("qq: required DSH services are unavailable");
  }

  const agentPromises = new Map();
  const defaultCreatedAt = Date.now();
  const aliasFile = config.aliasFile !== undefined || envHasDshHome()
    ? defaultAliasFile(process.env, config)
    : undefined;
  const book = createAliasBook(aliasFile, {
    now: config.now,
    rng: config.rng,
    legacyFile: aliasFile ? defaultLegacyAliasFile(process.env) : undefined,
  });

  function envHasDshHome() {
    return typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME.trim().length > 0;
  }

  function liveAgents() {
    const listed = typeof agents.list === "function"
      ? agents.list()
      : [agents.get(defaultSessionId)].filter(Boolean);
    return listed.filter((agent) => SESSION_ID.test(agent?.session?.id));
  }

  function liveSessionIds() {
    return liveAgents().map((agent) => agent.session.id);
  }

  function syncLive(extraId) {
    const ids = liveSessionIds();
    if (SESSION_ID.test(extraId) && !ids.includes(extraId)) ids.push(extraId);
    book.sync(ids);
  }

  function liveAlias(sessionId) {
    if (!SESSION_ID.test(sessionId) || !agents.get(sessionId)) return undefined;
    syncLive(sessionId);
    return book.aliasFor(sessionId);
  }

  function resolveAlias(address) {
    syncLive();
    const exact = liveAgents().find((agent) => agent.session.id === address);
    if (exact) return exact.session.id;
    return liveAgents().find((agent) => book.aliasFor(agent.session.id) === address)?.session.id;
  }

  if (typeof ctx.on === "function") {
    ctx.on("agent/created", ({ agent }) => {
      const sessionId = agent?.session?.id;
      if (SESSION_ID.test(sessionId)) syncLive(sessionId);
    });
    ctx.on("agent/disposed", () => {
      syncLive();
    });
  }
  if (typeof ctx.effect === "function") {
    ctx.effect(() => () => book.close(), "qq: alias book");
  }
  syncLive();

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

      const setup = selectionSetup({ current: selectedModel });
      const options = {
        agentOptions: { provider: selectedModel.provider, model: selectedModel.model },
        setup,
      };
      const handle = persisted
        ? await agents.resume({ resumeSessionId: sessionId, ...options })
        : await agents.create({
            sessionId,
            meta: { cwd: config.cwd },
            ...options,
          });
      syncLive(handle.agent.session.id);
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
    for (const agent of liveAgents()) {
      if (!SESSION_ID.test(agent?.session?.id) || byId.has(agent.session.id)) continue;
      byId.set(agent.session.id, {
        id: agent.session.id,
        createdAt: agent.session.header?.createdAt ??
          (agent.session.id === defaultSessionId ? defaultCreatedAt : 0),
        cwd: agent.session.header?.cwd ??
          (agent.session.id === defaultSessionId ? config.cwd : undefined),
      });
    }
    if (!byId.has(defaultSessionId)) {
      byId.set(defaultSessionId, {
        id: defaultSessionId,
        createdAt: defaultCreatedAt,
        cwd: config.cwd,
      });
    }
    syncLive();
    return [...byId.values()]
      .map((session) => {
        const alias = agents.get(session.id) ? book.aliasFor(session.id) : undefined;
        return alias ? { ...session, alias } : session;
      })
      .sort(
        (left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id),
      );
  }

  async function read(sessionId) {
    const agent = await agentForSession(sessionId);
    const alias = liveAlias(agent.session.id);
    return {
      id: agent.session.id,
      events: agent.session.events,
      agentStatus: agent.status,
      ...(alias ? { alias } : {}),
    };
  }

  async function view(sessionId) {
    const snapshot = await read(sessionId);
    const available = await list();
    if (!available.some((session) => session.id === snapshot.id)) {
      available.unshift({ id: snapshot.id, createdAt: 0 });
    }
    return { ...snapshot, sessions: available };
  }

  return Object.freeze({
    defaultSessionId,
    list,
    read,
    alias: liveAlias,
    resolve: resolveAlias,
    async create() {
      await ctx.get("loader")?.await();
      const sessionId = `session-${randomUUID()}`;
      const setup = selectionSetup({ current: selectedModel });
      const handle = await agents.create({
        sessionId,
        meta: { cwd: config.cwd },
        agentOptions: { provider: selectedModel.provider, model: selectedModel.model },
        setup,
      });
      // DSH's creation event establishes the header; its flush boundary makes
      // even a brand-new empty session durable before the browser opens it.
      await sessions.flush(handle.agent.session);
      const createdId = handle.agent.session.id;
      syncLive(createdId);
      const alias = book.aliasFor(createdId);
      return alias ? { id: createdId, alias } : { id: createdId };
    },
    async prompt(sessionId, text) {
      const agent = await agentForSession(sessionId);
      const line = String(text ?? "");
      if (line.startsWith("/")) {
        const commands = ctx.get("commands", false);
        if (!commands || typeof commands.execute !== "function") {
          throw httpError(503, "qq: slash commands require ctx.commands");
        }
        const parsed = typeof commands.parseCommand === "function"
          ? commands.parseCommand(line)
          : /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
        if (!parsed) {
          throw httpError(400, "qq: unknown slash command");
        }
        const name = parsed.name ?? parsed[1];
        const execution = await commands.execute(agent, line, new AbortController().signal);
        if (!execution) {
          throw httpError(400, `qq: unknown slash command /${name}`);
        }
        await sessions.flush(agent.session);
        return;
      }
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
    observe(sessionId, listener, options = {}) {
      return observeSnapshot(() => view(sessionId), listener, options);
    },
  });
}

export const internals = Object.freeze({
  DEFAULT_OBSERVE_MS,
  SESSION_ID,
  httpError,
  selectionSetup,
  userMessage,
  waitForIdle,
});
