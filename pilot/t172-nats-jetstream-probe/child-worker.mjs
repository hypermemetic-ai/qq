import process from "node:process";

import { jetstream } from "@nats-io/jetstream";
import { connect } from "@nats-io/transport-node";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BLOCK_FOREVER = new Promise(() => {});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing child setting ${name}`);
  return value;
}

function send(message) {
  if (process.connected) process.send(message);
}

const mode = required("T172_MODE");
const server = required("T172_SERVER");
const stream = required("T172_STREAM");
const consumerName = required("T172_CONSUMER");
let nc;

try {
  nc = await connect({
    servers: [server],
    timeout: 1_000,
    reconnect: false,
    waitOnFirstConnect: false,
    noRandomize: true,
  });
  const js = jetstream(nc, { timeout: 1_000 });
  const consumer = await js.consumers.get(stream, consumerName);
  send({ type: "ready" });
  const message = await consumer.next({ expires: 5_000 });
  if (!message) throw new Error("child pull expired without a delivery");

  const evidence = {
    streamSequence: message.info.streamSequence,
    deliveryCount: message.info.deliveryCount,
    redelivered: message.redelivered,
    messageId: message.headers?.get("Nats-Msg-Id") ?? null,
    body: decoder.decode(message.data),
  };

  if (mode === "lease-block") {
    send({ type: "delivered", ...evidence });
    await BLOCK_FOREVER;
  } else if (mode === "receipt-block") {
    const receiptSubject = required("T172_RECEIPT_SUBJECT");
    const wakeSubject = required("T172_WAKE_SUBJECT");
    const receiptBody = required("T172_RECEIPT_BODY");
    const receiptId = required("T172_RECEIPT_ID");
    const receiptAck = await js.publish(receiptSubject, encoder.encode(receiptBody), {
      msgID: receiptId,
      timeout: 1_000,
      retries: 0,
      expect: { lastSubjectSequence: 0 },
    });
    if (receiptAck.duplicate) throw new Error("first receipt was unexpectedly duplicate");
    const wakeAck = await js.publish(wakeSubject, encoder.encode(JSON.stringify({ receiptId })), {
      msgID: `${receiptId}-wake`,
      timeout: 1_000,
      retries: 0,
      expect: { lastSubjectSequence: 0 },
    });
    if (wakeAck.duplicate) throw new Error("first wake was unexpectedly duplicate");
    send({
      type: "delivered",
      ...evidence,
      receiptBody,
      receiptSequence: receiptAck.seq,
      wakeSequence: wakeAck.seq,
    });
    await BLOCK_FOREVER;
  } else {
    throw new Error(`unsupported child mode ${mode}`);
  }
} catch (error) {
  send({ type: "fatal", message: error instanceof Error ? error.stack : String(error) });
  await nc?.close().catch(() => undefined);
  process.exitCode = 1;
}

async function closeForSignal(signal) {
  await nc?.close().catch(() => undefined);
  process.exit(128 + (signal === "SIGTERM" ? 15 : 2));
}

process.once("SIGTERM", () => { void closeForSignal("SIGTERM"); });
process.once("SIGINT", () => { void closeForSignal("SIGINT"); });
