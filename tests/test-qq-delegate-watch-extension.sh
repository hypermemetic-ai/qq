#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-delegate-watch-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
WATCH_EXTENSION="$ROOT/extensions/qq-delegate-watch.ts"
INDEX="$ROOT/extensions/index.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch.ts"
cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch-a.ts"
cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch-b.ts"

if ! node --experimental-strip-types --input-type=module - \
  "$TMP/qq-delegate-watch.ts" \
  "$TMP/qq-delegate-watch-a.ts" \
  "$TMP/qq-delegate-watch-b.ts" \
  "$WATCH_EXTENSION" <<'JS'
import assert from "node:assert/strict";
import { watch as fsWatch } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const [watchPath, watchAPath, watchBPath, sourcePath] = process.argv.slice(2);
const watchModule = await import(pathToFileURL(watchPath));
const watchModuleA = await import(pathToFileURL(watchAPath));
const watchModuleB = await import(pathToFileURL(watchBPath));
const source = await readFile(sourcePath, "utf8");
assert.doesNotMatch(
  source,
  /\bset(?:Interval|Timeout)\s*\(/,
  "delegate discovery contains production polling",
);
assert.doesNotMatch(
  source,
  /node:net|createConnection|sendThroughBroker|brokerSocketPath|BROKER_TIMEOUT|MAX_FRAME_BYTES|randomUUID|herdrNotify|notification\", \"show|pi\.exec\s*\(/i,
  "watcher retained remote completion transport or fallback state",
);
assert.doesNotMatch(
  source,
  /getDelegateRows|subscribeDelegateRows|rowListeners/,
  "watcher retained the old footer publication API",
);
const wakeSource = source.slice(
  source.indexOf("async function wake"),
  source.indexOf("async function inspectDirectory"),
);
assert.ok(wakeSource.length > 0, "wake implementation was not found");
assert.ok(
  wakeSource.indexOf("await paneFor(runDir)") < wakeSource.indexOf("await open("),
  "completion was claimed before its PANE was read",
);
assert.ok(
  wakeSource.indexOf("pane !== currentPane") < wakeSource.indexOf("await open("),
  "completion was claimed before exact local ownership was checked",
);
assert.ok(
  wakeSource.indexOf("await open(") < wakeSource.indexOf("await terminalSummary(runDir)"),
  "terminal summary was read before ownership and exclusive claim",
);

const tmp = dirname(watchPath);

async function waitFor(predicate, message, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function makeRun(root, name, pane) {
  const run = join(root, name);
  await mkdir(run, { recursive: true, mode: 0o700 });
  await writeFile(join(run, "BRIEF.md"), "# bounded work order\n");
  if (pane !== undefined) await writeFile(join(run, "PANE"), `${pane}\n`);
  return run;
}

async function writeTerminal(run, exitCode = 0, timedOut = false) {
  await writeFile(
    join(run, "TERMINAL"),
    JSON.stringify({
      schema: "qq-run-terminal",
      version: 2,
      exit_code: exitCode,
      timed_out: timedOut,
    }) + "\n",
  );
}

function createWatcherHarness(module, deps, options = {}) {
  const events = new Map();
  const warnings = [];
  const widgetCalls = [];
  const messages = [];
  const pi = {
    on(name, handler) {
      events.set(name, handler);
    },
    sendMessage(message, sendOptions) {
      messages.push({ message, options: sendOptions });
      return options.sendImpl?.(message, sendOptions);
    },
  };
  module.default(pi, deps);
  assert.equal(typeof events.get("session_start"), "function");
  assert.equal(typeof events.get("session_shutdown"), "function");
  const ctx = {
    hasUI: options.hasUI ?? true,
    ui: {
      notify(message, level) {
        warnings.push({ message, level });
      },
      setWidget(...args) {
        widgetCalls.push({
          key: args[0],
          content: args[1],
          options: args[2],
          argumentCount: args.length,
        });
      },
    },
  };
  return {
    events,
    warnings,
    widgetCalls,
    messages,
    latestWidget() {
      return widgetCalls.at(-1);
    },
    async start() {
      await events.get("session_start")({ type: "session_start" }, ctx);
    },
    shutdown() {
      events.get("session_shutdown")({ type: "session_shutdown" }, ctx);
    },
  };
}

function assertDefaultWidgetCall(call) {
  assert.equal(call.key, "qq-delegates");
  assert.equal(call.options, undefined);
  assert.equal(call.argumentCount, 2, "setWidget did not use the above-editor default");
}

function widgetText(harness) {
  const content = harness.latestWidget()?.content;
  return Array.isArray(content) ? content.join("\n") : "";
}

function trackedWatchState() {
  const created = new Set();
  const closed = new Set();
  let createdCount = 0;
  let closedCount = 0;
  return {
    created,
    closed,
    get createdCount() {
      return createdCount;
    },
    get closedCount() {
      return closedCount;
    },
    watch(path, options, callback) {
      const watcher = fsWatch(path, options, callback);
      const close = watcher.close.bind(watcher);
      let didClose = false;
      watcher.close = () => {
        if (!didClose) {
          didClose = true;
          closed.add(path);
          closedCount += 1;
        }
        return close();
      };
      created.add(path);
      createdCount += 1;
      return watcher;
    },
  };
}

function expectedWake(run, name, exitCode, timedOut) {
  return {
    message: {
      customType: "qq-delegate-complete",
      content: `Delegate ${name} completed (exit ${exitCode}, timed out: ${timedOut}). Run: ${run}`,
      display: true,
      details: {
        run_directory: run,
        exit_code: exitCode,
        timed_out: timedOut,
      },
    },
    options: { triggerTurn: true, deliverAs: "followUp" },
  };
}

// Initial discovery is BRIEF-gated across durable and legacy roots. Exact pane
// identity filters the widget, and existing completions are neither replayed
// nor claimed when a session starts.
const initialRoot = join(tmp, "initial-durable");
const initialLegacy = join(tmp, "initial-legacy");
await mkdir(initialRoot, { recursive: true });
await mkdir(initialLegacy, { recursive: true });
const initialCurrent = await makeRun(
  initialRoot,
  "implementer-current-pane",
  "pane:current",
);
await makeRun(initialRoot, "observer-other-pane", "pane:other");
await makeRun(initialRoot, "observer-missing-pane");
const malformedPaneRun = await makeRun(initialRoot, "observer-malformed-pane");
await writeFile(join(malformedPaneRun, "PANE"), "unsafe pane\n");
await makeRun(initialLegacy, "researcher-task\nunsafe", "pane:current");
await makeRun(initialLegacy, "unrelated-other-root", "pane:other");
const alreadyComplete = await makeRun(
  initialRoot,
  "reviewer-already-complete",
  "pane:current",
);
await writeTerminal(alreadyComplete, 0, false);
await mkdir(join(initialRoot, "vendor-without-brief"));
await writeFile(join(initialRoot, "ordinary-file"), "ignore\n");
const initialWatches = trackedWatchState();
const initial = createWatcherHarness(watchModule, {
  durableRoot: initialRoot,
  legacyRoot: initialLegacy,
  currentPane: "pane:current",
  watch: initialWatches.watch.bind(initialWatches),
});
await initial.start();
assertDefaultWidgetCall(initial.latestWidget());
assert.deepEqual(initial.latestWidget().content, [
  "● qq delegates",
  "├─ implementer-current-pane",
  "└─ researcher-task unsafe",
]);
assert.doesNotMatch(
  widgetText(initial),
  /other-pane|missing-pane|malformed-pane|unrelated-other-root/,
  "widget leaked a run without exact validated current-pane identity",
);
assert.equal(initial.messages.length, 0, "initial scan replayed an old completion");
assert.equal(await fileExists(join(alreadyComplete, ".wake-claimed")), false);
assert.ok(initialWatches.created.has(initialRoot), "durable root watch was not armed");
assert.ok(initialWatches.created.has(initialLegacy), "legacy root watch was not armed");
assert.ok(initialWatches.created.has(initialCurrent), "run watch was not armed");
initial.shutdown();

// A BRIEF-only run remains hidden until a later PANE event. Its matching
// TERMINAL clears the widget and sends the exact local custom message.
const eventRoot = join(tmp, "event-durable");
const eventLegacy = join(tmp, "event-legacy");
await mkdir(eventRoot, { recursive: true });
await mkdir(eventLegacy, { recursive: true });
const eventWatches = trackedWatchState();
const eventWatcher = createWatcherHarness(watchModule, {
  durableRoot: eventRoot,
  legacyRoot: eventLegacy,
  currentPane: "pane:event",
  watch: eventWatches.watch.bind(eventWatches),
});
await eventWatcher.start();
assertDefaultWidgetCall(eventWatcher.latestWidget());
assert.equal(eventWatcher.latestWidget().content, undefined);
const eventRun = await makeRun(eventRoot, "observer-brief-before-pane");
await waitFor(
  () => eventWatches.created.has(eventRun),
  "new BRIEF run was not armed for child filesystem events",
);
assert.doesNotMatch(widgetText(eventWatcher), /observer-brief-before-pane/);
await writeFile(join(eventRun, "PANE"), "pane:event\n");
await waitFor(
  () => widgetText(eventWatcher).includes("observer-brief-before-pane"),
  "later PANE event did not add its current-pane run to the widget",
);
assertDefaultWidgetCall(eventWatcher.latestWidget());
assert.deepEqual(eventWatcher.latestWidget().content, [
  "● qq delegates",
  "└─ observer-brief-before-pane",
]);
await writeTerminal(eventRun, 3, false);
await waitFor(
  () =>
    eventWatcher.latestWidget()?.content === undefined &&
    eventWatcher.messages.length === 1,
  "matching TERMINAL did not clear its widget and wake locally",
);
assertDefaultWidgetCall(eventWatcher.latestWidget());
assert.deepEqual(
  eventWatcher.messages,
  [expectedWake(eventRun, "observer-brief-before-pane", "3", "no")],
);
assert.equal(await fileExists(join(eventRun, ".wake-claimed")), true);
eventWatcher.shutdown();

// Duplicate watcher instances for the same pane race through one exclusive
// marker, so exactly one local Pi instance sends the completion.
const raceRoot = join(tmp, "race-durable");
const raceLegacy = join(tmp, "race-legacy");
await mkdir(raceRoot, { recursive: true });
await mkdir(raceLegacy, { recursive: true });
const raceRun = await makeRun(raceRoot, "implementer-race", "pane:race");
const raceDeps = {
  durableRoot: raceRoot,
  legacyRoot: raceLegacy,
  currentPane: "pane:race",
};
const raceA = createWatcherHarness(watchModuleA, raceDeps);
const raceB = createWatcherHarness(watchModuleB, raceDeps);
await raceA.start();
await raceB.start();
assert.match(widgetText(raceA), /implementer-race/);
assert.match(widgetText(raceB), /implementer-race/);
await writeTerminal(raceRun, 4, false);
await waitFor(
  () =>
    raceA.latestWidget()?.content === undefined &&
    raceB.latestWidget()?.content === undefined &&
    raceA.messages.length + raceB.messages.length === 1,
  "two local watcher instances did not settle one completion wake",
);
assert.deepEqual(
  [...raceA.messages, ...raceB.messages],
  [expectedWake(raceRun, "implementer-race", "4", "no")],
);
assert.equal(await fileExists(join(raceRun, ".wake-claimed")), true);
raceA.shutdown();
raceB.shutdown();

// Other-pane, missing-PANE, malformed-PANE, and absent/invalid current-pane
// watchers all observe TERMINAL but neither send nor consume the claim. A
// malformed terminal is used to prove unknown summaries cannot bypass owner
// matching.
async function assertUnownedCompletion({ name, runPane, rawPane, currentPane }) {
  const root = join(tmp, `${name}-durable`);
  const legacy = join(tmp, `${name}-legacy`);
  await mkdir(root, { recursive: true });
  await mkdir(legacy, { recursive: true });
  const run = await makeRun(root, name, runPane);
  if (rawPane !== undefined) await writeFile(join(run, "PANE"), rawPane);
  const watches = trackedWatchState();
  const watcher = createWatcherHarness(watchModule, {
    durableRoot: root,
    legacyRoot: legacy,
    currentPane,
    watch: watches.watch.bind(watches),
  });
  await watcher.start();
  assert.ok(watches.created.has(run), `${name} run watch was not armed`);
  await writeFile(join(run, "TERMINAL"), "malformed terminal\n");
  await waitFor(
    () => watches.closed.has(run),
    `${name} TERMINAL event was not classified`,
  );
  // A later root event cannot arm this run until the serialized TERMINAL
  // operation (including its ownership check) has returned.
  const flushRun = await makeRun(root, `${name}-flush`);
  await waitFor(
    () => watches.created.has(flushRun),
    `${name} ownership check did not settle before the next root event`,
  );
  assert.equal(watcher.messages.length, 0, `${name} sent a completion`);
  assert.equal(
    await fileExists(join(run, ".wake-claimed")),
    false,
    `${name} consumed the completion claim`,
  );
  watcher.shutdown();
}

await assertUnownedCompletion({
  name: "other-pane",
  runPane: "pane:other",
  currentPane: "pane:owner",
});
await assertUnownedCompletion({
  name: "missing-pane",
  currentPane: "pane:owner",
});
await assertUnownedCompletion({
  name: "malformed-pane",
  rawPane: "unsafe pane\n",
  currentPane: "pane:owner",
});
await assertUnownedCompletion({
  name: "missing-current-pane",
  runPane: "pane:owner",
  currentPane: undefined,
});
await assertUnownedCompletion({
  name: "invalid-current-pane",
  runPane: "pane:owner",
  currentPane: "unsafe pane",
});

// Once pane ownership matches, a malformed TERMINAL retains the bounded
// unknown summary and still uses the exact direct message shape.
const malformedRoot = join(tmp, "malformed-terminal-durable");
const malformedLegacy = join(tmp, "malformed-terminal-legacy");
await mkdir(malformedRoot, { recursive: true });
await mkdir(malformedLegacy, { recursive: true });
const malformedRun = await makeRun(
  malformedRoot,
  "reviewer-malformed-terminal",
  "pane:malformed",
);
const malformed = createWatcherHarness(watchModule, {
  durableRoot: malformedRoot,
  legacyRoot: malformedLegacy,
  currentPane: "pane:malformed",
});
await malformed.start();
await writeFile(join(malformedRun, "TERMINAL"), "malformed terminal\n");
await waitFor(
  () => malformed.messages.length === 1,
  "owned malformed TERMINAL did not wake",
);
assert.deepEqual(
  malformed.messages,
  [
    expectedWake(
      malformedRun,
      "reviewer-malformed-terminal",
      "unknown",
      "unknown",
    ),
  ],
);
malformed.shutdown();

// A direct local send exception is contained as one warning after the claim;
// it never escapes through the event queue or invokes another transport.
const throwRoot = join(tmp, "throw-durable");
const throwLegacy = join(tmp, "throw-legacy");
await mkdir(throwRoot, { recursive: true });
await mkdir(throwLegacy, { recursive: true });
const throwRun = await makeRun(throwRoot, "implementer-send-throw", "pane:throw");
const throwing = createWatcherHarness(
  watchModule,
  {
    durableRoot: throwRoot,
    legacyRoot: throwLegacy,
    currentPane: "pane:throw",
  },
  {
    sendImpl() {
      throw new Error("fixture direct send failed");
    },
  },
);
await throwing.start();
await writeTerminal(throwRun, 8, false);
await waitFor(
  () => throwing.messages.length === 1 && throwing.warnings.length === 1,
  "direct send exception was not contained as one local warning",
);
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(throwing.warnings.length, 1, "direct send exception warned more than once");
assert.equal(throwing.warnings[0].level, "warning");
assert.match(throwing.warnings[0].message, /completion wake failed/);
assert.match(throwing.warnings[0].message, /fixture direct send failed/);
assert.deepEqual(
  throwing.messages,
  [expectedWake(throwRun, "implementer-send-throw", "8", "no")],
);
assert.equal(await fileExists(join(throwRun, ".wake-claimed")), true);
throwing.shutdown();

// Shutdown clears the widget, closes every root/run watcher, and ignores later
// filesystem activity.
const cleanupRoot = join(tmp, "cleanup-durable");
const cleanupLegacy = join(tmp, "cleanup-legacy");
await mkdir(cleanupRoot, { recursive: true });
await mkdir(cleanupLegacy, { recursive: true });
await makeRun(cleanupRoot, "researcher-cleanup", "pane:cleanup");
const cleanupWatches = trackedWatchState();
const cleanup = createWatcherHarness(watchModule, {
  durableRoot: cleanupRoot,
  legacyRoot: cleanupLegacy,
  currentPane: "pane:cleanup",
  watch: cleanupWatches.watch.bind(cleanupWatches),
});
await cleanup.start();
assert.match(widgetText(cleanup), /researcher-cleanup/);
cleanup.shutdown();
assertDefaultWidgetCall(cleanup.latestWidget());
assert.equal(cleanup.latestWidget().content, undefined, "shutdown did not clear widget");
cleanup.shutdown();
assert.equal(
  cleanupWatches.closedCount,
  cleanupWatches.createdCount,
  "shutdown leaked filesystem watchers",
);
const widgetCallsAfterShutdown = cleanup.widgetCalls.length;
await makeRun(cleanupRoot, "researcher-after-shutdown", "pane:cleanup");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  cleanup.widgetCalls.length,
  widgetCallsAfterShutdown,
  "shutdown retained filesystem-driven widget updates",
);

// Widget output is bounded to eight matching runs plus one overflow row.
const overflowRoot = join(tmp, "overflow-durable");
const overflowLegacy = join(tmp, "overflow-legacy");
await mkdir(overflowRoot, { recursive: true });
await mkdir(overflowLegacy, { recursive: true });
for (let index = 0; index < 10; index += 1) {
  await makeRun(
    overflowRoot,
    `implementer-widget-${String(index).padStart(2, "0")}`,
    "pane:overflow",
  );
}
const overflow = createWatcherHarness(watchModule, {
  durableRoot: overflowRoot,
  legacyRoot: overflowLegacy,
  currentPane: "pane:overflow",
});
await overflow.start();
assertDefaultWidgetCall(overflow.latestWidget());
assert.equal(overflow.latestWidget().content.length, 10);
assert.equal(overflow.latestWidget().content[0], "● qq delegates");
assert.equal(overflow.latestWidget().content[1], "├─ implementer-widget-00");
assert.equal(overflow.latestWidget().content[8], "├─ implementer-widget-07");
assert.equal(overflow.latestWidget().content[9], "└─ +2 more");
assert.doesNotMatch(widgetText(overflow), /implementer-widget-(08|09)/);
overflow.shutdown();

// Non-UI sessions retain discovery and cleanup without calling setWidget.
const noUiRoot = join(tmp, "no-ui-durable");
const noUiLegacy = join(tmp, "no-ui-legacy");
await mkdir(noUiRoot, { recursive: true });
await mkdir(noUiLegacy, { recursive: true });
await makeRun(noUiRoot, "implementer-no-ui", "pane:no-ui");
const noUi = createWatcherHarness(
  watchModule,
  {
    durableRoot: noUiRoot,
    legacyRoot: noUiLegacy,
    currentPane: "pane:no-ui",
  },
  { hasUI: false },
);
await noUi.start();
noUi.shutdown();
assert.equal(noUi.widgetCalls.length, 0, "ctx.hasUI=false still called setWidget");

JS
then
  fail 'delegate watcher extension node suite failed'
fi

grep -Fq 'import registerDelegateWatch from "./qq-delegate-watch.ts";' "$INDEX" \
  || fail 'extensions/index.ts does not import qq-delegate-watch'
grep -Fq 'registerDelegateWatch(pi);' "$INDEX" \
  || fail 'extensions/index.ts does not register qq-delegate-watch'

printf 'test-qq-delegate-watch-extension: pass\n'
