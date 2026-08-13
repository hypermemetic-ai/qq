import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicPrivateJson, parseHerdr, readHandoff, stateHome, workshopRoot } from "./workshop.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKLOG = join(QQ_ROOT, "node_modules", ".bin", "backlog");

function reason(result, fallback) {
  return result?.stderr?.trim() || result?.stdout?.trim() || fallback;
}

async function checked(run, command, args, options, label) {
  const result = await run(command, args, options);
  if (result?.code !== 0) throw new Error(`${label}: ${reason(result, "command failed")}`);
  return result;
}

export function parseNumstat(source) {
  const files = [];
  for (const line of String(source ?? "").split("\n")) {
    if (!line) continue;
    const [added, deleted, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (!path) continue;
    files.push({ path, added: added === "-" ? null : Number(added), deleted: deleted === "-" ? null : Number(deleted) });
  }
  return files;
}

export function formatPack(pack) {
  return [pack.summary, ...(pack.files ?? []).map((file) => `${file.path} +${file.added ?? "?"}/-${file.deleted ?? "?"}`)].join("\n");
}

export async function prepareDone(run, cwd, statePath, ref) {
  const state = await readHandoff(statePath);
  const actual = await realpath(cwd);
  const expected = await realpath(state.worktree);
  if (actual !== expected) throw new Error("done must run from its delegated worktree");
  if (state.status !== "running" && state.status !== "waiting_fix") throw new Error(`handoff is ${state.status}, not ready for done`);
  if (state.look >= 2) throw new Error("qa already used both looks");
  const revision = await checked(run, "git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd }, "ref is not a commit");
  const sha = revision.stdout.trim();
  await checked(run, "git", ["merge-base", "--is-ancestor", state.baseRef, sha], { cwd }, "ref does not descend from the delegated base");
  const status = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd }, "cannot inspect worktree");
  if (status.stdout.trim()) throw new Error("worktree is not clean; commit or remove every change before done");
  state.look += 1;
  state.ref = sha;
  state.status = "reviewing";
  state.updatedAt = new Date().toISOString();
  await atomicPrivateJson(statePath, state);
  return state;
}

export async function packFor(run, state) {
  const diff = await checked(run, "git", ["diff", "--numstat", `${state.baseRef}...${state.ref}`], { cwd: state.worktree }, "cannot build operator pack");
  return parseNumstat(diff.stdout);
}

export async function setBoardStatus(run, cwd, taskId, status) {
  await checked(run, BACKLOG, ["task", "edit", taskId, "--status", status, "--plain"], { cwd }, `cannot set ${taskId} to ${status}`);
}

async function listHandoffs(project, env, statuses) {
  const root = workshopRoot(project, env);
  const found = [];
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "handoff.json");
    try {
      const state = await readHandoff(path);
      if (statuses.includes(state.status)) found.push(state);
    } catch {}
  }
  return found.sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
}

export async function listProposals(project, env = process.env) {
  return listHandoffs(project, env, ["proposal", "blocked"]);
}

export async function listReviews(project, env = process.env) {
  return listHandoffs(project, env, ["proposal", "blocked", "commented"]);
}

export async function landHandoff(run, statePath) {
  const state = await readHandoff(statePath);
  if (state.status !== "proposal" && state.status !== "commented") throw new Error(`handoff is ${state.status}, not ready to land`);
  try {
    const branch = await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: state.mainRoot }, "main checkout is detached");
    if (branch.stdout.trim() !== state.baseBranch) throw new Error(`main checkout is on ${branch.stdout.trim()}, not ${state.baseBranch}`);
    const worktreeStatus = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree }, "cannot inspect delegated worktree");
    if (worktreeStatus.stdout.trim()) throw new Error("delegated worktree has uncommitted residue");
    await checked(run, "git", ["merge-tree", "--write-tree", "HEAD", state.ref], { cwd: state.mainRoot }, "proposal no longer merges cleanly");
    await checked(run, "git", ["merge", "--no-ff", "--no-edit", state.ref], { cwd: state.mainRoot }, "merge failed");
    await checked(run, "git", ["worktree", "remove", state.worktree], { cwd: state.mainRoot }, "merged but worktree cleanup failed");
    await checked(run, "git", ["branch", "-d", state.branch], { cwd: state.mainRoot }, "merged but branch cleanup failed");
    state.status = "landed";
    state.landedAt = new Date().toISOString();
    state.updatedAt = state.landedAt;
    await atomicPrivateJson(statePath, state);
  } catch (error) {
    state.status = "blocked";
    state.blockedReason = error instanceof Error ? error.message : String(error);
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    throw error;
  }
  await setBoardStatus(run, state.mainRoot, state.task.id, "Done");
  return state;
}

export function projectFromCwd(cwd, env = process.env) {
  return String(env.QQ_AGENT_PROJECT || basename(resolve(cwd))).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function qaAgentName(state) {
  return `qa-${state.id}`.slice(0, 32);
}

export function runnerAgentName(state) {
  return `runner-${state.id}`.slice(0, 32);
}

export function qaLaunchArgs(state, options) {
  const args = [
    "--model", `${state.qa.provider}/${state.qa.model}`, "--thinking", state.qa.effort,
    "--system-prompt", options.servicePrompt, "--no-extensions", "--extension", join(QQ_ROOT, "extensions", "qa-result.ts"),
    "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", "read,bash,edit,write,qa_verdict",
    "--session-dir", options.sessionDir,
  ];
  if (state.look === 1) args.push("--session-id", options.qaSessionId);
  else args.push("--session", options.qaSessionId);
  return args;
}

export function qaLookPrompt(state) {
  return state.look === 1
    ? `Look 1. Review ref ${state.ref} against the outbound brief at ${state.briefPath}. Base is ${state.baseRef}. Reject bad or excess tests, bloat, and over-engineering.`
    : `Look 2, the final look. Review updated ref ${state.ref} against the same outbound brief at ${state.briefPath} and your prior rejection. There is no third look. Do not edit files on look 2.`;
}

export function look1FixPrompt(state, verdict) {
  return `qa look 1 rejected ${state.task.id}. ${verdict.feedback || verdict.summary}${verdict.tests_modified ? " qa rewrote tests; inspect those changes." : ""} Fix once, commit the result, then call done again with ref HEAD.`;
}

async function findPaneForSession(sessionId, env) {
  const directory = join(stateHome(env), "qq", "event-plane", "presence");
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

async function herdr(run, args, label) {
  return checked(run, "herdr", args, {}, label);
}

export async function waitForShell(run, pane, timeoutMs = 15_000) {
  await herdr(run, ["pane", "wait-output", pane, "--source", "recent-unwrapped", "--timeout", String(timeoutMs), "--regex", String.raw`[$#]\s*$`], "workshop pane did not return to a shell");
}

export async function takePane(run, pane, name, args, timeoutMs = 30_000) {
  await waitForShell(run, pane);
  const start = ["agent", "start", name, "--kind", "pi", "--pane", pane, "--timeout", String(timeoutMs)];
  if (args.length) start.push("--", ...args);
  await herdr(run, start, `cannot start ${name} in workshop pane`);
}

export async function stopAgent(run, pane, timeoutMs = 15_000) {
  const listed = await run("herdr", ["agent", "get", pane], {});
  const status = parseHerdr(listed?.stdout)?.agent_status;
  if (listed?.code === 0 && status && status !== "done" && status !== "unknown") {
    await run("herdr", ["agent", "send-keys", pane, "ctrl+d"], {});
  }
  await waitForShell(run, pane, timeoutMs);
}

export async function conductReview(run, statePath, options = {}) {
  const env = options.env ?? process.env;
  const state = await readHandoff(statePath);
  if (state.status !== "reviewing" || (state.look !== 1 && state.look !== 2)) throw new Error("handoff is not ready for qa");
  if (!state.pane) throw new Error("handoff has no workshop pane");

  const verdictPath = join(dirname(statePath), `qa-look-${state.look}.json`);
  await rm(verdictPath, { force: true });
  const sessionDir = join(dirname(statePath), "qa-session");
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const qaSessionId = state.qaSessionId || randomUUID();
  state.qaSessionId = qaSessionId;
  await atomicPrivateJson(statePath, state);

  const servicePrompt = (await readFile(join(QQ_ROOT, "prompts", "services", "qa.md"), "utf8")).trim() +
    "\n\nInspect the worktree and run the narrow checks that prove the brief. You may rewrite tests on look 1, but a test rewrite is a failure and must be disclosed to the runner. Do not commit. End by calling qa_verdict exactly once. A pass requires a clean worktree.";
  const launchArgs = qaLaunchArgs(state, { servicePrompt, sessionDir, qaSessionId });
  await takePane(run, state.pane, qaAgentName(state), launchArgs);
  await herdr(run, ["agent", "prompt", state.pane, qaLookPrompt(state), "--wait", "--until", "idle", "--until", "done", "--until", "blocked"], "qa did not settle");
  await stopAgent(run, state.pane);

  let verdict;
  try { verdict = JSON.parse(await readFile(verdictPath, "utf8")); }
  catch { throw new Error("qa ended without a structured verdict"); }
  if (verdict.schema !== "qq.qa-verdict/v1" || !["pass", "fail"].includes(verdict.verdict)) throw new Error("qa verdict is malformed");

  const dirty = await run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree });
  if (verdict.verdict === "pass" && dirty.stdout.trim()) {
    verdict.verdict = "fail";
    verdict.feedback = `${verdict.feedback ? `${verdict.feedback}\n` : ""}qa left uncommitted worktree changes.`;
  }
  verdict.summary = String(verdict.summary).replace(/\s+/g, " ").trim().slice(0, 240);
  state.qaVerdict = verdict;
  state.updatedAt = new Date().toISOString();

  const closePane = async () => {
    await herdr(run, ["pane", "close", state.pane], "cannot close workshop pane");
  };
  const notify = async (title, body) => {
    await herdr(run, ["notification", "show", title, "--body", body.slice(0, 500), "--sound", "request"], "cannot notify operator");
  };

  if (verdict.verdict === "pass") {
    state.pack = { summary: verdict.summary, files: await packFor(run, state) };
    state.status = "proposal";
    await atomicPrivateJson(statePath, state);
    await closePane();
    await notify("qa proposal ready", `${state.task.id}: ${verdict.summary}`);
    return state;
  }

  if (state.look === 1) {
    state.status = "waiting_fix";
    await atomicPrivateJson(statePath, state);
    await takePane(run, state.pane, runnerAgentName(state), []);
    await herdr(run, ["agent", "prompt", state.pane, look1FixPrompt(state, verdict)], "cannot return workshop pane to the runner");
    return state;
  }

  state.pack = { summary: verdict.summary, files: await packFor(run, state) };
  state.status = "blocked";
  state.blockedReason = verdict.feedback || verdict.summary;
  await atomicPrivateJson(statePath, state);
  const architectPane = await findPaneForSession(state.architectSession, env);
  if (architectPane) {
    const pack = formatPack(state.pack);
    await herdr(run, ["agent", "prompt", architectPane, `qa rejected ${state.task.id} on look 2. ${state.blockedReason}\n\n${pack}`], "cannot notify architect of look 2 rejection");
  }
  await closePane();
  await notify("qa blocked after look 2", `${state.task.id}: ${verdict.summary}`);
  return state;
}
