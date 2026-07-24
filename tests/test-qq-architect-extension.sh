#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-architect-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-architect.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export TMPDIR="$TMP"

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

# The extension intentionally contains JavaScript-compatible TypeScript, so
# CI can exercise its real registration and handlers without installing Pi.
module="$TMP/qq-architect.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, scratch] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
const runsRoot = join(scratch, "state", "qq", "observer", "runs");
process.env.XDG_STATE_HOME = join(scratch, "state");

function execution(stdout, code = 0, stderr = "") {
  return { stdout, stderr, code, killed: false };
}

function rounds(rows) {
  return execution(JSON.stringify(rows));
}

function row(pr, options = {}) {
  return {
    pr,
    variant: options.variant ?? "guided",
    analyzed: options.analyzed ?? true,
    failed: options.failed ?? false,
    discussed: options.discussed ?? false,
    ts: options.ts ?? `2026-08-${String(pr).padStart(2, "0")}T10:00:00Z`,
  };
}

async function makeRun(pr, variant = "guided") {
  const directory = join(runsRoot, `pr-${pr}${variant === "blind" ? "-blind" : ""}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

function createHarness(replies, options = {}) {
  const commands = new Map();
  const calls = [];
  const notifications = [];
  const userMessages = [];
  const selectPrompts = [];
  const inputPrompts = [];
  const selects = [...(options.selects ?? [])];
  const inputs = [...(options.inputs ?? [])];
  const queue = [...replies];
  const pi = {
    registerCommand(name, command) {
      assert.equal(commands.has(name), false, `command ${name} registered twice`);
      commands.set(name, command);
    },
    async exec(command, args, execOptions) {
      const call = { command, args, options: execOptions };
      calls.push(call);
      assert.notEqual(queue.length, 0, "fake qq-observe response queue was exhausted");
      const reply = queue.shift();
      return typeof reply === "function" ? await reply(call) : reply;
    },
    sendUserMessage(message) {
      userMessages.push(message);
    },
  };
  register(pi);
  assert.deepEqual([...commands.keys()].sort(), ["architect", "architect-discussed"]);
  const ctx = {
    cwd: "/fixture/repo",
    hasUI: options.hasUI ?? true,
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
      async select(prompt, choices) {
        selectPrompts.push({ prompt, choices });
        if (selects.length === 0) return choices[0];
        const selected = selects.shift();
        return typeof selected === "function" ? selected(choices) : selected;
      },
      async input(prompt) {
        inputPrompts.push(prompt);
        return inputs.shift();
      },
    },
  };
  return { calls, commands, ctx, inputPrompts, notifications, selectPrompts, userMessages };
}

async function invoke(harness, name, args = "") {
  await harness.commands.get(name).handler(args, harness.ctx);
}

async function testRoundsFailuresNotify() {
  for (const reply of [
    execution("", 65, "observer store is malformed"),
    execution("not-json"),
  ]) {
    const h = createHarness([reply]);
    await invoke(h, "architect");
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].level, "error");
    assert.match(h.notifications[0].message, /Cannot load observer rounds/);
    assert.equal(h.selectPrompts.length, 0);
    assert.equal(h.userMessages.length, 0);
  }
}

async function testOrderingAndAnalyzedKickoff() {
  const analyzedRun = await makeRun(12);
  await writeFile(join(analyzedRun, "analysis.md"), "# Fixture analysis\n");
  await writeFile(join(analyzedRun, "analyst-trace.jsonl"), "{}\n");
  const h = createHarness([
    rounds([
      row(10, { discussed: true, ts: "2026-08-10T10:00:00Z" }),
      row(11, { ts: "2026-08-11T10:00:00Z" }),
      row(12, { ts: "2026-08-12T10:00:00Z" }),
    ]),
  ], { selects: [(choices) => choices[0]] });
  await invoke(h, "architect");
  assert.deepEqual(
    h.selectPrompts[0].choices.map((choice) => choice.match(/^pr-[0-9]+/)[0]),
    ["pr-12", "pr-11", "pr-10"],
    "selector was not undiscussed-first and newest-first",
  );
  assert.match(h.selectPrompts[0].choices[2], /analyzed discussed/);
  assert.equal(h.userMessages.length, 1);
  assert.equal(
    h.userMessages[0],
    `Discussing observer round pr-12. Analysis document: ${join(analyzedRun, "analysis.md")}. Analyst trace: ${join(analyzedRun, "analyst-trace.jsonl")}. Walk it with me architect-style: unpack the episodes, and for each we reach accept, reject, or reshape.`,
  );
  assert.deepEqual(h.calls[0], {
    command: "bin/qq-observe",
    args: ["rounds"],
    options: { cwd: "/fixture/repo" },
  });
}

async function testFailedKickoff() {
  const failedRun = await makeRun(13, "blind");
  await writeFile(
    join(failedRun, "analysis_failed.json"),
    JSON.stringify({ status: "analysis_failed", reason: "analyst timed out" }),
  );
  const h = createHarness([
    rounds([row(13, { variant: "blind", analyzed: false, failed: true })]),
  ]);
  await invoke(h, "architect");
  assert.equal(h.userMessages.length, 1);
  assert.match(h.userMessages[0], /This run has only analysis_failed\.json/);
  assert.match(h.userMessages[0], /Failure reason: analyst timed out\./);
  assert.match(h.userMessages[0], /Analyst trace: not present\./);
  assert.match(h.userMessages[0], /decide how to recover architect-style/);
}

async function testDiscussedHappyPath() {
  const run = await makeRun(14);
  await writeFile(join(run, "analysis.json"), JSON.stringify({
    episodes: [
      { rank: 1, kind: "friction", title: "First episode", recurrence_key: "first" },
      { rank: 2, kind: "waste", title: "Second episode", recurrence_key: "second" },
      { rank: 3, kind: "tool-gap", title: "Skipped episode", recurrence_key: "skip-me" },
    ],
  }));
  let captured;
  const h = createHarness([
    rounds([row(14)]),
    async (call) => {
      assert.deepEqual(call.args.slice(0, 4), ["mark-discussed", "--run", run, "--outcomes"]);
      const outcomesPath = call.args[4];
      captured = JSON.parse(await readFile(outcomesPath, "utf8"));
      assert.equal((await stat(outcomesPath)).mode & 0o777, 0o600);
      return execution('{"status":"discussed"}\n');
    },
  ], {
    selects: ["accepted", "reshaped", "skip"],
    inputs: ["Keep it.", "T-201, T-202", "Narrowed.", "T-203"],
  });
  await invoke(h, "architect-discussed", "14");
  assert.deepEqual(captured, [
    { recurrence_key: "first", verdict: "accepted", task_refs: ["T-201", "T-202"], note: "Keep it." },
    { recurrence_key: "second", verdict: "reshaped", task_refs: ["T-203"], note: "Narrowed." },
  ]);
  assert.equal(h.inputPrompts.length, 4, "skipped episode unexpectedly requested outcome details");
  assert.ok(h.notifications.some(({ message }) => message === "Episode 1 — friction: First episode"));
  assert.ok(h.notifications.some(({ message }) => message === "Episode 2 — waste: Second episode"));
  assert.ok(h.notifications.some(({ message }) => message.includes('discussion result: {"status":"discussed"}')));
}

async function testRefusalIsSurfaced() {
  const run = await makeRun(15);
  await writeFile(join(run, "analysis.json"), JSON.stringify({
    episodes: [
      { rank: 1, kind: "friction", title: "Conflict episode", recurrence_key: "conflict" },
    ],
  }));
  const h = createHarness([
    rounds([row(15)]),
    execution("", 65, `qq-observe: append-only conflict at ${join(run, "discussed.json")}`),
  ], { selects: ["rejected"], inputs: ["No.", ""] });
  await invoke(h, "architect-discussed", "15");
  const refusal = h.notifications.find(({ message }) => message.includes("append-only conflict"));
  assert.ok(refusal, "mark-discussed refusal was hidden");
  assert.equal(refusal.level, "error");
}

async function testAlreadyDiscussedAndHeadlessRefuseEarly() {
  const discussed = createHarness([rounds([row(16, { discussed: true })])]);
  await invoke(discussed, "architect-discussed", "16");
  assert.ok(discussed.notifications.some(({ message }) => message.includes("already discussed")));
  assert.equal(discussed.calls.length, 1, "already-discussed round reached mark-discussed");

  for (const command of ["architect", "architect-discussed"]) {
    const headless = createHarness([], { hasUI: false });
    await invoke(headless, command, command === "architect" ? "" : "17");
    assert.equal(headless.calls.length, 0);
    assert.equal(headless.notifications[0].message, "The architect flow needs an interactive Pi session.");
  }
}

await mkdir(runsRoot, { recursive: true });
await testRoundsFailuresNotify();
await testOrderingAndAnalyzedKickoff();
await testFailedKickoff();
await testDiscussedHappyPath();
await testRefusalIsSurfaced();
await testAlreadyDiscussedAndHeadlessRefuseEarly();

console.log("test-qq-architect-extension: pass");
JS
then
  fail 'Pi architect extension node suite failed'
fi
