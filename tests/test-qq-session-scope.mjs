#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const scopeModule = await import(pathToFileURL(join(root, "qq/src/session-scope.mjs")));
const {
  SCOPE_SCHEMA,
  SESSION_ID,
  createSessionScopeStore,
  defaultScopeFile,
  internals,
} = scopeModule;

const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("0000000000a1");
const betaId = sessionId("0000000000b2");
const scratch = mkdtempSync(join(tmpdir(), "qq-session-scope."));

function mode(path) {
  return statSync(path).mode & 0o777;
}

function sourceOf(relative) {
  return readFileSync(join(root, relative), "utf8");
}

try {
  assert.equal(SCOPE_SCHEMA, "qq.session-scope/v1");
  assert.equal(SESSION_ID.ignoreCase, false);
  assert.equal(
    defaultScopeFile({ HOME: "/home/op" }),
    "/home/op/.local/state/qq/session-scope.json",
  );
  assert.equal(
    defaultScopeFile({ HOME: "/home/op", XDG_STATE_HOME: "/var/state" }),
    "/var/state/qq/session-scope.json",
  );
  assert.throws(() => createSessionScopeStore({ file: "relative.json" }), /absolute path/);
  assert.throws(() => createSessionScopeStore({ file: "/tmp/scope\0x" }), /absolute path/);

  const memory = createSessionScopeStore();
  assert.equal(memory.get(alphaId), undefined);
  const alphaCwd = join(scratch, alphaId);
  const stored = memory.put(alphaId, { cwd: alphaCwd });
  assert.equal(Object.isFrozen(stored), true);
  assert.deepEqual(stored, {
    id: alphaId,
    scope: "home",
    context: "scratch",
    cwd: alphaCwd,
  });
  assert.equal(memory.get(alphaId), stored);
  assert.throws(() => { stored.scope = "project"; }, /Cannot assign/);
  assert.throws(() => memory.put(alphaId, { cwd: join(scratch, "other") }), /invalid|mismatch/);
  assert.throws(() => memory.put("not-a-session", { cwd: join(scratch, "not-a-session") }), /invalid/);
  assert.throws(() => memory.put(betaId, {
    scope: "project",
    context: "project",
    cwd: join(scratch, betaId),
  }), /mismatch/);

  const file = join(scratch, "session-scope.json");
  const disk = createSessionScopeStore({ file });
  const betaCwd = join(scratch, betaId);
  disk.put(betaId, { cwd: betaCwd });
  assert.equal(existsSync(file), true);
  assert.equal(mode(file), 0o600);
  assert.equal(mode(scratch), 0o700);
  const payload = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(payload.schema, SCOPE_SCHEMA);
  assert.deepEqual(payload.sessions[betaId], {
    scope: "home",
    context: "scratch",
    cwd: betaCwd,
  });
  assert.equal("id" in payload.sessions[betaId], false);

  const reloaded = createSessionScopeStore({ file });
  assert.deepEqual(reloaded.get(betaId), {
    id: betaId,
    scope: "home",
    context: "scratch",
    cwd: betaCwd,
  });
  assert.equal(Object.isFrozen(reloaded.get(betaId)), true);

  writeFileSync(file, "{not json\n");
  const corrupt = createSessionScopeStore({ file });
  assert.equal(corrupt.corrupt, true);
  assert.equal(corrupt.get(betaId), undefined);
  assert.deepEqual(corrupt.inspect(betaId), { ok: false, reason: "corrupt" });
  assert.throws(() => corrupt.put(alphaId, { cwd: alphaCwd }), /corrupt/);
  assert.deepEqual(corrupt.ids(), []);

  const mixedFile = join(scratch, "mixed-scope.json");
  writeFileSync(mixedFile, `${JSON.stringify({
    schema: SCOPE_SCHEMA,
    sessions: {
      [alphaId]: { scope: "home", context: "scratch", cwd: alphaCwd },
      [betaId]: { scope: "home", context: "scratch", cwd: join(scratch, "mismatch") },
      "not-a-session": { scope: "home", context: "scratch", cwd: join(scratch, "not-a-session") },
    },
  })}\n`);
  const mixed = createSessionScopeStore({ file: mixedFile });
  assert.equal(mixed.corrupt, false);
  assert.deepEqual(mixed.get(alphaId)?.id, alphaId);
  assert.equal(mixed.get(betaId), undefined);
  assert.deepEqual(mixed.inspect(betaId), { ok: false, reason: "invalid" });
  assert.deepEqual(mixed.protectedIds(), [betaId]);
  assert.deepEqual(mixed.ids(), [alphaId]);

  assert.equal(internals.canonicalSessionId(alphaId), alphaId);
  assert.equal(internals.canonicalSessionId(alphaId.toUpperCase()), undefined);
  assert.equal(internals.canonicalCwd(alphaId, join(scratch, "nope")), undefined);
  assert.equal(internals.canonicalCwd(alphaId, `${alphaCwd}/`), undefined);

  const source = sourceOf("qq/src/session-scope.mjs");
  assert.doesNotMatch(source, /from \"\.\/(session|files|plugin|scratch)\.mjs\"/);
  assert.doesNotMatch(source, /listProjectCatalog|createQqService|agents\.create/);
  assert.match(sourceOf("qq/src/session.mjs"), /createSessionScopeStore/);
  assert.match(sourceOf("qq/src/session.mjs"), /from "\.\/session-scope\.mjs"/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("test-qq-session-scope: pass");
