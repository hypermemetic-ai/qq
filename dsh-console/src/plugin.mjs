import { createConsoleHandler } from "./http-app.mjs";
import { createDshSessionBackend } from "./session-backend.mjs";

export const name = "qq-dsh-console";
export const inject = [
  "agentDefaultModel",
  "agents",
  "sessions",
  "sessionPersistence",
  "webServer",
];

/** Mount the qq-owned HTML surface over DSH's canonical session catalog. */
export function apply(ctx, config) {
  if (ctx.webServer.host !== "127.0.0.1") {
    throw new Error("qq-dsh-console: refusing a non-loopback web server");
  }
  const basePath = String(config?.basePath ?? "/qq");
  const backend = createDshSessionBackend(ctx, config ?? {});
  const handler = createConsoleHandler(backend, { basePath });
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: basePath,
        handler,
      }),
    "qq-dsh-console: HTML routes",
  );
  ctx.logger.info(
    `qq DSH console: http://${ctx.webServer.host}:${ctx.webServer.port}${basePath}`,
  );
}
