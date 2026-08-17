import { randomUUID } from "node:crypto";
import { constants, chmodSync, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const QQ_SESSION_CONTEXT_SCHEMA = "qq.session-context/v1";
export const DSH_SESSION_ID = /^session-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const DSH_CHILD_SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

const ROLES = new Set(["runner", "architect"]);
const PROFILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RECORD_KEYS = ["profile", "role", "runState", "schema", "sessionId"];

function contextRoot(env, options) {
  if (options.contextRoot !== undefined) return resolve(options.contextRoot);
  const stateHome = env.XDG_STATE_HOME
    ? resolve(env.XDG_STATE_HOME)
    : join(resolve(env.HOME || homedir()), ".local", "state");
  return join(stateHome, "qq", "session-contexts");
}

function contextPath(root, sessionId) {
  return join(root, `${sessionId}.json`);
}

function canonicalDshSessionId(sessionId) {
  return DSH_SESSION_ID.test(sessionId ?? "") || DSH_CHILD_SESSION_ID.test(sessionId ?? "");
}

function assertSessionId(sessionId) {
  if (!canonicalDshSessionId(sessionId)) {
    throw new Error("qq session context requires a canonical DSH session ID");
  }
  return sessionId;
}

function snapshotContext(sessionId, value) {
  const role = value?.role;
  const profile = value?.profile;
  const runState = value?.runState ?? null;
  if (!ROLES.has(role)) throw new Error(`invalid qq session role: ${String(role)}`);
  if (typeof profile !== "string" || !PROFILE.test(profile)) {
    throw new Error(`invalid qq session profile: ${String(profile)}`);
  }
  if (runState !== null && (typeof runState !== "string" || !isAbsolute(runState))) {
    throw new Error("qq DSH run state must be an absolute path or null");
  }
  return { schema: QQ_SESSION_CONTEXT_SCHEMA, sessionId, role, profile, runState };
}

function validRecord(value, sessionId) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(RECORD_KEYS)
    && value.schema === QQ_SESSION_CONTEXT_SCHEMA
    && value.sessionId === sessionId
    && ROLES.has(value.role)
    && typeof value.profile === "string" && PROFILE.test(value.profile)
    && (value.runState === null || (typeof value.runState === "string" && isAbsolute(value.runState)));
}

function safeRoot(root, create = false) {
  try {
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) {
      throw new Error("qq session-context state directory is unsafe");
    }
    if ((info.mode & 0o077) !== 0) {
      if (!create) throw new Error("qq session-context state directory is not private");
      chmodSync(root, 0o700);
    }
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!create) return false;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    return safeRoot(root, true);
  }
}

function readOwnedContext(root, sessionId) {
  if (!safeRoot(root)) return undefined;
  let handle;
  try {
    handle = openSync(contextPath(root, sessionId), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new Error(`qq session context for ${sessionId} is unavailable: ${error.message}`);
  }
  try {
    const info = fstatSync(handle);
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
      throw new Error(`qq session context for ${sessionId} is unsafe`);
    }
    let value;
    try {
      value = JSON.parse(readFileSync(handle, "utf8"));
    } catch {
      throw new Error(`qq session context for ${sessionId} is malformed`);
    }
    if (!validRecord(value, sessionId)) {
      throw new Error(`qq session context for ${sessionId} is invalid`);
    }
    return value;
  } finally {
    closeSync(handle);
  }
}

function syncDirectory(root) {
  const directory = openSync(root, constants.O_RDONLY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function writeOwnedContext(root, sessionId, value, options = {}) {
  safeRoot(root, true);
  const record = snapshotContext(sessionId, value);
  const temporary = join(root, `.${sessionId}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  let temporaryExists = false;
  try {
    handle = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryExists = true;
    writeFileSync(handle, `${JSON.stringify(record)}\n`, "utf8");
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    if (options.exclusive) {
      try { linkSync(temporary, contextPath(root, sessionId)); }
      catch (error) {
        if (error?.code === "EEXIST") throw new Error(`qq session context for ${sessionId} is already claimed`);
        throw error;
      }
      unlinkSync(temporary);
    } else {
      renameSync(temporary, contextPath(root, sessionId));
    }
    temporaryExists = false;
    syncDirectory(root);
  } finally {
    if (handle !== undefined) closeSync(handle);
    if (temporaryExists) {
      try { unlinkSync(temporary); } catch {}
    }
  }
  return Object.freeze({ ...record, source: "dsh-session" });
}

/**
 * Resolve qq role/profile/run ownership at the host session boundary.
 * Canonical DSH sessions use one private durable record per session. A plain
 * Pi/Herdr host keeps the historical environment/role-event behavior.
 */
export function createQqSessionContext(options = {}) {
  const env = options.env ?? process.env;
  const root = contextRoot(env, options);
  const initial = Object.freeze({
    role: env.QQ_AGENT_ROLE || "runner",
    profile: undefined,
    runState: env.QQ_RUN_STATE || null,
  });
  let fallback = { ...initial };

  function activeSessionId(hostContext) {
    const explicit = options.activeDshSession?.();
    if (explicit !== undefined && explicit !== null && explicit !== "") return assertSessionId(explicit);
    const hostId = hostContext?.sessionManager?.getSessionId?.();
    if (DSH_SESSION_ID.test(hostId ?? "")) return hostId;
    // A bare v4 UUID is also DSH's canonical continuable-child identity, but Pi
    // UUIDs are bare too. Only an explicit durable ownership record resolves
    // that otherwise ambiguous host form.
    if (DSH_CHILD_SESSION_ID.test(hostId ?? "") && readOwnedContext(root, hostId)) return hostId;
    return undefined;
  }

  function environmentContext(sessionId) {
    return Object.freeze({
      ...(sessionId ? { sessionId } : {}),
      role: fallback.role,
      ...(fallback.profile ? { profile: fallback.profile } : {}),
      runState: fallback.runState,
      source: "pi-environment",
    });
  }

  function resolveSession(sessionId) {
    assertSessionId(sessionId);
    const owned = readOwnedContext(root, sessionId);
    return owned
      ? Object.freeze({ ...owned, source: "dsh-session" })
      : environmentContext(sessionId);
  }

  function resolveContext(hostContext) {
    const sessionId = activeSessionId(hostContext);
    return sessionId ? resolveSession(sessionId) : environmentContext();
  }

  function claim(sessionId, value) {
    return writeOwnedContext(root, assertSessionId(sessionId), value);
  }

  function claimExclusive(sessionId, value) {
    return writeOwnedContext(root, assertSessionId(sessionId), value, { exclusive: true });
  }

  function release(sessionId, expected) {
    const id = assertSessionId(sessionId);
    const current = readOwnedContext(root, id);
    if (!current) return false;
    if (expected !== undefined) {
      const snapshot = snapshotContext(id, expected);
      if (JSON.stringify(current) !== JSON.stringify(snapshot)) {
        throw new Error(`qq session context for ${id} changed before release`);
      }
    }
    unlinkSync(contextPath(root, id));
    syncDirectory(root);
    return true;
  }

  function update(hostContext, patch) {
    const sessionId = activeSessionId(hostContext);
    if (sessionId) {
      const current = resolveSession(sessionId);
      return claim(sessionId, {
        role: patch.role ?? current.role,
        profile: patch.profile ?? current.profile,
        runState: Object.hasOwn(patch, "runState") ? patch.runState : current.runState,
      });
    }
    fallback = {
      role: patch.role ?? fallback.role,
      profile: patch.profile ?? fallback.profile,
      runState: Object.hasOwn(patch, "runState") ? patch.runState : fallback.runState,
    };
    return environmentContext();
  }

  function observeSelection(selection) {
    if (!selection?.role || canonicalDshSessionId(selection.sessionId)) return;
    fallback = {
      ...fallback,
      role: selection.role,
      ...(selection.profile ? { profile: selection.profile } : {}),
    };
  }

  function resetFallback() {
    fallback = { ...initial };
  }

  return Object.freeze({
    activeSessionId,
    claim,
    claimExclusive,
    contextPath: (sessionId) => contextPath(root, assertSessionId(sessionId)),
    observeSelection,
    release,
    resetFallback,
    resolve: resolveContext,
    resolveSession,
    update,
  });
}
