// @ts-nocheck
// Thin Pi host shim. qq-models owns Grok auto-continue on DSH.
// Pi has no surface replace; this only classifies, waits, and sendUserMessage.

import {
  RECOVERY,
  RETRY_LIMIT,
  WINDOW_MS,
  BACKOFF_MS,
  JITTER,
  RETRYABLE,
  FATAL_STATUS,
  FATAL_CODES,
  TARGET_MODEL,
  backoffMs,
  createGrokAutoContinue,
  errorStatus,
  isGrok46,
  isRetryableGrokError,
} from "../qq-models/src/grok-auto-continue.mjs";

export {
  RECOVERY,
  RETRY_LIMIT,
  WINDOW_MS,
  BACKOFF_MS,
  JITTER,
  RETRYABLE,
  FATAL_STATUS,
  FATAL_CODES,
  TARGET_MODEL,
  backoffMs,
  errorStatus,
  isGrok46,
  isRetryableGrokError,
};

export default function registerGrokAutoContinue(pi, deps = {}) {
  const send = deps.sendUserMessage ?? ((content) => pi.sendUserMessage(content));
  let lastCtx;
  const controller = createGrokAutoContinue({
    limit: deps.limit,
    now: deps.now,
    delay: deps.delay,
    random: deps.random,
    jitter: deps.jitter,
    notify: deps.notify ?? ((text) => lastCtx?.ui?.notify?.(text, "warning")),
    isGrok: (ctx) => isGrok46(ctx ?? lastCtx),
    followup: () => send(RECOVERY),
  });

  pi.on("session_start", () => controller.reset());
  pi.on("session_tree", () => {
    if (!controller.pending) controller.reset();
  });
  pi.on("turn_start", () => controller.onTurnStart());
  pi.on("message_end", (event, ctx) => {
    lastCtx = ctx;
    void controller.onTurnEnd(event, ctx);
  });
}
