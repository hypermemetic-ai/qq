import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OPENWIKI_MATERIALIZE = resolve(dirname(fileURLToPath(import.meta.url)), "../qq-openwiki-materialize");
const TASK_ID = /^[A-Za-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?$/;
const SAFE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PROFILE_BINDING = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
const PROFILE_EFFORTS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const BRIEF_GATE_PLUGIN = "qq.brief-gate";
const BRIEF_GATE_ENTRYPOINT = "review";
const BRIEF_GATE_MARKER = "QQ_BRIEF_GATE_DECIDED";
const BOOTSTRAP_SCHEMA = "qq.run-bootstrap/v1";
export const DSH_RUN_APPROVAL_SCHEMA = "qq.dsh-run-approval/v1";
export const DSH_RUN_SUBMISSION_SCHEMA = "qq.dsh-run-submission/v1";
const PROMPT_PROOF_TIMEOUT_MS = 30_000;
const HERDR_RESPONSE_LIMIT = 1024 * 1024;
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
  if (options.runtime !== "dsh" && (typeof workspace !== "string" || workspace === "")) {
    throw new Error("delegate requires a Herdr workspace");
  }
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
    bootstrapPath: join(stateDir, "bootstrap.json"),
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

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  throw new Error("delegation was cancelled");
}

export async function prepareBootstrapRequest(options) {
  const { prepared, task, architectSession, qaBinding, signal } = options;
  if (!prepared?.stateDir || prepared.taskId !== task?.id) throw new Error("bootstrap request belongs to another task");
  throwIfAborted(signal);
  const bootstrapPath = prepared.bootstrapPath || join(prepared.stateDir, "bootstrap.json");
  const createdAt = new Date().toISOString();
  const request = {
    schema: BOOTSTRAP_SCHEMA, version: 1,
    id: `${prepared.slug}-${prepared.nonce}`,
    cwd: resolve(options.cwd), project: prepared.project,
    task: { id: task.id, title: task.title }, architectSession, qaBinding,
    ...(options.runnerProfile ? {
      runnerProfile: { ...options.runnerProfile },
      approval: {
        schema: DSH_RUN_APPROVAL_SCHEMA, runtime: "dsh", status: "approved",
        runId: `${prepared.slug}-${prepared.nonce}`, taskId: task.id,
        architectSession, approvedAt: createdAt,
      },
    } : {}),
    marker: `[qq-bootstrap:${prepared.slug}-${prepared.nonce}:${randomUUID()}]`,
    prepared: { ...prepared, bootstrapPath }, createdAt,
  };
  await atomicPrivateJson(bootstrapPath, request);
  throwIfAborted(signal);
  return { ...request, bootstrapPath };
}

export async function readBootstrapRequest(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error("runner bootstrap request is unsafe");
  }
  let value;
  try { value = JSON.parse(await readFile(path, "utf8")); } catch { throw new Error("runner bootstrap request is malformed"); }
  if (!value || value.schema !== BOOTSTRAP_SCHEMA || value.version !== 1 ||
      typeof value.cwd !== "string" || !isAbsolute(value.cwd) ||
      typeof value.task?.id !== "string" || typeof value.task?.title !== "string" ||
      typeof value.architectSession !== "string" || typeof value.marker !== "string" ||
      value.marker.length < 20 || value.prepared?.taskId !== value.task.id ||
      resolve(value.prepared?.bootstrapPath || "") !== resolve(path)) {
    throw new Error("runner bootstrap request is malformed");
  }
  if (value.runnerProfile !== undefined && (
    typeof value.runnerProfile?.name !== "string" || !SAFE.test(value.runnerProfile.name) ||
    typeof value.runnerProfile.provider !== "string" || !PROFILE_BINDING.test(value.runnerProfile.provider) ||
    typeof value.runnerProfile.model !== "string" || !PROFILE_BINDING.test(value.runnerProfile.model) ||
    typeof value.runnerProfile.effort !== "string" || !PROFILE_EFFORTS.has(value.runnerProfile.effort) ||
    Object.keys(value.runnerProfile).sort().join(",") !== "effort,model,name,provider"
  )) throw new Error("runner bootstrap request is malformed");
  const approval = value.approval;
  if ((value.runnerProfile === undefined) !== (approval === undefined) || (approval !== undefined && (
    approval?.schema !== DSH_RUN_APPROVAL_SCHEMA || approval.runtime !== "dsh" || approval.status !== "approved" ||
    approval.runId !== value.id || approval.taskId !== value.task.id ||
    approval.architectSession !== value.architectSession || typeof approval.approvedAt !== "string" ||
    Number.isNaN(Date.parse(approval.approvedAt)) ||
    Object.keys(approval).sort().join(",") !== "approvedAt,architectSession,runId,runtime,schema,status,taskId"
  ))) throw new Error("runner bootstrap request is malformed");
  return value;
}

function herdrSocketPath(env) {
  const configured = env.HERDR_SOCKET_PATH || join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "herdr", "herdr.sock");
  if (!isAbsolute(configured)) throw new Error("Herdr socket path is malformed");
  return configured;
}

export function herdrApiRequest(method, params, options = {}) {
  const env = options.env ?? process.env;
  const path = options.socketPath ?? herdrSocketPath(env);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const request = `${JSON.stringify({ id: `qq:${randomUUID()}`, method, params })}\n`;
  return new Promise((accept, reject) => {
    const socket = net.createConnection(path);
    let source = "";
    let settled = false;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener?.("abort", aborted);
      socket.destroy();
      if (error) reject(error); else accept(response);
    };
    const aborted = () => finish(new Error("Herdr request was cancelled"));
    options.signal?.addEventListener?.("abort", aborted, { once: true });
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs, () => finish(new Error("Herdr request timed out")));
    socket.on("connect", () => {
      if (options.signal?.aborted) return aborted();
      socket.write(request);
    });
    socket.on("data", (chunk) => {
      source += chunk;
      if (source.length > HERDR_RESPONSE_LIMIT) return finish(new Error("Herdr response was too large"));
      const newline = source.indexOf("\n");
      if (newline < 0) return;
      let response;
      try { response = JSON.parse(source.slice(0, newline)); } catch { return finish(new Error("Herdr returned malformed JSON")); }
      if (response?.error) return finish(new Error(`Herdr request failed: ${response.error.message || response.error.code || "unknown error"}`));
      finish(undefined, response);
    });
    socket.on("error", (error) => finish(new Error(`cannot reach Herdr: ${error.message}`)));
    socket.on("end", () => finish(new Error("Herdr closed the request without a response")));
  });
}

export async function submitAgentPrompt(paneId, prompt, options = {}) {
  const request = options.request ?? herdrApiRequest;
  const response = await request("agent.prompt", { target: paneId, text: prompt }, options);
  return parseHerdr(JSON.stringify(response), "agent_prompted");
}

function exactUserMarker(value, marker) {
  if (value?.type !== "message" || value.message?.role !== "user" || !Array.isArray(value.message.content)) return false;
  return value.message.content.some((block) => block?.type === "text" &&
    typeof block.text === "string" && block.text.split(/\r?\n/).includes(marker));
}

export async function sessionHasPromptMarker(path, marker) {
  let info;
  try { info = await lstat(path); } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || !path.endsWith(".jsonl")) {
    throw new Error("Herdr reported an unsafe Pi session path");
  }
  const source = await readFile(path, "utf8");
  for (const line of source.split("\n")) {
    if (!line) continue;
    try { if (exactUserMarker(JSON.parse(line), marker)) return true; } catch {}
  }
  return false;
}

function agentSessionPath(response, paneId) {
  const agent = parseHerdr(typeof response === "string" ? response : JSON.stringify(response), "agent_info")?.agent;
  const session = agent?.agent_session;
  if (agent?.pane_id !== paneId || agent.agent !== "pi" || session?.agent !== "pi" ||
      session.kind !== "path" || session.source !== "herdr:pi" ||
      typeof session.value !== "string" || !isAbsolute(session.value)) return undefined;
  return session.value;
}

export async function verifyPromptAcceptance(inspectAgent, paneId, marker, options = {}) {
  const timeoutMs = options.timeoutMs ?? PROMPT_PROOF_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? 100;
  const sleep = options.sleep ?? ((ms) => new Promise((accept) => setTimeout(accept, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let lastReason = "Herdr has not reported the Pi session";
  while (now() < deadline) {
    throwIfAborted(options.signal);
    const remaining = deadline - now();
    const controller = new AbortController();
    const pollSignal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Herdr agent inspection timed out");
        controller.abort(error);
        reject(error);
      }, remaining);
    });
    let response;
    try {
      response = await Promise.race([
        inspectAgent(paneId, { signal: pollSignal, timeoutMs: remaining }),
        timedOut,
      ]);
    } catch (error) {
      throwIfAborted(options.signal);
      lastReason = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) break;
    } finally {
      clearTimeout(timer);
    }
    if (response !== undefined) {
      try {
        const source = typeof response?.stdout === "string" ? response.stdout : response;
        const path = response?.code !== undefined && response.code !== 0 ? undefined : agentSessionPath(source, paneId);
        if (path && await sessionHasPromptMarker(path, marker)) return path;
        lastReason = path ? "the marked user message is not recorded yet"
          : response?.code !== undefined && response.code !== 0 ? reason(response, "cannot inspect the runs runner")
          : "Herdr has not reported the Pi session";
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
      }
    }
    const afterPoll = deadline - now();
    if (afterPoll <= 0) break;
    await sleep(Math.min(intervalMs, afterPoll));
  }
  throw new Error(`runner prompt acceptance was not recorded within ${timeoutMs}ms: ${lastReason}`);
}

export function sanitizeBootstrapReason(error, options = {}) {
  let source = error instanceof Error ? error.message : String(error);
  const credentialValues = Object.entries(options.env ?? process.env)
    .filter(([name, value]) => /(?:AUTH|CREDENTIAL|KEY|PASS|SECRET|TOKEN)/i.test(name) && typeof value === "string" && value.length >= 6)
    .map(([, value]) => value);
  const secrets = [...(options.secrets ?? []), ...credentialValues]
    .filter((value) => typeof value === "string" && value.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) source = source.replaceAll(secret, "[redacted]");
  source = source.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return (source || "runner bootstrap failed").slice(0, 400);
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

export async function removeWorktree(run, mainRoot, worktree, options = {}) {
  const args = ["worktree", "remove"];
  if (options.force) args.push("--force");
  args.push(worktree);
  try {
    await checked(run, OPENWIKI_MATERIALIZE, ["thaw", worktree], { cwd: worktree, signal: options.signal }, "cannot prepare worktree cleanup");
    return await checked(run, "git", args, { cwd: mainRoot, signal: options.signal }, "worktree cleanup failed");
  } catch (error) {
    try {
      await checked(run, OPENWIKI_MATERIALIZE, ["freeze", worktree], { cwd: worktree }, "cannot restore worktree protection");
    } catch (freezeError) {
      try {
        await lstat(worktree);
      } catch (statError) {
        if (statError?.code === "ENOENT") throw error;
        throw new AggregateError([error, freezeError, statError], "worktree cleanup failed and its protection could not be verified");
      }
      throw new AggregateError([error, freezeError], "worktree cleanup failed and its protection could not be restored");
    }
    throw error;
  }
}

export async function cleanupRunWorkspace(run, workspace, options = {}) {
  const failures = [];
  try { await removeWorktree(run, workspace.mainRoot, workspace.worktree, { force: true, signal: options.signal }); }
  catch { failures.push(new Error("worktree cleanup failed")); }
  try {
    const removed = await run("git", ["branch", "-D", workspace.branch], { cwd: workspace.mainRoot, signal: options.signal });
    if (removed?.code !== 0) failures.push(new Error("delegation branch cleanup failed"));
  } catch { failures.push(new Error("delegation branch cleanup failed")); }
  if (failures.length) throw new AggregateError(failures, failures.map((failure) => failure.message).join("; "));
}

export async function createRunWorkspace(run, cwd, prepared, options = {}) {
  const { env = process.env, signal } = options;
  const mainRoot = (await checked(run, "git", ["rev-parse", "--show-toplevel"], { cwd, signal }, "cannot identify repository")).stdout.trim();
  const baseRef = (await checked(run, "git", ["rev-parse", "HEAD"], { cwd: mainRoot, signal }, "cannot identify base ref")).stdout.trim();
  const baseBranch = (await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: mainRoot, signal }, "delegate requires a named base branch")).stdout.trim();
  const workspace = { mainRoot, baseRef, baseBranch, branch: prepared.branch, worktree: prepared.worktree };
  await privateDirectory(worktreeRoot(prepared.project, env));
  await privateDirectory(prepared.stateDir);
  await checked(run, "git", ["worktree", "add", "-b", prepared.branch, prepared.worktree, baseRef], { cwd: mainRoot, signal }, "cannot create worktree");
  try {
    await checked(run, OPENWIKI_MATERIALIZE, ["freeze", prepared.worktree], { cwd: prepared.worktree, signal }, "cannot protect delegated OpenWiki materialization");
    return workspace;
  } catch (error) {
    try { await cleanupRunWorkspace(run, workspace); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "cannot create protected worktree and cleanup failed"); }
    throw error;
  }
}

export function formatRunnerPrompt(marker, ticket, note, options = {}) {
  const instruction = "Implement the task in this worktree, commit the result, then call done with ref HEAD. Do not merge.";
  return `${marker}\n\nWork from the full Backlog ticket and delegate note below. The note is also at ${options.notePath}. ${instruction}\n\n${ticket.trimEnd()}\n\n---\n\n## Delegate note\n\n${note.trimEnd()}`;
}

export async function startRun(options) {
  const { run, cwd, env = process.env, task, architectSession, qaBinding, signal } = options;
  if (typeof run !== "function") throw new Error("run start requires a command runner");
  const prepared = options.prepared ?? await prepareRun(options);
  if (prepared.taskId !== task.id) throw new Error("prepared delegation belongs to another task");
  const { project, slug, nonce, branch, worktree, stateDir, statePath, ticketPath, transcriptPath, notePath, gatePath } = prepared;
  const workspace = env.HERDR_WORKSPACE_ID;
  if (typeof workspace !== "string" || workspace === "") throw new Error("delegate requires a Herdr workspace");
  const marker = options.marker ?? `[qq-bootstrap:${slug}-${nonce}:${randomUUID()}]`;

  let mainRoot;
  let baseRef;
  let baseBranch;
  let paneId;
  let runnerTicket = "";
  let runnerNote = "";
  let prompt = "";
  let createdWorktree = false;
  let createdPane = false;
  try {
    runnerTicket = await readFile(ticketPath, "utf8");
    runnerNote = await readFile(notePath, "utf8");
    const runWorkspace = await createRunWorkspace(run, cwd, prepared, { env, signal });
    ({ mainRoot, baseRef, baseBranch } = runWorkspace);
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
    await checked(run, "herdr", ["agent", "start", `runner-${slug}-${nonce}`, "--kind", "pi", "--pane", paneId, "--", "--approve"], { signal }, "cannot start runs runner");
    prompt = formatRunnerPrompt(marker, runnerTicket, runnerNote, { notePath, runtime: "pi-herdr" });
    await (options.submitPrompt ?? submitAgentPrompt)(paneId, prompt, { env, signal });
    const inspectAgent = options.inspectAgent ?? ((target, requestOptions) =>
      herdrApiRequest("agent.get", { target }, { env, ...requestOptions }));
    const sessionPath = await verifyPromptAcceptance(inspectAgent, paneId, marker, {
      signal,
      timeoutMs: options.verificationTimeoutMs,
      intervalMs: options.verificationIntervalMs,
      sleep: options.sleep,
      now: options.now,
    });
    state.status = "running";
    state.bootstrapProof = { marker, sessionPath, acceptedAt: new Date().toISOString() };
    state.updatedAt = new Date().toISOString();
    await atomicPrivateJson(statePath, state);
    return state;
  } catch (error) {
    const cleanupFailures = [];
    if (createdPane && paneId) {
      try {
        const closed = await run("herdr", ["pane", "close", paneId], {});
        if (closed?.code !== 0) cleanupFailures.push(new Error("runs pane cleanup failed"));
      } catch { cleanupFailures.push(new Error("runs pane cleanup failed")); }
    }
    if (createdWorktree && mainRoot) {
      try { await cleanupRunWorkspace(run, { mainRoot, worktree, branch }); }
      catch (cleanupError) {
        for (const failure of cleanupError?.errors ?? [cleanupError]) cleanupFailures.push(failure);
      }
    }
    if (!options.preserveStateOnFailure) {
      try { await rm(stateDir, { recursive: true, force: true }); }
      catch { cleanupFailures.push(new Error("runner state cleanup failed")); }
    }
    const safe = sanitizeBootstrapReason(error, {
      env,
      secrets: [runnerTicket, runnerTicket.trim(), runnerNote, runnerNote.trim(), prompt, ticketPath, notePath, gatePath, statePath],
    });
    if (cleanupFailures.length > 0) throw new Error(`${safe}; ${cleanupFailures.map((failure) => failure.message).join("; ")}`);
    throw new Error(safe);
  }
}

export async function readHandoff(path) {
  const source = await readFile(path, "utf8");
  const value = JSON.parse(source);
  if (!value || value.schema !== "qq.run-handoff/v1" || value.version !== 1) throw new Error("runs handoff is malformed");
  return value;
}
