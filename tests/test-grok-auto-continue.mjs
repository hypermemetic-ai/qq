import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const models = await import(pathToFileURL(join(root, "qq-models/src/grok-auto-continue.mjs")));
const grok = await import(pathToFileURL(join(root, "qq-models/src/grok.mjs")));
const plugin = await import(pathToFileURL(join(root, "qq-models/src/plugin.mjs")));
const shim = await import(pathToFileURL(join(root, "extensions/grok-auto-continue.ts")));

const {
  BACKOFF_MS,
  RECOVERY,
  RETRY_LIMIT,
  WINDOW_MS,
  attachAgents,
  attachGrokAutoContinue,
  backoffMs,
  createGrokAutoContinue,
  errorStatus,
  isGrok46,
  isRetryableGrokError,
  recoveryRange,
} = models;

function assistant(errorMessage, stopReason = "error") {
  return {
    role: "assistant",
    content: errorMessage ? [] : [{ type: "text", text: "ok" }],
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function turnEnd(reason) {
  return { type: "turn/end", data: { turn: 1, reason } };
}

function controllerHarness(options = {}) {
  const notices = [];
  const sent = [];
  const replaced = [];
  const delays = [];
  let clock = options.clock ?? 1_000;
  const waits = [];
  const ctrl = createGrokAutoContinue({
    jitter: 0,
    now: () => clock,
    random: () => 0,
    delay: (ms, signal) => {
      delays.push(ms);
      let settle;
      const done = new Promise((resolve, reject) => {
        settle = () => {
          if (signal?.aborted) reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          else resolve();
        };
      });
      waits.push({ ms, settle });
      return done;
    },
    followup: (message) => sent.push(message),
    replace: (range, message) => replaced.push({ range, message }),
    rangeFor: () => options.range ?? { start: 4, end: 4, seqs: [4] },
    notify: (text) => notices.push(text),
    isGrok: options.isGrok ?? (() => true),
    limit: options.limit,
  });
  return {
    notices,
    sent,
    replaced,
    delays,
    ctrl,
    get clock() { return clock; },
    set clock(value) { clock = value; },
    async fail(reason = { kind: "error", error: { code: "PROVIDER", message: "Responses failed" } }) {
      void ctrl.onTurnEnd(turnEnd(reason), options.ctx);
      await Promise.resolve();
    },
    async failAssistant(errorMessage, stopReason = "error") {
      void ctrl.onTurnEnd({ type: "message_end", message: assistant(errorMessage, stopReason) }, options.ctx);
      await Promise.resolve();
    },
    flush() {
      const wait = waits.shift();
      wait?.settle();
      return Promise.resolve();
    },
  };
}

assert.equal(RECOVERY, "Continue.");
assert.equal(RETRY_LIMIT, 5);
assert.equal(WINDOW_MS, 90_000);
assert.deepEqual([...BACKOFF_MS], [2_000, 4_000, 8_000, 16_000, 32_000]);
assert.equal(backoffMs(0, { jitter: 0 }), 2_000);
assert.equal(backoffMs(4, { jitter: 0 }), 32_000);
assert.equal(backoffMs(9, { jitter: 0 }), 32_000);
assert.equal(isGrok46({ model: { id: "grok-4.6" } }), true);
assert.equal(isGrok46({ options: { model: "grok-4.6" } }), true);
assert.equal(isGrok46({ model: { id: "gpt-5.6-sol" } }), false);
assert.equal(errorStatus(assistant("xAI API error: Responses failed")), undefined);
assert.equal(errorStatus(assistant("xAI API error: Responses failed with status 503")), 503);
assert.equal(isRetryableGrokError(assistant("xAI API error: Responses failed")), true);
assert.equal(isRetryableGrokError(assistant("xAI API error: Responses failed with status 503")), true);
assert.equal(isRetryableGrokError(assistant("Responses failed (503): overloaded")), true);
assert.equal(isRetryableGrokError(assistant("xAI API error: Responses failed with status 400")), false);
assert.equal(isRetryableGrokError(assistant("invalid API key")), false);
assert.equal(isRetryableGrokError(assistant(undefined, "stop")), false);
assert.equal(isRetryableGrokError({ kind: "error", error: { code: "PROVIDER", message: "Responses failed" } }), true);
assert.equal(isRetryableGrokError({ kind: "error", error: { code: "PROVIDER", message: "Responses failed", status: 503 } }), true);
assert.equal(isRetryableGrokError({ kind: "error", error: { code: "INVALID_REQUEST", message: "Responses failed with status 400" } }), false);
assert.equal(isRetryableGrokError({ kind: "aborted", reason: { kind: "user" } }), false);

{
  const error = new grok.GrokLlmError("Responses failed (503): overloaded", "PROVIDER", { status: 503 });
  assert.equal(error.code, "PROVIDER");
  assert.equal(error.status, 503);
  assert.deepEqual(error.failure, { message: "Responses failed (503): overloaded", code: "PROVIDER", status: 503 });
  assert.equal(Object.getOwnPropertyDescriptor(error, "failure")?.enumerable, true);
}

{
  const h = controllerHarness();
  await h.fail();
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.delays, [2_000]);
  await h.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].content[0].text, RECOVERY);
  assert.deepEqual(h.sent[0].source, { kind: "user" });
  assert.match(h.notices.at(-1), /continuing \(1\/5\)/);
}

{
  const h = controllerHarness();
  await h.fail();
  await h.flush();
  h.ctrl.onUserMessage({ seq: 4, data: h.sent[0] });
  h.ctrl.onTurnStart();
  await h.fail();
  assert.deepEqual(h.delays, [2_000, 4_000]);
  await h.flush();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].source.kind, "plugin");
  assert.equal(h.sent[1].source.plugin, "qq-models");
  assert.equal(h.ctrl.pendingReplace, true);
  h.ctrl.applyReplace();
  assert.equal(h.replaced.length, 1);
  assert.deepEqual(h.replaced[0].range, { start: 4, end: 4, seqs: [4] });
  assert.equal(h.replaced[0].message.content[0].text, RECOVERY);
}

{
  const h = controllerHarness();
  await h.fail();
  await h.fail();
  assert.equal(h.delays.length, 1, "pending retry is not doubled before the wait finishes");
  await h.flush();
  assert.equal(h.sent.length, 1);
}

{
  const h = controllerHarness();
  for (let i = 0; i < RETRY_LIMIT; i += 1) {
    await h.fail();
    await h.flush();
    h.ctrl.onUserMessage({ seq: 10 + i, data: h.sent.at(-1) });
    h.ctrl.onTurnStart();
  }
  await h.fail();
  assert.equal(h.sent.length, RETRY_LIMIT);
  assert.match(h.notices.at(-1), /stopped/);
}

{
  const h = controllerHarness();
  await h.fail();
  await h.flush();
  h.clock = 1_000 + WINDOW_MS + 1;
  h.ctrl.onTurnStart();
  await h.fail();
  assert.deepEqual(h.delays, [2_000, 2_000], "a later incident after the window is a new streak");
}

{
  const h = controllerHarness({ isGrok: () => false });
  await h.fail();
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.delays, []);
}

{
  const h = controllerHarness();
  await h.fail({ kind: "error", error: { code: "INVALID_CREDENTIAL", message: "Responses failed" } });
  await h.fail({ kind: "aborted", reason: { kind: "user" } });
  await h.failAssistant("xAI API error: Responses failed with status 400");
  await h.failAssistant("xAI API error: Responses failed", "aborted");
  assert.deepEqual(h.sent, []);
}

{
  const h = controllerHarness({ ctx: { signal: { aborted: true }, model: { id: "grok-4.6" } } });
  await h.fail();
  assert.deepEqual(h.sent, []);
}

{
  const h = controllerHarness();
  await h.fail();
  h.ctrl.onUserMessage({ seq: 9, data: { id: "operator", source: { kind: "user" }, content: [{ type: "text", text: "stop" }] } });
  await h.flush();
  assert.equal(h.sent.length, 0, "operator typing during backoff cancels the wait");
}

{
  const range = recoveryRange({
    events: [
      { seq: 1, type: "user/message", surfaceOp: "append" },
      { seq: 2, type: "turn/end" },
      { seq: 3, type: "user/message", surfaceOp: "append" },
      { seq: 4, type: "assistant/message", surfaceOp: "append" },
    ],
  }, 3);
  assert.deepEqual(range, { start: 3, end: 4, seqs: [3, 4] });
}

{
  const followups = [];
  const events = [];
  const listeners = new Map();
  const agent = {
    options: { model: "grok-4.6" },
    followup(message) { followups.push(message); },
    session: {
      events,
      append(type, data, opts) { events.push({ seq: events.length + 1, type, data, ...opts }); },
    },
    ctx: {
      on(name, fn) {
        listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        return () => {};
      },
    },
  };
  attachGrokAutoContinue(agent, {
    jitter: 0,
    delay: async () => {},
    now: () => 1,
  });
  for (const fn of listeners.get("session/event") ?? []) {
    await fn(agent.session, turnEnd({ kind: "error", error: { code: "PROVIDER", message: "Responses failed" } }));
  }
  assert.equal(followups.length, 1);
  assert.equal(followups[0].content[0].text, RECOVERY);
}

{
  const created = [];
  const ctx = {
    on(name, fn) { created.push(name); if (name === "agent/created") fn({ agent: { options: { model: "gpt-5.6-sol" } } }); },
    get() { return { list() { return []; } }; },
  };
  attachAgents(ctx);
  assert.ok(created.includes("agent/created"));
}

{
  const events = new Map();
  const notices = [];
  const sent = [];
  const ctx = {
    model: { id: "grok-4.6" },
    ui: { notify(message) { notices.push(message); } },
  };
  const pi = {
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    sendUserMessage(content) { sent.push(content); },
  };
  const waits = [];
  shim.default(pi, {
    jitter: 0,
    delay: () => {
      let settle;
      const done = new Promise((resolve) => { settle = resolve; });
      waits.push(settle);
      return done;
    },
    sendUserMessage: (content) => sent.push(content),
  });
  await events.get("message_end")[0]({ type: "message_end", message: assistant("xAI API error: Responses failed") }, ctx);
  assert.equal(sent.length, 0);
  waits.shift()();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(sent, [RECOVERY]);
}

{
  const registered = [];
  const commands = [];
  const ctx = {
    get(name) {
      if (name === "llm") {
        return { registerAdapter(providers) { registered.push(...providers); return () => {}; } };
      }
      if (name === "commands") {
        return { register(definition) { commands.push(definition.name); return () => {}; } };
      }
      return undefined;
    },
    inject(deps, fn) { fn(ctx); },
    effect(fn) { return fn(); },
    provide() {},
  };
  plugin.apply(ctx, { env: { HOME: "/home/u", DSH_HOME: "/tmp/qq-models-auto-continue" } });
  assert.deepEqual(registered, ["xai-auth", "openai-codex"]);
  assert.deepEqual(commands, ["login", "logout"]);
}

console.log("test-grok-auto-continue: pass");
