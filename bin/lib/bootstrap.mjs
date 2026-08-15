import { readFile, rm, unlink } from "node:fs/promises";

import { RUN_BOOTSTRAP_FAILED_KIND, sendRunEvent } from "./run-events.mjs";
import { readBootstrapRequest, sanitizeBootstrapReason, startRun } from "./run.mjs";
import { setBoardStatus } from "./review.mjs";

async function retry(action, sleep) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await action(); } catch (error) { failure = error; }
    if (attempt === 0) await sleep(50);
  }
  throw failure;
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
    await rm(request.prepared.stateDir, { recursive: true, force: true }).catch(() => {});

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
    const send = options.sendRunEvent ?? sendRunEvent;
    const notify = options.notify ?? (async (taskId, failureReason) => run("herdr", [
      "notification", "show", "runner start failed", "--body",
      `${taskId}: ${failureReason}`.slice(0, 500), "--sound", "request",
    ], {}));
    await Promise.allSettled([
      retry(() => send(outcome, RUN_BOOTSTRAP_FAILED_KIND, { env }), sleep),
      notify(request.task.id, reason),
    ]);
    throw new Error(reason);
  }
}
