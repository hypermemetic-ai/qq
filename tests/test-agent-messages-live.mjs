import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const [root, socket, stateRoot] = process.argv.slice(2);
const extension = await import(pathToFileURL(`${root}/extensions/agent-messages.ts`));
const { EventPlaneClient } = await import(pathToFileURL(`${root}/bin/lib/event-plane-client.ts`));

function harness(role, sessionId, pane, options = {}) {
  const handlers = new Map();
  const injectedMessages = new Set();
  const received = [];
  let aborted = 0;
  const eventHandlers = new Map();
  const pi = {
    registerTool(tool) { this.tool = tool; },
    registerCommand(name, command) { this.command = { name, ...command }; },
    on(name, handler) { handlers.set(name, handler); },
    async sendMessage(message, options) { received.push({ message, options }); },
    events: { on(name, handler) { eventHandlers.set(name, handler); } },
  };
  const ctx = {
    cwd: `${root}`,
    isIdle: () => false,
    abort: () => { aborted += 1; },
    sessionManager: { getSessionId: () => sessionId, getSessionFile: () => undefined },
    ui: { notify() {} },
  };
  extension.default(pi, {
    env: { ...process.env, XDG_STATE_HOME: stateRoot, QQ_AGENT_PROJECT: "qq", QQ_AGENT_ROLE: role, HERDR_PANE_ID: pane },
    client: new EventPlaneClient(socket), assumePersisted: options.assumePersisted ?? true, injectedMessages,
  });
  return { pi, ctx, handlers, eventHandlers, received, injectedMessages, get aborted() { return aborted; } };
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
const runnerSession = "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9";
const sender = harness("runner", senderSession, "w1:p1");
const runner = harness("runner", runnerSession, "w1:p2", { assumePersisted: false });
await sender.handlers.get("session_start")({ reason: "startup" }, sender.ctx);
await runner.handlers.get("session_start")({ reason: "startup" }, runner.ctx);
await runner.pi.command.handler("T-12, T-18", runner.ctx);

const listing = await sender.pi.tool.execute("list", { action: "list" });
assert.equal(listing.details.agents.length, 1);
const runnerId = listing.details.agents.find((agent) => agent.role === "runner").session_id;
assert.equal(runnerId, runnerSession);
assert.match(listing.content[0].text, /^live sessions:/);
assert.match(listing.content[0].text, /- 019ff7ad-2cba-75a9-adc2-c15a0a92d6a9 — qq \/ runner/);
assert.match(listing.content[0].text, /tasks: T-12, T-18/);
assert.match(listing.content[0].text, /pane: w1:p2/);

sender.eventHandlers.get("qq:role-selected")({ role: "architect", profile: "grok-high" });
const sent = await sender.pi.tool.execute("send", { action: "send", to: runnerId, message: "review this now", delivery: "immediate" });
assert.match(sent.details.message_id, /^evt_/);
assert.equal(sent.content[0].text, `message sent: ${sent.details.message_id}`);
await waitFor("runner delivery", () => runner.received.length === 1);
assert.equal(runner.injectedMessages.size, 1, "uncertain persistence must retain one dedup marker");
await sleep(1_500);
assert.equal(runner.received.length, 1, "an unacknowledged retry must not inject the same message twice in one process");
await waitFor("dedup marker cleanup", () => runner.injectedMessages.size === 0);
assert.equal(runner.aborted, 1);
assert.equal(runner.received[0].options.deliverAs, "steer");
assert.equal(runner.received[0].message.content, `[message ${sent.details.message_id} from ${senderSession} — qq / architect]\nreview this now`);
let delivered;
await waitFor("delivered status", async () => {
  delivered = await sender.pi.tool.execute("status", { action: "status", message_id: sent.details.message_id });
  return delivered.details.status === "delivered";
});
assert.equal(delivered.content[0].text, `Message ${sent.details.message_id} is delivered.`);

await sender.handlers.get("session_shutdown")({ reason: "quit" }, sender.ctx);
await runner.handlers.get("session_shutdown")({ reason: "quit" }, runner.ctx);
console.log("test-agent-messages-live: pass");
