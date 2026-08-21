#!/usr/bin/env node
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const module = await import(pathToFileURL(join(root, "qq/src/skill-tool.mjs")));
const plugin = await import(pathToFileURL(join(root, "qq/src/plugin.mjs")));
const { attachSkillToolVisibility, internals } = module;

assert.equal(internals.SKILL_TOOL, "skill");
assert.equal(internals.modelInvocable({ invocation: { modelInvocable: true } }), true);
assert.equal(internals.modelInvocable({ invocation: { modelInvocable: false } }), false);
assert.equal(internals.modelInvocable({}), true);
assert.equal(plugin.inject.includes("agents"), true);

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeAgent(id, { restrict } = {}) {
  const denials = [];
  const tools = {
    restrict(filter) {
      denials.push(filter);
      return restrict ? restrict(filter) : () => denials.push({ lifted: filter });
    },
  };
  return {
    id,
    denials,
    session: { header: { cwd: `/tmp/${id}` } },
    ctx: {
      tools,
      get(name, strict) {
        if (name === "tools") return tools;
        if (strict === false) return undefined;
        throw new Error(`missing ${name}`);
      },
    },
  };
}

function makeCtx({ agents = [], snapshot, onError } = {}) {
  const listeners = new Map();
  const live = [...agents];
  const snapshots = [];
  const effects = [];
  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          list: () => live,
          get: (id) => live.find((agent) => agent.id === id),
        };
      }
      if (name === "skills") {
        return {
          async snapshot(options) {
            snapshots.push(options);
            if (typeof snapshot === "function") return snapshot(options);
            return snapshot ?? { skills: [], complete: true };
          },
        };
      }
      if (name === "tools") return live[0]?.ctx.tools;
      return undefined;
    },
    on(name, listener) {
      const list = listeners.get(name) ?? [];
      list.push(listener);
      listeners.set(name, list);
      return () => {
        const current = listeners.get(name) ?? [];
        listeners.set(name, current.filter((item) => item !== listener));
      };
    },
    effect(fn) {
      effects.push(fn);
      return fn();
    },
    async emit(name, ...args) {
      let result;
      for (const listener of listeners.get(name) ?? []) {
        try {
          result = await listener(...args);
        } catch (error) {
          onError?.(error);
        }
      }
      return result;
    },
    snapshots,
    effects,
    live,
    listeners,
  };
  return ctx;
}

{
  const agent = makeAgent("empty");
  const ctx = makeCtx({ agents: [agent] });
  attachSkillToolVisibility(ctx);
  await tick();
  assert.deepEqual(agent.denials, [{ deny: ["skill"] }]);
  assert.equal(ctx.snapshots[0].cwd, "/tmp/empty");
  assert.equal(ctx.snapshots[0].scope, agent);
}

{
  const agent = makeAgent("present");
  const ctx = makeCtx({
    agents: [agent],
    snapshot: {
      complete: true,
      skills: [{ name: "qq-proof", invocation: { modelInvocable: true } }],
    },
  });
  attachSkillToolVisibility(ctx);
  await tick();
  assert.deepEqual(agent.denials, []);
}

{
  const agent = makeAgent("user-only");
  const ctx = makeCtx({
    agents: [agent],
    snapshot: {
      complete: true,
      skills: [{ name: "hidden", invocation: { modelInvocable: false, userInvocable: true } }],
    },
  });
  attachSkillToolVisibility(ctx);
  await tick();
  assert.deepEqual(agent.denials, [{ deny: ["skill"] }]);
}

{
  const agent = makeAgent("incomplete");
  const ctx = makeCtx({
    agents: [agent],
    snapshot: { complete: false, skills: [] },
  });
  attachSkillToolVisibility(ctx);
  await tick();
  assert.deepEqual(agent.denials, []);
}

{
  const agent = makeAgent("created");
  const ctx = makeCtx({ agents: [] });
  attachSkillToolVisibility(ctx);
  await tick();
  ctx.live.push(agent);
  await ctx.emit("agent/created", { agent });
  await tick();
  assert.deepEqual(agent.denials, [{ deny: ["skill"] }]);
}

{
  const agent = makeAgent("change");
  let catalog = { complete: true, skills: [] };
  const ctx = makeCtx({
    agents: [agent],
    snapshot: () => catalog,
  });
  attachSkillToolVisibility(ctx);
  await tick();
  assert.deepEqual(agent.denials, [{ deny: ["skill"] }]);
  catalog = {
    complete: true,
    skills: [{ name: "qq-proof", invocation: { modelInvocable: true } }],
  };
  await ctx.emit("skills/change");
  await tick();
  assert.equal(agent.denials.at(-1).lifted.deny[0], "skill");
}

{
  const agent = makeAgent("assemble-empty");
  const ctx = makeCtx({ agents: [agent] });
  attachSkillToolVisibility(ctx);
  const result = await ctx.emit(
    "system-prompt/assemble",
    { tools: [{ name: "read" }, { name: "skill" }, { name: "bash" }] },
    { agent, scope: agent },
    async () => ({ tools: [{ name: "read" }, { name: "skill" }, { name: "bash" }] }),
  );
  assert.deepEqual(result, { tools: [{ name: "read" }, { name: "bash" }] });
}

{
  const agent = makeAgent("assemble-present");
  const ctx = makeCtx({
    agents: [agent],
    snapshot: {
      complete: true,
      skills: [{ name: "qq-proof", invocation: { modelInvocable: true } }],
    },
  });
  attachSkillToolVisibility(ctx);
  const result = await ctx.emit(
    "system-prompt/assemble",
    { tools: [{ name: "skill" }, { name: "read" }] },
    { agent, scope: agent },
    async () => ({ tools: [{ name: "skill" }, { name: "read" }] }),
  );
  assert.deepEqual(result, { tools: [{ name: "skill" }, { name: "read" }] });
}

{
  const agent = makeAgent("missing-restrict");
  delete agent.ctx.tools.restrict;
  const ctx = makeCtx({ agents: [agent] });
  attachSkillToolVisibility(ctx);
  const result = await ctx.emit(
    "system-prompt/assemble",
    { tools: [{ name: "skill" }, { name: "read" }] },
    { agent },
    async () => ({ tools: [{ name: "skill" }, { name: "read" }] }),
  );
  assert.deepEqual(result, { tools: [{ name: "read" }] });
}

{
  const source = String(plugin.apply);
  assert.match(source, /attachSkillToolVisibility/);
  assert.match(source, /inject\(\["tools", "skills"\]/);
}

console.log("test-qq-skill-tool: pass");
