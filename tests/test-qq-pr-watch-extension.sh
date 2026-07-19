#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-pr-watch-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-pr-watch.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

# The extension intentionally contains JavaScript-compatible TypeScript, so
# CI can exercise its real registration and handler without installing Pi.
module="$TMP/qq-pr-watch.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));

const PR_URL = "https://example.test/pulls/17";

function response(state, url = PR_URL) {
  return {
    stdout: JSON.stringify({ state, url }),
    stderr: "",
    code: 0,
    killed: false,
  };
}

function failure() {
  return { stdout: "", stderr: "failed", code: 1, killed: false };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((candidate) => {
    resolve = candidate;
  });
  return { promise, resolve };
}

function createTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const firing = new Set();
  const delays = [];

  function setTimer(callback, delay) {
    const id = nextId++;
    delays.push(delay);
    timers.set(id, { callback, due: now + delay });
    return id;
  }

  function clearTimer(id) {
    timers.delete(id);
  }

  async function advance(milliseconds) {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([id, timer]) => !firing.has(id) && timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (due === undefined) {
        break;
      }

      const [id, timer] = due;
      now = timer.due;
      firing.add(id);
      try {
        await timer.callback();
      } finally {
        firing.delete(id);
        timers.delete(id);
      }
    }
    now = target;
  }

  return {
    setTimer,
    clearTimer,
    advance,
    delays,
    liveCount: () => timers.size,
  };
}

function createHarness(sequence = [], options = {}) {
  const timers = createTimers();
  const replies = [...sequence];
  const execCalls = [];
  const messages = [];
  let tool;
  let shutdown;
  let toolCount = 0;

  const pi = {
    registerTool(candidate) {
      toolCount += 1;
      assert.equal(tool, undefined, "extension registered more than one tool");
      tool = candidate;
    },
    on(eventName, handler) {
      assert.equal(eventName, "session_shutdown", "extension registered wrong event");
      assert.equal(shutdown, undefined, "extension registered shutdown twice");
      shutdown = handler;
    },
    async exec(command, args, execOptions) {
      const call = { command, args, options: execOptions };
      execCalls.push(call);
      assert.notEqual(replies.length, 0, "fake gh response queue was exhausted");
      const reply = replies.shift();
      return typeof reply === "function" ? await reply(call) : reply;
    },
    sendMessage(message, sendOptions) {
      options.onSend?.(timers, message, sendOptions);
      messages.push({ message, options: sendOptions });
    },
  };

  register(pi, {
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  assert.equal(toolCount, 1, "extension did not register exactly one tool");
  assert.equal(tool?.name, "qq_pr_watch", "extension registered the wrong tool");
  assert.equal(typeof tool?.execute, "function", "tool execute handler is missing");
  assert.equal(typeof tool?.prepareArguments, "function", "raw argument guard is missing");
  assert.equal(typeof shutdown, "function", "session_shutdown handler is missing");
  assert.deepEqual(tool.parameters.required, ["action", "pr"]);
  assert.deepEqual(tool.parameters.properties.action.enum, ["watch", "inspect"]);
  assert.equal(tool.parameters.properties.interval.type, "integer");
  assert.equal(tool.parameters.properties.interval.minimum, 30);
  assert.equal(tool.parameters.properties.interval.maximum, 60);
  assert.equal(tool.parameters.properties.interval.default, 30);
  assert.equal(tool.parameters.additionalProperties, false);

  return { timers, execCalls, messages, tool, shutdown };
}

function execute(harness, params, signal) {
  return harness.tool.execute("call-1", params, signal, undefined, {});
}

function assertGhCall(call, pr) {
  assert.equal(call.command, "gh");
  assert.deepEqual(
    call.args,
    ["pr", "view", "--json", "state,url", "--", pr],
    "pull-request selector did not follow gh's literal -- terminator",
  );
}

function assertDoneWake(harness, state, pr = "17", url = PR_URL) {
  assert.equal(harness.messages.length, 1, "terminal state did not wake exactly once");
  const wake = harness.messages[0];
  assert.equal(wake.message.customType, "qq-pr-watch");
  assert.equal(wake.message.display, true);
  assert.equal(
    wake.message.content,
    `pull request ${pr} reached terminal state ${state}${url === "" ? "" : ` — ${url}`}`,
  );
  assert.deepEqual(wake.options, {
    triggerTurn: true,
    deliverAs: "followUp",
  });
  assert.deepEqual(wake.message.details, {
    status: "done",
    pull_request: pr,
    pr_state: state,
    url,
    notification_count: 1,
  });
}

async function testMergedWake() {
  const h = createHarness([response("OPEN"), response("MERGED")], {
    onSend(timers) {
      assert.equal(timers.liveCount(), 0, "timer was live when MERGED wake was sent");
    },
  });
  const armed = await execute(h, { action: "watch", pr: "17" });
  assert.equal(armed.details.status, "done");
  assert.equal(armed.details.pr_state, "OPEN");
  assert.equal(armed.details.notification_count, 0);
  assert.equal(h.timers.delays[0], 30_000, "default interval was not 30 seconds");
  assertGhCall(h.execCalls[0], "17");

  await h.timers.advance(30_000);
  assert.equal(h.execCalls.length, 2);
  assertDoneWake(h, "MERGED");

  await h.timers.advance(300_000);
  assert.equal(h.execCalls.length, 2, "spent MERGED watch polled again");
  assert.equal(h.messages.length, 1, "spent MERGED watch woke again");
}

async function testClosedWake() {
  const h = createHarness([response("OPEN"), response("CLOSED")], {
    onSend(timers) {
      assert.equal(timers.liveCount(), 0, "timer was live when CLOSED wake was sent");
    },
  });
  await execute(h, { action: "watch", pr: "17", interval: 30 });
  await h.timers.advance(30_000);
  assertDoneWake(h, "CLOSED");

  await h.timers.advance(300_000);
  assert.equal(h.execCalls.length, 2, "spent CLOSED watch polled again");
  assert.equal(h.messages.length, 1, "spent CLOSED watch woke again");
}

async function testErrorVisibility() {
  const cases = [
    [failure(), /inspection failed/],
    [{ stdout: "not-json", stderr: "", code: 0, killed: false }, /readable pull-request state/],
    [response("DRAFT"), /unsupported pull-request state/],
  ];

  for (const [reply, messagePattern] of cases) {
    const h = createHarness([reply]);
    const watchResult = await execute(h, { action: "watch", pr: "17" });
    assert.equal(watchResult.details.status, "error");
    assert.match(watchResult.details.message, messagePattern);
    assert.match(watchResult.content[0].text, /^pull request 17 watch failed: /);
    assert.match(watchResult.content[0].text, messagePattern);
    assert.equal(h.timers.liveCount(), 0, "failed watch left a timer armed");
    assert.equal(h.messages.length, 1, "failed watch did not emit exactly one wake");
    assert.equal(h.messages[0].message.details.status, "error");
    assert.equal(h.messages[0].message.details.notification_count, 1);
    assert.match(h.messages[0].message.details.message, messagePattern);
    assert.equal(h.messages[0].message.content, watchResult.content[0].text);
    assert.match(h.messages[0].message.content, /^pull request 17 watch failed: /);
    assert.deepEqual(h.messages[0].options, {
      triggerTurn: true,
      deliverAs: "followUp",
    });

    await h.timers.advance(300_000);
    assert.equal(h.execCalls.length, 1, "failed watch silently kept polling");
    assert.equal(h.messages.length, 1, "failed watch emitted a second wake");
  }
}

async function testShutdownCleanup() {
  const armed = createHarness([response("OPEN")]);
  await execute(armed, { action: "watch", pr: "17" });
  assert.equal(armed.timers.liveCount(), 1);
  armed.shutdown();
  armed.shutdown();
  assert.equal(armed.timers.liveCount(), 0, "shutdown did not clear the timer");
  await armed.timers.advance(300_000);
  assert.equal(armed.execCalls.length, 1, "shutdown watch polled again");
  assert.equal(armed.messages.length, 0, "shutdown watch emitted a wake");

  const deferred = createDeferred();
  const inFlight = createHarness([() => deferred.promise]);
  const pending = execute(inFlight, { action: "watch", pr: "18" });
  assert.equal(inFlight.execCalls.length, 1, "initial poll did not start immediately");
  inFlight.shutdown();
  inFlight.shutdown();
  deferred.resolve(response("MERGED", "https://example.test/pulls/18"));
  const stopped = await pending;
  assert.match(stopped.content[0].text, /pull request 18 watch was not armed/);
  assert.equal(inFlight.timers.liveCount(), 0);
  assert.equal(inFlight.messages.length, 0, "in-flight poll woke after shutdown");
}

async function testAlreadyTerminalAndRearm() {
  const h = createHarness([response("MERGED"), response("CLOSED")]);
  const mergedResult = await execute(h, { action: "watch", pr: "17" });
  assert.equal(h.execCalls.length, 1, "already-terminal arm polled more than once");
  assertDoneWake(h, "MERGED");
  assert.equal(mergedResult.content[0].text, h.messages[0].message.content);
  assert.equal(h.timers.liveCount(), 0);

  const closedResult = await execute(h, { action: "watch", pr: "17" });
  assert.equal(h.execCalls.length, 2, "spent watch could not be re-armed");
  assert.equal(h.messages.length, 2, "fresh re-arm did not emit its own wake");
  assert.equal(h.messages[1].message.details.pr_state, "CLOSED");
  assert.equal(h.messages[1].message.details.notification_count, 1);
  assert.equal(closedResult.content[0].text, h.messages[1].message.content);
}

async function testIntervals() {
  const raw = createHarness();
  assert.throws(
    () => raw.tool.prepareArguments({ action: "watch", pr: "17", interval: "30" }),
    /integer from 30 through 60/,
    "Pi pre-validation could sanitise a string interval",
  );
  const validArguments = { action: "watch", pr: "17", interval: 30 };
  assert.equal(raw.tool.prepareArguments(validArguments), validArguments);

  for (const [interval, milliseconds] of [
    [undefined, 30_000],
    [30, 30_000],
    [60, 60_000],
  ]) {
    const h = createHarness([response("OPEN")]);
    const params = { action: "watch", pr: `interval-${milliseconds}` };
    if (interval !== undefined) {
      params.interval = interval;
    }
    await execute(h, params);
    assert.equal(h.timers.delays[0], milliseconds);
    h.shutdown();
  }

  for (const interval of [29, 61, 30.5, "30"]) {
    const h = createHarness();
    const refused = await execute(h, { action: "watch", pr: "17", interval });
    assert.equal(refused.details.status, "error");
    assert.match(refused.details.message, /integer from 30 through 60/);
    assert.match(refused.content[0].text, /^pull request 17 watch failed: /);
    assert.equal(h.execCalls.length, 0, "invalid interval reached gh");
    assert.equal(h.timers.liveCount(), 0, "invalid interval armed a timer");
    assert.equal(h.messages.length, 0, "invalid interval emitted a wake");
  }
}

async function testDuplicateAndDistinctWatches() {
  const duplicate = createHarness([
    response("OPEN"),
    response("CLOSED"),
    response("MERGED"),
  ]);
  await execute(duplicate, { action: "watch", pr: "17" });
  const refused = await execute(duplicate, { action: "watch", pr: "17" });
  assert.equal(refused.details.status, "refused");
  assert.equal(
    refused.content[0].text,
    "A watch is already active for pull request 17; no new watch was armed.",
  );
  assert.equal(duplicate.execCalls.length, 2, "duplicate arm did not inspect gh exactly once");
  assert.equal(duplicate.timers.liveCount(), 1, "duplicate arm changed the original watch");
  assert.equal(
    duplicate.messages.length,
    0,
    "terminal reading from a duplicate arm emitted a wake",
  );
  await duplicate.timers.advance(30_000);
  assert.equal(duplicate.execCalls.length, 3);
  assertDoneWake(duplicate, "MERGED");

  const aUrl = "https://example.test/pulls/a";
  const bUrl = "https://example.test/pulls/b";
  const distinct = createHarness([
    response("OPEN", aUrl),
    response("OPEN", bUrl),
    response("MERGED", aUrl),
    response("CLOSED", bUrl),
  ]);
  await execute(distinct, { action: "watch", pr: "a" });
  await execute(distinct, { action: "watch", pr: "b" });
  assert.equal(distinct.timers.liveCount(), 2);
  await distinct.timers.advance(30_000);
  assert.equal(distinct.messages.length, 2, "distinct watches did not each wake once");
  assert.deepEqual(
    distinct.messages.map(({ message }) => message.content),
    [
      `pull request a reached terminal state MERGED — ${aUrl}`,
      `pull request b reached terminal state CLOSED — ${bUrl}`,
    ],
  );
  assert.deepEqual(
    distinct.messages.map(({ message }) => [
      message.details.pull_request,
      message.details.pr_state,
      message.details.notification_count,
    ]),
    [
      ["a", "MERGED", 1],
      ["b", "CLOSED", 1],
    ],
  );
}

async function testCanonicalDedupeBothDirections() {
  for (const [first, second] of [
    ["17", PR_URL],
    [PR_URL, "17"],
  ]) {
    const h = createHarness([
      response("OPEN", PR_URL),
      response("OPEN", PR_URL),
      response("MERGED", PR_URL),
    ]);
    await execute(h, { action: "watch", pr: first });
    const refused = await execute(h, { action: "watch", pr: second });

    assert.equal(refused.details.status, "refused");
    assert.equal(refused.details.pull_request, second);
    assert.equal(
      refused.content[0].text,
      `A watch is already active for pull request ${second}; no new watch was armed.`,
    );
    assert.equal(h.execCalls.length, 2, "canonical duplicate did not perform one arm read");
    assert.equal(h.timers.liveCount(), 1, "canonical duplicate changed the original watch");
    assert.equal(h.messages.length, 0, "canonical duplicate emitted a wake");

    await h.timers.advance(30_000);
    assert.equal(h.execCalls.length, 3);
    assert.equal(h.timers.liveCount(), 0, "canonical watch remained live after terminal state");
    assertDoneWake(h, "MERGED", first, PR_URL);
  }
}

async function testFlagShapedSelector() {
  const pr = "--repo=owner/other";
  const h = createHarness([response("MERGED")]);
  await execute(h, { action: "watch", pr });
  assertGhCall(h.execCalls[0], pr);
  assert.equal(h.execCalls[0].args.at(-2), "--");
  assert.equal(h.execCalls[0].args.at(-1), pr);
  assertDoneWake(h, "MERGED", pr);
}

async function testInspect() {
  const open = createHarness([response("OPEN")]);
  const openResult = await execute(open, { action: "inspect", pr: "17" });
  assert.equal(openResult.details.status, "refused");
  assert.equal(openResult.details.notification_count, 0);
  assert.match(openResult.details.message, /pull request 17 is still OPEN; no completion notification/);
  assert.match(openResult.content[0].text, /pull request 17 is still OPEN/);
  assert.equal(open.execCalls.length, 1);
  assert.equal(open.timers.liveCount(), 0);
  assert.equal(open.messages.length, 0);

  const merged = createHarness([response("MERGED")]);
  const mergedResult = await execute(merged, { action: "inspect", pr: "17" });
  assert.equal(mergedResult.details.status, "done");
  assert.equal(mergedResult.details.pr_state, "MERGED");
  assert.equal(mergedResult.details.notification_count, 0);
  assert.match(
    mergedResult.details.message,
    /pull request 17 is already MERGED; inspection emitted no completion notification/,
  );
  assert.match(mergedResult.content[0].text, /pull request 17 is already MERGED/);
  assert.equal(merged.execCalls.length, 1);
  assert.equal(merged.timers.liveCount(), 0);
  assert.equal(merged.messages.length, 0);

  const failed = createHarness([failure()]);
  const failedResult = await execute(failed, { action: "inspect", pr: "17" });
  assert.equal(failedResult.details.status, "error");
  assert.equal(failedResult.details.notification_count, 0);
  assert.match(failedResult.details.message, /inspection failed/);
  assert.match(failedResult.content[0].text, /^pull request 17 inspection failed: /);
  assert.equal(failed.execCalls.length, 1);
  assert.equal(failed.timers.liveCount(), 0);
  assert.equal(failed.messages.length, 0);
}

await testMergedWake();
await testClosedWake();
await testErrorVisibility();
await testShutdownCleanup();
await testAlreadyTerminalAndRearm();
await testIntervals();
await testDuplicateAndDistinctWatches();
await testCanonicalDedupeBothDirections();
await testFlagShapedSelector();
await testInspect();

console.log("test-qq-pr-watch-extension: pass");
JS
then
  fail 'Pi extension node suite failed'
fi
