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
  repeatedStreamBlock,
  SANITY_MESSAGE,
} = await import(pathToFileURL(join(root, "extensions/grok-paraphrase-guard.ts")));

const RUNAWAY = "I can also add tests to verify the new behavior. Just let me know how you'd like to proceed. ";
const OBSERVED_LONG_RUNAWAY = [
  "I hope this helps clarify things. Let me know if you have any questions or if there's more you'd like to explore. I can also help with any specific changes you'd like to make. What do you think?",
  "I appreciate the feedback on the T-16 discuss. It's helpful to see these edge cases. Let me know if there's anything else you'd like to discuss. I can also help with any specific changes you'd like to make. What do you think?",
].join(" ");

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

function harness(model = { id: "grok-4.6", provider: "xai" }, options = {}) {
  const events = new Map();
  const notices = [];
  const navigated = [];
  const applied = [];
  const sent = [];
  let aborted = 0;
  let effort;
  let leaf = "leaf-0";
  const branch = [{ id: "leaf-0", type: "message", message: { role: "assistant" } }];
  const fallback = {
    name: "sol-high",
    profile: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  };
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
    modelRegistry: {
      find(provider, id) {
        if (provider === fallback.profile.provider && id === fallback.profile.model) {
          return { provider, id, contextWindow: 200000 };
        }
        return undefined;
      },
    },
    ui: {
      notify(message, type) { notices.push({ message, type }); },
      setStatus() {},
    },
  };
  const pi = {
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    async setModel(next) { applied.push(next); ctx.model = next; return true; },
    setThinkingLevel(value) { effort = value; },
    getThinkingLevel() { return effort; },
    events: { emit() {} },
    sendUserMessage(message) { sent.push(message); },
  };
  register(pi, {
    readPolicy: async () => options.policy ?? {
      roles: { runner: { default: "grok-high", profiles: { "sol-high": fallback.profile } } },
    },
  });
  return {
    notices,
    navigated,
    applied,
    sent,
    get aborted() { return aborted; },
    get effort() { return effort; },
    async emit(name, event = {}) {
      for (const fn of events.get(name) ?? []) await fn(event, ctx);
    },
    async play(text, tools) {
      await this.emit("turn_start", { type: "turn_start" });
      await this.emit("turn_end", turn(text, tools));
    },
    async stream(text, type = "thinking_delta", chunkSize = 23) {
      await this.emit("turn_start", { type: "turn_start" });
      const before = aborted;
      for (let offset = 0; offset < text.length && aborted === before; offset += chunkSize) {
        await this.emit("message_update", {
          type: "message_update",
          assistantMessageEvent: { type, delta: text.slice(offset, offset + chunkSize) },
        });
      }
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
assert.equal(repeatedStreamBlock(RUNAWAY.repeat(2)), undefined);
assert.deepEqual(repeatedStreamBlock(RUNAWAY.repeat(3)), {
  repeats: 3,
  words: 19,
  text: "i can also add tests to verify the new behavior just let me know how you'd like to proceed",
});

for (let i = 1; i < STALL.length; i += 1) {
  const score = jaccard(normalizeText(STALL[i - 1]).slice(0, 240), normalizeText(STALL[i]).slice(0, 240));
  assert.ok(score >= 0.6, `stall line ${i} vs ${i - 1} scored ${score}`);
}

{
  const h = harness();
  h.setLeaf("good");
  await h.stream(`A useful opening with new information. ${RUNAWAY.repeat(39)}`);
  assert.equal(h.aborted, 1);
  await h.emit("agent_settled");
  assert.deepEqual(h.sent, [SANITY_MESSAGE]);
  assert.deepEqual(h.navigated, []);
  assert.deepEqual(h.applied, []);
  assert.match(h.notices.at(-1).message, /steered once/);
}

{
  const h = harness();
  h.setLeaf("good");
  await h.stream(RUNAWAY.repeat(3), "text_delta", 10_000);
  await h.emit("agent_settled");
  assert.deepEqual(h.sent, [SANITY_MESSAGE]);
}

{
  const h = harness();
  await h.stream(`A distinct introduction before the long repeated block. ${OBSERVED_LONG_RUNAWAY.repeat(3)}`);
  assert.equal(h.aborted, 1);
  await h.emit("agent_settled");
  assert.deepEqual(h.sent, [SANITY_MESSAGE]);
}

{
  const h = harness({ id: "gpt-5.6-sol", provider: "openai-codex" });
  await h.stream(RUNAWAY.repeat(39));
  await h.emit("agent_settled");
  assert.equal(h.aborted, 0);
  assert.deepEqual(h.sent, []);
}

{
  const h = harness();
  h.setLeaf("good");
  await h.stream(RUNAWAY.repeat(3));
  await h.emit("agent_settled");
  await h.stream(RUNAWAY.repeat(3));
  await h.emit("agent_settled");
  assert.equal(h.aborted, 2);
  assert.deepEqual(h.sent, [SANITY_MESSAGE]);
  assert.deepEqual(h.navigated, [{ id: "good", options: { summarize: false } }]);
  await h.stream(RUNAWAY.repeat(3));
  await h.emit("agent_settled");
  assert.equal(h.aborted, 3);
  assert.equal(h.applied.at(-1)?.id, "gpt-5.6-sol");
  assert.equal(h.effort, "xhigh");
}

{
  const h = harness();
  await h.stream(RUNAWAY.repeat(3));
  await h.emit("agent_settled");
  await h.play("First distinct completed response with enough content to count down the recovery window.");
  await h.play("Second distinct completed response that keeps making real progress on the requested work.");
  await h.play("Third distinct completed response finishes the short observation window without recurrence.");
  await h.stream(RUNAWAY.repeat(3));
  await h.emit("agent_settled");
  assert.equal(h.aborted, 2);
  assert.deepEqual(h.sent, [SANITY_MESSAGE, SANITY_MESSAGE]);
  assert.deepEqual(h.navigated, []);
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
  assert.equal(h.applied.at(-1)?.id, "gpt-5.6-sol");
  assert.equal(h.effort, "xhigh");
  assert.match(h.notices.at(-1).message, /switched to runner sol-high/);
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
