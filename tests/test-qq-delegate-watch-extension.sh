#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-delegate-watch-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
WATCH_EXTENSION="$ROOT/extensions/qq-delegate-watch.ts"
FOOTER_EXTENSION="$ROOT/extensions/qq-footer.ts"
INDEX="$ROOT/extensions/index.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch.ts"
cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch-a.ts"
cp -- "$WATCH_EXTENSION" "$TMP/qq-delegate-watch-b.ts"
cp -- "$FOOTER_EXTENSION" "$TMP/qq-footer.mjs"

if ! node --experimental-strip-types --input-type=module - \
  "$TMP/qq-delegate-watch.ts" \
  "$TMP/qq-delegate-watch-a.ts" \
  "$TMP/qq-delegate-watch-b.ts" \
  "$TMP/qq-footer.mjs" \
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

const [watchPath, watchAPath, watchBPath, footerPath, sourcePath] =
  process.argv.slice(2);
const watchModule = await import(pathToFileURL(watchPath));
const watchModuleA = await import(pathToFileURL(watchAPath));
const watchModuleB = await import(pathToFileURL(watchBPath));
const { default: registerFooter } = await import(pathToFileURL(footerPath));
const source = await readFile(sourcePath, "utf8");
assert.doesNotMatch(source, /setInterval|setTimeout\([^,]+,\s*[1-9][0-9]*\s*\).*scan/s,
  "delegate discovery contains production polling");

const tmp = dirname(watchPath);

async function waitFor(predicate, message, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function makeRun(root, name) {
  const run = join(root, name);
  await mkdir(run, { recursive: true, mode: 0o700 });
  await writeFile(join(run, "BRIEF.md"), "# bounded work order\n");
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
) {
  const events = new Map();
  const warnings = [];
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
    ui: {
      notify(message, level) {
        warnings.push({ message, level });
      },
    },
  };
  return {
    events,
    warnings,
    async start() {
      await events.get("session_start")({ type: "session_start" }, ctx);
    },
    shutdown() {
      events.get("session_shutdown")({ type: "session_shutdown" }, ctx);
    },
  };
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

// Initial discovery is BRIEF-gated across both roots. Existing completions are
// not replayed as wakes when a session starts.
const initialRoot = join(tmp, "initial-durable");
const initialLegacy = join(tmp, "initial-legacy");
await mkdir(initialRoot, { recursive: true });
await mkdir(initialLegacy, { recursive: true });
const initialDurableRun = await makeRun(initialRoot, "implementer-T-192-alpha");
const unsafeNamedRun = await makeRun(initialLegacy, "researcher-task\nunsafe");
const alreadyComplete = await makeRun(initialRoot, "reviewer-already-complete");
await writeTerminal(alreadyComplete, 0, false);
await mkdir(join(initialRoot, "vendor-without-brief"));
await writeFile(join(initialRoot, "ordinary-file"), "ignore\n");
const initialFallbacks = [];
const initial = createWatcherHarness(watchModule, {
  durableRoot: initialRoot,
  legacyRoot: initialLegacy,
  brokerSocketPath: join(tmp, "absent-initial.sock"),
  herdrNotify: async (notice) => initialFallbacks.push(notice),
});
await initial.start();
let rows = watchModule.getDelegateRows();
assert.equal(rows.length, 2, "initial scan did not find both BRIEF-only roots");
assert.deepEqual(
  rows.map((row) => row.path),
  [initialDurableRun, unsafeNamedRun],
  "initial rows did not preserve durable-then-legacy first-seen order",
);
assert.ok(rows.every((row) => !/[\x00-\x1f\x7f]/.test(row.name)));
assert.equal(initialFallbacks.length, 0, "initial scan replayed an old completion");

const eventRun = await makeRun(initialRoot, "observer-new-fs-event");
await waitFor(
  () => watchModule.getDelegateRows().some((row) => row.path === eventRun),
  "fs event did not add a newly created run",
);
await writeTerminal(eventRun, 3, false);
await waitFor(
  () =>
    !watchModule.getDelegateRows().some((row) => row.path === eventRun) &&
    initialFallbacks.length === 1,
  "TERMINAL event did not remove its row and wake",
);
assert.match(initialFallbacks[0].body, /exit 3, timed out: no/);
assert.match(initialFallbacks[0].body, new RegExp(eventRun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
initial.shutdown();

// Independent qq sessions race on one TERMINAL; the exclusive marker permits
// exactly one fallback while both instances observe and remove the row.
const raceRoot = join(tmp, "race-durable");
const raceLegacy = join(tmp, "race-legacy");
await mkdir(raceRoot, { recursive: true });
await mkdir(raceLegacy, { recursive: true });
const raceRun = await makeRun(raceRoot, "implementer-race");
const raceFallbacks = [];
const raceDeps = {
  durableRoot: raceRoot,
  legacyRoot: raceLegacy,
  brokerSocketPath: join(tmp, "absent-race.sock"),
  herdrNotify: async (notice) => raceFallbacks.push(notice),
};
const raceA = createWatcherHarness(watchModuleA, raceDeps);
const raceB = createWatcherHarness(watchModuleB, raceDeps);
await raceA.start();
await raceB.start();
assert.equal(watchModuleA.getDelegateRows().length, 1);
assert.equal(watchModuleB.getDelegateRows().length, 1);
await writeTerminal(raceRun, 4, false);
await waitFor(
  () =>
    watchModuleA.getDelegateRows().length === 0 &&
    watchModuleB.getDelegateRows().length === 0 &&
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
  { durableRoot: herdrRoot, legacyRoot: herdrLegacy },
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

// Shutdown closes every root/run watcher and drops row listeners.
const cleanupRoot = join(tmp, "cleanup-durable");
const cleanupLegacy = join(tmp, "cleanup-legacy");
await mkdir(cleanupRoot, { recursive: true });
await mkdir(cleanupLegacy, { recursive: true });
await makeRun(cleanupRoot, "researcher-cleanup");
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
  watch: trackedWatch,
  herdrNotify: async () => {},
});
await cleanup.start();
let rowUpdates = 0;
const unsubscribe = watchModule.subscribeDelegateRows(() => {
  rowUpdates += 1;
});
await makeRun(cleanupRoot, "researcher-cleanup-event");
await waitFor(() => rowUpdates > 0, "row listener did not observe an fs event");
cleanup.shutdown();
cleanup.shutdown();
assert.equal(closedWatchers, createdWatchers, "shutdown leaked fs watchers");
const updatesAfterShutdown = rowUpdates;
await makeRun(cleanupRoot, "researcher-after-shutdown");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(rowUpdates, updatesAfterShutdown, "shutdown retained row listeners");
unsubscribe();

// qq-footer remains the sole setFooter owner and composes capped delegate rows
// above its existing context/quota row.
const footerRoot = join(tmp, "footer-durable");
const footerLegacy = join(tmp, "footer-legacy");
await mkdir(footerRoot, { recursive: true });
await mkdir(footerLegacy, { recursive: true });
const footerRuns = [];
for (let index = 0; index < 10; index += 1) {
  footerRuns.push(await makeRun(footerRoot, `implementer-footer-${String(index).padStart(2, "0")}`));
}
const footerFallbacks = [];
const footerWatcher = createWatcherHarness(watchModule, {
  durableRoot: footerRoot,
  legacyRoot: footerLegacy,
  herdrNotify: async (notice) => footerFallbacks.push(notice),
});
await footerWatcher.start();
const authPath = join(tmp, "footer-auth.json");
await writeFile(authPath, JSON.stringify({
  "openai-codex": { access: "fixture-token", accountId: "fixture-account" },
}));
const footerEvents = new Map();
const intervals = [];
let footer;
let renderCount = 0;
const tui = { requestRender() { renderCount += 1; } };
const theme = { fg(_color, text) { return text; } };
const footerData = {
  getGitBranch: () => "main",
  getExtensionStatuses: () => new Map(),
  onBranchChange: () => () => {},
};
const footerCtx = {
  cwd: "/worktree",
  model: { provider: "openai-codex", contextWindow: 200000 },
  getContextUsage: () => ({ contextWindow: 200000, percent: 10 }),
  ui: {
    setFooter(factory) {
      if (factory === undefined) {
        footer = undefined;
      } else {
        footer = factory(tui, theme, footerData);
      }
    },
  },
};
const footerPi = {
  on(name, handler) { footerEvents.set(name, handler); },
  registerCommand() {},
  getSessionName: () => "pane-session",
};
const widthKit = {
  visibleWidth: (value) => [...String(value)].length,
  truncateToWidth(value, width, ellipsis = "...") {
    const chars = [...String(value)];
    if (chars.length <= width) return chars.join("");
    if (width <= ellipsis.length) return ellipsis.slice(0, width);
    return chars.slice(0, width - ellipsis.length).join("") + ellipsis;
  },
};
registerFooter(footerPi, {
  authPath,
  widthKit,
  fetch: async () => ({
    ok: true,
    async json() {
      return {
        rate_limit: {
          primary_window: { used_percent: 50, limit_window_seconds: 604800 },
          secondary_window: null,
        },
      };
    },
  }),
  setInterval(_callback, delay) {
    intervals.push(delay);
    return intervals.length;
  },
  clearInterval() {},
  setTimeout(callback, delay) { return { callback, delay }; },
  clearTimeout() {},
});
await footerEvents.get("session_start")({ type: "session_start" }, footerCtx);
await waitFor(() => renderCount > 0, "footer quota fetch did not repaint");
const lines = footer.render(160);
assert.equal(lines.length, 10, "footer did not cap 10 delegates at 8 plus overflow");
assert.match(lines[0], /^├─ implementer-footer-00 · \d+[smhd]$/);
assert.match(lines[8], /^└─ \+2 more$/);
assert.ok(lines[9].includes("CX ▓▓▓▓░░░░ wk"), "existing quota bar disappeared");
assert.ok(lines.slice(0, 9).every((line) => !line.includes("CX ")),
  "quota row was not below delegate rows");
assert.deepEqual(intervals, [300000], "footer quota polling behavior changed");
const beforeDelegateRepaint = renderCount;
await writeTerminal(footerRuns[0], 0, false);
await waitFor(
  () => renderCount > beforeDelegateRepaint,
  "delegate fs event did not repaint the composed footer",
);
footer.dispose();
footerEvents.get("session_shutdown")({ type: "session_shutdown" }, footerCtx);
footerWatcher.shutdown();

JS
then
  fail 'delegate watcher extension node suite failed'
fi

grep -Fq 'import registerDelegateWatch from "./qq-delegate-watch.ts";' "$INDEX" \
  || fail 'extensions/index.ts does not import qq-delegate-watch'
grep -Fq 'registerDelegateWatch(pi);' "$INDEX" \
  || fail 'extensions/index.ts does not register qq-delegate-watch'

printf 'test-qq-delegate-watch-extension: pass\n'
