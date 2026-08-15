#!/usr/bin/env node
import { spawn } from "node:child_process";

import { landHandoff } from "./lib/review.mjs";
import { RUN_LANDED_KIND, sendRunEvent } from "./lib/run-events.mjs";

const statePath = process.argv[2];
if (!statePath) throw new Error("usage: qq-land-worker.mjs <handoff.json>");

function run(command, args, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => done({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}

landHandoff(run, statePath).then(async (state) => {
  await sendRunEvent(state, RUN_LANDED_KIND);
  process.stdout.write(`Landed ${state.task.id}.\n`);
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
