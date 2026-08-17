import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import registerBoard from "../../../extensions/board.ts";
import registerReviewFlow from "../../../extensions/review-flow.ts";
import { verifyDshPromptAcceptance } from "../../../bin/lib/dsh-run.mjs";
import { DSH_RUN_SUBMISSION_SCHEMA } from "../../../bin/lib/review.mjs";
import { DSH_RUN_APPROVAL_SCHEMA, readHandoff } from "../../../bin/lib/run.mjs";
import { createQqSessionContext } from "../../../bin/lib/session-context.mjs";

const SCHEMA = "qq.dsh-native-delegation-proof/v1";
const MARKER_LINE = /^\[qq-bootstrap:[^\]]+\]$/m;

export const name = "qq-dsh-native-delegation-proof";
export const inject = ["agentDefaultModel", "agents", "sessions", "sessionPersistence", "subagents"];

function assert(condition, message) {
  if (!condition) throw new Error(`qq-dsh-native-delegation-proof: ${message}`);
}

function installSelection(agentCtx, selection) {
  let assembled;
  agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
    const result = await next();
    assembled = selection;
    return { ...result, variables: { ...result.variables, provider: selection.provider, model: selection.model } };
  });
  agentCtx.on("agent/request", async (_payload, next) => {
    const result = await next();
    if (!assembled) return result;
    return { ...result, provider: assembled.provider, model: assembled.model };
  });
}

function textOf(message) {
  return message?.content?.filter((block) => block?.type === "text").map((block) => block.text).join("") ?? "";
}

function emit(value) {
  process.stdout.write(`QQ_DSH_NATIVE_DELEGATION_PROOF ${JSON.stringify(value)}\n`);
}

async function commandRun(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });
  return {
    code: result.status ?? (result.error ? 127 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

async function start(ctx, config, boundary) {
  const selection = ctx.agentDefaultModel.currentSelection();
  boundary.claimExclusive(config.architectSession, {
    role: "architect", profile: "dsh-architect", runState: null,
  });
  const callerHandle = await ctx.agents.create({
    sessionId: config.architectSession,
    meta: { cwd: config.cwd },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup(agentCtx) { installSelection(agentCtx, selection); },
  });
  await callerHandle.agent.whenIdle();

  const tools = [];
  const events = new Map();
  registerBoard({
    registerTool(tool) { tools.push(tool); },
    events: { on(name, handler) { events.set(name, handler); } },
  }, {
    env: process.env,
    sessionContext: boundary,
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    async admitDelegate() {
      return {
        kind: "claimed", project: "proof", commonDir: `${config.cwd}/.git`,
        task: {
          id: "T-6315", title: "Native submission proof", status: "To Do",
          description: "Prove one approved native DSH runner submission.", implementationNotes: "Record submission without starting QA.",
        },
      };
    },
    async makeNote() {
      return { note: "Exact private native delegation proof note.", transcript: "Injected approved-gate proof.", qaBinding: { provider: "proof", model: "proof", effort: "high" } };
    },
    async withGlowTurn(_key, action) { return action(); },
    async awaitBriefGate() { return "approved"; },
  });
  events.get("qq:role-selected")?.({
    sessionId: config.architectSession, role: "architect", profile: "dsh-architect",
  });
  const delegate = tools.find((tool) => tool.name === "delegate");
  assert(delegate, "production delegate tool was not registered");
  const piContext = {
    cwd: config.cwd,
    signal: undefined,
    sessionManager: { getSessionId: () => config.architectSession },
  };
  const result = await ctx.agents.withInitiator(callerHandle.agent, () =>
    delegate.execute("native-proof", { id: "T-6315" }, undefined, undefined, piContext));
  assert(result.details?.status === "running", `delegate did not report a running native child: ${result.content?.[0]?.text}`);
  assert(typeof result.details.bootstrap_parent_session === "string", "delegate omitted bootstrap parent identity");
  assert(typeof result.details.runner_session === "string", "delegate omitted runner identity");
  const childContext = boundary.resolveSession(result.details.runner_session);
  let state = await readHandoff(childContext.runState);
  assert(state.runtime === "dsh" && state.status === "running", "native handoff is not running");
  assert(state.approval?.schema === DSH_RUN_APPROVAL_SCHEMA && state.approval.status === "approved" &&
    state.approval.runtime === "dsh" && state.approval.runId === state.id &&
    state.approval.taskId === state.task.id && state.approval.architectSession === state.architectSession,
    "approved gate record is absent or belongs to another run");
  assert(state.architectSession === config.architectSession && state.callerSession === config.architectSession, "caller identity changed");
  assert(state.bootstrapParentSession === result.details.bootstrap_parent_session, "bootstrap parent identity changed");
  assert(state.runnerSession === result.details.runner_session, "runner identity changed");
  assert(state.worktree !== config.cwd && state.worktree.startsWith(process.env.QQ_WORKTREE_ROOT), "runner did not receive only the isolated worktree");
  const inspection = await ctx.sessionPersistence.inspect(state.runnerSession);
  const accepted = inspection.events.find((event) => event.type === "user/message" && event.data?.id === state.bootstrapProof.messageId);
  assert(accepted && MARKER_LINE.test(textOf(accepted.data)), "exact durable bootstrap message and marker are absent");
  assert(/call done with ref HEAD/.test(textOf(accepted.data)) && !/do not call done/.test(textOf(accepted.data)), "native proof did not ask the child to submit through done");

  writeFileSync(join(state.worktree, "native-submission.txt"), "durable native submission\n");
  execFileSync("git", ["add", "native-submission.txt"], { cwd: state.worktree });
  execFileSync("git", ["-c", "user.name=qq-proof", "-c", "user.email=qq-proof.invalid", "commit", "-q", "-m", "native submission"], { cwd: state.worktree });
  const committedRef = execFileSync("git", ["rev-parse", "HEAD"], { cwd: state.worktree, encoding: "utf8" }).trim();
  const reviewTools = [];
  let reviewLaunches = 0;
  registerReviewFlow({
    registerTool(tool) { reviewTools.push(tool); },
    events: { on() {} },
    on() {},
  }, {
    env: process.env,
    sessionContext: boundary,
    exec: commandRun,
    launchReview() { reviewLaunches += 1; throw new Error("native submission started QA"); },
  });
  const done = reviewTools.find((tool) => tool.name === "done");
  assert(done, "production done tool was not registered");
  let hostStops = 0;
  const runner = ctx.agents.get(state.runnerSession);
  assert(runner, "exact native runner was not live at submission");
  const doneResult = await ctx.agents.withInitiator(runner, () => done.execute(
    "native-submission", { ref: "HEAD" }, undefined, undefined,
    {
      cwd: state.worktree,
      sessionManager: { getSessionId: () => state.runnerSession },
      shutdown() { hostStops += 1; },
      abort() { hostStops += 1; },
    },
  ));
  assert(doneResult.details?.status === "submitted", `done did not record native submission: ${doneResult.content?.[0]?.text}`);
  await new Promise((resolve) => setTimeout(resolve, 40));
  state = await readHandoff(childContext.runState);
  assert(state.status === "submitted" && state.look === 0, "native submission consumed QA or recorded the wrong state");
  assert(state.ref === committedRef, "native submission changed the committed ref");
  assert(state.submission?.schema === DSH_RUN_SUBMISSION_SCHEMA && state.submission.runtime === "dsh" && state.submission.awaiting === "native-review", "runtime-discriminated submission is absent");
  assert(state.submission.continuation.runnerSession === state.runnerSession && state.submission.continuation.worktree === state.worktree, "submission continuation identity changed");
  assert(reviewLaunches === 0, "native submission launched QA");
  assert(hostStops === 0, "native submission stopped the shared host");
  assert(ctx.agents.get(state.runnerSession) === runner, "native submission terminated the child");
  await callerHandle.dispose();
  emit({
    schema: SCHEMA,
    phase: "start",
    architect_session: state.architectSession,
    bootstrap_parent_session: state.bootstrapParentSession,
    runner_session: state.runnerSession,
    accepted_message_id: state.bootstrapProof.messageId,
    ref: state.ref,
    status: state.status,
    look: state.look,
    isolated_worktree: true,
    done_requested: true,
    approval_recorded: true,
    review_launched: false,
    host_stopped: false,
    child_live_after_submission: true,
  });
}

async function followup(ctx, config, boundary) {
  assert(typeof config.statePath === "string" && config.statePath.startsWith("/"), "fresh phase needs an absolute handoff path");
  const state = await readHandoff(config.statePath);
  assert(state.runtime === "dsh" && state.status === "submitted" && state.look === 0, "fresh host could not reconstruct the submitted handoff");
  assert(state.architectSession === config.architectSession && state.callerSession === config.architectSession, "fresh host changed caller identity");
  assert(!ctx.agents.get(state.runnerSession) && !ctx.sessions.get(state.runnerSession), "runner was not cold in the fresh host");
  await verifyDshPromptAcceptance({
    agents: ctx.agents,
    sessions: ctx.sessions,
    persistence: ctx.sessionPersistence,
  }, {
    childId: state.runnerSession,
    parentId: state.bootstrapParentSession,
    worktree: state.worktree,
    messageId: state.bootstrapProof.messageId,
    marker: state.bootstrapProof.marker,
  });
  const childInspection = await ctx.sessionPersistence.inspect(state.runnerSession);
  const exactMessages = childInspection.events.filter(
    (event) => event.type === "user/message" && event.data?.id === state.bootstrapProof.messageId &&
      textOf(event.data).split(/\r?\n/).includes(state.bootstrapProof.marker),
  );
  assert(exactMessages.length === 1, "fresh host observed duplicate or missing bootstrap injection");
  const parentBefore = boundary.resolveSession(state.bootstrapParentSession);
  const childContext = boundary.resolveSession(state.runnerSession);
  assert(parentBefore.source === "dsh-session" && parentBefore.role === "runner" && parentBefore.runState === null, "bootstrap parent context was not reconstructed");
  assert(childContext.source === "dsh-session" && childContext.role === "runner" && childContext.runState === config.statePath, "runner context was not reconstructed");
  assert(state.submission?.schema === DSH_RUN_SUBMISSION_SCHEMA && state.submission.runtime === "dsh" && state.submission.awaiting === "native-review", "fresh host lost the native submission");
  assert(state.submission.ref === state.ref && state.submission.continuation.architectSession === state.architectSession &&
    state.submission.continuation.bootstrapParentSession === state.bootstrapParentSession &&
    state.submission.continuation.runnerSession === state.runnerSession &&
    state.submission.continuation.runState === config.statePath &&
    state.submission.continuation.worktree === state.worktree, "fresh host changed the continuation handoff");
  assert(execFileSync("git", ["rev-parse", "--verify", `${state.ref}^{commit}`], { cwd: state.worktree, encoding: "utf8" }).trim() === state.ref, "submitted ref is not shared by the worktree");
  assert(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: state.worktree, encoding: "utf8" }).trim() === "", "submitted worktree is not clean");
  const selection = ctx.agentDefaultModel.currentSelection();
  const parentHandle = await ctx.agents.resume({
    resumeSessionId: state.bootstrapParentSession,
    agentOptions: { provider: selection.provider, model: selection.model },
    setup(agentCtx) { installSelection(agentCtx, selection); },
  });
  await parentHandle.agent.whenIdle();
  assert(parentHandle.agent.session.id === state.bootstrapParentSession, "fresh host resumed a different bootstrap parent");
  await parentHandle.dispose();
  emit({
    schema: SCHEMA,
    phase: "fresh",
    architect_session: state.architectSession,
    bootstrap_parent_session: state.bootstrapParentSession,
    runner_session: state.runnerSession,
    accepted_message_id: state.bootstrapProof.messageId,
    ref: state.ref,
    status: state.status,
    look: state.look,
    awaiting: state.submission.awaiting,
    bootstrap_injections: exactMessages.length,
    parent_resumed: true,
    child_cold: true,
    context_reconstructed: true,
    clean_shared_ref_reconstructed: true,
  });
}

async function run(ctx, config, exit) {
  await ctx.get("loader")?.await();
  assert(config.phase === "start" || config.phase === "fresh", "phase must be start or fresh");
  assert(/^session-[0-9a-f-]{36}$/.test(config.architectSession), "architect identity must be canonical");
  assert(typeof config.cwd === "string" && config.cwd.startsWith("/"), "cwd must be absolute");
  const boundary = createQqSessionContext({
    env: process.env,
    activeDshSession: () => ctx.agents.currentInitiator()?.session.id,
  });
  if (config.phase === "start") await start(ctx, config, boundary);
  else await followup(ctx, config, boundary);
  exit(0);
}

export function apply(ctx, config) {
  const exit = ctx.get("appExit");
  if (!exit) throw new Error("qq-dsh-native-delegation-proof: appExit is unavailable");
  run(ctx, config, exit).catch((error) => {
    process.stderr.write(`${error?.stack ?? String(error)}\n`);
    exit(1);
  });
}
