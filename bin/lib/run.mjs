import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const TASK_ID = /^[A-Za-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?$/;
const SAFE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const BRIEF_GATE_PLUGIN = "qq.brief-gate";
const BRIEF_GATE_ENTRYPOINT = "review";
const BRIEF_GATE_MARKER = "QQ_BRIEF_GATE_DECIDED";
const PANE_SHELLS = new Set([
  "sh", "bash", "dash", "zsh", "fish", "ksh", "mksh", "csh", "tcsh",
  "elvish", "xonsh", "nu", "pwsh", "powershell", "cmd",
]);

export function parseHerdr(stdout, expectedType) {
  let response;
  try { response = JSON.parse(stdout); } catch { throw new Error("Herdr returned malformed JSON"); }
  if (!response || typeof response !== "object" || Array.isArray(response) ||
      typeof response.id !== "string" || response.id.length === 0 ||
      !response.result || typeof response.result !== "object" || Array.isArray(response.result) ||
      typeof response.result.type !== "string" || response.result.type.length === 0) {
    throw new Error("Herdr returned a malformed response");
  }
  if (expectedType !== undefined && response.result.type !== expectedType) {
    throw new Error(`Herdr returned ${response.result.type}, expected ${expectedType}`);
  }
  return response.result;
}

export function taskSlug(value) {
  if (typeof value !== "string" || !TASK_ID.test(value)) throw new Error("task id must look like T-1");
  const slug = value.toLowerCase().replaceAll(".", "-");
  if (!SAFE.test(slug)) throw new Error("task id cannot form a safe slug");
  return slug;
}

export function formatTicket(task) {
  return [
    `# ${task.id} — ${task.title}`,
    `## Description\n\n${task.description ?? ""}`,
    `## Architect notes / scratch\n\n${task.implementationNotes ?? ""}`,
  ].join("\n\n").trimEnd();
}

export function formatNoteTake(text, value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("note timestamp is invalid");
  const pad = (part) => String(part).padStart(2, "0");
  const timestamp = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-") +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `---\n\n${timestamp}\n\n${text}`;
}

export function formatGateDocument(ticket, note) {
  return `${ticket.trimEnd()}\n\n---\n\n## Delegate note\n\n${note.trim()}\n`;
}

export function stateHome(env = process.env) {
  return resolve(env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state"));
}

export function runsRoot(project, env = process.env) {
  if (!SAFE.test(project)) throw new Error("project is malformed");
  return join(stateHome(env), "qq", "runs", project);
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

function projectSlug(value) {
  const project = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SAFE.test(project)) throw new Error("project cannot form a safe slug");
  return project;
}

export async function prepareRun(options) {
  const { cwd, env = process.env, task, note } = options;
  const project = projectSlug(options.project || basename(resolve(cwd)));
  const workspace = env.HERDR_WORKSPACE_ID;
  if (typeof workspace !== "string" || workspace === "") throw new Error("delegate requires a Herdr workspace");
  if (typeof note !== "string" || note.trim() === "") throw new Error("delegate requires a non-empty note");
  const slug = taskSlug(task.id);
  const nonce = randomUUID().slice(0, 8);
  const stateDir = join(runsRoot(project, env), `${slug}-${nonce}`);
  const prepared = {
    taskId: task.id, project, slug, nonce, stateDir,
    branch: `qq/${slug}-${nonce}`,
    worktree: join(worktreeRoot(project, env), `${slug}-${nonce}`),
    statePath: join(stateDir, "handoff.json"),
    ticketPath: join(stateDir, "ticket.md"),
    transcriptPath: join(stateDir, "transcript.md"),
    notePath: join(stateDir, "note.md"),
    gatePath: join(stateDir, "gate.md"),
    decisionPath: join(stateDir, "brief-gate-decision"),
  };
  const ticket = formatTicket(task);
  try {
    await privateDirectory(stateDir);
    await writeFile(prepared.ticketPath, `${ticket}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(prepared.transcriptPath, `${options.transcript?.trimEnd() ?? ""}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(prepared.notePath, `${note.trim()}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(prepared.gatePath, formatGateDocument(ticket, note), { mode: 0o600, flag: "wx" });
    return prepared;
  } catch (error) {
    await rm(stateDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function discardRun(prepared) {
  if (prepared?.stateDir) await rm(prepared.stateDir, { recursive: true, force: true });
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
  return parseHerdr(result?.stdout, "tab_created")?.root_pane?.pane_id;
}

function paneFromSplit(result) {
  return parseHerdr(result?.stdout, "pane_info")?.pane?.pane_id;
}

function paneFromPluginOpen(result) {
  return parseHerdr(result?.stdout, "plugin_pane_opened")?.plugin_pane?.pane?.pane_id;
}

async function readGateDecision(path) {
  let info;
  try { info = await lstat(path); } catch { throw new Error("brief gate closed without a decision"); }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error("brief gate returned an unsafe decision");
  }
  const decision = (await readFile(path, "utf8")).trim();
  if (decision !== "approved" && decision !== "cancelled") throw new Error("brief gate returned an invalid decision");
  return decision;
}

export async function awaitBriefGate(options) {
  const { run, env = process.env, prepared, pluginRoot, signal } = options;
  if (typeof run !== "function") throw new Error("awaitBriefGate requires a command runner");
  if (typeof pluginRoot !== "string" || pluginRoot === "") throw new Error("brief gate plugin path is unavailable");
  const callerPane = env.HERDR_PANE_ID;
  if (typeof callerPane !== "string" || callerPane === "") throw new Error("delegate requires a Herdr pane");
  const workspace = env.HERDR_WORKSPACE_ID;
  if (typeof workspace !== "string" || workspace === "") throw new Error("delegate requires a Herdr workspace");

  const listed = await checked(run, "herdr", ["plugin", "list", "--json"], { signal }, "cannot inspect Herdr plugins");
  const plugins = parseHerdr(listed.stdout, "plugin_list")?.plugins;
  if (!Array.isArray(plugins)) throw new Error("Herdr returned a malformed plugin list");
  const installed = plugins.find((plugin) => plugin?.plugin_id === BRIEF_GATE_PLUGIN);
  if (!installed) {
    await checked(run, "herdr", ["plugin", "link", pluginRoot, "--enabled"], { signal }, "cannot link brief gate plugin");
  } else if (!installed.enabled) {
    await checked(run, "herdr", ["plugin", "enable", BRIEF_GATE_PLUGIN], { signal }, "cannot enable brief gate plugin");
  }

  const paneList = await checked(run, "herdr", ["pane", "list", "--workspace", workspace], { signal }, "cannot inspect architect panes");
  const panes = parseHerdr(paneList.stdout, "pane_list")?.panes;
  if (!Array.isArray(panes)) throw new Error("Herdr returned a malformed pane list");
  const caller = panes.find((pane) => pane?.pane_id === callerPane);
  if (typeof caller?.tab_id !== "string" || caller.tab_id === "") throw new Error("delegate caller pane is unavailable");
  const targetPane = panes.filter((pane) => pane?.tab_id === caller.tab_id).at(-1)?.pane_id;
  if (typeof targetPane !== "string" || targetPane === "") throw new Error("architect tab has no pane to split");

  await unlink(prepared.decisionPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  const opened = await checked(run, "herdr", [
    "plugin", "pane", "open", "--plugin", BRIEF_GATE_PLUGIN, "--entrypoint", BRIEF_GATE_ENTRYPOINT,
    "--placement", "split", "--target-pane", targetPane, "--direction", "right",
    "--env", `QQ_BRIEF_GATE_DOCUMENT=${prepared.gatePath}`,
    "--env", `QQ_BRIEF_GATE_DECISION=${prepared.decisionPath}`,
    "--focus",
  ], { signal }, "cannot open brief gate pane");
  const paneId = paneFromPluginOpen(opened);
  if (!paneId) throw new Error("Herdr returned no brief gate pane id");

  let decision;
  let failure;
  try {
    const waited = await run("herdr", [
      "pane", "wait-output", paneId, "--source", "recent-unwrapped", "--match", BRIEF_GATE_MARKER,
    ], { signal });
    if (waited?.code !== 0) throw new Error("brief gate closed without a decision");
    decision = await readGateDecision(prepared.decisionPath);
  } catch (error) {
    failure = error;
  }

  let closeFailure;
  try {
    const closed = await run("herdr", ["plugin", "pane", "close", paneId], {});
    if (closed?.code !== 0) closeFailure = new Error("cannot close brief gate pane");
  } catch {
    closeFailure = new Error("cannot close brief gate pane");
  }
  await unlink(prepared.decisionPath).catch(() => {});
  if (failure) throw failure;
  if (closeFailure) throw closeFailure;
  return decision;
}

function processName(name) {
  if (typeof name !== "string") return "";
  return (name.split(/[/\\]/).pop() ?? name).replace(/^-+/, "").replace(/\.exe$/i, "").toLowerCase();
}

export function paneHasAvailableShell(value) {
  const info = value?.process_info ?? value;
  const shellPid = info?.shell_pid;
  const processes = info?.foreground_processes;
  if (!Number.isInteger(shellPid) || shellPid <= 0 || info?.foreground_process_group_id !== shellPid) return false;
  if (!Array.isArray(processes) || processes.length === 0 || processes.some((process) => process?.pid !== shellPid)) return false;
  return PANE_SHELLS.has(processName(processes.find((process) => process?.pid === shellPid)?.name));
}

export async function waitForAvailableShell(run, paneId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 50;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const signal = options.signal;
  const deadline = now() + timeoutMs;
  let last;
  while (now() < deadline) {
    last = await run("herdr", ["pane", "process-info", "--pane", paneId], { signal });
    if (last?.code === 0 && paneHasAvailableShell(parseHerdr(last.stdout, "pane_process_info"))) return last;
    await sleep(intervalMs);
  }
  throw new Error(`runs pane ${paneId} never became an available shell: ${reason(last, "not a free shell")}`);
}

export async function startRun(options) {
  const { run, cwd, env = process.env, task, architectSession, qaBinding, signal } = options;
  if (typeof run !== "function") throw new Error("run start requires a command runner");
  const prepared = options.prepared ?? await prepareRun(options);
  if (prepared.taskId !== task.id) throw new Error("prepared delegation belongs to another task");
  const { project, slug, nonce, branch, worktree, stateDir, statePath, ticketPath, transcriptPath, notePath, gatePath } = prepared;
  const workspace = env.HERDR_WORKSPACE_ID;
  if (typeof workspace !== "string" || workspace === "") throw new Error("delegate requires a Herdr workspace");

  let mainRoot;
  let baseRef;
  let baseBranch;
  let paneId;
  let createdWorktree = false;
  let createdPane = false;
  try {
    const runnerTicket = await readFile(ticketPath, "utf8");
    const runnerNote = await readFile(notePath, "utf8");
    mainRoot = (await checked(run, "git", ["rev-parse", "--show-toplevel"], { cwd, signal }, "cannot identify repository")).stdout.trim();
    baseRef = (await checked(run, "git", ["rev-parse", "HEAD"], { cwd: mainRoot, signal }, "cannot identify base ref")).stdout.trim();
    baseBranch = (await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: mainRoot, signal }, "delegate requires a named base branch")).stdout.trim();
    await privateDirectory(worktreeRoot(project, env));
    await privateDirectory(stateDir);
    await checked(run, "git", ["worktree", "add", "-b", branch, worktree, baseRef], { cwd: mainRoot, signal }, "cannot create worktree");
    createdWorktree = true;

    const tabsResult = await checked(run, "herdr", ["tab", "list", "--workspace", workspace], { signal }, "cannot list Herdr tabs");
    const tabs = parseHerdr(tabsResult.stdout, "tab_list")?.tabs ?? [];
    const runsTab = tabs.find((tab) => tab?.label === "runs");
    const paneEnv = [
      `QQ_AGENT_ROLE=runner`, `QQ_AGENT_PROJECT=${project}`, `QQ_RUN_STATE=${statePath}`,
      `QQ_RUN_ID=${slug}-${nonce}`, `QQ_ARCHITECT_SESSION=${architectSession}`,
    ];
    if (!runsTab) {
      const args = ["tab", "create", "--workspace", workspace, "--label", "runs", "--cwd", worktree, "--no-focus"];
      for (const entry of paneEnv) args.push("--env", entry);
      const created = await checked(run, "herdr", args, { signal }, "cannot create runs tab");
      paneId = paneFromTabCreate(created);
    } else {
      const panesResult = await checked(run, "herdr", ["pane", "list", "--workspace", workspace], { signal }, "cannot list runs panes");
      const parent = (parseHerdr(panesResult.stdout, "pane_list")?.panes ?? [])
        .filter((pane) => pane?.tab_id === runsTab.tab_id)
        .at(-1)?.pane_id;
      if (!parent) throw new Error("runs tab has no pane to split");
      const args = ["--pane", parent, "--cwd", worktree, "--no-focus"];
      for (const entry of paneEnv) args.push("--env", entry);
      const split = await checked(run, "qq-herdr-pane-add", args, { signal }, "cannot add runs pane");
      paneId = paneFromSplit(split);
    }
    if (typeof paneId !== "string" || paneId === "") throw new Error("Herdr returned no runs pane id");
    createdPane = true;
    await checked(run, "herdr", ["pane", "rename", paneId, `${task.id}: ${task.title}`.slice(0, 80)], { signal }, "cannot label runs pane");

    const state = {
      schema: "qq.run-handoff/v1", version: 1, id: `${slug}-${nonce}`, project,
      task: { id: task.id, title: task.title }, status: "starting", look: 0,
      mainRoot, baseBranch, baseRef, branch, worktree, pane: paneId, architectSession,
      ticketPath, transcriptPath, notePath, gatePath, statePath, qa: qaBinding, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await atomicPrivateJson(statePath, state);
    await waitForAvailableShell(run, paneId, { signal });
    await checked(run, "herdr", ["agent", "start", `runner-${slug}-${nonce}`, "--kind", "pi", "--pane", paneId], { signal }, "cannot start runs runner");
    const prompt = `Work from the full Backlog ticket and delegate note below. The note is also at ${notePath}. Implement the task in this worktree, commit the result, then call done with ref HEAD. Do not merge.\n\n${runnerTicket.trimEnd()}\n\n---\n\n## Delegate note\n\n${runnerNote.trimEnd()}`;
    const prompted = await run("herdr", ["agent", "prompt", paneId, prompt, "--wait", "--until", "working", "--timeout", "5000"], { signal });
    if (prompted?.code !== 0) throw new Error("cannot send the ticket and note to the runs runner");
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
  if (!value || value.schema !== "qq.run-handoff/v1" || value.version !== 1) throw new Error("runs handoff is malformed");
  return value;
}
