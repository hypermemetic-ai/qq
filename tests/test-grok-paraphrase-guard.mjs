import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const {
  default: register,
  assistantText,
  CONTEXT_MARKER,
  CUSTOM_TYPE,
  detectExactSuffixCycle,
  extractThinking,
  isGrok46,
  jaccard,
  LOOP_MARKER,
  normalizeText,
  REDERIVED_MARKER,
  REDERIVED_RECOVERY,
  repeatedStreamBlock,
  SANITY_MESSAGE,
  sanitizeTaintedThinking,
  sanitizeThinking,
  STAGNATION_MARKER,
  STAGNATION_RECOVERY,
  STREAM_RECOVERY,
  STUCK_RECOVERY,
  StreamLoopDetector,
} = await import(pathToFileURL(join(root, "extensions/grok-paraphrase-guard.ts")));

const RUNAWAY = "I can also add tests to verify the new behavior. Just let me know how you'd like to proceed. ";
const OBSERVED_LONG_RUNAWAY = [
  "I hope this helps clarify things. Let me know if you have any questions or if there's more you'd like to explore. I can also help with any specific changes you'd like to make. What do you think?",
  "I appreciate the feedback on the T-16 discuss. It's helpful to see these edge cases. Let me know if there's anything else you'd like to discuss. I can also help with any specific changes you'd like to make. What do you think?",
].join(" ");

const STALL = [
  "I have the spawn and review seams. Next I’ll pin the remaining APIs, then implement run start and the `done`/`qa`/`land` chain.",
  "I have the spawn and review shape. Next I’ll pin the last APIs, then implement run start and the `done`/`qa`/`land` chain as two commits.",
  "I’ll pin the last APIs, then implement run start and the `done`/`qa`/`land` chain as two commits.",
  "I’ll pin the last APIs, then implement spawn and the `done`/`qa`/`land` chain as two commits.",
  "The last batch died mid-read. I’ll recover those APIs, then implement spawn and the `done`/`qa`/`land` chain as two commits.",
];

function turn(text, tools = [], thinking = "") {
  return {
    type: "turn_end",
    message: {
      role: "assistant",
      content: [
        ...(thinking ? [{ type: "thinking", thinking }] : [{ type: "thinking", thinking: "ignore me" }]),
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

function messageUpdate(delta, type = "thinking_delta") {
  return {
    type: "message_update",
    assistantMessageEvent: { type, delta },
  };
}

function harness(model = { id: "grok-4.6", provider: "xai" }, options = {}) {
  const events = new Map();
  const notices = [];
  const sent = [];
  let aborted = 0;
  const ctx = {
    model,
    abort() { aborted += 1; },
    ui: {
      notify(message, type) { notices.push({ message, type }); },
    },
  };
  const pi = {
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    sendMessage(message, options) { sent.push({ message, options }); },
  };
  register(pi, {
    createDetector: options.createDetector,
    semantic: options.semantic,
    sendMessage: options.sendMessage ?? ((message, sendOptions) => sent.push({ message, options: sendOptions })),
  });
  return {
    notices,
    sent,
    get aborted() { return aborted; },
    async emit(name, event = {}) {
      let result;
      for (const fn of events.get(name) ?? []) {
        const next = await fn(event, ctx);
        if (next !== undefined) result = next;
      }
      return result;
    },
    async play(text, extras = {}) {
      await this.emit("turn_start", { type: "turn_start" });
      const event = turn(text, extras.tools, extras.thinking);
      return this.emit("message_end", { type: "message_end", message: event.message });
    },
    async stream(text, type = "thinking_delta", chunkSize = 23) {
      await this.emit("turn_start", { type: "turn_start" });
      const before = aborted;
      for (let offset = 0; offset < text.length && aborted === before; offset += chunkSize) {
        await this.emit("message_update", messageUpdate(text.slice(offset, offset + chunkSize), type));
      }
      const message = {
        role: "assistant",
        content: type === "text_delta"
          ? [{ type: "text", text }]
          : [{ type: "thinking", thinking: text }, { type: "text", text: "visible wrap-up" }],
      };
      return this.emit("message_end", { type: "message_end", message });
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
assert.match(repeatedStreamBlock(RUNAWAY.repeat(3)), /exact 93-character cycle 3×/);
assert.equal(detectExactSuffixCycle("the ".repeat(44)), undefined);
assert.equal(detectExactSuffixCycle("the ".repeat(45)).repeats, 45);
assert.equal(detectExactSuffixCycle("the ".repeat(45)).unit, "the ");
assert.equal(SANITY_MESSAGE, STREAM_RECOVERY);

{
  const looped = turn("visible wrap-up", [], RUNAWAY.repeat(3));
  const cleaned = sanitizeThinking(looped.message, LOOP_MARKER);
  assert.equal(extractThinking(cleaned), "");
  assert.equal(cleaned.content[0].type, "text");
  assert.equal(cleaned.content[0].text, LOOP_MARKER);
  const gated = sanitizeTaintedThinking(looped.message, new Set([RUNAWAY.repeat(3)]));
  assert.equal(gated.content[0].text, CONTEXT_MARKER);
}

{
  const detector = new StreamLoopDetector();
  const fillers = [
    "Just doing it and pushing ahead while maintaining momentum without naming anything concrete yet.\n\n",
    "Pushing ahead and just doing it while maintaining momentum without naming anything concrete yet.\n\n",
    "Maintaining momentum and just doing it while pushing ahead without naming anything concrete yet.\n\n",
    "Just doing it while maintaining momentum and pushing ahead without naming anything concrete yet.\n\n",
    "Pushing ahead while maintaining momentum and just doing it without naming anything concrete yet.\n\n",
    "Maintaining momentum while pushing ahead and just doing it without naming anything concrete yet.\n\n",
    "Just doing it and maintaining momentum while pushing ahead without naming anything concrete yet.\n\n",
    "Pushing ahead and maintaining momentum while just doing it without naming anything concrete yet.\n\n",
    "Maintaining momentum and pushing ahead while just doing it without naming anything concrete yet.\n\n",
  ];
  let hit;
  for (const filler of fillers) {
    hit = detector.push(filler);
    if (hit) break;
  }
  assert.match(hit, /low-information segments/);
}

{
  const detector = new StreamLoopDetector();
  const paragraphs = [
    "Confirming the safety of the current approach before proceeding with the remaining work items now.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items soon.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items next.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items later.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items today.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items again.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items still.\n\n",
    "Confirming the safety of the current approach before proceeding with the remaining work items here.\n\n",
  ];
  let hit;
  for (const paragraph of paragraphs) {
    hit = detector.push(paragraph);
    if (hit) break;
  }
  assert.match(hit, /near-identical segments/);
}

for (let i = 1; i < STALL.length; i += 1) {
  const score = jaccard(normalizeText(STALL[i - 1]).slice(0, 240), normalizeText(STALL[i]).slice(0, 240));
  assert.ok(score >= 0.6, `stall line ${i} vs ${i - 1} scored ${score}`);
}

{
  const pushes = [];
  const h = harness(undefined, {
    createDetector() {
      return {
        push(delta) { pushes.push(["push", delta]); return undefined; },
        flush() { pushes.push(["flush"]); return undefined; },
      };
    },
  });
  await h.emit("turn_start", { type: "turn_start" });
  await h.emit("message_update", messageUpdate("hello"));
  await h.emit("message_update", messageUpdate(" world"));
  await h.emit("message_end", { type: "message_end", message: turn("").message });
  assert.deepEqual(pushes, [["push", "hello"], ["push", " world"], ["flush"]]);
}

{
  const h = harness();
  await h.emit("turn_start", { type: "turn_start" });
  await h.emit("message_update", messageUpdate("the ".repeat(44)));
  assert.equal(h.aborted, 0, "short cycles wait for four repeats covering 180 characters");
  await h.emit("message_update", messageUpdate("the ".repeat(32)));
  assert.equal(h.aborted, 1, "the next 128-character stride catches the settled short cycle");
}

{
  const h = harness();
  const rewritten = await h.stream(`A useful opening with new information. ${RUNAWAY.repeat(39)}`);
  assert.equal(h.aborted, 1);
  assert.equal(rewritten.message.content[0].text, LOOP_MARKER);
  assert.deepEqual(h.sent, [{
    message: { customType: CUSTOM_TYPE, content: STREAM_RECOVERY, display: true },
    options: { triggerTurn: true },
  }]);
  assert.match(h.notices.at(-1).message, /removed it from context/);
}

{
  const h = harness();
  const rewritten = await h.stream(RUNAWAY.repeat(3), "text_delta", 10_000);
  assert.equal(rewritten.message.content[0].text, LOOP_MARKER);
  assert.equal(h.sent[0].message.content, STREAM_RECOVERY);
}

{
  const h = harness();
  const rewritten = await h.stream(`A distinct introduction before the long repeated block. ${OBSERVED_LONG_RUNAWAY.repeat(3)}`);
  assert.equal(rewritten.message.content[0].text, LOOP_MARKER);
  assert.equal(h.sent[0].message.content, STREAM_RECOVERY);
}

{
  const h = harness({ id: "gpt-5.6-sol", provider: "openai-codex" });
  const rewritten = await h.stream(RUNAWAY.repeat(39));
  assert.equal(h.aborted, 0);
  assert.equal(rewritten, undefined);
  assert.deepEqual(h.sent, []);
}

{
  const h = harness();
  await h.stream(RUNAWAY.repeat(3));
  const rewritten = await h.stream(RUNAWAY.repeat(3));
  assert.equal(rewritten.message.content[0].text, LOOP_MARKER);
  assert.deepEqual(h.sent.map((item) => item.message.content), [STREAM_RECOVERY, STUCK_RECOVERY]);
}

{
  const h = harness();
  const first = await h.stream(RUNAWAY.repeat(3));
  const tainted = first.message.content.find((part) => part.type === "thinking") ? RUNAWAY.repeat(3) : undefined;
  const original = {
    role: "assistant",
    content: [{ type: "thinking", thinking: RUNAWAY.repeat(3) }, { type: "text", text: "keep me" }],
  };
  const gated = await h.emit("context", { type: "context", messages: [original] });
  assert.equal(gated.messages[0].content[0].text, CONTEXT_MARKER);
  assert.equal(gated.messages[0].content[1].text, "keep me");
  assert.ok(!tainted || extractThinking(first.message) === "");
}

{
  const h = harness();
  await h.stream(RUNAWAY.repeat(3));
  const rewritten = await h.play("Completely different visible answer that is long enough to count.", {
    thinking: RUNAWAY.repeat(3),
  });
  assert.equal(rewritten.message.content[0].text, REDERIVED_MARKER);
  assert.equal(h.sent.at(-1).message.content, REDERIVED_RECOVERY);
}

{
  const h = harness();
  await h.stream(RUNAWAY.repeat(3));
  await h.play("Completely different visible answer that is long enough to count.", {
    thinking: RUNAWAY.repeat(3),
  });
  const rewritten = await h.play("Another distinct visible answer that still reconstructs the blocked plan.", {
    thinking: RUNAWAY.repeat(3),
  });
  assert.equal(rewritten.message.content[0].text, REDERIVED_MARKER);
  assert.equal(h.sent.at(-1).message.content, STUCK_RECOVERY);
}

{
  const h = harness();
  for (const text of STALL.slice(0, 4)) {
    const result = await h.play(text);
    assert.equal(result, undefined);
  }
  const rewritten = await h.play(STALL[4], { thinking: STALL[4] });
  assert.equal(rewritten.message.content[0].text, STAGNATION_MARKER);
  assert.equal(h.sent.at(-1).message.content, STAGNATION_RECOVERY);
  assert.match(h.notices.at(-1).message, /similar turns; removed stagnant reasoning/);
}

{
  const h = harness({ id: "gpt-5.6-sol", provider: "openai-codex" });
  for (const text of STALL) assert.equal(await h.play(text), undefined);
  assert.deepEqual(h.sent, []);
}

{
  const h = harness();
  await h.play(STALL[0]);
  await h.play("Completely different work: I will now rewrite the overlay CSS tokens and stop talking about spawn.");
  await h.play(STALL[1]);
  await h.play(STALL[2]);
  await h.play(STALL[3]);
  assert.deepEqual(h.sent, []);
}

console.log("test-grok-paraphrase-guard: pass");
