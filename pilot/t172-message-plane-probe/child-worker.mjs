import process from "node:process";

import { Worker } from "bullmq";
import IORedis from "ioredis";

const BLOCK_FOREVER = new Promise(() => {});
const RECIPIENT_SCRIPT = `
local attempts = redis.call('INCR', KEYS[1])
local inserted = redis.call('SET', KEYS[3], ARGV[1], 'NX')
if inserted then
  redis.call('INCR', KEYS[2])
end
local receipt = redis.call('GET', KEYS[3])
return {attempts, inserted and 1 or 0, receipt}
`;

function send(message) {
  if (process.connected) {
    process.send(message);
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing child-worker setting: ${name}`);
  }
  return value;
}

const mode = required("T172_MODE");
const queueName = required("T172_QUEUE");
const prefix = required("T172_PREFIX");
const connection = JSON.parse(required("T172_CONNECTION"));
const executionKey = required("T172_EXECUTION_KEY");

let redis;
let worker;

try {
  if (mode === "recipient-block") {
    redis = new IORedis(connection);
    redis.on("error", () => {});
  }

  worker = new Worker(
    queueName,
    async (job) => {
      if (mode === "lease-block") {
        const counter = new IORedis(connection);
        counter.on("error", () => {});
        try {
          const processingAttempt = await counter.incr(executionKey);
          send({ type: "active", jobId: job.id, processingAttempt });
        } finally {
          counter.disconnect();
        }
        return BLOCK_FOREVER;
      }

      if (mode === "recipient-block") {
        const attemptsKey = required("T172_RECIPIENT_ATTEMPTS_KEY");
        const wakeKey = required("T172_RECIPIENT_WAKE_KEY");
        const receiptKey = required("T172_RECIPIENT_RECEIPT_KEY");
        const receipt = required("T172_RECEIPT");
        const result = await redis.eval(
          RECIPIENT_SCRIPT,
          3,
          attemptsKey,
          wakeKey,
          receiptKey,
          receipt,
        );
        send({
          type: "delivered",
          jobId: job.id,
          processingAttempt: Number(result[0]),
          inserted: Number(result[1]) === 1,
          receipt: result[2],
        });
        return BLOCK_FOREVER;
      }

      throw new Error(`unsupported child-worker mode: ${mode}`);
    },
    {
      connection: { ...connection, maxRetriesPerRequest: null },
      prefix,
      lockDuration: 1_200,
      stalledInterval: 500,
      maxStalledCount: 1,
    },
  );
  worker.on("error", (error) => send({ type: "worker-error", message: error.message }));
  await worker.waitUntilReady();
  send({ type: "ready" });
} catch (error) {
  send({ type: "fatal", message: error instanceof Error ? error.stack : String(error) });
  process.exitCode = 1;
}

async function close() {
  try {
    await worker?.close(true);
  } finally {
    redis?.disconnect();
  }
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await close().catch(() => {});
    process.exit(128 + (signal === "SIGTERM" ? 15 : 2));
  });
}
