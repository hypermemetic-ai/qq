import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { atomicPrivateJson, readHandoff, workshopRoot } from "./workshop.mjs";

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

export async function listProposals(project, env = process.env) {
  const root = workshopRoot(project, env);
  const found = [];
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "handoff.json");
    try {
      const state = await readHandoff(path);
      if (state.status === "proposal" || state.status === "blocked") found.push(state);
    } catch {}
  }
  return found.sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
}

export async function landHandoff(run, statePath) {
  const state = await readHandoff(statePath);
  if (state.status !== "proposal") throw new Error(`proposal is ${state.status}, not ready to land`);
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
    return state;
  } catch (error) {
    state.status = "blocked";
    state.blockedReason = error instanceof Error ? error.message : String(error);
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    throw error;
  }
}

export function projectFromCwd(cwd, env = process.env) {
  return String(env.QQ_AGENT_PROJECT || basename(resolve(cwd))).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
