import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/workshop.mjs")));
const extension = await import(pathToFileURL(join(root, "extensions/workshop.ts")));

assert.equal(lib.taskSlug("TASK-1"), "task-1");
assert.equal(lib.taskSlug("A-71.12"), "a-71-12");
assert.throws(() => lib.taskSlug("bad task"), /TASK-1/);
assert.equal(lib.parseHerdr(JSON.stringify({ result: { pane: { pane_id: "w2T:p9" } } })).pane.pane_id, "w2T:p9");

const scratch = await mkdtemp(join(homedir(), "qq-workshop-test."));
try {
  const calls = [];
  const env = { HOME: scratch, XDG_STATE_HOME: join(scratch, "state"), QQ_WORKTREE_ROOT: join(scratch, "worktrees"), HERDR_WORKSPACE_ID: "w2T" };
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: "/repo\n", stderr: "" };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123\n", stderr: "" };
    if (command === "git" && args[0] === "symbolic-ref") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "list") return { code: 0, stdout: JSON.stringify({ result: { tabs: [] } }), stderr: "" };
    if (command === "herdr" && args[0] === "tab" && args[1] === "create") return { code: 0, stdout: JSON.stringify({ result: { root_pane: { pane_id: "w2T:p9" }, tab: { tab_id: "w2T:t9" } } }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const state = await lib.spawnWorkshop({
    run, cwd: "/repo", env, project: "qq", architectSession: "019ff7ad-2cba-75a9-adc2-c15a0a92d6a9",
    task: { id: "TASK-1", title: "One task" }, brief: "Keep this brief.",
    qaBinding: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });
  assert.equal(state.pane, "w2T:p9");
  assert.equal(state.status, "running");
  assert.match(state.branch, /^qq\/task-1-/);
  assert.equal((await readFile(state.briefPath, "utf8")).trim(), "Keep this brief.");
  assert.equal(JSON.parse(await readFile(state.statePath, "utf8")).status, "running");
  const create = calls.find(({ command, args }) => command === "herdr" && args[0] === "tab" && args[1] === "create");
  assert.ok(create.args.includes("QQ_AGENT_ROLE=runner"));
  assert.ok(create.args.some((arg) => arg.startsWith("QQ_WORKSHOP_STATE=")));
  const start = calls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "start");
  assert.deepEqual(start.args.slice(0, 2), ["agent", "start"]);
  const prompt = calls.find(({ command, args }) => command === "herdr" && args[0] === "agent" && args[1] === "prompt");
  assert.match(prompt.args[3], /call done with ref HEAD/);

  const registrations = [];
  const events = new Map();
  const pi = {
    registerTool(tool) { registrations.push(tool); },
    events: { on(name, fn) { events.set(name, fn); } },
    exec: run,
  };
  extension.default(pi, { env });
  assert.deepEqual(registrations.map(({ name }) => name), ["sketch", "note", "delegate"]);
  const delegate = registrations.find(({ name }) => name === "delegate");
  const runnerRefusal = await delegate.execute("x", { id: "TASK-1" }, undefined, undefined, {});
  assert.match(runnerRefusal.content[0].text, /architect session/);
  events.get("qq:role-selected")({ role: "architect" });
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-workshop: pass");
