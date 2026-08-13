import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const module = await import(pathToFileURL(join(root, "extensions/operator-stage.ts")));

assert.equal(module.parsePaneId(JSON.stringify({ result: { pane_id: "wM:p4Q" } })), "wM:p4Q");
assert.equal(module.parsePaneId("created wM:p9Z"), "wM:p9Z");
assert.equal(module.stagedLine("printf ok", "low"), "{ printf ok; } && exit");
assert.equal(
  module.stagedLine("rm -rf build-output", "high"),
  `read -n1 -r -p 'HIGH DANGER — press y to run: ' __qq_c; [ "$__qq_c" = y ] && { rm -rf build-output; } && exit`,
);

function harness(options = {}) {
  const registrations = [];
  const calls = [];
  const pi = { registerTool(tool) { registrations.push(tool); } };
  const exec = async (executable, args, execOptions) => {
    const call = { executable, args, options: execOptions };
    calls.push(call);
    if (options.execReply) return options.execReply(call);
    if (executable === "qq-herdr-pane-add") return { code: 0, stdout: JSON.stringify({ result: { pane_id: "wM:p4Q" } }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  module.default(pi, { exec, env: options.env ?? { HERDR_PANE_ID: "source-pane" } });
  assert.equal(registrations.length, 1);
  return { tool: registrations[0], calls };
}

function operations(calls) {
  return calls.map(({ executable, args }) => executable === "qq-herdr-pane-add" ? "split" : args[1]);
}

const registered = harness();
assert.equal(registered.tool.name, "operator_stage");
assert.match(registered.tool.description, /no-focus Herdr pane/);
assert.deepEqual(registered.tool.parameters.required, ["command", "description", "danger"]);

const low = harness();
const lowOutcome = await low.tool.execute("low", { command: "printf ok", description: "verify release", danger: "low" });
assert.deepEqual(operations(low.calls), ["split", "rename", "wait-output", "send-text", "show"]);
assert.equal(low.calls[0].executable, "qq-herdr-pane-add");
assert.deepEqual(low.calls[0].args, ["--current", "--cwd", process.cwd(), "--no-focus"]);
assert.equal(low.calls.some(({ args }) => args.includes("--focus")), false);
assert.deepEqual(low.calls[3].args, ["pane", "send-text", "wM:p4Q", module.stagedLine("printf ok", "low")]);
assert.equal(low.calls.some(({ args }) => args[1] === "send-keys"), false);
assert.equal(lowOutcome.details.pane_id, "wM:p4Q");
assert.match(lowOutcome.content[0].text, /press Enter once/);
assert.match(lowOutcome.content[0].text, /agent never sends keys/i);

const high = harness();
const highOutcome = await high.tool.execute("high", { command: "rm -rf build-output", description: "remove owner's output", danger: "high" });
assert.equal(high.calls[3].args[3], module.stagedLine("rm -rf build-output", "high"));
assert.match(highOutcome.content[0].text, /press Enter, then press y/);

for (const testCase of [
  { name: "newline", env: { HERDR_PANE_ID: "source-pane" }, params: { command: "printf first\nprintf second", description: "two lines", danger: "low" }, message: /newline/ },
  { name: "danger", env: { HERDR_PANE_ID: "source-pane" }, params: { command: "printf ok", description: "bad danger", danger: "medium" }, message: /danger must be low or high/ },
  { name: "missing herdr", env: {}, params: { command: "printf ok", description: "no pane", danger: "low" }, message: /requires a herdr session/ },
  { name: "blank herdr", env: { HERDR_PANE_ID: "   " }, params: { command: "printf ok", description: "blank pane", danger: "low" }, message: /requires a herdr session/ },
]) {
  const h = harness({ env: testCase.env });
  const outcome = await h.tool.execute(testCase.name, testCase.params);
  assert.match(outcome.content[0].text, testCase.message);
  assert.equal(h.calls.length, 0, `${testCase.name} refusal ran herdr`);
}

const sendFail = harness({
  execReply(call) {
    if (call.executable === "qq-herdr-pane-add") return { code: 0, stdout: "created wM:p9Z", stderr: "" };
    if (call.args[1] === "send-text") return { code: 1, stdout: "", stderr: "send denied" };
    return { code: 0, stdout: "", stderr: "" };
  },
});
const sendOutcome = await sendFail.tool.execute("send-failure", { command: "printf ok", description: "send failure", danger: "low" });
assert.match(sendOutcome.content[0].text, /send denied/);
assert.doesNotMatch(sendOutcome.content[0].text, /orphaned/);
assert.deepEqual(operations(sendFail.calls), ["split", "rename", "wait-output", "send-text", "close"]);

const notifyFail = harness({
  execReply(call) {
    if (call.executable === "qq-herdr-pane-add") return { code: 0, stdout: "created wM:p6N", stderr: "" };
    if (call.args[0] === "notification") return { code: 1, stdout: "", stderr: "notifications unavailable" };
    return { code: 0, stdout: "", stderr: "" };
  },
});
const notifyOutcome = await notifyFail.tool.execute("notify-failure", { command: "printf ok", description: "notify failure", danger: "low" });
assert.match(notifyOutcome.content[0].text, /could not notify the operator/);
assert.deepEqual(operations(notifyFail.calls), ["split", "rename", "wait-output", "send-text", "show", "close"]);

const orphan = harness({
  execReply(call) {
    if (call.executable === "qq-herdr-pane-add") return { code: 0, stdout: "created wM:p7T", stderr: "" };
    if (call.args[1] === "send-text") return { code: 1, stdout: "", stderr: "send denied" };
    if (call.args[1] === "close") return { code: 1, stdout: "", stderr: "close denied" };
    return { code: 0, stdout: "", stderr: "" };
  },
});
const orphanOutcome = await orphan.tool.execute("close-failure", { command: "printf ok", description: "close failure", danger: "low" });
assert.match(orphanOutcome.content[0].text, /orphaned/);
assert.equal(orphanOutcome.details.teardown, "close-failed: close denied");
assert.deepEqual(operations(orphan.calls), ["split", "rename", "wait-output", "send-text", "close"]);

console.log("test-operator-stage: pass");
