// @ts-nocheck

import { randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { validateAlignerRequest, validateOrchestratorProjection } from "../../extensions/lib/qq-alignment-contracts.ts";

function result(value) { return { content: [{ type: "text", text: JSON.stringify(value) }], details: value }; }
function failure(message) { return { content: [{ type: "text", text: message }], isError: true }; }
function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} has the wrong shape`);
}
async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}
async function directDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} is not a direct directory`);
  if ((info.mode & 0o077) !== 0) throw new Error(`${label} is not mode-restricted`);
}

export default async function register(pi) {
  const configured = process.env.QQ_ALIGNMENT_CHANNEL_ROOT;
  if (typeof configured !== "string" || !isAbsolute(configured)) throw new Error("qq alignment channel root is missing or non-absolute");
  const channelRoot = await realpath(configured);
  if (channelRoot !== configured) throw new Error("qq alignment channel root must already be canonical");
  await directDirectory(channelRoot, "qq alignment channel root");
  const session = JSON.parse(await readFile(join(channelRoot, "session.json"), "utf8"));
  exact(session, ["version", "session_id", "trace_id", "cwd", "created_at"], "qq alignment channel session");
  if (session.version !== 1 || session.session_id !== process.env.QQ_ALIGNMENT_SESSION_ID || session.trace_id !== process.env.QQ_ALIGNMENT_TRACE_ID) {
    throw new Error("qq alignment channel session identity drifted");
  }
  for (const name of ["requests", "responses", "notifications"]) await directDirectory(join(channelRoot, name), `qq alignment ${name}`);

  let currentRequest = null;
  const knownRequests = new Map();
  const packetIds = new Set();

  pi.registerTool({
    name: "qq_alignment_receive",
    label: "Receive typed alignment request",
    description: "Wait for and receive the next schema-validated aligner request.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute(_toolCallId, _params, signal) {
      if (currentRequest !== null) return failure("Reply to the current alignment request before receiving another.");
      while (!signal?.aborted) {
        const names = (await readdir(join(channelRoot, "requests"))).filter((name) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\.json$/.test(name)).sort();
        for (const name of names) {
          const source = join(channelRoot, "requests", name); const claimed = `${source}.received`;
          try { await rename(source, claimed); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
          const packet = validateAlignerRequest(JSON.parse(await readFile(claimed, "utf8")));
          if (packet.trace_id !== session.trace_id) return failure("Received a foreign alignment trace.");
          currentRequest = packet; return result(packet);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return failure("Alignment receive was interrupted by lifecycle shutdown.");
    },
  });

  pi.registerTool({
    name: "qq_alignment_reply",
    label: "Reply with typed orchestrator projection",
    description: "Validate and atomically return one correlated orchestrator projection with bounded inline supplied material.",
    parameters: { type: "object", additionalProperties: false, required: ["packet"], properties: { packet: { type: "object" } } },
    async execute(_toolCallId, params) {
      try {
        if (currentRequest === null) throw new Error("No alignment request is open.");
        const packet = validateOrchestratorProjection(structuredClone(params.packet));
        if (packet.change_id !== currentRequest.change_id || packet.exchange_id !== currentRequest.exchange_id || packet.trace_id !== currentRequest.trace_id || packet.reply_to !== currentRequest.request_id) throw new Error("Projection correlation does not match the open request.");
        await atomicJson(join(channelRoot, "responses", `${packet.exchange_id}.json`), packet);
        if (packet.kind === "ack" || packet.kind === "status") knownRequests.set(packet.exchange_id, currentRequest);
        packetIds.add(packet.packet_id); currentRequest = null;
        return result({ accepted: true, packet_id: packet.packet_id });
      } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
    },
  });

  pi.registerTool({
    name: "qq_alignment_notify",
    label: "Send typed alignment notification",
    description: "Atomically send a correlated decision, completion, or failure after a prior reply.",
    parameters: { type: "object", additionalProperties: false, required: ["packet"], properties: { packet: { type: "object" } } },
    async execute(_toolCallId, params) {
      try {
        const packet = validateOrchestratorProjection(structuredClone(params.packet));
        const request = knownRequests.get(packet.exchange_id);
        if (request === undefined || packet.change_id !== request.change_id || packet.trace_id !== session.trace_id || packet.reply_to !== request.request_id) throw new Error("Notification correlation is stale or foreign.");
        if (!["decision", "completion", "failure"].includes(packet.kind)) throw new Error("Only decision, completion, or failure notifications are supported.");
        if (packetIds.has(packet.packet_id)) throw new Error("Notification packet id is stale or reused.");
        packetIds.add(packet.packet_id);
        await atomicJson(join(channelRoot, "notifications", `notification-${randomUUID()}.json`), packet);
        return result({ accepted: true, packet_id: packet.packet_id });
      } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
    },
  });
}
