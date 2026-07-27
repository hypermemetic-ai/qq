#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFile, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lstat, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import process from "node:process";
import { promisify } from "node:util";

import {
  AckPolicy,
  DeliverPolicy,
  DiscardPolicy,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
  jetstream,
  jetstreamManager,
} from "@nats-io/jetstream";
import { connect, nanos } from "@nats-io/transport-node";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGE_DIGEST = "sha256:67ac7866d010e8d83302dd30332eeae1a2b7a8ee051155e2eb5a5485b720cd4b";
const IMAGE = `nats:2.14.3@${IMAGE_DIGEST}`;
const WAIT_MS = 15_000;
const JS_TIMEOUT_MS = 1_000;
const PULL_EXPIRES_MS = 3_000;
const UNAVAILABLE_BOUND_MS = 1_500;
const STREAM_MAX_BYTES = 16 * 1024 * 1024;
const STREAM_MAX_MESSAGES = 10_000;
const MAX_PAYLOAD = 65_536;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// PROBE_DECISION: use two bounded LimitsPolicy streams so same message IDs are independent by project.
// PROBE_DECISION: retain request, receipt, wake, result, and terminal bytes in each project's one stream.
// PROBE_DECISION: use probe-only 250/500/1000ms BackOff and MaxDeliver three, not production timings.
// PROBE_DECISION: materialize terminal records from an online, non-durable advisory subscription.
// PROBE_DECISION: exact-key fan-in and waiter settlement are an application-authored in-process Map.

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function errorText(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function bytes(value) {
  return encoder.encode(JSON.stringify(value));
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertBytesEqual(actual, expected, label) {
  assert.equal(Buffer.from(actual).toString("base64"), Buffer.from(expected).toString("base64"), label);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    if (options.allowFailure) return result;
    throw new Error(`${file} ${args.join(" ")} failed: ${result.stderr || result.message}`);
  }
}

function docker(args, options) {
  return command("docker", args, options);
}

async function waitForValue(read, accept, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await sleep(100);
  }
  throw new Error(`${label} timed out after ${milliseconds}ms; last=${JSON.stringify(last)}`);
}

async function httpJson(url, timeout = 1_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  assert.equal(response.ok, true, `HTTP ${url} returned ${response.status}`);
  return response.json();
}

function connectionOptions(context, overrides = {}) {
  assert.ok(context.clientPort, "NATS client port is not allocated");
  return {
    servers: [`nats://127.0.0.1:${context.clientPort}`],
    timeout: 1_000,
    reconnect: true,
    maxReconnectAttempts: 8,
    reconnectTimeWait: 250,
    reconnectJitter: 0,
    reconnectJitterTLS: 0,
    waitOnFirstConnect: false,
    noRandomize: true,
    ...overrides,
  };
}

async function openConnection(context, overrides = {}) {
  const nc = await connect(connectionOptions(context, overrides));
  context.connections.add(nc);
  return nc;
}

async function closeConnection(context, nc) {
  if (!nc) return;
  let forced = false;
  const drain = nc.drain();
  const timer = setTimeout(() => {
    forced = true;
    void nc.close();
  }, 2_000);
  try {
    await drain;
  } finally {
    clearTimeout(timer);
    if (forced) await nc.close().catch(() => undefined);
    context.connections.delete(nc);
  }
}

async function inspectImage() {
  const inspected = JSON.parse((await docker(["image", "inspect", IMAGE])).stdout);
  assert.equal(inspected.length, 1, "expected one exact NATS image record");
  const image = inspected[0];
  assert.match(image.Id, /^sha256:[0-9a-f]{64}$/);
  assert.ok(image.RepoDigests?.some((digest) => digest.endsWith(`@${IMAGE_DIGEST}`)), "resolved image lacks pinned official digest");
  assert.ok(Number.isSafeInteger(image.Size) && image.Size > 0);
  return {
    reference: IMAGE,
    expectedOfficialDigest: IMAGE_DIGEST,
    localImageId: image.Id,
    localRepoDigests: image.RepoDigests,
    localImageBytes: image.Size,
  };
}

async function assertDockerBindings(context) {
  const inspected = JSON.parse((await docker(["container", "inspect", context.containerName])).stdout);
  assert.equal(inspected.length, 1);
  const ports = inspected[0]?.NetworkSettings?.Ports;
  const result = {};
  for (const [containerPort, key] of [["4222/tcp", "clientPort"], ["8222/tcp", "monitorPort"]]) {
    const binding = ports?.[containerPort];
    assert.ok(Array.isArray(binding) && binding.length === 1, `${containerPort} must have exactly one host binding`);
    assert.equal(binding[0].HostIp, "127.0.0.1", `${containerPort} host binding is not loopback-only`);
    const port = Number(binding[0].HostPort);
    assert.ok(Number.isInteger(port) && port > 0 && port <= 65_535);
    if (context[key] !== null) assert.equal(port, context[key], `${containerPort} changed across restart`);
    context[key] = port;
    result[containerPort] = { hostIp: binding[0].HostIp, hostPort: port };
  }
  context.bindings = result;
  return result;
}

async function startServer(context) {
  const clientPublish = context.clientPort === null ? "127.0.0.1::4222" : `127.0.0.1:${context.clientPort}:4222`;
  const monitorPublish = context.monitorPort === null ? "127.0.0.1::8222" : `127.0.0.1:${context.monitorPort}:8222`;
  context.containerCreationAttempted = true;
  const started = await docker([
    "run", "--detach", "--name", context.containerName,
    "--publish", clientPublish,
    "--publish", monitorPublish,
    "--mount", `type=volume,source=${context.volumeName},target=/data`,
    "--mount", `type=bind,source=${context.configPath},target=/etc/nats/probe.conf,readonly`,
    IMAGE, "-c", "/etc/nats/probe.conf",
  ], { timeout: 120_000 });
  assert.match(started.stdout, /^[0-9a-f]{64}$/, "docker run did not return an exact container ID");
  await assertDockerBindings(context);
  await waitForValue(
    async () => httpJson(`http://127.0.0.1:${context.monitorPort}/healthz?js-enabled-only=true`).catch(() => null),
    (health) => health?.status === "ok",
    10_000,
    "NATS JetStream health",
  );
  const image = await inspectImage();
  assert.ok(image.localRepoDigests.some((digest) => digest.endsWith(`@${IMAGE_DIGEST}`)));
  return image;
}

async function forceKillServerForRestart(context) {
  assert.equal(context.containerCreationAttempted, true);
  const killed = await docker(["kill", "--signal", "KILL", context.containerName]);
  assert.equal(killed.stdout, context.containerName);
  const removed = await docker(["rm", context.containerName]);
  assert.equal(removed.stdout, context.containerName);
}

function streamConfig(context, project) {
  return {
    name: context.streams[project],
    subjects: [`${context.roots[project]}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    discard: DiscardPolicy.Old,
    max_consumers: 4,
    max_msgs: STREAM_MAX_MESSAGES,
    max_msgs_per_subject: 100,
    max_bytes: STREAM_MAX_BYTES,
    max_age: nanos(60 * 60 * 1_000),
    max_msg_size: MAX_PAYLOAD,
    duplicate_window: nanos(5 * 60 * 1_000),
    num_replicas: 1,
    allow_direct: false,
  };
}

function consumerConfig(context, project) {
  return {
    durable_name: context.consumers[project],
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    replay_policy: ReplayPolicy.Instant,
    filter_subject: `${context.roots[project]}.request.>`,
    max_deliver: 3,
    backoff: [nanos(250), nanos(500), nanos(1_000)],
    max_ack_pending: 1,
    max_waiting: 4,
    max_batch: 1,
    max_expires: nanos(5_000),
    num_replicas: 1,
    mem_storage: false,
  };
}

async function createTopology(context) {
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  for (const project of ["A", "B"]) {
    const stream = await jsm.streams.add(streamConfig(context, project));
    assert.equal(stream.config.storage, StorageType.File);
    assert.equal(stream.config.num_replicas, 1);
    const consumer = await jsm.consumers.add(context.streams[project], consumerConfig(context, project));
    assert.equal(consumer.config.max_deliver, 3);
    assert.equal(consumer.config.max_ack_pending, 1);
  }
}

async function pull(context, project, expires = PULL_EXPIRES_MS) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const consumer = await js.consumers.get(context.streams[project], context.consumers[project]);
  return consumer.next({ expires });
}

async function confirmedAck(message) {
  assert.equal(await message.ackAck({ timeout: JS_TIMEOUT_MS }), true, "server did not confirm explicit ACK");
}

function request(context, project, scenario, requestId, extra = {}) {
  const value = { schema: 1, requestId, scenario, project, ...extra };
  const body = bytes(value);
  return {
    value,
    body,
    hash: hashBytes(body),
    subject: `${context.roots[project]}.request.${scenario}`,
  };
}

function messageId(message) {
  return message.headers?.get("Nats-Msg-Id") ?? null;
}

function assertDelivery(message, expected, count, redelivered) {
  assert.ok(message, "expected a JetStream delivery");
  assert.equal(message.info.streamSequence, expected.sequence);
  assert.equal(messageId(message), expected.id);
  assertBytesEqual(message.data, expected.body, "delivered body changed");
  assert.equal(hashBytes(message.data), expected.hash);
  assert.equal(message.info.deliveryCount, count);
  assert.equal(message.redelivered, redelivered);
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
        waiter.reject(new Error(`child exited before ${waiter.type}: code=${code} signal=${signal}`));
      }
    });
  }

  waitFor(type, milliseconds = WAIT_MS) {
    const found = this.messages.findIndex((message) => message.type === type);
    if (found >= 0) return Promise.resolve(this.messages.splice(found, 1)[0]);
    const fatal = this.messages.find((message) => message.type === "fatal");
    if (fatal) return Promise.reject(new Error(fatal.message));
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, reject };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`child ${type} wait exceeded ${milliseconds}ms`));
      }, milliseconds);
      this.waiters.push(waiter);
    });
  }

  async kill() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise((resolve) => this.child.once("exit", (code, signal) => resolve({ code, signal })));
    assert.equal(this.child.kill("SIGKILL"), true);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        reject(new Error(`SIGKILL child ${this.child.pid} exit exceeded 3000ms`));
      }, 3_000);
    });
    try {
      const result = await Promise.race([exited, timeout]);
      assert.equal(result.signal, "SIGKILL");
    } finally {
      clearTimeout(timer);
    }
  }
}

async function spawnChild(context, mode, extra = {}) {
  const child = fork(join(HERE, "child-worker.mjs"), [], {
    cwd: HERE,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
      T172_MODE: mode,
      T172_SERVER: `nats://127.0.0.1:${context.clientPort}`,
      T172_STREAM: context.streams.A,
      T172_CONSUMER: context.consumers.A,
      ...extra,
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

async function scenarioDurableRestart(context) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const item = request(context, "A", "s1", "durable-request-1", { intent: "stable" });
  const ack = await js.publish(item.subject, item.body, { msgID: item.value.requestId, timeout: JS_TIMEOUT_MS, retries: 0 });
  assert.equal(ack.stream, context.streams.A);
  assert.equal(ack.duplicate, false);
  item.sequence = ack.seq;
  item.id = item.value.requestId;
  const delivery = await pull(context, "A");
  assertDelivery(delivery, item, 1, false);
  await confirmedAck(delivery);
  let before = await waitForValue(
    () => jsm.consumers.info(context.streams.A, context.consumers.A),
    (info) => info.ack_floor.stream_seq === ack.seq,
    3_000,
    "durable consumer ACK floor",
  );
  await sleep(1_000);
  before = await jsm.consumers.info(context.streams.A, context.consumers.A);

  await closeConnection(context, context.mainNc);
  context.mainNc = null;
  await forceKillServerForRestart(context);

  const unavailableStarted = Date.now();
  let unavailableRejected = false;
  try {
    await connect(connectionOptions(context, { timeout: 500, reconnect: false, maxReconnectAttempts: 0 }));
  } catch {
    unavailableRejected = true;
  }
  const unavailableElapsedMs = Date.now() - unavailableStarted;
  assert.equal(unavailableRejected, true, "no-reconnect producer unexpectedly connected while NATS was absent");
  assert.ok(unavailableElapsedMs <= UNAVAILABLE_BOUND_MS, "unavailable producer rejected outside its bound");

  await startServer(context);
  context.mainNc = await openConnection(context);
  const recoveredJsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const stored = await recoveredJsm.streams.getMessage(context.streams.A, { seq: ack.seq });
  assert.ok(stored);
  assert.equal(stored.seq, ack.seq);
  assert.equal(stored.subject, item.subject);
  assertBytesEqual(stored.data, item.body, "stored request changed across server restart");
  assert.equal(hashBytes(stored.data), item.hash);
  const after = await recoveredJsm.consumers.info(context.streams.A, context.consumers.A);
  assert.equal(after.ack_floor.stream_seq, before.ack_floor.stream_seq);
  assert.equal(after.delivered.stream_seq, before.delivered.stream_seq);
  const unavailableStored = await recoveredJsm.streams.getMessage(context.streams.A, {
    last_by_subj: `${context.roots.A}.request.unavailable`,
  });
  assert.equal(unavailableStored, null);

  return {
    requestId: item.value.requestId,
    stream: ack.stream,
    streamSequence: ack.seq,
    bodyHash: item.hash,
    pubAckDuplicate: ack.duplicate,
    durableConsumerStateBefore: before.ack_floor,
    durableConsumerStateAfter: after.ack_floor,
    consumerStatePersistenceSettleMs: 1_000,
    noProducerRepublish: true,
    unavailableProducer: {
      reconnect: false,
      rejected: unavailableRejected,
      elapsedMs: unavailableElapsedMs,
      boundMs: UNAVAILABLE_BOUND_MS,
      acceptedRecordAbsent: true,
    },
    boundary: "one file-backed replica survived a container-process kill/restart; not host-power-loss or HA evidence",
  };
}

async function scenarioConsumerDeath(context) {
  const item = request(context, "A", "s2", "consumer-death-request-1");
  const child = await spawnChild(context, "lease-block");
  const delivered = child.waitFor("delivered");
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const ack = await js.publish(item.subject, item.body, { msgID: item.value.requestId, timeout: JS_TIMEOUT_MS, retries: 0 });
  item.sequence = ack.seq;
  item.id = item.value.requestId;
  const first = await delivered;
  assert.equal(first.streamSequence, ack.seq);
  assert.equal(first.messageId, item.id);
  assert.equal(first.body, decoder.decode(item.body));
  assert.equal(first.deliveryCount, 1);
  assert.equal(first.redelivered, false);
  await child.kill();
  const second = await pull(context, "A", 5_000);
  assertDelivery(second, item, 2, true);
  await confirmedAck(second);
  const manager = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const info = await manager.streams.info(context.streams.A);
  assert.ok(info.state.messages >= 2);
  return {
    requestId: item.id,
    streamSequence: ack.seq,
    producerPublishes: 1,
    deliveries: [1, 2],
    secondDeliveryRedelivered: true,
    secondDeliveryConfirmedAck: true,
  };
}

async function scenarioRecipientIdempotency(context) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const before = (await jsm.streams.info(context.streams.A)).state.messages;
  const item = request(context, "A", "s3", "recipient-idempotency-request-1");
  const receiptSubject = `${context.roots.A}.receipt.${item.value.requestId}`;
  const wakeSubject = `${context.roots.A}.wake.${item.value.requestId}`;
  const receipt = { requestId: item.value.requestId, receiptId: "stable-receipt-1", status: "accepted" };
  const receiptBody = JSON.stringify(receipt);
  const child = await spawnChild(context, "receipt-block", {
    T172_RECEIPT_SUBJECT: receiptSubject,
    T172_WAKE_SUBJECT: wakeSubject,
    T172_RECEIPT_BODY: receiptBody,
    T172_RECEIPT_ID: receipt.receiptId,
  });
  const delivered = child.waitFor("delivered");
  const ack = await js.publish(item.subject, item.body, { msgID: item.value.requestId, timeout: JS_TIMEOUT_MS, retries: 0 });
  item.sequence = ack.seq;
  item.id = item.value.requestId;
  const first = await delivered;
  assert.equal(first.streamSequence, ack.seq);
  assert.equal(first.deliveryCount, 1);
  assert.equal(first.receiptBody, receiptBody);
  await child.kill();

  const second = await pull(context, "A", 5_000);
  assertDelivery(second, item, 2, true);
  const receiptStored = await jsm.streams.getMessage(context.streams.A, { last_by_subj: receiptSubject });
  const wakeStored = await jsm.streams.getMessage(context.streams.A, { last_by_subj: wakeSubject });
  assert.ok(receiptStored && wakeStored);
  assert.equal(decoder.decode(receiptStored.data), receiptBody);
  assert.equal(hashBytes(receiptStored.data), hashBytes(encoder.encode(receiptBody)));
  await confirmedAck(second);
  const after = (await jsm.streams.info(context.streams.A)).state.messages;
  assert.equal(after - before, 3, "scenario must add one request, one receipt, and one wake only");
  return {
    requestId: item.id,
    deliveries: 2,
    receiptRecords: 1,
    stableReceiptHash: hashBytes(receiptStored.data),
    visibleWakeRecords: 1,
    confirmedAck: true,
    guarantee: "at-least-once plus recipient idempotency; not exactly once",
    customOrderingGap: "receipt is stored before external-visible wake; a crash between them can lose the wake, so one custom reconciliation gap remains",
  };
}

function oneShotSubscription(nc, subject, milliseconds) {
  let subscription;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.unsubscribe();
      reject(new Error(`advisory ${subject} timed out after ${milliseconds}ms`));
    }, milliseconds);
    subscription = nc.subscribe(subject, {
      max: 1,
      callback(error, message) {
        clearTimeout(timer);
        subscription.unsubscribe();
        if (error) reject(error);
        else resolve(JSON.parse(decoder.decode(message.data)));
      },
    });
  });
  return { subscription, promise };
}

async function scenarioDisconnectedRecipient(context) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const before = (await jsm.streams.info(context.streams.A)).state.messages;
  const item = request(context, "A", "s4", "disconnected-recipient-request-1", { recipient: "absent" });
  const advisorySubject = `$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.${context.streams.A}.${context.consumers.A}`;
  const advisoryWait = oneShotSubscription(context.mainNc, advisorySubject, 10_000);
  await context.mainNc.flush();
  const ack = await js.publish(item.subject, item.body, { msgID: item.value.requestId, timeout: JS_TIMEOUT_MS, retries: 0 });
  item.sequence = ack.seq;
  item.id = item.value.requestId;
  const observed = [];
  for (let count = 1; count <= 3; count += 1) {
    const delivery = await pull(context, "A", 5_000);
    assertDelivery(delivery, item, count, count > 1);
    observed.push(delivery.info.deliveryCount);
  }
  const fourthPull = pull(context, "A", 2_000);
  const [advisory, exhaustedDelivery] = await Promise.all([advisoryWait.promise, fourthPull]);
  assert.equal(advisory.stream, context.streams.A);
  assert.equal(advisory.consumer, context.consumers.A);
  assert.equal(advisory.stream_seq, ack.seq);
  assert.equal(advisory.deliveries, 3);
  assert.equal(exhaustedDelivery, null, "MaxDeliver-exhausted request was delivered a fourth time");

  const terminal = {
    schema: 1,
    reason: "RECIPIENT_UNAVAILABLE",
    requestId: item.id,
    streamSequence: ack.seq,
    attempts: 3,
  };
  const terminalBody = bytes(terminal);
  const terminalSubject = `${context.roots.A}.terminal.${item.id}`;
  const terminalAck = await js.publish(terminalSubject, terminalBody, {
    msgID: `terminal-${item.id}`,
    timeout: JS_TIMEOUT_MS,
    retries: 0,
    expect: { lastSubjectSequence: 0 },
  });
  assert.equal(terminalAck.duplicate, false);
  const terminalStored = await jsm.streams.getMessage(context.streams.A, { last_by_subj: terminalSubject });
  assert.ok(terminalStored);
  assertBytesEqual(terminalStored.data, terminalBody, "terminal record changed");
  const resultStored = await jsm.streams.getMessage(context.streams.A, { last_by_subj: `${context.roots.A}.result.${item.id}` });
  const completionStored = await jsm.streams.getMessage(context.streams.A, { last_by_subj: `${context.roots.A}.completion.${item.id}` });
  assert.equal(resultStored, null);
  assert.equal(completionStored, null);
  const after = (await jsm.streams.info(context.streams.A)).state.messages;
  assert.equal(after - before, 2, "scenario must add only request and terminal records");
  return {
    requestId: item.id,
    streamSequence: ack.seq,
    observedDeliveryCounts: observed,
    maxDeliverExhausted: true,
    advisoryObservedOnline: true,
    advisoryDurable: false,
    terminalRecord: terminal,
    terminalPubAckSequence: terminalAck.seq,
    resultRecordAbsent: true,
    completionRecordAbsent: true,
    customGap: "online advisory materializer can miss terminalization; durable advisory capture or exhausted-consumer reconciliation remains application work",
    messagePlaneFactsOnly: true,
  };
}

async function scenarioProjectIsolation(context) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const stable = bytes({ schema: 1, requestId: "same-id-both-projects", intent: "same-bytes" });
  const stableId = "same-id-both-projects";
  const [ackA, ackB] = await Promise.all([
    js.publish(`${context.roots.A}.request.s5`, stable, { msgID: stableId, timeout: JS_TIMEOUT_MS, retries: 0 }),
    js.publish(`${context.roots.B}.request.s5`, stable, { msgID: stableId, timeout: JS_TIMEOUT_MS, retries: 0 }),
  ]);
  assert.notEqual(ackA.stream, ackB.stream);
  assert.equal(ackA.duplicate, false);
  assert.equal(ackB.duplicate, false);
  const deliveryA = await pull(context, "A");
  assert.equal(deliveryA.info.streamSequence, ackA.seq);
  assert.equal(messageId(deliveryA), stableId);
  assertBytesEqual(deliveryA.data, stable, "project A bytes differ");
  await confirmedAck(deliveryA);
  const deliveryB = await pull(context, "B");
  assert.equal(deliveryB.info.streamSequence, ackB.seq);
  assert.equal(messageId(deliveryB), stableId);
  assertBytesEqual(deliveryB.data, stable, "project B bytes differ");
  await confirmedAck(deliveryB);
  return {
    stableMessageId: stableId,
    stableBodyHash: hashBytes(stable),
    projectA: { stream: ackA.stream, sequence: ackA.seq, duplicate: ackA.duplicate, confirmedAck: true },
    projectB: { stream: ackB.stream, sequence: ackB.seq, duplicate: ackB.duplicate, confirmedAck: true },
    boundary: "separate subjects/streams are trusted namespace isolation, not hostile tenancy",
  };
}

async function scenarioFanIn(context) {
  const js = jetstream(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const before = (await jsm.streams.info(context.streams.A)).state.messages;
  const canonicalKey = "project-a:ownership:canonical-1";
  const requestId = "fanin-owner-request-1";
  const receiptSubject = `${context.roots.A}.receipt.${requestId}`;
  const wakeSubject = `${context.roots.A}.wake.${requestId}`;
  const resultSubject = `${context.roots.A}.result.${requestId}`;
  const retainedResult = {
    schema: 1,
    correlationKey: canonicalKey,
    requestId,
    status: "resolved",
    value: { owner: "accountable-session" },
  };
  const resultBody = bytes(retainedResult);
  const inFlight = new Map();
  let adjudications = 0;
  let requestPublishes = 0;
  let recipientWakes = 0;
  let receiptRecords = 0;
  let resultRecords = 0;

  async function ownerWork(entry) {
    const item = request(context, "A", "s6", requestId, { canonicalKey });
    adjudications += 1;
    const requestAck = await js.publish(item.subject, item.body, { msgID: requestId, timeout: JS_TIMEOUT_MS, retries: 0 });
    requestPublishes += 1;
    item.sequence = requestAck.seq;
    item.id = requestId;
    const delivery = await pull(context, "A");
    assertDelivery(delivery, item, 1, false);
    const receiptAck = await js.publish(receiptSubject, bytes({ schema: 1, requestId, canonicalKey }), {
      msgID: `receipt-${requestId}`,
      timeout: JS_TIMEOUT_MS,
      retries: 0,
      expect: { lastSubjectSequence: 0 },
    });
    assert.equal(receiptAck.duplicate, false);
    receiptRecords += 1;
    await js.publish(wakeSubject, bytes({ requestId, receiptSequence: receiptAck.seq }), {
      msgID: `wake-${requestId}`,
      timeout: JS_TIMEOUT_MS,
      retries: 0,
      expect: { lastSubjectSequence: 0 },
    });
    recipientWakes += 1;
    const resultAck = await js.publish(resultSubject, resultBody, {
      msgID: `result-${requestId}`,
      timeout: JS_TIMEOUT_MS,
      retries: 0,
      expect: { lastSubjectSequence: 0 },
    });
    resultRecords += 1;
    await confirmedAck(delivery);
    const stored = await jsm.streams.getMessage(context.streams.A, { seq: resultAck.seq });
    assert.ok(stored);
    assertBytesEqual(stored.data, resultBody, "retained result bytes changed");
    entry.resolve(decoder.decode(stored.data));
  }

  function call() {
    let entry = inFlight.get(canonicalKey);
    if (!entry) {
      let resolve;
      let reject;
      const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      entry = { promise, resolve, reject, waiters: 0 };
      inFlight.set(canonicalKey, entry);
      void ownerWork(entry).catch(reject);
    }
    entry.waiters += 1;
    return entry.promise;
  }

  const callers = Array.from({ length: 4 }, () => call());
  assert.equal(inFlight.size, 1, "owner was not inserted synchronously before the first await");
  const results = await Promise.all(callers);
  const ownerEntry = inFlight.get(canonicalKey);
  assert.equal(ownerEntry.waiters, 4);
  assert.equal(new Set(results).size, 1);
  assert.equal(results[0], decoder.decode(resultBody));
  const resultHashes = results.map((result) => hashBytes(encoder.encode(result)));
  assert.equal(new Set(resultHashes).size, 1);
  inFlight.delete(canonicalKey);
  assert.equal(inFlight.size, 0);
  const after = (await jsm.streams.info(context.streams.A)).state.messages;
  assert.equal(after - before, 4, "fan-in must add one request, receipt, wake, and result");

  const retryNc = await openConnection(context, { reconnect: false, maxReconnectAttempts: 0 });
  const retryJsm = await jetstreamManager(retryNc, { timeout: JS_TIMEOUT_MS });
  const retried = await retryJsm.streams.getMessage(context.streams.A, { last_by_subj: resultSubject });
  assert.ok(retried);
  assertBytesEqual(retried.data, resultBody, "fresh-connection result retry changed bytes");
  await closeConnection(context, retryNc);

  return {
    callers: 4,
    canonicalKey,
    inFlightOwners: 1,
    adjudications,
    requestRecords: requestPublishes,
    receiptRecords,
    recipientWakes,
    retainedResultRecords: resultRecords,
    byteIdenticalResults: results.length,
    resultHash: resultHashes[0],
    freshConnectionRetainedResultRetry: true,
    applicationAuthored: [
      "exact-key in-process Map inserted before first await",
      "waiter count and fanout",
      "result schema, correlation, and retained-subject lookup",
      "terminal materialization and post-crash-style result retry",
    ],
    nativeBoundary: "Nats-Msg-Id supplies finite stream-scoped publish deduplication; it is not fan-in or permanent semantic idempotency",
  };
}

async function directoryStats(path) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory()) return { bytes: metadata.size, files: 1 };
  let bytesTotal = 0;
  let files = 0;
  for (const entry of await readdir(path)) {
    const child = await directoryStats(join(path, entry));
    bytesTotal += child.bytes;
    files += child.files;
  }
  return { bytes: bytesTotal, files };
}

async function physicalLines(paths) {
  let total = 0;
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    total += (text.match(/\n/g) ?? []).length;
  }
  return total;
}

async function assertMalformedCreation(context) {
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const badStream = `BAD.${context.suffix}`;
  let streamRejected = false;
  try {
    await jsm.streams.add({ ...streamConfig(context, "A"), name: badStream, subjects: [`bad.${context.suffix}.>`] });
  } catch {
    streamRejected = true;
  }
  assert.equal(streamRejected, true, "malformed stream creation unexpectedly succeeded");
  await assert.rejects(() => jsm.streams.info(badStream));
  const badConsumer = `BAD.${context.suffix}`;
  let consumerRejected = false;
  try {
    await jsm.consumers.add(context.streams.A, { ...consumerConfig(context, "A"), durable_name: badConsumer });
  } catch {
    consumerRejected = true;
  }
  assert.equal(consumerRejected, true, "malformed consumer creation unexpectedly succeeded");
  await assert.rejects(() => jsm.consumers.info(context.streams.A, badConsumer));
  return { malformedStreamRejectedWithoutResource: true, malformedConsumerRejectedWithoutResource: true };
}

function parsePercent(value) {
  assert.match(value, /^\d+(?:\.\d+)?%$/);
  return Number(value.slice(0, -1));
}

async function measureFootprint(context) {
  const malformedCreation = await assertMalformedCreation(context);
  await sleep(750);
  const stats = JSON.parse((await docker(["stats", "--no-stream", "--format", "{{json .}}", context.containerName])).stdout);
  const containerInspect = JSON.parse((await docker(["container", "inspect", context.containerName])).stdout)[0];
  const hostPid = containerInspect?.State?.Pid;
  assert.ok(Number.isInteger(hostPid) && hostPid > 0, "container host PID is unavailable");
  const status = await readFile(`/proc/${hostPid}/status`, "utf8");
  const rss = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  const threads = status.match(/^Threads:\s+(\d+)$/m);
  assert.ok(rss && threads, "NATS /proc process footprint is unavailable");
  const topLines = (await docker(["top", context.containerName, "-eo", "pid,comm"])).stdout
    .split("\n").filter((line) => line.trim() !== "");
  const processCount = topLines.length - 1;
  assert.equal(processCount, 1, "smallest NATS topology must have one server process");
  const dockerReportedPids = Number(stats.PIDs);
  assert.ok(Number.isInteger(dockerReportedPids) && dockerReportedPids >= 1);
  const measuredBinaryPath = join(context.tempDirectory, "nats-server-measured");
  await docker(["cp", `${context.containerName}:/nats-server`, measuredBinaryPath]);
  const serverBinaryBytes = (await stat(measuredBinaryPath)).size;
  assert.ok(Number.isSafeInteger(serverBinaryBytes) && serverBinaryBytes > 0);
  await rm(measuredBinaryPath, { force: false });
  const installed = await directoryStats(join(HERE, "node_modules"));
  const varz = await httpJson(`http://127.0.0.1:${context.monitorPort}/varz`);
  const jsz = await httpJson(`http://127.0.0.1:${context.monitorPort}/jsz?config=true&streams=true&consumers=true`);
  const healthz = await httpJson(`http://127.0.0.1:${context.monitorPort}/healthz?js-enabled-only=true`);
  assert.equal(varz.version, "2.14.3");
  assert.equal(varz.port, 4222);
  assert.equal(varz.max_payload, MAX_PAYLOAD);
  assert.equal(healthz.status, "ok");
  assert.equal(jsz.config.store_dir, "/data/jetstream/jetstream");
  assert.equal(jsz.streams, 2);
  assert.equal(jsz.consumers, 2);
  const jsm = await jetstreamManager(context.mainNc, { timeout: JS_TIMEOUT_MS });
  const effectiveStreams = {};
  const effectiveConsumers = {};
  for (const project of ["A", "B"]) {
    effectiveStreams[project] = (await jsm.streams.info(context.streams[project])).config;
    effectiveConsumers[project] = (await jsm.consumers.info(context.streams[project], context.consumers[project])).config;
  }
  const natsExecutableFiles = [join(HERE, "probe.mjs"), join(HERE, "child-worker.mjs")];
  const bullExecutableFiles = [
    join(HERE, "..", "t172-message-plane-probe", "probe.mjs"),
    join(HERE, "..", "t172-message-plane-probe", "child-worker.mjs"),
  ];
  const probeSource = await readFile(join(HERE, "probe.mjs"), "utf8");
  const natsPackage = JSON.parse(await readFile(join(HERE, "package.json"), "utf8"));
  const bullPackage = JSON.parse(await readFile(join(HERE, "..", "t172-message-plane-probe", "package.json"), "utf8"));
  return {
    image: context.image,
    installedDependencies: { completeNodeModulesBytes: installed.bytes, completeNodeModulesFiles: installed.files },
    natsServer: {
      executableBytes: serverBinaryBytes,
      rssKiB: Number(rss[1]),
      cpuPercent: parsePercent(stats.CPUPerc),
      dockerMemoryUsage: stats.MemUsage,
      dockerReportedPidsAndThreads: dockerReportedPids,
      procThreads: Number(threads[1]),
      containerProcessCount: processCount,
    },
    processCount: {
      steadyStateProbeNodeProcesses: 1,
      steadyStateNatsProcesses: processCount,
      steadyStateProcesses: 1 + processCount,
      daemonProcesses: 1,
      peakScenarioChildWorkers: context.childPeak,
    },
    configuration: {
      monitoring: {
        varz: { version: varz.version, host: varz.host, port: varz.port, maxPayload: varz.max_payload, jetStreamEnabled: varz.jetstream },
        jsz: { storeDirectory: jsz.config.store_dir, memoryLimit: jsz.config.max_memory, fileLimit: jsz.config.max_storage, streams: jsz.streams, consumers: jsz.consumers },
        healthz,
      },
      maxPayload: varz.max_payload,
      hostBindings: context.bindings,
      jetStreamStoreDirectory: jsz.config.store_dir,
      jetStreamMemoryLimit: jsz.config.max_memory,
      jetStreamFileLimit: jsz.config.max_storage,
      jetStreamStreams: jsz.streams,
      jetStreamConsumers: jsz.consumers,
      healthz,
      effectiveStreams,
      effectiveConsumers,
    },
    malformedCreation,
    comparisonWithBullMqProbe: {
      gaugeDefinition: "wc-like newline count across probe.mjs and child-worker.mjs; direct dependency keys; steady process/daemon facts",
      nats: {
        executablePhysicalLines: await physicalLines(natsExecutableFiles),
        directNodeDependencies: Object.keys(natsPackage.dependencies).length,
        steadyProcessesMeasuredThisRun: 1 + processCount,
        daemonsMeasuredThisRun: 1,
      },
      bullMq: {
        executablePhysicalLines: await physicalLines(bullExecutableFiles),
        directNodeDependencies: Object.keys(bullPackage.dependencies).length,
        steadyProcessesMeasuredByCurrentBullMqProbe: 2,
        daemonsMeasuredByCurrentBullMqProbe: 1,
      },
      interpretation: "measured footprint facts only; not a transport recommendation",
    },
    decisionGauge: {
      definition: "line-leading // PROBE_DECISION: comments in probe.mjs",
      lexicalMarkerCount: (probeSource.match(/^\/\/ PROBE_DECISION:/gm) ?? []).length,
    },
    productionDelta: { physicalLoc: 0, decisions: 0 },
    measurementBoundary: "local one-run Docker and filesystem measurements; non-generalizable across hosts/runtimes",
  };
}

async function exactDockerObjectExists(kind, name) {
  const result = await docker([kind, "inspect", name], { allowFailure: true });
  if (result.ok) return true;
  assert.equal(result.code, 1, `unexpected docker ${kind} inspect failure for ${name}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /no such/i, `docker did not report exact ${kind} ${name} absent`);
  return false;
}

async function removeExactDockerObject(kind, name, args) {
  if (!await exactDockerObjectExists(kind, name)) return;
  const removed = await docker(args);
  assert.equal(removed.stdout, name);
  assert.equal(await exactDockerObjectExists(kind, name), false);
}

async function endpointClosed(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`endpoint 127.0.0.1:${port} did not close promptly`));
    }, 750);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(`endpoint 127.0.0.1:${port} still accepts connections`));
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function cleanup(context) {
  const errors = [];
  for (const child of context.children) {
    try {
      if (child.child.exitCode === null && child.child.signalCode === null) await child.kill();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const nc of [...context.connections]) {
    try {
      await closeConnection(context, nc);
    } catch (error) {
      await nc.close().catch(() => undefined);
      context.connections.delete(nc);
      errors.push(error);
    }
  }
  if (context.containerCreationAttempted) {
    try {
      await removeExactDockerObject("container", context.containerName, ["rm", "--force", context.containerName]);
    } catch (error) {
      errors.push(error);
    }
  }
  if (context.volumeCreationAttempted) {
    try {
      await removeExactDockerObject("volume", context.volumeName, ["volume", "rm", context.volumeName]);
    } catch (error) {
      errors.push(error);
    }
  }
  if (context.tempDirectory) {
    try {
      await rm(context.tempDirectory, { recursive: true, force: false });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "exact cleanup failed");
}

async function verifyCleanup(context) {
  assert.equal(await exactDockerObjectExists("container", context.containerName), false);
  assert.equal(await exactDockerObjectExists("volume", context.volumeName), false);
  for (const child of context.children) {
    assert.ok(child.child.exitCode !== null || child.child.signalCode !== null, `child ${child.child.pid} remains live`);
  }
  for (const port of [context.clientPort, context.monitorPort]) if (port) await endpointClosed(port);
  const tempExists = await lstat(context.tempDirectory).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  assert.equal(tempExists, false);
  return {
    exactContainerAbsent: true,
    exactVolumeAbsent: true,
    childProcessesAbsent: true,
    clientAndMonitoringSocketsAbsent: true,
    exactTemporaryDirectoryAbsent: true,
  };
}

const suffix = `${process.pid}${randomBytes(6).toString("hex")}`.toLowerCase();
const runId = `${Date.now().toString(36)}-${suffix}`;
const context = {
  suffix,
  runId,
  containerName: `qq-t172-nats-${suffix}`,
  volumeName: `qq-t172-nats-${suffix}`,
  containerCreationAttempted: false,
  volumeCreationAttempted: false,
  clientPort: null,
  monitorPort: null,
  bindings: null,
  tempDirectory: null,
  configPath: null,
  image: null,
  mainNc: null,
  connections: new Set(),
  children: new Set(),
  childPeak: 0,
  streams: { A: `T172_${suffix.toUpperCase()}_A`, B: `T172_${suffix.toUpperCase()}_B` },
  consumers: { A: `C_${suffix.toUpperCase()}_A`, B: `C_${suffix.toUpperCase()}_B` },
  roots: { A: `qqt172.${suffix}.A`, B: `qqt172.${suffix}.B` },
};

let receivedSignal = null;
process.once("SIGINT", () => { receivedSignal = "SIGINT"; });
process.once("SIGTERM", () => { receivedSignal = "SIGTERM"; });

function assertNoSignal() {
  assert.equal(receivedSignal, null, `received ${receivedSignal}; exact cleanup follows current bounded operation`);
}

const scenarios = [
  ["durable-acceptance-and-server-restart", scenarioDurableRestart],
  ["consumer-death-and-redelivery", scenarioConsumerDeath],
  ["recipient-idempotency", scenarioRecipientIdempotency],
  ["disconnected-recipient-truthfulness", scenarioDisconnectedRecipient],
  ["project-namespace-isolation", scenarioProjectIsolation],
  ["four-to-one-exact-key-fan-in-and-results", scenarioFanIn],
];
let scenariosPassed = 0;
let failure = null;
let footprint = null;
let cleanupEvidence = null;

try {
  context.tempDirectory = await mkdtemp(join(tmpdir(), `qq-t172-nats-${suffix}-`));
  context.configPath = join(context.tempDirectory, "nats.conf");
  await writeFile(context.configPath, [
    "port: 4222",
    "http_port: 8222",
    `max_payload: ${MAX_PAYLOAD}`,
    "jetstream {",
    '  store_dir: "/data/jetstream"',
    "  max_memory_store: 67108864",
    "  max_file_store: 67108864",
    "}",
    "",
  ].join("\n"), { mode: 0o600 });
  context.volumeCreationAttempted = true;
  const volume = await docker(["volume", "create", context.volumeName]);
  assert.equal(volume.stdout, context.volumeName);
  context.image = await startServer(context);
  context.mainNc = await openConnection(context);
  await createTopology(context);
  assertNoSignal();

  for (const [name, scenario] of scenarios) {
    try {
      const evidence = await scenario(context);
      assertNoSignal();
      scenariosPassed += 1;
      output({ scenario: name, status: "pass", ...evidence });
    } catch (error) {
      failure = error;
      output({ scenario: name, status: "fail", error: errorText(error) });
      break;
    }
  }
  if (!failure && scenariosPassed === scenarios.length) {
    footprint = await measureFootprint(context);
    assertNoSignal();
  }
} catch (error) {
  failure = failure ?? error;
  if (scenariosPassed === 0) output({ scenario: scenarios[0][0], status: "fail", error: errorText(error) });
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
  scenario: "footprint-and-cleanup",
  status: !failure && footprint && cleanupPassed ? "pass" : "fail",
  ...(footprint ?? {}),
  cleanup: cleanupEvidence,
  ...(!cleanupPassed ? { error: errorText(failure) } : {}),
});
output({
  summary: "t172-nats-jetstream-message-plane-probe",
  status: !failure && scenariosPassed === scenarios.length && cleanupPassed ? "pass" : "fail",
  runId,
  scenariosPassed: scenariosPassed + (footprint && cleanupPassed ? 1 : 0),
  scenariosExpected: 7,
  image: context.image,
  cleanupVerified: cleanupPassed,
  native: [
    "file-backed stream and PubAck",
    "durable explicit-ACK pull consumer",
    "timeout redelivery and MaxDeliver advisory",
    "finite stream-scoped Nats-Msg-Id duplicate window",
    "retained arbitrary bytes",
  ],
  custom: [
    "stable envelope IDs and hashes",
    "receipt/wake ordering",
    "terminal advisory materialization",
    "result schema, correlation, and lookup",
    "exact-key in-flight Map and waiter fanout",
    "fresh-connection retained-result retry",
  ],
  ...((failure || receivedSignal) ? { error: errorText(failure ?? `received ${receivedSignal}`) } : {}),
});

if (receivedSignal) process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
else if (failure || scenariosPassed !== scenarios.length || !cleanupPassed) process.exitCode = 1;
