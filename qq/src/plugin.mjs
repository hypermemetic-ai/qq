import { createQqService } from "./session.mjs";

export const name = "qq";
export const inject = ["agents", "sessions", "sessionPersistence"];
export const provide = "qq";

/** Provide the presentation-neutral DSH session service. */
export function apply(ctx, config) {
  ctx.provide("qq", createQqService(ctx, config ?? {}));
}
