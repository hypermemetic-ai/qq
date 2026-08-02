#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-communication-moments-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-communication-moments.ts"
DOCTRINE="$ROOT/extensions/qq-communication-doctrine.md"
EXPECTED_HASH="d33f9cad2d1ac41059b754d1ea393a843c3046cb27b44c6cfc7d6683cedd2197"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'
command -v sha256sum >/dev/null 2>&1 || fail 'sha256sum is required to pin the doctrine'

actual_hash="$(sha256sum "$DOCTRINE" | awk '{print $1}')"
assert_equal "$EXPECTED_HASH" "$actual_hash" 'communication doctrine bytes changed'

module="$TMP/qq-communication-moments.mjs"
fixture="$TMP/qq-communication-doctrine.md"
cp -- "$EXTENSION" "$module"
cp -- "$DOCTRINE" "$fixture"

if ! node --experimental-strip-types --input-type=module - "$module" "$fixture" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, doctrinePath, temporary] = process.argv.slice(2);
// The extension's operator-facing computation reads this marker; pin a clean
// baseline so the suite is deterministic even inside a delegate's Checks.
delete process.env.QQ_DISPATCH_RUN_DIR;
const { default: register } = await import(pathToFileURL(modulePath));
const doctrine = await readFile(doctrinePath, "utf8");
const FIXED_TIME = "2026-08-01T12:34:56.000Z";
const TYPE_SOMETHING = "Type something.";
const DONE_SELECTING = "Done selecting";

const alignmentQuestion = {
  header: "Scope",
  question: "Which outcome should this ticket promise?",
  options: [
    { label: "Narrow", description: "Prove only the bounded outcome." },
    { label: "Broad", description: "Include the adjacent behavior too." },
  ],
};

function createHarness({
  ui,
  doctrine = doctrinePath,
  logPath,
  pane = "pane-17",
  operatorFacing,
  expectTool = true,
} = {}) {
  const events = new Map();
  const warnings = [];
  let tool;
  let toolCount = 0;
  const injectedUi = ui ?? {
    async select(_title, choices) {
      return choices[0];
    },
    async input() {
      return "custom";
    },
    notify(message, level) {
      warnings.push({ message, level });
    },
  };
  const originalNotify = injectedUi.notify;
  injectedUi.notify = (message, level) => {
    warnings.push({ message, level });
    return originalNotify?.call(injectedUi, message, level);
  };
  const pi = {
    registerTool(candidate) {
      toolCount += 1;
      tool = candidate;
    },
    on(name, handler) {
      assert.equal(events.has(name), false, `event ${name} registered twice`);
      events.set(name, handler);
    },
  };
  const deps = {
    doctrinePath: doctrine,
    logPath,
    ui: injectedUi,
    pane,
    now: () => FIXED_TIME,
  };
  if (operatorFacing !== undefined) deps.operatorFacing = operatorFacing;
  register(pi, deps);
  assert.equal(
    toolCount,
    expectTool ? 1 : 0,
    expectTool
      ? "extension did not register exactly one tool"
      : "non-operator-facing session still registered the tool",
  );
  return { events, tool, ui: injectedUi, warnings };
}

function execute(harness, params) {
  return harness.tool.execute("call-1", params, undefined, undefined, {
    ui: harness.ui,
  });
}

async function markerLines(path) {
  return (await readFile(path, "utf8")).trimEnd().split("\n");
}

// Registration carries the complete mounted doctrine and the strict public schema.
const registrationLog = join(temporary, "registration", "markers.jsonl");
const registered = createHarness({ logPath: registrationLog });
assert.equal(registered.tool.name, "operator_ask");
assert.equal(registered.tool.label, "Operator ask");
assert.ok(registered.tool.description.includes(doctrine));
assert.match(registered.tool.description, /governing doctrine follows in full/);
assert.match(registered.tool.description, /`Type something\.` row is appended/);
assert.match(registered.tool.description, /Esc abandons the moment/);
assert.match(registered.tool.description, /Overfire beats underfire/);
assert.match(registered.tool.description, /Perfect execution of a plan/);
for (const header of [
  "## Every moment",
  "## What carries stakes",
  "## Alignment — once per ticket, before work",
  "## Realignment — when alignment's basis reopens",
  "## Operator-action ask",
  "## Judgment-reserved delivery — only if marked at alignment",
  "## Default delivery — everything else",
]) {
  assert.ok(registered.tool.description.includes(header), `description omitted ${header}`);
}
const schema = registered.tool.parameters;
assert.deepEqual(schema.required, ["moment", "questions"]);
assert.deepEqual(schema.properties.moment.enum, [
  "alignment",
  "realignment",
  "operator-action-ask",
  "judgment-reserved-delivery",
]);
assert.equal(schema.properties.questions.minItems, 1);
assert.equal(schema.properties.questions.maxItems, 4);
assert.equal(schema.properties.questions.items.properties.header.maxLength, 16);
assert.equal(
  schema.properties.questions.items.properties.options.items.properties.label.maxLength,
  60,
);

// The alignment injection is chained only on the first turn after session_start.
const sessionStart = registered.events.get("session_start");
const beforeAgentStart = registered.events.get("before_agent_start");
assert.equal(typeof sessionStart, "function");
assert.equal(typeof beforeAgentStart, "function");
sessionStart({ type: "session_start" }, { ui: registered.ui });
const firstTurn = beforeAgentStart(
  { systemPrompt: "base prompt" },
  { ui: registered.ui },
);
assert.ok(firstTurn.systemPrompt.startsWith("base prompt\n\nCommunication-moments doctrine"));
assert.ok(firstTurn.systemPrompt.includes(doctrine));
assert.equal(
  beforeAgentStart({ systemPrompt: "later prompt" }, { ui: registered.ui }),
  undefined,
);

// Single-select answers carry alignment follow-up sections and exactly one marker.
let singleSelectCalls = 0;
const singleLog = join(temporary, "single", "markers.jsonl");
const single = createHarness({
  logPath: singleLog,
  ui: {
    async select(title, choices) {
      singleSelectCalls += 1;
      assert.match(title, /^Scope: Which outcome/);
      assert.equal(choices.at(-1), TYPE_SOMETHING);
      return choices[0];
    },
    async input() {
      assert.fail("single-select option unexpectedly requested free text");
    },
  },
});
const singleResult = await execute(single, {
  moment: "alignment",
  questions: [alignmentQuestion],
});
assert.equal(singleSelectCalls, 1);
assert.equal(singleResult.details.outcome, "answered");
assert.equal(singleResult.details.answers[0].selections[0].label, "Narrow");
assert.match(singleResult.details.follow_up_doctrine, /## Every moment/);
assert.match(singleResult.details.follow_up_doctrine, /## What carries stakes/);
assert.match(singleResult.details.follow_up_doctrine, /## Alignment — once per ticket/);
assert.doesNotMatch(singleResult.details.follow_up_doctrine, /## Default delivery/);
const singleLines = await markerLines(singleLog);
assert.equal(singleLines.length, 1);
assert.deepEqual(JSON.parse(singleLines[0]), {
  ts: FIXED_TIME,
  moment: "alignment",
  question_count: 1,
  pane: "pane-17",
  outcome: "answered",
});
assert.equal((await stat(singleLog)).mode & 0o777, 0o600);

// Multi-select repeats until Done and permits the same free-text fallback.
let multiStep = 0;
const multiLog = join(temporary, "multi", "markers.jsonl");
const multi = createHarness({
  logPath: multiLog,
  ui: {
    async select(_title, choices) {
      multiStep += 1;
      assert.ok(choices.includes(TYPE_SOMETHING));
      assert.equal(choices.at(-1), DONE_SELECTING);
      if (multiStep === 1) return choices[0];
      if (multiStep === 2) return TYPE_SOMETHING;
      return DONE_SELECTING;
    },
    async input(title) {
      assert.match(title, /Type something\./);
      return "Keep operator attention bounded";
    },
  },
});
const multiResult = await execute(multi, {
  moment: "judgment-reserved-delivery",
  questions: [{ ...alignmentQuestion, multiSelect: true }],
});
assert.equal(multiStep, 3);
assert.equal(multiResult.details.outcome, "answered");
assert.deepEqual(
  multiResult.details.answers[0].selections.map(({ label, custom }) => [label, custom]),
  [
    ["Narrow", false],
    ["Keep operator attention bounded", true],
  ],
);
assert.match(multiResult.details.follow_up_doctrine, /## Judgment-reserved delivery/);
assert.match(multiResult.details.follow_up_doctrine, /## Default delivery/);
assert.equal((await markerLines(multiLog)).length, 1);

// Esc abandons the whole moment without retrying and records that disposition.
let escapeCalls = 0;
const escapeLog = join(temporary, "escape", "markers.jsonl");
const escaped = createHarness({
  logPath: escapeLog,
  ui: {
    async select() {
      escapeCalls += 1;
      return undefined;
    },
    async input() {
      assert.fail("Esc unexpectedly opened free text");
    },
  },
});
const escapeResult = await execute(escaped, {
  moment: "realignment",
  questions: [alignmentQuestion],
});
assert.equal(escapeCalls, 1);
assert.equal(escapeResult.details.outcome, "abandoned");
assert.deepEqual(escapeResult.details.answers, []);
const escapeMarker = JSON.parse((await markerLines(escapeLog))[0]);
assert.equal(escapeMarker.outcome, "abandoned");

// Dialog failures return an error result and marker rather than escaping execute().
const dialogLog = join(temporary, "dialog-error", "markers.jsonl");
const dialogFailure = createHarness({
  logPath: dialogLog,
  ui: {
    async select() {
      throw new Error("synthetic dialog failure");
    },
    async input() {
      return "unused";
    },
  },
});
const dialogResult = await execute(dialogFailure, {
  moment: "operator-action-ask",
  questions: [alignmentQuestion],
});
assert.equal(dialogResult.details.outcome, "error");
assert.match(dialogResult.details.error, /synthetic dialog failure/);
assert.ok(dialogFailure.warnings.some(({ message }) => message.includes("dialog failed")));
assert.equal(JSON.parse((await markerLines(dialogLog))[0]).outcome, "error");

// Log failures and a missing doctrine both warn locally without breaking results.
const blocker = join(temporary, "not-a-directory");
await writeFile(blocker, "block log directory creation\n", "utf8");
const logFailure = createHarness({
  logPath: join(blocker, "markers.jsonl"),
});
const logFailureResult = await execute(logFailure, {
  moment: "alignment",
  questions: [alignmentQuestion],
});
assert.equal(logFailureResult.details.outcome, "answered");
assert.ok(
  logFailure.warnings.some(({ message }) => message.includes("could not append phase marker")),
);

const missingLog = join(temporary, "missing-doctrine", "markers.jsonl");
const missing = createHarness({
  doctrine: join(temporary, "absent-doctrine.md"),
  logPath: missingLog,
});
assert.match(missing.tool.description, /governing doctrine follows in full/);
assert.ok(missing.warnings.some(({ message }) => message.includes("could not read doctrine")));
missing.events.get("session_start")();
assert.doesNotThrow(() =>
  missing.events.get("before_agent_start")(
    { systemPrompt: "base" },
    { ui: missing.ui },
  ),
);
const missingResult = await execute(missing, {
  moment: "operator-action-ask",
  questions: [alignmentQuestion],
});
assert.equal(missingResult.details.outcome, "answered");
assert.equal(missingResult.details.full_doctrine_fallback, true);
assert.match(missingResult.details.follow_up_doctrine, /doctrine unavailable/i);
assert.equal((await markerLines(missingLog)).length, 1);

// Non-operator-facing sessions stay fully inert (operator ruling 2026-08-02, T-204).
const inert = createHarness({
  logPath: join(temporary, "inert", "markers.jsonl"),
  operatorFacing: false,
  expectTool: false,
});
assert.equal(inert.events.size, 0, "inert session registered event handlers");

// The delegate marker computes inert by default.
process.env.QQ_DISPATCH_RUN_DIR = join(temporary, "delegate-run");
try {
  const delegated = createHarness({
    logPath: join(temporary, "delegated", "markers.jsonl"),
    expectTool: false,
  });
  assert.equal(delegated.events.size, 0, "delegate session registered event handlers");
} finally {
  delete process.env.QQ_DISPATCH_RUN_DIR;
}

// A headless --print invocation computes inert by default.
process.argv.push("--print");
try {
  const headless = createHarness({
    logPath: join(temporary, "headless", "markers.jsonl"),
    expectTool: false,
  });
  assert.equal(headless.events.size, 0, "headless session registered event handlers");
} finally {
  process.argv.pop();
}

// The -p short alias computes inert too (bin/qq-delegate launches pi with -p).
process.argv.push("-p");
try {
  const shortFlag = createHarness({
    logPath: join(temporary, "short-flag", "markers.jsonl"),
    expectTool: false,
  });
  assert.equal(shortFlag.events.size, 0, "-p session registered event handlers");
} finally {
  process.argv.pop();
}

// Backstop: an operator-facing session whose UI cannot pose dialogs injects nothing.
const noDialog = createHarness({
  logPath: join(temporary, "no-dialog", "markers.jsonl"),
  ui: { notify() {} },
});
noDialog.events.get("session_start")({ type: "session_start" }, { ui: noDialog.ui });
assert.equal(
  noDialog.events.get("before_agent_start")(
    { systemPrompt: "base" },
    { ui: noDialog.ui },
  ),
  undefined,
  "dialog-less UI still received the doctrine injection",
);

// The backstop prefers pi's declared dialog capability when present.
const noCapability = createHarness({
  logPath: join(temporary, "no-capability", "markers.jsonl"),
});
noCapability.events.get("session_start")(
  { type: "session_start" },
  { ui: noCapability.ui, hasUI: false },
);
assert.equal(
  noCapability.events.get("before_agent_start")(
    { systemPrompt: "base" },
    { ui: noCapability.ui },
  ),
  undefined,
  "hasUI=false session still received the doctrine injection",
);

console.log("test-qq-communication-moments-extension: pass");
JS
then
  fail 'Pi communication-moments extension node suite failed'
fi
