// @ts-nocheck

import { randomUUID } from "node:crypto";
import { watch as watchFs } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createConnection } from "node:net";

const BROKER_TIMEOUT_MS = 2_000;
const MAX_FRAME_BYTES = 1024 * 1024;
const PANE_TOKEN = /^[A-Za-z0-9:_-]{1,64}$/;

let visibleState = [];
const rowListeners = new Set();

function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function singleLine(value) {
  return stripAnsi(String(value ?? ""))
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu, " ")
    .replace(/ +/g, " ")
    .trim();
}

function safeRunName(path) {
  return singleLine(basename(path)) || "delegate";
}

function compactAge(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function publish(rows) {
  const ordered = [...rows].sort((left, right) => left.order - right.order);
  const changed =
    ordered.length !== visibleState.length ||
    ordered.some(
      (row, index) =>
        row.path !== visibleState[index]?.path ||
        row.name !== visibleState[index]?.name ||
        row.startedAt !== visibleState[index]?.startedAt,
    );
  if (!changed) return;
  visibleState = ordered;
  for (const listener of [...rowListeners]) {
    try {
      listener();
    } catch {
      // A footer listener cannot break delegate discovery.
    }
  }
}

export function getDelegateRows() {
  const current = Date.now();
  return visibleState.map((row) => ({
    name: row.name,
    path: row.path,
    age: compactAge(current - row.startedAt),
  }));
}

export function subscribeDelegateRows(listener) {
  if (typeof listener !== "function") return () => {};
  rowListeners.add(listener);
  return () => rowListeners.delete(listener);
}

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function sendThroughBroker(socketPath, pane, text, deps = {}) {
  const connect = deps.createConnection ?? createConnection;
  const startTimeout = deps.setTimeout ?? globalThis.setTimeout;
  const stopTimeout = deps.clearTimeout ?? globalThis.clearTimeout;
  const timeoutMs = deps.brokerTimeoutMs ?? BROKER_TIMEOUT_MS;

  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let registered = false;
    let buffer = Buffer.alloc(0);
    const requestId = randomUUID();
    const messageId = randomUUID();
    const now = Date.now();
    let socket;

    function write(message) {
      socket.write(frame(message));
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      stopTimeout(timeout);
      if (registered && socket && !socket.destroyed) {
        try {
          socket.end(frame({ type: "unregister" }));
        } catch {
          socket.destroy();
        }
      } else {
        socket?.destroy?.();
      }
      if (error) rejectPromise(error);
      else resolvePromise(true);
    }

    function handle(message) {
      if (message === null || typeof message !== "object") {
        finish(new Error("intercom returned an invalid message"));
        return;
      }
      if (message.type === "registered") {
        if (registered || typeof message.sessionId !== "string") {
          finish(new Error("intercom registration response was invalid"));
          return;
        }
        registered = true;
        write({ type: "list", requestId });
        return;
      }
      if (message.type === "sessions" && message.requestId === requestId) {
        if (!Array.isArray(message.sessions)) {
          finish(new Error("intercom session list was invalid"));
          return;
        }
        const targetName = pane.toLowerCase();
        const matches = message.sessions.filter(
          (session) =>
            session !== null &&
            typeof session === "object" &&
            typeof session.id === "string" &&
            typeof session.name === "string" &&
            session.name.toLowerCase() === targetName,
        );
        if (matches.length !== 1) {
          finish(new Error("accountable pane has no unique live intercom presence"));
          return;
        }
        write({
          type: "send",
          to: matches[0].id,
          message: {
            id: messageId,
            timestamp: Date.now(),
            content: { text },
          },
        });
        return;
      }
      if (message.type === "delivered" && message.messageId === messageId) {
        finish();
        return;
      }
      if (
        message.type === "delivery_failed" &&
        message.messageId === messageId
      ) {
        finish(
          new Error(
            typeof message.reason === "string"
              ? message.reason
              : "intercom delivery failed",
          ),
        );
        return;
      }
      if (message.type === "error") {
        finish(
          new Error(
            typeof message.error === "string"
              ? message.error
              : "intercom broker error",
          ),
        );
      }
      // Presence broadcasts can arrive between request/response messages.
    }

    const timeout = startTimeout(
      () => finish(new Error("intercom completion delivery timed out")),
      timeoutMs,
    );

    try {
      socket = connect(socketPath);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    socket.on("connect", () => {
      try {
        write({
          type: "register",
          session: {
            name: `qq-delegate-watch-${process.pid}-${randomUUID()}`,
            cwd: process.cwd(),
            model: "qq-delegate-watch",
            pid: process.pid,
            startedAt: now,
            lastActivity: now,
            status: "busy",
          },
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on("data", (chunk) => {
      if (settled) return;
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length > MAX_FRAME_BYTES) {
          finish(new Error("intercom frame was too large"));
          return;
        }
        if (buffer.length < 4 + length) return;
        const payload = buffer.subarray(4, 4 + length);
        buffer = buffer.subarray(4 + length);
        try {
          handle(JSON.parse(payload.toString("utf8")));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      }
    });
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (!settled) finish(new Error("intercom broker disconnected"));
    });
  });
}

async function safeLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
}

async function terminalSummary(runDir) {
  const terminalPath = join(runDir, "TERMINAL");
  try {
    const state = await safeLstat(terminalPath);
    if (!state?.isFile() || state.isSymbolicLink() || state.size > 64 * 1024) {
      throw new Error("unsafe terminal record");
    }
    const value = JSON.parse(await readFile(terminalPath, "utf8"));
    if (
      value?.schema !== "qq-run-terminal" ||
      value?.version !== 2 ||
      !Number.isSafeInteger(value?.exit_code) ||
      typeof value?.timed_out !== "boolean"
    ) {
      throw new Error("malformed terminal record");
    }
    return {
      exitCode: String(value.exit_code),
      timedOut: value.timed_out ? "yes" : "no",
    };
  } catch {
    return { exitCode: "unknown", timedOut: "unknown" };
  }
}

async function paneFor(runDir) {
  try {
    const path = join(runDir, "PANE");
    const state = await safeLstat(path);
    if (!state?.isFile() || state.isSymbolicLink() || state.size > 66) return undefined;
    const raw = await readFile(path, "utf8");
    const pane = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    if (!PANE_TOKEN.test(pane) || raw !== pane && raw !== `${pane}\n`) {
      return undefined;
    }
    return pane;
  } catch {
    return undefined;
  }
}

function isBeneath(path, root) {
  return path.startsWith(`${root}/`);
}

export default function register(pi, deps = {}) {
  const durableRoot = resolve(
    deps.durableRoot ??
      process.env.QQ_DISPATCH_RUNTIME_ROOT ??
      join(
        process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
        "qq",
        "delegate",
      ),
  );
  const legacyRoot = resolve(
    deps.legacyRoot ??
      join(
        process.env.TMPDIR ?? tmpdir(),
        `pi-subagents-uid-${process.getuid?.() ?? 0}`,
      ),
  );
  const roots = [...new Set([durableRoot, legacyRoot])];
  const brokerSocketPath =
    deps.brokerSocketPath ?? join(homedir(), ".pi", "agent", "intercom", "broker.sock");
  const watch = deps.watch ?? watchFs;
  const makeDirectory = deps.mkdir ?? mkdir;
  const now = deps.now ?? Date.now;
  const brokerSend = deps.sendThroughBroker ?? sendThroughBroker;
  const records = new Map();
  const completedSeen = new Set();
  const rootWatchers = new Map();
  const directoryWatchers = new Map();
  let nextOrder = 0;
  let active = false;
  let ctx;
  let pending = Promise.resolve();

  function warning(message) {
    const text = singleLine(message);
    try {
      ctx?.ui?.notify?.(text, "warning");
    } catch {
      // The watcher must not break the interactive session while warning.
    }
  }

  function currentRows() {
    return [...records.values()];
  }

  function updateRows() {
    publish(currentRows());
  }

  function closeWatcher(map, path) {
    const watcher = map.get(path);
    if (!watcher) return;
    map.delete(path);
    try {
      watcher.close();
    } catch {
      // Closing an already-closed inotify handle is harmless.
    }
  }

  function removeRecord(path) {
    if (!records.delete(path)) return;
    updateRows();
  }

  function enqueue(operation) {
    pending = pending
      .then(async () => {
        if (active) await operation();
      })
      .catch((error) => {
        warning(
          `Delegate watcher event failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    return pending;
  }

  async function defaultHerdrNotify({ title, body }) {
    if (typeof pi.exec !== "function") {
      throw new Error("herdr execution is unavailable");
    }
    const result = await pi.exec(
      "herdr",
      ["notification", "show", title, "--body", body, "--sound", "request"],
      { timeout: deps.herdrTimeoutMs ?? 5_000 },
    );
    if (result?.killed || result?.code !== 0) {
      throw new Error("herdr notification command failed");
    }
  }

  const herdrNotify = deps.herdrNotify ?? defaultHerdrNotify;

  async function wake(runDir) {
    let claim;
    try {
      claim = await open(join(runDir, ".wake-claimed"), "wx", 0o600);
      await claim.close();
    } catch (error) {
      try {
        await claim?.close();
      } catch {
        // The exclusive claim outcome is already known.
      }
      if (error?.code === "EEXIST" || error?.code === "ENOENT") return;
      warning(
        `Cannot claim delegate completion for ${safeRunName(runDir)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const state = await terminalSummary(runDir);
    const name = safeRunName(runDir);
    const safePath = singleLine(runDir);
    const body = `Delegate ${name} completed (exit ${state.exitCode}, timed out: ${state.timedOut}). Run: ${safePath}`;
    const title = `Delegate complete: ${name}`;
    const pane = await paneFor(runDir);

    if (pane) {
      try {
        await brokerSend(brokerSocketPath, pane, body, deps);
        return;
      } catch {
        // Missing or ambiguous pane presence degrades to an operator wake.
      }
    }

    try {
      await herdrNotify({ title, body });
    } catch (error) {
      warning(
        `${body} Herdr notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function inspectDirectory(runDir, initial) {
    const directory = await safeLstat(runDir);
    if (!directory?.isDirectory() || directory.isSymbolicLink()) {
      removeRecord(runDir);
      completedSeen.delete(runDir);
      closeWatcher(directoryWatchers, runDir);
      return;
    }

    const brief = await safeLstat(join(runDir, "BRIEF.md"));
    if (!brief?.isFile() || brief.isSymbolicLink()) {
      removeRecord(runDir);
      return;
    }

    const terminal = await safeLstat(join(runDir, "TERMINAL"));
    if (terminal !== undefined) {
      removeRecord(runDir);
      closeWatcher(directoryWatchers, runDir);
      const alreadySeen = completedSeen.has(runDir);
      completedSeen.add(runDir);
      if (!initial && !alreadySeen) await wake(runDir);
      return;
    }

    completedSeen.delete(runDir);
    if (!records.has(runDir)) {
      records.set(runDir, {
        path: runDir,
        name: safeRunName(runDir),
        startedAt:
          Number.isFinite(brief.mtimeMs) && brief.mtimeMs > 0
            ? brief.mtimeMs
            : now(),
        order: nextOrder++,
      });
      updateRows();
    }
  }

  function watchDirectory(runDir) {
    if (directoryWatchers.has(runDir)) return;
    try {
      const watcher = watch(runDir, { persistent: false }, () => {
        void enqueue(() => inspectDirectory(runDir, false));
      });
      watcher.on?.("error", (error) => {
        closeWatcher(directoryWatchers, runDir);
        removeRecord(runDir);
        if (error?.code !== "ENOENT") {
          warning(`Delegate run watch failed for ${safeRunName(runDir)}`);
        }
      });
      directoryWatchers.set(runDir, watcher);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        warning(`Cannot watch delegate run ${safeRunName(runDir)}`);
      }
    }
  }

  async function scanRoot(root, initial) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      entries = [];
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const present = new Set();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const runDir = join(root, entry.name);
      present.add(runDir);
      if (!initial) watchDirectory(runDir);
      await inspectDirectory(runDir, initial);
    }

    for (const runDir of [...directoryWatchers.keys()]) {
      if (isBeneath(runDir, root) && !present.has(runDir)) {
        closeWatcher(directoryWatchers, runDir);
        removeRecord(runDir);
        completedSeen.delete(runDir);
      }
    }
    for (const runDir of [...completedSeen]) {
      if (isBeneath(runDir, root) && !present.has(runDir)) {
        completedSeen.delete(runDir);
      }
    }
  }

  function watchRoot(root) {
    if (rootWatchers.has(root)) return;
    try {
      const watcher = watch(root, { persistent: false }, () => {
        void enqueue(() => scanRoot(root, false));
      });
      watcher.on?.("error", (error) => {
        closeWatcher(rootWatchers, root);
        if (error?.code !== "ENOENT") warning(`Delegate root watch failed: ${root}`);
      });
      rootWatchers.set(root, watcher);
    } catch (error) {
      if (error?.code !== "ENOENT") warning(`Cannot watch delegate root: ${root}`);
    }
  }

  async function start(nextCtx) {
    ctx = nextCtx;
    active = true;
    records.clear();
    completedSeen.clear();
    nextOrder = 0;
    publish([]);
    try {
      await makeDirectory(durableRoot, { recursive: true, mode: 0o700 });
    } catch (error) {
      warning(
        `Cannot prepare durable delegate root: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (const root of roots) {
      try {
        await scanRoot(root, true);
        watchRoot(root);
        // Arm child watches only after the initial classification. A single
        // post-arm reconciliation closes the scan/watch race without polling.
        await scanRoot(root, false);
      } catch (error) {
        warning(
          `Cannot scan delegate root ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  function shutdown() {
    active = false;
    for (const path of [...rootWatchers.keys()]) closeWatcher(rootWatchers, path);
    for (const path of [...directoryWatchers.keys()]) {
      closeWatcher(directoryWatchers, path);
    }
    records.clear();
    completedSeen.clear();
    publish([]);
    rowListeners.clear();
    ctx = undefined;
  }

  pi.on("session_start", async (_event, nextCtx) => {
    try {
      await start(nextCtx);
    } catch (error) {
      warning(
        `Delegate watcher could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  pi.on("session_shutdown", shutdown);
}
