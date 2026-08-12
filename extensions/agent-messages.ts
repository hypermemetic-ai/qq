// @ts-nocheck
// Cross-project, machine-local agent messaging over the Event Plane.

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { EventPlaneClient } from "../bin/lib/event-plane-client.ts";

const MESSAGE_SCHEMA = "qq.agent-message/v1";
const CUSTOM_TYPE = "qq-agent-message";
const PLANE_PRODUCT = "agents";
const MESSAGE_KIND = "agent.message";
const LEASE_MS = 45_000;
const RENEW_MS = 15_000;
const RECEIVE_WAIT_MS = 30_000;
const RECONNECT_MS = 500;
const AGENT_ID = /^agents\/[a-z0-9][a-z0-9-]{0,62}\/[a-z0-9][a-z0-9-]{0,62}-[a-f0-9]{10}$/;
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
  const allowed = new Set(["project", "role", "ticket"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(".pi/agent-messages.json has an invalid shape");
  }
  return value;
}

function sessionAgentId(project, role, sessionId) {
  return `${PLANE_PRODUCT}/${project}/${role}-${sha256(sessionId).slice(0, 10)}`;
}

function presencePath(directory, agentId) {
  return join(directory, `${sha256(agentId)}.json`);
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
  if (!value || value.schema !== "qq.agent-presence/v1" || value.version !== 1) return undefined;
  if (!AGENT_ID.test(value.agent_id ?? "") || value.agent_id.split("/")[1] !== value.project) return undefined;
  if (!SIMPLE.test(value.project ?? "") || !SIMPLE.test(value.role ?? "")) return undefined;
  if (value.ticket !== null && (typeof value.ticket !== "string" || value.ticket.length > 191 || value.ticket.includes("\0"))) return undefined;
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
    if (filters.ticket && presence.ticket !== filters.ticket) continue;
    result.push(presence);
  }
  return result.sort((left, right) => left.project.localeCompare(right.project) || left.role.localeCompare(right.role) || (left.ticket ?? "").localeCompare(right.ticket ?? "") || left.agent_id.localeCompare(right.agent_id));
}

function markSelf(agents, agentId) {
  return agents.map((agent) => ({ ...agent, self: agent.agent_id === agentId }));
}

function parseMessage(record) {
  const payload = record?.envelope?.payload;
  const message = payload?.message;
  if (payload?.schema !== MESSAGE_SCHEMA || typeof message !== "object" || message === null) return undefined;
  if (!AGENT_ID.test(message.from ?? "") || !AGENT_ID.test(record.recipient_id ?? "")) return undefined;
  if (typeof message.content !== "string" || message.content.length === 0 || message.content.length > 65_536) return undefined;
  if (!DELIVERY.has(message.delivery)) return undefined;
  return { ...message, event_id: record.event_id, accepted_at: record.accepted_at, content_hash: sha256(message.content) };
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

export { listPresence, markSelf, parseMessage, sessionAgentId, statusName, validPresence };

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
  let ticket = env.QQ_AGENT_TICKET?.trim() || null;
  const injectedMessages = new Set();
  let renewTimer;

  async function writePresence() {
    if (!current) return;
    await privateDirectory(paths.presence);
    const timestamp = now();
    await atomicPrivateJson(presencePath(paths.presence, current.agent_id), {
      schema: "qq.agent-presence/v1", version: 1,
      agent_id: current.agent_id, project: current.project, role: current.role,
      ticket, pane: current.pane, updated_at: timestamp, expires_at: timestamp + LEASE_MS,
    });
  }

  async function removePresence() {
    if (!current) return;
    await unlink(presencePath(paths.presence, current.agent_id)).catch(() => {});
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
      producer_id: message.from,
      request_id: `immediate_${message.event_id}`,
      origin_id: message.from,
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
        content: `[Agent message from ${message.from} | ${message.project} / ${message.role}${message.ticket ? ` / ${message.ticket}` : ""}]\n${message.content}\n[message_id: ${message.event_id}]`,
        display: true,
        details: { schema: MESSAGE_SCHEMA, event_id: message.event_id, content_hash: message.content_hash, from: message.from, delivery: message.delivery },
      }, options);
    } catch (error) {
      injectedMessages.delete(injectionKey);
      throw error;
    }
    if (deps.assumePersisted === true || await receiptExists(message.event_id, message.content_hash)) {
      await client.acknowledge(deliveryGuard(delivery));
    } else {
      await client.retry({ ...deliveryGuard(delivery), reason: "Pi session persistence not yet observable" });
    }
  }

  async function receiver(localEpoch) {
    const endpoint = `agent-messages/${randomUUID()}`;
    while (active && localEpoch === epoch && current) {
      try {
        const result = await client.next({ consumer_type: "recipient", consumer_id: current.agent_id, generation: 0, endpoint_token: endpoint, wait_ms: RECEIVE_WAIT_MS });
        if (result?.delivery) await receiveOne(result.delivery, localEpoch);
      } catch {
        if (active && localEpoch === epoch) await sleep(RECONNECT_MS);
      }
    }
  }

  async function start(_event, ctx) {
    currentContext = ctx;
    const config = await readProjectConfig(ctx.cwd);
    const role = configuredRole(env, config);
    if (!role) return;
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (typeof sessionId !== "string" || sessionId === "") return;
    const project = projectFromCwd(ctx.cwd, env, config);
    if (!ticket && typeof config.ticket === "string" && config.ticket.trim()) ticket = bounded(config.ticket.trim(), "ticket", 191);
    current = { agent_id: sessionAgentId(project, role, sessionId), project, role, pane: env.HERDR_PANE_ID || null };
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
    await removePresence();
    current = undefined;
    currentContext = undefined;
  }

  pi.registerTool({
    name: "agent_messages",
    label: "Agent messages",
    description: "List live agents across projects, send one durable message, or inspect delivery status. Use immediate delivery only when the recipient must see the message now; it interrupts their current run.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "send", "status"] },
        project: { type: "string" }, role: { type: "string" }, ticket: { type: "string" },
        to: { type: "string" }, message: { type: "string" },
        delivery: { type: "string", enum: ["default", "immediate"] },
        message_id: { type: "string" },
      },
      required: ["action"],
    },
    async execute(_id, params) {
      try {
        if (params.action === "list") {
          const agents = markSelf(await list(paths.presence, { project: params.project, role: params.role, ticket: params.ticket }, now()), current?.agent_id);
          const text = agents.length ? agents.map((agent) => `${agent.agent_id} — ${agent.project} / ${agent.role}${agent.ticket ? ` / ${agent.ticket}` : ""}${agent.pane ? ` — pane ${agent.pane}` : ""}${agent.self ? " — self" : ""}`).join("\n") : "No messaging-enabled live agents found.";
          return { content: [{ type: "text", text }], details: { status: "current", agents } };
        }
        if (params.action === "send") {
          if (!current) throw new Error("this session is not registered; set QQ_AGENT_ROLE before starting Pi");
          if (!AGENT_ID.test(params.to ?? "")) throw new Error("send requires an agent_id returned by list");
          const content = bounded(params.message, "message", 65_536);
          const delivery = params.delivery ?? "default";
          if (!DELIVERY.has(delivery)) throw new Error("delivery must be default or immediate");
          const requestId = `msg_${randomUUID()}`;
          const result = await client.send({
            producer_id: current.agent_id, request_id: requestId, origin_id: current.agent_id,
            recipient_id: params.to, product_id: PLANE_PRODUCT, kind: MESSAGE_KIND, schema_version: 1,
            payload: { schema: MESSAGE_SCHEMA, message: { from: current.agent_id, project: current.project, role: current.role, ticket, pane: current.pane, content, delivery } },
          });
          const messageId = result.record.event_id;
          const state = statusName(await client.status({ event_id: messageId, wait_ms: 0 }));
          return { content: [{ type: "text", text: `Message ${messageId} is ${state}.` }], details: { status: state, message_id: messageId, to: params.to, delivery } };
        }
        if (params.action === "status") {
          bounded(params.message_id, "message_id", 128);
          const result = await client.status({ event_id: params.message_id, wait_ms: 0 });
          const state = statusName(result);
          const reasons = (result.obligations ?? []).map((item) => item.last_reason).filter(Boolean);
          return { content: [{ type: "text", text: `Message ${params.message_id} is ${state}${reasons.length ? `: ${reasons.join("; ")}` : ""}.` }], details: { status: state, message_id: params.message_id, result } };
        }
        throw new Error("action must be list, send, or status");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Agent messages refused: ${reason}` }], details: { status: "refused", reason } };
      }
    },
  });

  pi.registerCommand("agent-ticket", {
    description: "Set or clear this live session's work-item label. Usage: /agent-ticket [label]",
    handler: async (args, ctx) => {
      if (!current) { ctx.ui.notify("This session is not registered; set QQ_AGENT_ROLE before starting Pi.", "warning"); return; }
      const value = args.trim();
      if (value.length > 191 || value.includes("\0")) { ctx.ui.notify("Ticket label is too long or malformed.", "warning"); return; }
      ticket = value || null;
      await writePresence();
      ctx.ui.notify(ticket ? `Agent ticket set to ${ticket}.` : "Agent ticket cleared.", "info");
    },
  });

  pi.on("session_start", start);
  pi.on("session_shutdown", stop);
}
