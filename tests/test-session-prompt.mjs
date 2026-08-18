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

await qq.prompt(sessionId, "/workflows architect");
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

console.log("test-session-prompt: pass");
