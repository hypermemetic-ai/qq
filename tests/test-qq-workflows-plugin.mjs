#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const notebookModule = await import(pathToFileURL(join(root, "qq-workflows/src/notebook.mjs")));
const clerkModule = await import(pathToFileURL(join(root, "qq-workflows/src/clerk.mjs")));
const foldModule = await import(pathToFileURL(join(root, "qq-workflows/src/fold.mjs")));
const scribeModule = await import(pathToFileURL(join(root, "qq-workflows/src/scribe.mjs")));
const architectModule = await import(pathToFileURL(join(root, "qq-workflows/src/architect.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-workflows/src/plugin.mjs")));

const {
  NOTEBOOK_SCHEMA, DEFAULT_CARD_NAME, createNotebookStore, defaultNotebookDir, formatStub,
} = notebookModule;
const {
  isOperatorUserMessage, turnHasOperatorTalk, buildSpine, createClerk, formatSpine,
} = clerkModule;
const {
  DEFAULT_H, DEFAULT_Q, GROK_Q, MIN_PAIRS, shouldDropOld, qualityCeiling, decideFold,
  pairBoundaries, createFolder,
} = foldModule;
const { parseClerkOutput, resolveScribeBinding, runScribe } = scribeModule;
const { createArchitect, isArchitectSession, ARCHITECT_LABEL, CHILD_ORIGIN } = architectModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-workflows-plugin."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("000000000001");
const childId = sessionId("000000000099");

function event(type, seq, data, extra = {}) {
  return { type, seq, time: 1_700_000_000_000 + seq, data, ...extra };
}

function userMessage(text, source = { kind: "user" }) {
  return {
    id: `msg-${text.slice(0, 8)}`,
    role: "user",
    content: [{ type: "text", text }],
    source,
  };
}

function assistantMessage(text) {
  return {
    id: `asst-${text.slice(0, 8)}`,
    role: "assistant",
    content: [{ type: "text", text }],
    source: { kind: "model", provider: "test", model: "test" },
  };
}

function pairEvents(turn, startSeq, userText, assistantText, source) {
  return [
    event("turn/start", startSeq, { turn }),
    event("user/message", startSeq + 1, userMessage(userText, source), { surfaceOp: "append" }),
    event("assistant/message", startSeq + 2, {
      turn, step: 1, message: assistantMessage(assistantText),
    }, { surfaceOp: "append" }),
    event("turn/end", startSeq + 3, { turn, reason: { kind: "completed" } }),
  ];
}

try {
  // ---------------------------------------------------------------- module
  assert.deepEqual(pluginModule.inject, ["agents", "sessions", "tools"]);
  assert.equal(pluginModule.provide, "qq-workflows");
  assert.equal(pluginModule.name, "qq-workflows");
  assert.equal(NOTEBOOK_SCHEMA, "qq.workflows-notebook/v1");
  assert.equal(DEFAULT_CARD_NAME, "concern");
  assert.equal(ARCHITECT_LABEL, "workflows:architect");
  assert.equal(CHILD_ORIGIN, "subagent");
  assert.equal(DEFAULT_H, 0.1);
  assert.equal(DEFAULT_Q, 256_000);
  assert.equal(GROK_Q, 200_000);
  assert.equal(MIN_PAIRS, 2);

  // ---------------------------------------------------------------- defaults
  assert.equal(
    defaultNotebookDir({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-workflows-notebooks",
  );
  assert.equal(
    defaultNotebookDir({}, { notebookDir: "/x/notebooks" }),
    "/x/notebooks",
  );
  assert.throws(() => defaultNotebookDir({}, { notebookDir: "relative" }), /absolute path/);
  assert.throws(() => defaultNotebookDir({ DSH_HOME: "relative" }, {}), /absolute path/);

  // ---------------------------------------------------------------- notebook persist / restart
  {
    const dir = join(scratch, "notes");
    const store = createNotebookStore(dir);
    store.ensure(alphaId);
    store.appendNote(alphaId, { text: "keep the stitch thin", startSeq: 2, endSeq: 8 });
    const first = store.load(alphaId);
    assert.equal(first.schema, NOTEBOOK_SCHEMA);
    assert.equal(first.session, alphaId);
    assert.equal(first.cards.length, 1);
    assert.equal(first.cards[0].open, true);
    assert.equal(first.cards[0].notes.length, 1);
    assert.equal(first.cards[0].notes[0].text, "keep the stitch thin");
    const file = store.fileFor(alphaId);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const again = createNotebookStore(dir);
    const second = again.load(alphaId);
    assert.deepEqual(second.cards[0].notes, first.cards[0].notes);
  }

  // ---------------------------------------------------------------- append / withdraw / exactly one open
  {
    const store = createNotebookStore(join(scratch, "cards"));
    store.ensure(alphaId);
    store.appendNote(alphaId, { text: "first fact", startSeq: 1, endSeq: 4 });
    store.appendWithdraw(alphaId, { text: "first fact withdrawn / replaced by second", startSeq: 5, endSeq: 8 });
    const loaded = store.load(alphaId);
    assert.equal(loaded.cards[0].notes.length, 2);
    assert.match(loaded.cards[0].notes[1].text, /withdrawn/);
    store.closeCard(alphaId, "concern");
    const afterClose = store.load(alphaId);
    assert.equal(afterClose.cards.filter((card) => card.open).length, 1);
    store.replaceCard(alphaId, "next-concern");
    const replaced = store.load(alphaId);
    assert.equal(replaced.cards.filter((card) => card.open).length, 1);
    assert.equal(replaced.cards.at(-1).name, "next-concern");
    assert.equal(replaced.cards.at(-1).notes.length, 0);
  }

  // ---------------------------------------------------------------- stub freeze: later append does not rewrite
  {
    const store = createNotebookStore(join(scratch, "stubs"));
    store.ensure(alphaId);
    store.appendNote(alphaId, { text: "old decision", startSeq: 1, endSeq: 10 });
    const frozen = store.freezeStub(alphaId, { startSeq: 1, endSeq: 10 });
    assert.equal(frozen.frozen, false);
    assert.match(frozen.text, /old decision/);
    store.appendWithdraw(alphaId, { text: "old decision withdrawn / replaced by new", startSeq: 11, endSeq: 14 });
    const again = store.freezeStub(alphaId, { startSeq: 1, endSeq: 10 });
    assert.equal(again.frozen, true);
    assert.equal(again.text, frozen.text);
    assert.doesNotMatch(again.text, /replaced by new/);
    const loaded = store.load(alphaId);
    assert.equal(loaded.cards[0].notes.length, 2);
    assert.equal(loaded.cards[0].stubs.length, 1);
    assert.match(formatStub(loaded.cards[0].notes.slice(0, 1), 1, 10), /old decision/);
  }

  // ---------------------------------------------------------------- clerk skip rules and spine-not-dump
  {
    const relayTurn = [
      event("turn/start", 0, { turn: 1 }),
      event("user/message", 1, userMessage("From session 1: ping", {
        kind: "plugin", plugin: "qq-relay", form: "relay",
      }), { surfaceOp: "append" }),
      event("assistant/message", 2, { turn: 1, step: 1, message: assistantMessage("ack") }, { surfaceOp: "append" }),
      event("turn/end", 3, { turn: 1, reason: { kind: "completed" } }),
    ];
    assert.equal(isOperatorUserMessage(relayTurn[1]), false);
    assert.equal(turnHasOperatorTalk(relayTurn), false);

    const operatorTurn = [
      event("turn/start", 4, { turn: 2 }),
      event("user/message", 5, userMessage("Ship the architect stitch, not a dispatcher."), { surfaceOp: "append" }),
      event("tool/call", 6, { turn: 2, step: 1, callId: "c1", name: "notes_list", arguments: "{}" }),
      event("tool/result", 7, {
        turn: 2, step: 1,
        message: { id: "r1", role: "user", content: [{ type: "text", text: "card concern (open)\n  (no notes)" }], source: { kind: "tool" } },
      }, { surfaceOp: "append" }),
      event("assistant/message", 8, { turn: 2, step: 1, message: assistantMessage("ok") }, { surfaceOp: "append" }),
      event("turn/end", 9, { turn: 2, reason: { kind: "completed" } }),
    ];
    assert.equal(turnHasOperatorTalk(operatorTurn), true);
    const spine = buildSpine(operatorTurn, 2);
    assert.equal(spine.speaker, "operator");
    assert.equal(spine.startSeq, 4);
    assert.equal(spine.endSeq, 9);
    assert.deepEqual(spine.tools.map((tool) => tool.name), ["notes_list", "result"]);
    assert.match(spine.userExtract, /Ship the architect stitch/);
    assert.doesNotMatch(formatSpine(spine), /SECRET_REASONING|dump the whole log/);
    assert.equal(spine.empty, false);
  }

  {
    const store = createNotebookStore(join(scratch, "clerk"));
    store.ensure(alphaId);
    const calls = [];
    const clerk = createClerk({
      store,
      llm: {},
      binding: { provider: "test", model: "scribe", effort: "low" },
      run: async (_llm, binding, request) => {
        calls.push({ binding, request });
        return "keep fold off the talking model";
      },
    });
    const skipped = await clerk.fire({
      sessionId: alphaId,
      turn: 1,
      events: [
        event("turn/start", 0, { turn: 1 }),
        event("user/message", 1, userMessage("landed", {
          kind: "plugin", plugin: "qq-relay", form: "relay",
        }), { surfaceOp: "append" }),
        event("turn/end", 2, { turn: 1, reason: { kind: "completed" } }),
      ],
    });
    assert.equal(skipped.action, "skip");
    assert.equal(calls.length, 0);

    const noted = await clerk.fire({
      sessionId: alphaId,
      turn: 2,
      events: pairEvents(2, 3, "Do not paste the notebook every turn.", "agreed"),
    });
    assert.equal(noted.action, "note");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].binding.model, "scribe");
    assert.match(calls[0].request.user, /Turn spine:/);
    assert.doesNotMatch(calls[0].request.user, /SECRET/);
    const loaded = store.load(alphaId);
    assert.equal(loaded.cards[0].notes.at(-1).text, "keep fold off the talking model");

    const withdrawn = await clerk.fire({
      sessionId: alphaId,
      turn: 3,
      events: pairEvents(3, 10, "That plan is out.", "withdrawn"),
    });
    // parse happens inside fire via scribe output
    assert.equal(withdrawn.action, "note");
  }

  {
    assert.deepEqual(parseClerkOutput("NOTHING"), { action: "nothing" });
    assert.deepEqual(parseClerkOutput("(none)"), { action: "nothing" });
    assert.equal(parseClerkOutput("X withdrawn / replaced by fold math").action, "withdraw");
    assert.equal(parseClerkOutput("keep the two-turn floor").action, "note");
  }

  {
    const store = createNotebookStore(join(scratch, "clerk-withdraw"));
    store.ensure(alphaId);
    const clerk = createClerk({
      store,
      llm: {},
      binding: { provider: "test", model: "scribe" },
      run: async () => "X withdrawn / replaced by the frozen stub",
    });
    const result = await clerk.fire({
      sessionId: alphaId,
      turn: 1,
      events: pairEvents(1, 0, "drop the old plan", "ok"),
    });
    assert.equal(result.action, "withdraw");
    assert.match(store.load(alphaId).cards[0].notes[0].text, /withdrawn/);
  }

  {
    const store = createNotebookStore(join(scratch, "clerk-empty"));
    store.ensure(alphaId);
    let called = 0;
    const clerk = createClerk({
      store,
      llm: {},
      binding: { provider: "test", model: "scribe" },
      run: async () => { called += 1; return ""; },
    });
    const empty = await clerk.fire({
      sessionId: alphaId,
      turn: 1,
      events: [
        event("turn/start", 0, { turn: 1 }),
        event("turn/end", 1, { turn: 1, reason: { kind: "completed" } }),
      ],
    });
    assert.equal(empty.action, "skip");
    assert.equal(called, 0);
  }

  // ---------------------------------------------------------------- fold math
  assert.equal(shouldDropOld(90, 10, 0.1), true);
  assert.equal(shouldDropOld(89, 10, 0.1), false);
  assert.equal(shouldDropOld(9, 1, 0.1), true);
  assert.equal(qualityCeiling({ provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" }), DEFAULT_Q);
  assert.equal(qualityCeiling({ provider: "xai-auth", model: "grok-4.6" }), GROK_Q);

  {
    const pairs = [];
    for (let turn = 1; turn <= 4; turn += 1) {
      pairs.push(...pairEvents(turn, (turn - 1) * 4, `operator ${turn} ${"x".repeat(40)}`, `architect ${turn}`));
    }
    assert.equal(pairBoundaries(pairs).length, 4);
    const keep = decideFold({
      events: pairs,
      tokenMeter: { estimateMessage: (message) => {
        const text = message.content?.[0]?.text ?? "";
        return text.includes("operator 1") || text.includes("operator 2") ? 10 : 100;
      } },
      h: 0.1,
      q: 10_000,
    });
    assert.equal(keep.action, "keep");

    const drop = decideFold({
      events: pairs,
      tokenMeter: { estimateMessage: (message) => {
        const text = message.content?.[0]?.text ?? "";
        return /operator [12]|architect [12]/.test(text) ? 100 : 10;
      } },
      h: 0.1,
      q: 10_000,
    });
    assert.equal(drop.action, "drop");
    assert.equal(drop.reason, "h");
    assert.equal(drop.startSeq, 0);
    assert.equal(drop.endSeq, 7);

    // Over Q, the whole Old prefix drops even when the h-math would keep it.
    const overQ = decideFold({
      events: pairs,
      tokenMeter: { estimateMessage: (message) => {
        const text = message.content?.[0]?.text ?? "";
        return /operator [12]|architect [12]/.test(text) ? 125 : 100;
      } },
      h: 0.1,
      q: 800,
    });
    assert.equal(overQ.action, "drop");
    assert.equal(overQ.reason, "quality-ceiling");
    assert.equal(overQ.q, 800);
    assert.equal(overQ.oldTokens, 500);
    assert.equal(overQ.tailTokens, 400);
    assert.equal(overQ.startSeq, 0);
    assert.equal(overQ.endSeq, 7);

    const late = decideFold({ events: pairs, pendingClerk: true });
    assert.equal(late.action, "skip");
    assert.equal(late.reason, "clerk-late");

    const floor = decideFold({ events: pairEvents(1, 0, "only", "one").concat(pairEvents(2, 4, "two", "pairs")) });
    assert.equal(floor.action, "keep");
    assert.equal(floor.reason, "two-turn-floor");

    const fail = decideFold({
      events: pairs,
      tokenMeter: { estimateMessage: () => 80_000 },
      q: 100,
    });
    assert.equal(fail.action, "fail");
    assert.equal(fail.reason, "tail-exceeds-q");
  }

  {
    const store = createNotebookStore(join(scratch, "fold-apply"));
    store.ensure(alphaId);
    store.appendNote(alphaId, { text: "prefix fact", startSeq: 1, endSeq: 3 });
    const appended = [];
    const events = [];
    for (let turn = 1; turn <= 4; turn += 1) events.push(...pairEvents(turn, (turn - 1) * 4, `u${turn}`, `a${turn}`));
    const session = {
      id: alphaId,
      events,
      surface: { nodes: events.filter((item) => item.surfaceOp).map((item) => item.seq) },
      append(type, data, opts) { appended.push({ type, data, opts }); },
    };
    const folder = createFolder({
      store,
      tokenMeter: { estimateMessage: (message) => {
        const text = message.content?.[0]?.text ?? "";
        return /u[12]|a[12]/.test(text) ? 100 : 10;
      } },
      h: 0.1,
      q: 10_000,
    });
    const decision = folder.decide(alphaId, { events, session });
    assert.equal(decision.action, "drop");
    const applied = folder.apply(alphaId, { events, session });
    assert.equal(applied.applied, true);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].type, "user/message");
    assert.deepEqual(appended[0].data.source, { kind: "plugin", plugin: "qq-workflows", form: "recall" });
    assert.equal(appended[0].opts.surfaceOp.op, "replace");
    assert.match(appended[0].data.content[0].text, /prefix fact/);
    store.appendWithdraw(alphaId, { text: "prefix fact withdrawn", startSeq: 20, endSeq: 21 });
    const stub = store.freezeStub(alphaId, { startSeq: 0, endSeq: 7 });
    assert.equal(stub.frozen, true);
    assert.doesNotMatch(stub.text, /withdrawn/);
  }

  // ---------------------------------------------------------------- invoke refuses without relay
  {
    const store = createNotebookStore(join(scratch, "invoke"));
    store.ensure(alphaId);
    const clerk = createClerk({
      store,
      llm: {},
      binding: { provider: "test", model: "scribe" },
      run: async () => "packet",
    });
    const folder = createFolder({ store });
    const architect = createArchitect({
      ctx: { get: () => null },
      store,
      clerk,
      folder,
      agents: { create: async () => { throw new Error("must not create"); } },
    });
    const parent = {
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
    };
    const refused = await architect.invoke({ agent: parent });
    assert.equal(refused.status, "refused");
    assert.match(refused.reason, /qq-relay/);
  }

  {
    const store = createNotebookStore(join(scratch, "invoke-ok"));
    store.ensure(alphaId);
    const created = [];
    const followups = [];
    const architect = createArchitect({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: () => "80",
              hang() {},
              clear() {},
            };
          }
          return null;
        },
      },
      store,
      clerk: {
        compilePacket: async () => "start from the architect stitch",
      },
      folder: { pending: () => undefined },
      agents: {
        create: async (options) => {
          created.push(options);
          return {
            agent: {
              session: { id: options.sessionId },
              followup(message) { followups.push(message); },
            },
          };
        },
      },
    });
    const result = await architect.invoke({
      agent: { session: { id: alphaId, events: pairEvents(1, 0, "go", "ok"), header: { cwd: "/work" } } },
    });
    assert.equal(result.status, "ok");
    assert.equal(result.alias, "80");
    assert.equal(result.delivery, "default");
    assert.equal(created[0].meta.origin, CHILD_ORIGIN);
    assert.equal(created[0].meta.parentSession, alphaId);
    assert.match(followups[0].content[0].text, /architect stitch/);
  }

  assert.equal(isArchitectSession({ session: { id: alphaId, header: {} } }), true);
  assert.equal(isArchitectSession({
    session: { id: childId, header: { origin: CHILD_ORIGIN } },
  }), false);

  // ---------------------------------------------------------------- scribe binding + cacheRetention: none
  {
    const policyPath = join(scratch, "execution-profiles.json");
    writeFileSync(policyPath, JSON.stringify({
      scribe: { provider: "xai-auth", model: "grok-4.6", effort: "high" },
    }));
    assert.deepEqual(
      resolveScribeBinding({ executionProfilesPath: policyPath }),
      { provider: "xai-auth", model: "grok-4.6", effort: "high" },
    );
    assert.deepEqual(
      resolveScribeBinding({ scribe: { provider: "test", model: "scribe", effort: "low" } }),
      { provider: "test", model: "scribe", effort: "low" },
    );
    const seen = [];
    const text = await runScribe({
      async *stream(options) {
        seen.push(options);
        yield { type: "text-delta", index: 0, text: "note" };
      },
    }, { provider: "test", model: "scribe", effort: "low" }, { system: "sys", user: "hi" });
    assert.equal(text, "note");
    assert.equal("cacheRetention" in seen[0], false);
    assert.equal(seen[0].provider, "test");
    assert.match(seen[0].sessionId, /^session-/);
  }

  // ---------------------------------------------------------------- plugin apply: tools + label hang
  {
    const dir = join(scratch, "plugin-apply");
    const registered = [];
    const hung = [];
    const agents = new Map();
    const agentCtxListeners = [];
    const fakeAgent = {
      id: alphaId,
      options: { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: {
        on(type, fn) {
          agentCtxListeners.push({ type, fn });
          return () => {};
        },
      },
    };
    agents.set(alphaId, fakeAgent);
    const created = [];
    const toolsService = {
      register(definition) {
        registered.push(definition);
        return () => {};
      },
    };
    const provided = {};
    pluginModule.apply({
      get(name) {
        if (name === "agents") {
          return {
            list: () => [...agents.values()],
            get: (id) => agents.get(id),
            create: async (options) => {
              created.push(options);
              return {
                agent: {
                  session: { id: options.sessionId },
                  followup() {},
                },
              };
            },
          };
        }
        if (name === "sessions") return {};
        if (name === "tools") return toolsService;
        if (name === "qq-relay") {
          return {
            hang(id, label) { hung.push({ id, label }); },
            clear() {},
            alias: () => "1",
          };
        }
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, {
      notebookDir: dir,
      scribe: { provider: "test", model: "scribe" },
      runScribe: async () => "start from the architect stitch",
    });

    assert.ok(provided["qq-workflows"]);
    assert.deepEqual(registered.map((tool) => tool.name), [
      "notes_list", "notes_expand", "session_search", "invoke",
    ]);
    assert.deepEqual(hung, [{ id: alphaId, label: ARCHITECT_LABEL }]);

    const [listTool, expandTool, searchTool, invokeTool] = registered;
    const listed = await listTool.execute({}, { agent: fakeAgent });
    assert.equal(listed.status, "ok");
    assert.match(listTool.output.render({}, listed)[0].text, /card concern/);

    provided["qq-workflows"].store.appendNote(alphaId, { text: "cited", startSeq: 5, endSeq: 8 });
    fakeAgent.session.events = pairEvents(1, 4, "operator cited this", "ok");
    const expanded = await expandTool.execute({ startSeq: 5, endSeq: 5 }, { agent: fakeAgent });
    assert.equal(expanded.status, "ok");
    assert.equal(expanded.windows[0].target.type, "user/message");

    const searchMissing = await searchTool.execute({ query: "cited" }, { agent: fakeAgent });
    assert.equal(searchMissing.status, "refused");
    assert.match(searchMissing.reason, /searchEvents/);

    const invoked = await invokeTool.execute({}, { agent: fakeAgent });
    assert.equal(invoked.status, "ok");
    assert.equal(invoked.alias, "1");
  }

  // invoke tool refuses when relay is absent
  {
    const dir = join(scratch, "plugin-no-relay");
    const registered = [];
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
    };
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        if (name === "sessions") return {};
        if (name === "tools") {
          return {
            register(definition) {
              registered.push(definition);
              return () => {};
            },
          };
        }
        return undefined;
      },
      provide() {},
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir });
    const invokeTool = registered.find((tool) => tool.name === "invoke");
    const refused = await invokeTool.execute({}, { agent: fakeAgent });
    assert.equal(refused.status, "refused");
    assert.match(refused.reason, /qq-relay/);
  }

  console.log("test-qq-workflows-plugin: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
