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
  realpath,
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
  let observedPath;
  try {
    observedPath = await realpath(path);
  } catch (error) {
    throw new Error(`${label} cannot be resolved exactly: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    !state?.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid?.() ||
    (state.mode & 0o777) !== 0o700 ||
    observedPath !== path
  ) {
    throw new Error(`${label} must be an operator-owned mode-0700 exact non-symlink directory`);
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

export function defaultSubmitCommand(target, command) {
  if (!PANE_TOKEN.test(target?.pane_id ?? "") || !/^\/qq-activate [A-Za-z0-9:_-]{1,128} [0-9a-f]{32}$/.test(command)) {
    throw new Error("internal activation command submission identity is unsafe");
  }
  const output = spawnSync("herdr", ["agent", "prompt", target.pane_id, command], {
    encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  if (output.status !== 0 || output.error) {
    throw new Error("Herdr internal activation command submission failed");
  }
  let result;
  try {
    result = JSON.parse(output.stdout)?.result;
  } catch {
    throw new Error("Herdr internal activation command response is malformed");
  }
  if (result?.type !== "agent_prompted" || result?.agent?.pane_id !== target.pane_id) {
    throw new Error("Herdr did not confirm internal activation command submission to the exact pane");
  }
  return result;
}

export function defaultReplace(runDir, token, processId, request, target) {
  const helper = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/lib/qq-activation.py");
  const child = spawn(
    helper,
    ["replace", "--run", runDir, "--target", token, "--old-pid", String(processId), "--accept-fd", "3"],
    { detached: true, stdio: ["ignore", "ignore", "ignore", "pipe"], cwd: "/", env: process.env },
  );
  const acceptance = child.stdio[3];
  return new Promise((resolveLaunch, rejectLaunch) => {
    let settled = false;
    let body = Buffer.alloc(0);
    const finish = (error, record) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      acceptance?.off("data", onData);
      acceptance?.off("error", onPipeError);
      acceptance?.destroy();
      if (error) {
        let failure = error;
        try {
          if (child.pid && !child.killed) child.kill("SIGTERM");
        } catch (killError) {
          failure = new Error(`${error.message}; replacement helper termination failed: ${killError instanceof Error ? killError.message : String(killError)}`);
        }
        rejectLaunch(failure);
        return;
      }
      child.unref();
      resolveLaunch(record);
    };
    const onError = (error) => finish(new Error(`replacement helper launch failed: ${error.message}`));
    const onExit = (code, signal) => finish(new Error(`replacement helper exited before acceptance (${code ?? signal ?? "unknown"})`));
    const onPipeError = (error) => finish(new Error(`replacement helper acceptance failed: ${error.message}`));
    const onData = (chunk) => {
      body = Buffer.concat([body, chunk]);
      if (body.length > 8192) {
        finish(new Error("replacement helper acceptance exceeded its size bound"));
        return;
      }
      const newline = body.indexOf(0x0a);
      if (newline < 0) return;
      let record;
      try {
        if (body.subarray(newline + 1).toString("utf8").trim()) throw new Error("trailing acceptance data");
        record = JSON.parse(body.subarray(0, newline).toString("utf8"));
      } catch (error) {
        finish(new Error(`replacement helper acceptance is malformed: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      if (
        record?.schema !== "qq.activation-replacement-acceptance" ||
        record?.version !== 1 ||
        record?.status !== "accepted" ||
        record?.run_id !== request.run_id ||
        record?.target !== token ||
        record?.pane_id !== target.pane_id ||
        record?.old_pid !== processId ||
        !Number.isInteger(record?.helper_pid) || record.helper_pid <= 0 ||
        record?.expected_watcher_version !== request.expected_watcher_version ||
        record?.resource_fingerprint !== request.resource_fingerprint
      ) {
        finish(new Error("replacement helper acceptance does not own the exact request and target"));
        return;
      }
      finish(undefined, record);
    };
    const timeout = setTimeout(() => finish(new Error("replacement helper did not accept the exact request within 3000ms")), 3000);
    child.once("error", onError);
    child.once("exit", onExit);
    acceptance?.on("data", onData);
    acceptance?.once("error", onPipeError);
    if (!acceptance) finish(new Error("replacement helper acceptance pipe is unavailable"));
  });
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
  const submitCommand = deps.submitCommand ?? defaultSubmitCommand;
  const processId = deps.processId ?? process.pid;
  const runtimeNonce = randomUUID();
  const blockerEventsAvailable = typeof pi.events?.on === "function";
  const runWatchers = new Map();
  const pendingCommands = new Map();
  const queued = new Set();
  const blockerDeferred = new Set();
  const warned = new Set();
  let rootWatcher;
  let ctx;
  let active = false;
  let activeTools = 0;
  let blockerInvalid = !blockerEventsAvailable;
  let blockerLabels = [];
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

  function closeWatcher(watcher, label) {
    if (!watcher) return;
    try {
      watcher.close();
    } catch (error) {
      warning(`${label} could not close: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function updateBlocker(data) {
    if (!active) return;
    if (!data || typeof data.active !== "boolean") {
      blockerInvalid = true;
      warning("qq activation blocker lifecycle is malformed and remains blocked");
      return;
    }
    const label = typeof data.label === "string" && data.label.trim() ? singleLine(data.label) : undefined;
    if (data.active) {
      blockerLabels.push(label);
      return;
    }
    if (blockerLabels.length === 0) {
      blockerInvalid = true;
      warning("qq activation blocker lifecycle underflowed and remains blocked");
      return;
    }
    if (label === undefined) {
      blockerLabels.pop();
      return;
    }
    const matchingLabel = blockerLabels.lastIndexOf(label);
    if (matchingLabel < 0) {
      blockerInvalid = true;
      warning("qq activation blocker release contradicted the active labels and remains blocked");
      return;
    }
    blockerLabels.splice(matchingLabel, 1);
  }

  function sessionPath() {
    const value = ctx?.sessionManager?.getSessionFile?.();
    return typeof value === "string" && value.startsWith("/") ? value : undefined;
  }

  function extensionBlocked() {
    return blockerInvalid || blockerLabels.length > 0 || deps.isBlocked?.();
  }

  function safeBoundary() {
    if (!ctx?.isIdle?.()) return "Pi is busy or has a queued continuation";
    if (ctx?.hasPendingMessages?.()) return "Pi has a queued continuation";
    if (activeTools !== 0) return "a tool turn is active";
    if (extensionBlocked()) return "an extension-blocked or atomic operation is active";
    return undefined;
  }

  function editorBoundary() {
    if (ctx?.hasUI !== true || typeof ctx?.ui?.getEditorText !== "function") {
      return "Pi UI editor state is unavailable";
    }
    let text;
    try {
      text = ctx.ui.getEditorText();
    } catch {
      return "Pi UI editor state is unreadable";
    }
    if (typeof text !== "string") return "Pi UI editor state is unreadable";
    if (text !== "") return "the Pi editor is not exactly empty";
    return undefined;
  }

  function exactClaim(claim, request, target) {
    const keys = [
      "schema", "version", "run_id", "target", "pane_id", "session_path",
      "process_id", "runtime_nonce", "watcher_version", "claimed_at",
    ].sort();
    return Boolean(
      claim && typeof claim === "object" &&
      JSON.stringify(Object.keys(claim).sort()) === JSON.stringify(keys) &&
      claim.schema === "qq.activation-claim" && claim.version === 1 &&
      claim.run_id === request.run_id && claim.target === target.token &&
      claim.pane_id === target.pane_id && claim.session_path === target.session_path &&
      Number.isInteger(claim.process_id) && claim.process_id > 0 &&
      RUN_TOKEN.test(claim.runtime_nonce ?? "") && RUN_TOKEN.test(claim.watcher_version ?? "") &&
      typeof claim.claimed_at === "string" && claim.claimed_at.length > 0
    );
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
      return receipt.status === "activated" || receipt.status === "failed" || receipt.status === "absent";
    }
    const attemptPath = join(runDir, "attempts", `${target.token}.json`);
    const attemptState = await safeLstat(attemptPath);
    if (!attemptState) {
      const claimPath = join(runDir, "claims", `${target.token}.json`);
      const claimState = await safeLstat(claimPath);
      if (!claimState) return false;
      let claim;
      try {
        claim = await readJson(claimPath, "orphaned activation claim");
      } catch (error) {
        await recordFailure(runDir, request, target, `orphaned activation claim is malformed: ${error instanceof Error ? error.message : String(error)}`);
        return true;
      }
      if (!exactClaim(claim, request, target)) {
        await recordFailure(runDir, request, target, "orphaned activation claim authority is contradictory");
        return true;
      }
      if (claim.process_id === processId && claim.runtime_nonce === runtimeNonce) return true;
      await rm(claimPath, { force: true });
      return false;
    }
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
      if (!helperState) {
        const claimingRuntimeEnded = attempt.runtime_nonce !== runtimeNonce &&
          (attempt.process_id !== processId || startReason === "reload");
        if (claimingRuntimeEnded) {
          await recordFailure(runDir, request, target, "replacement helper record is absent after the claiming runtime ended");
        }
        return true;
      }
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
    const key = `${request.run_id}:${target.token}`;
    if (blockerDeferred.has(key)) return;
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
    // Pi 0.81.1 exposes no atomic editor-check-and-command-submit operation.
    // This final read-only check deliberately preserves the operator-accepted
    // small race in which a human can type before the no-focus Herdr submit.
    const finalBoundary = safeBoundary() ?? editorBoundary();
    if (finalBoundary) {
      const key = `${request.run_id}:${target.token}:final-boundary:${finalBoundary}`;
      if (!warned.has(key)) {
        warned.add(key);
        warning(`qq activation ${request.run_id} is pending: ${finalBoundary}`);
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
    pendingCommands.set(key, { runDir, request, target, attempt });
    queued.add(key);
    const command = `/qq-activate ${request.run_id} ${target.token}`;
    try {
      await submitCommand(target, command);
    } catch (error) {
      queued.delete(key);
      pendingCommands.delete(key);
      await recordFailure(runDir, request, target, `command submission failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function inspectRun(runDir) {
    const state = await safeLstat(runDir);
    if (!state?.isDirectory() || state.isSymbolicLink() || state.uid !== process.getuid?.() || (state.mode & 0o777) !== 0o700) return;
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
        closeWatcher(watcher, "qq activation run watcher");
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
    await Promise.all(entries.map((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) return Promise.resolve();
      const runDir = join(activationRoot, entry.name);
      watchRun(runDir);
      return inspectRun(runDir);
    }));
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
    blockerInvalid = !blockerEventsAvailable;
    blockerLabels = [];
    blockerDeferred.clear();
    activeTools = 0;
    await exactDirectory(runtimeRoot, "dispatch runtime root", true);
    await exactDirectory(activationRoot, "activation lifecycle root", true);
    await writeProbeEvidence(startReason);
    await scan();
    rootWatcher = watch(activationRoot, { persistent: false }, () => void enqueue(scan));
    rootWatcher.on?.("error", (error) => {
      closeWatcher(rootWatcher, "qq activation root watcher");
      rootWatcher = undefined;
      warning(`qq activation root watcher died: ${singleLine(error?.message ?? error)}`);
    });
    // Reconcile after arming to close the scan/watch race without polling.
    await scan();
  }

  function shutdown() {
    active = false;
    blockerInvalid = true;
    closeWatcher(rootWatcher, "qq activation root watcher");
    rootWatcher = undefined;
    for (const watcher of runWatchers.values()) {
      closeWatcher(watcher, "qq activation run watcher");
    }
    runWatchers.clear();
    blockerDeferred.clear();
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
        if (extensionBlocked()) {
          pendingCommands.delete(key);
          blockerDeferred.add(key);
          await Promise.all([
            rm(join(item.runDir, "claims", `${token}.json`), { force: true }),
            rm(join(item.runDir, "attempts", `${token}.json`), { force: true }),
          ]);
          warning(`qq activation ${item.request.run_id} remains pending: ${blocked}`);
          return;
        }
        await recordFailure(item.runDir, item.request, item.target, `internal activation command crossed an unsafe boundary: ${blocked}`);
        return;
      }
      item.attempt.phase = "requested";
      item.attempt.recorded_at = new Date().toISOString();
      await atomicJson(join(item.runDir, "attempts", `${token}.json`), item.attempt, true);
      if (item.request.action === "replace") {
        try {
          await replaceProcess(item.runDir, token, processId, item.request, item.target);
        } catch (error) {
          await recordFailure(item.runDir, item.request, item.target, `replacement helper launch was not accepted: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
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

  pi.events?.on?.("herdr:blocked", updateBlocker);
  pi.on("tool_execution_start", () => { activeTools += 1; });
  pi.on("tool_execution_end", () => { activeTools = Math.max(0, activeTools - 1); });
  pi.on("agent_settled", async () => {
    if (!extensionBlocked()) blockerDeferred.clear();
    await enqueue(scan);
  });
  pi.on("session_start", async (event, nextCtx) => {
    try {
      await start(event, nextCtx);
    } catch (error) {
      warning(`qq activation watcher refused startup: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  pi.on("session_shutdown", shutdown);
}
