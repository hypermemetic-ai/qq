#!/usr/bin/env node
import assert from "node:assert/strict";
import { createQqService } from "../qq/src/session.mjs";

const sessionId = "session-63a11000-0000-4000-8000-000000000071";
const followups = [];
const flushed = [];
const executed = [];
const events = [];

const agent = {
  session: { id: sessionId, events },
  status: "idle",
  followup(message) { followups.push(message); },
  whenIdle: async () => {},
};

const commands = {
  parseCommand(line) {
    const match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
    if (!match) return undefined;
    return { name: match[1], rawInput: line.slice(match[0].length) };
  },
  async execute(target, line, signal) {
    executed.push({ target, line, signal });
    const parsed = commands.parseCommand(line);
    if (!parsed || parsed.name !== "workflows") return undefined;
    events.push({ type: "command/run", data: { name: parsed.name, args: parsed.rawInput } });
    events.push({ type: "command/done", data: { kind: "success", text: "architect selected" } });
    return { commandId: "cmd-test-1", result: { kind: "success", text: "architect selected" } };
  },
};

const qq = createQqService(
  {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => (id === sessionId ? agent : undefined),
          list: () => [agent],
        };
      }
      if (name === "sessions") return { async flush(session) { flushed.push(session.id); } };
      if (name === "sessionPersistence") {
        return { async list() { return [{ id: sessionId, createdAt: 1, cwd: "/work" }]; } };
      }
      if (name === "commands") return commands;
      return undefined;
    },
  },
  {
    sessionId,
    cwd: "/work",
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  },
);

const selected = await qq.prompt(sessionId, "/workflows architect");
assert.equal(selected, "architect selected");
assert.equal(followups.length, 0);
assert.equal(executed.length, 1);
assert.equal(executed[0].line, "/workflows architect");
assert.equal(executed[0].target, agent);
assert.ok(flushed.includes(sessionId));
assert.equal(events.some((event) => event.type === "command/run"), true);
assert.equal(events.some((event) => event.type === "user/message"), false);

await assert.rejects(
  () => qq.prompt(sessionId, "/not-a-command"),
  /unknown slash command/,
);
assert.equal(followups.length, 0);

await assert.rejects(
  () => qq.prompt(sessionId, "/mystery"),
  /unknown slash command \/mystery/,
);
assert.equal(followups.length, 0);

await qq.prompt(sessionId, "ordinary talking turn");
assert.equal(followups.length, 1);
assert.equal(followups[0].content[0].text, "ordinary talking turn");

{
  const findFollowups = [];
  const findFlushed = [];
  const findPrompts = [];
  let findMode = true;
  const findAgent = {
    session: { id: sessionId, events: [] },
    status: "idle",
    followup(message) { findFollowups.push(message); },
    whenIdle: async () => {},
  };
  const findQq = createQqService(
    {
      get(name, optional) {
        if (name === "agents") {
          return {
            get: (id) => (id === sessionId ? findAgent : undefined),
            list: () => [findAgent],
          };
        }
        if (name === "sessions") return { async flush(session) { findFlushed.push(session.id); } };
        if (name === "sessionPersistence") {
          return { async list() { return [{ id: sessionId, createdAt: 1, cwd: "/work" }]; } };
        }
        if (name === "image-finder") {
          return {
            inFindMode: () => findMode,
            async handlePrompt({ rawInput }) {
              findPrompts.push(rawInput);
              return { kind: "success", text: `Finding ${rawInput}.` };
            },
          };
        }
        if (optional) return undefined;
        return undefined;
      },
    },
    {
      sessionId,
      cwd: "/work",
      provider: "qwen-token-plan",
      model: "deepseek-v4-pro-0813",
    },
  );
  const notice = await findQq.prompt(sessionId, "tall woman rain");
  assert.equal(notice, "Finding tall woman rain.");
  assert.deepEqual(findPrompts, ["tall woman rain"]);
  assert.equal(findFollowups.length, 0);
  assert.ok(findFlushed.includes(sessionId));
}

const missingCommands = createQqService(
  {
    get(name) {
      if (name === "agents") {
        return { get: (id) => (id === sessionId ? agent : undefined), list: () => [agent] };
      }
      if (name === "sessions") return { async flush() {} };
      if (name === "sessionPersistence") {
        return { async list() { return [{ id: sessionId, createdAt: 1, cwd: "/work" }]; } };
      }
      return undefined;
    },
  },
  {
    sessionId,
    cwd: "/work",
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  },
);
await assert.rejects(
  () => missingCommands.prompt(sessionId, "/workflows"),
  /slash commands require ctx.commands/,
);

{
  const disposed = [];
  const live = new Map();
  const persisted = [];
  const fake = (id) => ({
    session: { id, events: [], header: { createdAt: Date.now(), cwd: "/work" } },
    status: "idle",
    followup() {},
    cancel() {},
    whenIdle: async () => {},
  });
  const closeQq = createQqService(
    {
      get(name) {
        if (name === "agents") {
          return {
            get: (id) => live.get(id),
            list: () => [...live.values()],
            async create({ sessionId: id }) {
              const agent = fake(id);
              live.set(id, agent);
              persisted.push({ id, createdAt: Date.now(), cwd: "/work" });
              return {
                agent,
                async dispose() {
                  disposed.push(id);
                  live.delete(id);
                  const at = persisted.findIndex((row) => row.id === id);
                  if (at >= 0) persisted.splice(at, 1);
                },
              };
            },
          };
        }
        if (name === "sessions") return { async flush() {} };
        if (name === "sessionPersistence") {
          return { async list() { return [...persisted]; } };
        }
        if (name === "loader") return { async await() {} };
        return undefined;
      },
    },
    {
      sessionId,
      cwd: "/work",
      provider: "qwen-token-plan",
      model: "deepseek-v4-pro-0813",
    },
  );
  const first = await closeQq.create();
  const second = await closeQq.create();
  const closed = await closeQq.close(first.id);
  assert.deepEqual(disposed, [first.id]);
  assert.equal(closed.closed, first.id);
  assert.notEqual(closed.id, first.id);
  assert.ok([second.id, sessionId].includes(closed.id));
  await assert.rejects(() => closeQq.read(first.id), /not found/);
  live.set(sessionId, agent);
  await assert.rejects(() => closeQq.close(sessionId), /not closeable/);
}

console.log("test-session-prompt: pass");
