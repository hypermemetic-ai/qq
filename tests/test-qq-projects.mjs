#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsoleHandler, internals as httpInternals } from "../qq-ui/src/http-app.mjs";
import { renderSessionContent } from "../qq-ui/src/render.mjs";
import {
  compareSessionRecency,
  createQqService,
  isRootOperatorAgent,
  listProjectCatalog,
  resolveProjectsRoot,
  sessionRecency,
} from "../qq/src/session.mjs";
import { addProject, attachHandle, makeProjectsHome } from "./qq-projects-fixture.mjs";

const alphaId = "session-63a11000-0000-4000-8000-0000000000a1";
const betaId = "session-63a11000-0000-4000-8000-0000000000b2";
const gammaId = "session-63a11000-0000-4000-8000-0000000000c3";
const childId = "session-63a11000-0000-4000-8000-0000000000d4";
const nestedId = "session-63a11000-0000-4000-8000-0000000000e5";
const persistedOnly = "session-63a11000-0000-4000-8000-0000000000f6";

const projects = makeProjectsHome("alpha");
const alphaCwd = projects.cwd;
const betaCwd = addProject(projects.root, "beta");
mkdirSync(join(alphaCwd, "nested"));
const outside = makeProjectsHome("escape");
symlinkSync(outside.cwd, join(projects.root, "escaped"));
writeFileSync(join(projects.root, "file.txt"), "nope");

let emptyRoot;

try {
  assert.equal(resolveProjectsRoot(projects.root), projects.root);
  const catalog = listProjectCatalog(projects.root);
  assert.deepEqual(catalog.map((row) => row.name), ["alpha", "beta"]);
  assert.equal(catalog.find((row) => row.name === "escaped"), undefined);

  emptyRoot = mkdtempSync(join(tmpdir(), "qq-projects-empty."));
  const bare = { get() { return undefined; } };
  assert.throws(() => createQqService(bare, {
    sessionId: alphaId,
    cwd: alphaCwd,
    projectsRoot: emptyRoot,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  }), /projectsRoot has no operator projects/);
  assert.throws(() => createQqService(bare, {
    sessionId: alphaId,
    cwd: join(alphaCwd, "nested"),
    projectsRoot: projects.root,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  }), /cwd must equal one project root/);

  const live = new Map();
  const persisted = new Map([
    [persistedOnly, { id: persistedOnly, createdAt: 1, cwd: alphaCwd }],
  ]);
  const creates = [];
  const resumes = [];
  const flushes = [];
  const disposed = [];
  let failNextCreate = false;

  function fake(id, options = {}) {
    const cwd = options.cwd ?? alphaCwd;
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
    if (!persisted.has(id)) persisted.set(id, { id, createdAt, cwd });
    attachHandle(agent, async () => {
      disposed.push(id);
      live.delete(id);
    });
    return agent;
  }

  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => live.get(id),
          list: () => [...live.values()],
          async create(options) {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("qq-projects probe: create failed");
            }
            creates.push(options);
            const id = options.sessionId;
            const cwd = options.meta?.cwd;
            assert.ok(cwd === alphaCwd || cwd === betaCwd, "operator agents stay on a project root");
            return {
              agent: fake(id, { cwd, createdAt: Date.now() }),
              async dispose() {
                disposed.push(id);
                live.delete(id);
              },
            };
          },
          async resume(options) {
            resumes.push(options.resumeSessionId);
            throw new Error("silent resume must not happen");
          },
        };
      }
      if (name === "sessions") return { async flush(session) { flushes.push(session.id); } };
      if (name === "sessionPersistence") {
        return { async list() { return [...persisted.values()]; } };
      }
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };

  fake(alphaId, {
    cwd: alphaCwd,
    createdAt: 10,
    events: [{ type: "user/message", time: 40, seq: 0 }],
  });
  fake(betaId, {
    cwd: alphaCwd,
    createdAt: 30,
    events: [{ type: "user/message", time: 20, seq: 0 }],
  });
  fake(gammaId, { cwd: betaCwd, createdAt: 50 });
  fake(childId, { cwd: alphaCwd, parentSession: alphaId, origin: "subagent", createdAt: 90 });
  fake(nestedId, { cwd: join(alphaCwd, "nested"), createdAt: 80 });

  assert.equal(isRootOperatorAgent(live.get(childId)), false);
  assert.equal(isRootOperatorAgent(live.get(alphaId)), true);
  assert.equal(
    compareSessionRecency(
      sessionRecency(live.get(alphaId).session, 10),
      sessionRecency(live.get(betaId).session, 30),
    ) < 0,
    true,
    "later durable event wins over later createdAt",
  );

  const qq = createQqService(ctx, {
    sessionId: alphaId,
    cwd: alphaCwd,
    projectsRoot: projects.root,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  });

  const listedAlpha = await qq.list("alpha");
  assert.deepEqual(listedAlpha.map((row) => row.id), [alphaId, betaId]);
  assert.equal(listedAlpha.some((row) => row.id === persistedOnly), false);
  assert.equal(listedAlpha.some((row) => row.id === childId), false);
  assert.equal(listedAlpha.some((row) => row.id === nestedId), false);
  assert.equal(listedAlpha.some((row) => row.id === gammaId), false);

  const listedBeta = await qq.list("beta");
  assert.deepEqual(listedBeta.map((row) => row.id), [gammaId]);

  await assert.rejects(() => qq.read(persistedOnly), /not active/);
  const inspected = await qq.inspect(persistedOnly);
  assert.equal(inspected.live, false);
  assert.equal(resumes.length, 0);

  const created = await qq.create("alpha");
  assert.equal(created.project, "alpha");
  assert.equal(created.cwd, alphaCwd);
  const afterCreate = await qq.list("alpha");
  assert.equal(afterCreate.length, 3);
  assert.equal(flushes.includes(created.id), true);
  const otherRunning = live.get(gammaId);
  otherRunning.setStatus("running");
  assert.equal(live.get(gammaId).status, "running");

  live.get(betaId).setStatus("running");
  await assert.rejects(() => qq.replace(betaId), /clear is unavailable while this session is running/);
  await assert.rejects(() => qq.close(betaId), /close is unavailable while this session is running/);
  assert.equal(live.has(betaId), true);
  live.get(betaId).setStatus("idle");

  const beforeFailedReplace = (await qq.list("alpha")).length;
  failNextCreate = true;
  await assert.rejects(() => qq.replace(alphaId), /create failed/);
  assert.equal(failNextCreate, false);
  assert.equal(live.has(alphaId), true, "a failed /clear create leaves the old Agent active");
  assert.equal(disposed.length, 0, "a failed /clear create disposes nothing");
  assert.equal((await qq.list("alpha")).length, beforeFailedReplace, "a failed /clear create leaves no replacement");

  const beforeReplace = (await qq.list("alpha")).length;
  const replaced = await qq.replace(betaId);
  assert.equal(replaced.closed, betaId);
  assert.equal(replaced.project, "alpha");
  assert.equal(live.has(betaId), false);
  assert.equal(persisted.has(betaId), true, "replace leaves durable history");
  assert.equal((await qq.list("alpha")).length, beforeReplace);
  assert.equal(live.get(gammaId).status, "running", "other project running agent is untouched");

  const closed = await qq.close(created.id);
  assert.equal(closed.closed, created.id);
  assert.equal(closed.project, "alpha");
  assert.equal(live.has(created.id), false);
  assert.equal(persisted.has(created.id), true);
  assert.ok([alphaId, replaced.id].includes(closed.id));

  await qq.close(alphaId);
  await qq.close(replaced.id);
  const empty = await qq.list("alpha");
  assert.equal(empty.length, 0);
  live.get(gammaId).setStatus("idle");
  const last = await qq.close((await qq.list("beta"))[0].id);
  assert.equal(last.id, null);
  assert.equal(last.project, "beta");
  assert.equal((await qq.list("beta")).length, 0);
  assert.equal(resumes.length, 0);

  const server = createServer(createConsoleHandler(qq, { ssePollMs: 20 }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => new Promise((resolveRequest, reject) => {
    const body = options.body ?? "";
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: options.headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolveRequest({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
  const form = (fields = {}) => {
    const body = new URLSearchParams(fields).toString();
    return {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(body),
        origin,
        "sec-fetch-site": "same-origin",
      },
      body,
    };
  };

  try {
    const home = await request("/qq/");
    assert.equal(home.status, 303);
    assert.equal(home.headers.location, "/qq/project/alpha");

    const emptyProject = await request("/qq/project/alpha");
    assert.equal(emptyProject.status, 200);
    assert.match(emptyProject.body, /aria-label="New session">\+<\/button>/);
    assert.doesNotMatch(emptyProject.body, /id="transcript"|id="composer"|add session/);
    assert.match(emptyProject.body, /no live sessions/);

    const added = await request("/qq/project/alpha/sessions", form());
    assert.equal(added.status, 303);
    assert.match(added.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    const newId = added.headers.location.split("/").at(-1);
    const page = await request(added.headers.location);
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(`option value="${newId}" selected`));
    assert.match(page.body, /class="close-arm"/);
    assert.match(page.body, /close session /);
    assert.match(page.body, /history is kept/);
    assert.match(page.body, /class="close-keep"/);
    assert.match(page.body, /id="close-session"/);

    live.get(newId).setStatus("running");
    const runningClear = await request(`/qq/project/alpha/session/${newId}/prompt`, {
      ...form({ prompt: "/clear" }),
      headers: { ...form({ prompt: "/clear" }).headers, "hx-request": "true" },
    });
    assert.equal(runningClear.status, 409);
    assert.match(runningClear.body, /clear is unavailable while this session is running/);
    assert.equal(live.has(newId), true);
    const runningClose = await request(`/qq/project/alpha/session/${newId}/close`, {
      ...form(),
      headers: { ...form().headers, "hx-request": "true" },
    });
    assert.equal(runningClose.status, 409);
    assert.match(runningClose.body, /close is unavailable while this session is running/);
    live.get(newId).setStatus("idle");

    const cleared = await request(`/qq/project/alpha/session/${newId}/prompt`, form({ prompt: "/clear" }));
    assert.equal(cleared.status, 303);
    assert.match(cleared.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    assert.notEqual(cleared.headers.location, `/qq/project/alpha/session/${newId}`);
    assert.equal(live.has(newId), false);
    assert.equal(persisted.has(newId), true);

    const parallel = await request(`/qq/project/alpha/session/${cleared.headers.location.split("/").at(-1)}/prompt`, form({ prompt: "/new" }));
    assert.equal(parallel.status, 303);
    assert.match(parallel.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    assert.equal((await qq.list("alpha")).length, 2);

    const mismatch = await request(`/qq/project/beta/session/${cleared.headers.location.split("/").at(-1)}`);
    assert.equal(mismatch.status, 404);
    const inactiveLegacy = await request(`/qq/session/${persistedOnly}`);
    assert.equal(inactiveLegacy.status, 404);
    assert.match(inactiveLegacy.body, /not active/);
    assert.equal(resumes.length, 0);

    const parsed = httpInternals.parseProjectRoute("/qq", `/qq/project/alpha/session/${alphaId}/prompt`);
    assert.deepEqual(parsed, { project: "alpha", sessionId: alphaId, action: "prompt" });

    const emptyHtml = renderSessionContent({
      id: "",
      project: "alpha",
      events: [],
      sessions: [],
    }, httpInternals.routes("/qq", "", "alpha"));
    assert.match(emptyHtml, /aria-label="New session">\+<\/button>/);
    assert.doesNotMatch(emptyHtml, /id="transcript"|id="composer"|add session|close-arm/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("test-qq-projects: pass");
} finally {
  projects.remove();
  outside.remove();
  rmSync(emptyRoot, { recursive: true, force: true });
}
