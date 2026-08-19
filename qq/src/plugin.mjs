import { createQqService } from "./session.mjs";

export const name = "qq";
export const inject = ["agents", "sessions", "sessionPersistence"];
export const provide = "qq";

/** Provide the presentation-neutral DSH session service and its alias book. */
export function apply(ctx, config) {
  const service = createQqService(ctx, config ?? {});
  ctx.provide("qq", service);
  ctx.provide("qq-aliases", Object.freeze({
    alias: service.alias,
    resolve: service.resolve,
  }));
}
