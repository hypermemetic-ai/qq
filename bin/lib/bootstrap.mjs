import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { RUN_BOOTSTRAP_FAILED_KIND, sendRunEvent } from "./run-events.mjs";
import { atomicPrivateJson, readBootstrapRequest, sanitizeBootstrapReason, startRun, stateHome } from "./run.mjs";
import { setBoardStatus } from "./review.mjs";

const FAILURE_OUTBOX_SCHEMA = "qq.bootstrap-failure-outbox/v1";

async function retry(action, sleep) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await action(); } catch (error) { failure = error; }
    if (attempt === 0) await sleep(50);
  }
  throw failure;
}

export function bootstrapFailureOutboxRoot(env = process.env) {
  return join(stateHome(env), "qq", "bootstrap-failures");
}

function bootstrapFailureOutboxPath(outcome, env) {
  const key = createHash("sha256").update(`${outcome.architectSession}\0${outcome.id}`).digest("hex");
  return join(bootstrapFailureOutboxRoot(env), `${key}.json`);
}

export async function persistBootstrapFailure(outcome, options = {}) {
  const path = bootstrapFailureOutboxPath(outcome, options.env ?? process.env);
  await atomicPrivateJson(path, {
    schema: FAILURE_OUTBOX_SCHEMA,
    version: 1,
    outcome,
  });
  return path;
}

async function readBootstrapFailure(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error("bootstrap failure outbox entry is unsafe");
  }
  const value = JSON.parse(await readFile(path, "utf8"));
  const outcome = value?.outcome;
  if (value?.schema !== FAILURE_OUTBOX_SCHEMA || value.version !== 1 ||
      typeof outcome?.id !== "string" || typeof outcome.architectSession !== "string" ||
      typeof outcome.task?.id !== "string" || typeof outcome.task?.title !== "string" ||
      typeof outcome.bootstrapFailedAt !== "string" || typeof outcome.bootstrapFailureReason !== "string" ||
      typeof outcome.bootstrapTaskReturned !== "boolean") {
    throw new Error("bootstrap failure outbox entry is malformed");
  }
  return outcome;
}

export async function retryBootstrapFailureOutbox(architectSession, options = {}) {
  const env = options.env ?? process.env;
  const root = bootstrapFailureOutboxRoot(env);
  let names;
  try { names = await readdir(root); } catch (error) {
    if (error?.code === "ENOENT") return { attempted: 0, delivered: 0 };
    throw error;
  }
  const send = options.sendRunEvent ?? sendRunEvent;
  let attempted = 0;
  let delivered = 0;
  for (const name of names.sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const path = join(root, name);
    let outcome;
    try { outcome = await readBootstrapFailure(path); } catch { continue; }
    if (outcome.architectSession !== architectSession) continue;
    attempted += 1;
    try {
      await send(outcome, RUN_BOOTSTRAP_FAILED_KIND, { env, client: options.client });
      await unlink(path);
      delivered += 1;
    } catch {}
  }
  return { attempted, delivered };
}

export async function bootstrapRun(run, requestPath, options = {}) {
  let request;
  const sleep = options.sleep ?? ((ms) => new Promise((accept) => setTimeout(accept, ms)));
  try {
    request = options.request ?? await readBootstrapRequest(requestPath);
    await options.onRequest?.(request);
    const state = await (options.startRun ?? startRun)({
      run, cwd: request.cwd, env: options.env ?? process.env,
      task: request.task, prepared: request.prepared, qaBinding: request.qaBinding,
      project: request.project, architectSession: request.architectSession, marker: request.marker,
      preserveStateOnFailure: true,
    });
    await unlink(requestPath).catch(() => {});
    return state;
  } catch (error) {
    const env = options.env ?? process.env;
    if (!request) {
      await options.onRequestFailure?.();
      throw new Error(sanitizeBootstrapReason(error, { env, secrets: [requestPath] }));
    }
    const privateSources = await Promise.all([
      request.prepared.ticketPath, request.prepared.notePath, request.prepared.gatePath,
    ].map((path) => readFile(path, "utf8").catch(() => "")));
    let reason = sanitizeBootstrapReason(error, {
      env,
      secrets: [
        ...privateSources.flatMap((source) => [source, source.trim()]),
        request.prepared.ticketPath, request.prepared.notePath, request.prepared.gatePath,
        request.prepared.transcriptPath, request.prepared.statePath, requestPath,
      ],
    });
    let taskReturned = false;
    try {
      await retry(() => (options.setBoardStatus ?? setBoardStatus)(run, request.cwd, request.task.id, "To Do"), sleep);
      taskReturned = true;
    } catch {
      reason = `${reason}; task rollback failed`;
    }

    const outcome = {
      id: request.id,
      architectSession: request.architectSession,
      task: request.task,
      bootstrapFailedAt: (options.now?.() ?? new Date()).toISOString(),
      bootstrapFailureReason: reason,
      bootstrapTaskReturned: taskReturned,
    };
    let outboxPath;
    try {
      outboxPath = await (options.persistBootstrapFailure ?? persistBootstrapFailure)(outcome, { env });
    } catch {
      reason = `${reason}; failure notification persistence failed`;
      outcome.bootstrapFailureReason = reason;
    } finally {
      await rm(request.prepared.stateDir, { recursive: true, force: true }).catch(() => {});
    }

    const send = options.sendRunEvent ?? sendRunEvent;
    const notify = options.notify ?? (async (taskId, failureReason) => run("herdr", [
      "notification", "show", "runner start failed", "--body",
      `${taskId}: ${failureReason}`.slice(0, 500), "--sound", "request",
    ], {}));
    await Promise.allSettled([
      retry(async () => {
        await send(outcome, RUN_BOOTSTRAP_FAILED_KIND, { env });
        if (outboxPath) await unlink(outboxPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
      }, sleep),
      notify(request.task.id, reason),
    ]);
    throw new Error(reason);
  }
}
