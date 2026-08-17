import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const contextLib = await import(pathToFileURL(join(root, "bin/lib/session-context.mjs")));
const profilesExtension = await import(pathToFileURL(join(root, "extensions/execution-profiles.ts")));
const boardExtension = await import(pathToFileURL(join(root, "extensions/board.ts")));
const reviewExtension = await import(pathToFileURL(join(root, "extensions/review-flow.ts")));
const extensionEntrypoint = await readFile(join(root, "extensions/index.ts"), "utf8");

// Pi commonly loads qq through ~/.pi/agent/extensions/qq -> <repo>/extensions.
// A direct ../bin import from that entrypoint resolves outside the symlink
// target before Pi can canonicalize extension-local modules.
assert.doesNotMatch(extensionEntrypoint, /from ["']\.\.\/bin\/lib\/session-context\.mjs["']/);
assert.equal(profilesExtension.createQqSessionContext, contextLib.createQqSessionContext);

const parentId = "session-4b70f906-ce0a-4135-bc9e-b231db9b98b1";
// Continuable children use DSH's canonical bare-v4 SessionId form, while the
// top-level host identity is session-<v4>.
const childId = "621eeb4e-3796-4d58-92d2-9a45e4f133b0";
const exclusiveId = "c24ee08f-0824-4dfa-b123-d2f04bcec9d7";
const piId = "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9";
const temporary = await mkdtemp(join(homedir(), "qq-session-context-test."));

function hostContext(sessionId, extra = {}) {
  return {
    cwd: root,
    sessionManager: { getSessionId: () => sessionId },
    ...extra,
  };
}

try {
  const stateHome = join(temporary, "state");
  const inheritedRunState = join(temporary, "inherited-handoff.json");
  const childRunState = join(temporary, "child-handoff.json");
  const env = {
    HOME: temporary,
    XDG_STATE_HOME: stateHome,
    QQ_AGENT_ROLE: "runner",
    QQ_RUN_STATE: inheritedRunState,
  };

  // A plain Pi identity keeps the historical process environment and role-event
  // behavior and creates no DSH ownership file.
  const boundary = contextLib.createQqSessionContext({ env });
  assert.deepEqual(boundary.resolve(hostContext(piId)), {
    role: "runner",
    runState: inheritedRunState,
    source: "pi-environment",
  });
  boundary.observeSelection({ role: "architect", profile: "pi-architect" });
  assert.deepEqual(boundary.resolve(hostContext(piId)), {
    role: "architect",
    profile: "pi-architect",
    runState: inheritedRunState,
    source: "pi-environment",
  });
  boundary.resetFallback();

  boundary.claim(parentId, {
    role: "architect",
    profile: "dsh-architect",
    runState: null,
  });
  const exclusiveContext = { role: "runner", profile: "dsh-runner", runState: childRunState };
  boundary.claimExclusive(exclusiveId, exclusiveContext);
  assert.throws(() => boundary.claimExclusive(exclusiveId, exclusiveContext), /already claimed/);
  assert.throws(() => boundary.release(exclusiveId, { ...exclusiveContext, profile: "wrong" }), /changed before release/);
  assert.equal(boundary.release(exclusiveId, exclusiveContext), true);
  assert.equal(boundary.release(exclusiveId, exclusiveContext), false);
  boundary.claim(childId, {
    role: "runner",
    profile: "dsh-runner",
    runState: childRunState,
  });
  assert.deepEqual(boundary.resolve(hostContext(parentId)), {
    schema: contextLib.QQ_SESSION_CONTEXT_SCHEMA,
    sessionId: parentId,
    role: "architect",
    profile: "dsh-architect",
    runState: null,
    source: "dsh-session",
  });
  assert.deepEqual(boundary.resolve(hostContext(childId)), {
    schema: contextLib.QQ_SESSION_CONTEXT_SCHEMA,
    sessionId: childId,
    role: "runner",
    profile: "dsh-runner",
    runState: childRunState,
    source: "dsh-session",
  });
  assert.equal((await stat(join(stateHome, "qq", "session-contexts"))).mode & 0o777, 0o700);
  assert.equal((await stat(boundary.contextPath(parentId))).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(boundary.contextPath(childId), "utf8")), {
    schema: contextLib.QQ_SESSION_CONTEXT_SCHEMA,
    sessionId: childId,
    role: "runner",
    profile: "dsh-runner",
    runState: childRunState,
  });
  assert.throws(() => boundary.claim(childId, {
    role: "runner", profile: "dsh-runner", runState: "relative.json",
  }), /absolute path or null/);

  // A new boundary instance is the continuation proof: ownership comes from
  // the private session record, not process memory or the inherited Pi env.
  const resumedBoundary = contextLib.createQqSessionContext({
    env: { ...env, QQ_AGENT_ROLE: "architect", QQ_RUN_STATE: inheritedRunState },
  });
  assert.equal(resumedBoundary.resolve(hostContext(childId)).role, "runner");
  assert.equal(resumedBoundary.resolve(hostContext(childId)).profile, "dsh-runner");
  assert.equal(resumedBoundary.resolve(hostContext(childId)).runState, childRunState);
  assert.equal(resumedBoundary.resolve(hostContext(childId)).source, "dsh-session");

  // Execution-profile prompt selection resolves the host session on every turn;
  // a child cannot inherit the most recently started parent's role.
  const policyPath = join(temporary, "execution-profiles.json");
  const binding = { provider: "proof", model: "local", effort: "high" };
  await writeFile(policyPath, `${JSON.stringify({
    schema: "qq.execution-profiles/v1",
    contextWindowCeiling: 200000,
    roles: {
      runner: { default: "dsh-runner", profiles: { "dsh-runner": binding } },
      architect: { default: "dsh-architect", profiles: { "dsh-architect": binding } },
    },
    scribe: binding,
    qa: binding,
    openwiki: binding,
  })}\n`, { mode: 0o600 });
  const profileHandlers = new Map();
  let effort = "off";
  const profilePi = {
    registerCommand() {},
    on(name, handler) { profileHandlers.set(name, handler); },
    async setModel() { return true; },
    setThinkingLevel(value) { effort = value; },
    getThinkingLevel() { return effort; },
    events: { emit() {} },
  };
  const model = { provider: "proof", id: "local", contextWindow: 100000 };
  const ui = { setStatus() {}, notify() {} };
  const parentCtx = hostContext(parentId, { model, modelRegistry: { find: () => model }, ui });
  const childCtx = hostContext(childId, { model, modelRegistry: { find: () => model }, ui });
  profilesExtension.default(profilePi, { env, policyPath, sessionContext: resumedBoundary });
  await profileHandlers.get("session_start")({}, parentCtx);
  const promptOptions = { selectedTools: [], toolSnippets: {}, cwd: root };
  const parentPrompt = await profileHandlers.get("before_agent_start")({ systemPromptOptions: promptOptions }, parentCtx);
  const childPrompt = await profileHandlers.get("before_agent_start")({ systemPromptOptions: promptOptions }, childCtx);
  assert.match(parentPrompt.systemPrompt, /^This session's qq role is architect\./);
  assert.match(childPrompt.systemPrompt, /^This session's qq role is runner\./);
  await profileHandlers.get("session_shutdown")({}, parentCtx);

  // Architect tools and done resolve the same per-session boundary. The process
  // env intentionally says runner with a different run-state path.
  const boardTools = [];
  const boardEvents = new Map();
  const boardCalls = [];
  boardExtension.default({
    registerTool(tool) { boardTools.push(tool); },
    events: { on(name, handler) { boardEvents.set(name, handler); } },
  }, {
    env,
    sessionContext: resumedBoundary,
    async exec(_command, args) {
      boardCalls.push(args);
      return { code: 0, stdout: "Created Task T-1", stderr: "" };
    },
  });
  const sketch = boardTools.find((tool) => tool.name === "sketch");
  const sketched = await sketch.execute("parent", { title: "DSH parent" }, undefined, undefined, parentCtx);
  assert.match(sketched.content[0].text, /Sketched T-1/);
  const childSketch = await sketch.execute("child", { title: "DSH child" }, undefined, undefined, childCtx);
  assert.match(childSketch.content[0].text, /architect session/);
  assert.equal(boardCalls.length, 1);

  const reviewTools = [];
  let preparedPath;
  let launchedPath;
  reviewExtension.default({
    registerTool(tool) { reviewTools.push(tool); },
    events: { on() {} },
    on() {},
  }, {
    env,
    sessionContext: resumedBoundary,
    async prepareDone(_run, _cwd, statePath) {
      preparedPath = statePath;
      return { task: { id: "T-1" }, look: 1 };
    },
    launchReview(statePath) { launchedPath = statePath; return 42; },
  });
  const done = reviewTools.find((tool) => tool.name === "done");
  const parentDone = await done.execute("parent", { ref: "HEAD" }, undefined, undefined, parentCtx);
  assert.equal(parentDone.details.status, "refused");
  const childDone = await done.execute("child", { ref: "HEAD" }, undefined, undefined, {
    ...childCtx,
    shutdown() {},
  });
  assert.equal(childDone.details.status, "reviewing");
  assert.equal(preparedPath, childRunState);
  assert.equal(launchedPath, childRunState);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("test-session-context: pass");
