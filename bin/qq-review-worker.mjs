#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicPrivateJson, readHandoff } from "./lib/workshop.mjs";
import { packFor } from "./lib/review.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

async function findPaneForSession(sessionId) {
  const stateHome = process.env.XDG_STATE_HOME || join(process.env.HOME, ".local", "state");
  const directory = join(stateHome, "qq", "event-plane", "presence");
  let entries;
  try { entries = await readdir(directory); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const value = JSON.parse(await readFile(join(directory, entry), "utf8"));
      if (value.session_id === sessionId && typeof value.pane === "string") return value.pane;
    } catch {}
  }
  return undefined;
}

async function notify(title, body, sound = "request") {
  await run("herdr", ["notification", "show", title, "--body", body.slice(0, 500), "--sound", sound]);
}

async function promptPane(pane, text) {
  if (pane) await run("herdr", ["agent", "prompt", pane, text]);
}

async function stopPane(pane) {
  if (pane) await run("herdr", ["pane", "close", pane]);
}

async function main() {
  const state = await readHandoff(statePath);
  if (state.status !== "reviewing" || (state.look !== 1 && state.look !== 2)) throw new Error("handoff is not ready for qa");
  const verdictPath = join(dirname(statePath), `qa-look-${state.look}.json`);
  await rm(verdictPath, { force: true });
  const sessionDir = join(dirname(statePath), "qa-session");
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const qaSessionId = state.qaSessionId || randomUUID();
  state.qaSessionId = qaSessionId;
  await atomicPrivateJson(statePath, state);

  const servicePrompt = (await readFile(join(QQ_ROOT, "prompts", "services", "qa.md"), "utf8")).trim() +
    "\n\nInspect the worktree and run the narrow checks that prove the brief. You may rewrite tests on look 1, but a test rewrite is a failure and must be disclosed to the runner. Do not commit. End by calling qa_verdict exactly once. A pass requires a clean worktree.";
  const prompt = state.look === 1
    ? `Look 1. Review ref ${state.ref} against the outbound brief at ${state.briefPath}. Base is ${state.baseRef}. Reject bad or excess tests, bloat, and over-engineering.`
    : `Look 2, the final look. Review updated ref ${state.ref} against the same outbound brief at ${state.briefPath} and your prior rejection. There is no third look. Do not edit files on look 2.`;
  const args = [
    "--print", "--mode", "text", "--model", `${state.qa.provider}/${state.qa.model}`, "--thinking", state.qa.effort,
    "--system-prompt", servicePrompt, "--no-extensions", "--extension", join(QQ_ROOT, "extensions", "qa-result.ts"),
    "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", "read,bash,edit,write,qa_verdict",
    "--session-dir", sessionDir,
  ];
  if (state.look === 1) args.push("--session-id", qaSessionId);
  else args.push("--session", qaSessionId);
  args.push(prompt);
  const execution = await run(process.env.QQ_PI_BIN || "pi", args, {
    cwd: state.worktree,
    env: { ...process.env, QQ_QA_RESULT: verdictPath, QQ_AGENT_ROLE: "runner", QQ_AGENT_PROJECT: state.project },
  });
  if (execution.code !== 0) throw new Error(execution.stderr.trim() || execution.stdout.trim() || "qa process failed");
  let verdict;
  try { verdict = JSON.parse(await readFile(verdictPath, "utf8")); }
  catch { throw new Error("qa ended without a structured verdict"); }
  if (verdict.schema !== "qq.qa-verdict/v1" || !["pass", "fail"].includes(verdict.verdict)) throw new Error("qa verdict is malformed");

  const status = await run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree });
  if (verdict.verdict === "pass" && status.stdout.trim()) {
    verdict.verdict = "fail";
    verdict.feedback = `${verdict.feedback ? `${verdict.feedback}\n` : ""}qa left uncommitted worktree changes.`;
  }
  verdict.summary = String(verdict.summary).replace(/\s+/g, " ").trim().slice(0, 240);
  state.qaVerdict = verdict;
  state.updatedAt = new Date().toISOString();

  if (verdict.verdict === "pass") {
    state.pack = { summary: verdict.summary, files: await packFor(run, state) };
    state.status = "proposal";
    await atomicPrivateJson(statePath, state);
    await stopPane(state.pane);
    await notify("qa proposal ready", `${state.task.id}: ${verdict.summary}`, "request");
    return;
  }

  if (state.look === 1) {
    state.status = "waiting_fix";
    await atomicPrivateJson(statePath, state);
    await promptPane(state.pane, `qa look 1 rejected ${state.task.id}. ${verdict.feedback || verdict.summary}${verdict.tests_modified ? " qa rewrote tests; inspect those changes." : ""} Fix once, commit the result, then call done again with ref HEAD.`);
    return;
  }

  state.pack = { summary: verdict.summary, files: await packFor(run, state) };
  state.status = "blocked";
  state.blockedReason = verdict.feedback || verdict.summary;
  await atomicPrivateJson(statePath, state);
  const architectPane = await findPaneForSession(state.architectSession);
  const pack = [state.pack.summary, ...state.pack.files.map((file) => `${file.path} +${file.added ?? "?"}/-${file.deleted ?? "?"}`)].join("\n");
  await promptPane(architectPane, `qa rejected ${state.task.id} on look 2. ${state.blockedReason}\n\n${pack}`);
  await stopPane(state.pane);
  await notify("qa blocked after look 2", `${state.task.id}: ${verdict.summary}`, "request");
}

main().catch(async (error) => {
  try {
    const state = await readHandoff(statePath);
    state.status = "blocked";
    state.blockedReason = `qa infrastructure failed: ${error instanceof Error ? error.message : String(error)}`;
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    await notify("qa failed", `${state.task.id}: ${state.blockedReason}`, "request");
  } catch {}
  process.exitCode = 1;
});
