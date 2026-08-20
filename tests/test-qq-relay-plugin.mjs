#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const aliasModule = await import(pathToFileURL(join(root, "qq/src/alias.mjs")));
const labelsModule = await import(pathToFileURL(join(root, "qq-relay/src/labels.mjs")));
const relayModule = await import(pathToFileURL(join(root, "qq-relay/src/relay.mjs")));
const toolsModule = await import(pathToFileURL(join(root, "qq-relay/src/tools.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-relay/src/plugin.mjs")));
const qqPluginModule = await import(pathToFileURL(join(root, "qq/src/plugin.mjs")));
const { createAliasBook } = aliasModule;
const { createLabelBoard } = labelsModule;
const { createRelayService, relayEnvelope, RelayError } = relayModule;
const { buildRelayTools } = toolsModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-relay-plugin."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("000000000001");
const betaId = sessionId("000000000002");
const gammaId = sessionId("000000000003");

try {
  // ---------------------------------------------------------------- module
  assert.deepEqual(pluginModule.inject, ["agents", "sessions"]);
  assert.equal(pluginModule.provide, "qq-relay");
  assert.equal(pluginModule.name, "qq-relay");
  assert.doesNotMatch(String(createRelayService), /createAliasBook|defaultAliasFile|qq-relay-aliases/);

  // Optional Tools is a coeffect: relay can load first and attach its tools
  // when the service appears later.
  {
    const agents = new Map([
      [alphaId, makeFakeAgent(alphaId)],
      [betaId, makeFakeAgent(betaId)],
    ]);
    const provided = {};
    const registered = [];
    const disposed = [];
    let tools;
    let injectTools;
    const ctx = {
      get(name) {
        if (name === "agents") return { list: () => [...agents.values()], get: (id) => agents.get(id) };
        if (name === "sessions") return { flush: async () => true };
        if (name === "tools") return tools;
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      inject(deps, fn) {
        if (deps.includes("tools")) injectTools = fn;
      },
      effect(fn) { return fn(); },
    };
    pluginModule.apply(ctx, {});
    assert.equal(registered.length, 0);
    tools = {
      register(tool) {
        registered.push(tool.name);
        return () => disposed.push(tool.name);
      },
    };
    const cleanup = injectTools(ctx);
    assert.deepEqual(registered, ["relay_list", "relay_send", "relay_status"]);
    cleanup();
    assert.deepEqual(disposed, registered);
  }

  // ---------------------------------------------------------------- labels
  {
    const live = new Set([alphaId]);
    const board = createLabelBoard({ isLive: (id) => live.has(id) });
    board.hang(alphaId, "tasks:T-66");
    board.hang(alphaId, "workflows:delegate");
    board.hang(alphaId, "workflows:delegate/as:runner");
    assert.deepEqual(board.labelsFor(alphaId), [
      "tasks:T-66",
      "workflows:delegate",
      "workflows:delegate/as:runner",
    ]);
    assert.equal(board.matches(board.labelsFor(alphaId), "tasks"), true);
    assert.equal(board.matches(board.labelsFor(alphaId), "tasks:T-66"), true);
    assert.equal(board.matches(board.labelsFor(alphaId), "tasks:T-12"), false);
    assert.equal(board.matches(board.labelsFor(alphaId), "workflows"), true);
    assert.equal(board.matches(board.labelsFor(alphaId), undefined), true);
    assert.throws(() => board.hang(alphaId, "NoNamespace"), /namespaced token/);
    assert.throws(() => board.hang(alphaId, "1bad:token"), /namespaced token/);
    assert.throws(() => board.hang(betaId, "tasks:T-1"), /live sessions only/);
    board.clear(alphaId, "workflows");
    assert.deepEqual(board.labelsFor(alphaId), ["tasks:T-66"]);
    board.hang(alphaId, "workflows:delegate");
    board.release(alphaId);
    assert.deepEqual(board.labelsFor(alphaId), []);
    board.hang(alphaId, "tasks:T-66");
    live.delete(alphaId);
    board.pruneLive();
    assert.deepEqual(board.labelsFor(alphaId), []);
  }

  // ---------------------------------------------------------------- service
  function makeFakeAgent(id, { running = false } = {}) {
    let status = running ? "running" : "idle";
    const calls = { steer: [], followup: [], cancel: [], flush: [] };
    return {
      id,
      get status() { return status; },
      setStatus(next) { status = next; },
      session: { id, events: [], header: { createdAt: Date.now(), cwd: "/work" } },
      steer(message) { calls.steer.push(message); },
      followup(message) { calls.followup.push(message); },
      cancel(cause, options) { calls.cancel.push({ cause, options }); },
      whenIdle: async () => {},
      calls,
    };
  }

  function makeAliasFacade(file, agents) {
    const book = createAliasBook(file, { rng: () => 0 });
    const liveIds = () => [...agents.keys()];
    return Object.freeze({
      alias(sessionId) {
        book.sync(liveIds());
        return book.aliasFor(sessionId);
      },
      resolve(address) {
        book.sync(liveIds());
        if (agents.has(address)) return address;
        return liveIds().find((id) => book.aliasFor(id) === address);
      },
    });
  }

  function makeCtx(overrides = {}) {
    const agents = new Map();
    const file = overrides.aliasFile ?? join(scratch, `relay-${Math.random().toString(16).slice(2)}.json`);
    const qq = overrides.qq === undefined ? makeAliasFacade(file, agents) : overrides.qq;
    const services = {
      agents: {
        get: (id) => agents.get(id),
        list: () => [...agents.values()],
        ...overrides.agents,
      },
      sessions: {
        flush: async (session) => { overrides.flushes?.push(session.id); return true; },
        ...overrides.sessions,
      },
    };
    const provided = {};
    if (qq) {
      provided.qq = qq;
      provided["qq-aliases"] = qq;
    }
    const ctx = {
      get(name, _strict = false) {
        if (name === "agents" || name === "sessions") return services[name];
        if (name === "tools") return overrides.tools ?? provided[name];
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { const cleanup = fn(); return () => cleanup?.(); },
    };
    return { ctx, agents, services, file };
  }

  // One qq book feeds relay: the qq plugin deals aliases and relay consumes
  // them through ctx, with no alias config of its own.
  {
    const file = join(scratch, "relay-consumes-qq.json");
    const agents = new Map();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const provided = {};
    const ctx = {
      get(name, _strict = false) {
        if (name === "agents") return { list: () => [...agents.values()], get: (id) => agents.get(id) };
        if (name === "sessions") return { flush: async () => true };
        if (name === "sessionPersistence") return { async list() { return []; } };
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
    };
    qqPluginModule.apply(ctx, {
      sessionId: alphaId,
      cwd: "/work",
      provider: "qwen-token-plan",
      model: "deepseek-v4-pro-0813",
      aliasFile: file,
      rng: () => 0,
    });
    const relay = createRelayService(ctx, {});
    assert.equal(relay.alias(alphaId), "1");
    assert.equal(relay.alias(betaId), "80");
    assert.equal(relay.resolve("1"), alphaId);
    assert.equal(relay.resolve("80"), betaId);
    assert.deepEqual(relay.list().map((row) => row.alias), ["1", "80"]);
    const sent = await relay.send({ fromId: alphaId, to: "80", message: "through qq's book" });
    assert.equal(sent.to, betaId);
    assert.equal(sent.to_alias, "80");
    assert.match(beta.calls.steer[0].content[0].text, /^From session 1 \(/);
    relay.dispose();
    rmSync(file, { force: true });
  }

  // Missing qq: send still works by session id; alias book is empty.
  {
    const { ctx, agents } = makeCtx({ qq: false });
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, {});
    assert.equal(relay.alias(alphaId), undefined);
    assert.equal(relay.resolve("1"), undefined);
    assert.equal(relay.resolve(alphaId), alphaId);
    assert.deepEqual(relay.list().map((row) => row.alias), ["", ""]);
    const byId = await relay.send({ fromId: alphaId, to: betaId, message: "by id" });
    assert.equal(byId.status, "sent");
    assert.equal(byId.to, betaId);
    assert.equal(byId.to_alias, undefined);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: "80", message: "no book" }), /no live session/);
    relay.dispose();
  }

  // default send steers; the envelope carries the DSH plugin source mark and a
  // from-line so the recipient never reads it as the operator typing.
  {
    const flushes = [];
    const { ctx, agents } = makeCtx({ flushes });
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, {});
    const result = await relay.send({ fromId: alphaId, to: "80", message: "review this diff" });
    assert.equal(result.status, "sent");
    assert.equal(result.to, betaId);
    assert.equal(result.to_alias, "80");
    assert.equal(beta.calls.steer.length, 1);
    assert.equal(beta.calls.followup.length, 0);
    assert.equal(beta.calls.cancel.length, 0);
    const envelope = beta.calls.steer[0];
    assert.equal(envelope.role, "user");
    assert.deepEqual(envelope.source, { kind: "plugin", plugin: "qq-relay", form: "relay" });
    assert.match(
      envelope.content[0].text,
      /^From session 1 \(session-63a11000-0000-4000-8000-000000000001\):\n\nreview this diff$/,
    );
    assert.deepEqual(flushes, [betaId]);
    const status = relay.status(result.message_id);
    assert.equal(status.status, "sent");
    assert.equal(status.to, betaId);
    assert.throws(() => relay.status("missing"), RelayError);
    // The canonical session id stays the exact-send fallback beside the alias.
    const byId = await relay.send({ fromId: alphaId, to: betaId, message: "by id" });
    assert.equal(byId.status, "sent");
    assert.equal(byId.to, betaId);
    assert.equal(beta.calls.steer.length, 2);
    assert.equal(beta.calls.cancel.length, 0);
    relay.dispose();
  }

  // urgent send to a running recipient: cancel first, then a followup turn.
  {
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId, { running: true });
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, {});
    const result = await relay.send({
      fromId: alphaId,
      to: betaId,
      message: "halt and read this",
      delivery: "urgent",
    });
    assert.equal(result.status, "sent");
    assert.equal(beta.calls.cancel.length, 1);
    assert.deepEqual(beta.calls.cancel[0].cause, { kind: "hook", reason: "qq-relay urgent message" });
    assert.equal(beta.calls.steer.length, 0);
    assert.equal(beta.calls.followup.length, 1);
    relay.dispose();
  }

  // urgent send to an idle recipient: no halt needed, still a fresh turn.
  {
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, {});
    await relay.send({ fromId: alphaId, to: betaId, message: "new turn", delivery: "urgent" });
    assert.equal(beta.calls.cancel.length, 0);
    assert.equal(beta.calls.followup.length, 1);
    relay.dispose();
  }

  // Refusals are typed, not thrown through the tool layer.
  {
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, {});
    await assert.rejects(() => relay.send({ fromId: alphaId, to: alphaId, message: "self" }), /own session/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: "911", message: "who" }), /no live session/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "   " }), /non-empty/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "x".repeat(65_537) }), /exceeds/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "y", delivery: "smoke" }), /delivery must be/);
    await assert.rejects(() => relay.send({ fromId: "019ff7ad-2fcd-78cd-bc16-c770a9ccff11", to: betaId, message: "bare" }), /session-<UUID> sender/);
    await assert.rejects(() => relay.send({ fromId: sessionId("9999"), to: betaId, message: "missing" }), /live session-<UUID> sender/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: sessionId("7777"), message: "ghost" }), /no live session/);
    relay.dispose();
  }

  // Directory rows: alias, one status phrase, labels, sorted by alias number.
  {
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId, { running: true });
    const beta = makeFakeAgent(betaId);
    const gamma = makeFakeAgent(gammaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    agents.set(gammaId, gamma);
    const relay = createRelayService(ctx, {});
    relay.hang(betaId, "tasks:T-66");
    relay.hang(betaId, "workflows:delegate");
    const rows = relay.list();
    assert.deepEqual(rows.map((row) => row.alias), ["1", "40", "80"]);
    assert.equal(rows[0].status, "thinking-or-tool");
    assert.equal(rows[0].labels.length, 0);
    assert.equal(rows[1].status, "idle");
    assert.deepEqual(rows[1].labels, []);
    assert.deepEqual(rows[2].labels, ["tasks:T-66", "workflows:delegate"]);
    assert.deepEqual(relay.list({ filter: "tasks" }).map((row) => row.session), [betaId]);
    assert.deepEqual(relay.list({ filter: "tasks:T-66" }).map((row) => row.session), [betaId]);
    assert.deepEqual(relay.list({ filter: "tasks:T-12" }), []);
    // Departure drops labels and the alias row leaves with the session.
    agents.delete(betaId);
    assert.deepEqual(relay.list().map((row) => row.session), [alphaId, gammaId]);
    assert.deepEqual(relay.labelsFor(betaId), []);
    relay.dispose();
  }

  // ---------------------------------------------------------------- tools
  {
    const file = join(scratch, "tools.json");
    const registered = [];
    const toolsService = {
      register(definition) {
        registered.push(definition);
        return () => {};
      },
    };
    const { ctx, agents } = makeCtx({ tools: toolsService });
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);

    const provided = {};
    provided.qq = makeAliasFacade(file, agents);
    provided["qq-aliases"] = provided.qq;
    pluginModule.apply({
      get: (name, _strict) => {
        if (name === "agents") return { list: () => [...agents.values()], get: (id) => agents.get(id) };
        if (name === "sessions") return { flush: async () => true };
        if (name === "tools") return toolsService;
        if (name === "qq" || name === "qq-aliases") return provided[name];
        return provided[name];
      },
      provide: (name, value) => { provided[name] = value; },
      effect: (fn) => { fn(); return () => {}; },
    }, {});

    assert.ok(provided["qq-relay"], "plugin provides the qq-relay service");
    assert.deepEqual(registered.map((tool) => tool.name), ["relay_list", "relay_send", "relay_status"]);

    const [listTool, sendTool, statusTool] = registered;

    const sent = await sendTool.execute(
      { to: "80", message: "from the tool layer" },
      { agent: alpha },
    );
    assert.equal(sent.status, "sent");
    const rendered = sendTool.output.render({}, sent);
    assert.match(
      rendered[0].text,
      /message sent to 80 \(session-63a11000-0000-4000-8000-000000000002\) via default:/,
    );
    assert.equal(sent.delivery, "default");

    const refused = await sendTool.execute({ to: "404", message: "nobody" }, { agent: alpha });
    assert.equal(refused.status, "refused");
    assert.match(sendTool.output.render({}, refused)[0].text, /Relay refused: no live session/);

    const agentless = await sendTool.execute({ to: betaId, message: "agentless" }, {});
    assert.equal(agentless.status, "refused");
    assert.match(sendTool.output.render({}, agentless)[0].text, /session-<UUID> sender/);

    const statusOk = await statusTool.execute({ message_id: sent.message_id });
    assert.equal(statusOk.status, "sent");
    assert.equal(statusOk.to, betaId);
    assert.match(statusTool.output.render({}, statusOk)[0].text, /is sent$/);

    const statusMissing = await statusTool.execute({ message_id: "nope" });
    assert.equal(statusMissing.status, "refused");

    const listed = await listTool.execute({});
    assert.equal(listed.status, "ok");
    assert.match(listTool.output.render({}, listed)[0].text, /^live sessions:\n1/);
    assert.match(listTool.output.render({}, listed)[0].text, /80/);

    for (const tool of registered) {
      assert.equal(typeof tool.execute, "function");
      assert.equal(typeof tool.output.render, "function");
      assert.equal(typeof tool.description, "string");
    }
  }

  // ---------------------------------------------------------------- envelope
  {
    const envelope = relayEnvelope({ fromId: alphaId, fromAlias: "1", text: "x" });
    assert.match(envelope.id, /-/);
    assert.deepEqual(envelope.source, { kind: "plugin", plugin: "qq-relay", form: "relay" });
    assert.equal(Object.isFrozen(envelope), true);
  }

  console.log("test-qq-relay-plugin: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}