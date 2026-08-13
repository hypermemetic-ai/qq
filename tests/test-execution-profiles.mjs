import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/execution-profiles.mjs")));
const roles = await import(pathToFileURL(join(root, "bin/lib/roles.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/execution-profiles.ts")));

function policy(defaultProfile = "grok-high") {
  return {
    schema: "qq.execution-profiles/v1",
    contextWindowCeiling: 200000,
    compactor: { provider: "xai", model: "grok-4.6", effort: "high" },
    roles: {
      runner: {
        default: defaultProfile,
        profiles: {
          "grok-high": { provider: "xai", model: "grok-4.6", effort: "high" },
          "qwen-deepseek-max": { provider: "qwen-token-plan", model: "deepseek-v4-flash-0731", effort: "max" },
          "sol-high": { provider: "openai-codex", model: "gpt-5.6-sol", effort: "high" },
        },
      },
      architect: {
        default: "grok-high",
        profiles: {
          "grok-high": { provider: "xai", model: "grok-4.6", effort: "high" },
        },
      },
    },
  };
}

assert.deepEqual(roles.ROLE_NAMES, ["runner", "architect"]);
assert.equal(roles.validateRole("runner"), "runner");
assert.equal(roles.validateRole("architect"), "architect");
assert.throws(() => roles.validateRole("observer"), /unknown qq role/);
assert.equal(lib.validateExecutionPolicy(policy()).roles.runner.default, "grok-high");
assert.deepEqual(lib.validateExecutionPolicy(policy()).compactor, { provider: "xai", model: "grok-4.6", effort: "high" });
assert.throws(() => lib.validateExecutionPolicy({ ...policy(), contextWindowCeiling: 262144 }), /200000/);
const { compactor: _ignored, ...withoutCompactor } = policy();
assert.throws(() => lib.validateExecutionPolicy(withoutCompactor), /invalid top-level shape/);
assert.throws(() => lib.validateExecutionPolicy({ ...policy(), roles: { ...policy().roles, observer: policy().roles.runner } }), /exactly: runner, architect/);
assert.throws(() => lib.validateExecutionPolicy({ ...policy(), roles: { runner: policy().roles.runner, architect: policy().roles.architect, compactor: policy().roles.runner } }), /exactly: runner, architect/);
assert.throws(() => lib.validateExecutionPolicy({ ...policy(), roles: { ...policy().roles, runner: { ...policy().roles.runner, default: "missing" } } }), /does not name/);
assert.equal(lib.parseTokenCount("200K"), 200000);
assert.equal(lib.parseTokenCount("1M"), 1_000_000);
const parsed = lib.parseModelList("provider model context max-out thinking images\nopenai-codex gpt-5.6-sol 272K 128K yes yes\n");
assert.equal(parsed.get("openai-codex\0gpt-5.6-sol").contextWindow, 272000);

const temporary = await mkdtemp(join(homedir(), "qq-profiles-test."));
try {
  await chmod(temporary, 0o700);
  const policyPath = join(temporary, "config", "qq", "execution-profiles.json");
  await lib.writeExecutionPolicy(policy(), policyPath);
  assert.equal((await stat(policyPath)).mode & 0o777, 0o600);
  assert.equal((await lib.readExecutionPolicy(policyPath)).roles.runner.default, "grok-high");
  assert.deepEqual(await lib.updateRoleDefault("runner", "qwen-deepseek-max", policyPath), { previous: "grok-high", current: "qwen-deepseek-max" });
  assert.equal((await lib.readExecutionPolicy(policyPath)).roles.runner.default, "qwen-deepseek-max");
  await lib.writeExecutionPolicy(policy(), policyPath);

  const modelsPath = join(temporary, "agent", "models.json");
  await mkdir(join(temporary, "agent"), { recursive: true, mode: 0o700 });
  await writeFile(modelsPath, JSON.stringify({ providers: { unrelated: { baseUrl: "https://example.invalid" } } }), { mode: 0o600 });
  const models = new Map([
    ["xai\0grok-4.6", { contextWindow: 500000 }],
    ["qwen-token-plan\0deepseek-v4-flash-0731", { contextWindow: 1_000_000 }],
    ["openai-codex\0gpt-5.6-sol", { contextWindow: 272000 }],
  ]);
  assert.deepEqual(await lib.installContextCeiling(lib.validateExecutionPolicy(policy()), models, modelsPath), ["xai/grok-4.6", "qwen-token-plan/deepseek-v4-flash-0731", "openai-codex/gpt-5.6-sol"]);
  const modelsDocument = JSON.parse(await readFile(modelsPath, "utf8"));
  assert.equal(modelsDocument.providers.xai.modelOverrides["grok-4.6"].contextWindow, 200000);
  assert.equal(modelsDocument.providers["qwen-token-plan"].modelOverrides["deepseek-v4-flash-0731"].contextWindow, 200000);
  assert.equal(modelsDocument.providers["openai-codex"].modelOverrides["gpt-5.6-sol"].contextWindow, 200000);
  assert.equal(modelsDocument.providers.unrelated.baseUrl, "https://example.invalid");

  const modelObjects = new Map([
    ["xai/grok-4.6", { provider: "xai", id: "grok-4.6", contextWindow: 200000 }],
    ["qwen-token-plan/deepseek-v4-flash-0731", { provider: "qwen-token-plan", id: "deepseek-v4-flash-0731", contextWindow: 200000 }],
    ["openai-codex/gpt-5.6-sol", { provider: "openai-codex", id: "gpt-5.6-sol", contextWindow: 200000 }],
  ]);
  const handlers = new Map();
  let currentModel;
  let effort = "off";
  const notifications = [];
  const statuses = [];
  const roleSelections = [];
  const pi = {
    registerCommand(name, command) { this.command = { name, ...command }; },
    on(name, handler) { handlers.set(name, handler); },
    async setModel(model) { currentModel = model; return true; },
    setThinkingLevel(value) { effort = value; },
    getThinkingLevel() { return effort; },
    events: {
      emit(name, value) { if (name === "qq:role-selected") roleSelections.push(value); },
    },
  };
  const ctx = {
    cwd: root,
    get model() { return currentModel; },
    modelRegistry: { find(provider, model) { return modelObjects.get(`${provider}/${model}`); } },
    sessionManager: { getSessionId: () => "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9" },
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
      setStatus(key, value) { statuses.push({ key, value }); },
      async select() { return "sol-high — openai-codex/gpt-5.6-sol · high"; },
    },
  };
  extension.default(pi, { policyPath, env: { ...process.env, XDG_STATE_HOME: join(temporary, "state") } });
  await handlers.get("session_start")({ reason: "startup" }, ctx);
  assert.equal(currentModel.id, "grok-4.6");
  assert.equal(currentModel.provider, "xai");
  assert.equal(effort, "high");
  await pi.command.handler("runner qwen-deepseek-max", ctx);
  assert.equal(currentModel.id, "deepseek-v4-flash-0731");
  assert.equal(effort, "max");
  assert.equal((await lib.readExecutionPolicy(policyPath)).roles.runner.default, "grok-high", "session switch persisted the default");
  const promptOptions = {
    selectedTools: ["read", "edit"],
    toolSnippets: { read: "Read file contents", edit: "Make precise file edits" },
    promptGuidelines: ["Use read to examine files instead of cat or sed."],
    cwd: "/tmp/qq",
  };
  let prompt = await handlers.get("before_agent_start")({ systemPrompt: "You are an expert coding assistant operating inside pi", systemPromptOptions: promptOptions }, ctx);
  assert.match(prompt.systemPrompt, /^This session's qq role is runner\./);
  assert.match(prompt.systemPrompt, /Do the least that settles it\. Extra work only to prevent more work\./);
  assert.match(prompt.systemPrompt, /Available tools:/);
  assert.doesNotMatch(prompt.systemPrompt, /You are an expert coding assistant/);
  await pi.command.handler("runner sol-high", ctx);
  assert.equal(currentModel.id, "gpt-5.6-sol");
  assert.equal(effort, "high");
  await pi.command.handler("architect", ctx);
  assert.equal(currentModel.id, "grok-4.6");
  assert.equal(effort, "high");
  prompt = await handlers.get("before_agent_start")({ systemPrompt: "You are an expert coding assistant operating inside pi", systemPromptOptions: promptOptions }, ctx);
  assert.match(prompt.systemPrompt, /^This session's qq role is architect\./);
  assert.match(prompt.systemPrompt, /Do the least that settles it\. Extra work only to prevent more work\./);
  assert.doesNotMatch(prompt.systemPrompt, /You are an expert coding assistant/);
  assert.deepEqual(roleSelections.at(-1), { role: "architect", profile: "grok-high" });
  assert.ok(notifications.some(({ message }) => message.includes("qwen-deepseek-max")));
  assert.ok(notifications.some(({ message }) => message.includes("sol-high")));
  await handlers.get("session_shutdown")({ reason: "quit" }, ctx);

  modelObjects.get("openai-codex/gpt-5.6-sol").contextWindow = 272000;
  extension.default(pi, { policyPath, env: { ...process.env, XDG_STATE_HOME: join(temporary, "state-2") } });
  await handlers.get("session_start")({ reason: "startup" }, ctx);
  assert.deepEqual(await handlers.get("input")({}, ctx), { action: "handled" });
  assert.ok(notifications.some(({ message }) => message.includes("context cap")));
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("test-execution-profiles: pass");
