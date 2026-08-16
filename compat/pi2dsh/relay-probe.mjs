#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, socket, recipientSessionId, outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error("usage: relay-probe.mjs <qq-root> <relay-socket> <recipient-session-id> <output.json>");
}

const { RelayClient, QQ_RELAY_PROTOCOL } = await import(pathToFileURL(join(root, "bin/lib/qq-relay-client.mjs")));
assert.equal(QQ_RELAY_PROTOCOL, "qq-relay/v1");

const senderSessionId = "019ff7b9-2fcd-78cd-bc16-c770a9ccff11";
const requestId = `msg_pi2dsh_${randomUUID()}`;
const client = new RelayClient(socket);
const accepted = await client.send({
  producer_id: `agents/${senderSessionId}`,
  request_id: requestId,
  origin_id: `agents/${senderSessionId}`,
  recipient_id: `agents/${recipientSessionId}`,
  product_id: "agents",
  kind: "agent.message",
  schema_version: 1,
  payload: {
    schema: "qq.agent-message/v2",
    message: {
      from: senderSessionId,
      project: "qq",
      role: "architect",
      tasks: ["T-63.5"],
      pane: null,
      content: "installed qq-relay DSH receipt probe",
      delivery: "default",
    },
  },
});
const initialStatus = await client.status({ event_id: accepted.record.event_id, wait_ms: 0 });
const finalStatus = await client.status({ event_id: accepted.record.event_id, wait_ms: 15_000 });
const proof = {
  schema: "qq.pi2dsh-installed-relay-proof/v1",
  protocol: QQ_RELAY_PROTOCOL,
  sender_session_id: senderSessionId,
  recipient_session_id: recipientSessionId,
  request_id: requestId,
  event_id: accepted.record.event_id,
  idempotent: accepted.idempotent,
  initial_status: initialStatus,
  final_status: finalStatus,
};
await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
if (!finalStatus.terminal || finalStatus.terminal_failure) {
  throw new Error(`installed qq-relay delivery did not succeed: ${JSON.stringify(finalStatus)}`);
}
