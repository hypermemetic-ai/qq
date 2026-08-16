import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const [root, socket, stateRoot] = process.argv.slice(2);
const extension = await import(pathToFileURL(`${root}/extensions/agent-messages.ts`));
const { RelayClient } = await import(pathToFileURL(`${root}/bin/lib/qq-relay-client.mjs`));

function harness(role, sessionId, pane, options = {}) {
  const handlers = new Map();
  const injectedMessages = new Set();
  const received = [];
  const sequence = [];
  let aborted = 0;
  let idle = options.idle ?? false;
  const eventHandlers = new Map();
  const durableEntries = options.durableEntries ?? [];
  const client = new RelayClient(socket);
  const acknowledge = client.acknowledge.bind(client);
  let acknowledgementCount = 0;
  client.acknowledge = async (request) => {
    acknowledgementCount += 1;
    return acknowledge(request);
  };
  const pi = {
    registerTool(tool) { this.tool = tool; },
    registerCommand(name, command) { this.command = { name, ...command }; },
    on(name, handler) { handlers.set(name, handler); },
    async sendMessage(message, options) {
      sequence.push({ operation: "sendMessage", idle });
      received.push({ message, options });
    },
    events: { on(name, handler) { eventHandlers.set(name, handler); } },
  };
  const ctx = {
    cwd: `${root}`,
    isIdle: () => idle,
    abort: () => {
      sequence.push({ operation: "abort" });
      aborted += 1;
    },
    sessionManager: {
      getSessionId: () => sessionId,
      getEntries: () => durableEntries,
      getSessionFile() { throw new Error("agent-message receipts must not read session files"); },
    },
    ui: { notify() {} },
  };
  extension.default(pi, {
    env: { ...process.env, XDG_STATE_HOME: stateRoot, QQ_AGENT_PROJECT: "qq", QQ_AGENT_ROLE: role, HERDR_PANE_ID: pane },
    client, injectedMessages, now: options.now,
  });
  return {
    pi, ctx, handlers, eventHandlers, received, sequence, injectedMessages,
    setIdle(value) { idle = value; },
    get aborted() { return aborted; },
    get acknowledgementCount() { return acknowledgementCount; },
  };
}

async function waitFor(label, predicate) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const senderSession = "019ff7b9-2fcd-78cd-bc16-c770a9ccff11";
const runnerSession = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
let clock = Date.now();
const sender = harness(undefined, senderSession, "w1:p1", { now: () => clock });
const durableEntries = [];
const runner = harness("runner", runnerSession, "w1:p2", { durableEntries, now: () => clock });
sender.eventHandlers.get("qq:role-selected")({ role: "architect", profile: "grok-high" });
await sender.handlers.get("session_start")({ reason: "startup" }, sender.ctx);
await runner.handlers.get("session_start")({ reason: "startup" }, runner.ctx);
await runner.pi.command.handler("T-12, T-18", runner.ctx);

const senderPresence = await runner.pi.tool.execute("list", { action: "list" });
assert.equal(senderPresence.details.agents.find((agent) => agent.session_id === senderSession).role, "architect", "a restored role emitted before agent-messages session_start was lost");
const listing = await sender.pi.tool.execute("list", { action: "list" });
assert.equal(listing.details.agents.length, 1);
const runnerId = listing.details.agents.find((agent) => agent.role === "runner").session_id;
assert.equal(runnerId, runnerSession);
assert.match(listing.content[0].text, /^live sessions:/);
assert.match(listing.content[0].text, /- session-4b70f906-ce0a-4135-bc9e-b231db9b98b1 — qq \/ runner/);
assert.match(listing.content[0].text, /tasks: T-12, T-18/);
assert.match(listing.content[0].text, /pane: w1:p2/);
assert.doesNotMatch(listing.content[0].text, /thinking|tool bash/);

await runner.handlers.get("agent_start")({ type: "agent_start" }, runner.ctx);
await runner.handlers.get("tool_execution_start")({ toolCallId: "call_1", toolName: "bash" }, runner.ctx);
const earlyList = await sender.pi.tool.execute("list", { action: "list" });
assert.doesNotMatch(earlyList.content[0].text, /tool bash/);
clock += 6_000;
const lateList = await sender.pi.tool.execute("list", { action: "list" });
assert.match(lateList.content[0].text, /tool bash 6s/);

sender.eventHandlers.get("qq:role-selected")({ role: "architect", profile: "grok-high" });
const defaultSent = await sender.pi.tool.execute("send", { action: "send", to: runnerId, message: "steer after this batch" });
const quotedReceipt = {
  type: "message",
  message: { role: "user", content: [{
    type: "text",
    text: `quoting is not a receipt: [message ${defaultSent.details.message_id} from ${senderSession} — qq / architect]\nsteer after this batch`,
  }] },
};
durableEntries.push(quotedReceipt);
await waitFor("default runner delivery", () => runner.received.length === 1);
assert.equal(runner.acknowledgementCount, 0, "message text containing the receipt marker spoofed durable delivery");
assert.equal(runner.received[0].options.deliverAs, "steer");
assert.equal(runner.aborted, 0);
const defaultPending = await sender.pi.tool.execute("status", { action: "status", message_id: defaultSent.details.message_id });
assert.notEqual(defaultPending.details.status, "delivered");
assert.match(defaultPending.content[0].text, /tool bash 6s/);
durableEntries.splice(durableEntries.indexOf(quotedReceipt), 1);
durableEntries.push({
  type: "message",
  message: { role: "user", content: [{ type: "text", text: runner.received[0].message.content }] },
});
await waitFor("default delivered from the DSH projection", async () => {
  const status = await sender.pi.tool.execute("status", { action: "status", message_id: defaultSent.details.message_id });
  return status.details.status === "delivered";
});

const immediateSequenceStart = runner.sequence.length;
const sent = await sender.pi.tool.execute("send", { action: "send", to: runnerId, message: "review this now", delivery: "immediate" });
assert.match(sent.details.message_id, /^evt_/);
assert.equal(sent.content[0].text, `message sent: ${sent.details.message_id}`);
await waitFor("immediate runner abort", () => runner.aborted === 1);
assert.equal(runner.received.length, 1, "sendMessage must wait for the aborted turn to become idle");
runner.setIdle(true);
await waitFor("immediate runner delivery", () => runner.received.length === 2);
assert.deepEqual(runner.sequence.slice(immediateSequenceStart), [
  { operation: "abort" },
  { operation: "sendMessage", idle: true },
]);
assert.equal(runner.injectedMessages.size, 1, "uncertain persistence must retain one dedup marker");
await sleep(1_500);
assert.equal(runner.received.length, 2, "an unacknowledged retry must not inject the same message twice in one process");
assert.equal(runner.injectedMessages.size, 1, "a memory marker must not acknowledge delivery");
const pending = await sender.pi.tool.execute("status", { action: "status", message_id: sent.details.message_id });
assert.notEqual(pending.details.status, "delivered", "status must not report delivered before a durable entry exists");
const injected = runner.received[1].message;
const acknowledgementsBeforePersistence = runner.acknowledgementCount;
durableEntries.push({
  type: "custom_message", customType: injected.customType, display: injected.display,
  content: injected.content, details: { ...injected.details },
});
await waitFor("dedup marker cleanup", () => runner.injectedMessages.size === 0);
assert.equal(runner.received.length, 2, "delayed persistence must acknowledge on redelivery without reinjection");
assert.equal(runner.acknowledgementCount, acknowledgementsBeforePersistence + 1, "one durable receipt must produce exactly one acknowledgement");
assert.equal(runner.aborted, 1);
assert.deepEqual(runner.received[1].options, { triggerTurn: true });
let delivered;
await waitFor("delivered status", async () => {
  delivered = await sender.pi.tool.execute("status", { action: "status", message_id: sent.details.message_id });
  return delivered.details.status === "delivered";
});
assert.equal(delivered.content[0].text, `Message ${sent.details.message_id} is delivered.`);

const restartSent = await sender.pi.tool.execute("send", { action: "send", to: runnerId, message: "survive receiver restart" });
await waitFor("pre-restart injection", () => runner.received.length === 3);
const restartInjection = runner.received[2].message;
await runner.handlers.get("session_shutdown")({ reason: "restart" }, runner.ctx);
durableEntries.push({
  type: "message",
  message: { role: "user", content: [{ type: "text", text: restartInjection.content }] },
});
const freshRunner = harness("runner", runnerSession, "w1:p3", { durableEntries, now: () => clock });
assert.equal(freshRunner.injectedMessages.size, 0, "fresh receiver unexpectedly inherited process-local receipt state");
await freshRunner.handlers.get("session_start")({ reason: "startup" }, freshRunner.ctx);
await waitFor("fresh receiver durable acknowledgement", async () => {
  const status = await sender.pi.tool.execute("status", { action: "status", message_id: restartSent.details.message_id });
  return status.details.status === "delivered";
});
assert.equal(freshRunner.received.length, 0, "fresh receiver reinjected a message already present in durable history");
assert.equal(freshRunner.acknowledgementCount, 1, "fresh receiver did not acknowledge the durable receipt exactly once");

await sender.handlers.get("session_shutdown")({ reason: "quit" }, sender.ctx);
await freshRunner.handlers.get("session_shutdown")({ reason: "quit" }, freshRunner.ctx);
console.log("test-agent-messages-live: pass");
