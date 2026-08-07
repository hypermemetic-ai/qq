// @ts-nocheck -- qq intentionally ships no TypeScript or Node type dependency.
// Strictly gated, production-inert deterministic Actor messaging adapter.
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { EventPlaneClient } from "../bin/lib/qq-event-plane-client.ts";

export const QQ_ACTOR_MESSAGING_SCHEMA = "qq.actor-messaging-enable/v1";
export const QQ_ACTOR_MESSAGING_CUSTOM_TYPE = "qq-actor-messaging";
const ENABLE_PATH_PARTS = ["qq", "actor-messaging", "enable.json"];
const MESSAGE_SCHEMA = "qq.actor-message/v1";
const MESSAGE_KIND = "actor.message";
const ATTENTION_KIND = "attention-needed";
const LIFECYCLE_KIND = "pi.lifecycle";
const CRITICAL_ATTEMPT_KIND = "pi.critical-abort";
const RECEIVER_WAIT_MS = 30_000;
const RECEIVER_RECONNECT_MS = 250;
const MAX_STATUS_WAIT_MS = 30_000;
const ONE_OFF_REPLY_TTL_MS = 30_000;
// These match T-209.16's exact wire grammar rather than accepting values the
// Event Plane will later refuse.
const LOGICAL_ID = /^[a-z][a-z0-9-]{0,62}\/[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/;
const PRODUCT_ID = /^[a-z][a-z0-9-]{0,62}$/;
const KIND_ID = /^[a-z][a-z0-9.-]{0,126}$/;
const TOKEN_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,190}$/;
const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
const ROLE_NAMES = new Set(["architect", "coordinator", "change_owner"]);
const MESSAGE_TYPES = new Set(["message", "question", "reply", "action"]);
const URGENCIES = new Set(["default", "urgent", "critical"]);
const MODEL_URGENCIES = new Set(["default", "urgent"]);
const TRANSPORT_TO_READABLE = Object.freeze({
  pending: "pending",
  in_flight: "delivering",
  acknowledged: "delivered",
  blocked: "blocked",
  expired: "expired—undelivered",
  disposed: "disposed",
});
const VALID_ENABLE_FIELDS = new Set(["schema", "version", "enabled", "product_id", "event_plane_socket", "actor"]);
const VALID_ACTOR_FIELDS = new Set(["role", "change", "pane", "session_file", "session_id"]);
const VALID_RECORD_FIELDS = new Set(["origin_id", "content", "kind", "correlation_id", "urgency", "critical"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function boundedText(value, label, maximum = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.includes("\0")) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}

function optionalBoundedText(value, label, maximum = 4096) {
  return value === undefined ? undefined : boundedText(value, label, maximum);
}

function parseStrictJson(text) {
  let value;
  try {
    value = JSON.parse(text, (key, item) => item);
  } catch {
    throw new Error("record is not strict JSON");
  }
  if (text.includes("\uFFFD")) throw new Error("record contains replacement text");
  return value;
}

function duplicateKeys(text) {
  const found = [];
  let inString = false;
  let escaped = false;
  let keyStart = -1;
  const stack = [new Set()];
  const paths = [""];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
        let cursor = index + 1;
        while (/\s/.test(text[cursor] ?? "")) cursor += 1;
        if (text[cursor] === ":") {
          const key = text.slice(keyStart, index + 1);
          let parsed;
          try {
            parsed = JSON.parse(key);
          } catch {
            parsed = undefined;
          }
          if (typeof parsed === "string") {
            const scope = stack[stack.length - 1];
            if (scope.has(parsed)) found.push(`${paths[paths.length - 1]}${parsed}`);
            scope.add(parsed);
          }
        }
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      keyStart = index;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(new Set());
      paths.push(paths[paths.length - 1]);
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      paths.pop();
      if (stack.length === 0) return ["<malformed>"];
    }
  }
  return found;
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw new Error("value is not canonical JSON");
}

function normalizeConfigPath(env) {
  const raw = env.XDG_CONFIG_HOME;
  if (raw !== undefined && raw !== "") {
    const absolute = resolve(raw);
    if (absolute === raw) return absolute;
  }
  const home = env.HOME;
  if (typeof home !== "string" || home === "") return undefined;
  const resolvedHome = resolve(home);
  if (resolvedHome !== home) return undefined;
  return join(resolvedHome, ".config");
}

function resolveSessionFile(config) {
  const session = config.session_file;
  if (session === undefined) return undefined;
  return resolve(session) === session ? session : undefined;
}

async function assertSafeEnableFile(path) {
  const stat = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw new Error("enable record cannot be inspected");
  });
  if (stat === undefined) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 16384) {
    throw new Error("enable record is not one operator-owned private regular file");
  }
  const canonical = await realpath(path).catch(() => undefined);
  if (canonical !== path) throw new Error("enable record does not resolve to its exact canonical path");
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const handleStat = await handle.stat();
    if (handleStat.dev !== stat.dev || handleStat.ino !== stat.ino) throw new Error("enable record changed during open");
    const text = await handle.readFile({ encoding: "utf8", flag: fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) });
    if (text.length !== stat.size) throw new Error("enable record changed while reading");
    return text;
  } finally {
    await handle.close();
  }
}

async function assertSafeEnableNamespace(path, env = process.env) {
  const homeRoot = env.HOME ? resolve(env.HOME) : undefined;
  let current = dirname(path);
  let first = true;
  while (true) {
    const stat = await lstat(current).catch(() => undefined);
    if (!stat) {
      if (first) return;
      throw new Error("enable record namespace is unavailable");
    }
    first = false;
    if (stat.isSymbolicLink()) throw new Error("enable record namespace contains a symlink");
    const atHomeBoundary = homeRoot !== undefined && current === homeRoot;
    if (stat.uid !== process.getuid() && !atHomeBoundary) throw new Error("enable record namespace is not operator-owned");
    if ((stat.mode & 0o077) !== 0 && !atHomeBoundary) throw new Error("enable record namespace is writable by group or others");
    const canonical = await realpath(current).catch(() => undefined);
    if (canonical !== current) throw new Error("enable record namespace does not resolve canonically");
    if (atHomeBoundary) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function enableRecordPath(env = process.env) {
  const configRoot = normalizeConfigPath(env);
  if (!configRoot) return undefined;
  return join(configRoot, ...ENABLE_PATH_PARTS);
}

export async function readEnableRecord(env = process.env, path = enableRecordPath(env)) {
  if (typeof path !== "string" || resolve(path) !== path) throw new Error("enable record path is not canonical");
  await assertSafeEnableNamespace(path, env);
  const text = await assertSafeEnableFile(path);
  if (text === undefined) return undefined;
  const duplicates = duplicateKeys(text);
  if (duplicates.length) throw new Error(`enable record has duplicate field ${duplicates[0]}`);
  const record = parseStrictJson(text);
  if (!isObject(record) || !exactKeys(record, VALID_ENABLE_FIELDS)) throw new Error("enable record has an invalid shape");
  if (record.schema !== QQ_ACTOR_MESSAGING_SCHEMA || record.version !== 1) throw new Error("enable record schema/version is unsupported");
  if (typeof record.enabled !== "boolean") throw new Error("enable record enabled flag is malformed");
  if (!PRODUCT_ID.test(record.product_id ?? "")) throw new Error("enable record Product ID is malformed");
  if (typeof record.event_plane_socket !== "string" || record.event_plane_socket.length > 4096 || record.event_plane_socket.includes("\0") || resolve(record.event_plane_socket) !== record.event_plane_socket) {
    throw new Error("enable record Event Plane socket is not one canonical absolute path");
  }
  if (!isObject(record.actor) || !exactKeys(record.actor, VALID_ACTOR_FIELDS)) throw new Error("enable record actor has an invalid shape");
  if (!ROLE_NAMES.has(record.actor.role)) throw new Error("enable record actor role is unsupported");
  if (record.actor.role === "change_owner" ? !boundedText(record.actor.change, "Change identity", 191) : record.actor.change !== undefined) {
    throw new Error("enable record actor Change identity is invalid");
  }
  const actorIdentity = record.actor.role === "change_owner" ? `${record.product_id}/change/${record.actor.change}` : `${record.product_id}/${record.actor.role}`;
  if (!LOGICAL_ID.test(actorIdentity)) throw new Error("enable record actor identity is not Event Plane compatible");
  if (!PANE_ID.test(record.actor.pane ?? "")) throw new Error("enable record actor pane is malformed");
  if (resolveSessionFile(record.actor) === undefined && record.actor.session_file !== undefined) throw new Error("enable record session file is not absolute");
  optionalBoundedText(record.actor.session_id, "session ID", 128);
  if (record.enabled !== true) return undefined;
  return {
    schema: record.schema,
    version: record.version,
    product_id: record.product_id,
    event_plane_socket: record.event_plane_socket,
    actor: {
      role: record.actor.role,
      change: record.actor.change,
      pane: record.actor.pane,
      session_file: record.actor.session_file,
      session_id: record.actor.session_id,
    },
    path,
  };
}

function guardFromDelivery(delivery) {
  return {
    obligation_id: delivery.obligation.obligation_id,
    event_id: delivery.record.event_id,
    consumer_type: delivery.obligation.consumer_type,
    consumer_id: delivery.obligation.consumer_id,
    generation: delivery.obligation.generation,
    attempt_token: delivery.attempt_token,
    endpoint_token: delivery.endpoint_token,
    expected_high_water: delivery.guard.expected_high_water,
    expected_gap_token: delivery.guard.expected_gap_token,
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function displayIdentity(config) {
  return config.actor.role === "change_owner" ? `${config.product_id}/change/${config.actor.change}` : `${config.product_id}/${config.actor.role}`;
}

function requestHash(fields) {
  return sha256Text(canonical(fields)).slice(0, 24);
}

function parseMessagePayload(record) {
  const envelope = record?.envelope;
  const payload = envelope?.payload;
  if (!isObject(payload) || payload.schema !== MESSAGE_SCHEMA) return undefined;
  if (!isObject(payload.record) || !exactKeys(payload.record, VALID_RECORD_FIELDS)) return undefined;
  const value = payload.record;
  if (!LOGICAL_ID.test(value.origin_id ?? "") || !KIND_ID.test(value.kind ?? "")) return undefined;
  if (!MESSAGE_TYPES.has(value.kind)) return undefined;
  if (typeof value.content !== "string" || value.content.length === 0 || value.content.length > 65536) return undefined;
  if (value.correlation_id !== undefined && !TOKEN_ID.test(value.correlation_id)) return undefined;
  if (!URGENCIES.has(value.urgency ?? "default")) return undefined;
  if (value.urgency === "critical" ? value.critical !== true : value.critical !== undefined && value.critical !== false) return undefined;
  if ((value.kind === "question" || value.kind === "reply") && !value.correlation_id) return undefined;
  // The Event Plane wire record and its actor payload are one authority, not
  // two chances to choose an identity. Refuse any semantic mismatch before it
  // can enter pending state, be rendered as another Actor, or gain reply custody.
  if (record.record_type !== "send" || envelope.record_type !== "send") return undefined;
  if (record.kind !== MESSAGE_KIND || envelope.kind !== MESSAGE_KIND) return undefined;
  if (record.schema_version !== 1 || envelope.schema_version !== 1) return undefined;
  if (record.origin_id !== value.origin_id || envelope.origin_id !== value.origin_id) return undefined;
  if (record.recipient_id !== envelope.recipient_id || record.product_id !== envelope.product_id) return undefined;
  if (envelope.correlation_id !== value.correlation_id) return undefined;
  return {
    schema: payload.schema,
    record: value,
    correlation_id: value.correlation_id,
    urgency: value.urgency ?? "default",
    content_hash: sha256Text(value.content),
  };
}

function renderMessage(parsed, record) {
  const lines = [
    `qq Actor message ${record.event_id}`,
    `from: ${parsed.record.origin_id}`,
    `to: ${record.recipient_id}`,
    `kind: ${parsed.record.kind}`,
    `urgency: ${parsed.urgency}`,
    `correlation: ${parsed.correlation_id ?? "none"}`,
    `content_hash: ${parsed.content_hash}`,
    "",
    parsed.record.content,
  ];
  return lines.join("\n");
}

const SOURCE_FINGERPRINT_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;

/** The accountable session's real source fence, read from the environment the
 * accountable-session machinery stamps. Undefined (fail-closed) when absent. */
function sourceFingerprintBinding(env) {
  const value = {
    operation_cursor: env.QQ_OPERATION_CURSOR,
    role_source_fingerprint: env.QQ_ROLE_SOURCE_FINGERPRINT,
    source_fingerprint: env.QQ_SOURCE_FINGERPRINT,
  };
  for (const key of Object.keys(value)) {
    if (!SOURCE_FINGERPRINT_VALUE.test(value[key] ?? "")) return undefined;
  }
  return value;
}

function resolveBindingExecutable(env) {
  const configured = env.QQ_ACTOR_BINDING_BIN;
  if (configured === undefined || configured === "") return "qq-actor-binding";
  return typeof configured === "string" && configured.length <= 4096 && isAbsolute(configured) ? configured : undefined;
}

function resolveHerdrExecutable(env) {
  const configured = env.QQ_HERDR_BIN;
  if (configured === undefined || configured === "") return "herdr";
  return typeof configured === "string" && configured.length <= 4096 && isAbsolute(configured) ? configured : undefined;
}

function bindingCliArgs(action, facts, repository, extra) {
  const args = [action, "--repo", repository, "--product", facts.product, "--role", facts.role];
  if (facts.change !== undefined) args.push("--change", facts.change);
  if (action === "classify" || action === "guard") {
    args.push(
      "--pane", facts.pane,
      "--role-source-fingerprint", facts.source.role_source_fingerprint,
      "--source-fingerprint", facts.source.source_fingerprint,
      "--operation-cursor", facts.source.operation_cursor,
    );
  }
  return [...args, ...(extra ?? [])];
}

function parseBindingStdout(result) {
  try {
    const value = JSON.parse(result?.stdout);
    return result?.code === 0 && value?.ok === true ? value.result : undefined;
  } catch {
    return undefined;
  }
}

function bindingStdoutFailure(result, defaultMessage) {
  try {
    const value = JSON.parse(result?.stdout);
    return value?.error?.message ?? result?.stderr?.trim() ?? defaultMessage;
  } catch {
    return result?.stderr?.trim() ?? defaultMessage;
  }
}

function defaultRunCommand(command, args, options) {
  return new Promise((resolveRun) => {
    execFileCallback(command, args, { ...options, encoding: "utf8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolveRun({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

function normalizeResponse(result, status) {
  return { ...result, status, record_status: result.record_status ?? result };
}

function defaultNow() {
  return Date.now();
}

export default async function register(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const recordPath = deps.enablePath ?? enableRecordPath(env);
  let record;
  if (deps.enableRecord !== undefined) {
    record = deps.enableRecord === null ? undefined : deps.enableRecord;
  } else {
    try {
      record = await readEnableRecord(env, recordPath);
    } catch {
      // Invalid, unsupported, or unsafe activation state is production-inert.
      // The explicit reader still throws for diagnostics, but the mounted
      // extension must not perturb the rest of qq's methodology surface.
      return;
    }
  }
  if (record === undefined) return;

  const now = deps.now ?? defaultNow;
  const clientFactory = deps.clientFactory ?? ((socketPath) => new EventPlaneClient(socketPath));
  const bindingSource = sourceFingerprintBinding(env);
  const runCommand = deps.run ?? defaultRunCommand;
  const repositoryRoot = resolve(deps.cwd ?? process.cwd());
  const bindingExecutable = resolveBindingExecutable(env);
  const herdrExecutable = resolveHerdrExecutable(env);
  const bindingCall = deps.bindingCall ?? (async (action, facts, extra = []) => {
    if (!bindingExecutable) return { value: undefined, reason: "QQ_ACTOR_BINDING_BIN is not one bounded absolute executable path" };
    if (!bindingSource && action !== "inspect") return { value: undefined, reason: "accountable source fingerprints are unavailable" };
    const result = await runCommand(bindingExecutable, bindingCliArgs(action, facts, repositoryRoot, extra), { cwd: repositoryRoot });
    return { value: parseBindingStdout(result), reason: bindingStdoutFailure(result, `${action} binding operation failed`) };
  });
  const listPanes = deps.listPanes ?? (async () => {
    if (!herdrExecutable) return [];
    const result = await runCommand(herdrExecutable, ["agent", "list"], { cwd: repositoryRoot });
    if (result.code !== 0) return [];
    let agents;
    try {
      const value = JSON.parse(result.stdout);
      agents = value?.result?.agents ?? value?.agents ?? [];
    } catch {
      return [];
    }
    return (Array.isArray(agents) ? agents : [])
      .filter((agent) => agent && PANE_ID.test(agent.pane_id ?? ""))
      .map((agent) => ({ pane_id: agent.pane_id, agent: agent.agent, agent_session: agent.agent_session }));
  });
  const sessionRead = deps.sessionRead ?? (async (path) => readFile(path, "utf8"));
  const actorAuthorities = deps.actorAuthorities ?? (async () => {
    const cwd = deps.cwd ?? process.cwd();
    const tasksDir = join(cwd, "backlog", "tasks");
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(tasksDir, { withFileTypes: true }).catch(() => []);
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = join(tasksDir, entry.name);
      const text = await readFile(path, "utf8").catch(() => "");
      const id = /^id:\s*(T-[A-Za-z0-9][A-Za-z0-9._-]*)\s*$/m.exec(text)?.[1];
      const active = /^status:\s*Active\s*$/m.test(text);
      const assigneeMatch = /^assignee:\s*\n\s*-\s*(?:'(@?[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,253})'|"(@?[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,253})"|(@?[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,253}))\s*$/m.exec(text);
      const assignee = assigneeMatch?.slice(1).find(Boolean);
      if (id && active && assignee) tasks.push({ id, assignee, path });
    }
    return tasks;
  });
  const sleep = deps.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  const abortableSleep = deps.abortableSleep ?? (async (ms, shouldStop) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !shouldStop()) await sleep(Math.min(50, deadline - Date.now()));
  });

  const client = clientFactory(record.event_plane_socket);
  const display = displayIdentity(record);
  const consumerId = display;
  const consumerEndpoint = {
    consumer_type: "recipient",
    consumer_id: consumerId,
    generation: 0,
    endpoint_token: `qq-actor-messaging/${randomUUID()}`,
  };
  const pending = new Map();
  const statuses = new Map();
  const correlations = new Map();
  const sessionState = {
    phase: "inactive",
    epoch: 0,
    reason: "never_started",
    started_at: 0,
    session_file: undefined,
    session_id: undefined,
  };
  let ctxNow;
  let publishActive = false;
  let receiverActive = false;
  let receiverStopped = false;

  const updateStatus = (eventId, patch) => {
    const current = statuses.get(eventId) ?? {};
    statuses.set(eventId, { ...current, ...patch });
  };

  const releaseEntry = (entry) => {
    if (entry?.event_id) pending.delete(entry.event_id);
  };

  const stopAuthorization = (reason) => {
    sessionState.phase = "inactive";
    receiverStopped = true;
    sessionState.reason = reason;
  };

  async function exactBindingState() {
    const reply = await bindingCall("classify", {
      product: record.product_id,
      role: record.actor.role,
      change: record.actor.change,
      pane: record.actor.pane,
      source: bindingSource,
    });
    if (reply?.value?.state) return { state: reply.value.state, record: reply.value.record };
    return { state: reply?.state ?? "unbound", record: reply?.record, reason: reply?.reason };
  }

  async function requireCurrentBinding(reason) {
    const state = await exactBindingState();
    if (state.state !== "current") {
      const detail = state.reason ?? state.state;
      throw Object.assign(new Error(`${reason} refused: exact T-189 binding is ${detail}`), { code: "binding_refused", binding_state: state.state });
    }
    return state;
  }

  function requireSessionIdentity(reason) {
    const currentFile = ctxNow?.sessionManager?.getSessionFile?.();
    const currentId = ctxNow?.sessionManager?.getSessionId?.();
    if (sessionState.session_file !== currentFile || sessionState.session_id !== currentId) {
      throw Object.assign(new Error(`${reason} refused: current Pi session changed after authorization`), { code: "session_mismatch" });
    }
    if (record.actor.session_file !== undefined && record.actor.session_file !== currentFile) {
      throw Object.assign(new Error(`${reason} refused: enable-record session file differs from current Pi session`), { code: "session_mismatch" });
    }
    if (record.actor.session_id !== undefined && record.actor.session_id !== currentId) {
      throw Object.assign(new Error(`${reason} refused: enable-record session ID differs from current Pi session`), { code: "session_mismatch" });
    }
  }

  async function requireAuthorizedEffect(reason) {
    const epoch = sessionState.epoch;
    if (sessionState.phase !== "active") {
      throw Object.assign(new Error(`${reason} refused: session has no exact current T-189 authorization`), { code: "authorization_refused" });
    }
    requireSessionIdentity(reason);
    await requireCurrentBinding(reason);
    // A queued operation must not survive a session reset or a failed
    // replacement start merely because its earlier cached check passed.
    if (epoch !== sessionState.epoch || sessionState.phase !== "active") {
      throw Object.assign(new Error(`${reason} refused: session authorization changed before the effect`), { code: "authorization_refused" });
    }
    requireSessionIdentity(reason);
  }

  function bindingFacts() {
    return {
      product: record.product_id,
      role: record.actor.role,
      change: record.actor.change,
      pane: record.actor.pane,
      source: bindingSource,
    };
  }

  async function guardAcknowledgement() {
    await requireAuthorizedEffect("acknowledgement");
    const epoch = sessionState.epoch;
    const reply = await bindingCall("guard", bindingFacts(), ["--acknowledgement"]).catch((error) => ({ value: undefined, reason: error instanceof Error ? error.message : String(error) }));
    if (!reply?.value) {
      throw Object.assign(new Error(`acknowledgement refused: T-189 acknowledgement guard is ${reply?.reason ?? "unavailable"}`), { code: "binding_refused" });
    }
    // The guard itself is asynchronous. Close its shutdown/replacement window
    // synchronously before the adjacent Event Plane acknowledgement call.
    if (epoch !== sessionState.epoch || sessionState.phase !== "active") {
      throw Object.assign(new Error("acknowledgement refused: session changed while T-189 guard was running"), { code: "authorization_refused" });
    }
    requireSessionIdentity("acknowledgement");
    return reply.value;
  }

  async function listActorCandidatesInternal() {
    const [panes, tasks] = await Promise.all([listPanes(), actorAuthorities()]);
    const paneById = new Map((Array.isArray(panes) ? panes : []).filter((pane) => pane && PANE_ID.test(pane.pane_id ?? "")).map((pane) => [pane.pane_id, pane]));
    const taskById = new Map((Array.isArray(tasks) ? tasks : []).filter((task) => typeof task?.id === "string").map((task) => [task.id, task]));
    const candidates = [];
    const add = async (role, change, subject) => {
      let binding;
      try {
        binding = await bindingCall("inspect", { product: record.product_id, role, change });
      } catch (error) {
        binding = { reason: error instanceof Error ? error.message : String(error) };
      }
      const value = binding?.value ?? binding?.record;
      if (!value?.current) return;
      const current = value.current;
      const pane = paneById.get(current.pane_id);
      const connected = current.runtime_active === true && current.read_only !== true;
      if (!connected || !pane || pane.agent !== "pi") return;
      const session = pane.agent_session?.value;
      if (typeof session !== "string" || !session.startsWith("/")) return;
      const identity = role === "change_owner" ? `${record.product_id}/change/${change}` : `${record.product_id}/${role}`;
      candidates.push({
        actor: identity,
        display: identity,
        role,
        change: change ?? null,
        pane_id: current.pane_id,
        session_file: session,
        task: subject ?? null,
        evidence: ["product", "actor_binding", "herdr", "connection"],
      });
    };
    await add("architect");
    await add("coordinator");
    for (const task of taskById.values()) {
      await add("change_owner", task.id, task.id);
    }
    return candidates;
  }

  async function ensureActorIsDurable(recipient, { initiatedThread = false } = {}) {
    if (!LOGICAL_ID.test(recipient)) throw new Error("recipient must be a readable logical Actor");
    const product = recipient.split("/", 1)[0];
    if (product !== record.product_id) throw new Error("recipient crosses the enabled Product boundary");
    // A reply on an already-received initiated thread may return only to that
    // exact one-off origin. It does not add the origin to durable discovery.
    if (initiatedThread) return recipient;
    const candidates = await listActorCandidatesInternal();
    if (!candidates.some((candidate) => candidate.actor === recipient)) {
      throw new Error("recipient is not a current accountable Actor proven by Product, Task/binding, Herdr, and connection evidence");
    }
    return recipient;
  }

  async function sendRecord({ kind, recipient, content, correlationId, urgency = "default", critical = false, origin, requestId }) {
    if (sessionState.phase !== "active") throw new Error("outbound refused: session is not bound to an exact current T-189 source");
    if (!MESSAGE_TYPES.has(kind)) throw new Error("message kind is unsupported");
    if (!URGENCIES.has(urgency)) throw new Error("urgency is unsupported");
    if (urgency === "critical" && critical !== true) throw new Error("critical urgency requires explicit critical:true");
    const bodyContent = boundedText(content, "message content", 65536);
    let correlation = correlationId;
    if (correlation !== undefined && !TOKEN_ID.test(correlation)) throw new Error("correlation_id is malformed");
    if (kind === "question" && correlation === undefined) {
      correlation = `corr_${requestHash({ recipient, content: bodyContent, origin: origin ?? display })}`;
    }
    if (kind === "reply" && !correlation) throw new Error("reply requires correlation_id");
    const inboundThread = kind === "reply" ? correlations.get(correlation) : undefined;
    const initiatedThread = kind === "reply" && Boolean(inboundThread?.origin_id) && recipient === inboundThread.origin_id;
    const target = await ensureActorIsDurable(recipient, { initiatedThread });
    // A one-off origin gets one connected receive window. Its deadline was
    // fixed when the inbound event was accepted, so response-loss retries keep
    // the same request ID and exact normalized Event Plane bytes.
    const deadlineAt = initiatedThread ? inboundThread.reply_deadline_at : undefined;
    if (initiatedThread && !Number.isSafeInteger(deadlineAt)) throw new Error("initiated reply has no stable custody deadline");
    const request = requestId ?? `req_${requestHash({ kind, target, content: bodyContent, correlation, urgency, critical, origin: origin ?? display, deadlineAt })}`;
    if (!TOKEN_ID.test(request)) throw new Error("request_id is malformed");
    // T-209.16 owns request idempotence and conflicting-content refusal. The
    // adapter keeps no parallel request map or shadow custody state.
    await requireAuthorizedEffect("outbound send");
    const messageRecord = {
      origin_id: origin ?? display,
      content: bodyContent,
      kind,
      urgency,
      critical,
    };
    if (correlation !== undefined) messageRecord.correlation_id = correlation;
    const envelope = {
      producer_id: `${display}/adapter`,
      request_id: request,
      origin_id: origin ?? display,
      recipient_id: target,
      product_id: record.product_id,
      kind: MESSAGE_KIND,
      schema_version: 1,
      payload: { schema: MESSAGE_SCHEMA, record: messageRecord },
    };
    if (correlation !== undefined) envelope.correlation_id = correlation;
    if (deadlineAt !== undefined) envelope.deadline_at = deadlineAt;
    const result = await client.send(envelope);
    const eventId = result.record.event_id;
    const state = { transport: "accepted", event_id: eventId, request_id: request, kind, recipient: target, correlation_id: correlation };
    statuses.set(eventId, state);
    if (correlation) {
      const existing = correlations.get(correlation) ?? { answered: false, resolved: false };
      const patch = kind === "question"
        ? { question_event_id: eventId, answered: false, resolved: existing.resolved === true }
        : kind === "reply"
          ? { reply_event_id: eventId, answered: true, resolved: existing.resolved === true }
          : {};
      correlations.set(correlation, { ...existing, ...patch });
    }
    updateStatus(eventId, { transport: result.obligation_count === 0 ? "disposed" : "accepted" });
    return normalizeResponse({ ...result, ...state }, "accepted");
  }

  async function publishFact({ kind, payload = {}, origin, requestId, correlationId }) {
    if (sessionState.phase !== "active") throw new Error("outbound refused: session is not bound to an exact current T-189 source");
    if (!KIND_ID.test(kind ?? "")) throw new Error("fact kind is unsupported");
    if (correlationId !== undefined && !TOKEN_ID.test(correlationId)) throw new Error("correlation_id is malformed");
    const request = requestId ?? `req_${requestHash({ kind, payload, origin: origin ?? display, correlationId })}`;
    if (!TOKEN_ID.test(request)) throw new Error("request_id is malformed");
    await requireAuthorizedEffect("outbound publish");
    const envelope = {
      producer_id: `${display}/adapter`,
      request_id: request,
      origin_id: origin ?? display,
      product_id: record.product_id,
      kind,
      schema_version: 1,
      payload,
    };
    if (correlationId !== undefined) envelope.correlation_id = correlationId;
    const result = await client.publish(envelope);
    return normalizeResponse(result, "accepted");
  }

  async function readReceipt(entry) {
    const parsed = entry.parsed;
    const expectedFile = record.actor.session_file ?? ctxNow?.sessionManager?.getSessionFile?.();
    const expectedSession = record.actor.session_id ?? ctxNow?.sessionManager?.getSessionId?.();
    if (typeof expectedFile !== "string") return undefined;
    let text;
    try {
      text = await sessionRead(expectedFile);
    } catch (error) {
      // Pi allocates a path before a brand-new session has any JSONL to write.
      // Its own metadata-only startup state (or isPersisted=false) makes that
      // one ENOENT a proven empty transcript, not an unavailable scan. Once Pi
      // has a content/custom entry (or cannot say), absence still fails closed.
      const loadedEntries = ctxNow?.sessionManager?.getEntries?.();
      const onlyUnpersistedStartupMetadata = Array.isArray(loadedEntries) && loadedEntries.every((entry) => entry?.type === "model_change" || entry?.type === "thinking_level_change");
      const provenEmpty = ctxNow?.sessionManager?.isPersisted?.() === false || onlyUnpersistedStartupMetadata;
      if (error?.code === "ENOENT" && provenEmpty) return undefined;
      throw Object.assign(new Error("persisted-session readback is unavailable"), { code: "readback_unavailable" });
    }
    let found;
    for (const line of text.split("\n")) {
      if (!line) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      if (item?.type !== "custom_message" || item.customType !== QQ_ACTOR_MESSAGING_CUSTOM_TYPE) continue;
      if (expectedSession !== undefined && item.session_id !== undefined && item.session_id !== expectedSession) continue;
      const content = typeof item.content === "string" ? item.content : "";
      if (!content.includes(entry.event_id) || !content.includes(parsed.content_hash)) continue;
      const details = isObject(item.details) ? item.details : {};
      if (details.event_id !== entry.event_id || details.content_hash !== parsed.content_hash || details.schema !== MESSAGE_SCHEMA) continue;
      if (typeof item.id !== "string" || item.id.length === 0) continue;
      found = {
        entry_id: item.id,
        parent_id: item.parentId,
        session_file: expectedFile,
        critical_outcome: details.critical_outcome === "interrupted" || details.critical_outcome === "abort-ignored" || details.critical_outcome === "unknown" ? details.critical_outcome : undefined,
      };
    }
    return found;
  }

  async function completeDelivery(entry, receipt, reason) {
    await guardAcknowledgement();
    const result = await client.acknowledge(guardFromDelivery(entry.delivery));
    const delivered = { transport: "delivered", receipt, ack_result: result, receipt_reason: reason };
    if (entry.criticalOutcome) delivered.critical_outcome = entry.criticalOutcome;
    updateStatus(entry.event_id, delivered);
    const correlation = entry.parsed.correlation_id;
    if (correlation) {
      const existing = correlations.get(correlation) ?? { answered: false, resolved: false };
      const acceptedAt = Number.isSafeInteger(entry.record.accepted_at) ? entry.record.accepted_at : now();
      correlations.set(correlation, {
        ...existing,
        delivered: true,
        reply_deadline_at: existing.reply_deadline_at ?? acceptedAt + ONE_OFF_REPLY_TTL_MS,
        receipt,
        origin_id: entry.parsed.record.origin_id,
        inbound_event_id: entry.event_id,
        answered: entry.parsed.record.kind === "reply" || existing.answered === true,
        resolved: existing.resolved === true,
      });
    }
    releaseEntry(entry);
  }

  async function returnDelivery(entry, reason, blocked = false) {
    await requireAuthorizedEffect(blocked ? "delivery block" : "delivery retry");
    const operation = blocked ? "block" : "retry";
    const result = await client[operation]({ ...guardFromDelivery(entry.delivery), reason });
    updateStatus(entry.event_id, {
      transport: blocked ? "blocked" : "pending",
      last_reason: reason,
      [`${operation}_result`]: result,
    });
    releaseEntry(entry);
  }

  function isAuthorizationFailure(error) {
    return error?.code === "binding_refused" || error?.code === "session_mismatch" || error?.code === "authorization_refused";
  }

  async function handleDeliveryFailure(entry, error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isAuthorizationFailure(error)) {
      // The exact successor owns recovery. A stale pane performs no Event Plane
      // disposition and discards only its provisional process-local state.
      stopAuthorization(reason);
      updateStatus(entry.event_id, { transport: "blocked", last_reason: reason, local_only: true });
      releaseEntry(entry);
      return;
    }
    try {
      await returnDelivery(entry, reason, error?.code === "unsupported_payload");
    } catch (dispositionError) {
      if (isAuthorizationFailure(dispositionError)) stopAuthorization(dispositionError.message);
      updateStatus(entry.event_id, {
        transport: "pending",
        last_reason: reason,
        disposition_error: dispositionError instanceof Error ? dispositionError.message : String(dispositionError),
      });
      // The attempt lease remains the only recovery state when disposition is
      // unavailable; never retain a second local custody loop.
      releaseEntry(entry);
    }
  }

  async function queueMessage(entry) {
    await requireAuthorizedEffect("delivery injection");
    const parsed = entry.parsed;
    const sendMessage = deps.sendMessage ?? pi.sendMessage?.bind(pi);
    if (typeof sendMessage !== "function") throw new Error("current Pi sendMessage seam is unavailable");
    const options = ctxNow?.isIdle?.() === false
      ? { triggerTurn: parsed.urgency !== "critical", deliverAs: "steer" }
      : { triggerTurn: parsed.urgency !== "critical" };
    entry.phase = "queued";
    updateStatus(entry.event_id, { phase: entry.phase });
    await sendMessage({
      customType: QQ_ACTOR_MESSAGING_CUSTOM_TYPE,
      content: renderMessage(parsed, entry.record),
      display: true,
      details: {
        schema: MESSAGE_SCHEMA,
        event_id: entry.event_id,
        correlation_id: parsed.correlation_id,
        content_hash: parsed.content_hash,
        kind: parsed.record.kind,
        urgency: parsed.urgency,
        critical_outcome: entry.criticalOutcome,
      },
    }, options);
  }


  const criticalRequestId = (entry) => `critical_${requestHash({ event_id: entry.event_id, content_hash: entry.parsed.content_hash })}`;

  function criticalClaimPayload(entry) {
    return {
      schema: MESSAGE_SCHEMA,
      fact: "critical-abort-claim",
      event_id: entry.event_id,
      content_hash: entry.parsed.content_hash,
    };
  }

  function validateCriticalClaim(eventRecord, entry) {
    const payload = eventRecord?.envelope?.payload;
    if (eventRecord?.kind !== CRITICAL_ATTEMPT_KIND || payload?.schema !== MESSAGE_SCHEMA || payload?.fact !== "critical-abort-claim" || payload?.event_id !== entry.event_id || payload?.content_hash !== entry.parsed.content_hash) {
      throw new Error("critical abort claim record is malformed or mismatched");
    }
  }

  async function claimCriticalAbort(entry) {
    const requestId = criticalRequestId(entry);
    try {
      const result = await publishFact({
        kind: CRITICAL_ATTEMPT_KIND,
        correlationId: entry.event_id,
        requestId,
        payload: criticalClaimPayload(entry),
      });
      validateCriticalClaim(result.record, entry);
      return result.idempotent !== true;
    } catch (error) {
      if (error?.code !== "idempotency_conflict") throw error;
      await requireAuthorizedEffect("critical claim reconstruction");
      const result = await client.status({ producer_id: `${display}/adapter`, request_id: requestId, wait_ms: 0 });
      validateCriticalClaim(result.record, entry);
      return false;
    }
  }

  const currentRunSignal = () => ctxNow?.signal ?? ctxNow?.getSignal?.();

  function attemptCurrentRunAbort(targetSignal) {
    // Claim acceptance is asynchronous. Only the exact run captured before the
    // round trip may be interrupted; idle or successor runs are ignored.
    if (ctxNow?.isIdle?.() !== false || typeof ctxNow?.abort !== "function" || !targetSignal || targetSignal.aborted || currentRunSignal() !== targetSignal) return "abort-ignored";
    try {
      ctxNow.abort();
    } catch {
      return "abort-ignored";
    }
    return targetSignal.aborted ? "interrupted" : "abort-ignored";
  }

  async function resolveCriticalOutcome(entry) {
    const targetSignal = currentRunSignal();
    const claimed = await claimCriticalAbort(entry);
    if (!claimed) return statuses.get(entry.event_id)?.critical_outcome ?? "unknown";
    await requireAuthorizedEffect("critical abort");
    const outcome = attemptCurrentRunAbort(targetSignal);
    updateStatus(entry.event_id, { critical_outcome: outcome });
    return outcome;
  }

  async function driveDelivery(entry) {
    if (entry.driving || pending.get(entry.event_id) !== entry) return;
    entry.driving = true;
    try {
      await requireAuthorizedEffect("receive delivery");
      const receipt = await readReceipt(entry);
      if (receipt) {
        entry.criticalOutcome = receipt.critical_outcome ?? entry.criticalOutcome;
        await completeDelivery(entry, receipt, entry.phase === "queued" ? "persisted-session receipt" : "reconstructed persisted receipt");
        return;
      }
      if (entry.phase === "queued") return;
      if (entry.parsed.urgency === "urgent") {
        // Attention is a hint, not custody. Start it immediately but never hold
        // transcript delivery on its acceptance, refusal, or timeout.
        void publishFact({
          kind: ATTENTION_KIND,
          correlationId: entry.event_id,
          payload: {
            schema: MESSAGE_SCHEMA,
            fact: "attention-needed",
            event_id: entry.event_id,
            recipient_id: consumerId,
          },
        }).then(
          (result) => updateStatus(entry.event_id, { urgent_attention: "accepted", urgent_attention_record: result }),
          (error) => {
            if (isAuthorizationFailure(error)) stopAuthorization(error.message);
            updateStatus(entry.event_id, { urgent_attention: "unavailable", urgent_attention_reason: error instanceof Error ? error.message : String(error) });
          },
        );
      }
      if (entry.parsed.urgency === "critical") {
        entry.criticalOutcome = await resolveCriticalOutcome(entry);
      }
      await queueMessage(entry);
      const persisted = await readReceipt(entry);
      if (persisted) {
        entry.criticalOutcome = persisted.critical_outcome ?? entry.criticalOutcome;
        await completeDelivery(entry, persisted, "persisted-session receipt");
      }
    } catch (error) {
      await handleDeliveryFailure(entry, error);
    } finally {
      entry.driving = false;
    }
  }

  async function drivePending() {
    for (const entry of [...pending.values()]) await driveDelivery(entry);
  }

  async function processDelivery(delivery) {
    const message = delivery.record?.product_id === record.product_id && delivery.record?.recipient_id === consumerId
      ? parseMessagePayload(delivery.record)
      : undefined;
    const rejected = { delivery, record: delivery.record, event_id: delivery.record?.event_id, parsed: message };
    if (!message) throw Object.assign(new Error("unsupported actor message payload"), { code: "unsupported_payload", entry: rejected });
    const existing = pending.get(rejected.event_id);
    if (existing) {
      if (existing.parsed.content_hash !== message.content_hash) {
        throw Object.assign(new Error("redelivered Event Plane event changed actor-message content"), { code: "unsupported_payload", entry: existing });
      }
      // Redelivery within this adapter instance transfers only the current
      // guarded attempt; one driver preserves the current phase.
      existing.delivery = delivery;
      existing.record = delivery.record;
      updateStatus(existing.event_id, { transport: "delivering", redelivered: true });
      await driveDelivery(existing);
      return;
    }
    const entry = { ...rejected, phase: "admitted", driving: false, criticalOutcome: undefined };
    pending.set(entry.event_id, entry);
    updateStatus(entry.event_id, {
      transport: "delivering",
      phase: entry.phase,
      event_id: entry.event_id,
      kind: message.record.kind,
      correlation_id: message.correlation_id,
      urgency: message.urgency,
      content_hash: message.content_hash,
    });
    await driveDelivery(entry);
  }

  async function receiverLoop(reason) {
    if (receiverActive) return;
    receiverActive = true;
    receiverStopped = false;
    sessionState.reason = reason;
    try {
      while (sessionState.phase === "active" && !receiverStopped) {
        try {
          // `next` binds the Event Plane endpoint and is therefore itself inside
          // the T-189 receive boundary. A stale pane never claims an attempt.
          await requireAuthorizedEffect("receive");
          const result = await client.next({ ...consumerEndpoint, wait_ms: RECEIVER_WAIT_MS });
          if (result?.delivery) {
            const deliveryEntry = {
              delivery: result.delivery,
              record: result.delivery.record,
              event_id: result.delivery.record?.event_id,
            };
            await processDelivery(result.delivery).catch((error) => handleDeliveryFailure(error?.entry ?? pending.get(deliveryEntry.event_id) ?? deliveryEntry, error));
          }
          await drivePending();
        } catch (error) {
          if (isAuthorizationFailure(error)) {
            stopAuthorization(error.message);
            break;
          }
          if (sessionState.phase !== "active" || receiverStopped) break;
          await abortableSleep(RECEIVER_RECONNECT_MS, () => sessionState.phase !== "active" || receiverStopped);
        }
      }
    } finally {
      receiverActive = false;
    }
  }

  async function publicationLoop(reason) {
    if (publishActive) return;
    publishActive = true;
    try {
      while (sessionState.phase === "active") {
        try {
          const result = await publishFact({
            kind: LIFECYCLE_KIND,
            payload: {
              schema: MESSAGE_SCHEMA,
              fact: "session.lifecycle",
              product_id: record.product_id,
              actor: display,
              reason,
              started_at: sessionState.started_at,
              pane: record.actor.pane,
              session_file: sessionState.session_file,
              session_id: sessionState.session_id,
            },
          });
          return result;
        } catch (error) {
          if (isAuthorizationFailure(error)) {
            stopAuthorization(error.message);
            return;
          }
          await abortableSleep(RECEIVER_RECONNECT_MS, () => sessionState.phase !== "active");
        }
      }
    } finally {
      publishActive = false;
    }
  }

  async function configureSession(event, ctx) {
    ctxNow = ctx;
    sessionState.epoch += 1;
    const epoch = sessionState.epoch;
    sessionState.phase = "authorizing";
    receiverStopped = true;
    pending.clear();
    sessionState.reason = event?.reason ?? "startup";
    sessionState.started_at = now();
    sessionState.session_file = ctx?.sessionManager?.getSessionFile?.();
    sessionState.session_id = ctx?.sessionManager?.getSessionId?.();
    try {
      await requireCurrentBinding("session start");
      requireSessionIdentity("session start");
      if (epoch !== sessionState.epoch || sessionState.phase !== "authorizing") {
        throw Object.assign(new Error("session start refused: session changed during authorization"), { code: "authorization_refused" });
      }
      sessionState.phase = "active";
    } catch (error) {
      if (epoch === sessionState.epoch) sessionState.phase = "inactive";
      throw error;
    }
    void publicationLoop(sessionState.reason);
    void receiverLoop(sessionState.reason);
  }

  const messagingTool = {
    name: "actor_messaging",
    label: "Actor messaging",
    description: "Deterministic Event Plane Actor messaging for this explicitly enabled qq session. `publish` records a Product+kind fact/wake-up; `send` creates one addressed obligation to a readable logical accountable Actor; `question` correlates a question; `reply` answers a correlated message; `status` reports transport separately from application answered/resolved state. Runtime pane/session/event/attempt IDs are diagnostics, never addresses.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["publish", "send", "question", "reply", "status", "list_actors"] },
        kind: { type: "string" },
        payload: {},
        recipient: { type: "string" },
        content: { type: "string" },
        correlation_id: { type: "string" },
        request_id: { type: "string" },
        event_id: { type: "string" },
        // Critical is intentionally absent: a model can send default/urgent,
        // but only an already-authorized external producer can originate the
        // explicitly audited critical inbound path.
        urgency: { type: "string", enum: ["default", "urgent"] },
        wait_ms: { type: "integer", minimum: 0, maximum: MAX_STATUS_WAIT_MS },
      },
      required: ["action"],
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text", text: "Actor messaging cancelled before execution." }], details: { status: "cancelled" } };
      ctxNow = ctx;
      try {
        if (params.action === "publish") {
          if (typeof params.kind !== "string") throw new Error("publish requires a Product+kind fact kind");
          return {
            content: [{ type: "text", text: `Fact publication accepted for ${record.product_id}/${params.kind}.` }],
            details: await publishFact({ kind: params.kind, payload: params.payload ?? {}, requestId: params.request_id, correlationId: params.correlation_id }),
          };
        }
        if (params.action === "list_actors") {
          const actors = await listActorCandidatesInternal();
          return { content: [{ type: "text", text: actors.length ? actors.map((actor) => actor.actor).join("\n") : "No current accountable Actor is connected." }], details: { status: "current", actors } };
        }
        if (params.action === "status") {
          const selector = params.event_id ? { event_id: params.event_id } : params.request_id ? { producer_id: `${display}/adapter`, request_id: params.request_id } : params.correlation_id ? { correlation_id: params.correlation_id } : undefined;
          if (!selector) throw new Error("status requires event_id, request_id, or correlation_id");
          if (selector.correlation_id) {
            const state = correlations.get(selector.correlation_id);
            return { content: [{ type: "text", text: state ? `Correlation ${selector.correlation_id}: ${stableJson(state)}` : `Correlation ${selector.correlation_id} has no tracked state.` }], details: { status: state ? "tracked" : "unknown", correlation_id: selector.correlation_id, state } };
          }
          const waitMs = params.wait_ms ?? 0;
          if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > MAX_STATUS_WAIT_MS) throw new Error(`status wait_ms must be between 0 and ${MAX_STATUS_WAIT_MS}`);
          const result = await client.status({ ...selector, wait_ms: waitMs });
          const recordResult = result.record?.event_id ? statuses.get(result.record.event_id) : undefined;
          const readable = result.obligations?.map((item) => ({ ...item, readable_status: TRANSPORT_TO_READABLE[item.status] ?? item.status })) ?? [];
          const local = recordResult ? { local: recordResult } : {};
          return { content: [{ type: "text", text: stableJson({ ...result, obligations: readable, ...local }) }], details: { status: result.terminal_failure ? "failed" : "current", result, readable } };
        }
        if (params.action === "send" || params.action === "question" || params.action === "reply") {
          if (typeof params.recipient !== "string" && params.action !== "reply") throw new Error(`${params.action} requires a readable logical recipient`);
          if (typeof params.content !== "string") throw new Error(`${params.action} requires content`);
          let recipient = params.recipient;
          let origin = display;
          if (params.action === "reply") {
            const inbound = params.correlation_id ? correlations.get(params.correlation_id) : undefined;
            recipient = recipient ?? inbound?.origin_id;
            origin = display;
          }
          const messageKind = params.action === "send" ? "message" : params.action;
          const urgency = params.urgency ?? "default";
          if (!MODEL_URGENCIES.has(urgency)) throw new Error("agent-originated urgency must be default or urgent");
          const details = await sendRecord({
            kind: messageKind,
            recipient,
            content: params.content,
            correlationId: params.correlation_id,
            requestId: params.request_id,
            urgency,
            critical: false,
            origin,
          });
          return { content: [{ type: "text", text: `${params.action} accepted as ${details.event_id}.` }], details };
        }
        throw new Error("action is unsupported");
      } catch (error) {
        return {
          content: [{ type: "text", text: `Actor messaging refused: ${error instanceof Error ? error.message : String(error)}` }],
          details: { status: "refused", reason: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };

  pi.registerTool(messagingTool);
  pi.on("session_start", configureSession);

  pi.on("turn_start", async (_event, _ctx) => {
    await drivePending();
  });

  pi.on("message_end", async (_event, ctx) => {
    ctxNow = ctx;
    await drivePending();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    ctxNow = ctx;
    await drivePending();
  });

  pi.on("session_shutdown", () => {
    sessionState.epoch += 1;
    sessionState.phase = "inactive";
    receiverStopped = true;
    pending.clear();
  });
}
