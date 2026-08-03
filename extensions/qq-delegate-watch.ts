// @ts-nocheck

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

const MAX_WIDGET_RUNS = 8;
const PANE_TOKEN = /^[A-Za-z0-9:_-]{1,64}$/;
const WIDGET_KEY = "qq-delegates";

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
  const currentPaneSource = Object.hasOwn(deps, "currentPane")
    ? deps.currentPane
    : process.env.HERDR_PANE_ID;
  const currentPane =
    typeof currentPaneSource === "string" && PANE_TOKEN.test(currentPaneSource)
      ? currentPaneSource
      : undefined;
  const watch = deps.watch ?? watchFs;
  const makeDirectory = deps.mkdir ?? mkdir;
  const records = new Map();
  const completedSeen = new Set();
  const rootWatchers = new Map();
  const directoryWatchers = new Map();
  let nextOrder = 0;
  let active = false;
  let ctx;
  let lastWidgetSignature;
  let pending = Promise.resolve();

  function warning(message) {
    const text = singleLine(message);
    try {
      ctx?.ui?.notify?.(text, "warning");
    } catch {
      // The watcher must not break the interactive session while warning.
    }
  }

  function updateWidget() {
    if (!ctx?.hasUI) return;
    const matching = currentPane
      ? [...records.values()]
          .filter((record) => record.pane === currentPane)
          .sort((left, right) => left.order - right.order)
      : [];
    if (matching.length === 0) {
      if (lastWidgetSignature === "") return;
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      lastWidgetSignature = "";
      return;
    }

    const shown = matching.slice(0, MAX_WIDGET_RUNS);
    const overflow = matching.length - shown.length;
    const lines = [
      "● qq delegates",
      ...shown.map((record, index) => {
        const last = index === shown.length - 1 && overflow === 0;
        return `${last ? "└─" : "├─"} ${record.name}`;
      }),
    ];
    if (overflow > 0) lines.push(`└─ +${overflow} more`);
    const signature = JSON.stringify(lines);
    if (lastWidgetSignature === signature) return;
    ctx.ui.setWidget(WIDGET_KEY, lines);
    lastWidgetSignature = signature;
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
    updateWidget();
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

  async function wake(runDir) {
    const pane = await paneFor(runDir);
    if (!currentPane || pane !== currentPane) return;

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

    try {
      await pi.sendMessage(
        {
          customType: "qq-delegate-complete",
          content: body,
          display: true,
          details: {
            run_directory: runDir,
            exit_code: state.exitCode,
            timed_out: state.timedOut,
          },
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    } catch (error) {
      warning(
        `Delegate completion wake failed for ${name}: ${error instanceof Error ? error.message : String(error)}`,
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
    const pane = await paneFor(runDir);
    const existing = records.get(runDir);
    if (existing) {
      if (existing.pane !== pane) {
        existing.pane = pane;
        updateWidget();
      }
      return;
    }
    records.set(runDir, {
      path: runDir,
      name: safeRunName(runDir),
      order: nextOrder++,
      pane,
    });
    updateWidget();
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
    lastWidgetSignature = undefined;
    updateWidget();
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
    lastWidgetSignature = undefined;
    updateWidget();
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
