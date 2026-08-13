// @ts-nocheck
// Cross-project, machine-local agent messaging over the Event Plane.

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EventPlaneClient } from "../bin/lib/event-plane-client.ts";
import { ROLE_SET, roleForRepository } from "../bin/lib/roles.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MESSAGE_SCHEMA = "qq.agent-message/v2";
const CUSTOM_TYPE = "qq-agent-message";
const PLANE_PRODUCT = "agents";
const MESSAGE_KIND = "agent.message";
const LEASE_MS = 45_000;
const RENEW_MS = 15_000;
const RECEIVE_WAIT_MS = 30_000;
const RECONNECT_MS = 500;
const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SIMPLE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const DELIVERY = new Set(["default", "immediate"]);

function stateHome(env = process.env) {
  const value = env.XDG_STATE_HOME;
  return value ? resolve(value) : join(homedir(), ".local", "state");
}

function statePaths(env = process.env) {
  const root = join(stateHome(env), "qq", "event-plane");
  return { root, socket: join(root, "event-plane.sock"), presence: join(root, "presence") };
}

function slug(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const result = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  if (!SIMPLE.test(result)) throw new Error(`${label} cannot form a readable identifier`);
  return result;
}

function bounded(value, label, maximum = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.includes("\0")) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeTasks(value, label = "tasks") {
  if (value === undefined || value === null || value === "") return [];
  const values = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(values) || values.length > 32) throw new Error(`${label} must contain at most 32 entries`);
  const result = [];
  for (const entry of values) {
    if (typeof entry !== "string") throw new Error(`${label} entries must be strings`);
    const task = bounded(entry.trim(), `${label} entry`, 191);
    if (!result.includes(task)) result.push(task);
  }
  return result;
}

function projectFromCwd(cwd, env = process.env, config = {}) {
  return slug(env.QQ_AGENT_PROJECT || config.project || basename(resolve(cwd)), "project");
}

function configuredRole(env = process.env, config = {}) {
  const value = env.QQ_AGENT_ROLE || config.role;
  return value ? slug(value, "role") : undefined;
}

async function readProjectConfig(cwd) {
  const path = join(resolve(cwd), ".pi", "agent-messages.json");
  let source;
  try { source = await readFile(path, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  const value = JSON.parse(source);
  const allowed = new Set(["project", "role"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(".pi/agent-messages.json has an invalid shape");
  }
  return value;
}

function planeAgentId(sessionId) {
  if (!SESSION_ID.test(sessionId ?? "")) throw new Error("session_id must be a canonical Pi session ID");
  return `${PLANE_PRODUCT}/${sessionId}`;
}

function sessionIdFromPlaneAgent(value) {
  const prefix = `${PLANE_PRODUCT}/`;
  if (typeof value !== "string" || !value.startsWith(prefix)) return undefined;
  const sessionId = value.slice(prefix.length);
  return SESSION_ID.test(sessionId) ? sessionId : undefined;
}

function presencePath(directory, sessionId) {
  return join(directory, `${sha256(sessionId)}.json`);
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error(`private state directory is unsafe: ${path}`);
  }
}

async function atomicPrivateJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const bytes = `${JSON.stringify(value)}\n`;
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

function validPresence(value, now = Date.now()) {
  if (!value || value.schema !== "qq.agent-presence/v2" || value.version !== 2) return undefined;
  if (!SESSION_ID.test(value.session_id ?? "")) return undefined;
  if (!SIMPLE.test(value.project ?? "") || !ROLE_SET.has(value.role)) return undefined;
  let tasks;
  try { tasks = normalizeTasks(value.tasks); } catch { return undefined; }
  if (JSON.stringify(tasks) !== JSON.stringify(value.tasks)) return undefined;
  if (value.pane !== null && (typeof value.pane !== "string" || value.pane.length > 128 || value.pane.includes("\0"))) return undefined;
  if (!Number.isSafeInteger(value.updated_at) || !Number.isSafeInteger(value.expires_at) || value.expires_at <= now) return undefined;
  return value;
}

async function listPresence(directory, filters = {}, now = Date.now()) {
  await privateDirectory(directory);
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = join(directory, entry.name);
    let value;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0 || info.size > 16_384) continue;
      value = JSON.parse(await readFile(path, "utf8"));
    } catch { continue; }
    const presence = validPresence(value, now);
    if (!presence) continue;
    if (filters.project && presence.project !== slug(filters.project, "project filter")) continue;
    if (filters.role && presence.role !== slug(filters.role, "role filter")) continue;
    if (filters.task && !presence.tasks.includes(filters.task)) continue;
    result.push(presence);
  }
  return result.sort((left, right) => left.project.localeCompare(right.project) || left.role.localeCompare(right.role) || left.tasks.join("\0").localeCompare(right.tasks.join("\0")) || left.session_id.localeCompare(right.session_id));
}

function parseMessage(record) {
  const payload = record?.envelope?.payload;
  const message = payload?.message;
  if (payload?.schema !== MESSAGE_SCHEMA || typeof message !== "object" || message === null) return undefined;
  if (!SESSION_ID.test(message.from ?? "") || !sessionIdFromPlaneAgent(record.recipient_id)) return undefined;
  if (!SIMPLE.test(message.project ?? "") || !ROLE_SET.has(message.role)) return undefined;
  if (message.pane !== null && (typeof message.pane !== "string" || message.pane.length > 128 || message.pane.includes("\0"))) return undefined;
  if (typeof message.content !== "string" || message.content.length === 0 || message.content.length > 65_536) return undefined;
  if (!DELIVERY.has(message.delivery)) return undefined;
  let tasks;
  try { tasks = normalizeTasks(message.tasks); } catch { return undefined; }
  if (JSON.stringify(tasks) !== JSON.stringify(message.tasks)) return undefined;
  return { ...message, tasks, event_id: record.event_id, accepted_at: record.accepted_at, content_hash: sha256(message.content) };
}

function deliveryGuard(delivery) {
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

function statusName(result) {
  const statuses = (result?.obligations ?? []).map((item) => item.status);
  if (statuses.includes("in_flight")) return "delivering";
  if (statuses.includes("pending")) return "queued";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.length && statuses.every((value) => value === "acknowledged")) return "delivered";
  if (statuses.includes("expired")) return "expired";
  if (statuses.some((value) => value === "disposed" || value === "abandoned")) return "failed";
  return result?.terminal_failure ? "failed" : "queued";
}

export { listPresence, normalizeTasks, parseMessage, planeAgentId, statusName, validPresence };

export default function register(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const paths = deps.paths ?? statePaths(env);
  const client = deps.client ?? new EventPlaneClient(paths.socket);
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
  const list = deps.listPresence ?? listPresence;
  let active = false;
  let epoch = 0;
  let current;
  let currentContext;
  let tasks = [];
  const injectedMessages = deps.injectedMessages ?? new Set();
  let renewTimer;

  async function writePresence() {
    if (!current) return;
    await privateDirectory(paths.presence);
    const timestamp = now();
    await atomicPrivateJson(presencePath(paths.presence, current.session_id), {
      schema: "qq.agent-presence/v2", version: 2,
      session_id: current.session_id, project: current.project, role: current.role,
      tasks, pane: current.pane, updated_at: timestamp, expires_at: timestamp + LEASE_MS,
    });
  }

  async function removePresence() {
    if (!current) return;
    await unlink(presencePath(paths.presence, current.session_id)).catch(() => {});
  }

  async function receiptExists(eventId, contentHash) {
    const path = currentContext?.sessionManager?.getSessionFile?.();
    if (typeof path !== "string") return false;
    const text = await readFile(path, "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        if (value?.type === "custom_message" && value.customType === CUSTOM_TYPE && value.details?.event_id === eventId && value.details?.content_hash === contentHash) return true;
      } catch {}
    }
    return false;
  }

  async function claimImmediate(message) {
    const result = await client.publish({
      producer_id: planeAgentId(message.from),
      request_id: `immediate_${message.event_id}`,
      origin_id: planeAgentId(message.from),
      product_id: PLANE_PRODUCT,
      kind: "agent.immediate-claim",
      schema_version: 1,
      correlation_id: message.event_id,
      payload: { schema: MESSAGE_SCHEMA, event_id: message.event_id, content_hash: message.content_hash },
    });
    return result.idempotent !== true;
  }

  async function receiveOne(delivery, localEpoch) {
    const message = parseMessage(delivery.record);
    if (!message) {
      await client.block({ ...deliveryGuard(delivery), reason: "unsupported agent message payload" });
      return;
    }
    const injectionKey = `${message.event_id}:${message.content_hash}`;
    if (injectedMessages.has(injectionKey) || await receiptExists(message.event_id, message.content_hash)) {
      await client.acknowledge(deliveryGuard(delivery));
      injectedMessages.delete(injectionKey);
      return;
    }
    if (!active || localEpoch !== epoch || !currentContext) return;
    injectedMessages.add(injectionKey);
    if (message.delivery === "immediate" && currentContext.isIdle?.() === false && await claimImmediate(message)) {
      try { currentContext.abort?.(); } catch {}
    }
    const options = currentContext.isIdle?.() === false
      ? { triggerTurn: true, deliverAs: message.delivery === "immediate" ? "steer" : "followUp" }
      : { triggerTurn: true };
    try {
      await (deps.sendMessage ?? pi.sendMessage.bind(pi))({
        customType: CUSTOM_TYPE,
        content: `[message ${message.event_id} from ${message.from} — ${message.project} / ${message.role}${message.tasks.length ? ` — tasks: ${message.tasks.join(", ")}` : ""}]\n${message.content}`,
        display: true,
        details: { schema: MESSAGE_SCHEMA, event_id: message.event_id, content_hash: message.content_hash, from: message.from, delivery: message.delivery },
      }, options);
    } catch (error) {
      injectedMessages.delete(injectionKey);
      throw error;
    }
    if (deps.assumePersisted === true || await receiptExists(message.event_id, message.content_hash)) {
      await client.acknowledge(deliveryGuard(delivery));
      injectedMessages.delete(injectionKey);
    } else {
      await client.retry({ ...deliveryGuard(delivery), reason: "Pi session persistence not yet observable" });
    }
  }

  async function receiver(localEpoch) {
    const endpoint = `agent-messages/${randomUUID()}`;
    while (active && localEpoch === epoch && current) {
      try {
        const result = await client.next({ consumer_type: "recipient", consumer_id: planeAgentId(current.session_id), generation: 0, endpoint_token: endpoint, wait_ms: RECEIVE_WAIT_MS });
        if (result?.delivery) await receiveOne(result.delivery, localEpoch);
      } catch {
        if (active && localEpoch === epoch) await sleep(RECONNECT_MS);
      }
    }
  }

  async function start(_event, ctx) {
    currentContext = ctx;
    const config = await readProjectConfig(ctx.cwd);
    const role = roleForRepository(ctx.cwd, QQ_ROOT, env, configuredRole(env, config));
    if (!role) return;
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (typeof sessionId !== "string" || sessionId === "") return;
    const project = projectFromCwd(ctx.cwd, env, config);
    if (!SESSION_ID.test(sessionId)) throw new Error("Pi supplied a non-canonical session ID");
    current = { session_id: sessionId, project, role, pane: env.HERDR_PANE_ID || null };
    active = true;
    epoch += 1;
    const localEpoch = epoch;
    await writePresence();
    renewTimer = setInterval(() => { void writePresence(); }, RENEW_MS);
    renewTimer.unref?.();
    void receiver(localEpoch);
  }

  async function stop() {
    active = false;
    epoch += 1;
    if (renewTimer) clearInterval(renewTimer);
    renewTimer = undefined;
    injectedMessages.clear();
    await removePresence();
    current = undefined;
    currentContext = undefined;
  }

  pi.registerTool({
    name: "agent_messages",
    label: "Agent messages",
    description: "List other live messaging sessions across projects, send one durable message, or inspect delivery status. The calling session is excluded from list. A recipient is identified only by its canonical Pi session_id. Project, role, optional tasks, and pane are discovery metadata: for example, 'the qq runner on T-12' means project qq, role runner, and task T-12. If multiple candidates remain, ask rather than guess. Copy the complete session_id unchanged. Use immediate delivery only when the recipient must see the message now; it interrupts their current run.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "send", "status"] },
        project: { type: "string" }, role: { type: "string" }, task: { type: "string", description: "Optional exact task label used to filter list; a session may advertise multiple tasks." },
        to: { type: "string", description: "Recipient's complete canonical Pi session_id returned by list, for example 019ff7b9-2fcd-78cd-bc16-c770a9ccff11. Copy it unchanged; project and role are not part of this ID." }, message: { type: "string" },
        delivery: { type: "string", enum: ["default", "immediate"] },
        message_id: { type: "string" },
      },
      required: ["action"],
    },
    async execute(_id, params) {
      try {
        if (params.action === "list") {
          const agents = (await list(paths.presence, { project: params.project, role: params.role, task: params.task }, now()))
            .filter((agent) => agent.session_id !== current?.session_id);
          const text = agents.length
            ? `live sessions:\n${agents.map((agent) => `- ${agent.session_id} — ${agent.project} / ${agent.role}${agent.tasks.length ? ` — tasks: ${agent.tasks.join(", ")}` : ""}${agent.pane ? ` — pane: ${agent.pane}` : ""}`).join("\n")}`
            : "No live messaging sessions.";
          return { content: [{ type: "text", text }], details: { status: "current", agents } };
        }
        if (params.action === "send") {
          if (!current) throw new Error("this session is not registered; set QQ_AGENT_ROLE before starting Pi");
          if (!SESSION_ID.test(params.to ?? "")) throw new Error("send requires the complete session_id returned by list");
          const content = bounded(params.message, "message", 65_536);
          const delivery = params.delivery ?? "default";
          if (!DELIVERY.has(delivery)) throw new Error("delivery must be default or immediate");
          const requestId = `msg_${randomUUID()}`;
          const result = await client.send({
            producer_id: planeAgentId(current.session_id), request_id: requestId, origin_id: planeAgentId(current.session_id),
            recipient_id: planeAgentId(params.to), product_id: PLANE_PRODUCT, kind: MESSAGE_KIND, schema_version: 1,
            payload: { schema: MESSAGE_SCHEMA, message: { from: current.session_id, project: current.project, role: current.role, tasks, pane: current.pane, content, delivery } },
          });
          const messageId = result.record.event_id;
          const state = statusName(await client.status({ event_id: messageId, wait_ms: 0 }));
          return { content: [{ type: "text", text: `message sent: ${messageId}` }], details: { status: state, message_id: messageId, to: params.to, delivery } };
        }
        if (params.action === "status") {
          bounded(params.message_id, "message_id", 128);
          const result = await client.status({ event_id: params.message_id, wait_ms: 0 });
          const state = statusName(result);
          const reasons = (result.obligations ?? []).map((item) => item.last_reason).filter(Boolean);
          const showReasons = ["blocked", "expired", "failed"].includes(state);
          return { content: [{ type: "text", text: `Message ${params.message_id} is ${state}${showReasons && reasons.length ? `: ${reasons.join("; ")}` : ""}.` }], details: { status: state, message_id: params.message_id, result } };
        }
        throw new Error("action must be list, send, or status");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Agent messages refused: ${reason}` }], details: { status: "refused", reason } };
      }
    },
  });

  pi.registerCommand("agent-tasks", {
    description: "Set or clear this live session's task labels. Usage: /agent-tasks [task, task, ...]",
    handler: async (args, ctx) => {
      if (!current) { ctx.ui.notify("This session is not registered; set QQ_AGENT_ROLE before starting Pi.", "warning"); return; }
      try { tasks = normalizeTasks(args); }
      catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning"); return; }
      await writePresence();
      ctx.ui.notify(tasks.length ? `Agent tasks set to ${tasks.join(", ")}.` : "Agent tasks cleared.", "info");
    },
  });

  pi.events.on("qq:role-selected", (selection) => {
    if (!ROLE_SET.has(selection?.role)) return;
    if (!current) return;
    current.role = selection.role;
    void writePresence();
  });
  pi.on("session_start", start);
  pi.on("session_shutdown", stop);
}
