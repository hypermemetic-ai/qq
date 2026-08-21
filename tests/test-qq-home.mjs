#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createQqService } from "../qq/src/session.mjs";
import { MARKER_NAME, MARKER_SCHEMA } from "../qq/src/scratch.mjs";
import { SCOPE_SCHEMA } from "../qq/src/session-scope.mjs";
import { addProject, attachHandle, makeProjectsHome, qqConfig } from "./qq-projects-fixture.mjs";

const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_HANDLE = Symbol.for("@hypermemetic-ai/qq/agent-handle");
const bootId = "session-63a11000-0000-4000-8000-0000000000a1";
const childId = "session-63a11000-0000-4000-8000-0000000000d4";
const nestedId = "session-63a11000-0000-4000-8000-0000000000e5";
const orphanId = "session-63a11000-0000-4000-8000-0000000000f6";

const projects = makeProjectsHome("alpha");
const betaCwd = addProject(projects.root, "beta");
mkdirSync(join(projects.cwd, "nested"));
const scratchRoot = join(projects.root, ".qq-scratch");
const scopeFile = join(projects.root, "session-scope.json");

function mode(path) {
  return statSync(path).mode & 0o777;
}

function writeOwnedMarker(directory, sessionId) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const markerPath = join(directory, MARKER_NAME);
  writeFileSync(markerPath, `${JSON.stringify({
    schema: MARKER_SCHEMA,
    sessionId,
  })}\n`, { mode: 0o600 });
  chmodSync(markerPath, 0o600);
}

function sessionDirs() {
  if (!existsSync(scratchRoot)) return [];
  return readdirSync(scratchRoot).filter((name) => SESSION_ID.test(name));
}

function scopeRecord(sessionId) {
  if (!existsSync(scopeFile)) return undefined;
  const payload = JSON.parse(readFileSync(scopeFile, "utf8"));
  assert.equal(payload.schema, SCOPE_SCHEMA);
  return payload.sessions?.[sessionId];
}

try {
  const live = new Map();
  const persisted = new Map();
  const creates = [];
  const flushes = [];
  const disposed = [];
  const deletedPaths = [];
  const logger = { warnings: [] };
  logger.warn = (...args) => { logger.warnings.push(args); };
  let failNextCreate = false;
  let failNextFlush = false;
  let failNextDispose = false;
  let failNextScopePut = false;
  let failDeletePath;
  let deleteOrder;
  let createdAtSeq = 100;
  let holdFlush;
  let notifyFlushHold;

  const scratchFs = {
    rmSync(path, options) {
      deleteOrder?.("delete", path);
      if (failDeletePath && path === failDeletePath) {
        failDeletePath = undefined;
        const error = new Error("qq-home probe: delete failed");
        error.code = "EIO";
        error.path = path;
        throw error;
      }
      deletedPaths.push(path);
      return rmSync(path, options);
    },
  };

  function fake(id, options = {}) {
    const cwd = options.cwd ?? projects.cwd;
    const createdAt = options.createdAt ?? Date.now();
    const events = options.events ?? [];
    const header = {
      createdAt,
      cwd,
      ...(options.parentSession ? { parentSession: options.parentSession } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    };
    let status = options.status ?? "idle";
    const agent = {
      session: { id, events, header },
      get status() { return status; },
      setStatus(next) { status = next; },
      followup() {},
      cancel() {},
      whenIdle: async () => {},
    };
    live.set(id, agent);
    if (options.persist) persistSession(agent.session);
    attachHandle(agent, async () => {
      if (failNextDispose) {
        failNextDispose = false;
        throw new Error("qq-home probe: dispose failed");
      }
      disposed.push(id);
      live.delete(id);
    });
    return agent;
  }

  function persistSession(session) {
    const header = session?.header ?? {};
    persisted.set(session.id, {
      id: session.id,
      createdAt: header.createdAt,
      cwd: header.cwd,
    });
  }

  fake(bootId, { cwd: projects.cwd, createdAt: 10, persist: true });
  fake(childId, {
    cwd: projects.cwd,
    parentSession: bootId,
    origin: "subagent",
    createdAt: 90,
    persist: true,
  });
  fake(nestedId, { cwd: join(projects.cwd, "nested"), createdAt: 80, persist: true });

  const createdListeners = [];
  const ctx = {
    logger,
    on(name, handler) {
      if (name === "agent/created") createdListeners.push(handler);
    },
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => live.get(id),
          list: () => [...live.values()],
          async create(options) {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("qq-home probe: create failed");
            }
            creates.push(options);
            const id = options.sessionId;
            const cwd = options.meta?.cwd;
            createdAtSeq += 1;
            const agent = fake(id, {
              cwd,
              createdAt: createdAtSeq,
            });
            for (const listener of createdListeners) listener({ agent });
            return {
              agent,
              async dispose() {
                deleteOrder?.("dispose", id);
                if (failNextDispose) {
                  failNextDispose = false;
                  throw new Error("qq-home probe: dispose failed");
                }
                disposed.push(id);
                live.delete(id);
              },
            };
          },
          async resume() {
            throw new Error("silent resume must not happen");
          },
        };
      }
      if (name === "sessions") {
        return {
          async flush(session) {
            if (typeof notifyFlushHold === "function") {
              const notify = notifyFlushHold;
              const gate = holdFlush;
              notifyFlushHold = undefined;
              holdFlush = undefined;
              notify();
              await gate;
            }
            if (failNextFlush) {
              failNextFlush = false;
              throw new Error("qq-home probe: flush failed");
            }
            flushes.push(session.id);
            persistSession(session);
          },
        };
      }
      if (name === "sessionPersistence") {
        return { async list() { return [...persisted.values()]; } };
      }
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };

  const qq = createQqService(ctx, {
    ...qqConfig(projects, bootId),
    scratchFs,
    scopeFs: {
      writeFileSync(...args) {
        if (failNextScopePut) {
          failNextScopePut = false;
          throw new Error("qq-home probe: scope put failed");
        }
        return writeFileSync(...args);
      },
    },
  });

  assert.equal(qq.scratchRoot, scratchRoot);
  assert.equal((await qq.listHome()).length, 0);
  assert.equal(await qq.latestHome(), null);
  assert.deepEqual((await qq.list("alpha")).map((row) => row.id), [bootId]);
  assert.equal((await qq.list("alpha"))[0].scope, "project");
  assert.equal((await qq.list("alpha"))[0].context, "project");
  assert.equal((await qq.listProjects()).some((project) => /home|scratch/i.test(project.name)), false);
  assert.equal(live.has(childId), true);
  assert.equal((await qq.list("alpha")).some((row) => row.id === childId), false);

  const created = await qq.createHome();
  assert.match(created.id, SESSION_ID);
  assert.equal(created.scope, "home");
  assert.equal(created.context, "scratch");
  assert.equal("project" in created, false);
  assert.equal(created.cwd, join(scratchRoot, created.id));
  assert.equal(mode(created.cwd), 0o700);
  assert.equal(mode(join(created.cwd, MARKER_NAME)), 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(created.cwd, MARKER_NAME), "utf8")), {
    schema: MARKER_SCHEMA,
    sessionId: created.id,
  });
  assert.equal(flushes.includes(created.id), true);
  assert.equal(persisted.get(created.id)?.cwd, created.cwd);
  assert.equal("scope" in (persisted.get(created.id) ?? {}), false);
  assert.equal("context" in (persisted.get(created.id) ?? {}), false);
  assert.deepEqual(scopeRecord(created.id), {
    scope: "home",
    context: "scratch",
    cwd: created.cwd,
  });
  assert.equal("scope" in (creates.at(-1).meta ?? {}), false);
  assert.equal("context" in (creates.at(-1).meta ?? {}), false);
  assert.equal(creates.at(-1).meta.cwd, created.cwd);
  assert.equal(creates.at(-1).agentOptions.model, "deepseek-v4-pro-0813");
  assert.equal("setup" in creates.at(-1), true);

  const snapshot = await qq.read(created.id);
  assert.equal(snapshot.scope, "home");
  assert.equal(snapshot.context, "scratch");
  assert.equal(snapshot.project, undefined);
  assert.equal(snapshot.cwd, created.cwd);

  const listedHome = await qq.listHome();
  assert.deepEqual(listedHome.map((row) => row.id), [created.id]);
  assert.equal(listedHome[0].scope, "home");
  assert.equal((await qq.list("alpha")).some((row) => row.id === created.id), false);
  assert.equal((await qq.list()).some((row) => row.scope === "home"), false);
  assert.deepEqual(await qq.latestHome(), listedHome[0]);
  assert.equal(qq.resolve(created.id), created.id);
  assert.ok(qq.alias(created.id));
  assert.equal(qq.resolve(qq.alias(created.id)), created.id);

  let flushEntered;
  const flushStarted = new Promise((resolve) => { flushEntered = resolve; });
  let releaseFlush;
  holdFlush = new Promise((resolve) => { releaseFlush = resolve; });
  notifyFlushHold = flushEntered;
  const pendingHome = qq.createHome();
  await flushStarted;
  const pendingId = creates.at(-1).sessionId;
  assert.equal(live.has(pendingId), true);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [created.id]);
  assert.equal((await qq.list()).some((row) => row.id === pendingId), false);
  assert.equal((await qq.list("alpha")).some((row) => row.id === pendingId), false);
  assert.equal(qq.alias(pendingId), undefined);
  assert.equal(qq.resolve(pendingId), undefined);
  await assert.rejects(() => qq.read(pendingId), /not found/);
  await assert.rejects(() => qq.inspect(pendingId), /not found/);
  assert.equal(persisted.has(pendingId), false);
  assert.equal(scopeRecord(pendingId), undefined);
  releaseFlush();
  const deferred = await pendingHome;
  assert.equal(deferred.id, pendingId);
  assert.deepEqual(scopeRecord(deferred.id), {
    scope: "home",
    context: "scratch",
    cwd: deferred.cwd,
  });
  assert.ok(qq.alias(deferred.id));
  assert.equal(qq.resolve(deferred.id), deferred.id);
  assert.equal((await qq.read(deferred.id)).scope, "home");
  assert.equal((await qq.inspect(deferred.id)).live, true);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [deferred.id, created.id]);
  await qq.close(deferred.id);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [created.id]);

  const later = await qq.createHome();
  writeFileSync(join(later.cwd, "notes.txt"), "scratch file\n");
  const homes = await qq.listHome();
  assert.deepEqual(homes.map((row) => row.id), [later.id, created.id]);
  assert.equal((await qq.latestHome()).id, later.id);
  assert.equal((await qq.list("alpha")).some((row) => row.id === later.id), false);
  assert.equal((await qq.listProjects()).length, 2);

  const beforeReload = {
    live: live.size,
    disposed: disposed.length,
    deleted: deletedPaths.length,
    homes: (await qq.listHome()).length,
  };
  await qq.list("alpha");
  await qq.listHome();
  await qq.read(created.id);
  await qq.read(bootId);
  await qq.inspect(created.id);
  assert.deepEqual({
    live: live.size,
    disposed: disposed.length,
    deleted: deletedPaths.length,
    homes: (await qq.listHome()).length,
  }, beforeReload, "reload/list/read change no Home lifecycle");

  live.get(created.id).setStatus("running");
  await assert.rejects(() => qq.close(created.id), /close is unavailable while this session is running/);
  await assert.rejects(() => qq.replace(created.id), /clear is unavailable while this session is running/);
  assert.equal(live.has(created.id), true);
  assert.equal(existsSync(created.cwd), true);
  live.get(created.id).setStatus("idle");

  const closedOrder = [];
  deleteOrder = (step) => { closedOrder.push(step); };
  const closed = await qq.close(created.id);
  deleteOrder = undefined;
  assert.deepEqual(closedOrder, ["dispose", "delete"]);
  assert.equal(closed.closed, created.id);
  assert.equal(closed.scope, "home");
  assert.equal(closed.context, "scratch");
  assert.equal(closed.id, later.id);
  assert.equal("project" in closed, false);
  assert.equal(live.has(created.id), false);
  assert.equal(persisted.has(created.id), true, "close preserves durable history");
  assert.equal(existsSync(created.cwd), false);
  assert.deepEqual(scopeRecord(created.id), {
    scope: "home",
    context: "scratch",
    cwd: join(scratchRoot, created.id),
  }, "close retains the qq Home scope record");
  const inspectedClosed = await qq.inspect(created.id);
  assert.equal(inspectedClosed.live, false);
  assert.equal(inspectedClosed.scope, "home");
  assert.equal(inspectedClosed.context, "scratch");
  assert.equal(inspectedClosed.cwd, join(scratchRoot, created.id));
  await assert.rejects(() => qq.read(created.id), /not active/);

  failNextCreate = true;
  const beforeFailedCreate = {
    live: live.size,
    homes: (await qq.listHome()).map((row) => row.id),
    disposed: disposed.length,
    dirs: sessionDirs(),
  };
  await assert.rejects(() => qq.createHome(), /create failed/);
  assert.equal(live.size, beforeFailedCreate.live);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), beforeFailedCreate.homes);
  assert.equal(disposed.length, beforeFailedCreate.disposed);
  assert.deepEqual(sessionDirs(), beforeFailedCreate.dirs, "failed create leaves no unpublished Home workspace");

  failNextFlush = true;
  await assert.rejects(() => qq.createHome(), /flush failed/);
  assert.equal(live.has(later.id), true, "flush failure leaves the old Home session truthful");
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [later.id]);
  assert.deepEqual(sessionDirs(), [later.id]);

  failNextScopePut = true;
  const homesBeforeScopeFail = (await qq.listHome()).map((row) => row.id);
  await assert.rejects(() => qq.createHome(), /scope put failed/);
  assert.equal(live.has(later.id), true, "scope-store failure leaves the old Home session truthful");
  assert.deepEqual((await qq.listHome()).map((row) => row.id), homesBeforeScopeFail);
  assert.deepEqual(sessionDirs(), [later.id]);
  const failedScopeId = creates.at(-1).sessionId;
  assert.equal(scopeRecord(failedScopeId), undefined);
  await assert.rejects(() => qq.read(failedScopeId), /not found/);
  await assert.rejects(() => qq.inspect(failedScopeId), /not found/);

  failNextFlush = true;
  failNextDispose = true;
  const homesBeforeCombined = (await qq.listHome()).map((row) => row.id);
  await assert.rejects(() => qq.createHome(), (error) => {
    assert.match(String(error.message), /home session create failed/);
    assert.equal(error.sessionId, creates.at(-1).sessionId);
    assert.equal(error.path, join(scratchRoot, creates.at(-1).sessionId));
    return true;
  });
  const failedPublishId = creates.at(-1).sessionId;
  assert.equal(live.has(failedPublishId), true, "dispose failure leaves the unpublished Agent live");
  assert.equal(existsSync(join(scratchRoot, failedPublishId)), true, "cleanup failure retains the marker-verifiable workspace");
  assert.equal(readFileSync(join(scratchRoot, failedPublishId, MARKER_NAME), "utf8").includes(failedPublishId), true);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), homesBeforeCombined);
  assert.equal(persisted.has(failedPublishId), false);
  await qq.close(failedPublishId);
  assert.equal(live.has(failedPublishId), false);
  assert.equal(existsSync(join(scratchRoot, failedPublishId)), false);

  failNextCreate = true;
  await assert.rejects(() => qq.replace(later.id), /create failed/);
  assert.equal(live.has(later.id), true);
  assert.equal(existsSync(later.cwd), true);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [later.id]);

  failNextFlush = true;
  await assert.rejects(() => qq.replace(later.id), /flush failed/);
  assert.equal(live.has(later.id), true, "failed replace publication leaves the old Home session");
  assert.equal(existsSync(later.cwd), true);
  assert.deepEqual((await qq.listHome()).map((row) => row.id), [later.id]);

  failNextDispose = true;
  const publishedBeforeDisposeFail = live.size;
  await assert.rejects(() => qq.replace(later.id), /dispose failed/);
  assert.equal(live.has(later.id), true, "failed old dispose leaves the old Home agent");
  assert.equal(live.size, publishedBeforeDisposeFail + 1, "published replacement stays live after old dispose failure");
  const afterDisposeFail = await qq.listHome();
  assert.equal(afterDisposeFail.length, 2);
  const replacementAfterDisposeFail = afterDisposeFail.find((row) => row.id !== later.id);
  assert.ok(replacementAfterDisposeFail);
  assert.equal(existsSync(later.cwd), true);
  assert.equal(existsSync(replacementAfterDisposeFail.cwd), true);

  const leftoverHandle = live.get(replacementAfterDisposeFail.id)?.[AGENT_HANDLE];
  assert.ok(leftoverHandle);
  leftoverHandle.dispose = async () => {
    disposed.push(replacementAfterDisposeFail.id);
    live.delete(replacementAfterDisposeFail.id);
  };
  await qq.close(replacementAfterDisposeFail.id);
  assert.equal((await qq.listHome()).length, 1);

  failDeletePath = later.cwd;
  await assert.rejects(() => qq.close(later.id), (error) => {
    assert.match(String(error.message), /home session delete failed/);
    assert.equal(error.sessionId, later.id);
    assert.equal(error.path, later.cwd);
    return true;
  });
  assert.equal(live.has(later.id), false, "Agent is disposed even when scratch delete fails");
  assert.equal(existsSync(later.cwd), true, "failed delete leaves the marker-verifiable workspace");
  assert.equal(readFileSync(join(later.cwd, MARKER_NAME), "utf8").includes(later.id), true);

  const recovered = await qq.createHome();
  const projectCreated = await qq.create("alpha");
  assert.equal(projectCreated.scope, "project");
  assert.equal(projectCreated.context, "project");
  assert.equal(projectCreated.project, "alpha");
  assert.equal(projectCreated.cwd, projects.cwd);
  const beforeProjectClose = deletedPaths.filter((path) => path.startsWith(scratchRoot)).length;
  const closedProject = await qq.close(projectCreated.id);
  assert.equal(closedProject.scope, "project");
  assert.equal(closedProject.project, "alpha");
  assert.equal(
    deletedPaths.filter((path) => path.startsWith(scratchRoot)).length,
    beforeProjectClose,
    "project close never deletes scratch",
  );

  const projectForReplace = await qq.create("alpha");
  const replacedProject = await qq.replace(projectForReplace.id);
  assert.equal(replacedProject.scope, "project");
  assert.equal(replacedProject.project, "alpha");
  assert.equal(
    deletedPaths.filter((path) => path.startsWith(scratchRoot)).length,
    beforeProjectClose,
    "project replace never deletes scratch",
  );
  await qq.close(replacedProject.id);

  const homeForReplace = await qq.createHome();
  const replacedHome = await qq.replace(homeForReplace.id);
  assert.equal(replacedHome.scope, "home");
  assert.equal(replacedHome.context, "scratch");
  assert.equal(replacedHome.closed, homeForReplace.id);
  assert.equal(live.has(homeForReplace.id), false);
  assert.equal(existsSync(homeForReplace.cwd), false);
  assert.equal(existsSync(replacedHome.cwd), true);
  assert.equal(persisted.has(homeForReplace.id), true);

  const fromHomeNew = await qq.prompt(replacedHome.id, "/new");
  assert.equal(fromHomeNew.kind, "navigate");
  assert.equal(fromHomeNew.action, "create");
  assert.equal(fromHomeNew.scope, "home");
  assert.equal(fromHomeNew.context, "scratch");
  assert.equal(live.has(replacedHome.id), true, "/new leaves the selected Home session live");
  assert.equal("project" in fromHomeNew, false);

  const fromHomeClear = await qq.prompt(fromHomeNew.id, "/clear");
  assert.equal(fromHomeClear.action, "replace");
  assert.equal(fromHomeClear.scope, "home");
  assert.equal(live.has(fromHomeNew.id), false);
  assert.equal(existsSync(join(scratchRoot, fromHomeNew.id)), false);

  const fromProjectNew = await qq.prompt(bootId, "/new");
  assert.equal(fromProjectNew.action, "create");
  assert.equal(fromProjectNew.scope, "project");
  assert.equal(fromProjectNew.project, "alpha");
  assert.equal(fromProjectNew.cwd, projects.cwd);

  const fromProjectClear = await qq.prompt(fromProjectNew.id, "/clear");
  assert.equal(fromProjectClear.action, "replace");
  assert.equal(fromProjectClear.scope, "project");
  assert.equal(fromProjectClear.project, "alpha");
  await qq.close(fromProjectClear.id);
  await qq.close(fromHomeClear.id);
  await qq.close(replacedHome.id);
  await qq.close(recovered.id);

  const liveHome = await qq.createHome();
  const mismatchId = "session-63a11000-0000-4000-8000-0000000000c7";
  writeOwnedMarker(join(scratchRoot, mismatchId), mismatchId);
  const scopePayload = JSON.parse(readFileSync(scopeFile, "utf8"));
  scopePayload.sessions[mismatchId] = {
    scope: "home",
    context: "scratch",
    cwd: join(scratchRoot, "wrong"),
  };
  writeFileSync(scopeFile, `${JSON.stringify(scopePayload)}\n`);
  writeOwnedMarker(join(scratchRoot, orphanId), orphanId);
  writeFileSync(join(scratchRoot, "notes.txt"), "keep\n");
  mkdirSync(join(scratchRoot, "not-a-session"));
  writeFileSync(join(scratchRoot, "not-a-session", "file.txt"), "unrelated\n");
  const markedProjectId = join(scratchRoot, bootId);
  writeOwnedMarker(markedProjectId, bootId);

  const restartLive = new Map(live);
  const restartPersisted = new Map(persisted);
  const restartWarnings = [];
  const restartCtx = {
    logger: { warn: (...args) => { restartWarnings.push(args); } },
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => restartLive.get(id),
          list: () => [...restartLive.values()],
          async create() { throw new Error("restart must not create"); },
          async resume() { throw new Error("restart must not resume"); },
        };
      }
      if (name === "sessions") return { async flush() {} };
      if (name === "sessionPersistence") {
        return { async list() { return [...restartPersisted.values()]; } };
      }
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };
  const restarted = createQqService(restartCtx, qqConfig(projects, bootId));
  const restartedHomes = await restarted.listHome();
  assert.deepEqual(restartedHomes.map((row) => row.id), [liveHome.id]);
  assert.equal(existsSync(liveHome.cwd), true);
  assert.equal(existsSync(join(scratchRoot, orphanId)), false, "exact marked orphan is deleted");
  assert.equal(existsSync(join(scratchRoot, mismatchId)), true, "mismatched sidecar data must not authorize deletion");
  assert.equal(existsSync(join(scratchRoot, later.id)), false, "closed leftover is reconciled as an orphan");
  assert.deepEqual(scopeRecord(liveHome.id), {
    scope: "home",
    context: "scratch",
    cwd: liveHome.cwd,
  });
  assert.equal(existsSync(join(scratchRoot, "notes.txt")), true);
  assert.equal(existsSync(join(scratchRoot, "not-a-session", "file.txt")), true);
  assert.equal(
    existsSync(markedProjectId),
    false,
    "a project Agent id does not make a marked scratch orphan a live owned Home workspace",
  );
  assert.equal(existsSync(projects.cwd), true);
  assert.equal(existsSync(betaCwd), true);
  assert.equal(restartLive.has(bootId), true);
  assert.equal(restartLive.has(childId), true);
  assert.equal(restartLive.has(nestedId), true);
  assert.equal((await restarted.list("alpha")).some((row) => row.id === liveHome.id), false);
  assert.equal((await restarted.listProjects()).some((project) => /home|scratch/i.test(project.name)), false);
  assert.doesNotMatch(JSON.stringify(creates), /transition|attachWorkflow|selectedWorkflow/);
} finally {
  projects.remove();
}

const repoRoot = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const toolchain = join(repoRoot, "dsh");
const cordisEntry = join(toolchain, "node_modules/@deepseek-ai/cordis/lib/index.js");
if (!existsSync(cordisEntry)) {
  execFileSync("npm", ["ci", "--prefix", toolchain, "--no-audit", "--no-fund"], {
    stdio: "inherit",
  });
}
const { Context } = await import(pathToFileURL(cordisEntry).href);
const SessionStore = (await import(pathToFileURL(join(toolchain, "node_modules/@deepseek-ai/dsh-session/lib/index.js")).href)).default;
const JsonlSessionPersistence = (await import(pathToFileURL(join(toolchain, "node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js")).href)).default;

const boundary = makeProjectsHome("alpha");
const persistRoot = mkdtempSync(join(tmpdir(), "qq-home-jsonl."));
try {
  const boot = "session-73a11000-0000-4000-8000-0000000000a1";
  const live = new Map();
  const disposed = [];
  const host = new Context();
  await host.plugin(SessionStore);
  await host.plugin(JsonlSessionPersistence, { root: persistRoot, compression: "none" });
  const realSessions = host.get("sessions");
  const realPersistence = host.get("sessionPersistence");
  assert.ok(realSessions);
  assert.ok(realPersistence);

  const bootSession = realSessions.create(boot, { meta: { cwd: boundary.cwd } });
  bootSession.append("session/end-seed", {});
  await realSessions.flush(bootSession);
  const bootAgent = {
    session: bootSession,
    status: "idle",
    followup() {},
    cancel() {},
    whenIdle: async () => {},
  };
  live.set(boot, bootAgent);
  attachHandle(bootAgent, async () => {
    disposed.push(boot);
    live.delete(boot);
  });

  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => live.get(id),
          list: () => [...live.values()],
          async create(options) {
            const session = realSessions.create(options.sessionId, {
              meta: options.meta,
            });
            session.append("session/end-seed", {});
            const agent = {
              session,
              status: "idle",
              followup() {},
              cancel() {},
              whenIdle: async () => {},
            };
            live.set(options.sessionId, agent);
            attachHandle(agent, async () => {
              disposed.push(options.sessionId);
              live.delete(options.sessionId);
            });
            options.setup?.({ on() { return () => {}; } });
            return {
              agent,
              async dispose() {
                disposed.push(options.sessionId);
                live.delete(options.sessionId);
              },
            };
          },
          async resume() {
            throw new Error("silent resume must not happen");
          },
        };
      }
      if (name === "sessions") return realSessions;
      if (name === "sessionPersistence") return realPersistence;
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };

  const qq = createQqService(ctx, qqConfig(boundary, boot));
  const created = await qq.createHome();
  const header = created && live.get(created.id)?.session?.header;
  assert.ok(header);
  assert.equal(Object.isFrozen(header), true);
  assert.deepEqual(
    Object.keys(header).sort(),
    ["createdAt", "cwd", "id", "version"].sort(),
  );
  assert.equal("scope" in header, false);
  assert.equal("context" in header, false);
  assert.equal(header.cwd, created.cwd);
  assert.throws(() => { header.scope = "home"; });
  assert.throws(() => { header.context = "scratch"; });

  const listed = await realPersistence.list();
  const stored = listed.find((row) => row.id === created.id);
  assert.ok(stored);
  assert.equal("scope" in stored, false);
  assert.equal("context" in stored, false);
  assert.equal(stored.cwd, created.cwd);
  assert.deepEqual(scopeRecordAt(join(boundary.root, "session-scope.json"), created.id), {
    scope: "home",
    context: "scratch",
    cwd: created.cwd,
  });

  const closed = await qq.close(created.id);
  assert.equal(closed.closed, created.id);
  assert.equal(existsSync(created.cwd), false);
  assert.deepEqual(scopeRecordAt(join(boundary.root, "session-scope.json"), created.id), {
    scope: "home",
    context: "scratch",
    cwd: created.cwd,
  });

  const restartLive = new Map([[boot, live.get(boot)]]);
  const restartCtx = {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => restartLive.get(id),
          list: () => [...restartLive.values()],
          async create() { throw new Error("restart must not create"); },
          async resume() { throw new Error("restart must not resume"); },
        };
      }
      if (name === "sessions") return realSessions;
      if (name === "sessionPersistence") return realPersistence;
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };
  const restarted = createQqService(restartCtx, qqConfig(boundary, boot));
  const inspected = await restarted.inspect(created.id);
  assert.equal(inspected.live, false);
  assert.equal(inspected.scope, "home");
  assert.equal(inspected.context, "scratch");
  assert.equal(inspected.cwd, created.cwd);
  const relisted = await realPersistence.list();
  const restorable = relisted.find((row) => row.id === created.id);
  assert.ok(restorable);
  assert.equal("scope" in restorable, false);
  assert.equal("context" in restorable, false);
} finally {
  boundary.remove();
  rmSync(persistRoot, { recursive: true, force: true });
}

function scopeRecordAt(file, sessionId) {
  if (!existsSync(file)) return undefined;
  const payload = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(payload.schema, SCOPE_SCHEMA);
  return payload.sessions?.[sessionId];
}

console.log("test-qq-home: pass");
