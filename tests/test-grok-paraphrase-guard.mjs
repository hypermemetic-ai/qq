import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const {
  default: register,
  assistantText,
  isGrok46,
  jaccard,
  normalizeText,
} = await import(pathToFileURL(join(root, "extensions/grok-paraphrase-guard.ts")));

const STALL = [
  "I have the spawn and review seams. Next I’ll pin the remaining APIs, then implement workshop spawn and the `done`/`qa`/`land` chain.",
  "I have the spawn and review shape. Next I’ll pin the last APIs, then implement workshop spawn and the `done`/`qa`/`land` chain as two commits.",
  "I’ll pin the last APIs, then implement workshop spawn and the `done`/`qa`/`land` chain as two commits.",
  "I’ll pin the last APIs, then implement spawn and the `done`/`qa`/`land` chain as two commits.",
  "The last batch died mid-read. I’ll recover those APIs, then implement spawn and the `done`/`qa`/`land` chain as two commits.",
];

function turn(text, tools = []) {
  return {
    type: "turn_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "ignore me" },
        ...(text ? [{ type: "text", text }] : []),
        ...tools.map((tool, index) => ({
          type: "toolCall",
          id: `call-${index}`,
          name: tool.name,
          arguments: tool.arguments ?? {},
        })),
      ],
    },
  };
}

function harness(model = { id: "grok-4.6", provider: "xai" }) {
  const events = new Map();
  const notices = [];
  const navigated = [];
  let aborted = 0;
  let leaf = "leaf-0";
  const branch = [{ id: "leaf-0", type: "message", message: { role: "assistant" } }];
  const ctx = {
    model,
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
    async play(text, tools) {
      await this.emit("turn_start", { type: "turn_start" });
      await this.emit("turn_end", turn(text, tools));
    },
    setLeaf(id, entry = { type: "message", message: { role: "assistant" } }) {
      leaf = id;
      const existing = branch.find((item) => item.id === id);
      if (existing) Object.assign(existing, entry, { id });
      else branch.push({ id, ...entry });
    },
    setModel(next) { ctx.model = next; },
  };
}

assert.equal(normalizeText("  Foo\n\tBAR  "), "foo bar");
assert.equal(isGrok46({ model: { id: "grok-4.6" } }), true);
assert.equal(isGrok46({ model: { id: "gpt-5.6-sol" } }), false);
assert.equal(assistantText(turn("short")), "");
assert.ok(assistantText(turn(STALL[0])).length >= 40);

for (let i = 1; i < STALL.length; i += 1) {
  const score = jaccard(normalizeText(STALL[i - 1]).slice(0, 240), normalizeText(STALL[i]).slice(0, 240));
  assert.ok(score >= 0.6, `stall line ${i} vs ${i - 1} scored ${score}`);
}

{
  const h = harness();
  h.setLeaf("good");
  for (const text of STALL.slice(0, 4)) await h.play(text);
  assert.equal(h.aborted, 0);
  await h.play("", [{ name: "read", arguments: { path: "x" } }]);
  await h.play(STALL[4]);
  assert.equal(h.aborted, 1);
  await h.emit("agent_settled");
  assert.deepEqual(h.navigated, [{ id: "good", options: { summarize: false } }]);
  assert.match(h.notices.at(-1).message, /rewound/);
}

{
  const h = harness();
  h.setLeaf("good");
  for (const text of STALL) await h.play(text);
  await h.emit("agent_settled");
  assert.equal(h.navigated.length, 1);
  h.setLeaf("after-rewind");
  for (const text of STALL) await h.play(text);
  await h.emit("agent_settled");
  assert.equal(h.aborted, 2);
  assert.equal(h.navigated.length, 1);
  assert.match(h.notices.at(-1).message, /after rewind; stopped/);
}

{
  const h = harness({ id: "gpt-5.6-sol", provider: "openai-codex" });
  h.setLeaf("good");
  for (const text of STALL) await h.play(text);
  await h.emit("agent_settled");
  assert.equal(h.aborted, 0);
  assert.deepEqual(h.navigated, []);
}

{
  const h = harness();
  await h.play(STALL[0]);
  await h.play("Completely different work: I will now rewrite the overlay CSS tokens and stop talking about spawn.");
  await h.play(STALL[1]);
  await h.play(STALL[2]);
  await h.play(STALL[3]);
  assert.equal(h.aborted, 0);
}

{
  const h = harness();
  h.setLeaf("prompt", { type: "message", message: { role: "user" } });
  for (const text of STALL) await h.play(text);
  await h.emit("agent_settled");
  assert.equal(h.aborted, 1);
  assert.deepEqual(h.navigated, []);
  assert.match(h.notices.at(-1).message, /similar turns; stopped/);
}

console.log("test-grok-paraphrase-guard: pass");
