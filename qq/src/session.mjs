import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { createAliasBook, defaultAliasFile, defaultLegacyAliasFile } from "./alias.mjs";
import { deriveToolEventViews, projectConversation } from "./conversation.mjs";
import { createProjectFileService } from "./files.mjs";

const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_OBSERVE_MS = 100;
const RUNNING_CLEAR = "clear is unavailable while this session is running";
const RUNNING_CLOSE = "close is unavailable while this session is running";
const INACTIVE = "DSH session is not active";
const NOT_FOUND = "DSH session not found";
// AgentHandles are DSH-owned capabilities. Keep the capability on the live
// Agent so a qq fiber replacement can rebuild its index without owning or
// disposing the Agent itself.
const AGENT_HANDLE = Symbol.for("@hypermemetic-ai/qq/agent-handle");

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

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
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

function canonicalPath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error(`qq: ${label} must be an absolute path`);
  }
  try {
    return realpathSync(value);
  } catch (error) {
    throw new Error(`qq: ${label} is not a resolvable directory`, { cause: error });
  }
}

function isImmediateChild(root, candidate) {
  const rel = relative(root, candidate);
  if (!rel || rel === "." || isAbsolute(rel)) return false;
  const segments = rel.split(sep);
  return !segments.includes("..") && segments.length === 1;
}

/** Resolve the configured projects root; production default is ${HOME}/projects. */
export function resolveProjectsRoot(value, env = process.env) {
  const home = typeof env.HOME === "string" && env.HOME.startsWith("/")
    ? env.HOME
    : homedir();
  const raw = value === undefined || value === null
    ? join(home, "projects")
    : value;
  if (typeof raw !== "string" || !raw.startsWith("/")) {
    throw new Error("qq: projectsRoot must be an absolute path");
  }
  return canonicalPath(raw, "projectsRoot");
}

/**
 * Immediate non-escaping directories under projectsRoot. A symlink whose
 * canonical path leaves the root is not a project.
 */
export function listProjectCatalog(projectsRoot) {
  const root = canonicalPath(projectsRoot, "projectsRoot");
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new Error("qq: projectsRoot is not a readable directory", { cause: error });
  }
  const projects = [];
  const seen = new Set();
  for (const entry of entries) {
    const name = entry.name;
    if (!name || name === "." || name === "..") continue;
    const listed = join(root, name);
    let info;
    try {
      info = lstatSync(listed);
    } catch {
      continue;
    }
    if (!info.isDirectory() && !info.isSymbolicLink()) continue;
    let cwd;
    try {
      cwd = realpathSync(listed);
    } catch {
      continue;
    }
    if (!isImmediateChild(root, cwd)) continue;
    const key = `${name}\0${cwd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    projects.push({ name, cwd });
  }
  projects.sort((left, right) => left.name.localeCompare(right.name) || left.cwd.localeCompare(right.cwd));
  return projects;
}

export function isRootOperatorAgent(agent) {
  const session = agent?.session;
  if (!SESSION_ID.test(session?.id)) return false;
  const header = session.header ?? {};
  if (header.parentSession) return false;
  if (header.origin === "subagent") return false;
  const id = String(session.id);
  const parent = header.parentId ?? header.parent ?? header.parent_session;
  if (parent) return false;
  if (typeof id === "string" && id.includes("/")) return false;
  return true;
}

export function sessionRecency(session, fallbackCreatedAt = 0) {
  const events = Array.isArray(session?.events) ? session.events : [];
  let latest = 0;
  for (const event of events) {
    const time = event?.time;
    const value = typeof time === "number" ? time : Date.parse(time ?? "");
    if (Number.isFinite(value) && value > latest) latest = value;
  }
  const createdAt = Number.isFinite(session?.header?.createdAt)
    ? session.header.createdAt
    : (Number.isFinite(session?.createdAt) ? session.createdAt : fallbackCreatedAt);
  return { latest, createdAt: createdAt || 0, id: String(session?.id ?? "") };
}

export function compareSessionRecency(left, right) {
  if (right.latest !== left.latest) return right.latest - left.latest;
  if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
  return left.id.localeCompare(right.id);
}

function slashName(line) {
  const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(String(line ?? ""));
  return match ? match[1] : "";
}

/** Compact change token for one catalog + session snapshot. */
export function snapshotFingerprint(snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const last = events.at(-1);
  const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
  const pending = Array.isArray(snapshot?.conversation?.pending)
    ? snapshot.conversation.pending
    : [];
  return JSON.stringify([
    snapshot?.id,
    snapshot?.project,
    snapshot?.agentStatus,
    events.length,
    last?.seq,
    last?.type,
    last?.data?.reason?.kind,
    pending.map((item) => [item.id, item.target, item.text]),
    sessions.map((session) => [session.id, session.createdAt, session.alias, session.project]),
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
        const available = typeof backend.list === "function"
          ? await backend.list(snapshot?.project)
          : [];
        if (snapshot?.id && !available.some((session) => session.id === snapshot.id)) {
          available.unshift({
            id: snapshot.id,
            createdAt: 0,
            ...(snapshot.project ? { project: snapshot.project } : {}),
          });
        }
        return { ...snapshot, sessions: available };
      }, listener, { ...options, ...extra });
    },
  });
}

/**
 * Adapt configured DSH Agent/Session services to a presentation-neutral API.
 * Live DSH Agents are the active catalog. Persistence is only used to
 * recognize an inactive id and to keep durable history after close.
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

  const projectsRoot = resolveProjectsRoot(config.projectsRoot);
  const projects = listProjectCatalog(projectsRoot);
  if (projects.length === 0) {
    throw new Error("qq: projectsRoot has no operator projects");
  }
  const bootCwd = canonicalPath(config.cwd, "cwd");
  const bootProject = projects.find((project) => project.cwd === bootCwd);
  if (!bootProject) {
    throw new Error("qq: cwd must equal one project root");
  }
  const defaultProject = bootProject.name;

  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const persistence = ctx.get("sessionPersistence");
  if (!agents || !sessions || !persistence) {
    throw new Error("qq: required DSH services are unavailable");
  }

  const agentPromises = new Map();
  const handles = new Map();
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

  function catalog() {
    return listProjectCatalog(projectsRoot);
  }

  const projectFiles = createProjectFileService(projectsRoot, catalog, {
    ...(config.readableFileLimit !== undefined ? { readableLimit: config.readableFileLimit } : {}),
    ...(config.openFileLimit !== undefined ? { openLimit: config.openFileLimit } : {}),
  });

  function projectByName(name) {
    const project = catalog().find((entry) => entry.name === name);
    if (!project) throw httpError(404, "qq: project not found");
    return project;
  }

  function projectForCwd(cwd) {
    if (typeof cwd !== "string" || !cwd.startsWith("/")) return undefined;
    let canonical = cwd;
    try {
      canonical = realpathSync(cwd);
    } catch {
      canonical = resolve(cwd);
    }
    return catalog().find((entry) => entry.cwd === canonical);
  }

  function agentCwd(agent) {
    const cwd = agent?.session?.header?.cwd;
    return typeof cwd === "string" ? cwd : undefined;
  }

  function liveAgents() {
    const listed = typeof agents.list === "function"
      ? agents.list()
      : [agents.get(defaultSessionId)].filter(Boolean);
    return listed.filter((agent) => SESSION_ID.test(agent?.session?.id));
  }

  function liveRootAgents() {
    return liveAgents().filter((agent) => {
      if (!isRootOperatorAgent(agent)) return false;
      return Boolean(projectForCwd(agentCwd(agent)));
    });
  }

  function liveSessionIds() {
    return liveRootAgents().map((agent) => agent.session.id);
  }

  function rememberHandle(handle) {
    const agent = handle?.agent;
    const sessionId = agent?.session?.id;
    if (SESSION_ID.test(sessionId) && typeof handle.dispose === "function") {
      handles.set(sessionId, handle);
      try {
        Object.defineProperty(agent, AGENT_HANDLE, {
          value: handle,
          configurable: true,
        });
      } catch {
        // An exotic non-extensible Agent remains live, but cannot be closed by
        // a replacement qq fiber because DSH exposes no handle lookup service.
      }
    }
    return handle;
  }

  for (const agent of liveAgents()) {
    const handle = agent?.[AGENT_HANDLE];
    if (handle && typeof handle.dispose === "function") handles.set(agent.session.id, handle);
  }

  function syncLive(extraId) {
    const ids = liveSessionIds();
    if (SESSION_ID.test(extraId) && !ids.includes(extraId)) ids.push(extraId);
    book.sync(ids);
  }

  function liveAlias(sessionId) {
    if (!SESSION_ID.test(sessionId) || !agents.get(sessionId)) return undefined;
    if (!liveRootAgents().some((agent) => agent.session.id === sessionId)) return undefined;
    syncLive(sessionId);
    return book.aliasFor(sessionId);
  }

  function resolveAlias(address) {
    syncLive();
    const exact = liveRootAgents().find((agent) => agent.session.id === address);
    if (exact) return exact.session.id;
    return liveRootAgents().find((agent) => book.aliasFor(agent.session.id) === address)?.session.id;
  }

  if (typeof ctx.on === "function") {
    ctx.on("agent/created", ({ agent }) => {
      const sessionId = agent?.session?.id;
      if (SESSION_ID.test(sessionId) && isRootOperatorAgent(agent)) syncLive(sessionId);
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

  function requireLiveAgent(sessionId) {
    if (!SESSION_ID.test(sessionId)) throw httpError(404, NOT_FOUND);
    const live = agents.get(sessionId);
    if (live && isRootOperatorAgent(live) && projectForCwd(agentCwd(live))) return live;
    return undefined;
  }

  async function rejectInactive(sessionId) {
    const headers = await persistedHeaders();
    if (headers.some((header) => header.id === sessionId)) {
      throw httpError(404, INACTIVE, "inactive");
    }
    throw httpError(404, NOT_FOUND);
  }

  async function liveAgent(sessionId) {
    const live = requireLiveAgent(sessionId);
    if (live) return live;
    await rejectInactive(sessionId);
  }

  function createdAtFor(agent) {
    return agent.session.header?.createdAt
      ?? (agent.session.id === defaultSessionId ? defaultCreatedAt : 0);
  }

  function rowFor(agent) {
    const project = projectForCwd(agentCwd(agent));
    const recency = sessionRecency(agent.session, createdAtFor(agent));
    const alias = book.aliasFor(agent.session.id);
    return {
      id: agent.session.id,
      createdAt: recency.createdAt,
      latestEventAt: recency.latest,
      cwd: project?.cwd ?? agentCwd(agent),
      project: project?.name,
      ...(alias ? { alias } : {}),
    };
  }

  async function ensureBootSession() {
    if (requireLiveAgent(defaultSessionId)) {
      syncLive(defaultSessionId);
      return;
    }
    await ctx.get("loader")?.await();
    if (requireLiveAgent(defaultSessionId)) {
      syncLive(defaultSessionId);
      return;
    }
    const headers = await persistedHeaders();
    const persisted = headers.find((header) => header.id === defaultSessionId);
    const setup = selectionSetup({ current: selectedModel });
    const options = {
      agentOptions: { provider: selectedModel.provider, model: selectedModel.model },
      setup,
    };
    const persistCwd = typeof persisted?.cwd === "string" ? persisted.cwd : undefined;
    const persistProject = persistCwd ? projectForCwd(persistCwd) : undefined;
    const handle = rememberHandle(persisted && persistProject
      ? await agents.resume({ resumeSessionId: defaultSessionId, ...options })
      : await agents.create({
          sessionId: defaultSessionId,
          meta: { cwd: bootProject.cwd },
          ...options,
        }));
    if (!persisted || !persistProject) {
      await sessions.flush(handle.agent.session);
    }
    syncLive(handle.agent.session.id);
  }

  const boot = ensureBootSession();

  async function list(projectName) {
    await boot;
    syncLive();
    const wanted = projectName === undefined || projectName === null || projectName === ""
      ? undefined
      : projectByName(String(projectName)).name;
    const rows = liveRootAgents()
      .map((agent) => rowFor(agent))
      .filter((row) => row.project && (!wanted || row.project === wanted));
    rows.sort((left, right) => compareSessionRecency(
      { latest: left.latestEventAt, createdAt: left.createdAt, id: left.id },
      { latest: right.latestEventAt, createdAt: right.createdAt, id: right.id },
    ));
    return rows;
  }

  async function read(sessionId) {
    await boot;
    const agent = await liveAgent(sessionId);
    const row = rowFor(agent);
    const alias = liveAlias(agent.session.id);
    const events = agent.session.events;
    let toolViews;
    try {
      const tools = ctx.get("tools", false);
      toolViews = deriveToolEventViews(events, tools, agent, (error, event) => {
        ctx.logger?.warn?.(`qq: tool presenter failed at seq ${String(event?.seq)}: ${String(error)}`);
      });
    } catch {
      // Tool presentation is optional. Raw call/result content remains complete.
    }
    const conversation = projectConversation(events, {
      seedLength: agent.session.header?.seedLength,
      inbox: agent.inbox,
      toolViews,
    });
    return {
      id: agent.session.id,
      events,
      conversation,
      canMutatePending: Boolean(
        agent.inbox
        && typeof agent.inbox.replace === "function"
        && typeof agent.inbox.remove === "function"
      ),
      agentStatus: agent.status,
      cwd: row.cwd,
      project: row.project,
      createdAt: row.createdAt,
      ...(alias ? { alias } : {}),
    };
  }

  async function inspect(sessionId) {
    await boot;
    if (!SESSION_ID.test(sessionId)) throw httpError(404, NOT_FOUND);
    const live = requireLiveAgent(sessionId);
    if (live) {
      const row = rowFor(live);
      return { id: live.session.id, live: true, ...row };
    }
    const headers = await persistedHeaders();
    const persisted = headers.find((header) => header.id === sessionId);
    if (persisted) {
      return {
        id: sessionId,
        live: false,
        createdAt: persisted.createdAt,
        cwd: persisted.cwd,
        project: projectForCwd(persisted.cwd)?.name,
      };
    }
    throw httpError(404, NOT_FOUND);
  }

  async function view(sessionId) {
    const snapshot = await read(sessionId);
    const available = await list(snapshot.project);
    return { ...snapshot, sessions: available };
  }

  async function createAt(projectName) {
    await boot;
    const project = projectByName(projectName ?? defaultProject);
    await ctx.get("loader")?.await();
    const sessionId = `session-${randomUUID()}`;
    const setup = selectionSetup({ current: selectedModel });
    const handle = rememberHandle(await agents.create({
      sessionId,
      meta: { cwd: project.cwd },
      agentOptions: { provider: selectedModel.provider, model: selectedModel.model },
      setup,
    }));
    await sessions.flush(handle.agent.session);
    const createdId = handle.agent.session.id;
    syncLive(createdId);
    const alias = book.aliasFor(createdId);
    return {
      id: createdId,
      project: project.name,
      cwd: project.cwd,
      ...(alias ? { alias } : {}),
    };
  }

  async function disposeLive(sessionId) {
    const handle = handles.get(sessionId);
    if (!handle || typeof handle.dispose !== "function") {
      throw httpError(409, "qq: session is not closeable");
    }
    handles.delete(sessionId);
    agentPromises.delete(sessionId);
    const agent = agents.get(sessionId);
    try { delete agent?.[AGENT_HANDLE]; } catch {}
    await handle.dispose();
    syncLive();
  }

  async function close(sessionId) {
    await boot;
    const agent = await liveAgent(sessionId);
    if (agent.status === "running") throw httpError(409, RUNNING_CLOSE);
    const project = projectForCwd(agentCwd(agent));
    const remainingBefore = await list(project?.name);
    await disposeLive(sessionId);
    const remaining = remainingBefore.filter((row) => row.id !== sessionId);
    const next = remaining[0];
    return {
      id: next?.id ?? null,
      closed: sessionId,
      project: project?.name ?? defaultProject,
    };
  }

  async function replace(sessionId) {
    await boot;
    const agent = await liveAgent(sessionId);
    if (agent.status === "running") throw httpError(409, RUNNING_CLEAR);
    const project = projectForCwd(agentCwd(agent));
    if (!project) throw httpError(404, "qq: project not found");
    const created = await createAt(project.name);
    try {
      await disposeLive(sessionId);
    } catch (error) {
      try { await disposeLive(created.id); } catch {}
      throw error;
    }
    return {
      id: created.id,
      project: project.name,
      cwd: project.cwd,
      closed: sessionId,
      ...(created.alias ? { alias: created.alias } : {}),
    };
  }

  return Object.freeze({
    defaultSessionId,
    defaultProject,
    projectsRoot,
    listProjects: () => catalog(),
    listProjectFiles: projectFiles.listProjectFiles,
    readProjectFile: projectFiles.readProjectFile,
    openProjectFile: projectFiles.openProjectFile,
    list,
    read,
    inspect,
    alias: liveAlias,
    resolve: resolveAlias,
    async create(projectName) {
      return createAt(projectName);
    },
    replace,
    clear: replace,
    async prompt(sessionId, text) {
      await boot;
      const agent = await liveAgent(sessionId);
      const line = String(text ?? "");
      if (line.startsWith("/")) {
        const name = slashName(line);
        if (name === "new") {
          const project = projectForCwd(agentCwd(agent));
          const created = await createAt(project?.name);
          return { kind: "navigate", action: "create", ...created };
        }
        if (name === "clear") {
          const replaced = await replace(sessionId);
          return { kind: "navigate", action: "replace", ...replaced };
        }
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
        const commandName = parsed.name ?? parsed[1];
        const execution = await commands.execute(agent, line, new AbortController().signal);
        if (!execution) {
          throw httpError(400, `qq: unknown slash command /${commandName}`);
        }
        await sessions.flush(agent.session);
        const result = execution.result;
        if (result?.kind === "error") {
          throw httpError(400, result.text || `qq: /${commandName} failed`);
        }
        return typeof result?.text === "string" ? result.text : "";
      }
      const finder = ctx.get("image-finder", false);
      if (finder && typeof finder.inFindMode === "function" && finder.inFindMode(sessionId)) {
        if (typeof finder.handlePrompt !== "function") {
          throw httpError(503, "image-finder: find mode is unavailable");
        }
        const result = await finder.handlePrompt({ agent, rawInput: line });
        await sessions.flush(agent.session);
        if (result?.kind === "error") {
          throw httpError(400, result.text || "qq: find failed");
        }
        return typeof result?.text === "string" ? result.text : "";
      }
      const message = userMessage(line);
      const mode = agent.status === "running" ? "steer" : "followup";
      if (mode === "steer") agent.steer(message);
      else agent.followup(message);
      // followup()/steer() durably append their inbox splice synchronously. Flush
      // that admission and return; the Agent owns later claim and turn progress.
      await sessions.flush(agent.session);
      return { kind: "accepted", mode, messageId: message.id };
    },
    async editPending(sessionId, messageId, text) {
      await boot;
      const agent = await liveAgent(sessionId);
      const inbox = agent.inbox;
      if (!inbox || typeof inbox.replace !== "function") {
        throw httpError(501, "qq: pending message editing is unavailable");
      }
      const id = String(messageId ?? "");
      const message = [...(inbox.nextTurn ?? []), ...(inbox.nextStep ?? [])]
        .find((candidate) => String(candidate?.id ?? "") === id);
      if (!message) throw httpError(409, "qq: pending message is no longer available");
      const nextText = String(text ?? "");
      if (!nextText.trim()) throw httpError(422, "Pending message must not be empty");
      if (nextText.length > 32_768) throw httpError(413, "Pending message exceeds 32,768 characters");
      const replacement = freeze({ ...message, content: [{ type: "text", text: nextText }] });
      if (!inbox.replace(message.id, replacement)) {
        throw httpError(409, "qq: pending message is no longer available");
      }
      await sessions.flush(agent.session);
      return { accepted: true, messageId: replacement.id };
    },
    async removePending(sessionId, messageId) {
      await boot;
      const agent = await liveAgent(sessionId);
      const inbox = agent.inbox;
      if (!inbox || typeof inbox.remove !== "function") {
        throw httpError(501, "qq: pending message removal is unavailable");
      }
      if (!inbox.remove(String(messageId ?? ""))) {
        throw httpError(409, "qq: pending message is no longer available");
      }
      await sessions.flush(agent.session);
      return { accepted: true };
    },
    async interrupt(sessionId) {
      await boot;
      const finder = ctx.get("image-finder", false);
      const abortedFind = typeof finder?.abortCompile === "function"
        ? Boolean(finder.abortCompile(sessionId))
        : false;
      const agent = await liveAgent(sessionId);
      const wasRunning = agent.status === "running";
      agent.cancel({ kind: "user" }, { keepInbox: true });
      // Cancellation follows the DSH Host admission contract: return after the
      // signal is accepted. The loop owns turn settlement and its checkpoint.
      return wasRunning || abortedFind;
    },
    close,
    observe(sessionId, listener, options = {}) {
      return observeSnapshot(() => view(sessionId), listener, options);
    },
  });
}

export const internals = Object.freeze({
  DEFAULT_OBSERVE_MS,
  SESSION_ID,
  INACTIVE,
  NOT_FOUND,
  RUNNING_CLEAR,
  RUNNING_CLOSE,
  httpError,
  selectionSetup,
  userMessage,
  waitForIdle,
  canonicalPath,
  isImmediateChild,
});
