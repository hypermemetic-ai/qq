#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const scratchModule = await import(pathToFileURL(join(root, "qq/src/scratch.mjs")));
const {
  MARKER_NAME,
  MARKER_SCHEMA,
  STAGING_PREFIX,
  createScratchManager,
  defaultScratchRoot,
  internals,
} = scratchModule;

const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("0000000000a1");
const betaId = sessionId("0000000000b2");
const gammaId = sessionId("0000000000c3");

const scratch = mkdtempSync(join(tmpdir(), "qq-scratch."));
const outside = mkdtempSync(join(tmpdir(), "qq-scratch-outside."));
writeFileSync(join(outside, "secret.txt"), "outside\n");

function manager(dir, extra = {}) {
  return createScratchManager({ root: dir, ...extra });
}

function mode(path) {
  return statSync(path).mode & 0o777;
}

function sourceOf(relative) {
  return readFileSync(join(root, relative), "utf8");
}

try {
  assert.equal(MARKER_SCHEMA, "qq.scratch/v1");
  assert.equal(MARKER_NAME, ".qq-scratch.json");
  assert.equal(
    defaultScratchRoot({ HOME: "/home/op" }),
    "/home/op/.local/state/qq/scratch",
  );
  assert.equal(
    defaultScratchRoot({ HOME: "/home/op", XDG_STATE_HOME: "/var/state" }),
    "/var/state/qq/scratch",
  );
  assert.throws(() => createScratchManager({ root: "relative/scratch" }), /absolute path/);
  assert.throws(() => createScratchManager({ root: "/tmp/scratch\0x" }), /absolute path/);
  assert.throws(() => createScratchManager({}), /absolute path/);

  const createdRoot = join(scratch, "missing-root", "scratch");
  const created = manager(createdRoot).create(alphaId);
  assert.equal(created, join(createdRoot, alphaId));
  assert.equal(lstatSync(createdRoot).isDirectory(), true);
  assert.equal(lstatSync(createdRoot).isSymbolicLink(), false);

  const work = mkdtempSync(join(scratch, "work."));
  const api = manager(work);
  const alphaPath = api.create(alphaId);
  const betaPath = api.create(betaId);
  assert.equal(alphaPath, join(work, alphaId));
  assert.equal(betaPath, join(work, betaId));
  assert.notEqual(alphaPath, betaPath);
  assert.equal(mode(alphaPath), 0o700);
  assert.equal(mode(join(alphaPath, MARKER_NAME)), 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(alphaPath, MARKER_NAME), "utf8")), {
    schema: MARKER_SCHEMA,
    sessionId: alphaId,
  });
  assert.deepEqual(JSON.parse(readFileSync(join(betaPath, MARKER_NAME), "utf8")), {
    schema: MARKER_SCHEMA,
    sessionId: betaId,
  });
  assert.equal(api.create(alphaId), alphaPath);
  assert.deepEqual(api.verify(alphaId), {
    sessionId: alphaId,
    path: alphaPath,
    marker: { schema: MARKER_SCHEMA, sessionId: alphaId },
  });
  assert.deepEqual(api.verify(alphaId), api.verify(alphaId));

  writeFileSync(join(alphaPath, "notes.txt"), "agent cwd\n");
  mkdirSync(join(alphaPath, "nested"));
  symlinkSync(join(outside, "secret.txt"), join(alphaPath, "nested", "escape"));
  assert.equal(api.verify(alphaId).path, alphaPath);
  assert.equal(readFileSync(join(outside, "secret.txt"), "utf8"), "outside\n");

  for (const invalid of [
    "",
    ".",
    "..",
    "../etc",
    "foo/bar",
    "session-not-a-uuid",
    "/etc/passwd",
    `${alphaId}/../${betaId}`,
    "session-63a11000-0000-9000-8000-0000000000a1",
    "session-63a11000-0000-4000-8000-0000000000a1\0x",
    12,
    null,
  ]) {
    assert.throws(() => api.create(invalid), /session id is invalid/);
    assert.throws(() => api.verify(invalid), /session id is invalid/);
    assert.throws(() => api.delete(invalid), /session id is invalid/);
  }
  const beforeInvalid = readdirSync(work).sort();
  assert.deepEqual(beforeInvalid, [alphaId, betaId].sort());

  const deleted = api.delete(betaId);
  assert.equal(deleted.missing, false);
  assert.equal(existsSync(betaPath), false);
  assert.deepEqual(api.delete(betaId), {
    sessionId: betaId,
    path: betaPath,
    missing: true,
  });
  assert.throws(() => api.verify(betaId), /not found/);

  const forgedDir = join(work, gammaId);
  mkdirSync(forgedDir, { mode: 0o700 });
  writeFileSync(join(forgedDir, MARKER_NAME), `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId: alphaId,
  })}\n`, { mode: 0o600 });
  assert.throws(() => api.verify(gammaId), /mismatch|refused/);
  assert.throws(() => api.delete(gammaId), /mismatch|refused/);
  assert.throws(() => api.create(gammaId), /mismatch|refused/);
  assert.equal(existsSync(forgedDir), true);

  writeFileSync(join(forgedDir, MARKER_NAME), "not-json\n");
  assert.throws(() => api.verify(gammaId), /refused/);
  assert.equal(existsSync(forgedDir), true);

  const unmarked = sessionId("0000000000d4");
  mkdirSync(join(work, unmarked), { mode: 0o700 });
  assert.throws(() => api.verify(unmarked), /refused/);
  assert.throws(() => api.delete(unmarked), /refused/);
  assert.equal(existsSync(join(work, unmarked)), true);

  const fileChild = sessionId("0000000000e5");
  writeFileSync(join(work, fileChild), "nope\n");
  assert.throws(() => api.create(fileChild), /refused/);
  assert.throws(() => api.verify(fileChild), /refused/);
  assert.throws(() => api.delete(fileChild), /refused/);
  assert.equal(readFileSync(join(work, fileChild), "utf8"), "nope\n");

  const childLink = sessionId("0000000000f6");
  symlinkSync(alphaPath, join(work, childLink));
  assert.throws(() => api.create(childLink), /refused/);
  assert.throws(() => api.verify(childLink), /refused/);
  assert.throws(() => api.delete(childLink), /refused/);
  assert.equal(lstatSync(join(work, childLink)).isSymbolicLink(), true);
  assert.equal(existsSync(alphaPath), true);

  const markerLinkId = sessionId("0000000000a7");
  mkdirSync(join(work, markerLinkId), { mode: 0o700 });
  symlinkSync(join(alphaPath, MARKER_NAME), join(work, markerLinkId, MARKER_NAME));
  assert.throws(() => api.verify(markerLinkId), /refused/);
  assert.throws(() => api.delete(markerLinkId), /refused/);
  assert.equal(existsSync(alphaPath), true);

  const linkedRoot = join(scratch, "linked-root");
  symlinkSync(work, linkedRoot);
  const linked = manager(linkedRoot);
  assert.throws(() => linked.create(betaId), /not a usable directory/);
  assert.equal(existsSync(join(work, betaId)), false);
  assert.equal(lstatSync(linkedRoot).isSymbolicLink(), true);

  const leftoverStaging = join(work, `${STAGING_PREFIX}leftover`);
  mkdirSync(leftoverStaging, { mode: 0o700 });
  writeFileSync(join(leftoverStaging, MARKER_NAME), `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId: betaId,
  })}\n`);
  const unrelated = join(work, "notes");
  mkdirSync(unrelated);
  writeFileSync(join(unrelated, "keep.txt"), "keep\n");

  const failingRename = manager(work, {
    fs: {
      renameSync() {
        throw Object.assign(new Error("injected rename failure"), { code: "EIO" });
      },
    },
  });
  const beforeFail = new Set(readdirSync(work));
  assert.throws(() => failingRename.create(betaId), /create failed/);
  const afterFail = readdirSync(work);
  assert.equal(afterFail.includes(betaId), false);
  for (const name of afterFail) {
    if (name.startsWith(STAGING_PREFIX) && name !== `${STAGING_PREFIX}leftover`) {
      assert.fail(`published or leftover staging ${name}`);
    }
  }
  assert.deepEqual(new Set(afterFail), beforeFail);

  const live = new Set([alphaId]);
  const outcome = api.reconcile(() => live);
  const preserved = Object.fromEntries(outcome.preserved.map((row) => [row.name, row.reason]));
  assert.deepEqual(outcome.deleted, []);
  assert.equal(preserved[alphaId], "live");
  assert.equal(preserved[gammaId], "malformed");
  assert.equal(preserved[unmarked], "unmarked");
  assert.equal(preserved[fileChild], "unrelated");
  assert.equal(preserved[childLink], "symlink");
  assert.equal(preserved[markerLinkId], "malformed");
  assert.equal(preserved[`${STAGING_PREFIX}leftover`], "unrelated");
  assert.equal(preserved.notes, "unrelated");
  assert.equal(existsSync(alphaPath), true);
  assert.equal(existsSync(forgedDir), true);
  assert.equal(existsSync(join(work, unmarked)), true);
  assert.equal(existsSync(unrelated), true);

  const orphanPath = api.create(betaId);
  writeFileSync(join(orphanPath, "tmp.txt"), "orphan\n");
  const cleaned = api.reconcile(live);
  assert.deepEqual(cleaned.deleted, [{ sessionId: betaId, path: orphanPath }]);
  assert.equal(existsSync(orphanPath), false);
  assert.equal(existsSync(alphaPath), true);
  const stillPreserved = new Set(cleaned.preserved.map((row) => row.name));
  assert.equal(stillPreserved.has(alphaId), true);
  assert.equal(stillPreserved.has(betaId), false);

  const blocked = manager(work, {
    fs: {
      rmSync(path, options) {
        if (String(path).endsWith(alphaId)) {
          throw Object.assign(new Error("injected rm failure"), { code: "EACCES" });
        }
        return rmSync(path, options);
      },
    },
  });
  // alpha is live, so rm is not attempted. Make it an orphan for the error path.
  const failed = blocked.reconcile([]);
  const alphaError = failed.errors.find((row) => row.name === alphaId);
  assert.equal(Boolean(alphaError), true);
  assert.match(alphaError.error.message, /orphan delete failed/);
  assert.equal(existsSync(alphaPath), true);

  api.delete(alphaId);
  assert.equal(existsSync(alphaPath), false);
  assert.equal(readFileSync(join(outside, "secret.txt"), "utf8"), "outside\n");

  const source = sourceOf("qq/src/scratch.mjs");
  assert.doesNotMatch(source, /from \"\.\/(session|files|plugin)\.mjs\"/);
  assert.doesNotMatch(source, /listProjectCatalog|createProjectFileService|createQqService/);
  assert.doesNotMatch(sourceOf("qq/src/plugin.mjs"), /scratch/);
  assert.doesNotMatch(sourceOf("qq/src/session.mjs"), /createScratchManager|scratch\.mjs/);
  assert.equal(internals.isDirectChild(work, join(work, alphaId)), true);
  assert.equal(internals.isDirectChild(work, join(work, "nested", alphaId)), false);
  assert.equal(internals.contained(work, join(work, "..", "nope")), false);
  assert.deepEqual([...internals.liveIdSet([alphaId, "nope"])], [alphaId]);
  assert.throws(() => internals.liveIdSet("session-id"), /live session ids/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
