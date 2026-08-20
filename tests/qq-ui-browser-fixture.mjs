#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { projectConversation } from "../qq/src/conversation.mjs";
import { attachObserve } from "../qq/src/session.mjs";
import { createConsoleHandler } from "../qq-ui/src/http-app.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--live");
const endpointFile = args[0];
const liveAssets = process.argv.includes("--live") || process.env.QQ_DESIGN_LOOP_LIVE === "1";
if (!endpointFile) throw new Error("usage: qq-ui-browser-fixture.mjs <endpoint-file> [--live]");

const primaryId = "session-63a11000-0000-4000-8000-000000000021";
const secondaryId = "session-63a11000-0000-4000-8000-000000000022";
const newState = (id, createdAt) => ({
  id,
  createdAt,
  events: [],
  turn: 0,
  status: "idle",
  inbox: { nextTurn: [], nextStep: [] },
});
const states = new Map([
  [primaryId, newState(primaryId, Date.UTC(2026, 7, 16, 12))],
  [secondaryId, newState(secondaryId, Date.UTC(2026, 7, 15, 12))],
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
    ...(surfaceOp === undefined ? {} : { surfaceOp }),
  });
}

function userMessage(text, id = `user-${randomUUID()}`) {
  return { id, role: "user", source: { kind: "user" }, content: [{ type: "text", text }] };
}

function resultMessage(callId, content, isError = false) {
  return {
    id: `result-${randomUUID()}`,
    role: "user",
    source: { kind: "tool", callId },
    content: [{ type: "tool-result", toolCallId: callId, content, ...(isError ? { isError: true } : {}) }],
  };
}

function splice(state, target, start, deleteCount, inserted, outcome) {
  const list = target === "next-turn" ? state.inbox.nextTurn : state.inbox.nextStep;
  append(state, "agent/inbox/spliced", {
    target,
    start,
    ...(deleteCount ? { removedCount: deleteCount } : {}),
    inserted,
    ...(outcome ? { outcome } : {}),
  });
  return list.splice(start, deleteCount, ...inserted);
}

function schedule(active, delay, operation) {
  const timer = setTimeout(() => {
    active.timers.delete(timer);
    if (!active.cancelled) operation();
  }, delay);
  active.timers.add(timer);
}

function finishFixtureTurn(state, active) {
  const { turn } = active;
  schedule(active, 300, () => append(state, "assistant/chunk", {
    turn, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "Checking the deterministic fixture" },
  }));
  schedule(active, 650, () => append(state, "assistant/chunk", {
    turn, step: 1, chunk: { type: "text-delta", index: 1, text: "Working through the fixture." },
  }));
  schedule(active, 1_000, () => append(state, "assistant/message", {
    turn,
    step: 1,
    message: {
      id: `assistant-${state.id}-${turn}-1`,
      role: "assistant",
      source: { kind: "model", provider: "fixture", model: "proof" },
      content: [
        { type: "reasoning", text: "Checking the deterministic fixture" },
        { type: "text", text: "Working through the fixture." },
      ],
    },
  }, "append"));
  schedule(active, 1_300, () => {
    append(state, "tool/call", {
      turn, step: 1, callId: `read-${turn}`, name: "read", arguments: '{"path":"README.md"}',
      callView: { card: "generic", title: "Read README.md", kind: "read" },
    });
    append(state, "tool/call", {
      turn, step: 1, callId: `bash-${turn}`, name: "bash", arguments: '{"command":"exit 2"}',
      callView: { card: "terminal", title: "exit 2" },
    });
    append(state, "tool/call", {
      turn, step: 1, callId: `media-${turn}`, name: "screenshot", arguments: "{}",
      callView: { card: "generic", title: "Capture screen", kind: "other" },
    });
  });
  schedule(active, 2_000, () => append(state, "tool/result", {
    turn,
    step: 1,
    message: resultMessage(`read-${turn}`, [{ type: "text", text: "Fixture read completed." }]),
    resultView: { card: "read", path: "README.md", offset: 1, totalLines: 1, lines: [{ number: 1, text: "Fixture read completed." }] },
  }, "append"));
  schedule(active, 2_500, () => append(state, "tool/result", {
    turn,
    step: 1,
    message: resultMessage(`bash-${turn}`, [{ type: "text", text: "fixture non-zero output" }]),
    resultView: { card: "terminal", output: "fixture non-zero output", exitCode: 2 },
  }, "append"));
  schedule(active, 3_000, () => append(state, "tool/result", {
    turn,
    step: 1,
    message: resultMessage(`media-${turn}`, [{ type: "image", attachment: { width: 412, height: 915 } }]),
  }, "append"));
  schedule(active, 60_000, () => {
    const steering = splice(state, "next-step", 0, state.inbox.nextStep.length, []);
    if (steering.length > 0) {
      for (const message of steering) append(state, "user/message", message, "append");
      append(state, "step/start", { turn, step: 2 });
      append(state, "assistant/chunk", {
        turn, step: 2, chunk: { type: "reasoning-delta", index: 0, text: "Applying every pending steer together" },
      });
      append(state, "assistant/chunk", {
        turn, step: 2, chunk: { type: "text-delta", index: 1, text: "Steering batch accepted." },
      });
      append(state, "assistant/message", {
        turn,
        step: 2,
        message: {
          id: `assistant-${state.id}-${turn}-2`,
          role: "assistant",
          source: { kind: "model", provider: "fixture", model: "proof" },
          content: [
            { type: "reasoning", text: "Applying every pending steer together" },
            { type: "text", text: "Steering batch accepted." },
          ],
        },
      }, "append");
    }
  });
  schedule(active, 120_000, () => {
    append(state, "turn/end", { turn, reason: { kind: "completed" } });
    state.status = "idle";
    pending.delete(state.id);
    flushes += 1;
  });
}

const fixtureFiles = Object.freeze({
  "README.md": {
    project: "proof", path: "README.md", name: "README.md", kind: "markdown", size: 112,
    text: "# Project proof\n\nA calm read-only Markdown document with a [safe link](https://example.com).\n\n<script>not html</script>\n",
  },
  "notes.txt": {
    project: "proof", path: "notes.txt", name: "notes.txt", kind: "text", size: 61,
    text: "The compact drawer keeps this plain text readable and quiet.\n",
  },
  "src/fixture.js": {
    project: "proof", path: "src/fixture.js", name: "fixture.js", kind: "code", language: "javascript", size: 45,
    text: "export const fixture = \"project drawer\";\n",
  },
});

const backend = {
  defaultSessionId: primaryId,
  defaultProject: "proof",
  listProjects() {
    return [{ name: "proof", cwd: "/proof" }, { name: "second-project", cwd: "/second-project" }];
  },
  listProjectFiles(project, path = "") {
    if (!project) {
      return {
        scope: "projects", project: null, path: "", parent: null,
        breadcrumbs: [{ type: "projects", name: "projects", path: null }],
        entries: this.listProjects().map(({ name }) => ({ type: "project", project: name, name })),
      };
    }
    if (project !== "proof" && project !== "second-project") {
      const error = new Error("qq: project not found");
      error.status = 404;
      throw error;
    }
    if (project === "second-project") {
      return {
        scope: "project", project, path: "", parent: null,
        breadcrumbs: [{ type: "projects", name: "projects", path: null }, { type: "project", name: project, path: "" }],
        entries: [],
      };
    }
    if (path === "src") {
      return {
        scope: "project", project, path, parent: "",
        breadcrumbs: [
          { type: "projects", name: "projects", path: null },
          { type: "project", name: project, path: "" },
          { type: "directory", name: "src", path: "src" },
        ],
        entries: [
          { type: "directory", name: "components", path: "src/components" },
          { type: "file", name: "fixture.js", path: "src/fixture.js", kind: "code", language: "javascript" },
        ],
      };
    }
    if (path === "src/components") {
      return {
        scope: "project", project, path, parent: "src",
        breadcrumbs: [
          { type: "projects", name: "projects", path: null },
          { type: "project", name: project, path: "" },
          { type: "directory", name: "src", path: "src" },
          { type: "directory", name: "components", path: "src/components" },
        ],
        entries: [{ type: "file", name: "intentionally-very-long-component-filename-for-truncation.ts", path: "src/components/intentionally-very-long-component-filename-for-truncation.ts", kind: "code", language: "typescript" }],
      };
    }
    return {
      scope: "project", project, path: "", parent: null,
      breadcrumbs: [{ type: "projects", name: "projects", path: null }, { type: "project", name: project, path: "" }],
      entries: [
        { type: "directory", name: "src", path: "src" },
        { type: "file", name: "README.md", path: "README.md", kind: "markdown" },
        { type: "file", name: "notes.txt", path: "notes.txt", kind: "text" },
        { type: "file", name: "guide.pdf", path: "guide.pdf", kind: "binary", mediaType: "application/pdf", disposition: "inline" },
      ],
    };
  },
  readProjectFile(project, path) {
    const file = fixtureFiles[path];
    if (project !== "proof" || !file) {
      const error = new Error("qq: unsupported file type");
      error.status = 415;
      throw error;
    }
    return file;
  },
  openProjectFile(project, path, options = {}) {
    if (project !== "proof" || path !== "guide.pdf") {
      const error = new Error("qq: unsupported file type");
      error.status = 415;
      throw error;
    }
    const body = Buffer.from("%PDF-1.4 fixture");
    return { project, path, name: "guide.pdf", kind: "binary", mediaType: "application/pdf", disposition: "inline", size: body.length, ...(options.includeBody === false ? {} : { body }) };
  },
  async list(project) {
    if (project === "second-project") return [];
    return [...states.values()].map(({ id, createdAt }) => ({ id, createdAt, cwd: "/proof", project: "proof" }));
  },
  async create(project = "proof") {
    const id = `session-${randomUUID()}`;
    states.set(id, newState(id, Date.now()));
    flushes += 1;
    return { id, project };
  },
  async read(id) {
    const state = states.get(id);
    if (!state) {
      const error = new Error("DSH session not found");
      error.status = 404;
      throw error;
    }
    return {
      id,
      events: state.events,
      conversation: projectConversation(state.events, { inbox: state.inbox }),
      canMutatePending: true,
      agentStatus: state.status,
      project: "proof",
      cwd: "/proof",
    };
  },
  async prompt(id, text) {
    const state = states.get(id);
    if (String(text).startsWith("/")) {
      const match = /^\/([a-z][a-z0-9_-]*)/.exec(String(text));
      if (!match || !["workflows", "noop", "broken"].includes(match[1])) {
        const error = new Error(`qq: unknown slash command /${match?.[1] ?? ""}`);
        error.status = 400;
        throw error;
      }
      const commandId = `command-${randomUUID()}`;
      append(state, "command/run", { commandId, name: match[1], args: String(text).slice(match[0].length), source: { kind: "user" } });
      if (match[1] === "broken") {
        append(state, "command/done", { commandId, kind: "error", text: "Fixture command failed safely" });
        const error = new Error("Fixture command failed safely");
        error.status = 400;
        throw error;
      }
      const commandText = match[1] === "workflows" ? "iterate selected" : undefined;
      append(state, "command/done", { commandId, kind: "success", ...(commandText ? { text: commandText } : {}) });
      flushes += 1;
      return commandText ?? "";
    }
    const message = userMessage(text);
    if (state.status === "running") {
      splice(state, "next-step", state.inbox.nextStep.length, 0, [message]);
      flushes += 1;
      return { kind: "accepted", mode: "steer", messageId: message.id };
    }
    splice(state, "next-turn", state.inbox.nextTurn.length, 0, [message]);
    state.turn += 1;
    const turn = state.turn;
    state.status = "running";
    append(state, "turn/start", { turn });
    const [claimed] = splice(state, "next-turn", 0, 1, []);
    append(state, "user/message", claimed, "append");
    append(state, "step/start", { turn, step: 1 });
    const active = { turn, timers: new Set(), cancelled: false };
    pending.set(id, active);
    finishFixtureTurn(state, active);
    flushes += 1;
    return { kind: "accepted", mode: "followup", messageId: message.id };
  },
  async editPending(id, itemId, text) {
    const state = states.get(id);
    const at = state.inbox.nextStep.findIndex((message) => message.id === itemId);
    if (at < 0) {
      const error = new Error("pending message is no longer available");
      error.status = 409;
      throw error;
    }
    const replacement = { ...state.inbox.nextStep[at], content: [{ type: "text", text }] };
    splice(state, "next-step", at, 1, [replacement], "canceled");
    flushes += 1;
  },
  async removePending(id, itemId) {
    const state = states.get(id);
    const at = state.inbox.nextStep.findIndex((message) => message.id === itemId);
    if (at < 0) {
      const error = new Error("pending message is no longer available");
      error.status = 409;
      throw error;
    }
    splice(state, "next-step", at, 1, [], "canceled");
    flushes += 1;
  },
  async close(id) {
    if (!states.has(id)) {
      const error = new Error("DSH session not found");
      error.status = 404;
      throw error;
    }
    const remaining = [...states.keys()].filter((sessionId) => sessionId !== id);
    states.delete(id);
    const active = pending.get(id);
    if (active) {
      active.cancelled = true;
      for (const timer of active.timers) clearTimeout(timer);
    }
    pending.delete(id);
    if (remaining[0]) return { id: remaining[0], closed: id, project: "proof" };
    return { ...(await this.create("proof")), closed: id, project: "proof" };
  },
  async interrupt(id) {
    const state = states.get(id);
    const active = pending.get(id);
    if (!active) return false;
    active.cancelled = true;
    for (const timer of active.timers) clearTimeout(timer);
    append(state, "turn/end", {
      turn: active.turn,
      reason: { kind: "aborted", reason: { kind: "user" } },
    });
    state.status = "idle";
    pending.delete(id);
    flushes += 1;
    return true;
  },
};
const consoleHandler = createConsoleHandler(attachObserve(backend, { intervalMs: 30 }), { ssePollMs: 30, liveAssets });

const server = createServer((req, res) => {
  if (req.url === "/qq/dictate/client.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
    res.end('"use strict";\n');
    return;
  }
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
    for (const active of pending.values()) {
      active.cancelled = true;
      for (const timer of active.timers) clearTimeout(timer);
    }
    for (const stream of streams) stream.destroy();
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
  });
}
