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
  const pi = {
    registerTool(tool) { this.tool = tool; },
    registerCommand(name, command) { this.command = { name, ...command }; },
    on(name, handler) { handlers.set(name, handler); },
    async sendMessage(message, options) { received.push({ message, options }); },
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
  return { pi, ctx, handlers, received, injectedMessages, get aborted() { return aborted; } };
}

async function waitFor(label, predicate) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const architect = harness("architect", "session-architect", "w1:p1");
const runner = harness("runner", "session-runner", "w1:p2", { assumePersisted: false });
await architect.handlers.get("session_start")({ reason: "startup" }, architect.ctx);
await runner.handlers.get("session_start")({ reason: "startup" }, runner.ctx);

const listing = await architect.pi.tool.execute("list", { action: "list" });
assert.equal(listing.details.agents.length, 2);
const runnerId = listing.details.agents.find((agent) => agent.role === "runner").agent_id;
assert.match(listing.content[0].text, /pane w1:p2/);

const sent = await architect.pi.tool.execute("send", { action: "send", to: runnerId, message: "review this now", delivery: "immediate" });
assert.match(sent.details.message_id, /^evt_/);
await waitFor("runner delivery", () => runner.received.length === 1);
assert.equal(runner.injectedMessages.size, 1, "uncertain persistence must retain one dedup marker");
await sleep(1_500);
assert.equal(runner.received.length, 1, "an unacknowledged retry must not inject the same message twice in one process");
await waitFor("dedup marker cleanup", () => runner.injectedMessages.size === 0);
assert.equal(runner.aborted, 1);
assert.equal(runner.received[0].options.deliverAs, "steer");
assert.match(runner.received[0].message.content, /review this now/);
await waitFor("delivered status", async () => {
  const status = await architect.pi.tool.execute("status", { action: "status", message_id: sent.details.message_id });
  return status.details.status === "delivered";
});

await architect.handlers.get("session_shutdown")({ reason: "quit" }, architect.ctx);
await runner.handlers.get("session_shutdown")({ reason: "quit" }, runner.ctx);
console.log("test-agent-messages-live: pass");
