#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createQqService } from "../qq/src/session.mjs";

const root = new URL("..", import.meta.url).pathname;
const aliasModule = await import(pathToFileURL(join(root, "qq/src/alias.mjs")));
const {
  ALIAS_SCHEMA, LEGACY_ALIAS_SCHEMA, PUBLISHED, STRANGE, WARM_COUNT,
  createAliasBook, defaultAliasFile, defaultLegacyAliasFile,
  farthestFirst, overflowCandidate, rootTokens, sharesRootWithLive, isNeighborOfLive,
} = aliasModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-alias."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("000000000001");
const betaId = sessionId("000000000002");
const gammaId = sessionId("000000000003");

try {
  assert.deepEqual([...PUBLISHED], ["1", "2", "3", "4", "9", "10", "12", "20", "40", "80"]);
  assert.deepEqual([...STRANGE], ["6", "7", "8", "11", "30"]);
  assert.equal(WARM_COUNT, 3);
  assert.equal(ALIAS_SCHEMA, "qq.alias/v1");
  assert.equal(LEGACY_ALIAS_SCHEMA, "qq.relay-alias/v1");

  assert.equal(
    defaultAliasFile({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-aliases.json",
  );
  assert.equal(
    defaultLegacyAliasFile({ DSH_HOME: "/state/qq/dsh-workbench" }),
    "/state/qq/.qq-relay-aliases.json",
  );
  assert.equal(defaultAliasFile({}, { aliasFile: "/x/aliases.json" }), "/x/aliases.json");
  assert.throws(() => defaultAliasFile({}, { aliasFile: "relative.json" }), /absolute path/);
  assert.throws(() => defaultAliasFile({ DSH_HOME: "relative" }, {}), /absolute path/);

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

  assert.equal(farthestFirst(PUBLISHED, [], () => 0), "1");
  assert.equal(farthestFirst(PUBLISHED, [], () => 0.5), "10");
  assert.equal(
    farthestFirst(["2", "3", "4", "9", "10", "12", "20", "40"], ["1"], () => 0),
    "40",
  );
  assert.equal(farthestFirst(["6", "7", "8", "11"], [...PUBLISHED], () => 0), "6");

  // Deterministic full-deck walk. After COUSINS 30↔3 is gone, strange overflow
  // may deal 30 while 3 is live (30 is farthest from the published board).
  {
    const file = join(scratch, "deck.json");
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
      ["1", "80", "40", "20", "10", "4", "12", "2", "3", "9", "30", "6", "7", "8", "11"],
    );
    assert.ok(expected.indexOf("30") > expected.indexOf("3"), "30 may be dealt while 3 is already live");
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
    book.sync([b, c, d]);
    assert.equal(book.aliasFor(a), "1", "a keeps its alias until it is gone");
    book.sync([b, c, d, e]);
    assert.equal(book.aliasFor(e), "2", "warm 1 must not be re-dealt");
    book.sync([c, d, e, f]);
    assert.equal(book.aliasFor(f), "10");
    book.sync([d, e, f, g]);
    assert.equal(book.aliasFor(g), "4");
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
    book.sync([b, c, d]);
    book.sync([c, d]);
    book.sync([d]);
    book.sync([]);
    book.sync([e]);
    assert.equal(book.aliasFor(e), "1");
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

  // Old .qq-relay-aliases.json migrates once onto the new path and is not rewritten.
  {
    const file = join(scratch, ".qq-aliases.json");
    const legacy = join(scratch, ".qq-relay-aliases.json");
    writeFileSync(legacy, `${JSON.stringify({
      schema: LEGACY_ALIAS_SCHEMA,
      entries: [
        { alias: "12", session: alphaId, issuedAt: 1, goneAt: null },
      ],
    }, null, 2)}\n`, { mode: 0o600 });
    const book = createAliasBook(file, { rng: () => 0 });
    assert.equal(book.aliasFor(alphaId), "12");
    assert.equal(existsSync(file), true);
    const migrated = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(migrated.schema, ALIAS_SCHEMA);
    assert.equal(migrated.entries[0].alias, "12");
    const before = readFileSync(legacy, "utf8");
    book.sync([alphaId, betaId]);
    assert.equal(book.aliasFor(alphaId), "12");
    assert.equal(book.aliasFor(betaId), "80");
    assert.equal(readFileSync(legacy, "utf8"), before, "legacy path is not rewritten");
    const after = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(after.schema, ALIAS_SCHEMA);
    assert.equal(after.entries.length, 2);
    rmSync(file, { force: true });
    rmSync(legacy, { force: true });
  }

  // qq.list / qq.read include alias only for live sessions, without relay loaded.
  {
    const file = join(scratch, "service.json");
    const durableOnly = sessionId("000000000099");
    const states = new Map([
      [alphaId, { id: alphaId, events: [], createdAt: 2, cwd: "/work" }],
      [durableOnly, { id: durableOnly, events: [], createdAt: 1, cwd: "/work" }],
    ]);
    const live = new Map();
    const listeners = new Map();
    function fakeAgent(id) {
      return {
        session: { id, events: [], header: { createdAt: 2, cwd: "/work" } },
        status: "idle",
        followup() {},
        cancel() {},
        whenIdle: async () => {},
      };
    }
    const ctx = {
      get(name) {
        if (name === "agents") {
          return {
            get: (id) => live.get(id),
            list: () => [...live.values()],
            async resume({ resumeSessionId }) {
              const agent = fakeAgent(resumeSessionId);
              live.set(resumeSessionId, agent);
              return { agent };
            },
            async create({ sessionId: id }) {
              states.set(id, { id, events: [], createdAt: 3, cwd: "/work" });
              const agent = fakeAgent(id);
              live.set(id, agent);
              return { agent };
            },
          };
        }
        if (name === "sessions") return { async flush() {} };
        if (name === "sessionPersistence") {
          return {
            async list() {
              return [...states.values()].map((state) => ({
                id: state.id,
                createdAt: state.createdAt,
                cwd: state.cwd,
              }));
            },
          };
        }
        if (name === "loader") return { async await() {} };
        return undefined;
      },
      on(name, handler) { listeners.set(name, handler); },
    };
    const qq = createQqService(ctx, {
      sessionId: alphaId,
      cwd: "/work",
      provider: "qwen-token-plan",
      model: "deepseek-v4-pro-0813",
      aliasFile: file,
      rng: () => 0,
    });
    const listed = await qq.list();
    const durable = listed.find((row) => row.id === durableOnly);
    const defaultRow = listed.find((row) => row.id === alphaId);
    assert.equal(durable.alias, undefined, "durable-only row has no live alias");
    assert.equal(defaultRow.alias, undefined, "unloaded default has no live alias");
    const snapshot = await qq.read(alphaId);
    assert.equal(snapshot.alias, "1");
    assert.doesNotMatch(snapshot.id, /^[0-9]+$/);
    assert.match(snapshot.id, /^session-/);
    const afterRead = await qq.list();
    assert.equal(afterRead.find((row) => row.id === alphaId).alias, "1");
    assert.equal(afterRead.find((row) => row.id === durableOnly).alias, undefined);
    assert.equal(qq.alias(alphaId), "1");
    assert.equal(qq.resolve("1"), alphaId);
    assert.equal(qq.resolve(alphaId), alphaId);
    const created = await qq.create();
    assert.equal(created.alias, "80");
    assert.match(created.id, /^session-/);
    assert.notEqual(created.id, created.alias);
    assert.equal(existsSync(file), true);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(raw.schema, ALIAS_SCHEMA);
    assert.equal(statSync(file).mode & 0o777, 0o600);

    // Live sessions another plugin creates are dealt through agent/created;
    // their alias and departure persist through the event handlers alone.
    const appearId = sessionId("000000000098");
    const appeared = fakeAgent(appearId);
    live.set(appearId, appeared);
    listeners.get("agent/created")?.({ agent: appeared });
    const afterAppear = JSON.parse(readFileSync(file, "utf8")).entries;
    assert.equal(afterAppear.find((item) => item.session === appearId)?.alias, "40");

    live.delete(appearId);
    listeners.get("agent/disposed")?.();
    const afterDisposed = JSON.parse(readFileSync(file, "utf8")).entries;
    const departed = afterDisposed.find((item) => item.session === appearId);
    assert.ok(departed, "disposed session keeps its persisted entry");
    assert.notEqual(departed.goneAt, null, "agent/disposed marks the alias gone");
    live.delete(alphaId);
    const afterLeave = await qq.list();
    assert.equal(afterLeave.find((row) => row.id === alphaId).alias, undefined);
    assert.equal(qq.alias(alphaId), undefined);
    rmSync(file, { force: true });
  }

  console.log("test-qq-alias: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
