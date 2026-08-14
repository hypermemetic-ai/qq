import { randomUUID } from "node:crypto";
import { open, readFile, readdir, stat, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

import { taskSlug, workshopRoot } from "./workshop.mjs";

function reason(result, fallback) {
  return result?.stderr?.trim() || result?.stdout?.trim() || fallback;
}

async function checked(run, command, args, options, label) {
  const result = await run(command, args, options);
  if (result?.code !== 0) throw new Error(`${label}: ${reason(result, "command failed")}`);
  return result;
}

function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("delegate admission was cancelled");
}

async function removeDeadLock(path) {
  let source;
  try { source = await readFile(path, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return true;
    return false;
  }
  const pid = Number.parseInt(source.split(/\s+/, 1)[0], 10);
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error?.code !== "ESRCH") return false;
  }
  try {
    await unlink(path);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

export async function gitCommonDirectory(run, cwd, signal) {
  const execution = await checked(run, "git", ["rev-parse", "--git-common-dir"], { cwd, signal }, "cannot identify the shared git directory");
  const value = execution.stdout.trim();
  if (!value) throw new Error("git returned an empty shared directory");
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

export async function withAdmissionLock(options, action) {
  const { run, cwd, signal } = options;
  if (typeof run !== "function") throw new Error("delegate admission requires a command runner");
  if (typeof action !== "function") throw new Error("delegate admission requires an action");
  const commonDir = options.commonDir ?? await gitCommonDirectory(run, cwd, signal);
  const lockPath = join(commonDir, "qq-admit.lock");
  const token = `${process.pid} ${randomUUID()}\n`;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  const intervalMs = options.intervalMs ?? 50;
  let handle;

  while (!handle) {
    abortIfNeeded(signal);
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (!await removeDeadLock(lockPath)) await sleep(intervalMs);
    }
  }

  try {
    await handle.writeFile(token, "utf8");
    await handle.sync();
    return await action({ commonDir, lockPath });
  } finally {
    await handle.close().catch(() => {});
    try {
      if (await readFile(lockPath, "utf8") === token) await unlink(lockPath);
    } catch {}
  }
}

export function parseWorktreeList(source) {
  const worktrees = [];
  let current;
  for (const line of source.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length), head: "", branch: "" };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  if (current) worktrees.push(current);
  if (worktrees.length === 0 || worktrees.some(({ path }) => !isAbsolute(path))) {
    throw new Error("git returned a malformed worktree list");
  }
  return worktrees;
}

function paths(source) {
  return source.split("\n").map((value) => value.trim()).filter(Boolean);
}

export async function collectLiveWorktreeDiffs(options) {
  const { run, cwd, signal } = options;
  const listed = await checked(run, "git", ["worktree", "list", "--porcelain"], { cwd, signal }, "cannot inspect live worktrees");
  const worktrees = parseWorktreeList(listed.stdout);
  const mainRoot = worktrees[0].path;
  const base = await checked(run, "git", ["rev-parse", "HEAD"], { cwd: mainRoot, signal }, "cannot identify the main worktree ref");
  const baseRef = base.stdout.trim();
  if (!baseRef) throw new Error("git returned an empty main worktree ref");

  const evidence = [];
  for (const worktree of worktrees) {
    try {
      const fork = await checked(run, "git", ["merge-base", baseRef, "HEAD"], { cwd: worktree.path, signal }, `cannot identify the live diff base at ${worktree.path}`);
      const forkRef = fork.stdout.trim();
      if (!forkRef) throw new Error(`git returned an empty live diff base at ${worktree.path}`);
      const changed = await checked(run, "git", ["diff", "--name-only", forkRef, "--"], { cwd: worktree.path, signal }, `cannot inspect live diff at ${worktree.path}`);
      const untracked = await checked(run, "git", ["ls-files", "--others", "--exclude-standard"], { cwd: worktree.path, signal }, `cannot inspect untracked files at ${worktree.path}`);
      evidence.push({
        path: worktree.path,
        name: basename(worktree.path),
        branch: worktree.branch,
        files: [...new Set([...paths(changed.stdout), ...paths(untracked.stdout)])].sort(),
      });
    } catch (error) {
      const refreshed = await checked(run, "git", ["worktree", "list", "--porcelain"], { cwd, signal }, "cannot refresh live worktrees");
      if (parseWorktreeList(refreshed.stdout).some(({ path }) => path === worktree.path)) throw error;
    }
  }
  return evidence;
}

async function briefCandidate(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return undefined;
    return { path, modified: info.mtimeMs };
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function findExistingBrief(options) {
  const { taskId, project, env = process.env } = options;
  const root = workshopRoot(project, env);
  const prefix = `${taskSlug(taskId)}-`;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    for (const filename of ["note.md", "brief.md"]) {
      const candidate = await briefCandidate(join(root, entry.name, filename));
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((left, right) => right.modified - left.modified);
  if (!candidates[0]) return undefined;
  const source = (await readFile(candidates[0].path, "utf8")).trim();
  return source || undefined;
}
