import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicPrivateJson, parseHerdr, readHandoff, runsRoot, stateHome, waitForAvailableShell } from "./run.mjs";

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
  const root = runsRoot(project, env);
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

function hasPassedQa(state) {
  return state.qaVerdict?.schema === "qq.qa-verdict/v1" && state.qaVerdict.verdict === "pass";
}

export function isFailedLand(state) {
  return state.status === "blocked" && typeof state.blockedReason === "string" && state.blockedReason.length > 0 && hasPassedQa(state);
}

export function isQaPassedProposal(state) {
  return (state.status === "proposal" || state.status === "commented" || isFailedLand(state)) && hasPassedQa(state);
}

export async function landHandoff(run, statePath) {
  const state = await readHandoff(statePath);
  if (!isQaPassedProposal(state)) throw new Error(`handoff is ${state.status}, not a qa-passed proposal ready to land`);
  try {
    const branch = await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: state.mainRoot }, "main checkout is detached");
    if (branch.stdout.trim() !== state.baseBranch) throw new Error(`main checkout is on ${branch.stdout.trim()}, not ${state.baseBranch}`);
    const mainStatus = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.mainRoot }, "cannot inspect main checkout");
    const dirtyMainStatus = String(mainStatus.stdout ?? "").trimEnd();
    if (dirtyMainStatus.trim()) throw new Error(`main checkout clean-checkout invariant violation; dirty paths:\n${dirtyMainStatus}`);
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
    "--system-prompt", options.servicePromptPath, "--no-extensions", "--extension", join(QQ_ROOT, "extensions", "qa-result.ts"),
    "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", "read,bash,edit,write,qa_verdict",
    "--session-dir", options.sessionDir,
  ];
  if (state.look === 1) args.push("--session-id", options.qaSessionId);
  else args.push("--session", options.qaSessionId);
  return args;
}

export function qaLookPrompt(state) {
  const ticketAndNotePath = state.gatePath ?? state.briefPath;
  return state.look === 1
    ? `Look 1. Review ref ${state.ref} against the outbound ticket and note at ${ticketAndNotePath}. Base is ${state.baseRef}. You own test quality: you may edit tests and commit test-only changes. Never edit or commit production code. Reject bad or excess tests, bloat, and over-engineering.`
    : `Look 2, the final look. Review updated ref ${state.ref} against the same outbound ticket and note at ${ticketAndNotePath} and your prior rejection. You still own test quality: you may edit tests and commit test-only changes, but never edit or commit production code. There is no third look.`;
}

export function isTestPath(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.at(-1) ?? "";
  if (parts.some((part) => ["test", "tests", "spec", "specs", "__tests__", "fixtures", "__fixtures__", "snapshots", "__snapshots__"].includes(part.toLowerCase()))) return true;
  return /(?:^test[_-].+|.+[._-](?:test|spec|snap))\.[^.]+$/i.test(name);
}

function appendVerdictFailure(verdict, feedback) {
  verdict.verdict = "fail";
  verdict.feedback = `${verdict.feedback ? `${verdict.feedback}\n` : ""}${feedback}`;
}

function parseChangedPaths(source) {
  const text = String(source ?? "");
  return text.split(text.includes("\0") ? "\0" : "\n").filter(Boolean);
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

function herdrErrorCode(result) {
  for (const output of [result?.stderr, result?.stdout]) {
    if (typeof output !== "string" || !output.trim()) continue;
    try {
      const response = JSON.parse(output);
      if (typeof response?.error?.code === "string") return response.error.code;
    } catch {}
  }
  return undefined;
}

export async function waitForShell(run, pane, timeoutMs) {
  await waitForAvailableShell(run, pane, timeoutMs == null ? {} : { timeoutMs });
}

async function waitForAgentIdentityDrop(run, pane, timeoutMs) {
  const deadline = Date.now() + (timeoutMs ?? 5_000);
  let last;
  let sentEot = false;
  while (Date.now() < deadline) {
    last = await run("herdr", ["agent", "get", pane], {});
    if (last?.code !== 0) {
      if (herdrErrorCode(last) === "agent_not_found") return last;
    } else {
      const info = parseHerdr(last.stdout, "agent_info");
      if (!sentEot && info?.agent) {
        await run("herdr", ["agent", "send-keys", pane, "ctrl+d"], {});
        sentEot = true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`runs pane ${pane} kept its Herdr agent identity: ${reason(last, "agent still registered")}`);
}

export async function takePane(run, pane, name, args, timeoutMs = 30_000) {
  await waitForShell(run, pane);
  const start = ["agent", "start", name, "--kind", "pi", "--pane", pane, "--timeout", String(timeoutMs)];
  if (args.length) start.push("--", ...args);
  await herdr(run, start, `cannot start ${name} in runs pane`);
}

export async function stopAgent(run, pane, timeoutMs) {
  await waitForAgentIdentityDrop(run, pane, timeoutMs);
  await waitForShell(run, pane, timeoutMs);
}

export async function conductReview(run, statePath, options = {}) {
  const env = options.env ?? process.env;
  const state = await readHandoff(statePath);
  if (state.status !== "reviewing" || (state.look !== 1 && state.look !== 2)) throw new Error("handoff is not ready for qa");
  if (!state.pane) throw new Error("handoff has no runs pane");

  const verdictPath = join(dirname(statePath), `qa-look-${state.look}.json`);
  await rm(verdictPath, { force: true });
  const sessionDir = join(dirname(statePath), "qa-session");
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const qaSessionId = state.qaSessionId || randomUUID();
  state.qaSessionId = qaSessionId;
  await atomicPrivateJson(statePath, state);

  const servicePrompt = (await readFile(join(QQ_ROOT, "prompts", "services", "qa.md"), "utf8")).trim() +
    "\n\nInspect the worktree and run the narrow checks that prove the brief. On both looks, you own the tests and may commit test-only changes. Never edit or commit production code. End by calling qa_verdict exactly once. A pass requires a clean worktree; any test changes must already be committed.";
  const servicePromptPath = join(dirname(statePath), `qa-system-prompt-${state.look}.md`);
  await rm(servicePromptPath, { force: true });
  await writeFile(servicePromptPath, servicePrompt, { mode: 0o600, flag: "wx" });
  const launchArgs = qaLaunchArgs(state, { servicePromptPath, sessionDir, qaSessionId });
  try {
    await stopAgent(run, state.pane);
    await takePane(run, state.pane, qaAgentName(state), launchArgs);
    await herdr(run, ["agent", "prompt", state.pane, qaLookPrompt(state), "--wait", "--until", "idle", "--until", "done", "--until", "blocked"], "qa did not settle");
    await stopAgent(run, state.pane);
  } finally {
    await rm(servicePromptPath, { force: true });
  }

  let verdict;
  try { verdict = JSON.parse(await readFile(verdictPath, "utf8")); }
  catch { throw new Error("qa ended without a structured verdict"); }
  if (verdict.schema !== "qq.qa-verdict/v1" || !["pass", "fail"].includes(verdict.verdict)) throw new Error("qa verdict is malformed");

  const dirty = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree }, "cannot inspect qa worktree");
  const headRevision = await checked(run, "git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: state.worktree }, "cannot inspect qa commit");
  const qaHead = headRevision.stdout.trim();
  let testOnlyCommit = false;

  if (dirty.stdout.trim() && verdict.verdict === "pass") appendVerdictFailure(verdict, "qa left uncommitted worktree changes.");

  if (!dirty.stdout.trim() && qaHead !== state.ref) {
    const descendant = await run("git", ["merge-base", "--is-ancestor", state.ref, qaHead], { cwd: state.worktree });
    if (descendant?.code !== 0) {
      appendVerdictFailure(verdict, "qa replaced or rewrote the reviewed commit instead of adding test-only changes.");
    } else {
      const changed = await checked(run, "git", ["diff", "--name-only", "--no-renames", "-z", `${state.ref}..${qaHead}`], { cwd: state.worktree }, "cannot inspect qa commits");
      const paths = parseChangedPaths(changed.stdout);
      const productionPaths = paths.filter((path) => !isTestPath(path));
      if (!paths.length) appendVerdictFailure(verdict, "qa created a commit without test changes.");
      else if (productionPaths.length) appendVerdictFailure(verdict, `qa committed production-code changes: ${productionPaths.join(", ")}.`);
      else testOnlyCommit = true;
    }
  }

  if (verdict.verdict === "pass" && testOnlyCommit) state.ref = qaHead;
  verdict.summary = String(verdict.summary).replace(/\s+/g, " ").trim().slice(0, 240);
  state.qaVerdict = verdict;
  state.updatedAt = new Date().toISOString();

  const closePane = async () => {
    await herdr(run, ["pane", "close", state.pane], "cannot close runs pane");
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
    await herdr(run, ["agent", "prompt", state.pane, look1FixPrompt(state, verdict)], "cannot return runs pane to the runner");
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
