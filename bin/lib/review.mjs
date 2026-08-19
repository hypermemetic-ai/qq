import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GROK_PROVIDERS, agentModelsPath } from "./execution-profiles.mjs";
import { DSH_RUN_APPROVAL_SCHEMA, DSH_RUN_SUBMISSION_SCHEMA, atomicPrivateJson, parseHerdr, readHandoff, removeWorktree, runsRoot, waitForAvailableShell } from "./run.mjs";
import { RUN_BLOCKED_KIND, sendRunEvent } from "./run-events.mjs";
import { DSH_CHILD_SESSION_ID, DSH_SESSION_ID } from "./session-context.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKLOG = join(QQ_ROOT, "node_modules", ".bin", "backlog");
const OPENWIKI_MATERIALIZE = join(QQ_ROOT, "bin", "qq-openwiki-materialize");

export { DSH_RUN_SUBMISSION_SCHEMA } from "./run.mjs";

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

export const ROUTE_PACKET_SCHEMA = "qq.route-packet/v1";
export const ROUTE_MARKS = Object.freeze(["review", "land"]);
export const REVIEW_MARKS = Object.freeze(["pass", "fail"]);
const PACKET_POINTER_LIMIT = 8;

function fileCounts(file) {
  return { path: file.path, added: file.added ?? null, deleted: file.deleted ?? null };
}

export function parseDiffPointers(source, limit = PACKET_POINTER_LIMIT) {
  const pointers = [];
  let path = "";
  for (const line of String(source ?? "").split("\n")) {
    const file = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (file) {
      path = file[1] === "/dev/null" ? "" : file[1];
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (!hunk || !path) continue;
    const context = hunk[2].trim();
    pointers.push(context ? `${path}:${hunk[1]} ${context}` : `${path}:${hunk[1]}`);
    if (pointers.length >= limit) break;
  }
  return pointers;
}

export function formatPacket(packet) {
  const files = (packet?.files ?? []).map((file) => `${file.path} +${file.added ?? "?"}/-${file.deleted ?? "?"}`);
  const pointers = packet?.pointers ?? [];
  return [
    `Mark: ${packet?.mark ?? "review"}`,
    packet?.brief ?? "",
    files.length ? `Files:\n${files.join("\n")}` : "Files:",
    pointers.length ? `Pointers:\n${pointers.join("\n")}` : "Pointers:",
  ].filter(Boolean).join("\n\n");
}

async function readBrief(state) {
  let ticket = "";
  let note = "";
  if (state?.ticketPath) {
    try { ticket = await readFile(state.ticketPath, "utf8"); } catch {}
  }
  if (state?.notePath) {
    try { note = await readFile(state.notePath, "utf8"); } catch {}
  }
  return `${ticket.trim()}\n\n---\n\n## Delegate note\n\n${note.trim()}`.trim();
}

export async function compilePacket(run, state, options = {}) {
  const view = { ...state, ref: options.ref ?? state.ref };
  const files = (options.files ?? await packFor(run, view)).map(fileCounts);
  const unified = await checked(
    run, "git", ["diff", "-U0", "--no-color", `${view.baseRef}...${view.ref}`],
    { cwd: view.worktree }, "cannot collect packet pointers",
  );
  const pointers = parseDiffPointers(unified.stdout);
  const brief = options.brief ?? await readBrief(view);
  return {
    schema: ROUTE_PACKET_SCHEMA,
    brief,
    files,
    pointers,
    mark: options.mark ?? null,
  };
}

export function parseRouteStamp(source) {
  const first = String(source ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (first === "land" || first === "review") return first;
  return undefined;
}

const REVIEW_PATH = /(^|\/)(?:session|store|identity|review|land|run|dsh)[^/]*\.(?:mjs|ts|js)$/i;
const REVIEW_WORD = /\b(?:session|store|identity|review|land|run|handoff|relay)\b/i;
const PAINT_PATH = /\.(?:css|scss|less|svg)$/i;
const PAINT_WORD = /\b(?:paint|css|stylesheet|copy|comment|color|typo)\b/i;

export function stampFromEvidence(packet) {
  const files = packet?.files ?? [];
  const brief = String(packet?.brief ?? "");
  const index = files.map((file) => file.path).join("\n");
  const evidence = `${brief}\n${index}`;
  if (files.some((file) => REVIEW_PATH.test(file.path)) || REVIEW_WORD.test(evidence)) return "review";
  if (files.length > 0 && files.every((file) => PAINT_PATH.test(file.path)) && PAINT_WORD.test(brief)) return "land";
  return "review";
}

export function formatRouteEvidence(packet) {
  const files = (packet?.files ?? []).map((file) => `${file.path} +${file.added ?? "?"}/-${file.deleted ?? "?"}`);
  const pointers = packet?.pointers ?? [];
  return [
    "Original brief:",
    packet?.brief ?? "",
    "",
    "Files touched:",
    files.join("\n") || "(none)",
    "",
    "Pointers:",
    pointers.join("\n") || "(none)",
  ].join("\n");
}

export async function routePacket(packet, options = {}) {
  const fallback = stampFromEvidence(packet);
  const complete = options.complete;
  if (typeof complete !== "function") return fallback;
  try {
    const prompt = options.prompt ?? (await readFile(join(QQ_ROOT, "prompts", "services", "route.md"), "utf8")).trim();
    const source = await complete({ system: prompt, user: formatRouteEvidence(packet) });
    return parseRouteStamp(typeof source === "string" ? source : "") ?? fallback;
  } catch {
    return fallback;
  }
}

export function isRoutedLand(state) {
  return state?.packet?.schema === ROUTE_PACKET_SCHEMA
    && state.packet.mark === "land"
    && typeof state.ref === "string"
    && state.ref.length > 0;
}

export function isReadyToLand(state) {
  return isQaPassedProposal(state) || isRoutedLand(state);
}

export async function prepareDone(run, cwd, statePath, ref, options = {}) {
  const state = await readHandoff(statePath);
  if (state.runtime === "dsh") {
    const approval = state.approval;
    if (approval?.schema !== DSH_RUN_APPROVAL_SCHEMA || approval.runtime !== "dsh" ||
        approval.status !== "approved" || approval.runId !== state.id || approval.taskId !== state.task?.id ||
        approval.architectSession !== state.architectSession ||
        typeof approval.approvedAt !== "string" || Number.isNaN(Date.parse(approval.approvedAt))) {
      throw new Error("native DSH handoff has no durable approved gate record");
    }
    const caller = options.callerContext;
    if (caller?.source !== "dsh-session" || caller.role !== "runner" ||
        caller.sessionId !== state.runnerSession || caller.runState !== statePath ||
        caller.profile !== state.runnerProfile?.name ||
        !DSH_CHILD_SESSION_ID.test(state.runnerSession ?? "") ||
        !DSH_SESSION_ID.test(state.bootstrapParentSession ?? "") ||
        !DSH_SESSION_ID.test(state.architectSession ?? "") ||
        state.callerSession !== state.architectSession || state.statePath !== statePath) {
      throw new Error("done requires the exact owned native DSH runner session");
    }
    if (state.look !== 0) throw new Error("native DSH submission cannot follow a consumed QA look");
  }
  const actual = await realpath(cwd);
  const expected = await realpath(state.worktree);
  if (actual !== expected) throw new Error("done must run from its delegated worktree");
  if (state.status !== "running" && (state.runtime === "dsh" || state.status !== "waiting_fix")) {
    throw new Error(`handoff is ${state.status}, not ready for done`);
  }
  if (state.runtime !== "dsh" && state.look >= 2) throw new Error("qa already used both looks");
  const revision = await checked(run, "git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd }, "ref is not a commit");
  const sha = revision.stdout.trim();
  if (state.runtime === "dsh") {
    const shared = await checked(run, "git", ["rev-parse", "--verify", `${sha}^{commit}`], { cwd: state.mainRoot }, "ref is not shared with the delegated repository");
    if (shared.stdout.trim() !== sha) throw new Error("ref is not shared with the delegated repository");
  }
  await checked(run, "git", ["merge-base", "--is-ancestor", state.baseRef, sha], { cwd }, "ref does not descend from the delegated base");
  const status = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd }, "cannot inspect worktree");
  if (status.stdout.trim()) throw new Error("worktree is not clean; commit or remove every change before done");
  if (state.runtime === "dsh") {
    const submittedAt = new Date().toISOString();
    state.ref = sha;
    state.status = "submitted";
    state.submission = {
      schema: DSH_RUN_SUBMISSION_SCHEMA, runtime: "dsh", ref: sha,
      awaiting: "native-review", submittedAt,
      continuation: {
        architectSession: state.architectSession,
        bootstrapParentSession: state.bootstrapParentSession,
        runnerSession: state.runnerSession,
        runState: state.statePath,
        worktree: state.worktree,
      },
    };
    state.updatedAt = submittedAt;
  } else {
    state.look += 1;
    state.ref = sha;
    state.status = "reviewing";
    state.updatedAt = new Date().toISOString();
  }
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
  if (!isReadyToLand(state)) throw new Error(`handoff is ${state.status}, not a qa-passed proposal ready to land`);
  try {
    const branch = await checked(run, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: state.mainRoot }, "main checkout is detached");
    if (branch.stdout.trim() !== state.baseBranch) throw new Error(`main checkout is on ${branch.stdout.trim()}, not ${state.baseBranch}`);
    const mainStatus = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.mainRoot }, "cannot inspect main checkout");
    const dirtyMainStatus = String(mainStatus.stdout ?? "").trimEnd();
    if (dirtyMainStatus.trim()) throw new Error(`main checkout clean-checkout invariant violation; dirty paths:\n${dirtyMainStatus}`);
    const worktreeStatus = await checked(run, "git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree }, "cannot inspect delegated worktree");
    if (worktreeStatus.stdout.trim()) throw new Error("delegated worktree has uncommitted residue");
    const proposalDiff = await checked(run, "git", ["diff", "--name-only", "--no-renames", "-z", `${state.baseRef}...${state.ref}`, "--"], { cwd: state.worktree }, "cannot inspect proposal paths");
    const generatedPaths = parseChangedPaths(proposalDiff.stdout).filter((path) => path === "openwiki" || path.startsWith("openwiki/"));
    if (generatedPaths.length) throw new Error(`delegated proposal changes generated OpenWiki paths: ${generatedPaths.join(", ")}`);
    await checked(run, OPENWIKI_MATERIALIZE, ["freeze", state.mainRoot], { cwd: state.mainRoot }, "cannot protect main OpenWiki materialization");
    const merged = await run("git", ["merge-base", "--is-ancestor", state.ref, "HEAD"], { cwd: state.mainRoot });
    if (merged?.code !== 0 && merged?.code !== 1) throw new Error(`cannot inspect whether proposal is already merged: ${reason(merged, "command failed")}`);
    if (merged.code === 1) {
      await checked(run, "git", ["merge-tree", "--write-tree", "HEAD", state.ref], { cwd: state.mainRoot }, "proposal no longer merges cleanly");
      await checked(run, "git", ["merge", "--no-ff", "--no-edit", state.ref], { cwd: state.mainRoot }, "merge failed");
    }
    const upstream = await checked(run, "git", ["for-each-ref", "--count=1", "--format=%(upstream:remotename)%00%(upstream:remoteref)", `refs/heads/${state.baseBranch}`], { cwd: state.mainRoot }, "cannot inspect target branch upstream");
    const [remote, remoteRef] = String(upstream.stdout ?? "").trimEnd().split("\0");
    if (!remote || !remoteRef) throw new Error(`target branch ${state.baseBranch} has no upstream`);
    await checked(run, "git", ["push", remote, `HEAD:${remoteRef}`], { cwd: state.mainRoot }, "cannot push target branch to its upstream");
    await removeWorktree(run, state.mainRoot, state.worktree);
    await checked(run, "git", ["branch", "-d", state.branch], { cwd: state.mainRoot }, "merged but branch cleanup failed");
    state.status = "landed";
    state.landedAt = new Date().toISOString();
    state.updatedAt = state.landedAt;
    await atomicPrivateJson(statePath, state);
  } catch (error) {
    state.status = "blocked";
    state.blockedReason = error instanceof Error ? error.message : String(error);
    if (state.packet?.schema === ROUTE_PACKET_SCHEMA) state.packet = { ...state.packet, mark: "fail" };
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

function xaiOAuthExtensionPath(env = process.env) {
  return join(dirname(agentModelsPath(env)), "npm", "node_modules", "pi-xai-oauth", "extensions", "xai-oauth.ts");
}

export function qaLaunchArgs(state, options) {
  const args = [
    "--model", `${state.qa.provider}/${state.qa.model}`, "--thinking", state.qa.effort,
    "--system-prompt", options.servicePromptPath, "--no-extensions", "--extension", join(QQ_ROOT, "extensions", "qa-result.ts"),
  ];
  if (GROK_PROVIDERS.has(state.qa.provider)) args.push("--extension", xaiOAuthExtensionPath(options.env));
  args.push(
    "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", "read,bash,edit,write,qa_verdict",
    "--session-dir", options.sessionDir,
  );
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
  const start = ["agent", "start", name, "--kind", "pi", "--pane", pane, "--timeout", String(timeoutMs), "--", "--approve", ...args];
  await herdr(run, start, `cannot start ${name} in runs pane`);
}

export async function stopAgent(run, pane, timeoutMs) {
  await waitForAgentIdentityDrop(run, pane, timeoutMs);
  await waitForShell(run, pane, timeoutMs);
}

export async function conductReview(run, statePath, options = {}) {
  const env = options.env ?? process.env;
  const emitRunEvent = options.emitRunEvent ?? ((outcome, kind) => sendRunEvent(outcome, kind, { env }));
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
  const launchArgs = qaLaunchArgs(state, { servicePromptPath, sessionDir, qaSessionId, env });
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
    const files = await packFor(run, state);
    state.pack = { summary: verdict.summary, files };
    if (state.packet?.schema === ROUTE_PACKET_SCHEMA) {
      state.packet = { ...state.packet, files: files.map(fileCounts), mark: "pass" };
    }
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

  const files = await packFor(run, state);
  state.pack = { summary: verdict.summary, files };
  if (state.packet?.schema === ROUTE_PACKET_SCHEMA) {
    state.packet = { ...state.packet, files: files.map(fileCounts), mark: "fail" };
  }
  state.status = "blocked";
  state.blockedReason = verdict.feedback || verdict.summary;
  await atomicPrivateJson(statePath, state);
  await setBoardStatus(run, state.mainRoot, state.task.id, "To Do");
  await emitRunEvent(state, RUN_BLOCKED_KIND);
  await closePane();
  await notify("qa blocked after look 2", `${state.task.id}: ${verdict.summary}`);
  return state;
}
