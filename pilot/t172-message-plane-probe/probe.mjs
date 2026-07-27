#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { fork } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import process from "node:process";

import { Job, Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGE = "redis:8.8.1-alpine";
const WAIT_MS = 15_000;
const PRODUCER_FAILURE_BOUND_MS = 1_500;
const WORKER_READINESS_FAILURE_BOUND_MS = 2_500;
const REDIS_CONNECT_TIMEOUT_MS = 500;
const REDIS_RECONNECT_ATTEMPTS = 2;
const REDIS_RECONNECT_DELAY_MS = 100;
const REDIS_ARGUMENTS = [
  "redis-server",
  "--appendonly",
  "yes",
  "--appendfsync",
  "always",
  "--no-appendfsync-on-rewrite",
  "no",
  "--maxmemory-policy",
  "noeviction",
  "--save",
  "",
];
const EXPECTED_CONFIG = {
  appendonly: "yes",
  appendfsync: "always",
  "no-appendfsync-on-rewrite": "no",
  "maxmemory-policy": "noeviction",
  save: "",
};
const RECIPIENT_SCRIPT = `
local attempts = redis.call('INCR', KEYS[1])
local inserted = redis.call('SET', KEYS[3], ARGV[1], 'NX')
if inserted then
  redis.call('INCR', KEYS[2])
end
local receipt = redis.call('GET', KEYS[3])
return {attempts, inserted and 1 or 0, receipt}
`;

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBullReady(resource, label, milliseconds = WAIT_MS) {
  const ready = resource.waitUntilReady();
  let timer;
  let watchdogFired = false;
  try {
    return await Promise.race([
      ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          watchdogFired = true;
          void resource.disconnect().then(
            () => reject(new Error(`${label} timed out after ${milliseconds}ms and was disconnected`)),
            (error) => reject(new Error(`${label} timed out and disconnect failed: ${errorText(error)}`)),
          );
        }, milliseconds);
      }),
    ]);
  } catch (error) {
    if (watchdogFired) await ready.catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForValue(read, accept, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) {
      return last;
    }
    await sleep(100);
  }
  throw new Error(`${label} timed out after ${milliseconds}ms; last value: ${JSON.stringify(last)}`);
}

async function command(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeout ?? 30_000,
    });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim(), code: 0 };
  } catch (error) {
    const result = {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? "").trim(),
      code: typeof error.code === "number" ? error.code : null,
      message: errorText(error),
    };
    if (options.allowFailure) {
      return result;
    }
    throw new Error(`${file} ${args.join(" ")} failed: ${result.stderr || result.message}`);
  }
}

async function docker(args, options) {
  return command("docker", args, options);
}

function queueConnection(context, overrides = {}) {
  assert.ok(context.port, "Redis host port is not allocated");
  return {
    host: "127.0.0.1",
    port: context.port,
    family: 4,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy(attempt) {
      return attempt <= REDIS_RECONNECT_ATTEMPTS ? REDIS_RECONNECT_DELAY_MS : null;
    },
    ...overrides,
  };
}

function scenarioPrefix(context, number) {
  return `t172probe:${context.runId}:s${number}`;
}

function parseConfig(flat) {
  assert.equal(flat.length % 2, 0, "Redis CONFIG GET returned malformed key/value data");
  const result = {};
  for (let index = 0; index < flat.length; index += 2) {
    result[String(flat[index])] = String(flat[index + 1]);
  }
  return result;
}

async function readAndAssertRedisConfig(context) {
  const redis = new IORedis(queueConnection(context, {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  }));
  redis.on("error", () => {});
  try {
    await withTimeout(redis.connect(), 2_000, "Redis connection");
    assert.equal(await redis.ping(), "PONG");
    const actual = parseConfig(await redis.config("GET", ...Object.keys(EXPECTED_CONFIG)));
    assert.deepEqual(actual, EXPECTED_CONFIG, "Redis effective durability configuration differs from the probe contract");
    return actual;
  } finally {
    redis.disconnect();
  }
}

async function inspectImage() {
  const inspected = await docker(["image", "inspect", IMAGE]);
  const images = JSON.parse(inspected.stdout);
  assert.equal(images.length, 1, `expected one image record for ${IMAGE}`);
  const image = images[0];
  assert.match(image.Id, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(image.Size) && image.Size > 0, "Docker image size is unavailable");
  return {
    tag: IMAGE,
    imageId: image.Id,
    repoDigest: Array.isArray(image.RepoDigests) && image.RepoDigests.length > 0 ? image.RepoDigests[0] : null,
    sizeBytes: image.Size,
  };
}

async function startRedis(context, requestedPort = null) {
  const publish = requestedPort === null ? "127.0.0.1::6379" : `127.0.0.1:${requestedPort}:6379`;
  context.containerCreationAttempted = true;
  const result = await docker([
    "run",
    "--detach",
    "--name",
    context.containerName,
    "--publish",
    publish,
    "--mount",
    `type=volume,source=${context.volumeName},target=/data`,
    IMAGE,
    ...REDIS_ARGUMENTS,
  ], { timeout: 120_000 });
  assert.match(result.stdout, /^[0-9a-f]{64}$/, "docker run did not return an exact container ID");

  const inspected = JSON.parse((await docker(["container", "inspect", context.containerName])).stdout);
  assert.equal(inspected.length, 1);
  const binding = inspected[0]?.NetworkSettings?.Ports?.["6379/tcp"];
  assert.ok(Array.isArray(binding) && binding.length === 1, "Redis must have exactly one host port binding");
  assert.equal(binding[0].HostIp, "127.0.0.1", "Redis was not bound only to loopback");
  const allocatedPort = Number(binding[0].HostPort);
  assert.ok(Number.isInteger(allocatedPort) && allocatedPort > 0 && allocatedPort <= 65_535);
  if (requestedPort !== null) {
    assert.equal(allocatedPort, requestedPort, "Redis restart did not reuse the allocated endpoint");
  }
  context.port = allocatedPort;

  const config = await waitForValue(
    async () => {
      try {
        return await readAndAssertRedisConfig(context);
      } catch {
        return null;
      }
    },
    (value) => value !== null,
    10_000,
    "strictly configured Redis startup",
  );
  return config;
}

async function forceStopRedisForRestart(context) {
  assert.equal(context.containerCreationAttempted, true, "Redis container creation was not attempted");
  const killed = await docker(["kill", "--signal", "KILL", context.containerName]);
  assert.equal(killed.stdout, context.containerName);
  const removed = await docker(["rm", context.containerName]);
  assert.equal(removed.stdout, context.containerName);
}

async function closeBull(context, resource, force = false) {
  if (!resource) return;
  try {
    await withTimeout(resource.close(force), 3_000, `close ${resource.constructor.name}`);
  } finally {
    context.resources.delete(resource);
  }
}

async function closeRedis(context, redis) {
  if (!redis) return;
  try {
    if (redis.status === "ready") {
      await withTimeout(redis.quit(), 2_000, "close Redis client");
    } else {
      redis.disconnect();
    }
  } finally {
    context.redisClients.delete(redis);
  }
}

function trackBull(context, resource) {
  resource.on?.("error", () => {});
  context.resources.add(resource);
  return resource;
}

function trackedRedis(context) {
  const redis = new IORedis(queueConnection(context));
  redis.on("error", () => {});
  context.redisClients.add(redis);
  return redis;
}

class ChildHandle {
  constructor(context, child) {
    this.context = context;
    this.child = child;
    this.messages = [];
    this.waiters = [];
    child.on("message", (message) => {
      const index = this.waiters.findIndex((waiter) => waiter.type === message.type);
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    });
    child.on("exit", (code, signal) => {
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`child worker exited before ${waiter.type}: code=${code} signal=${signal}`));
      }
    });
  }

  waitFor(type, milliseconds = WAIT_MS) {
    const index = this.messages.findIndex((message) => message.type === type);
    if (index >= 0) {
      return Promise.resolve(this.messages.splice(index, 1)[0]);
    }
    const fatal = this.messages.find((message) => message.type === "fatal");
    if (fatal) {
      return Promise.reject(new Error(`child worker failed: ${fatal.message}`));
    }
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, reject };
      waiter.timer = setTimeout(() => {
        const waiterIndex = this.waiters.indexOf(waiter);
        if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
        reject(new Error(`child worker ${type} message timed out after ${milliseconds}ms`));
      }, milliseconds);
      this.waiters.push(waiter);
    });
  }

  async kill() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise((resolve) => this.child.once("exit", (code, signal) => resolve({ code, signal })));
    assert.equal(this.child.kill("SIGKILL"), true, "failed to signal child worker");
    const result = await withTimeout(exited, 3_000, "SIGKILL child exit");
    assert.equal(result.signal, "SIGKILL", "child worker did not die from SIGKILL");
  }
}

async function spawnBlockingWorker(context, settings) {
  const child = fork(join(HERE, "child-worker.mjs"), [], {
    cwd: HERE,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
      T172_MODE: settings.mode,
      T172_QUEUE: settings.queueName,
      T172_PREFIX: settings.prefix,
      T172_CONNECTION: JSON.stringify(queueConnection(context)),
      T172_EXECUTION_KEY: settings.executionKey,
      ...(settings.recipient ?? {}),
    },
  });
  const handle = new ChildHandle(context, child);
  context.children.add(handle);
  context.childPeak = Math.max(context.childPeak, [...context.children].filter(
    (candidate) => candidate.child.exitCode === null && candidate.child.signalCode === null,
  ).length);
  await handle.waitFor("ready");
  return handle;
}

async function waitForJobState(queue, jobId, expected, label = `job ${jobId}`) {
  const observed = await waitForValue(
    async () => {
      const job = await queue.getJob(jobId);
      return job ? { job, state: await job.getState() } : null;
    },
    (value) => value?.state === expected,
    WAIT_MS,
    `${label} state ${expected}`,
  );
  if (expected !== "completed" && expected !== "failed") {
    return observed;
  }

  const job = await queue.getJob(jobId);
  assert.ok(job, `${label} disappeared after reaching terminal state ${expected}`);
  const state = await job.getState();
  assert.equal(state, expected, `${label} changed after reaching terminal state ${expected}`);
  return { job, state };
}

async function scenarioDurableRestart(context) {
  const prefix = scenarioPrefix(context, 1);
  const queueName = "durable-acceptance";
  const queue = trackBull(context, new Queue(queueName, { connection: queueConnection(context), prefix }));
  await waitForBullReady(queue, "durable acceptance queue readiness");
  const payload = { intent: "stable-request", messageId: "message-durable-1" };
  const payloadHash = hash(payload);
  const jobId = "durable-job-1";
  const accepted = await queue.add("deliver", { payload, payloadHash }, { jobId });
  assert.equal(accepted.id, jobId);
  await closeBull(context, queue);

  await forceStopRedisForRestart(context);

  const unavailableQueue = trackBull(context, new Queue("unavailable-producer", {
    prefix,
    connection: queueConnection(context, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 500,
    }),
  }));
  let unavailableAccepted = false;
  let unavailableRejected = false;
  const unavailableStarted = Date.now();
  try {
    await withTimeout(
      unavailableQueue.add("must-not-accept", { messageId: "unavailable-message" }, { jobId: "unavailable-job-1" }),
      PRODUCER_FAILURE_BOUND_MS,
      "producer add while Redis unavailable",
    );
    unavailableAccepted = true;
  } catch (error) {
    assert.doesNotMatch(errorText(error), /timed out/, "unavailable producer exceeded its rejection bound");
    unavailableRejected = true;
  }
  const unavailableElapsedMs = Date.now() - unavailableStarted;
  assert.equal(unavailableAccepted, false);
  assert.equal(unavailableRejected, true);
  assert.ok(unavailableElapsedMs <= PRODUCER_FAILURE_BOUND_MS, "unavailable producer rejected outside the fixed bound");
  try {
    await unavailableQueue.disconnect();
  } catch (error) {
    assert.match(errorText(error), /ECONNREFUSED|Connection is closed/);
  } finally {
    context.resources.delete(unavailableQueue);
  }

  const unavailableWorker = trackBull(context, new Worker("unavailable-worker-readiness", async () => undefined, {
    autorun: false,
    connection: queueConnection(context, { maxRetriesPerRequest: null }),
    prefix,
  }));
  const readinessStarted = Date.now();
  let readinessRejected = false;
  try {
    await waitForBullReady(
      unavailableWorker,
      "worker readiness while Redis unavailable",
      WORKER_READINESS_FAILURE_BOUND_MS,
    );
  } catch (error) {
    assert.doesNotMatch(errorText(error), /timed out/, "unavailable Worker exceeded its readiness bound");
    readinessRejected = true;
  }
  const readinessElapsedMs = Date.now() - readinessStarted;
  assert.equal(readinessRejected, true);
  assert.ok(
    readinessElapsedMs <= WORKER_READINESS_FAILURE_BOUND_MS,
    "unavailable Worker rejected readiness outside the fixed bound",
  );
  await closeBull(context, unavailableWorker, true);

  const restartedConfig = await startRedis(context, context.port);
  const restartedImage = await inspectImage();
  assert.equal(restartedImage.imageId, context.image.imageId, "Redis restart resolved a different local image ID");

  const recoveredQueue = trackBull(context, new Queue(queueName, { connection: queueConnection(context), prefix }));
  await waitForBullReady(recoveredQueue, "recovered durable queue readiness");
  const recovered = await recoveredQueue.getJob(jobId);
  assert.ok(recovered, "accepted job was absent after forced Redis restart");
  assert.equal(recovered.id, jobId);
  assert.equal(recovered.data.payloadHash, payloadHash);
  assert.equal(hash(recovered.data.payload), payloadHash);
  const postRestartState = await recovered.getState();
  assert.equal(postRestartState, "waiting");
  assert.ok((await recoveredQueue.getWaiting()).some((job) => job.id === jobId));
  const unavailableRecoveredQueue = trackBull(context, new Queue("unavailable-producer", {
    connection: queueConnection(context),
    prefix,
  }));
  await waitForBullReady(unavailableRecoveredQueue, "recovered unavailable-producer queue readiness");
  assert.equal(await unavailableRecoveredQueue.getJob("unavailable-job-1"), undefined);
  assert.equal(await unavailableRecoveredQueue.count(), 0);
  await closeBull(context, unavailableRecoveredQueue);
  await closeBull(context, recoveredQueue);

  return {
    jobId,
    payloadHash,
    postRestartState,
    effectiveConfig: restartedConfig,
    unavailableProducer: {
      accepted: unavailableAccepted,
      rejected: unavailableRejected,
      persistedAfterRestart: false,
      boundMs: PRODUCER_FAILURE_BOUND_MS,
      elapsedMs: unavailableElapsedMs,
    },
    unavailableWorkerReadiness: {
      rejected: readinessRejected,
      boundMs: WORKER_READINESS_FAILURE_BOUND_MS,
      elapsedMs: readinessElapsedMs,
      reconnectAttempts: REDIS_RECONNECT_ATTEMPTS,
      settledBeforeWatchdog: true,
    },
  };
}

async function scenarioWorkerDeath(context) {
  const prefix = scenarioPrefix(context, 2);
  const queueName = "worker-death-after-lease";
  const jobId = "lease-job-1";
  const executionKey = `${prefix}:observed:executions`;
  const queue = trackBull(context, new Queue(queueName, { connection: queueConnection(context), prefix }));
  const events = trackBull(context, new QueueEvents(queueName, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }),
    prefix,
  }));
  let stalledEvents = 0;
  events.on("stalled", ({ jobId: stalledJobId }) => {
    if (stalledJobId === jobId) stalledEvents += 1;
  });
  await Promise.all([
    waitForBullReady(queue, "worker-death queue readiness"),
    waitForBullReady(events, "worker-death events readiness"),
  ]);

  const child = await spawnBlockingWorker(context, { mode: "lease-block", queueName, prefix, executionKey });
  const activePromise = child.waitFor("active");
  const added = await queue.add("lease", { stable: true }, { jobId });
  assert.equal(added.id, jobId);
  const leased = await activePromise;
  assert.equal(leased.jobId, jobId);
  assert.equal(leased.processingAttempt, 1);
  await child.kill();

  const redis = trackedRedis(context);
  const worker = trackBull(context, new Worker(queueName, async (job) => {
    assert.equal(job.id, jobId);
    const processingAttempt = await redis.incr(executionKey);
    return { jobId: job.id, processingAttempt };
  }, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }),
    prefix,
    lockDuration: 1_200,
    stalledInterval: 500,
    maxStalledCount: 1,
  }));
  await waitForBullReady(worker, "redelivery worker readiness");
  const completed = await waitForJobState(queue, jobId, "completed", "redelivered leased job");
  assert.equal(completed.job.returnvalue.jobId, jobId);
  assert.equal(completed.job.returnvalue.processingAttempt, 2);
  assert.equal(Number(await redis.get(executionKey)), 2);
  await waitForValue(async () => stalledEvents, (count) => count >= 1, 3_000, "stalled event");
  assert.equal(stalledEvents, 1);
  assert.equal(await queue.getCompletedCount(), 1);
  assert.equal(await queue.getFailedCount(), 0);

  await closeBull(context, worker);
  await closeRedis(context, redis);
  await closeBull(context, events);
  await closeBull(context, queue);
  return {
    jobId,
    producerPublishes: 1,
    processingAttempts: 2,
    stalledEvents,
    completedJobs: 1,
  };
}

async function scenarioDuplicateIdempotency(context) {
  const prefix = scenarioPrefix(context, 3);
  const queueName = "duplicate-recipient-idempotency";
  const jobId = "duplicate-job-1";
  const messageId = "message-idempotent-1";
  const receipt = "receipt-stable-1";
  const attemptsKey = `${prefix}:recipient:attempts`;
  const wakeKey = `${prefix}:recipient:wakes`;
  const receiptKey = `${prefix}:recipient:receipt:${messageId}`;
  const queue = trackBull(context, new Queue(queueName, { connection: queueConnection(context), prefix }));
  const events = trackBull(context, new QueueEvents(queueName, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix,
  }));
  await Promise.all([
    waitForBullReady(queue, "recipient-idempotency queue readiness"),
    waitForBullReady(events, "recipient-idempotency events readiness"),
  ]);

  const child = await spawnBlockingWorker(context, {
    mode: "recipient-block",
    queueName,
    prefix,
    executionKey: attemptsKey,
    recipient: {
      T172_RECIPIENT_ATTEMPTS_KEY: attemptsKey,
      T172_RECIPIENT_WAKE_KEY: wakeKey,
      T172_RECIPIENT_RECEIPT_KEY: receiptKey,
      T172_RECEIPT: receipt,
    },
  });
  const deliveredPromise = child.waitFor("delivered");
  await queue.add("deliver", { messageId }, { jobId });
  const firstDelivery = await deliveredPromise;
  assert.equal(firstDelivery.jobId, jobId);
  assert.equal(firstDelivery.processingAttempt, 1);
  assert.equal(firstDelivery.inserted, true);
  assert.equal(firstDelivery.receipt, receipt);
  await child.kill();

  const redis = trackedRedis(context);
  const worker = trackBull(context, new Worker(queueName, async (job) => {
    assert.equal(job.id, jobId);
    const result = await redis.eval(RECIPIENT_SCRIPT, 3, attemptsKey, wakeKey, receiptKey, receipt);
    return {
      messageId,
      receipt: result[2],
      processingAttempt: Number(result[0]),
      visibleWakeInserted: Number(result[1]) === 1,
    };
  }, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }),
    prefix,
    lockDuration: 1_200,
    stalledInterval: 500,
    maxStalledCount: 1,
  }));
  await waitForBullReady(worker, "recipient-idempotency worker readiness");
  const completed = await waitForJobState(queue, jobId, "completed", "idempotently redelivered job");
  assert.equal(completed.job.returnvalue.processingAttempt, 2);
  assert.equal(completed.job.returnvalue.visibleWakeInserted, false);
  assert.equal(completed.job.returnvalue.receipt, receipt);
  const processingAttempts = Number(await redis.get(attemptsKey));
  const visibleWakes = Number(await redis.get(wakeKey));
  const stableReceipt = await redis.get(receiptKey);
  assert.equal(processingAttempts, 2);
  assert.equal(visibleWakes, 1);
  assert.equal(stableReceipt, receipt);
  assert.equal(await queue.getCompletedCount(), 1);

  await closeBull(context, worker);
  await closeRedis(context, redis);
  await closeBull(context, events);
  await closeBull(context, queue);
  return {
    jobId,
    messageId,
    processingAttempts,
    visibleWakes,
    stableReceipt,
    completedJobs: 1,
    guarantee: "at-least-once processing with recipient idempotency; not exactly once",
  };
}

async function scenarioDisconnectedRecipient(context) {
  const prefix = scenarioPrefix(context, 4);
  const queueName = "disconnected-recipient";
  const jobId = "disconnected-job-1";
  const queue = trackBull(context, new Queue(queueName, { connection: queueConnection(context), prefix }));
  const events = trackBull(context, new QueueEvents(queueName, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix,
  }));
  let completedEvents = 0;
  let failedEventReason = null;
  events.on("completed", () => { completedEvents += 1; });
  events.on("failed", ({ jobId: failedId, failedReason }) => {
    if (failedId === jobId) failedEventReason = failedReason;
  });
  await Promise.all([
    waitForBullReady(queue, "disconnected-recipient queue readiness"),
    waitForBullReady(events, "disconnected-recipient events readiness"),
  ]);

  let processingAttempts = 0;
  const worker = trackBull(context, new Worker(queueName, async (job) => {
    assert.equal(job.id, jobId);
    processingAttempts += 1;
    throw new Error("RECIPIENT_UNAVAILABLE");
  }, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }),
    prefix,
  }));
  await waitForBullReady(worker, "disconnected-recipient worker readiness");
  const acceptedJob = await queue.add("deliver", { recipient: "absent" }, {
    jobId,
    attempts: 3,
    backoff: { type: "fixed", delay: 100 },
  });
  assert.equal(acceptedJob.id, jobId);
  const failed = await waitForJobState(queue, jobId, "failed", "disconnected recipient job");
  await waitForValue(async () => failedEventReason, (reason) => reason !== null, 2_000, "failed event");
  assert.equal(processingAttempts, 3);
  assert.equal(failed.job.attemptsMade, 3);
  assert.equal(failed.job.failedReason, "RECIPIENT_UNAVAILABLE");
  assert.equal(failed.job.returnvalue, null);
  assert.equal(failedEventReason, "RECIPIENT_UNAVAILABLE");
  assert.equal(completedEvents, 0);
  assert.equal(await queue.getCompletedCount(), 0);
  assert.equal(await queue.getFailedCount(), 1);

  await closeBull(context, worker);
  await closeBull(context, events);
  await closeBull(context, queue);
  return {
    jobId,
    durablyAccepted: true,
    processingAttempts,
    terminalState: "failed",
    failedReason: failed.job.failedReason,
    completedEvents,
    completedJobs: 0,
    returnValue: failed.job.returnvalue,
  };
}

async function scenarioProjectIsolation(context) {
  const prefixA = `${scenarioPrefix(context, 5)}:project-a`;
  const prefixB = `${scenarioPrefix(context, 5)}:project-b`;
  const queueNameA = "project-a-delivery";
  const queueNameB = "project-b-delivery";
  const jobId = "shared-custom-job-1";
  const queueA = trackBull(context, new Queue(queueNameA, { connection: queueConnection(context), prefix: prefixA }));
  const queueB = trackBull(context, new Queue(queueNameB, { connection: queueConnection(context), prefix: prefixB }));
  await Promise.all([
    waitForBullReady(queueA, "project A queue readiness"),
    waitForBullReady(queueB, "project B queue readiness"),
  ]);
  const [jobA, jobB] = await Promise.all([
    queueA.add("deliver", { project: "A" }, { jobId }),
    queueB.add("deliver", { project: "B" }, { jobId }),
  ]);
  assert.equal(jobA.id, jobId);
  assert.equal(jobB.id, jobId);

  let executionsA = 0;
  let executionsB = 0;
  const workerA = trackBull(context, new Worker(queueNameA, async (job) => {
    executionsA += 1;
    return { project: "A", jobId: job.id };
  }, { connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix: prefixA }));
  await waitForBullReady(workerA, "project A worker readiness");
  await waitForJobState(queueA, jobId, "completed", "project A job");
  await sleep(300);
  const bBeforeWorker = await jobB.getState();
  assert.equal(bBeforeWorker, "waiting");
  assert.equal(executionsA, 1);
  assert.equal(executionsB, 0);
  assert.equal(await queueA.getCompletedCount(), 1);
  assert.equal(await queueB.getCompletedCount(), 0);

  const workerB = trackBull(context, new Worker(queueNameB, async (job) => {
    executionsB += 1;
    return { project: "B", jobId: job.id };
  }, { connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix: prefixB }));
  await waitForBullReady(workerB, "project B worker readiness");
  await waitForJobState(queueB, jobId, "completed", "project B job");
  assert.equal(executionsB, 1);
  assert.equal(await queueB.getCompletedCount(), 1);

  await closeBull(context, workerB);
  await closeBull(context, workerA);
  await closeBull(context, queueB);
  await closeBull(context, queueA);
  return {
    customJobIdInBothQueues: jobId,
    projectACompletedBeforeBWorker: true,
    projectBStateBeforeOwnWorker: bBeforeWorker,
    projectAExecutions: executionsA,
    projectBExecutions: executionsB,
    boundary: "queue/prefix namespace isolation, not a hostile security boundary",
  };
}

async function pollDurableResult(queue, retainedJobId) {
  const completed = await waitForValue(
    async () => {
      const job = await Job.fromId(queue, retainedJobId);
      if (!job) return null;
      const state = await job.getState();
      return state === "completed" && job.returnvalue !== null ? job : null;
    },
    (job) => job !== null,
    WAIT_MS,
    `caller query for retained job ${retainedJobId}`,
  );
  return completed.returnvalue;
}

async function scenarioFanIn(context) {
  const prefix = scenarioPrefix(context, 6);
  const queueName = "equivalent-request-fan-in";
  const deduplicationId = "ownership-key-1";
  const callers = Array.from({ length: 4 }, () => trackBull(
    context,
    new Queue(queueName, { connection: queueConnection(context), prefix }),
  ));
  const events = trackBull(context, new QueueEvents(queueName, {
    connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix,
  }));
  await Promise.all([
    ...callers.map((queue, index) => waitForBullReady(queue, `fan-in caller ${index + 1} readiness`)),
    waitForBullReady(events, "fan-in events readiness"),
  ]);

  let releaseBarrier;
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  let workerExecutions = 0;
  let recipientWakes = 0;
  let signalWorkerStarted;
  const workerStarted = new Promise((resolve) => { signalWorkerStarted = resolve; });
  const stableResult = { owner: "broker-project-a", ownershipKey: deduplicationId, decision: "retained" };
  const worker = trackBull(context, new Worker(queueName, async () => {
    workerExecutions += 1;
    recipientWakes += 1;
    signalWorkerStarted();
    await barrier;
    return stableResult;
  }, { connection: queueConnection(context, { maxRetriesPerRequest: null }), prefix }));
  await waitForBullReady(worker, "fan-in worker readiness");

  const request = { ownershipKey: deduplicationId, project: "A" };
  const addedJobs = await Promise.all(callers.map((queue) => queue.add("ownership-request", request, {
    deduplication: { id: deduplicationId },
  })));
  await withTimeout(workerStarted, 3_000, "fan-in worker start");
  assert.equal(typeof callers[0].getDeduplicationJobId, "function", "BullMQ documented deduplication lookup API is unavailable");
  const retainedJobId = await callers[0].getDeduplicationJobId(deduplicationId);
  assert.ok(retainedJobId, "deduplication ID did not resolve to a retained job");
  const returnedJobIds = addedJobs.map((job) => job.id);
  const retainedBeforeRelease = await callers[0].getJob(retainedJobId);
  assert.ok(retainedBeforeRelease, "retained job could not be queried before barrier release");
  assert.ok(["active", "waiting"].includes(await retainedBeforeRelease.getState()));
  assert.equal(await callers[0].getJobCounts("active", "waiting").then((counts) => counts.active + counts.waiting), 1);

  const resultQueries = callers.map((queue) => pollDurableResult(queue, retainedJobId));
  releaseBarrier();
  const results = await Promise.all(resultQueries);
  const serializedResults = results.map((result) => JSON.stringify(result));
  assert.equal(new Set(serializedResults).size, 1);
  assert.equal(serializedResults[0], JSON.stringify(stableResult));
  assert.equal(workerExecutions, 1);
  assert.equal(recipientWakes, 1);
  assert.equal(await callers[0].getCompletedCount(), 1);

  await closeBull(context, worker);
  await closeBull(context, events);
  for (const queue of callers.reverse()) await closeBull(context, queue);
  return {
    callers: 4,
    deduplicationId,
    addReturnJobIds: returnedJobIds,
    retainedJobId,
    retainedJobResolution: "Queue.getDeduplicationJobId",
    workerExecutions,
    recipientWakes,
    completedJobs: 1,
    byteIdenticalResults: 4,
    resultHash: hash(stableResult),
    boundary: "exact-key concurrent in-flight fan-in only; no semantic equivalence or post-completion cache claim",
  };
}

async function directorySize(path) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory()) return metadata.size;
  let total = 0;
  for (const entry of await readdir(path)) {
    total += await directorySize(join(path, entry));
  }
  return total;
}

function parsePercent(value) {
  assert.match(value, /^\d+(?:\.\d+)?%$/);
  return Number(value.slice(0, -1));
}

async function measureFootprint(context) {
  await sleep(750);
  const statsResult = await docker(["stats", "--no-stream", "--format", "{{json .}}", context.containerName]);
  const stats = JSON.parse(statsResult.stdout);
  const status = (await docker(["exec", context.containerName, "cat", "/proc/1/status"])).stdout;
  const rssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  assert.ok(rssMatch, "Redis VmRSS was not available from its container process status");
  const dockerReportedPids = Number(stats.PIDs);
  assert.ok(Number.isInteger(dockerReportedPids) && dockerReportedPids >= 1);
  const topLines = (await docker(["top", context.containerName, "-eo", "pid,comm"])).stdout
    .split("\n")
    .filter((line) => line.trim() !== "");
  assert.ok(topLines.length >= 2, "Docker top did not report the Redis process");
  const redisProcessCount = topLines.length - 1;
  const dependencyBytes = await directorySize(join(HERE, "node_modules"));
  return {
    image: context.image,
    redisIdle: {
      rssKiB: Number(rssMatch[1]),
      cpuPercent: parsePercent(stats.CPUPerc),
      dockerMemoryUsage: stats.MemUsage,
      dockerReportedPids,
      containerProcessCount: redisProcessCount,
    },
    processCount: {
      steadyStateProbeNode: 1,
      steadyStateRedisProcesses: redisProcessCount,
      dockerReportedRedisPidsAndThreads: dockerReportedPids,
      peakScenarioChildWorkers: context.childPeak,
      steadyStateProcesses: 1 + redisProcessCount,
    },
    probeLocalInstalledDependencyBytes: dependencyBytes,
    configuration: {
      dockerImageTag: IMAGE,
      redisArguments: REDIS_ARGUMENTS,
      effectiveRedisConfig: context.effectiveConfig,
      hostBinding: `127.0.0.1:${context.port}`,
      snapshotsDisabled: true,
    },
    measurementBoundary: "local one-run Docker measurements; non-generalizable across hosts and container runtimes",
  };
}

async function exactDockerObjectExists(kind, name) {
  const result = await docker([kind, "inspect", name], { allowFailure: true });
  if (result.ok) return true;
  assert.equal(result.code, 1, `unexpected docker ${kind} inspect failure for ${name}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /no such/i, `docker did not report ${name} absent`);
  return false;
}

async function removeExactDockerObject(kind, name, removeArgs) {
  if (!await exactDockerObjectExists(kind, name)) return;
  const removed = await docker(removeArgs);
  assert.equal(removed.stdout, name, `docker did not confirm removal of exact ${kind} ${name}`);
  assert.equal(await exactDockerObjectExists(kind, name), false, `exact ${kind} ${name} remains after removal`);
}

async function endpointClosed(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`probe endpoint 127.0.0.1:${port} did not close promptly`));
    }, 750);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(`probe endpoint 127.0.0.1:${port} still accepts connections`));
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function cleanup(context) {
  const cleanupErrors = [];
  for (const handle of context.children) {
    try {
      if (handle.child.exitCode === null && handle.child.signalCode === null) {
        await handle.kill();
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const resource of [...context.resources].reverse()) {
    try {
      await closeBull(context, resource, true);
    } catch (error) {
      resource.disconnect?.();
      context.resources.delete(resource);
      cleanupErrors.push(error);
    }
  }
  for (const redis of [...context.redisClients]) {
    try {
      redis.disconnect();
      context.redisClients.delete(redis);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const [attempted, kind, name, removeArgs] of [
    [context.containerCreationAttempted, "container", context.containerName, ["rm", "--force", context.containerName]],
    [context.volumeCreationAttempted, "volume", context.volumeName, ["volume", "rm", context.volumeName]],
  ]) {
    if (!attempted) continue;
    try {
      await removeExactDockerObject(kind, name, removeArgs);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (context.tempDirectory) {
    try {
      await rm(context.tempDirectory, { recursive: true, force: false });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "one or more exact probe resources could not be cleaned up");
  }
}

async function verifyCleanup(context) {
  assert.equal(await exactDockerObjectExists("container", context.containerName), false);
  assert.equal(await exactDockerObjectExists("volume", context.volumeName), false);
  for (const handle of context.children) {
    assert.ok(handle.child.exitCode !== null || handle.child.signalCode !== null, `child PID ${handle.child.pid} remains live`);
  }
  if (context.port) await endpointClosed(context.port);
  const temp = await lstat(context.tempDirectory).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  assert.equal(temp, false, "probe temporary directory remains");
  return {
    containerAbsent: true,
    volumeAbsent: true,
    childProcessesAbsent: true,
    listeningSocketAbsent: true,
    temporaryDirectoryAbsent: true,
  };
}

const runId = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString("hex")}`.toLowerCase();
const context = {
  runId,
  containerName: `qq-t172-probe-${runId}`,
  volumeName: `qq-t172-probe-${runId}`,
  containerCreationAttempted: false,
  volumeCreationAttempted: false,
  port: null,
  image: null,
  effectiveConfig: null,
  tempDirectory: null,
  resources: new Set(),
  redisClients: new Set(),
  children: new Set(),
  childPeak: 0,
};

let receivedSignal = null;
process.on("SIGINT", () => { receivedSignal = "SIGINT"; });
process.on("SIGTERM", () => { receivedSignal = "SIGTERM"; });

function assertNoSignal() {
  assert.equal(receivedSignal, null, `received ${receivedSignal}; cleaning up after the current bounded operation`);
}

const scenarios = [
  ["durable-acceptance-and-redis-restart", scenarioDurableRestart],
  ["worker-death-after-lease", scenarioWorkerDeath],
  ["duplicate-redelivery-with-recipient-idempotency", scenarioDuplicateIdempotency],
  ["disconnected-recipient-truthfulness", scenarioDisconnectedRecipient],
  ["project-isolation", scenarioProjectIsolation],
  ["four-equivalent-requests-fan-in", scenarioFanIn],
];
let scenariosPassed = 0;
let failure = null;
let footprint = null;
let cleanupEvidence = null;

try {
  context.tempDirectory = await mkdtemp(join(tmpdir(), `qq-t172-${runId}-`));
  context.volumeCreationAttempted = true;
  const volume = await docker(["volume", "create", context.volumeName]);
  assert.equal(volume.stdout, context.volumeName);
  context.effectiveConfig = await startRedis(context);
  context.image = await inspectImage();
  assertNoSignal();

  for (const [scenario, run] of scenarios) {
    try {
      const evidence = await run(context);
      assertNoSignal();
      scenariosPassed += 1;
      output({ scenario, status: "pass", ...evidence });
    } catch (error) {
      failure = error;
      output({ scenario, status: "fail", error: errorText(error) });
      break;
    }
  }
  if (!failure && scenariosPassed === scenarios.length) {
    footprint = await measureFootprint(context);
    assertNoSignal();
  }
} catch (error) {
  failure = failure ?? error;
  if (scenariosPassed === 0) {
    output({ scenario: scenarios[0][0], status: "fail", error: errorText(error) });
  }
} finally {
  try {
    await cleanup(context);
    cleanupEvidence = await verifyCleanup(context);
  } catch (error) {
    failure = failure ?? error;
  }
}

const cleanupPassed = cleanupEvidence !== null;
output({
  scenario: "operational-footprint-and-cleanup",
  status: !failure && footprint && cleanupPassed ? "pass" : "fail",
  ...(footprint ?? {}),
  cleanup: cleanupEvidence,
  ...(!cleanupPassed ? { error: errorText(failure) } : {}),
});
output({
  summary: "t172-bullmq-redis-message-plane-probe",
  status: !failure && scenariosPassed === scenarios.length && cleanupPassed ? "pass" : "fail",
  runId,
  scenariosPassed: scenariosPassed + (cleanupPassed && footprint ? 1 : 0),
  scenariosExpected: 7,
  image: context.image,
  cleanupVerified: cleanupPassed,
  ...(failure ? { error: errorText(failure) } : {}),
});

if (receivedSignal) {
  process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
} else if (failure || scenariosPassed !== scenarios.length || !cleanupPassed) {
  process.exitCode = 1;
}
