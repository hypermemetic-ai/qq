#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const toolchain = join(root, "dsh");
const cordisEntry = join(toolchain, "node_modules/@deepseek-ai/cordis/lib/index.js");
if (!existsSync(cordisEntry)) {
  execFileSync("npm", ["ci", "--prefix", toolchain, "--no-audit", "--no-fund"], {
    stdio: "inherit",
  });
}

const { Context } = await import(pathToFileURL(cordisEntry).href);
const qqPlugin = await import(pathToFileURL(join(root, "qq/src/plugin.mjs")).href);
const uiPlugin = await import(pathToFileURL(join(root, "qq-ui/src/plugin.mjs")).href);
const { createQqService } = await import(pathToFileURL(join(root, "qq/src/session.mjs")).href);

const sessionId = "session-63a11000-0000-4000-8000-000000000031";
const state = { id: sessionId, events: [], createdAt: Date.UTC(2026, 7, 17, 12), turn: 0 };
const liveAgents = new Map();
let flushes = 0;
let prompts = 0;
const hostPid = process.pid;

function append(type, data, surfaceOp) {
  state.events.push({
    type,
    seq: state.events.length,
    time: Date.now(),
    data,
    ...(surfaceOp ? { surfaceOp } : {}),
  });
}

function fakeAgent() {
  let status = "idle";
  let timer;
  let settle;
  let activity = Promise.resolve();
  return {
    session: { id: state.id, events: state.events, header: { createdAt: state.createdAt, cwd: root } },
    get status() { return status; },
    followup(message) {
      assert.equal(status, "idle");
      prompts += 1;
      state.turn += 1;
      status = "running";
      append("turn/start", { turn: state.turn });
      append("user/message", message, "append");
      activity = new Promise((resolveActivity) => {
        settle = resolveActivity;
        timer = setTimeout(() => {
          append("assistant/message", {
            turn: state.turn,
            step: 1,
            message: {
              id: `assistant-${state.turn}`,
              role: "assistant",
              source: { kind: "model", provider: "local", model: "proof" },
              content: [{ type: "text", text: `Fiber reply ${state.turn}` }],
            },
          }, "append");
          append("turn/end", { turn: state.turn, reason: { kind: "completed" } });
          status = "idle";
          settle = undefined;
          resolveActivity();
        }, 400);
      });
    },
    cancel(cause) {
      assert.deepEqual(cause, { kind: "user" });
      if (status !== "running") return;
      clearTimeout(timer);
      append("turn/end", { turn: state.turn, reason: { kind: "aborted", reason: cause } });
      status = "idle";
      const resolveActivity = settle;
      settle = undefined;
      resolveActivity?.();
    },
    whenIdle() { return activity; },
  };
}

const services = {
  agents: {
    get: (id) => liveAgents.get(id),
    list: () => [...liveAgents.values()],
    async resume(options) {
      const agent = fakeAgent();
      options.setup?.({ on() { return () => {}; } });
      liveAgents.set(options.resumeSessionId, agent);
      return { agent };
    },
    async create(options) {
      const agent = fakeAgent();
      options.setup?.({ on() { return () => {}; } });
      liveAgents.set(options.sessionId, agent);
      return { agent };
    },
  },
  sessions: {
    async flush(session) {
      assert.equal(session.id, sessionId);
      flushes += 1;
    },
  },
  sessionPersistence: {
    async list() {
      return [{ id: sessionId, version: 0, createdAt: state.createdAt, cwd: root }];
    },
  },
};

const routes = [];
const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const route = routes.find((entry) =>
    entry.kind === "prefix"
      ? url.pathname === entry.path || url.pathname.startsWith(`${entry.path}/`)
      : url.pathname === entry.path,
  );
  if (!route) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("absent\n");
    return;
  }
  void route.handler(req, res);
});
await new Promise((resolveListen) => httpServer.listen(0, "127.0.0.1", resolveListen));
const address = httpServer.address();
assert.ok(address && typeof address !== "string");

const webServer = {
  host: "127.0.0.1",
  port: address.port,
  register(route) {
    if (routes.some((entry) => entry.kind === route.kind && entry.path === route.path)) {
      throw new Error(`duplicate ${route.kind} route ${route.path}`);
    }
    routes.push(route);
    return () => {
      const at = routes.indexOf(route);
      if (at >= 0) routes.splice(at, 1);
    };
  },
};

function request(path, options = {}) {
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path,
      method: options.method ?? "GET",
      agent: false,
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
    req.end(options.body);
  });
}

function openSse() {
  return new Promise((resolveOpen, rejectOpen) => {
    const messages = [];
    const waiters = new Set();
    let pending = "";
    let response;
    const req = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path: `/qq/session/${sessionId}/events`,
      method: "GET",
      agent: false,
      headers: { accept: "text/event-stream" },
    }, (res) => {
      response = res;
      const handle = {
        status: res.statusCode,
        messages,
        waitFor(pattern, after = 0, timeoutMs = 2_000) {
          const found = messages.slice(after).find((message) => pattern.test(message));
          if (found) return Promise.resolve(found);
          return new Promise((resolveWait, rejectWait) => {
            const waiter = { pattern, after, resolve: resolveWait };
            waiter.timer = setTimeout(() => {
              waiters.delete(waiter);
              rejectWait(new Error(`timed out waiting for SSE ${pattern}`));
            }, timeoutMs);
            waiters.add(waiter);
          });
        },
        closed: new Promise((resolveClosed) => res.once("close", resolveClosed)),
        close() {
          req.destroy();
          response?.destroy();
        },
      };
      const notify = () => {
        for (const waiter of [...waiters]) {
          const found = messages.slice(waiter.after).find((message) => waiter.pattern.test(message));
          if (!found) continue;
          clearTimeout(waiter.timer);
          waiters.delete(waiter);
          waiter.resolve(found);
        }
      };
      res.on("data", (chunk) => {
        pending += chunk.toString("utf8").replaceAll("\r", "");
        let boundary;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const block = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (!block.startsWith("event: session\n")) continue;
          messages.push(block.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n"));
          notify();
        }
      });
      resolveOpen(handle);
    });
    req.on("error", (error) => {
      if (error.code !== "ECONNRESET") rejectOpen(error);
    });
    req.end();
  });
}

assert.deepEqual(qqPlugin.inject, ["agents", "sessions", "sessionPersistence"]);
assert.equal(qqPlugin.provide, "qq");
assert.deepEqual(uiPlugin.inject, ["qq", "webServer"]);
assert.doesNotMatch(String(createQqService), /<!doctype html>|htmx|text\/css/);

const ctx = new Context();
ctx.provide("agents", services.agents);
ctx.provide("sessions", services.sessions);
ctx.provide("sessionPersistence", services.sessionPersistence);
ctx.provide("webServer", webServer);

const qqFiber = ctx.plugin(qqPlugin, {
  sessionId,
  cwd: root,
  provider: "qwen-token-plan",
  model: "deepseek-v4-pro-0813",
});
await qqFiber;
const qq = ctx.get("qq");
assert.equal(qq.defaultSessionId, sessionId);

const uiFiber = ctx.plugin(uiPlugin, { basePath: "/qq", ssePollMs: 20 });
await uiFiber;
assert.equal(routes.length, 1);

const page = await request("/qq/");
assert.equal(page.status, 200);
assert.match(page.body, /Operator console/);

const stream = await openSse();
await stream.waitFor(/<form id="composer"/);

const promptStarted = qq.prompt(sessionId, "in-flight fiber turn");
await stream.waitFor(/<form id="interrupt-form"/);
const agent = liveAgents.get(sessionId);
assert.ok(agent);
assert.equal(agent.status, "running");

await uiFiber.dispose();
assert.equal(routes.length, 0, "qq-ui disposal must drop its webServer routes");
await stream.closed;
const missing = await request("/qq/");
assert.equal(missing.status, 404);

assert.equal(process.pid, hostPid);
assert.equal(ctx.get("qq"), qq, "qq service instance must survive qq-ui disposal");
assert.equal(liveAgents.get(sessionId), agent);
assert.equal(agent.status, "running", "in-flight Agent turn must continue without qq-ui");
assert.equal(prompts, 1);

const uiAgain = ctx.plugin(uiPlugin, { basePath: "/qq", ssePollMs: 20 });
await uiAgain;
assert.equal(ctx.get("qq"), qq);
const restored = await request("/qq/");
assert.equal(restored.status, 200);
assert.match(restored.body, /<form id="interrupt-form"/);

const streamAgain = await openSse();
await streamAgain.waitFor(/<form id="interrupt-form"/);
await promptStarted;
assert.equal(agent.status, "idle");
const completed = await streamAgain.waitFor(/Fiber reply 1/);
assert.match(completed, /<form id="composer"/);
assert.equal(prompts, 1, "qq-ui must not duplicate or queue the in-flight prompt");
assert.ok(flushes >= 1, "durable flush remains on the qq service");
assert.equal((state.events.filter((event) => event.type === "user/message")).length, 1);

streamAgain.close();
await uiAgain.dispose();
await qqFiber.dispose();
httpServer.closeAllConnections?.();
await new Promise((resolveClose) => httpServer.close(resolveClose));

console.log("test-qq-ui-fiber: pass");
