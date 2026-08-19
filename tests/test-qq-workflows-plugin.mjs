#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const notebookModule = await import(pathToFileURL(join(root, "qq-workflows/src/notebook.mjs")));
const clerkModule = await import(pathToFileURL(join(root, "qq-workflows/src/clerk.mjs")));
const offerModule = await import(pathToFileURL(join(root, "qq-workflows/src/offer.mjs")));
const foldModule = await import(pathToFileURL(join(root, "qq-workflows/src/fold.mjs")));
const askModule = await import(pathToFileURL(join(root, "qq/src/ask.mjs")));
const scribeModule = await import(pathToFileURL(join(root, "qq-workflows/src/scribe.mjs")));
const architectModule = await import(pathToFileURL(join(root, "qq-workflows/src/architect.mjs")));
const iterateModule = await import(pathToFileURL(join(root, "qq-workflows/src/iterate.mjs")));
const journalModule = await import(pathToFileURL(join(root, "qq-workflows/src/journal.mjs")));
const wikiModule = await import(pathToFileURL(join(root, "qq-workflows/src/wiki.mjs")));
const iterateToolsModule = await import(pathToFileURL(join(root, "qq-workflows/src/iterate-tools.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-workflows/src/plugin.mjs")));
const selectionModule = await import(pathToFileURL(join(root, "qq-workflows/src/selection.mjs")));
const settingsModule = await import(pathToFileURL(join(root, "qq-workflows/src/settings.mjs")));
const commandModule = await import(pathToFileURL(join(root, "qq-workflows/src/command.mjs")));

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
const { oneShot } = askModule;
const { parseClerkOutput, resolveScribeBinding } = scribeModule;
const {
  classifyLeftover, leftoverTitle, splitOperatorBrief, askedHandoff,
} = offerModule;
const { createArchitect, isArchitectCandidate, ARCHITECT_LABEL, CHILD_ORIGIN } = architectModule;
const { createIterate, isIterateCandidate, ITERATE_LABEL, buildHandsPacket, collectReviewEvidence } = iterateModule;
const {
  JOURNAL_SCHEMA, createJournalStore, defaultJournalDir, projectJournal, collectBreath, formatProjection,
} = journalModule;
const { WIKI_SCHEMA, createWikiStore, defaultWikiDir, projectWiki, formatWikiIndex } = wikiModule;
const {
  buildDeskTools, buildHandsTools, DESK_TOOL_NAMES, HANDS_TOOL_NAMES, PIXEL_TOOL_NAMES,
} = iterateToolsModule;
const { SELECTION_SCHEMA, createSelectionStore, defaultSelectionDir } = selectionModule;
const { ARCHITECT_SETTINGS_SCHEMA, ITERATE_ROLES, createArchitectSettings, createIterateSettings, formatSettingsList } = settingsModule;
const { parseWorkflowsInput, formatWorkflowList } = commandModule;

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
  assert.deepEqual(pluginModule.inject, ["agents", "sessions"]);
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
    // parse happens inside fire on the one-shot output
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
    const compiled = [];
    const sent = [];
    const childListeners = [];
    const childEvents = [];
    const architect = createArchitect({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: (id) => (id === alphaId ? "1" : "80"),
              hang() {},
              clear() {},
              send: async (payload) => {
                sent.push(payload);
                return { status: "sent" };
              },
            };
          }
          return null;
        },
      },
      store,
      clerk: {
        compilePacket: async (args) => {
          compiled.push(args);
          return "start from the architect stitch";
        },
      },
      folder: { pending: () => undefined },
      agents: {
        create: async (options) => {
          created.push(options);
          return {
            agent: {
              session: { id: options.sessionId, events: childEvents },
              followup(message) { followups.push(message); },
              ctx: {
                on(type, fn) {
                  childListeners.push({ type, fn });
                  return () => {};
                },
              },
            },
          };
        },
      },
    });
    const parentAgent = {
      session: { id: alphaId, events: pairEvents(1, 0, "go", "ok"), header: { cwd: "/work" } },
      ctx: { on() { return () => {}; } },
    };
    architect.attach(parentAgent);
    const result = await architect.invoke({ agent: parentAgent });
    assert.equal(result.status, "ok");
    assert.equal(result.alias, "80");
    assert.equal(result.delivery, "default");
    assert.equal(created[0].meta.origin, CHILD_ORIGIN);
    assert.equal(created[0].meta.parentSession, alphaId);
    assert.equal(compiled[0].parentSession, alphaId);
    assert.equal(compiled[0].parentAlias, "1");
    assert.match(followups[0].content[0].text, /architect stitch/);

    childEvents.push(event("assistant/message", 2, {
      turn: 1, step: 1, message: assistantMessage("child result for parent"),
    }));
    const childEvent = childListeners.find((item) => item.type === "session/event");
    assert.ok(childEvent);
    await childEvent.fn({}, { type: "turn/end", data: { turn: 1 } });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].fromId, created[0].sessionId);
    assert.equal(sent[0].to, alphaId);
    assert.equal(sent[0].delivery, "default");
    assert.match(sent[0].message, /child result for parent/);
  }

  assert.equal(isArchitectCandidate({ session: { id: alphaId, header: {} } }), true);
  assert.equal(isArchitectCandidate({
    session: { id: childId, header: { origin: CHILD_ORIGIN } },
  }), false);

  // ---------------------------------------------------------------- selection default none; persist/restart
  {
    assert.equal(
      defaultSelectionDir({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
      "/state/qq/.qq-workflows-selected",
    );
    assert.equal(
      defaultSelectionDir({}, { selectionDir: "/x/selected" }),
      "/x/selected",
    );
    assert.throws(() => defaultSelectionDir({}, { selectionDir: "relative" }), /absolute path/);
    const dir = join(scratch, "selected");
    const first = createSelectionStore(dir);
    assert.equal(first.get(alphaId), null);
    first.set(alphaId, "architect");
    assert.equal(statSync(first.fileFor(alphaId)).mode & 0o777, 0o600);
    const again = createSelectionStore(dir);
    assert.equal(again.get(alphaId), "architect");
    again.set(alphaId, null);
    assert.equal(createSelectionStore(dir).get(alphaId), null);
    const parsed = JSON.parse(readFileSync(first.fileFor(alphaId), "utf8"));
    assert.equal(parsed.schema, SELECTION_SCHEMA);
    assert.equal(parsed.session, alphaId);
    assert.equal(parsed.workflow, null);
  }

  // ---------------------------------------------------------------- settingsFile: declared path, not execution-profiles
  {
    const policyPath = join(scratch, "execution-profiles.json");
    writeFileSync(policyPath, JSON.stringify({
      scribe: { provider: "xai-auth", model: "grok-4.6", effort: "high" },
    }));
    assert.equal(resolveScribeBinding({ executionProfilesPath: policyPath }), null);
    assert.deepEqual(
      resolveScribeBinding({ scribe: { provider: "test", model: "scribe", effort: "low" } }),
      { provider: "test", model: "scribe", effort: "low" },
    );
    const missing = createArchitectSettings({ settingsFile: join(scratch, "missing-settings.json") });
    assert.equal(missing.unbound(), true);
    assert.equal(missing.get("scribe"), null);
    assert.match(formatSettingsList("architect", missing.list()), /unbound/);
    const relative = createArchitectSettings({ settingsFile: "relative.json" });
    assert.equal(relative.unbound(), true);
    const settingsPath = join(scratch, "architect-settings.json");
    const settings = createArchitectSettings({ settingsFile: settingsPath });
    assert.equal(settings.unbound(), true);
    settings.write("scribe", { provider: "test", model: "scribe", effort: "low" });
    assert.equal(existsSync(policyPath), true);
    assert.equal(JSON.parse(readFileSync(policyPath, "utf8")).scribe.model, "grok-4.6");
    assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
    const loaded = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(loaded.schema, ARCHITECT_SETTINGS_SCHEMA);
    assert.deepEqual(loaded.roles.scribe, { provider: "test", model: "scribe", effort: "low" });
    assert.deepEqual(settings.get("scribe"), { provider: "test", model: "scribe", effort: "low" });
    assert.deepEqual(resolveScribeBinding({ settings }), settings.get("scribe"));
    assert.match(formatSettingsList("architect", settings.list()), /scribe: test scribe low/);
  }

  // ---------------------------------------------------------------- command parse
  {
    assert.deepEqual(parseWorkflowsInput(""), { action: "list" });
    assert.deepEqual(parseWorkflowsInput("architect"), { action: "select", workflow: "architect" });
    assert.deepEqual(parseWorkflowsInput("iterate"), { action: "select", workflow: "iterate" });
    assert.deepEqual(parseWorkflowsInput("none"), { action: "clear" });
    assert.deepEqual(parseWorkflowsInput("off"), { action: "clear" });
    assert.deepEqual(parseWorkflowsInput("settings"), { action: "settings-list", workflow: null });
    assert.deepEqual(parseWorkflowsInput("settings architect"), { action: "settings-list", workflow: "architect" });
    assert.deepEqual(
      parseWorkflowsInput("settings architect scribe test-provider test-model low"),
      {
        action: "settings-write",
        workflow: "architect",
        role: "scribe",
        binding: { provider: "test-provider", model: "test-model", effort: "low" },
      },
    );
    assert.equal(parseWorkflowsInput("mystery extra").action, "error");
    assert.match(formatWorkflowList(["architect"], null), /none selected/);
    assert.match(formatWorkflowList(["architect"], "architect"), /architect \(selected\)/);
  }

  // ---------------------------------------------------------------- one-shot hop lives on qq; workflows do not copy it
  {
    const seen = [];
    const text = await oneShot({
      async *stream(options) {
        seen.push(options);
        yield { type: "text-delta", index: 0, text: "note" };
      },
    }, { provider: "test", model: "scribe", effort: "low" }, { system: "sys", user: "hi" });
    assert.equal(text, "note");
    assert.equal("cacheRetention" in seen[0], false);
    assert.equal(seen[0].provider, "test");
    assert.match(seen[0].sessionId, /^session-/);
    const empty = await oneShot({}, { provider: "test", model: "scribe" }, { user: "hi" });
    assert.equal(empty, "");
    const unbound = await oneShot({ async *stream() { yield { type: "text-delta", text: "no" }; } }, null, { user: "hi" });
    assert.equal(unbound, "");
    const clerkSource = readFileSync(join(root, "qq-workflows/src/clerk.mjs"), "utf8");
    const iterateSource = readFileSync(join(root, "qq-workflows/src/iterate.mjs"), "utf8");
    const scribeSource = readFileSync(join(root, "qq-workflows/src/scribe.mjs"), "utf8");
    assert.match(clerkSource, /from "\.\.\/\.\.\/qq\/src\/ask\.mjs"/);
    assert.match(iterateSource, /from "\.\.\/\.\.\/qq\/src\/ask\.mjs"/);
    assert.doesNotMatch(iterateSource, /runScribe|from "\.\/scribe\.mjs"/);
    assert.doesNotMatch(scribeSource, /llm\.stream|runScribe|randomUUID/);
  }

  // ---------------------------------------------------------------- plugin apply: default none; select attaches
  {
    const dir = join(scratch, "plugin-apply");
    const selectedDir = join(scratch, "plugin-apply-selected");
    const registered = [];
    const hung = [];
    const cleared = [];
    const commands = [];
    const agents = new Map();
    const fakeAgent = {
      id: alphaId,
      options: { provider: "qwen-token-plan", model: "deepseek-v4-pro-0813" },
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: {
        on() { return () => {}; },
        get(name) {
          if (name === "tools") {
            return {
              register(definition) {
                registered.push(definition);
                return () => {
                  const index = registered.indexOf(definition);
                  if (index >= 0) registered.splice(index, 1);
                };
              },
            };
          }
          return undefined;
        },
      },
    };
    agents.set(alphaId, fakeAgent);
    const created = [];
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
        if (name === "commands") {
          return {
            register(definition) {
              commands.push(definition);
              return () => {};
            },
          };
        }
        if (name === "qq-relay") {
          return {
            hang(id, label) { hung.push({ id, label }); },
            clear(id, label) { cleared.push({ id, label }); },
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
      selectionDir: selectedDir,
      scribe: { provider: "test", model: "scribe" },
      runScribe: async () => "start from the architect stitch",
    });

    const service = provided["qq-workflows"];
    assert.ok(service);
    assert.equal(existsSync(join(dir, `${alphaId}.json`)), false);
    assert.deepEqual(registered.map((tool) => tool.name), []);
    assert.deepEqual(hung, []);
    assert.equal(service.workflows.selected(alphaId), null);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].name, "workflows");

    const listed = commands[0].handler({ agent: fakeAgent, rawInput: "" });
    assert.equal(listed.kind, "success");
    assert.match(listed.text, /architect/);
    assert.match(listed.text, /iterate/);
    assert.match(listed.text, /none selected/);

    const unknown = commands[0].handler({ agent: fakeAgent, rawInput: "mystery" });
    assert.equal(unknown.kind, "error");
    assert.match(unknown.text, /unknown workflow/);

    const selected = commands[0].handler({ agent: fakeAgent, rawInput: "architect" });
    assert.equal(selected.kind, "success");
    assert.equal(service.workflows.selected(alphaId), "architect");
    assert.ok(existsSync(join(dir, `${alphaId}.json`)));
    assert.deepEqual(registered.map((tool) => tool.name), [
      "notes_list", "notes_expand", "session_search", "invoke",
    ]);
    assert.deepEqual(hung, [{ id: alphaId, label: ARCHITECT_LABEL }]);

    const [listTool, expandTool, searchTool, invokeTool] = registered;
    const notes = await listTool.execute({}, { agent: fakeAgent });
    assert.equal(notes.status, "ok");
    assert.match(listTool.output.render({}, notes)[0].text, /card concern/);

    service.store.appendNote(alphaId, { text: "cited", startSeq: 5, endSeq: 8 });
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

    const clearedSelection = commands[0].handler({ agent: fakeAgent, rawInput: "none" });
    assert.equal(clearedSelection.kind, "success");
    assert.equal(service.workflows.selected(alphaId), null);
    assert.deepEqual(registered, []);
    assert.deepEqual(cleared, [{ id: alphaId, label: ARCHITECT_LABEL }]);
    assert.ok(service.architect.attached(alphaId) == null);
  }

  // invoke tool refuses when relay is absent
  {
    const dir = join(scratch, "plugin-no-relay");
    const selectedDir = join(scratch, "plugin-no-relay-selected");
    const registered = [];
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
      ctx: {
        on() { return () => {}; },
        get(name) {
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
      },
    };
    const provided = {};
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        if (name === "sessions") return {};
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    provided["qq-workflows"].workflows.select(alphaId, "architect");
    const invokeTool = registered.find((tool) => tool.name === "invoke");
    const refused = await invokeTool.execute({}, { agent: fakeAgent });
    assert.equal(refused.status, "refused");
    assert.match(refused.reason, /qq-relay/);
  }

  // apply without tools: service still loads; boot does not hang
  {
    const dir = join(scratch, "plugin-no-tools");
    const selectedDir = join(scratch, "plugin-no-tools-selected");
    const provided = {};
    const hung = [];
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
      ctx: { on() { return () => {}; } },
    };
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        if (name === "qq-relay") {
          return { hang(id, label) { hung.push({ id, label }); }, clear() {}, alias: () => "1" };
        }
        return undefined;
      },
      provide(name, value) { provided[name] = value; },
      effect() { throw new Error("tools effect must not run without tools"); },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    assert.ok(provided["qq-workflows"]);
    assert.deepEqual(hung, []);
    provided["qq-workflows"].workflows.select(alphaId, "architect");
    assert.deepEqual(hung, [{ id: alphaId, label: ARCHITECT_LABEL }]);
  }

  // tools stay off the host tools service until a session is selected
  {
    const dir = join(scratch, "plugin-tools-later");
    const selectedDir = join(scratch, "plugin-tools-later-selected");
    const registered = [];
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [] };
        if (name === "tools") {
          return {
            register() { throw new Error("host tools must not receive architect tools"); },
          };
        }
        return undefined;
      },
      provide() {},
      inject(deps, callback) {
        if (deps.includes("tools")) throw new Error("plugin must not inject tools globally");
        if (deps.includes("commands")) callback({ get() { return undefined; }, effect() { return () => {}; } });
      },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    assert.deepEqual(registered, []);
  }

  // settings write goes to settingsFile, not execution-profiles
  {
    const dir = join(scratch, "plugin-settings");
    const selectedDir = join(scratch, "plugin-settings-selected");
    const settingsPath = join(scratch, "plugin-settings.json");
    const policyPath = join(scratch, "plugin-execution-profiles.json");
    writeFileSync(policyPath, JSON.stringify({ scribe: { provider: "keep", model: "me" } }));
    const provided = {};
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
      ctx: { on() { return () => {}; } },
    };
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir, settingsFile: settingsPath });
    const result = provided["qq-workflows"].handleWorkflows({
      agent: fakeAgent,
      rawInput: "settings architect scribe test-provider test-model low",
    });
    assert.equal(result.kind, "success");
    assert.match(result.text, /scribe: test-provider test-model low/);
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")).roles.scribe, {
      provider: "test-provider", model: "test-model", effort: "low",
    });
    assert.deepEqual(JSON.parse(readFileSync(policyPath, "utf8")), {
      scribe: { provider: "keep", model: "me" },
    });
    const missing = createArchitectSettings({});
    assert.equal(missing.unbound(), true);
  }

  // prune at agent/request, never from tool/result (reentrant append)
  {
    const store = createNotebookStore(join(scratch, "prune"));
    store.ensure(alphaId);
    const pruned = [];
    const appended = [];
    const listeners = [];
    const session = {
      id: alphaId,
      events: [],
      append(type, data, opts) { appended.push({ type, data, opts }); },
    };
    const agent = {
      session,
      options: {},
      ctx: {
        on(type, fn) {
          listeners.push({ type, fn });
          return () => {};
        },
      },
    };
    const architect = createArchitect({
      ctx: {
        get(name) {
          if (name === "toolResultPruner") {
            return {
              pruneSession(target) {
                pruned.push(target);
                target.append("tool/result", { pruned: true }, { surfaceOp: { op: "replace", start: 1, end: 1 } });
                return { pruned: [1], charsRemoved: 100 };
              },
            };
          }
          return null;
        },
      },
      store,
      clerk: { fire: async () => ({ action: "nothing" }) },
      folder: {
        pending: () => undefined,
        decide: () => ({ action: "keep" }),
        apply: () => null,
        clear: () => {},
      },
    });
    architect.attach(agent);
    const eventObs = listeners.find((item) => item.type === "session/event");
    const requestObs = listeners.find((item) => item.type === "agent/request");
    assert.ok(requestObs);
    eventObs.fn(session, { type: "tool/result" });
    assert.equal(pruned.length, 0);
    await requestObs.fn({}, async () => "ok");
    assert.equal(pruned.length, 1);
    assert.equal(appended[0].type, "tool/result");
  }

  // hangLabel failure is visible
  {
    const store = createNotebookStore(join(scratch, "hang-fail"));
    const warnings = [];
    const architect = createArchitect({
      ctx: {
        logger: { warn(message) { warnings.push(message); } },
        get(name) {
          if (name === "qq-relay") {
            return {
              hang() { throw new Error("label board refused"); },
              clear() {},
            };
          }
          return null;
        },
      },
      store,
      clerk: { fire: async () => ({ action: "nothing" }) },
      folder: { pending: () => undefined, decide: () => ({ action: "keep" }) },
    });
    architect.attach({
      session: { id: alphaId, events: [], header: {} },
      ctx: { on() { return () => {}; } },
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /failed to hang workflows:architect/);
    assert.match(warnings[0], /label board refused/);
  }

  // compilePacket carries the parent return address
  {
    const store = createNotebookStore(join(scratch, "packet-address"));
    store.ensure(alphaId);
    const seen = [];
    const clerk = createClerk({
      store,
      llm: {},
      binding: { provider: "test", model: "scribe" },
      run: async (_llm, _binding, request) => {
        seen.push(request);
        return "packet";
      },
    });
    const packet = await clerk.compilePacket({
      sessionId: alphaId,
      events: pairEvents(1, 0, "go", "ok"),
      parentSession: alphaId,
      parentAlias: "1",
    });
    assert.equal(packet, "packet");
    assert.match(seen[0].user, /Return address: session .* \(alias 1\)/);
    assert.match(seen[0].system, /return address/i);
  }

  // child cannot be selected as architect; restart restores membership
  {
    const dir = join(scratch, "plugin-child");
    const selectedDir = join(scratch, "plugin-child-selected");
    const hung = [];
    const child = {
      id: childId,
      session: { id: childId, events: [], header: { origin: CHILD_ORIGIN } },
      ctx: { on() { return () => {}; } },
    };
    const chair = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
      ctx: { on() { return () => {}; } },
    };
    const provided = {};
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [child], get: (id) => (id === childId ? child : null) };
        if (name === "qq-relay") {
          return { hang(id, label) { hung.push({ id, label }); }, clear() {}, alias: () => "1" };
        }
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    const refused = provided["qq-workflows"].handleWorkflows({
      agent: child,
      rawInput: "architect",
    });
    assert.equal(refused.kind, "error");
    assert.match(refused.text, /child session/);
    assert.deepEqual(hung, []);

    createSelectionStore(selectedDir).set(alphaId, "architect");
    const again = {};
    const hungAgain = [];
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [chair], get: (id) => (id === alphaId ? chair : null) };
        if (name === "qq-relay") {
          return { hang(id, label) { hungAgain.push({ id, label }); }, clear() {}, alias: () => "1" };
        }
        return again[name];
      },
      provide(name, value) { again[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    assert.equal(again["qq-workflows"].workflows.selected(alphaId), "architect");
    assert.deepEqual(hungAgain, [{ id: alphaId, label: ARCHITECT_LABEL }]);
    assert.ok(existsSync(join(dir, `${alphaId}.json`)));
  }

  // ---------------------------------------------------------------- iterate: journal append / polarity / persist / restart
  {
    const dir = join(scratch, "iterate-journal");
    const first = createJournalStore(dir);
    first.recordDirective(alphaId, { text: "land the frontend iterate", seq: 2 });
    first.recordNote(alphaId, { polarity: "nit", text: "the bar is too big", seq: 4 });
    first.recordNote(alphaId, { polarity: "praise", text: "oh that is better", seq: 5 });
    const loaded = first.load(alphaId);
    assert.equal(loaded.schema, JOURNAL_SCHEMA);
    assert.equal(loaded.session, alphaId);
    assert.equal(loaded.entries.length, 3);
    assert.equal(statSync(first.fileFor(alphaId)).mode & 0o777, 0o600);
    const again = createJournalStore(dir);
    const projected = again.project(alphaId);
    assert.equal(projected.directive.text, "land the frontend iterate");
    assert.equal(projected.theory, null);
    assert.equal(projected.nits.length, 1);
    assert.equal(projected.nits[0].open, true);
    assert.equal(projected.nits[0].breath, 1);
    assert.equal(projected.praise.length, 1);
    assert.equal(projected.praise[0].text, "oh that is better");
    again.recordTheory(alphaId, { text: "the pile wants less chrome", seq: 6 });
    const withTheory = again.project(alphaId);
    assert.equal(withTheory.theory.text, "the pile wants less chrome");
  }

  assert.equal(
    defaultJournalDir({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-workflows-journals",
  );
  assert.equal(defaultJournalDir({}, { journalDir: "/x/journals" }), "/x/journals");
  assert.throws(() => defaultJournalDir({}, { journalDir: "relative" }), /absolute path/);
  assert.equal(
    defaultWikiDir({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-workflows-wiki",
  );
  assert.equal(defaultWikiDir({}, { wikiDir: "/x/wiki" }), "/x/wiki");
  assert.throws(() => defaultWikiDir({}, { wikiDir: "relative" }), /absolute path/);

  // ---------------------------------------------------------------- iterate: stable projection order + collect-then-go
  {
    const journal = createJournalStore(join(scratch, "iter-order"));
    journal.recordDirective(alphaId, { text: "d", seq: 1 });
    journal.recordTheory(alphaId, { text: "t", seq: 2 });
    journal.recordNote(alphaId, { polarity: "nit", text: "n", seq: 3 });
    journal.recordNote(alphaId, { polarity: "praise", text: "p", seq: 4 });
    const projection = collectBreath(journal.load(alphaId));
    assert.equal(projection.breath, 1);
    assert.equal(projection.nits.length, 1);
    assert.equal(projection.praise.length, 1);
    // Nothing sends before go: collect is read-only.
    assert.equal(journal.project(alphaId).breath, 1);
    assert.deepEqual(journal.project(alphaId).sent, new Set());
    const text = formatProjection(journal.load(alphaId), []);
    const order = ["directive:", "theory:", "open nits:", "praise:", "wiki:"];
    let cursor = 0;
    for (const marker of order) {
      const at = text.indexOf(marker);
      assert.ok(at >= cursor, `projection ${marker} must appear after ${cursor}`);
      cursor = at;
    }
  }

  // ---------------------------------------------------------------- iterate: go refuses without relay / live session / reviewer
  {
    const journal = createJournalStore(join(scratch, "iter-go-refuse"));
    const wiki = createWikiStore(join(scratch, "iter-go-refuse-wiki"));
    journal.recordNote(alphaId, { polarity: "nit", text: "rail too wide", seq: 1 });
    const parentAgent = {
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: { on() { return () => {}; } },
    };
    const noRelay = createIterate({
      ctx: { get: () => null },
      journal,
      wiki,
      settings: { get: () => ({ provider: "t", model: "m" }) },
      agents: { create: async () => { throw new Error("must not create"); } },
    });
    noRelay.attach(parentAgent);
    const noRelayResult = await noRelay.go({ agent: parentAgent });
    assert.equal(noRelayResult.status, "refused");
    assert.match(noRelayResult.reason, /qq-relay/);
    assert.deepEqual(journal.project(alphaId).sent, new Set());

    const relayWithReviewer = createIterate({
      journal,
      wiki,
      ctx: {
        get(name) {
          if (name === "qq-relay") return { alias: () => "1", hang() {}, clear() {} };
          return null;
        },
      },
      settings: { get: () => null },
      agents: { create: async () => { throw new Error("must not create"); } },
    });
    relayWithReviewer.attach(parentAgent);
    const unbound = await relayWithReviewer.go({ agent: parentAgent });
    assert.equal(unbound.status, "refused");
    assert.match(unbound.reason, /reviewer role/);

    const praiseOnlyJournal = createJournalStore(join(scratch, "iter-go-praise"));
    praiseOnlyJournal.recordNote(alphaId, { polarity: "praise", text: "keep the cards full width", seq: 1 });
    const praiseOnly = createIterate({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: () => "1",
              hang() {},
              clear() {},
              send: async () => ({ status: "sent" }),
            };
          }
          return null;
        },
      },
      journal: praiseOnlyJournal,
      wiki: createWikiStore(join(scratch, "iter-go-praise-wiki")),
      settings: { get: () => ({ provider: "t", model: "m" }) },
      agents: { create: async () => { throw new Error("must not create"); } },
    });
    praiseOnly.attach(parentAgent);
    const invented = await praiseOnly.go({ agent: parentAgent });
    assert.equal(invented.status, "refused");
    assert.match(invented.reason, /praise-only/);
  }

  // ---------------------------------------------------------------- iterate: go bundles this breath, one live hands, review pass/fail
  {
    const journalDir = join(scratch, "iter-go");
    const wikiDir = join(scratch, "iter-go-wiki");
    const journal = createJournalStore(journalDir);
    const wiki = createWikiStore(wikiDir);
    journal.recordDirective(alphaId, { text: "land the frontend iterate", seq: 1 });
    journal.recordNote(alphaId, { polarity: "nit", text: "left rail too wide", seq: 2 });
    journal.recordNote(alphaId, { polarity: "praise", text: "44px send button stays", seq: 3 });
    wiki.dump(alphaId, { text: "#composer sits on the safe-area edge", seq: 4 });
    wiki.file(alphaId, { target: "w1", labels: ["composer"], seq: 5 });
    journal.selectWiki(alphaId, { ids: ["w1"], seq: 6 });

    const created = [];
    const followups = [];
    const sent = [];
    const registeredHands = [];
    const childListeners = [];
    const childEvents = [];
    const verdicts = [];

    const iterate = createIterate({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: (id) => (id === alphaId ? "1" : "80"),
              hang() {},
              clear() {},
              send: async (payload) => {
                sent.push(payload);
                return { status: "sent" };
              },
            };
          }
          return null;
        },
      },
      journal,
      wiki,
      settings: {
        get: (role) => (role === "hands"
          ? { provider: "test-hands", model: "hands-model", effort: "low" }
          : { provider: "test-review", model: "review-model" }),
      },
      agents: {
        create: async (options) => {
          created.push(options);
          return {
            agent: {
              session: { id: options.sessionId, events: childEvents },
              followup(message) { followups.push(message); },
              ctx: {
                on(type, fn) { childListeners.push({ type, fn }); return () => {}; },
                get(name) {
                  if (name === "tools") {
                    return {
                      register(definition) {
                        registeredHands.push(definition);
                        return () => {};
                      },
                    };
                  }
                  return undefined;
                },
              },
            },
          };
        },
      },
      run: async (_llm, _binding, request) => {
        verdicts.push(request);
        return "PASS";
      },
      registerHandsTools: (child, queue) => {
        for (const definition of buildHandsTools({
          onDump: ({ text }) => queue.push(text),
        })) {
          child.ctx.get("tools").register(definition);
        }
      },
    });
    const parentAgent = {
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: { on() { return () => {}; } },
    };
    iterate.attach(parentAgent);

    const first = await iterate.go({ agent: parentAgent });
    assert.equal(first.status, "ok");
    assert.equal(first.alias, "80");
    assert.equal(first.breath, 1);
    assert.equal(created.length, 1);
    assert.equal(created[0].meta.origin, CHILD_ORIGIN);
    assert.equal(created[0].meta.parentSession, alphaId);
    assert.equal(created[0].agentOptions.provider, "test-hands");
    const childId = created[0].sessionId;
    assert.ok(journal.project(alphaId).sent.has("n1"));
    assert.equal(followups.length, 1);
    const packet = followups[0].content[0].text;
    assert.match(packet, /left rail too wide/);
    assert.match(packet, /44px send button stays/);
    assert.match(packet, /Keep-outs/);
    assert.match(packet, /selector|#composer/);
    assert.match(packet, /console\.css/);
    assert.match(packet, /Return address: session .* \(alias 1\)/);
    assert.deepEqual(registeredHands.map((tool) => tool.name).sort(), [...HANDS_TOOL_NAMES].sort());

    // one live hands at a time
    const second = await iterate.go({ agent: parentAgent });
    assert.equal(second.status, "refused");
    assert.match(second.reason, /one live hands/);

    // hands dump nodes while working
    const dumpTool = registeredHands.find((tool) => tool.name === "wiki_dump");
    const dumped = await dumpTool.execute(
      { text: "composer min-height hint: 44px on phone" },
      { agent: { session: { id: childId } } },
    );
    assert.equal(dumped.status, "ok");

    // child delivers; reviewer passes; nits close; wiki node stays unlabeled until desk files
    childEvents.push(event("assistant/message", 2, {
      turn: 1, step: 1, message: assistantMessage("narrowed the left rail"),
    }, { surfaceOp: "append" }));
    const childEvent = childListeners.find((item) => item.type === "session/event");
    assert.ok(childEvent);
    await childEvent.fn({}, { type: "turn/end", seq: 3, data: { turn: 1 } });
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /passed review/);
    assert.match(sent[0].message, /Wiki nodes to file: w2/);
    assert.equal(verdicts.length, 1);
    assert.match(verdicts[0].user, /left rail too wide/);
    assert.match(verdicts[0].user, /Keep-outs/);
    assert.match(verdicts[0].user, /Shots from the design loop/);
    assert.match(verdicts[0].user, /Patch-surface diff:/);
    const afterPass = journal.project(alphaId);
    assert.equal(afterPass.nits[0].open, false);
    const wikiAfter = wiki.project(alphaId);
    assert.ok(wikiAfter.nodes.some((node) => node.id === "w2" && node.labels.length === 0));

    // next go is a new child, not a continuation
    journal.recordNote(alphaId, { polarity: "nit", text: "heading too tall", seq: 7 });
    const third = await iterate.go({ agent: parentAgent });
    assert.equal(third.status, "ok");
    assert.equal(created.length, 2);
    assert.notEqual(created[1].sessionId, created[0].sessionId);

    // fail sits; no close, no dump, no silent retry
    const verdictsFail = [];
    childEvents.length = 0;
    sent.length = 0;
    const failing = createIterate({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: () => "1",
              hang() {},
              clear() {},
              send: async (payload) => { sent.push(payload); return { status: "sent" }; },
            };
          }
          return null;
        },
      },
      journal,
      wiki,
      settings: { get: () => ({ provider: "test-review", model: "review-model" }) },
      agents: {
        create: async (options) => ({
          agent: {
            session: { id: options.sessionId, events: childEvents },
            followup() {},
            ctx: {
              on(type, fn) { childListeners.push({ type, fn }); return () => {}; },
            },
          },
        }),
      },
      run: async (_llm, _binding, request) => {
        verdictsFail.push(request);
        return "FAIL: heading looks worse";
      },
      registerHandsTools: () => {},
    });
    failing.attach(parentAgent);
    journal.recordNote(alphaId, { polarity: "nit", text: "heading too tall again", seq: 9 });
    const failGo = await failing.go({ agent: parentAgent });
    assert.equal(failGo.status, "ok");
    childEvents.push(event("assistant/message", 2, {
      turn: 1, step: 1, message: assistantMessage("made the heading bigger"),
    }, { surfaceOp: "append" }));
    await childListeners.at(-1).fn({}, { type: "turn/end", seq: 3, data: { turn: 1 } });
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /failed review: heading looks worse/);
    const afterFail = journal.project(alphaId);
    const heading = afterFail.nits.find((note) => note.text === "heading too tall again");
    assert.equal(heading.open, true);
    assert.equal(verdictsFail.length, 1);
  }

  // ---------------------------------------------------------------- iterate: reviewer falls back to the one-shot llm stream
  {
    const journal = createJournalStore(join(scratch, "iter-go-review-hop"));
    const wiki = createWikiStore(join(scratch, "iter-go-review-hop-wiki"));
    journal.recordNote(alphaId, { polarity: "nit", text: "form is cramped", seq: 1 });
    const sent = [];
    const requests = [];
    const childEvents = [];
    const childListeners = [];
    const iterate = createIterate({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return {
              alias: () => "1",
              hang() {},
              clear() {},
              send: async (payload) => { sent.push(payload); return { status: "sent" }; },
            };
          }
          return null;
        },
      },
      journal,
      wiki,
      settings: { get: () => ({ provider: "test-review", model: "review-model" }) },
      llm: {
        async *stream(request) {
          requests.push(request);
          yield { type: "text-delta", text: "PASS" };
        },
      },
      agents: {
        create: async (options) => ({
          agent: {
            session: { id: options.sessionId, events: childEvents },
            followup() {},
            ctx: {
              on(type, fn) { childListeners.push({ type, fn }); return () => {}; },
            },
          },
        }),
      },
      // No `run` injected: iterate must use the qq one-shot hop on llm.stream.
      registerHandsTools: () => {},
    });
    const parentAgent = {
      session: { id: alphaId, events: [], header: { cwd: root } },
      ctx: { on() { return () => {}; } },
    };
    iterate.attach(parentAgent);
    const result = await iterate.go({ agent: parentAgent });
    assert.equal(result.status, "ok");
    childEvents.push(event("assistant/message", 2, {
      turn: 1, step: 1, message: assistantMessage("widened the form"),
    }, { surfaceOp: "append" }));
    await childListeners.at(-1).fn({}, { type: "turn/end", seq: 3, data: { turn: 1 } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].provider, "test-review");
    assert.match(requests[0].system, /honors the directive/);
    assert.match(requests[0].system, /shots listing and the patch-surface diff/);
    const reviewUser = requests[0].messages?.[0]?.content?.[0]?.text ?? "";
    assert.match(reviewUser, /form is cramped/);
    assert.match(reviewUser, /Shots from the design loop/);
    assert.match(reviewUser, /Patch-surface diff:/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /passed review/);
    assert.equal(journal.project(alphaId).nits[0].open, false);
  }

  // ---------------------------------------------------------------- iterate: reviewer prompt carries shots listing + patch-surface diff
  {
    const env = { HOME: scratch, XDG_STATE_HOME: join(scratch, "review-shots-state") };
    const shots = join(env.XDG_STATE_HOME, "qq", "frontend-design-loop", "shots", "current");
    mkdirSync(shots, { recursive: true });
    writeFileSync(join(shots, "desktop.png"), "png");
    writeFileSync(join(shots, "phone.png"), "xx");
    const evidence = collectReviewEvidence({ cwd: root, env });
    assert.match(evidence, /current\/desktop\.png \(3 bytes\)/);
    assert.match(evidence, /current\/phone\.png \(2 bytes\)/);
    assert.match(evidence, /Patch-surface diff:/);
    assert.doesNotMatch(evidence, /live under /);
  }

  // ---------------------------------------------------------------- iterate: fixture-backed hands path can start and stop the design loop
  {
    const isolated = mkdtempSync(join(tmpdir(), "qq-workflows-hands-loop."));
    const env = { HOME: isolated, XDG_STATE_HOME: join(isolated, "state") };
    const designLoop = await import(pathToFileURL(join(root, "bin/lib/frontend-design-loop.mjs")));
    const tools = buildHandsTools({
      designLoop: {
        startFixture: (options) => designLoop.startFixture({ ...options, env, timeoutMs: 8_000 }),
        stopLoop: (options) => designLoop.stopLoop({
          ...options,
          env,
          exec: async () => ({ code: 1, stdout: "", stderr: "absent" }),
        }),
      },
    });
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const exec = { agent: { session: { header: { cwd: root } } } };
    try {
      const started = await byName.design_loop_start.execute({ live: false }, exec);
      assert.equal(started.status, "ok");
      assert.match(started.message, /Design-loop fixture listening at http:\/\/127\.0\.0\.1:\d+/);
      assert.match(started.result.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.match(started.result.sessionUrl, /\/qq\/session\//);
      const probe = await fetch(`${started.result.origin}/qq/assets/console-v13.css`);
      assert.equal(probe.status, 200);
      const stopped = await byName.design_loop_stop.execute({}, exec);
      assert.equal(stopped.status, "ok");
      assert.match(stopped.message, /Design-loop stopped/);
      assert.equal(stopped.result.fixture, "signaled");
    } finally {
      try { await designLoop.stopLoop({ env }); } catch {}
      rmSync(isolated, { recursive: true, force: true });
    }
  }

  // ---------------------------------------------------------------- iterate: wiki nodes stay unlabeled until desk files; selected nodes only
  {
    const wiki = createWikiStore(join(scratch, "iter-wiki"));
    wiki.ensure(alphaId);
    wiki.dump(alphaId, { text: "a", seq: 1 });
    wiki.dump(alphaId, { text: "b", seq: 2 });
    const before = wiki.project(alphaId);
    assert.equal(before.unlabeled.length, 2);
    assert.deepEqual(before.nodes[0].labels, []);
    assert.equal(before.nodes[0].unlabeled, true);
    const index = wiki.index(alphaId);
    assert.deepEqual(index.map((node) => node.unlabeled), [true, true]);
    wiki.file(alphaId, { target: "w1", labels: ["composer"], seq: 3 });
    const after = wiki.project(alphaId);
    assert.equal(after.nodes.find((node) => node.id === "w1").labels[0], "composer");
    assert.equal(after.nodes.find((node) => node.id === "w1").unlabeled, false);
    assert.equal(after.nodes.find((node) => node.id === "w2").unlabeled, true);
    const selected = wiki.selected(alphaId, ["w1"]);
    assert.deepEqual(selected.map((node) => node.id), ["w1"]);
    assert.equal(formatWikiIndex(wiki.load(alphaId))[0].labels[0], "composer");
    const persisted = JSON.parse(readFileSync(wiki.fileFor(alphaId), "utf8"));
    assert.equal(persisted.schema, WIKI_SCHEMA);
    assert.equal(statSync(wiki.fileFor(alphaId)).mode & 0o777, 0o600);
  }

  // ---------------------------------------------------------------- iterate: isIterateCandidate + buildHandsPacket rules
  {
    assert.equal(isIterateCandidate({ session: { id: alphaId, header: {} } }), true);
    assert.equal(isIterateCandidate({
      session: { id: childId, header: { origin: CHILD_ORIGIN } },
    }), false);
    const packet = buildHandsPacket({
      bundle: {
        directive: { text: "d" },
        praise: [{ text: "keep composer edge" }],
        nits: [{ id: "n1", seq: 2, text: "shrink rail" }],
        wikiNodes: [{ id: "w1", labels: ["composer"], text: "safe-area" }],
        theory: { text: "t" },
      },
      cwd: "/work",
      parentSession: alphaId,
      parentAlias: "1",
    });
    assert.match(packet, /Directive/);
    assert.match(packet, /Theory/);
    assert.match(packet, /Keep-outs/);
    assert.match(packet, /shrink rail/);
    assert.match(packet, /safe-area/);
    assert.match(packet, /render\.mjs/);
    assert.match(packet, /Do not touch SSE owner/);
    assert.match(packet, /one inner cycle/);
    assert.match(packet, /alias 1/);
  }

  // ---------------------------------------------------------------- iterate: desk tools register; pixel tools do not
  {
    const dir = join(scratch, "plugin-iterate");
    const selectedDir = join(scratch, "plugin-iterate-selected");
    const journalDir = join(scratch, "plugin-iterate-journal");
    const wikiDir = join(scratch, "plugin-iterate-wiki");
    const registered = [];
    const hung = [];
    const cleared = [];
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: {
        on() { return () => {}; },
        get(name) {
          if (name === "tools") {
            return {
              register(definition) {
                registered.push(definition);
                return () => {
                  const index = registered.indexOf(definition);
                  if (index >= 0) registered.splice(index, 1);
                };
              },
            };
          }
          return undefined;
        },
      },
    };
    const provided = {};
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        if (name === "sessions") return {};
        if (name === "qq-relay") {
          return { hang(id, label) { hung.push({ id, label }); }, clear(id, label) { cleared.push({ id, label }); } };
        }
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir, journalDir, wikiDir });
    const service = provided["qq-workflows"];
    service.workflows.select(alphaId, "iterate");
    assert.deepEqual(hung, [{ id: alphaId, label: ITERATE_LABEL }]);
    const names = registered.map((tool) => tool.name);
    assert.deepEqual([...names].sort(), [...DESK_TOOL_NAMES].sort());
    for (const pixel of PIXEL_TOOL_NAMES) {
      assert.ok(!names.includes(pixel), `pixel tool ${pixel} must not register on the desk`);
    }
    const journalFile = join(journalDir, `${alphaId}.json`);
    const wikiFile = join(wikiDir, `${alphaId}.json`);
    assert.ok(existsSync(journalFile));
    assert.ok(existsSync(wikiFile));
    const goTool = registered.find((tool) => tool.name === "go");
    const refused = await goTool.execute({}, { agent: fakeAgent });
    assert.equal(refused.status, "refused");
    assert.match(refused.reason, /reviewer role/);
    service.workflows.clear(alphaId);
    assert.deepEqual(cleared, [{ id: alphaId, label: ITERATE_LABEL }]);
    assert.deepEqual(registered, []);
  }

  // ---------------------------------------------------------------- iterate: child cannot select iterate; restart restores membership
  {
    const dir = join(scratch, "plugin-iterate-child");
    const selectedDir = join(scratch, "plugin-iterate-child-selected");
    const hung = [];
    const child = {
      id: childId,
      session: { id: childId, events: [], header: { origin: CHILD_ORIGIN } },
      ctx: { on() { return () => {}; } },
    };
    const provided = {};
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [child], get: () => child };
        if (name === "qq-relay") {
          return { hang(id, label) { hung.push({ id, label }); }, clear() {} };
        }
        return provided[name];
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    const refused = provided["qq-workflows"].handleWorkflows({
      agent: child,
      rawInput: "iterate",
    });
    assert.equal(refused.kind, "error");
    assert.match(refused.text, /child session/);
    assert.deepEqual(hung, []);

    const chair = {
      id: alphaId,
      session: { id: alphaId, events: [], header: {} },
      ctx: { on() { return () => {}; } },
    };
    createSelectionStore(selectedDir).set(alphaId, "iterate");
    const again = {};
    const hungAgain = [];
    pluginModule.apply({
      get(name) {
        if (name === "agents") return { list: () => [chair], get: () => chair };
        if (name === "qq-relay") {
          return { hang(id, label) { hungAgain.push({ id, label }); }, clear() {} };
        }
        return again[name];
      },
      provide(name, value) { again[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    assert.equal(again["qq-workflows"].workflows.selected(alphaId), "iterate");
    assert.deepEqual(hungAgain, [{ id: alphaId, label: ITERATE_LABEL }]);
  }

  // ---------------------------------------------------------------- iterate: settings share settingsFile with architect
  {
    const settingsPath = join(scratch, "iterate-settings.json");
    const architect = createArchitectSettings({ settingsFile: settingsPath });
    architect.write("scribe", { provider: "test", model: "scribe" });
    const iterate = createIterateSettings({ settingsFile: settingsPath });
    assert.equal(iterate.unbound(), false);
    assert.equal(iterate.get("desk"), null);
    iterate.write("desk", { provider: "test-desk", model: "desk-model" });
    iterate.write("hands", { provider: "test-hands", model: "hands-model", effort: "low" });
    assert.deepEqual(iterate.get("desk"), { provider: "test-desk", model: "desk-model" });
    // architect section survives iterate writes and vice versa
    assert.deepEqual(createArchitectSettings({ settingsFile: settingsPath }).get("scribe"), {
      provider: "test", model: "scribe",
    });
    architect.write("talking", { provider: "t", model: "talk" });
    assert.deepEqual(iterate.get("hands"), { provider: "test-hands", model: "hands-model", effort: "low" });
    const formatted = formatSettingsList("iterate", iterate.list(), ITERATE_ROLES);
    assert.match(formatted, /desk: test-desk desk-model/);
    assert.match(formatted, /hands: test-hands hands-model low/);
    assert.match(formatted, /reviewer: unbound/);
    assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
    const missing = createIterateSettings({});
    assert.equal(missing.unbound(), true);
    assert.equal(createIterateSettings({ settingsFile: "relative.json" }).unbound(), true);
  }

  // leftover offer: skip empty, silent-bank unfinished, popup for ambiguous-or-better
  {
    assert.equal(classifyLeftover({ notes: [] }), "skip");
    assert.equal(classifyLeftover({ notes: [{ text: "todo later", startSeq: 1, endSeq: 2 }] }), "bank");
    assert.equal(classifyLeftover({
      notes: [{ text: "Ship the leftover popup with three pressable choices.", startSeq: 1, endSeq: 4 }],
    }), "offer");
    assert.equal(classifyLeftover(
      { notes: [{ text: "todo later", startSeq: 1, endSeq: 2 }] },
      { asked: true },
    ), "offer");
    assert.equal(classifyLeftover({ notes: [] }, { asked: true }), "skip");
    assert.equal(askedHandoff("please hand off this leftover"), true);
    assert.equal(leftoverTitle({ name: "concern" }, "Ship the leftover popup now"), "Ship the leftover popup now");
    const split = splitOperatorBrief([
      "Compile the leftover and start run.",
      "Return address: session parent (alias 1)",
    ].join("\n"));
    assert.match(split.operatorBrief, /Compile the leftover/);
    assert.doesNotMatch(split.operatorBrief, /Return address/);
    assert.match(split.runnerBrief, /Return address/);
    assert.match(split.brief, /Compile the leftover[\s\S]*Return address/);
  }

  {
    const store = createNotebookStore(join(scratch, "offer-outcomes"));
    store.ensure(alphaId);
    const created = [];
    const followups = [];
    const compiled = [];
    const architect = createArchitect({
      ctx: {
        get(name) {
          if (name === "qq-relay") {
            return { alias: () => "1", hang() {}, clear() {}, send: async () => ({ status: "sent" }) };
          }
          return null;
        },
      },
      store,
      clerk: {
        fire: async () => ({ action: "nothing" }),
        compilePacket: async (args) => {
          compiled.push(args);
          return "Operator brief for the leftover.\nReturn address: session parent";
        },
      },
      folder: { pending: () => undefined, decide: () => ({ action: "keep" }) },
      agents: {
        create: async (options) => {
          created.push(options);
          return {
            agent: {
              session: { id: options.sessionId, events: [] },
              followup(message) { followups.push(message); },
              ctx: { on() { return () => {}; } },
            },
          };
        },
      },
      tasks: {
        create({ title, body }) {
          created.push({ title, body });
          return "7";
        },
      },
    });
    const parentAgent = {
      session: { id: alphaId, events: pairEvents(1, 0, "go", "ok"), header: { cwd: "/work" } },
      ctx: { on() { return () => {}; } },
    };
    architect.attach(parentAgent);

    store.appendNote(alphaId, { text: "todo later", startSeq: 1, endSeq: 2 });
    const silent = await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    assert.equal(silent.status, "ok");
    assert.equal(silent.silent, true);
    assert.equal(silent.action, "bank");
    assert.equal(silent.id, "7");
    assert.equal(architect.offer(alphaId), null);
    assert.equal(compiled.length, 0);

    store.appendNote(alphaId, {
      text: "Ship the leftover popup with three pressable choices.",
      startSeq: 3,
      endSeq: 6,
    });
    const offered = await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    assert.equal(offered.title, "Ship the leftover popup with three pressable choices.");
    const face = architect.offer(alphaId);
    assert.match(face.brief, /Operator brief for the leftover/);
    assert.doesNotMatch(face.brief, /Return address/);
    assert.match(face.runnerBrief, /Return address/);
    assert.deepEqual(face.choices, ["handoff", "bank", "ignore"]);
    assert.equal(compiled.length, 1);

    const ignored = await architect.choose(alphaId, { choice: "ignore" });
    assert.equal(ignored.status, "ok");
    assert.equal(ignored.action, "ignore");
    assert.equal(architect.offer(alphaId), null);
    assert.equal(created.filter((row) => row.title).length, 1);

    const offeredAgain = await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    assert.equal(offeredAgain.status, "skip");
    store.appendNote(alphaId, {
      text: "Also file the leftover after ignore if it grows.",
      startSeq: 7,
      endSeq: 8,
    });
    await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    const banked = await architect.choose(alphaId, { choice: "bank" });
    assert.equal(banked.status, "ok");
    assert.equal(banked.action, "bank");
    assert.equal(banked.id, "7");
    assert.equal(architect.offer(alphaId), null);
    assert.equal(created.filter((row) => row.title).length, 2);
    assert.equal(created.length, 2);

    await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    assert.equal(architect.offer(alphaId), null);
    store.appendNote(alphaId, {
      text: "Hand this leftover to a runner after the brief is ready.",
      startSeq: 9,
      endSeq: 10,
    });
    await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    const handed = await architect.choose(alphaId, { choice: "handoff" });
    assert.equal(handed.status, "ok");
    assert.equal(handed.action, "handoff");
    assert.match(handed.brief, /Operator brief for the leftover/);
    assert.match(followups[0].content[0].text, /Operator brief for the leftover/);
    assert.match(followups[0].content[0].text, /Return address/);
    assert.equal(architect.offer(alphaId), null);
    assert.equal(created.length, 3);
  }

  {
    const store = createNotebookStore(join(scratch, "offer-missing-tasks"));
    store.ensure(alphaId);
    const architect = createArchitect({
      ctx: { get: () => null },
      store,
      clerk: {
        fire: async () => ({ action: "nothing" }),
        compilePacket: async () => "Ready leftover brief.",
      },
      folder: { pending: () => undefined, decide: () => ({ action: "keep" }) },
    });
    const parentAgent = {
      session: { id: alphaId, events: pairEvents(1, 0, "go", "ok"), header: { cwd: "/work" } },
      ctx: { on() { return () => {}; } },
    };
    architect.attach(parentAgent);
    store.appendNote(alphaId, { text: "todo later", startSeq: 1, endSeq: 2 });
    await architect.considerOffer({
      sessionId: alphaId,
      events: parentAgent.session.events,
      turn: 1,
      session: parentAgent.session,
    });
    const face = architect.offer(alphaId);
    assert.match(face.brief, /Ready leftover brief/);
    const banked = await architect.choose(alphaId, { choice: "bank" });
    assert.equal(banked.status, "refused");
    assert.match(banked.reason, /qq-tasks/);
    assert.ok(architect.offer(alphaId));
    const ignored = await architect.choose(alphaId, { choice: "ignore" });
    assert.equal(ignored.action, "ignore");
    assert.equal(architect.offer(alphaId), null);
  }

  {
    const store = createNotebookStore(join(scratch, "offer-hop"));
    store.ensure(alphaId);
    store.appendNote(alphaId, {
      text: "Ship the leftover after the talking turn ends.",
      startSeq: 1,
      endSeq: 4,
    });
    const listeners = [];
    const architect = createArchitect({
      ctx: { get: () => null },
      store,
      clerk: {
        fire: async () => ({ action: "nothing" }),
        compilePacket: async () => "Hop brief for the leftover.",
      },
      folder: { pending: () => undefined, decide: () => ({ action: "keep" }) },
    });
    const parentAgent = {
      session: { id: alphaId, events: pairEvents(1, 0, "go", "ok"), header: { cwd: "/work" } },
      ctx: {
        on(type, fn) {
          listeners.push({ type, fn });
          return () => {};
        },
      },
    };
    architect.attach(parentAgent);
    const turnObs = listeners.filter((item) => item.type === "session/event").at(-1);
    await turnObs.fn(parentAgent.session, { type: "turn/end", data: { turn: 1 } });
    const face = architect.offer(alphaId);
    assert.match(face.brief, /Hop brief for the leftover/);
    assert.deepEqual(face.choices, ["handoff", "bank", "ignore"]);
  }

  console.log("test-qq-workflows-plugin: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
