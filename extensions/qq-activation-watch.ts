// @ts-nocheck

import { createHash, randomUUID } from "node:crypto";
import { watch as watchFs } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

export const WATCHER_VERSION = "qq-activation-watch-v1";
const PANE_TOKEN = /^[A-Za-z0-9:_-]{1,128}$/;
const RUN_TOKEN = /^[A-Za-z0-9:_-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/;
const LOADED_PATHS = [
  "AGENTS.md",
  "skills",
  "extensions",
  ".pi/prompts/bro.md",
  ".pi/prompts/check-in.md",
];
const MAX_RECORD = 256 * 1024;

function singleLine(value) {
  return String(value ?? "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu, " ")
    .replace(/ +/g, " ")
    .trim();
}

async function safeLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return undefined;
    throw error;
  }
}

async function exactDirectory(path, label, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const state = await safeLstat(path);
  if (
    !state?.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid?.() ||
    (state.mode & 0o777) !== 0o700
  ) {
    throw new Error(`${label} must be an operator-owned mode-0700 non-symlink directory`);
  }
  return path;
}

async function readJson(path, label) {
  const state = await safeLstat(path);
  if (
    !state?.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid?.() ||
    (state.mode & 0o777) !== 0o600 ||
    state.size > MAX_RECORD
  ) {
    throw new Error(`${label} is not a private bounded regular record`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is malformed`);
  }
}

async function atomicJson(path, value, replace = false) {
  const temporary = join(dirname(path), `.${path.split("/").at(-1)}.${process.pid}.${randomUUID()}.tmp`);
  const body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body) > MAX_RECORD) throw new Error("activation record exceeds its size bound");
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (replace) await rename(temporary, path);
    else await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function validateRequest(value) {
  const keys = [
    "schema", "version", "run_id", "action", "before_tree", "landed_tree",
    "resource_fingerprint", "changed_loaded_resources", "replacement_resources",
    "replacement", "reason", "citation", "task_id", "pull_request", "pr_url",
    "merge_commit", "source_branch", "expected_watcher_version", "created_at", "targets",
    "probe_id",
  ].sort();
  if (!value || typeof value !== "object" || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys)) {
    throw new Error("activation request has an unexpected schema shape");
  }
  if (
    value.schema !== "qq.activation-request" ||
    value.version !== 1 ||
    !RUN_TOKEN.test(value.run_id) ||
    !["reload", "replace"].includes(value.action) ||
    !HASH.test(value.resource_fingerprint) ||
    !RUN_TOKEN.test(value.expected_watcher_version ?? "") ||
    !Array.isArray(value.targets)
  ) {
    throw new Error("activation request identity or version is unsupported");
  }
  const targetTokens = new Set();
  const targetPanes = new Set();
  const targetSessions = new Set();
  const targetKeys = ["token", "pane_id", "tab_id", "workspace_id", "session_path", "cwd", "name", "observed_status", "replacement_launch"].sort();
  for (const target of value.targets) {
    const expectedToken = target && typeof target.pane_id === "string" && typeof target.session_path === "string"
      ? createHash("sha256").update(`${target.pane_id}\0${target.session_path}`).digest("hex").slice(0, 32)
      : "";
    if (
      !target ||
      typeof target !== "object" ||
      JSON.stringify(Object.keys(target).sort()) !== JSON.stringify(targetKeys) ||
      target.token !== expectedToken ||
      !PANE_TOKEN.test(target.pane_id ?? "") ||
      !PANE_TOKEN.test(target.tab_id ?? "") ||
      !PANE_TOKEN.test(target.workspace_id ?? "") ||
      typeof target.session_path !== "string" ||
      !target.session_path.startsWith("/") ||
      typeof target.cwd !== "string" ||
      !target.cwd.startsWith("/") ||
      !["idle", "working", "blocked"].includes(target.observed_status) ||
      (target.name !== null && !PANE_TOKEN.test(target.name ?? "")) ||
      JSON.stringify(target.replacement_launch) !== JSON.stringify({ kind: "pi", contract: "pi-session-cwd-v1", args: ["--session", target.session_path] }) ||
      targetTokens.has(target.token) || targetPanes.has(target.pane_id) || targetSessions.has(target.session_path)
    ) {
      throw new Error("activation request target authority is malformed");
    }
    targetTokens.add(target.token);
    targetPanes.add(target.pane_id);
    targetSessions.add(target.session_path);
  }
  if (value.action === "replace" && value.replacement !== "pi-session-cwd-v1") {
    throw new Error("activation replacement contract is unsupported");
  }
  return value;
}

function defaultFingerprint(repo) {
  const result = spawnSync(
    "git",
    ["-C", repo, "ls-tree", "-rz", "--full-tree", "HEAD", "--", ...LOADED_PATHS],
    { encoding: null, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0 || result.error) throw new Error("cannot derive the loaded qq resource fingerprint");
  return createHash("sha256").update(result.stdout).digest("hex");
}

function defaultAuthority(target) {
  const result = spawnSync("herdr", ["agent", "get", target.pane_id], {
    encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new Error("live Herdr target authority is unavailable");
  let agent;
  try {
    agent = JSON.parse(result.stdout)?.result?.agent;
  } catch {
    throw new Error("live Herdr target authority is malformed");
  }
  const session = agent?.agent_session;
  const cwd = agent?.foreground_cwd ?? agent?.cwd;
  if (
    agent?.agent !== "pi" ||
    agent?.pane_id !== target.pane_id ||
    agent?.tab_id !== target.tab_id ||
    agent?.workspace_id !== target.workspace_id ||
    agent?.interactive_ready !== true ||
    session?.agent !== "pi" ||
    session?.kind !== "path" ||
    session?.source !== "herdr:pi" ||
    session?.value !== target.session_path ||
    resolve(cwd ?? "") !== resolve(target.cwd)
  ) {
    throw new Error("live Herdr pane/session/cwd authority is contradictory");
  }
  if (agent.agent_status !== "idle") {
    throw new Error(`live Herdr target is ${singleLine(agent.agent_status) || "not idle"}`);
  }
  return true;
}

function defaultReplace(runDir, token, processId) {
  const helper = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/lib/qq-activation.py");
  const child = spawn(helper, ["replace", "--run", runDir, "--target", token, "--old-pid", String(processId)], {
    detached: true,
    stdio: "ignore",
    cwd: "/",
    env: process.env,
  });
  child.unref();
}

export default function register(pi, deps = {}) {
  const runtimeRoot = resolve(
    deps.runtimeRoot ??
      process.env.QQ_DISPATCH_RUNTIME_ROOT ??
      join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "qq", "delegate"),
  );
  const defaultRoot = resolve(
    join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "qq", "delegate"),
  );
  const activationRoot = join(runtimeRoot, ".qq-activation");
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const currentPane = deps.currentPane ?? process.env.HERDR_PANE_ID;
  const watch = deps.watch ?? watchFs;
  const loadedFingerprint = deps.fingerprint ?? (() => defaultFingerprint(repoRoot));
  const targetAuthority = deps.authority ?? defaultAuthority;
  const replaceProcess = deps.replaceProcess ?? defaultReplace;
  const processId = deps.processId ?? process.pid;
  const runtimeNonce = randomUUID();
  const runWatchers = new Map();
  const pendingCommands = new Map();
  const queued = new Set();
  const warned = new Set();
  let rootWatcher;
  let ctx;
  let active = false;
  let activeTools = 0;
  let lifecycleBlocked = false;
  let pending = Promise.resolve();
  let startReason = "startup";

  function warning(message) {
    const text = singleLine(message);
    try {
      ctx?.ui?.notify?.(text, "warning");
    } catch {
      // Activation evidence remains in the run even when UI warning fails.
    }
  }

  function enqueue(operation) {
    pending = pending.then(async () => {
      if (active) await operation();
    }).catch((error) => warning(`qq activation watcher failed: ${error instanceof Error ? error.message : String(error)}`));
    return pending;
  }

  function sessionPath() {
    const value = ctx?.sessionManager?.getSessionFile?.();
    return typeof value === "string" && value.startsWith("/") ? value : undefined;
  }

  function safeBoundary() {
    if (!ctx?.isIdle?.()) return "Pi is busy or has a queued continuation";
    if (ctx?.hasPendingMessages?.()) return "Pi has a queued continuation";
    if (activeTools !== 0) return "a tool turn is active";
    if (lifecycleBlocked || deps.isBlocked?.()) return "an extension-blocked or atomic operation is active";
    return undefined;
  }

  async function recordFailure(runDir, request, target, reason) {
    const receipts = await exactDirectory(join(runDir, "receipts"), "activation receipts", true);
    await atomicJson(join(receipts, `${target.token}.json`), {
      schema: "qq.activation-receipt", version: 1, run_id: request.run_id,
      target: target.token, pane_id: target.pane_id, session_path: target.session_path,
      status: "failed", reason: singleLine(reason).slice(0, 500), action: request.action,
      source_watcher_version: WATCHER_VERSION, running_watcher_version: WATCHER_VERSION,
      resource_fingerprint: request.resource_fingerprint, process_id: processId,
      recorded_at: new Date().toISOString(),
    }, true);
    warning(`qq activation ${request.run_id} failed for this session: ${reason}`);
  }

  async function finalizeIfReloaded(runDir, request, target) {
    const receiptPath = join(runDir, "receipts", `${target.token}.json`);
    const receiptState = await safeLstat(receiptPath);
    if (receiptState) {
      const receipt = await readJson(receiptPath, "activation receipt");
      return receipt.status === "activated" || receipt.status === "failed";
    }
    const attemptPath = join(runDir, "attempts", `${target.token}.json`);
    const attemptState = await safeLstat(attemptPath);
    if (!attemptState) return false;
    const attempt = await readJson(attemptPath, "activation attempt");
    if (attempt.run_id !== request.run_id || attempt.target !== target.token) {
      await recordFailure(runDir, request, target, "activation attempt identity is contradictory");
      return true;
    }
    if (attempt.phase === "queued") {
      // A command that was never entered owns no lifecycle transition. A new
      // process, or a newly reloaded runtime, may recover it by re-claiming.
      if (attempt.runtime_nonce !== runtimeNonce && (attempt.process_id !== processId || startReason === "reload")) {
        await rm(join(runDir, "claims", `${target.token}.json`), { force: true });
        await rm(attemptPath, { force: true });
        return false;
      }
      return true;
    }
    if (attempt.phase !== "requested") {
      await recordFailure(runDir, request, target, `activation attempt phase is unsupported: ${singleLine(attempt.phase)}`);
      return true;
    }
    let crossedLifecycle = attempt.runtime_nonce !== runtimeNonce;
    if (request.action === "replace") {
      const helperPath = join(runDir, "helpers", `${target.token}.json`);
      const helperState = await safeLstat(helperPath);
      if (!helperState) return true;
      const helper = await readJson(helperPath, "replacement helper record");
      if (
        helper.schema !== "qq.activation-replacement" ||
        helper.version !== 1 ||
        helper.run_id !== request.run_id ||
        helper.target !== target.token ||
        helper.pane_id !== target.pane_id ||
        helper.old_pid !== attempt.process_id ||
        helper.expected_watcher_version !== request.expected_watcher_version ||
        helper.resource_fingerprint !== request.resource_fingerprint
      ) {
        await recordFailure(runDir, request, target, "replacement helper authority is contradictory");
        return true;
      }
      if (helper.status === "failed") {
        await recordFailure(runDir, request, target, helper.error ?? "replacement helper failed");
        return true;
      }
      crossedLifecycle = crossedLifecycle && ["waiting-for-graceful-shutdown", "started"].includes(helper.status) && attempt.process_id !== processId;
    } else {
      crossedLifecycle = crossedLifecycle && startReason === "reload";
    }
    if (!crossedLifecycle) return true;
    try {
      await targetAuthority(target);
    } catch (error) {
      await recordFailure(runDir, request, target, `post-lifecycle Herdr authority failed: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
    const observed = await loadedFingerprint();
    if (observed !== request.resource_fingerprint || WATCHER_VERSION !== request.expected_watcher_version) {
      await recordFailure(runDir, request, target, "post-lifecycle watcher version or loaded fingerprint is stale");
      return true;
    }
    const receipts = await exactDirectory(join(runDir, "receipts"), "activation receipts", true);
    await atomicJson(join(receipts, `${target.token}.json`), {
      schema: "qq.activation-receipt", version: 1, run_id: request.run_id,
      target: target.token, pane_id: target.pane_id, session_path: target.session_path,
      status: "activated", reason: request.reason, action: request.action,
      source_watcher_version: attempt.watcher_version,
      running_watcher_version: WATCHER_VERSION,
      resource_fingerprint: observed, process_id: processId,
      recorded_at: new Date().toISOString(),
    });
    return true;
  }

  async function claimAndQueue(runDir, request, target) {
    const blocked = safeBoundary();
    if (blocked) {
      const key = `${request.run_id}:${target.token}:${blocked}`;
      if (!warned.has(key)) {
        warned.add(key);
        warning(`qq activation ${request.run_id} is pending: ${blocked}`);
      }
      return;
    }
    try {
      await targetAuthority(target);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const key = `${request.run_id}:${target.token}:authority:${reason}`;
      if (!warned.has(key)) {
        warned.add(key);
        warning(`qq activation ${request.run_id} is pending: ${reason}`);
      }
      return;
    }
    const observed = await loadedFingerprint();
    if (observed !== request.resource_fingerprint) {
      const key = `${request.run_id}:${target.token}:fingerprint`;
      if (!warned.has(key)) {
        warned.add(key);
        warning(`qq activation ${request.run_id} is pending: the mounted resource fingerprint does not match`);
      }
      return;
    }
    const claims = await exactDirectory(join(runDir, "claims"), "activation claims", true);
    const claimPath = join(claims, `${target.token}.json`);
    try {
      await atomicJson(claimPath, {
        schema: "qq.activation-claim", version: 1, run_id: request.run_id,
        target: target.token, pane_id: target.pane_id, session_path: target.session_path,
        process_id: processId, runtime_nonce: runtimeNonce, watcher_version: WATCHER_VERSION,
        claimed_at: new Date().toISOString(),
      });
    } catch (error) {
      if (error?.code === "EEXIST") return;
      throw error;
    }
    const attempts = await exactDirectory(join(runDir, "attempts"), "activation attempts", true);
    const attempt = {
      schema: "qq.activation-attempt", version: 1, run_id: request.run_id,
      target: target.token, pane_id: target.pane_id, session_path: target.session_path,
      action: request.action, phase: "queued", process_id: processId,
      runtime_nonce: runtimeNonce, watcher_version: WATCHER_VERSION,
      resource_fingerprint: observed, recorded_at: new Date().toISOString(),
    };
    await atomicJson(join(attempts, `${target.token}.json`), attempt);
    const key = `${request.run_id}:${target.token}`;
    pendingCommands.set(key, { runDir, request, target, attempt });
    queued.add(key);
    void pi.sendUserMessage(`/qq-activate ${request.run_id} ${target.token}`, { deliverAs: "followUp" }).catch(async (error) => {
      await recordFailure(runDir, request, target, `command delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async function inspectRun(runDir) {
    const state = await safeLstat(runDir);
    if (!state?.isDirectory() || state.isSymbolicLink() || (state.mode & 0o777) !== 0o700) return;
    const requestState = await safeLstat(join(runDir, "REQUEST.json"));
    if (!requestState) return;
    const request = validateRequest(await readJson(join(runDir, "REQUEST.json"), "activation request"));
    const path = sessionPath();
    const matches = request.targets.filter((target) => target.pane_id === currentPane);
    if (!PANE_TOKEN.test(currentPane ?? "") || matches.length === 0) return;
    if (matches.length !== 1 || !path || matches[0].session_path !== path || resolve(matches[0].cwd) !== resolve(ctx.cwd)) {
      warning(`qq activation ${request.run_id} refuses contradictory pane/session/cwd authority`);
      return;
    }
    const target = matches[0];
    if (await finalizeIfReloaded(runDir, request, target)) return;
    await claimAndQueue(runDir, request, target);
  }

  function watchRun(runDir) {
    if (runWatchers.has(runDir)) return;
    try {
      const watcher = watch(runDir, { persistent: false }, () => void enqueue(() => inspectRun(runDir)));
      watcher.on?.("error", (error) => {
        runWatchers.delete(runDir);
        try { watcher.close(); } catch {}
        warning(`qq activation run watcher died: ${singleLine(error?.message ?? error)}`);
      });
      runWatchers.set(runDir, watcher);
    } catch (error) {
      warning(`qq activation run cannot be watched: ${singleLine(error?.message ?? error)}`);
    }
  }

  async function scan() {
    const entries = await readdir(activationRoot, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const runDir = join(activationRoot, entry.name);
      watchRun(runDir);
      await inspectRun(runDir);
    }
  }

  async function writeProbeEvidence(reason) {
    const probeId = process.env.QQ_ACTIVATION_PROBE_ID;
    if (!probeId) return;
    if (runtimeRoot === defaultRoot) throw new Error("live activation probe refuses the default/shared runtime root");
    const probe = await readJson(join(runtimeRoot, "PROBE.json"), "activation probe identity");
    if (
      probe.schema !== "qq.activation-probe" ||
      probe.version !== 1 ||
      probe.probe_id !== probeId ||
      probe.status !== "prepared" ||
      probe.expected_watcher_version !== process.env.QQ_ACTIVATION_EXPECTED_WATCHER_VERSION ||
      probe.expected_watcher_version !== WATCHER_VERSION
    ) {
      throw new Error("activation probe identity or expected watcher version is stale");
    }
    const watchers = await exactDirectory(join(runtimeRoot, ".qq-activation-watchers"), "activation probe watcher evidence", true);
    const pane = PANE_TOKEN.test(currentPane ?? "") ? currentPane : "missing-pane";
    await atomicJson(join(watchers, `${pane.replace(/[:]/g, "_")}-${processId}-${runtimeNonce}.json`), {
      schema: "qq.activation-watcher", version: 1, probe_id: probeId, pane_id: currentPane ?? null,
      session_path: sessionPath() ?? null, expected_watcher_version: probe.expected_watcher_version,
      running_watcher_version: WATCHER_VERSION, resource_fingerprint: await loadedFingerprint(),
      process_id: processId, runtime_nonce: runtimeNonce, start_reason: reason,
      recorded_at: new Date().toISOString(),
    });
  }

  async function start(event, nextCtx) {
    ctx = nextCtx;
    startReason = event?.reason ?? "startup";
    active = true;
    lifecycleBlocked = false;
    activeTools = 0;
    await exactDirectory(runtimeRoot, "dispatch runtime root", true);
    await exactDirectory(activationRoot, "activation lifecycle root", true);
    await writeProbeEvidence(startReason);
    await scan();
    rootWatcher = watch(activationRoot, { persistent: false }, () => void enqueue(scan));
    rootWatcher.on?.("error", (error) => {
      try { rootWatcher?.close(); } catch {}
      rootWatcher = undefined;
      warning(`qq activation root watcher died: ${singleLine(error?.message ?? error)}`);
    });
    // Reconcile after arming to close the scan/watch race without polling.
    await scan();
  }

  function shutdown() {
    active = false;
    lifecycleBlocked = true;
    try { rootWatcher?.close(); } catch {}
    rootWatcher = undefined;
    for (const watcher of runWatchers.values()) {
      try { watcher.close(); } catch {}
    }
    runWatchers.clear();
    ctx = undefined;
  }

  pi.registerCommand("qq-activate", {
    description: "Internal settled-boundary qq resource activation command.",
    handler: async (args, commandCtx) => {
      const [runId, token, extra] = String(args ?? "").trim().split(/ +/);
      const key = `${runId}:${token}`;
      const item = !extra && pendingCommands.get(key);
      if (!item || !queued.has(key)) return;
      queued.delete(key);
      const blocked = safeBoundary();
      if (blocked) {
        await recordFailure(item.runDir, item.request, item.target, `internal activation command crossed an unsafe boundary: ${blocked}`);
        return;
      }
      item.attempt.phase = "requested";
      item.attempt.recorded_at = new Date().toISOString();
      await atomicJson(join(item.runDir, "attempts", `${token}.json`), item.attempt, true);
      if (item.request.action === "replace") {
        replaceProcess(item.runDir, token, processId);
        commandCtx.shutdown();
        return;
      }
      try {
        await commandCtx.reload();
        return;
      } catch (error) {
        await recordFailure(item.runDir, item.request, item.target, `Pi reload failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });

  pi.on("tool_execution_start", () => { activeTools += 1; });
  pi.on("tool_execution_end", () => { activeTools = Math.max(0, activeTools - 1); });
  pi.on("agent_settled", async () => { await enqueue(scan); });
  pi.on("session_start", async (event, nextCtx) => {
    try {
      await start(event, nextCtx);
    } catch (error) {
      warning(`qq activation watcher refused startup: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  pi.on("session_shutdown", shutdown);
}
