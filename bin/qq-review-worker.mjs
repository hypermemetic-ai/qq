#!/usr/bin/env node
import { spawn } from "node:child_process";

import { atomicPrivateJson, readHandoff } from "./lib/run.mjs";
import { conductReview, isQaPassedProposal, setBoardStatus } from "./lib/review.mjs";

const statePath = process.argv[2];
if (!statePath) throw new Error("usage: qq-review-worker.mjs <handoff.json>");

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

conductReview(run, statePath).catch(async (error) => {
  try {
    const state = await readHandoff(statePath);
    state.status = "blocked";
    state.blockedReason = `qa infrastructure failed: ${error instanceof Error ? error.message : String(error)}`;
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    if (!isQaPassedProposal(state)) await setBoardStatus(run, state.mainRoot, state.task.id, "To Do");
    await run("herdr", ["notification", "show", "qa failed", "--body", `${state.task.id}: ${state.blockedReason}`.slice(0, 500), "--sound", "request"]);
  } catch {}
  process.exitCode = 1;
});
