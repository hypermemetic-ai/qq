import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const { default: register, fingerprintTurn, normalizeText, usableRewindTarget } = await import(
  pathToFileURL(join(root, "extensions/loop-guard.ts"))
);

function turn(text, tools = []) {
  return {
    type: "turn_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "ignore me", thinkingSignature: "x" },
        { type: "text", text },
        ...tools.map((tool, index) => ({
          type: "toolCall",
          id: `call-${index}-${Math.random()}`,
          name: tool.name,
          arguments: tool.arguments,
        })),
      ],
    },
    toolResults: [],
  };
}

function harness() {
  const events = new Map();
  const notices = [];
  const navigated = [];
  let aborted = 0;
  let leaf = "leaf-0";
  const branch = [{ id: "leaf-0", type: "message", message: { role: "assistant" } }];
  const ctx = {
    abort() { aborted += 1; },
    navigateTree(id, options) {
      navigated.push({ id, options });
      leaf = id;
      branch.push({ id: `after-${id}`, type: "message", message: { role: "assistant" } });
    },
    sessionManager: {
      getLeafId() { return leaf; },
      getBranch() { return branch; },
    },
    ui: { notify(message, type) { notices.push({ message, type }); } },
  };
  register({
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
  });
  return {
    notices,
    navigated,
    get aborted() { return aborted; },
    async emit(name, event = {}) {
      for (const fn of events.get(name) ?? []) await fn(event, ctx);
    },
    async play(text) {
      await this.emit("turn_start", { type: "turn_start" });
      await this.emit("turn_end", turn(text));
    },
    setLeaf(id, entry = { type: "message", message: { role: "assistant" } }) {
      leaf = id;
      const existing = branch.find((item) => item.id === id);
      if (existing) Object.assign(existing, entry, { id });
      else branch.push({ id, ...entry });
    },
  };
}

assert.equal(normalizeText("  foo\n\tbar  "), "foo bar");
assert.equal(
  fingerprintTurn(turn("Hello  world", [{ name: "read", arguments: { path: "a" } }])),
  fingerprintTurn(turn("Hello world", [{ name: "read", arguments: { path: "a" } }])),
);
assert.notEqual(
  fingerprintTurn(turn("Hello world", [{ name: "read", arguments: { path: "a" } }])),
  fingerprintTurn(turn("Hello world", [{ name: "read", arguments: { path: "b" } }])),
);
assert.equal(fingerprintTurn({ message: { role: "user", content: [{ type: "text", text: "x" }] } }), "");
assert.equal(
  usableRewindTarget([{ id: "u", type: "message", message: { role: "user" } }], "u"),
  undefined,
);
assert.equal(
  usableRewindTarget([{ id: "a", type: "message", message: { role: "assistant" } }], "a"),
  "a",
);

{
  const h = harness();
  h.setLeaf("good");
  for (let i = 0; i < 4; i += 1) await h.play("again");
  assert.equal(h.aborted, 0);
  assert.deepEqual(h.navigated, []);
  await h.play("again");
  assert.equal(h.aborted, 1);
  assert.deepEqual(h.navigated, []);
  await h.emit("agent_settled");
  assert.deepEqual(h.navigated, [{ id: "good", options: { summarize: false } }]);
  assert.match(h.notices.at(-1).message, /rewound/);
}

{
  const h = harness();
  h.setLeaf("good");
  for (let i = 0; i < 5; i += 1) await h.play("loop");
  await h.emit("agent_settled");
  assert.equal(h.navigated.length, 1);
  h.setLeaf("after-rewind");
  for (let i = 0; i < 5; i += 1) await h.play("loop-again");
  await h.emit("agent_settled");
  assert.equal(h.aborted, 2);
  assert.equal(h.navigated.length, 1);
  assert.match(h.notices.at(-1).message, /after rewind; stopped/);
}

{
  const h = harness();
  await h.play("one");
  await h.play("two");
  await h.play("one");
  await h.play("one");
  await h.play("one");
  await h.play("one");
  assert.equal(h.aborted, 0);
  await h.play("one");
  assert.equal(h.aborted, 1);
}

{
  const h = harness();
  h.setLeaf("good");
  await h.play("same");
  await h.emit("session_tree");
  for (let i = 0; i < 4; i += 1) await h.play("same");
  assert.equal(h.aborted, 0);
}

{
  const h = harness();
  h.setLeaf("prompt", { type: "message", message: { role: "user" } });
  for (let i = 0; i < 5; i += 1) await h.play("loop");
  await h.emit("agent_settled");
  assert.equal(h.aborted, 1);
  assert.deepEqual(h.navigated, []);
  assert.match(h.notices.at(-1).message, /identical turns; stopped/);
}

console.log("test-loop-guard: pass");
