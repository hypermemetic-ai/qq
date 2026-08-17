import { spawn } from "node:child_process";

import { bootstrapRun } from "../bin/lib/bootstrap.mjs";
import { startDshRun } from "../bin/lib/dsh-run.mjs";
import { registerNativeLaunchAdapter } from "../bin/lib/native-launch.mjs";
import { createQqSessionContext } from "../bin/lib/session-context.mjs";

export const name = "qq-dsh-native-launch";
export const inject = ["agents", "sessions", "sessionPersistence", "subagents"];

function commandRunner(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", () => resolve({ code: 127, stdout, stderr: "command failed" }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (options.signal) {
      const abort = () => { try { child.kill(); } catch {} };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener("abort", abort, { once: true });
      child.on("close", () => options.signal.removeEventListener("abort", abort));
    }
  });
}

export function apply(ctx, config = {}) {
  const env = config.env ?? process.env;
  const run = config.run ?? commandRunner;
  const parents = new Map();
  const services = {
    agents: ctx.agents,
    sessions: ctx.sessions,
    persistence: ctx.sessionPersistence,
    subagents: ctx.subagents,
  };
  const sessionContext = createQqSessionContext({
    env,
    activeDshSession: () => ctx.agents.currentInitiator()?.session.id,
  });
  const retainParent = (owned) => {
    if (parents.has(owned.runId)) throw new Error("native DSH run ownership collision");
    parents.set(owned.runId, owned);
  };
  const adapter = {
    supports(architectSession) {
      const parent = ctx.agents.currentInitiator();
      const owned = sessionContext.resolveSession(architectSession);
      return parent?.session?.id === architectSession && ctx.agents.get(architectSession) === parent &&
        owned.source === "dsh-session" && owned.role === "architect";
    },
    launch(requestPath, options = {}) {
      return bootstrapRun(run, requestPath, {
        env,
        signal: options.signal,
        notify: async () => {},
        startRun(startOptions) {
          return startDshRun({
            ...startOptions,
            services,
            sessionContext,
            retainParent,
            verificationTimeoutMs: config.verificationTimeoutMs,
            verificationIntervalMs: config.verificationIntervalMs,
          });
        },
      });
    },
  };

  ctx.effect(() => registerNativeLaunchAdapter(adapter), "qq native DSH launch capability");
  ctx.effect(() => async () => {
    const owned = [...parents.values()];
    parents.clear();
    for (const entry of owned) {
      try { await ctx.subagents.drainContinuableDescendants([entry.handle.agent]); } catch {}
      try { await entry.handle.dispose(); } catch {}
    }
  }, "qq native DSH parent ownership");
}

export const internals = Object.freeze({ commandRunner });
