#!/usr/bin/env node
import { spawn } from "node:child_process";

import { bootstrapRun } from "./lib/bootstrap.mjs";

const requestPath = process.argv[2];
if (!requestPath) throw new Error("usage: qq-start-worker.mjs <bootstrap.json>");

function run(command, args, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => done({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}

function handoff(type) {
  try { process.send?.({ type }); } catch {}
  try { process.disconnect?.(); } catch {}
}

bootstrapRun(run, requestPath, {
  onRequest() { handoff("qq-bootstrap-accepted"); },
  onRequestFailure() { handoff("qq-bootstrap-rejected"); },
}).catch(() => { process.exitCode = 1; });
