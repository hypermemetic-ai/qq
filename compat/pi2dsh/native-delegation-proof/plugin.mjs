import registerBoard from "../../../extensions/board.ts";
import { verifyDshPromptAcceptance } from "../../../bin/lib/dsh-run.mjs";
import { readHandoff } from "../../../bin/lib/run.mjs";
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
          id: "T-6314", title: "Native delegation proof", status: "To Do",
          description: "Prove one approved native DSH runner launch.", implementationNotes: "Do not call done.",
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
    delegate.execute("native-proof", { id: "T-6314" }, undefined, undefined, piContext));
  assert(result.details?.status === "running", `delegate did not report a running native child: ${result.content?.[0]?.text}`);
  assert(typeof result.details.bootstrap_parent_session === "string", "delegate omitted bootstrap parent identity");
  assert(typeof result.details.runner_session === "string", "delegate omitted runner identity");
  const childContext = boundary.resolveSession(result.details.runner_session);
  const state = await readHandoff(childContext.runState);
  assert(state.runtime === "dsh" && state.status === "running", "native handoff is not running");
  assert(state.architectSession === config.architectSession && state.callerSession === config.architectSession, "caller identity changed");
  assert(state.bootstrapParentSession === result.details.bootstrap_parent_session, "bootstrap parent identity changed");
  assert(state.runnerSession === result.details.runner_session, "runner identity changed");
  assert(state.worktree !== config.cwd && state.worktree.startsWith(process.env.QQ_WORKTREE_ROOT), "runner did not receive only the isolated worktree");
  const inspection = await ctx.sessionPersistence.inspect(state.runnerSession);
  const accepted = inspection.events.find((event) => event.type === "user/message" && event.data?.id === state.bootstrapProof.messageId);
  assert(accepted && MARKER_LINE.test(textOf(accepted.data)), "exact durable bootstrap message and marker are absent");
  assert(!/call done with ref HEAD/.test(textOf(accepted.data)) && /do not call done/.test(textOf(accepted.data)), "native proof asked the child to use unwired done");
  await callerHandle.dispose();
  emit({
    schema: SCHEMA,
    phase: "start",
    architect_session: state.architectSession,
    bootstrap_parent_session: state.bootstrapParentSession,
    runner_session: state.runnerSession,
    accepted_message_id: state.bootstrapProof.messageId,
    status: state.status,
    isolated_worktree: true,
    done_requested: false,
  });
}

async function followup(ctx, config, boundary) {
  assert(typeof config.statePath === "string" && config.statePath.startsWith("/"), "fresh phase needs an absolute handoff path");
  const state = await readHandoff(config.statePath);
  assert(state.runtime === "dsh" && state.status === "running", "fresh host could not reconstruct the running handoff");
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
    status: state.status,
    bootstrap_injections: exactMessages.length,
    parent_resumed: true,
    child_cold: true,
    context_reconstructed: true,
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
