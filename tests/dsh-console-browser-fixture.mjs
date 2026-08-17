#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { attachObserve } from "../qq/src/session.mjs";
import { createConsoleHandler } from "../qq-ui/src/http-app.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--live");
const endpointFile = args[0];
const liveAssets = process.argv.includes("--live") || process.env.QQ_DESIGN_LOOP_LIVE === "1";
if (!endpointFile) throw new Error("usage: dsh-console-browser-fixture.mjs <endpoint-file> [--live]");

const primaryId = "session-63a11000-0000-4000-8000-000000000021";
const secondaryId = "session-63a11000-0000-4000-8000-000000000022";
const states = new Map([
  [primaryId, { id: primaryId, createdAt: Date.UTC(2026, 7, 16, 12), events: [], turn: 0, status: "idle" }],
  [secondaryId, { id: secondaryId, createdAt: Date.UTC(2026, 7, 15, 12), events: [], turn: 0, status: "idle" }],
]);
let connects = 0;
let flushes = 0;
const pending = new Map();
const streams = new Set();

function append(state, type, data, surfaceOp) {
  state.events.push({
    type,
    seq: state.events.length,
    time: Date.now(),
    data,
    ...(surfaceOp ? { surfaceOp } : {}),
  });
}

const backend = {
  defaultSessionId: primaryId,
  async list() {
    return [...states.values()].map(({ id, createdAt }) => ({ id, createdAt, cwd: "/proof" }));
  },
  async create() {
    const id = `session-${randomUUID()}`;
    states.set(id, {
      id,
      createdAt: Date.now(),
      events: [],
      turn: 0,
      status: "idle",
    });
    flushes += 1;
    return { id };
  },
  async read(id) {
    const state = states.get(id);
    if (!state) {
      const error = new Error("DSH session not found");
      error.status = 404;
      throw error;
    }
    return { id, events: state.events, agentStatus: state.status };
  },
  async prompt(id, text) {
    const state = states.get(id);
    state.turn += 1;
    state.status = "running";
    append(state, "turn/start", { turn: state.turn });
    append(state, "user/message", {
      id: `user-${id}-${state.turn}`,
      role: "user",
      source: { kind: "user" },
      content: [{ type: "text", text }],
    }, "append");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        append(state, "assistant/message", {
          turn: state.turn,
          step: 1,
          message: {
            id: `assistant-${id}-${state.turn}`,
            role: "assistant",
            source: { kind: "model", provider: "fixture", model: "proof" },
            content: [{ type: "text", text: `Browser durable reply ${state.turn}` }],
          },
        }, "append");
        append(state, "turn/end", { turn: state.turn, reason: { kind: "completed" } });
        state.status = "idle";
        pending.delete(id);
        resolve();
      }, text.includes("interrupt") ? 30_000 : 650);
      pending.set(id, { timer, resolve, turn: state.turn });
    });
    flushes += 1;
  },
  async interrupt(id) {
    const state = states.get(id);
    const active = pending.get(id);
    if (!active) return false;
    clearTimeout(active.timer);
    append(state, "turn/end", {
      turn: active.turn,
      reason: { kind: "aborted", reason: { kind: "user" } },
    });
    state.status = "idle";
    pending.delete(id);
    active.resolve();
    flushes += 1;
    return true;
  },
};
const consoleHandler = createConsoleHandler(attachObserve(backend, { intervalMs: 30 }), { ssePollMs: 30, liveAssets });

const server = createServer((req, res) => {
  if (req.url === "/__proof/state") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ connects, flushes, streams: streams.size }));
    return;
  }
  if (req.url === "/__proof/disconnect") {
    const count = streams.size;
    for (const stream of [...streams]) stream.destroy();
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ disconnected: count }));
    return;
  }
  if (req.url?.endsWith("/events")) {
    connects += 1;
    streams.add(res);
    res.once("close", () => streams.delete(res));
  }
  void consoleHandler(req, res);
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture has no TCP address");
  await writeFile(endpointFile, `http://127.0.0.1:${address.port}\n`, { mode: 0o600 });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    for (const active of pending.values()) clearTimeout(active.timer);
    for (const stream of streams) stream.destroy();
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
  });
}
