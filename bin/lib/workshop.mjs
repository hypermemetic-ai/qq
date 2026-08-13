import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const TASK_ID = /^[A-Za-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?$/;
const SAFE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function parseHerdr(stdout) {
  if (typeof stdout !== "string") return undefined;
  try { return JSON.parse(stdout)?.result; } catch { return undefined; }
}

export function taskSlug(value) {
  if (typeof value !== "string" || !TASK_ID.test(value)) throw new Error("task id must look like T-1");
  const slug = value.toLowerCase().replaceAll(".", "-");
  if (!SAFE.test(slug)) throw new Error("task id cannot form a safe slug");
  return slug;
}

export function stateHome(env = process.env) {
  return resolve(env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state"));
}

export function workshopRoot(project, env = process.env) {
  if (!SAFE.test(project)) throw new Error("project is malformed");
  return join(stateHome(env), "qq", "workshops", project);
}

export function worktreeRoot(project, env = process.env) {
  if (!SAFE.test(project)) throw new Error("project is malformed");
  return resolve(env.QQ_WORKTREE_ROOT || join(env.HOME || homedir(), ".herdr", "worktrees", project));
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error(`private directory is unsafe: ${path}`);
  }
}

export async function atomicPrivateJson(path, value) {
  await privateDirectory(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

function reason(result, fallback) {
  return result?.stderr?.trim() || result?.stdout?.trim() || fallback;
}

async function checked(run, command, args, options, label) {
  const result = await run(command, args, options);
  if (result?.code !== 0) throw new Error(`${label}: ${reason(result, "command failed")}`);
  return result;
}

function paneFromTabCreate(result) {
  const parsed = parseHerdr(result?.stdout);
  return parsed?.root_pane?.pane_id;
}

function paneFromSplit(result) {
  const parsed = parseHerdr(result?.stdout);
  return parsed?.pane?.pane_id || parsed?.pane_id;
}

export async function spawnWorkshop(options) {
  const { run, cwd, env = process.env, task, brief, architectSession, qaBinding } = options;
  if (typeof run !== "function") throw new Error("spawnWorkshop requires a command runner");
  const project = String(options.project || basename(resolve(cwd))).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SAFE.test(project)) throw new Error("project cannot form a safe slug");
  const slug = taskSlug(task.id);
  const nonce = randomUUID().slice(0, 8);
  const branch = `qq/${slug}-${nonce}`;
  const worktree = join(worktreeRoot(project, env), `${slug}-${nonce}`);
  const stateDir = join(workshopRoot(project, env), `${slug}-${nonce}`);
  const statePath = join(stateDir, "handoff.json");
  const briefPath = join(stateDir, "brief.md");
  const workspace = env.HERDR_WORKSPACE_ID;
  if (typeof workspace !== "string" || workspace === "") throw new Error("delegate requires a Herdr workspace");

  let mainRoot;
  let baseRef;
  let baseBranch;
  let paneId;
  let createdWorktree = false;
  let createdPane = false;
  try {
    mainRoot = (await checked(run, "git", ["rev-parse", "--show-toplevel"], { cwd }, "cannot identify repository")).stdout.trim();
    baseRef = (await checked(run, "git", ["rev-parse", "HEAD"], { cwd: mainRoot }, "cannot identify base ref")).stdout.trim();
    baseBranch = (await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: mainRoot }, "delegate requires a named base branch")).stdout.trim();
    await privateDirectory(worktreeRoot(project, env));
    await privateDirectory(stateDir);
    await checked(run, "git", ["worktree", "add", "-b", branch, worktree, baseRef], { cwd: mainRoot }, "cannot create worktree");
    createdWorktree = true;
    await writeFile(briefPath, `${brief.trim()}\n`, { mode: 0o600 });

    const tabsResult = await checked(run, "herdr", ["tab", "list", "--workspace", workspace], {}, "cannot list Herdr tabs");
    const tabs = parseHerdr(tabsResult.stdout)?.tabs ?? [];
    const workshop = tabs.find((tab) => tab?.label === "workshop");
    const paneEnv = [
      `QQ_AGENT_ROLE=runner`, `QQ_AGENT_PROJECT=${project}`, `QQ_WORKSHOP_STATE=${statePath}`,
      `QQ_WORKSHOP_ID=${slug}-${nonce}`, `QQ_ARCHITECT_SESSION=${architectSession}`,
    ];
    if (!workshop) {
      const args = ["tab", "create", "--workspace", workspace, "--label", "workshop", "--cwd", worktree, "--no-focus"];
      for (const entry of paneEnv) args.push("--env", entry);
      const created = await checked(run, "herdr", args, {}, "cannot create workshop tab");
      paneId = paneFromTabCreate(created);
    } else {
      const panesResult = await checked(run, "herdr", ["pane", "list", "--workspace", workspace], {}, "cannot list workshop panes");
      const parent = (parseHerdr(panesResult.stdout)?.panes ?? []).find((pane) => pane?.tab_id === workshop.tab_id)?.pane_id;
      if (!parent) throw new Error("workshop tab has no pane to split");
      const args = ["pane", "split", parent, "--direction", "down", "--cwd", worktree, "--no-focus"];
      for (const entry of paneEnv) args.push("--env", entry);
      const split = await checked(run, "herdr", args, {}, "cannot add workshop pane");
      paneId = paneFromSplit(split);
    }
    if (typeof paneId !== "string" || paneId === "") throw new Error("Herdr returned no workshop pane id");
    createdPane = true;
    await checked(run, "herdr", ["pane", "rename", paneId, `${task.id}: ${task.title}`.slice(0, 80)], {}, "cannot label workshop pane");

    const state = {
      schema: "qq.workshop-handoff/v1", version: 1, id: `${slug}-${nonce}`, project,
      task: { id: task.id, title: task.title }, status: "starting", look: 0,
      mainRoot, baseBranch, baseRef, branch, worktree, pane: paneId, architectSession,
      briefPath, statePath, qa: qaBinding, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await atomicPrivateJson(statePath, state);
    await checked(run, "herdr", ["agent", "start", `runner-${slug}-${nonce}`, "--kind", "pi", "--pane", paneId], {}, "cannot start workshop runner");
    const prompt = `Work from the outbound brief at ${briefPath}. Implement the task in this worktree, commit the result, then call done with ref HEAD. Do not merge.\n\n${brief}`;
    await checked(run, "herdr", ["agent", "prompt", paneId, prompt], {}, "cannot brief workshop runner");
    state.status = "running";
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    return state;
  } catch (error) {
    if (createdPane && paneId) await run("herdr", ["pane", "close", paneId], {}).catch(() => {});
    if (createdWorktree && mainRoot) {
      await run("git", ["worktree", "remove", "--force", worktree], { cwd: mainRoot }).catch(() => {});
      await run("git", ["branch", "-D", branch], { cwd: mainRoot }).catch(() => {});
    }
    await rm(stateDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function readHandoff(path) {
  const source = await readFile(path, "utf8");
  const value = JSON.parse(source);
  if (!value || value.schema !== "qq.workshop-handoff/v1" || value.version !== 1) throw new Error("workshop handoff is malformed");
  return value;
}
