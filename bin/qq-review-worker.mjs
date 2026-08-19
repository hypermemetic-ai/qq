#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicPrivateJson, readHandoff } from "./lib/run.mjs";
import { conductReview, isQaPassedProposal, setBoardStatus } from "./lib/review.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = process.argv[2];

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

function commandReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

export async function landPassedProposal(runCommand, state) {
  const common = await runCommand("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: state.mainRoot });
  if (common?.code !== 0) throw new Error(commandReason(common, "cannot find the main git directory"));
  const lockPath = join(common.stdout.trim(), "qq-land.lock");
  const execution = await runCommand("flock", [lockPath, process.execPath, join(QQ_ROOT, "bin", "qq-land-worker.mjs"), state.statePath], { cwd: state.mainRoot });
  if (execution?.code !== 0) throw new Error(commandReason(execution, "land failed"));
  const landed = await readHandoff(state.statePath);
  if (landed.status !== "landed") throw new Error("land worker completed without recording a landed handoff");
  return landed;
}

export async function finishReview(runCommand, handoffPath, options = {}) {
  const state = await conductReview(runCommand, handoffPath, options);
  if (!isQaPassedProposal(state)) return state;
  return landPassedProposal(runCommand, state);
}

async function blockInfrastructureFailure(error) {
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
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsScript) {
  if (!statePath) throw new Error("usage: qq-review-worker.mjs <handoff.json>");
  finishReview(run, statePath).catch(async (error) => {
    try {
      const state = await readHandoff(statePath);
      if (isQaPassedProposal(state) || state.status === "blocked") {
        process.exitCode = 1;
        return;
      }
    } catch {}
    await blockInfrastructureFailure(error);
  });
}
