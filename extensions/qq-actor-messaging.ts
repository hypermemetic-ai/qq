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
const RECEIVER_WAIT_MS = 1000;
const RECEIVER_RECONNECT_MS = 250;
const LOGICAL_ID = /^[a-z][a-z0-9-]{0,62}\/[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,254}$/;
const PRODUCT_ID = /^[a-z][a-z0-9-]{0,62}$/;
const KIND_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,126}$/;
const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
const ROLE_NAMES = new Set(["architect", "coordinator", "change_owner"]);
const MESSAGE_TYPES = new Set(["message", "question", "reply", "action"]);
const URGENCIES = new Set(["default", "urgent", "critical"]);
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
  if (typeof record.event_plane_socket !== "string" || !record.event_plane_socket.startsWith("/")) throw new Error("enable record Event Plane socket is not absolute");
  if (!isObject(record.actor) || !exactKeys(record.actor, VALID_ACTOR_FIELDS)) throw new Error("enable record actor has an invalid shape");
  if (!ROLE_NAMES.has(record.actor.role)) throw new Error("enable record actor role is unsupported");
  if (record.actor.role === "change_owner" ? !boundedText(record.actor.change, "Change identity", 256) : record.actor.change !== undefined) {
    throw new Error("enable record actor Change identity is invalid");
  }
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
  const payload = record?.envelope?.payload;
  if (!isObject(payload) || payload.schema !== MESSAGE_SCHEMA) return undefined;
  if (!isObject(payload.record) || !exactKeys(payload.record, VALID_RECORD_FIELDS)) return undefined;
  const value = payload.record;
  if (!LOGICAL_ID.test(value.origin_id ?? "") || !KIND_ID.test(value.kind ?? "")) return undefined;
  if (!MESSAGE_TYPES.has(value.kind)) return undefined;
  if (typeof value.content !== "string" || value.content.length === 0 || value.content.length > 65536) return undefined;
  if (value.correlation_id !== undefined && typeof value.correlation_id !== "string") return undefined;
  if (!URGENCIES.has(value.urgency ?? "default")) return undefined;
  if (value.urgency === "critical" && value.critical !== true) return undefined;
  if (value.kind === "reply" && !value.correlation_id) return undefined;
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
  const record = deps.enableRecord !== undefined
    ? (deps.enableRecord === null ? undefined : deps.enableRecord)
    : await readEnableRecord(env, recordPath);
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
      const assignee = /^assignee:\s*\n\s*-\s*([A-Za-z0-9][A-Za-z0-9._:/@+-]{0,254})\s*$/m.exec(text)?.[1];
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
  const endpointToken = `qq-actor-messaging/${randomUUID()}`;
  const pending = new Map();
  const deliveries = new Map();
  const statuses = new Map();
  const correlations = new Map();
  const inFlightRequests = new Map();
  const sessionState = {
    active: false,
    authorized: false,
    reason: "never_started",
    started_at: 0,
    session_file: undefined,
    session_id: undefined,
    receiver_running: false,
    last_publication: "none",
  };
  let ctxNow;
  const currentClient = client;
  let publishActive = false;
  let receiverActive = false;
  let receiverStopped = false;
  let pendingGate = false;
  let receiptScanBusy = false;
  let abortInFlight = false;
  let lastSequence = Promise.resolve();

  const sequence = (operation) => {
    const run = lastSequence.then(operation, operation);
    lastSequence = run.catch(() => {});
    return run;
  };

  const notify = (message, level = "info") => {
    try {
      if (ctxNow?.hasUI) ctxNow.ui.notify(message, level);
    } catch {
      // UI notification must never affect transport truth.
    }
  };

  const updateStatus = (eventId, patch) => {
    const current = statuses.get(eventId) ?? {};
    statuses.set(eventId, { ...current, ...patch });
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

  async function bindingBeforeDelivery() {
    if (record.actor.session_file !== undefined) {
      const configured = record.actor.session_file;
      const current = ctxNow?.sessionManager?.getSessionFile?.();
      if (configured !== current) {
        throw Object.assign(new Error(`delivery refused: configured session file differs from current Pi session`), { code: "session_mismatch" });
      }
    }
    await requireCurrentBinding("delivery");
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
    const reply = await bindingCall("guard", bindingFacts(), ["--acknowledgement"]).catch((error) => ({ value: undefined, reason: error instanceof Error ? error.message : String(error) }));
    if (!reply?.value) {
      throw Object.assign(new Error(`acknowledgement refused: T-189 acknowledgement guard is ${reply?.reason ?? "unavailable"}`), { code: "binding_refused" });
    }
    return reply.value;
  }

  async function connectionGuard() {
    return {
      consumer_type: "recipient",
      consumer_id: consumerId,
      generation: 0,
      endpoint_token: endpointToken,
    };
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
    const parts = recipient.split("/");
    if (parts[1] === "change" && parts.length === 3) return recipient;
    if ((parts[1] === "architect" || parts[1] === "coordinator") && parts.length === 2) return recipient;
    // A reply on an already-received initiated thread may return to the exact
    // one-off origin without granting it a durable accountable identity.
    if (initiatedThread) return recipient;
    throw new Error("recipient must be an accountable logical Actor");
  }

  async function sendRecord({ kind, recipient, content, correlationId, urgency = "default", critical = false, origin, requestId }) {
    if (!sessionState.authorized) throw new Error("outbound refused: session is not bound to an exact current T-189 source");
    if (!MESSAGE_TYPES.has(kind)) throw new Error("message kind is unsupported");
    if (!URGENCIES.has(urgency)) throw new Error("urgency is unsupported");
    if (urgency === "critical" && critical !== true) throw new Error("critical urgency requires explicit critical:true");
    if (kind === "reply" && !correlationId) throw new Error("reply requires correlation_id");
    const inboundThread = kind === "reply" && correlationId ? correlations.get(correlationId) : undefined;
    const initiatedThread = kind === "reply" && !!inboundThread?.origin_id && recipient === inboundThread.origin_id;
    const target = await ensureActorIsDurable(recipient, { initiatedThread });
    const bodyContent = boundedText(content, "message content", 65536);
    const request = requestId ?? `req_${requestHash({ kind, target, content: bodyContent, correlationId, urgency, critical, origin: origin ?? display })}`;
    if (inFlightRequests.has(request)) return inFlightRequests.get(request);
    const operation = sequence(async () => {
      const messageRecord = {
        origin_id: origin ?? display,
        content: bodyContent,
        kind,
        urgency,
        critical,
      };
      if (correlationId !== undefined) messageRecord.correlation_id = correlationId;
      const envelope = {
        producer_id: `${display}/adapter`,
        request_id: request,
        origin_id: origin ?? display,
        recipient_id: target,
        product_id: record.product_id,
        kind: MESSAGE_KIND,
        schema_version: 1,
        payload: {
          schema: MESSAGE_SCHEMA,
          record: messageRecord,
        },
      };
      const result = await currentClient.send(envelope);
      const eventId = result.record.event_id;
      const state = { transport: "accepted", event_id: eventId, request_id: request, kind, recipient: target, correlation_id: correlationId };
      statuses.set(eventId, state);
      if (correlationId) {
        const existing = correlations.get(correlationId) ?? {};
        correlations.set(correlationId, { ...existing, ...(kind === "question" ? { question_event_id: eventId } : kind === "reply" ? { reply_event_id: eventId } : {}) });
      }
      updateStatus(eventId, { transport: result.obligation_count === 0 ? "disposed" : "accepted" });
      return normalizeResponse({ ...result, ...state }, "accepted");
    });
    inFlightRequests.set(request, operation);
    try {
      return await operation;
    } finally {
      inFlightRequests.delete(request);
    }
  }

  async function publishFact({ kind, payload = {}, origin, requestId, correlationId }) {
    if (!sessionState.authorized) throw new Error("outbound refused: session is not bound to an exact current T-189 source");
    if (!KIND_ID.test(kind ?? "")) throw new Error("fact kind is unsupported");
    const request = requestId ?? `req_${requestHash({ kind, payload, origin: origin ?? display, correlationId })}`;
    return sequence(async () => {
      const envelope = {
        producer_id: `${display}/adapter`,
        request_id: request,
        origin_id: origin ?? display,
        product_id: record.product_id,
        kind,
        schema_version: 1,
        payload,
      };
      if (correlationId === undefined) delete envelope.correlation_id;
      const result = await currentClient.publish(envelope);
      return normalizeResponse(result, "accepted");
    });
  }

  async function readReceipt(entry, parsed) {
    if (!parsed) return undefined;
    const expectedFile = record.actor.session_file ?? ctxNow?.sessionManager?.getSessionFile?.();
    const expectedSession = record.actor.session_id ?? ctxNow?.sessionManager?.getSessionId?.();
    if (typeof expectedFile !== "string") return undefined;
    let text;
    try {
      text = await sessionRead(expectedFile);
    } catch {
      return undefined;
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
      if (!content.includes(entry.record.event_id) || !content.includes(parsed.content_hash)) continue;
      const details = isObject(item.details) ? item.details : {};
      if (details.event_id !== entry.record.event_id || details.content_hash !== parsed.content_hash || details.schema !== MESSAGE_SCHEMA) continue;
      found = { entry_id: item.id, parent_id: item.parentId, session_file: expectedFile };
    }
    return found;
  }

  async function acknowledgeDelivery(entry, receipt, reason) {
    await guardAcknowledgement();
    const guard = guardFromDelivery(entry.delivery);
    const result = await currentClient.acknowledge(guard);
    const delivered = { transport: "delivered", receipt, ack_result: result };
    if (entry.criticalOutcome) delivered.critical_outcome = entry.criticalOutcome;
    updateStatus(entry.event_id, delivered);
    if (entry.parsed.correlation_id) {
      const existing = correlations.get(entry.parsed.correlation_id) ?? {};
      correlations.set(entry.parsed.correlation_id, { ...existing, delivered: true, receipt, origin_id: entry.parsed.record.origin_id });
    }
    return result;
  }

  async function markRetry(entry, reason) {
    try {
      await currentClient.retry({ ...guardFromDelivery(entry.delivery), reason });
      updateStatus(entry.event_id, { transport: "pending", last_reason: reason });
    } catch (error) {
      updateStatus(entry.event_id, { transport: "blocked", last_reason: error instanceof Error ? error.message : String(error) });
    }
  }

  async function markBlocked(entry, reason) {
    try {
      await currentClient.block({ ...guardFromDelivery(entry.delivery), reason });
      updateStatus(entry.event_id, { transport: "blocked", last_reason: reason });
    } catch (error) {
      updateStatus(entry.event_id, { transport: "blocked", last_reason: error instanceof Error ? error.message : String(error) });
    }
  }

  async function injectParsed(entry) {
    await bindingBeforeDelivery();
    const parsed = entry.parsed;
    // Restart reconstruction: if the exact fenced entry is already persisted in
    // the current session, acknowledge that receipt instead of injecting a
    // duplicate custom message.
    const preExisting = await readReceipt(entry, parsed);
    if (preExisting) {
      entry.injected = true;
      entry.receipt = preExisting;
      entry.done = true;
      pending.delete(entry.event_id);
      deliveries.delete(entry.event_id);
      if (pending.size === 0) pendingGate = false;
      await acknowledgeDelivery(entry, preExisting, "reconstructed persisted receipt");
      return;
    }
    const content = renderMessage(parsed, entry.record);
    const options = ctxNow?.isIdle?.() === false
      ? { triggerTurn: parsed.urgency !== "critical", deliverAs: "followUp" }
      : { triggerTurn: parsed.urgency !== "critical" };
    const sendMessage = deps.sendMessage ?? pi.sendMessage?.bind(pi);
    if (typeof sendMessage !== "function") throw new Error("current Pi sendMessage seam is unavailable");
    await sendMessage({
      customType: QQ_ACTOR_MESSAGING_CUSTOM_TYPE,
      content,
      display: true,
      details: {
        schema: MESSAGE_SCHEMA,
        event_id: entry.record.event_id,
        correlation_id: parsed.correlation_id,
        content_hash: parsed.content_hash,
        kind: parsed.record.kind,
        urgency: parsed.urgency,
      },
    }, options);
    const injectedState = statuses.get(entry.event_id) ?? {};
    statuses.set(entry.event_id, { ...injectedState, pending_gate: parsed.urgency !== "critical" });
    entry.injected = true;
    if (parsed.urgency !== "critical") pendingGate = true;
    await processReceipt(entry);
  }

  async function processReceipt(entry) {
    if (entry.receipt || entry.done) return;
    await bindingBeforeDelivery();
    const receipt = await readReceipt(entry, entry.parsed);
    if (!receipt) return;
    await requireCurrentBinding("acknowledgement");
    entry.receipt = receipt;
    entry.done = true;
    pending.delete(entry.event_id);
    deliveries.delete(entry.event_id);
    if (pending.size === 0) pendingGate = false;
    await acknowledgeDelivery(entry, receipt, "persisted-session receipt");
  }

  async function processAllReceipts() {
    if (receiptScanBusy) return;
    receiptScanBusy = true;
    try {
      for (const entry of [...pending.values()]) {
        if (entry.injected && !entry.done) await processReceipt(entry).catch(async (error) => {
          if (error?.code === "binding_refused") {
            await markBlocked(entry, error.message);
            entry.done = true;
            pending.delete(entry.event_id);
            deliveries.delete(entry.event_id);
          }
        });
      }
      if (pending.size === 0) pendingGate = false;
    } finally {
      receiptScanBusy = false;
    }
  }

  async function processCritical(entry) {
    if (entry.criticalAttempted) return;
    entry.criticalAttempted = true;
    // The exact T-189 fence precedes any delivery side effect.
    await bindingBeforeDelivery();
    // Reconstruct an already-persisted critical receipt BEFORE any abort, so a
    // post-append redelivery acknowledges the stable event without interrupting
    // a second run.
    const preExisting = await readReceipt(entry, entry.parsed);
    if (preExisting) {
      entry.injected = true;
      entry.receipt = preExisting;
      entry.done = true;
      pending.delete(entry.event_id);
      deliveries.delete(entry.event_id);
      if (pending.size === 0) pendingGate = false;
      await acknowledgeDelivery(entry, preExisting, "reconstructed persisted critical receipt");
      return;
    }
    const wasIdle = ctxNow?.isIdle?.() === true;
    if (!abortInFlight) {
      abortInFlight = true;
      try {
        await ctxNow?.abort?.();
      } catch {
        // A fire-and-forget abort that throws still counts as the one attempt.
      } finally {
        abortInFlight = false;
      }
    }
    // Truthful outcome from the state Pi can establish at the attempt: an idle
    // session had no run to interrupt; a busy run received the abort.
    entry.criticalOutcome = wasIdle ? "ignored" : "interrupted";
    // Critical content still enters the transcript and is acknowledged only
    // after exact persisted readback, like every other delivery.
    await injectParsed(entry);
  }

  async function processDelivery(delivery) {
    const message = parseMessagePayload(delivery.record);
    const entry = {
      delivery,
      record: delivery.record,
      event_id: delivery.record.event_id,
      parsed: message,
      injected: false,
      done: false,
      criticalAttempted: false,
    };
    if (!message) {
      await currentClient.block({ ...guardFromDelivery(delivery), reason: "unsupported actor message payload" });
      return;
    }
    pending.set(entry.event_id, entry);
    deliveries.set(entry.event_id, delivery);
    statuses.set(entry.event_id, {
      transport: "delivering",
      event_id: entry.event_id,
      kind: message.record.kind,
      correlation_id: message.correlation_id,
      urgency: message.urgency,
      content_hash: message.content_hash,
    });
    if (message.urgency === "urgent") {
      await publishFact({
        kind: ATTENTION_KIND,
        correlationId: entry.event_id,
        payload: {
          schema: MESSAGE_SCHEMA,
          fact: "attention-needed",
          event_id: entry.event_id,
          recipient_id: consumerId,
        },
      }).then((result) => {
        updateStatus(entry.event_id, { urgent_attention: "accepted", urgent_attention_record: result });
      }).catch(() => {
        updateStatus(entry.event_id, { urgent_attention: "publication-failed" });
      });
    }
    if (message.urgency === "critical") {
      await processCritical(entry);
      return;
    }
    await injectParsed(entry);
  }

  async function processCorrelations() {
    for (const [correlationId, state] of correlations) {
      if (state.answered === true || state.resolved === true) continue;
      if (state.reply_event_id) {
        const replyStatus = statuses.get(state.reply_event_id);
        if (replyStatus?.transport === "delivered") correlations.set(correlationId, { ...state, answered: true });
      }
    }
  }

  async function receiverLoop(reason) {
    if (receiverActive) return;
    receiverActive = true;
    receiverStopped = false;
    sessionState.receiver_running = true;
    sessionState.reason = reason;
    while (sessionState.active && !receiverStopped) {
      try {
        const result = await currentClient.next({ ...await connectionGuard(), wait_ms: RECEIVER_WAIT_MS });
        if (result?.delivery) {
          await processDelivery(result.delivery).catch(async (error) => {
            const entry = pending.get(result.delivery.record?.event_id) ?? {
              delivery: result.delivery,
              record: result.delivery.record,
              event_id: result.delivery.record?.event_id,
            };
            if (error?.code === "binding_refused") await markBlocked(entry, error.message);
            else await markRetry(entry, error instanceof Error ? error.message : String(error));
          });
        }
        await processAllReceipts();
        await processCorrelations();
      } catch (error) {
        if (!sessionState.active || receiverStopped) break;
        await abortableSleep(RECEIVER_RECONNECT_MS, () => !sessionState.active || receiverStopped);
      }
    }
    sessionState.receiver_running = false;
    receiverActive = false;
  }

  async function publicationLoop(reason) {
    if (publishActive) return;
    publishActive = true;
    while (sessionState.active) {
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
            session_file: record.actor.session_file,
          },
        });
        sessionState.last_publication = "accepted";
        return result;
      } catch (error) {
        sessionState.last_publication = error?.code === "unavailable" ? "unavailable" : "refused";
        await abortableSleep(RECEIVER_RECONNECT_MS, () => !sessionState.active);
      }
    }
  }

  async function configureSession(event, ctx) {
    ctxNow = ctx;
    sessionState.active = false;
    sessionState.authorized = false;
    receiverStopped = true;
    pending.clear();
    deliveries.clear();
    publishActive = false;
    receiverActive = false;
    pendingGate = false;
    sessionState.active = true;
    sessionState.reason = event?.reason ?? "startup";
    sessionState.started_at = now();
    sessionState.session_file = record.actor.session_file ?? ctx?.sessionManager?.getSessionFile?.();
    sessionState.session_id = record.actor.session_id ?? ctx?.sessionManager?.getSessionId?.();
    await requireCurrentBinding("session start");
    if (record.actor.session_file !== undefined && record.actor.session_file !== ctx?.sessionManager?.getSessionFile?.()) {
      throw Object.assign(new Error("session start refused: enable-record session file differs from current Pi session"), { code: "session_mismatch" });
    }
    if (record.actor.session_id !== undefined && record.actor.session_id !== ctx?.sessionManager?.getSessionId?.()) {
      throw Object.assign(new Error("session start refused: enable-record session ID differs from current Pi session"), { code: "session_mismatch" });
    }
    // Only an exact current T-189 source binding admits outbound effects. A
    // startup refusal (caught by Pi) must leave sending/publication inactive.
    sessionState.authorized = true;
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
        urgency: { type: "string", enum: ["default", "urgent", "critical"] },
        critical: { type: "boolean" },
        wait_ms: { type: "integer", minimum: 0, maximum: 60000 },
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
          const products = params.product_id === undefined ? [] : [boundedText(params.product_id, "Product identity", 63)];
          if (products.length && products[0] !== record.product_id) throw new Error("list_actors cannot cross the enabled Product boundary");
          return { content: [{ type: "text", text: actors.length ? actors.map((actor) => actor.actor).join("\n") : "No current accountable Actor is connected." }], details: { status: "current", actors } };
        }
        if (params.action === "status") {
          const selector = params.event_id ? { event_id: params.event_id } : params.request_id ? { producer_id: `${display}/adapter`, request_id: params.request_id } : params.correlation_id ? { correlation_id: params.correlation_id } : undefined;
          if (!selector) throw new Error("status requires event_id, request_id, or correlation_id");
          if (selector.correlation_id) {
            const state = correlations.get(selector.correlation_id);
            return { content: [{ type: "text", text: state ? `Correlation ${selector.correlation_id}: ${stableJson(state)}` : `Correlation ${selector.correlation_id} has no tracked state.` }], details: { status: state ? "tracked" : "unknown", correlation_id: selector.correlation_id, state } };
          }
          const result = await currentClient.status({ ...selector, wait_ms: params.wait_ms ?? 0 });
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
          const details = await sendRecord({
            kind: messageKind,
            recipient,
            content: params.content,
            correlationId: params.correlation_id,
            requestId: params.request_id,
            urgency: params.urgency ?? "default",
            critical: params.critical === true,
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

  pi.on("tool_call", async (_event, _ctx) => {
    if (pendingGate && pending.size > 0) {
      const first = [...pending.values()].find((entry) => entry.parsed?.urgency !== "critical");
      if (first) {
        return { block: true, reason: `qq Actor message ${first.event_id} is pending at Pi's next safe boundary; reconsider the whole not-yet-started tool batch after it enters context.` };
      }
    }
    return undefined;
  });

  pi.on("turn_start", async (_event, _ctx) => {
    await sequence(async () => processAllReceipts());
  });

  pi.on("message_end", async (event, ctx) => {
    ctxNow = ctx;
    const message = event?.message;
    if (message?.role === "assistant") {
      for (const [correlationId, state] of correlations) {
        if (!state.reply_event_id || state.answered) continue;
        correlations.set(correlationId, { ...state, answered: true });
      }
    }
    await processAllReceipts();
  });

  pi.on("agent_settled", async (_event, _ctx) => {
    await sequence(async () => {
      await processAllReceipts();
      for (const entry of [...pending.values()]) {
        if (!entry.injected && !entry.done) await injectParsed(entry);
      }
    });
  });

  pi.on("session_shutdown", () => {
    sessionState.active = false;
    sessionState.authorized = false;
    receiverStopped = true;
    pending.clear();
    deliveries.clear();
    publishActive = false;
    receiverActive = false;
    pendingGate = false;
  });
}
