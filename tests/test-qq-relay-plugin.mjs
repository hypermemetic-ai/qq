#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const aliasModule = await import(pathToFileURL(join(root, "qq-relay/src/alias.mjs")));
const labelsModule = await import(pathToFileURL(join(root, "qq-relay/src/labels.mjs")));
const relayModule = await import(pathToFileURL(join(root, "qq-relay/src/relay.mjs")));
const toolsModule = await import(pathToFileURL(join(root, "qq-relay/src/tools.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-relay/src/plugin.mjs")));

const {
  ALIAS_SCHEMA, PUBLISHED, STRANGE, WARM_COUNT,
  createAliasBook, defaultAliasFile, farthestFirst, overflowCandidate,
  rootTokens, sharesRootWithLive, isNeighborOfLive,
} = aliasModule;
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
  assert.deepEqual([...PUBLISHED], ["1", "2", "3", "4", "9", "10", "12", "20", "40", "80"]);
  assert.deepEqual([...STRANGE], ["6", "7", "8", "11", "30"]);
  assert.equal(WARM_COUNT, 3);

  // ---------------------------------------------------------------- defaults
  assert.equal(
    defaultAliasFile({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-relay-aliases.json",
  );
  assert.equal(defaultAliasFile({}, { aliasFile: "/x/aliases.json" }), "/x/aliases.json");
  assert.throws(() => defaultAliasFile({}, { aliasFile: "relative.json" }), /absolute path/);
  assert.throws(() => defaultAliasFile({ DSH_HOME: "relative" }, {}), /absolute path/);

  // ---------------------------------------------------------------- speaking
  assert.deepEqual(rootTokens("12"), ["twelve"]);
  assert.deepEqual(rootTokens("101"), ["one", "one"]);
  assert.deepEqual(rootTokens("500"), ["five"]);
  assert.deepEqual(rootTokens("1200"), ["one", "two"]);
  assert.deepEqual(rootTokens("80"), ["eighty"]);
  assert.equal(sharesRootWithLive("101", ["1"]), true);
  assert.equal(sharesRootWithLive("500", ["1", "2", "3", "4"]), false);
  assert.equal(isNeighborOfLive("102", ["101"]), true);
  assert.equal(isNeighborOfLive("500", ["101"]), false);
  assert.equal(overflowCandidate(["1", "2", "3", "4", "9", "10", "12", "20", "40", "80"]), "500");

  // ---------------------------------------------------------------- deck
  assert.equal(farthestFirst(PUBLISHED, [], () => 0), "1");
  assert.equal(farthestFirst(PUBLISHED, [], () => 0.5), "10");
  assert.equal(
    farthestFirst(["2", "3", "4", "9", "10", "12", "20", "40"], ["1"], () => 0),
    "40",
  );
  assert.equal(farthestFirst(["6", "7", "8", "11"], [...PUBLISHED], () => 0), "6");

  // Deterministic full-deck walk with a stated expectation proves
  // farthest-first ordering instead of list order.
  {
    const file = join(scratch, "deck2.json");
    const book = createAliasBook(file, { rng: () => 0 });
    const ids = [];
    for (let index = 1; index <= 15; index += 1) ids.push(sessionId(String(index).padStart(12, "0")));
    const expected = [];
    const live = [];
    for (const id of ids) {
      live.push(id);
      book.sync(live);
      expected.push(book.aliasFor(id));
    }
    assert.deepEqual(
      expected,
      ["1", "80", "40", "20", "10", "4", "12", "2", "3", "9", "6", "7", "8", "11", "30"],
    );
    // Overflow minting after every named alias is live.
    const overflowId = sessionId("000000000016");
    live.push(overflowId);
    book.sync(live);
    assert.equal(book.aliasFor(overflowId), "500");
    rmSync(file, { force: true });
  }

  // Warmth: a departed name is not re-dealt while it is among the last few
  // issues/departures; a returning session keeps its alias if nothing took it.
  {
    const file = join(scratch, "warm.json");
    const book = createAliasBook(file, { rng: () => 0 });
    const a = sessionId("000100000001");
    const b = sessionId("000100000002");
    const c = sessionId("000100000003");
    const d = sessionId("000100000004");
    const e = sessionId("000100000005");
    const f = sessionId("000100000006");
    const g = sessionId("000100000007");
    book.sync([a]);
    assert.equal(book.aliasFor(a), "1");
    book.sync([a, b]);
    assert.equal(book.aliasFor(b), "80");
    book.sync([a, b, c]);
    assert.equal(book.aliasFor(c), "40");
    book.sync([a, b, c, d]);
    assert.equal(book.aliasFor(d), "20");
    // a departs; warm "1" must not be handed to the next arrivals.
    book.sync([b, c, d]);
    assert.equal(book.aliasFor(a), "1", "a keeps its alias until it is gone");
    book.sync([b, c, d, e]);
    assert.equal(book.aliasFor(e), "2", "warm 1 must not be re-dealt");
    book.sync([c, d, e, f]);
    assert.equal(book.aliasFor(f), "10");
    book.sync([d, e, f, g]);
    assert.equal(book.aliasFor(g), "4");
    // a returns: its alias was never taken, so it keeps it.
    book.sync([d, e, f, g, a]);
    assert.equal(book.aliasFor(a), "1");
    rmSync(file, { force: true });
  }

  // Rotation: after enough departures sit in the warm window a departed name
  // returns fresh; a returning session re-deals rather than stealing it.
  {
    const file = join(scratch, "rotate.json");
    let clock = 0;
    const now = () => { clock += 1; return clock; };
    const book = createAliasBook(file, { rng: () => 0, now });
    const a = sessionId("000300000001");
    const b = sessionId("000300000002");
    const c = sessionId("000300000003");
    const d = sessionId("000300000004");
    const e = sessionId("000300000005");
    book.sync([a]);
    book.sync([a, b]);
    book.sync([a, b, c]);
    book.sync([a, b, c, d]);
    assert.deepEqual(
      [book.aliasFor(a), book.aliasFor(b), book.aliasFor(c), book.aliasFor(d)],
      ["1", "80", "40", "20"],
    );
    // One by one they leave; departures 20/40/80 stay warm, "1" rotates out.
    book.sync([b, c, d]);
    book.sync([c, d]);
    book.sync([d]);
    book.sync([]);
    book.sync([e]);
    assert.equal(book.aliasFor(e), "1");
    // The original holder returns and re-deals around the live "1".
    book.sync([e, a]);
    assert.equal(book.aliasFor(e), "1");
    assert.notEqual(book.aliasFor(a), "1");
    assert.equal(book.aliasFor(a), "12");
    rmSync(file, { force: true });
  }

  // Restart does not re-deal: the persisted map keeps aliases stable.
  {
    const file = join(scratch, "restart.json");
    const first = createAliasBook(file, { rng: () => 0 });
    first.sync([alphaId, betaId]);
    const alphaAlias = first.aliasFor(alphaId);
    const betaAlias = first.aliasFor(betaId);
    const second = createAliasBook(file, { rng: () => 0.9 });
    second.sync([alphaId, betaId]);
    assert.equal(second.aliasFor(alphaId), alphaAlias);
    assert.equal(second.aliasFor(betaId), betaAlias);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(raw.schema, ALIAS_SCHEMA);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    rmSync(file, { force: true });
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

  function makeCtx(overrides = {}) {
    const agents = new Map();
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
    const ctx = {
      get(name, _strict = false) {
        if (name === "agents" || name === "sessions") return services[name];
        if (name === "tools") return overrides.tools ?? provided[name];
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { const cleanup = fn(); return () => cleanup?.(); },
    };
    return { ctx, agents, services };
  }

  {
    const file = join(scratch, "service-alias.json");
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
    assert.equal(relay.alias(alphaId), "1");
    assert.equal(relay.alias(betaId), "80");
    assert.equal(relay.resolve("1"), alphaId);
    assert.equal(relay.resolve(alphaId), alphaId);
    assert.equal(relay.resolve("404"), undefined);
    relay.dispose();
    rmSync(file, { force: true });
  }

  // default send steers; the envelope carries the DSH plugin source mark and a
  // from-line so the recipient never reads it as the operator typing.
  {
    const file = join(scratch, "service-send.json");
    const flushes = [];
    const { ctx, agents } = makeCtx({ flushes });
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
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
    rmSync(file, { force: true });
  }

  // urgent send to a running recipient: cancel first, then a followup turn.
  {
    const file = join(scratch, "service-urgent.json");
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId, { running: true });
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
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
    rmSync(file, { force: true });
  }

  // urgent send to an idle recipient: no halt needed, still a fresh turn.
  {
    const file = join(scratch, "service-urgent-idle.json");
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
    await relay.send({ fromId: alphaId, to: betaId, message: "new turn", delivery: "urgent" });
    assert.equal(beta.calls.cancel.length, 0);
    assert.equal(beta.calls.followup.length, 1);
    relay.dispose();
    rmSync(file, { force: true });
  }

  // Refusals are typed, not thrown through the tool layer.
  {
    const file = join(scratch, "service-refusals.json");
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId);
    const beta = makeFakeAgent(betaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
    await assert.rejects(() => relay.send({ fromId: alphaId, to: alphaId, message: "self" }), /own session/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: "911", message: "who" }), /no live session/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "   " }), /non-empty/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "x".repeat(65_537) }), /exceeds/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: betaId, message: "y", delivery: "smoke" }), /delivery must be/);
    await assert.rejects(() => relay.send({ fromId: "019ff7ad-2fcd-78cd-bc16-c770a9ccff11", to: betaId, message: "bare" }), /session-<UUID> sender/);
    await assert.rejects(() => relay.send({ fromId: sessionId("9999"), to: betaId, message: "missing" }), /live session-<UUID> sender/);
    await assert.rejects(() => relay.send({ fromId: alphaId, to: sessionId("7777"), message: "ghost" }), /no live session/);
    relay.dispose();
    rmSync(file, { force: true });
  }

  // Directory rows: alias, one status phrase, labels, sorted by alias number.
  {
    const file = join(scratch, "service-list.json");
    const { ctx, agents } = makeCtx();
    const alpha = makeFakeAgent(alphaId, { running: true });
    const beta = makeFakeAgent(betaId);
    const gamma = makeFakeAgent(gammaId);
    agents.set(alphaId, alpha);
    agents.set(betaId, beta);
    agents.set(gammaId, gamma);
    const relay = createRelayService(ctx, { aliasFile: file, rng: () => 0 });
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
    rmSync(file, { force: true });
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
    pluginModule.apply({
      get: (name, _strict) => {
        if (name === "agents") return { list: () => [...agents.values()], get: (id) => agents.get(id) };
        if (name === "sessions") return { flush: async () => true };
        if (name === "tools") return toolsService;
        return provided[name];
      },
      provide: (name, value) => { provided[name] = value; },
      effect: (fn) => { fn(); return () => {}; },
    }, { aliasFile: file, rng: () => 0 });

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