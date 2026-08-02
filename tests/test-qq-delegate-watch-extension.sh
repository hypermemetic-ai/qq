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
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const [watchPath, watchAPath, watchBPath, sourcePath] = process.argv.slice(2);
const watchModule = await import(pathToFileURL(watchPath));
const watchModuleA = await import(pathToFileURL(watchAPath));
const watchModuleB = await import(pathToFileURL(watchBPath));
const source = await readFile(sourcePath, "utf8");
assert.doesNotMatch(source, /setInterval|setTimeout\([^,]+,\s*[1-9][0-9]*\s*\).*scan/s,
  "delegate discovery contains production polling");
assert.doesNotMatch(source, /getDelegateRows|subscribeDelegateRows|rowListeners/,
  "watcher retained the old footer publication API");

const tmp = dirname(watchPath);

async function waitFor(predicate, message, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
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

function createWatcherHarness(
  module,
  deps,
  execImpl = async () => assert.fail("test watcher attempted the real herdr command"),
  hasUI = true,
) {
  const events = new Map();
  const warnings = [];
  const widgetCalls = [];
  const pi = {
    on(name, handler) {
      events.set(name, handler);
    },
    exec: execImpl,
  };
  module.default(pi, deps);
  assert.equal(typeof events.get("session_start"), "function");
  assert.equal(typeof events.get("session_shutdown"), "function");
  const ctx = {
    hasUI,
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
  assert.equal(call.argumentCount, 2, "setWidget passed placement/options instead of using above-editor default");
}

function widgetText(harness) {
  const content = harness.latestWidget()?.content;
  return Array.isArray(content) ? content.join("\n") : "";
}

function encoded(message) {
  const payload = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

async function fakeBroker(socketPath, sessions) {
  await mkdir(dirname(socketPath), { recursive: true });
  await unlink(socketPath).catch(() => {});
  const received = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < length + 4) return;
        const message = JSON.parse(buffer.subarray(4, length + 4).toString("utf8"));
        buffer = buffer.subarray(length + 4);
        received.push(message);
        if (message.type === "register") {
          socket.write(encoded({ type: "registered", sessionId: "watcher-id" }));
        } else if (message.type === "list") {
          socket.write(encoded({
            type: "sessions",
            requestId: message.requestId,
            sessions,
          }));
        } else if (message.type === "send") {
          socket.write(encoded({
            type: "delivered",
            messageId: message.message.id,
          }));
        } else if (message.type === "unregister") {
          socket.end();
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return {
    received,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      await unlink(socketPath).catch(() => {});
    },
  };
}

// Initial discovery is BRIEF-gated across both roots, but presentation is
// fail-closed to exact validated pane identity. Existing completions are not
// replayed as wakes when a session starts.
const initialRoot = join(tmp, "initial-durable");
const initialLegacy = join(tmp, "initial-legacy");
await mkdir(initialRoot, { recursive: true });
await mkdir(initialLegacy, { recursive: true });
await makeRun(initialRoot, "implementer-current-pane", "pane:current");
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
const initialFallbacks = [];
const initial = createWatcherHarness(watchModule, {
  durableRoot: initialRoot,
  legacyRoot: initialLegacy,
  currentPane: "pane:current",
  brokerSocketPath: join(tmp, "absent-initial.sock"),
  herdrNotify: async (notice) => initialFallbacks.push(notice),
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
assert.equal(initialFallbacks.length, 0, "initial scan replayed an old completion");
initial.shutdown();

// A BRIEF-only run remains hidden until a later PANE fs event. Its TERMINAL
// event then clears the widget and retains the completion wake.
const eventRoot = join(tmp, "event-durable");
const eventLegacy = join(tmp, "event-legacy");
await mkdir(eventRoot, { recursive: true });
await mkdir(eventLegacy, { recursive: true });
const eventWatchedPaths = new Set();
function eventTrackedWatch(path, options, callback) {
  eventWatchedPaths.add(path);
  return fsWatch(path, options, callback);
}
const eventFallbacks = [];
const eventWatcher = createWatcherHarness(watchModule, {
  durableRoot: eventRoot,
  legacyRoot: eventLegacy,
  currentPane: "pane:event",
  watch: eventTrackedWatch,
  brokerSocketPath: join(tmp, "absent-event.sock"),
  herdrNotify: async (notice) => eventFallbacks.push(notice),
});
await eventWatcher.start();
assertDefaultWidgetCall(eventWatcher.latestWidget());
assert.equal(eventWatcher.latestWidget().content, undefined);
const eventRun = await makeRun(eventRoot, "observer-brief-before-pane");
await waitFor(
  () => eventWatchedPaths.has(eventRun),
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
  () => eventWatcher.latestWidget()?.content === undefined && eventFallbacks.length === 1,
  "TERMINAL event did not clear its widget and wake",
);
assertDefaultWidgetCall(eventWatcher.latestWidget());
assert.match(eventFallbacks[0].body, /exit 3, timed out: no/);
assert.match(eventFallbacks[0].body, new RegExp(eventRun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
eventWatcher.shutdown();

// Independent qq sessions race on one TERMINAL; the exclusive marker permits
// exactly one fallback while both instances observe and clear the row.
const raceRoot = join(tmp, "race-durable");
const raceLegacy = join(tmp, "race-legacy");
await mkdir(raceRoot, { recursive: true });
await mkdir(raceLegacy, { recursive: true });
const raceRun = await makeRun(raceRoot, "implementer-race", "pane:race");
const raceFallbacks = [];
const raceDeps = {
  durableRoot: raceRoot,
  legacyRoot: raceLegacy,
  currentPane: "pane:race",
  brokerSocketPath: join(tmp, "absent-race.sock"),
  herdrNotify: async (notice) => raceFallbacks.push(notice),
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
    raceFallbacks.length === 1,
  "two watcher instances did not settle one completion wake",
);
assert.equal(raceFallbacks.length, 1, "claim file allowed duplicate wakes");
assert.ok(await readFile(join(raceRun, ".wake-claimed"), "utf8").then(() => true));
raceA.shutdown();
raceB.shutdown();

// The broker test speaks the installed intercom framing and message shapes.
const brokerRoot = join(tmp, "broker-durable");
const brokerLegacy = join(tmp, "broker-legacy");
await mkdir(brokerRoot, { recursive: true });
await mkdir(brokerLegacy, { recursive: true });
const brokerRun = await makeRun(brokerRoot, "reviewer-pane-target");
await writeFile(join(brokerRun, "PANE"), "pane:ABC_7\n");
const brokerPath = join(tmp, "intercom", "broker.sock");
const broker = await fakeBroker(brokerPath, [
  {
    id: "target-session-id",
    name: "PANE:abc_7",
    cwd: "/target",
    model: "fixture",
    pid: 12,
    startedAt: 1,
    lastActivity: 2,
    status: "idle",
  },
]);
const brokerFallbacks = [];
const brokerWatcher = createWatcherHarness(watchModule, {
  durableRoot: brokerRoot,
  legacyRoot: brokerLegacy,
  currentPane: "pane:ABC_7",
  brokerSocketPath: brokerPath,
  herdrNotify: async (notice) => brokerFallbacks.push(notice),
});
await brokerWatcher.start();
await writeTerminal(brokerRun, 124, true);
await waitFor(
  () => broker.received.some((message) => message.type === "send"),
  "exact pane-named intercom target did not receive completion",
);
const protocol = broker.received.map((message) => message.type);
assert.deepEqual(protocol.slice(0, 3), ["register", "list", "send"]);
const sent = broker.received.find((message) => message.type === "send");
assert.equal(sent.to, "target-session-id", "watcher did not target the listed session id");
assert.match(sent.message.content.text, /reviewer-pane-target/);
assert.match(sent.message.content.text, /exit 124, timed out: yes/);
assert.match(sent.message.content.text, new RegExp(brokerRun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
await waitFor(
  () => broker.received.some((message) => message.type === "unregister"),
  "temporary intercom presence did not unregister",
);
assert.equal(brokerFallbacks.length, 0, "successful intercom delivery also used herdr");
brokerWatcher.shutdown();
await broker.close();

// Missing pane target, missing broker, and missing PANE each degrade through
// the injected operator-visible herdr notification exactly once.
const fallbackRoot = join(tmp, "fallback-durable");
const fallbackLegacy = join(tmp, "fallback-legacy");
await mkdir(fallbackRoot, { recursive: true });
await mkdir(fallbackLegacy, { recursive: true });
const missingTargetRun = await makeRun(fallbackRoot, "observer-missing-target");
const missingBrokerRun = await makeRun(fallbackRoot, "observer-missing-broker");
const missingPaneRun = await makeRun(fallbackRoot, "observer-missing-pane");
await writeFile(join(missingTargetRun, "PANE"), "pane:missing\n");
await writeFile(join(missingBrokerRun, "PANE"), "pane:offline\n");
const fallbackBrokerPath = join(tmp, "fallback-intercom", "broker.sock");
const noTargetBroker = await fakeBroker(fallbackBrokerPath, []);
const fallbacks = [];
const fallbackWatcher = createWatcherHarness(watchModule, {
  durableRoot: fallbackRoot,
  legacyRoot: fallbackLegacy,
  currentPane: undefined,
  brokerSocketPath: fallbackBrokerPath,
  herdrNotify: async (notice) => fallbacks.push(notice),
});
await fallbackWatcher.start();
await writeTerminal(missingTargetRun, 5, false);
await waitFor(() => fallbacks.length === 1, "missing target did not use herdr once");
await noTargetBroker.close();
await writeTerminal(missingBrokerRun, 6, false);
await waitFor(() => fallbacks.length === 2, "missing broker did not use herdr once");
await writeFile(join(missingPaneRun, "TERMINAL"), "malformed terminal\n");
await waitFor(() => fallbacks.length === 3, "missing PANE did not use herdr once");
assert.equal(fallbacks.length, 3);
assert.match(fallbacks[2].body, /exit unknown, timed out: unknown/);
fallbackWatcher.shutdown();

// The production fallback invokes the exact herdr notification surface and a
// missing herdr binary becomes a local warning rather than a session failure.
const herdrRoot = join(tmp, "herdr-durable");
const herdrLegacy = join(tmp, "herdr-legacy");
await mkdir(herdrRoot, { recursive: true });
await mkdir(herdrLegacy, { recursive: true });
const herdrGoodRun = await makeRun(herdrRoot, "implementer-herdr-good");
const herdrFailedRun = await makeRun(herdrRoot, "implementer-herdr-failed");
const herdrCalls = [];
const herdrWatcher = createWatcherHarness(
  watchModule,
  { durableRoot: herdrRoot, legacyRoot: herdrLegacy, currentPane: undefined },
  async (command, args, options) => {
    herdrCalls.push({ command, args, options });
    return { code: herdrCalls.length === 1 ? 0 : 127, killed: false };
  },
);
await herdrWatcher.start();
await writeTerminal(herdrGoodRun, 0, false);
await waitFor(() => herdrCalls.length === 1, "default herdr fallback did not run");
assert.equal(herdrCalls[0].command, "herdr");
assert.deepEqual(herdrCalls[0].args.slice(0, 2), ["notification", "show"]);
assert.deepEqual(herdrCalls[0].args.slice(-2), ["--sound", "request"]);
assert.ok(herdrCalls[0].args.includes("--body"));
assert.equal(herdrCalls[0].options.timeout, 5000);
await writeTerminal(herdrFailedRun, 8, false);
await waitFor(
  () => herdrCalls.length === 2 && herdrWatcher.warnings.length === 1,
  "unavailable herdr did not surface one local warning",
);
assert.equal(herdrWatcher.warnings[0].level, "warning");
assert.match(herdrWatcher.warnings[0].message, /Herdr notification failed/);
herdrWatcher.shutdown();

// Shutdown clears the widget, closes every root/run watcher, and ignores later
// filesystem activity.
const cleanupRoot = join(tmp, "cleanup-durable");
const cleanupLegacy = join(tmp, "cleanup-legacy");
await mkdir(cleanupRoot, { recursive: true });
await mkdir(cleanupLegacy, { recursive: true });
await makeRun(cleanupRoot, "researcher-cleanup", "pane:cleanup");
let createdWatchers = 0;
let closedWatchers = 0;
function trackedWatch(path, options, callback) {
  const watcher = fsWatch(path, options, callback);
  const close = watcher.close.bind(watcher);
  let closed = false;
  watcher.close = () => {
    if (!closed) {
      closed = true;
      closedWatchers += 1;
    }
    return close();
  };
  createdWatchers += 1;
  return watcher;
}
const cleanup = createWatcherHarness(watchModule, {
  durableRoot: cleanupRoot,
  legacyRoot: cleanupLegacy,
  currentPane: "pane:cleanup",
  watch: trackedWatch,
  herdrNotify: async () => {},
});
await cleanup.start();
assert.match(widgetText(cleanup), /researcher-cleanup/);
cleanup.shutdown();
assertDefaultWidgetCall(cleanup.latestWidget());
assert.equal(cleanup.latestWidget().content, undefined, "shutdown did not clear widget");
cleanup.shutdown();
assert.equal(closedWatchers, createdWatchers, "shutdown leaked fs watchers");
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
  herdrNotify: async () => {},
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

// Missing or malformed current pane identity fails closed rather than showing
// the global active set, and non-UI sessions never call setWidget.
const closedRoot = join(tmp, "closed-durable");
const closedLegacy = join(tmp, "closed-legacy");
await mkdir(closedRoot, { recursive: true });
await mkdir(closedLegacy, { recursive: true });
await makeRun(closedRoot, "implementer-global-hidden", "pane:valid");
for (const currentPane of [undefined, "unsafe pane"]) {
  const closed = createWatcherHarness(watchModule, {
    durableRoot: closedRoot,
    legacyRoot: closedLegacy,
    currentPane,
    herdrNotify: async () => {},
  });
  await closed.start();
  assertDefaultWidgetCall(closed.latestWidget());
  assert.equal(closed.latestWidget().content, undefined);
  closed.shutdown();
}
const noUi = createWatcherHarness(
  watchModule,
  {
    durableRoot: closedRoot,
    legacyRoot: closedLegacy,
    currentPane: "pane:valid",
    herdrNotify: async () => {},
  },
  undefined,
  false,
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
