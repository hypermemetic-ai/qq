#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createQqService } from "../qq/src/session.mjs";
import { MARKER_NAME, MARKER_SCHEMA } from "../qq/src/scratch.mjs";
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
  let failDeletePath;
  let deleteOrder;
  let createdAtSeq = 100;

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
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.context ? { context: options.context } : {}),
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
    if (!persisted.has(id)) {
      persisted.set(id, {
        id,
        createdAt,
        cwd,
        ...(header.scope ? { scope: header.scope } : {}),
        ...(header.context ? { context: header.context } : {}),
      });
    }
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

  fake(bootId, { cwd: projects.cwd, createdAt: 10, scope: "project", context: "project" });
  fake(childId, {
    cwd: projects.cwd,
    parentSession: bootId,
    origin: "subagent",
    createdAt: 90,
  });
  fake(nestedId, { cwd: join(projects.cwd, "nested"), createdAt: 80 });

  const ctx = {
    logger,
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
            return {
              agent: fake(id, {
                cwd,
                createdAt: createdAtSeq,
                scope: options.meta?.scope,
                context: options.meta?.context,
              }),
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
            if (failNextFlush) {
              failNextFlush = false;
              throw new Error("qq-home probe: flush failed");
            }
            flushes.push(session.id);
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
  assert.equal(creates.at(-1).meta.scope, "home");
  assert.equal(creates.at(-1).meta.context, "scratch");
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
  const inspectedClosed = await qq.inspect(created.id);
  assert.equal(inspectedClosed.live, false);
  assert.equal(inspectedClosed.scope, "home");
  assert.equal(inspectedClosed.context, "scratch");
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
  writeOwnedMarker(join(scratchRoot, orphanId), orphanId);
  writeFileSync(join(scratchRoot, "notes.txt"), "keep\n");
  mkdirSync(join(scratchRoot, "not-a-session"));
  writeFileSync(join(scratchRoot, "not-a-session", "file.txt"), "unrelated\n");
  const unmarked = join(scratchRoot, bootId);
  mkdirSync(unmarked, { mode: 0o700 });
  chmodSync(unmarked, 0o700);
  writeFileSync(join(unmarked, "not-a-marker.txt"), "project-looking\n");

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
  assert.equal(existsSync(join(scratchRoot, later.id)), false, "closed leftover is reconciled as an orphan");
  assert.equal(existsSync(join(scratchRoot, "notes.txt")), true);
  assert.equal(existsSync(join(scratchRoot, "not-a-session", "file.txt")), true);
  assert.equal(existsSync(unmarked), true);
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

console.log("test-qq-home: pass");
