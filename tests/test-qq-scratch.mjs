#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
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
  SESSION_ID,
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

function writeOwnedMarker(directory, sessionId) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  const markerPath = join(directory, MARKER_NAME);
  writeFileSync(markerPath, `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId,
  })}\n`, { mode: 0o600 });
  chmodSync(markerPath, 0o600);
  assert.equal(mode(directory), 0o700);
  assert.equal(mode(markerPath), 0o600);
}

function relativeOutcome(result, dir) {
  const trim = (path) => (path.startsWith(dir) ? path.slice(dir.length) : path);
  return {
    deleted: result.deleted.map((row) => ({
      sessionId: row.sessionId,
      path: trim(row.path),
    })),
    preserved: result.preserved.map((row) => ({
      name: row.name,
      path: trim(row.path),
      reason: row.reason,
    })),
    errors: result.errors.map((row) => ({
      name: row.name,
      path: trim(row.path),
      code: row.error?.code,
    })),
  };
}

try {
  assert.equal(MARKER_SCHEMA, "qq.scratch/v1");
  assert.equal(MARKER_NAME, ".qq-scratch.json");
  assert.equal(SESSION_ID.ignoreCase, false);
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
    ` ${alphaId}`,
    `${alphaId} `,
    alphaId.toUpperCase(),
    `Session-${alphaId.slice("session-".length)}`,
    `session-63a11000-0000-4000-8000-0000000000\u04301`,
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

  const realBase = mkdtempSync(join(scratch, "real-base."));
  const aliasParent = join(scratch, "alias-parent");
  symlinkSync(realBase, aliasParent);
  const aliasRoot = join(aliasParent, "scratch");
  const aliased = manager(aliasRoot);
  assert.throws(() => aliased.create(alphaId), /not a usable directory/);
  assert.equal(existsSync(join(realBase, "scratch")), false);
  assert.equal(existsSync(join(realBase, alphaId)), false);
  assert.equal(lstatSync(aliasParent).isSymbolicLink(), true);

  const looseId = sessionId("0000000000a8");
  const loosePath = join(work, looseId);
  mkdirSync(loosePath, { mode: 0o777 });
  chmodSync(loosePath, 0o777);
  writeFileSync(join(loosePath, MARKER_NAME), `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId: looseId,
  })}\n`);
  chmodSync(join(loosePath, MARKER_NAME), 0o666);
  assert.equal(mode(loosePath), 0o777);
  assert.equal(mode(join(loosePath, MARKER_NAME)), 0o666);
  assert.throws(() => api.verify(looseId), /refused/);
  assert.throws(() => api.create(looseId), /refused/);
  assert.throws(() => api.delete(looseId), /refused/);
  assert.equal(existsSync(loosePath), true);

  const leftoverStaging = join(work, `${STAGING_PREFIX}leftover`);
  mkdirSync(leftoverStaging, { mode: 0o700 });
  writeFileSync(join(leftoverStaging, MARKER_NAME), `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId: betaId,
  })}\n`);
  const unrelated = join(work, "notes");
  mkdirSync(unrelated);
  writeFileSync(join(unrelated, "keep.txt"), "keep\n");

  const paddedName = ` ${alphaId}`;
  const upperName = alphaId.toUpperCase();
  for (const name of [paddedName, upperName]) {
    writeOwnedMarker(join(work, name), name);
    assert.throws(() => api.verify(name), /session id is invalid/);
    assert.throws(() => api.delete(name), /session id is invalid/);
    assert.throws(() => api.create(name), /session id is invalid/);
    assert.equal(existsSync(join(work, name)), true);
  }

  const caseMarkerId = sessionId("0000000000b9");
  const caseMarkerPath = join(work, caseMarkerId);
  writeOwnedMarker(caseMarkerPath, caseMarkerId.toUpperCase());
  assert.throws(() => api.verify(caseMarkerId), /mismatch|refused/);
  assert.throws(() => api.delete(caseMarkerId), /mismatch|refused/);
  assert.equal(existsSync(caseMarkerPath), true);

  const paddedMarkerId = sessionId("0000000000ca");
  const paddedMarkerPath = join(work, paddedMarkerId);
  writeOwnedMarker(paddedMarkerPath, ` ${paddedMarkerId}`);
  assert.throws(() => api.verify(paddedMarkerId), /mismatch|refused/);
  assert.throws(() => api.delete(paddedMarkerId), /mismatch|refused/);
  assert.equal(existsSync(paddedMarkerPath), true);

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
  assert.equal(preserved[looseId], "malformed");
  assert.equal(preserved[paddedName], "unrelated");
  assert.equal(preserved[upperName], "unrelated");
  assert.equal(preserved[caseMarkerId], "malformed");
  assert.equal(preserved[paddedMarkerId], "malformed");
  assert.equal(existsSync(alphaPath), true);
  assert.equal(existsSync(forgedDir), true);
  assert.equal(existsSync(join(work, unmarked)), true);
  assert.equal(existsSync(unrelated), true);
  assert.equal(existsSync(loosePath), true);
  assert.equal(existsSync(join(work, paddedName)), true);
  assert.equal(existsSync(join(work, upperName)), true);
  assert.equal(existsSync(caseMarkerPath), true);
  assert.equal(existsSync(paddedMarkerPath), true);

  const orphanPath = api.create(betaId);
  writeFileSync(join(orphanPath, "tmp.txt"), "orphan\n");
  const cleaned = api.reconcile(live);
  assert.deepEqual(cleaned.deleted, [{ sessionId: betaId, path: orphanPath }]);
  assert.equal(existsSync(orphanPath), false);
  assert.equal(existsSync(alphaPath), true);
  const stillPreserved = new Set(cleaned.preserved.map((row) => row.name));
  assert.equal(stillPreserved.has(alphaId), true);
  assert.equal(stillPreserved.has(betaId), false);
  assert.equal(stillPreserved.has(paddedName), true);
  assert.equal(stillPreserved.has(upperName), true);
  assert.equal(stillPreserved.has(caseMarkerId), true);
  assert.equal(stillPreserved.has(paddedMarkerId), true);

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

  const markerIoFail = manager(work, {
    fs: {
      openSync(path, flags, mode) {
        if (String(path).endsWith(MARKER_NAME)) {
          throw Object.assign(new Error("injected marker open"), { code: "EIO" });
        }
        return openSync(path, flags, mode);
      },
    },
  });
  const markerOpen = markerIoFail.reconcile([]);
  const markerOpenError = markerOpen.errors.find((row) => row.name === alphaId);
  assert.equal(Boolean(markerOpenError), true);
  assert.match(markerOpenError.error.message, /could not inspect child/);
  assert.equal(markerOpen.preserved.some((row) => row.name === alphaId), false);
  assert.equal(existsSync(alphaPath), true);

  const markerLstatFail = manager(work, {
    fs: {
      lstatSync(path) {
        if (String(path).endsWith(MARKER_NAME)) {
          throw Object.assign(new Error("injected marker lstat"), { code: "EIO" });
        }
        return lstatSync(path);
      },
    },
  });
  const markerLstat = markerLstatFail.reconcile([]);
  const markerLstatError = markerLstat.errors.find((row) => row.name === alphaId);
  assert.equal(Boolean(markerLstatError), true);
  assert.match(markerLstatError.error.message, /could not inspect child/);
  assert.equal(existsSync(alphaPath), true);

  const missingReconcileRoot = join(scratch, "missing-reconcile-root");
  assert.throws(() => manager(missingReconcileRoot).reconcile("bad input"), /live session ids/);
  assert.equal(existsSync(missingReconcileRoot), false);

  const liveCaseRoot = mkdtempSync(join(scratch, "live-case."));
  const liveCaseApi = manager(liveCaseRoot);
  const liveCasePath = liveCaseApi.create(alphaId);
  const liveCaseOutcome = liveCaseApi.reconcile([alphaId.toUpperCase(), ` ${alphaId}`]);
  assert.deepEqual(liveCaseOutcome.deleted, [{ sessionId: alphaId, path: liveCasePath }]);
  assert.equal(existsSync(liveCasePath), false);

  const noncanonicalRoot = mkdtempSync(join(scratch, "noncanonical."));
  const noncanonicalApi = manager(noncanonicalRoot);
  const paddedOnly = ` ${alphaId}`;
  const upperOnly = alphaId.toUpperCase();
  for (const name of [paddedOnly, upperOnly]) {
    writeOwnedMarker(join(noncanonicalRoot, name), name);
    assert.throws(() => noncanonicalApi.verify(name), /session id is invalid/);
    assert.throws(() => noncanonicalApi.delete(name), /session id is invalid/);
  }
  const emptyLive = noncanonicalApi.reconcile([]);
  assert.deepEqual(emptyLive.deleted, []);
  assert.deepEqual(emptyLive.errors, []);
  const emptyPreserved = Object.fromEntries(emptyLive.preserved.map((row) => [row.name, row.reason]));
  assert.equal(emptyPreserved[paddedOnly], "unrelated");
  assert.equal(emptyPreserved[upperOnly], "unrelated");
  assert.equal(existsSync(join(noncanonicalRoot, paddedOnly)), true);
  assert.equal(existsSync(join(noncanonicalRoot, upperOnly)), true);

  const markerAuthRoot = mkdtempSync(join(scratch, "marker-auth."));
  const markerAuthApi = manager(markerAuthRoot);
  const upperMarkerPath = join(markerAuthRoot, alphaId);
  const paddedAuthPath = join(markerAuthRoot, betaId);
  writeOwnedMarker(upperMarkerPath, alphaId.toUpperCase());
  writeOwnedMarker(paddedAuthPath, ` ${betaId}`);
  assert.throws(() => markerAuthApi.verify(alphaId), /mismatch|refused/);
  assert.throws(() => markerAuthApi.delete(alphaId), /mismatch|refused/);
  assert.throws(() => markerAuthApi.verify(betaId), /mismatch|refused/);
  assert.throws(() => markerAuthApi.delete(betaId), /mismatch|refused/);
  const markerAuth = markerAuthApi.reconcile([]);
  assert.deepEqual(markerAuth.deleted, []);
  const markerAuthPreserved = Object.fromEntries(markerAuth.preserved.map((row) => [row.name, row.reason]));
  assert.equal(markerAuthPreserved[alphaId], "malformed");
  assert.equal(markerAuthPreserved[betaId], "malformed");
  assert.equal(existsSync(upperMarkerPath), true);
  assert.equal(existsSync(paddedAuthPath), true);

  function plantIdentityTree(dir) {
    const planted = manager(dir);
    const livePath = planted.create(alphaId);
    const orphanPath = planted.create(betaId);
    const padded = ` ${gammaId}`;
    const upper = gammaId.toUpperCase();
    for (const name of [padded, upper]) {
      writeOwnedMarker(join(dir, name), name);
    }
    const oddId = sessionId("0000000000c9");
    const oddPath = join(dir, oddId);
    writeOwnedMarker(oddPath, oddId.toUpperCase());
    return { livePath, orphanPath, padded, upper, oddId, oddPath };
  }

  function reversedReaddir(path, options) {
    return [...readdirSync(path, options)].reverse();
  }

  const identityA = mkdtempSync(join(scratch, "identity-a."));
  const plantedA = plantIdentityTree(identityA);
  const identityB = mkdtempSync(join(scratch, "identity-b."));
  plantIdentityTree(identityB);
  const reversedOutcome = manager(identityA, {
    fs: { readdirSync: reversedReaddir },
  }).reconcile([alphaId]);
  const forwardOutcome = manager(identityB).reconcile([alphaId]);
  assert.deepEqual(relativeOutcome(reversedOutcome, identityA), relativeOutcome(forwardOutcome, identityB));
  assert.deepEqual(reversedOutcome.deleted, [{ sessionId: betaId, path: plantedA.orphanPath }]);
  assert.deepEqual(
    reversedOutcome.preserved.map((row) => row.name),
    [...reversedOutcome.preserved.map((row) => row.name)].sort((left, right) => {
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    }),
  );
  const reversedPreserved = Object.fromEntries(reversedOutcome.preserved.map((row) => [row.name, row.reason]));
  assert.equal(reversedPreserved[alphaId], "live");
  assert.equal(reversedPreserved[plantedA.padded], "unrelated");
  assert.equal(reversedPreserved[plantedA.upper], "unrelated");
  assert.equal(reversedPreserved[plantedA.oddId], "malformed");
  assert.equal(existsSync(plantedA.livePath), true);
  assert.equal(existsSync(plantedA.orphanPath), false);
  assert.equal(existsSync(join(identityA, plantedA.padded)), true);
  assert.equal(existsSync(join(identityA, plantedA.upper)), true);
  assert.equal(existsSync(plantedA.oddPath), true);

  api.delete(alphaId);
  assert.equal(existsSync(alphaPath), false);
  assert.equal(readFileSync(join(outside, "secret.txt"), "utf8"), "outside\n");

  const source = sourceOf("qq/src/scratch.mjs");
  assert.doesNotMatch(source, /from \"\.\/(session|files|plugin)\.mjs\"/);
  assert.doesNotMatch(source, /listProjectCatalog|createProjectFileService|createQqService/);
  assert.doesNotMatch(sourceOf("qq/src/plugin.mjs"), /scratch/);
  assert.match(sourceOf("qq/src/session.mjs"), /createScratchManager/);
  assert.match(sourceOf("qq/src/session.mjs"), /from "\.\/scratch\.mjs"/);
  assert.doesNotMatch(sourceOf("qq/src/session.mjs"), /startsWith\(.*scratch/);
  assert.doesNotMatch(sourceOf("qq/src/session.mjs"), /\.transition\(|attachWorkflow|selectedWorkflow/);
  assert.equal(internals.isDirectChild(work, join(work, alphaId)), true);
  assert.equal(internals.isDirectChild(work, join(work, "nested", alphaId)), false);
  assert.equal(internals.contained(work, join(work, "..", "nope")), false);
  assert.deepEqual([...internals.liveIdSet([alphaId, "nope"])], [alphaId]);
  assert.deepEqual([...internals.liveIdSet([alphaId, alphaId.toUpperCase(), ` ${alphaId}`, "nope"])], [alphaId]);
  assert.throws(() => internals.liveIdSet("session-id"), /live session ids/);
} finally {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}
