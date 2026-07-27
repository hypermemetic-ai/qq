#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-operator-stage-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-operator-stage.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

module="$TMP/qq-operator-stage.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));

function setHerdrPane(value) {
  if (value === undefined) delete process.env.HERDR_PANE_ID;
  else process.env.HERDR_PANE_ID = value;
}

function createHarness(options = {}) {
  const registrations = [];
  const listeners = [];
  const execCalls = [];
  const currentInputByPane = new Map();
  const historicalOutput = "shell initialized\n";
  let listenerCalls = 0;
  const pi = {
    registerTool(tool) {
      registrations.push(tool);
    },
    on(eventName, handler) {
      listeners.push({ eventName, handler });
    },
  };
  const exec = async (executable, args, execOptions) => {
    const call = { executable, args, options: execOptions };
    execCalls.push(call);
    if (options.execReply) {
      return options.execReply(call, execCalls);
    }
    if (args[1] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { pane_id: "wM:p4Q" } }),
        stderr: "",
      };
    }
    if (args[1] === "send-text") {
      currentInputByPane.set(args[2], args[3]);
    }
    if (args[1] === "wait-output") {
      const [,, paneId, ...waitOptions] = args;
      const sourceIndex = waitOptions.indexOf("--source");
      const matchIndex = waitOptions.indexOf("--match");
      const source = waitOptions[sourceIndex + 1];
      const match = waitOptions[matchIndex + 1];
      const snapshot =
        historicalOutput +
        (source === "recent-unwrapped" ? currentInputByPane.get(paneId) ?? "" : "");
      return {
        code: snapshot.includes(match) ? 0 : 1,
        stdout: "",
        stderr: "",
      };
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  register(pi, { exec });
  assert.equal(registrations.length, 1, "extension must register exactly one tool");
  return {
    tool: registrations[0],
    execCalls,
    listenerNames: listeners.map(({ eventName }) => eventName),
    get listenerCalls() {
      return listenerCalls;
    },
    async toolCall(event) {
      listenerCalls += 1;
      return listeners[0]?.handler(event, {});
    },
  };
}

function operationNames(execCalls) {
  return execCalls.map(({ args }) => args[1]);
}

function assertErrorResult(outcome) {
  assert.equal(outcome.content.length, 1);
  assert.equal(outcome.content[0].type, "text");
  assert.equal(typeof outcome.content[0].text, "string");
  assert.notEqual(outcome.content[0].text, "");
  assert.equal(outcome.details.message, outcome.content[0].text);
}

async function testRegistrationAndLowDanger() {
  setHerdrPane("source-pane");
  const h = createHarness();
  assert.equal(h.tool.name, "operator_stage");
  assert.deepEqual(h.listenerNames, ["tool_call"]);
  assert.equal(h.tool.label, "Operator Stage");
  assert.equal(typeof h.tool.description, "string");
  assert.match(h.tool.description, /no-focus guarded herdr pane/i);
  assert.match(h.tool.description, /request notification/i);
  assert.doesNotMatch(h.tool.description, /focused guarded/i);
  assert.deepEqual(h.tool.parameters, {
    type: "object",
    properties: {
      command: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      danger: { type: "string", enum: ["low", "high"] },
    },
    required: ["command", "description", "danger"],
    additionalProperties: false,
  });
  assert.equal(typeof h.tool.prepareArguments, "function");
  assert.equal(typeof h.tool.execute, "function");

  const outcome = await h.tool.execute(
    "call-low",
    { command: "printf ok", description: "verify release", danger: "low" },
    undefined,
  );

  assert.deepEqual(
    operationNames(h.execCalls),
    ["split", "rename", "send-text", "wait-output", "show"],
  );
  assert.deepEqual(h.execCalls[0].args, [
    "pane",
    "split",
    "--current",
    "--direction",
    "right",
    "--cwd",
    process.cwd(),
    "--no-focus",
  ]);
  assert.equal(
    h.execCalls.some(({ args }) => args.includes("--focus")),
    false,
    "operator_stage attempted to focus a Herdr surface",
  );
  assert.deepEqual(h.execCalls[1].args, [
    "pane",
    "rename",
    "wM:p4Q",
    "op-stage: verify release",
  ]);
  const requiredLine = "bash -c 'printf ok'; __qq_s=$?; [ $__qq_s -eq 0 ] && exit";
  assert.deepEqual(h.execCalls[2].args, ["pane", "send-text", "wM:p4Q", requiredLine]);
  assert.deepEqual(h.execCalls[3].args, [
    "pane",
    "wait-output",
    "wM:p4Q",
    "--source",
    "recent-unwrapped",
    "--timeout",
    "5000",
    "--match",
    requiredLine,
  ]);
  assert.deepEqual(h.execCalls[4].args, [
    "notification",
    "show",
    "Operator action ready",
    "--body",
    "Navigate to pane wM:p4Q: verify release",
    "--sound",
    "request",
  ]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "close"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "read"), false);

  assert.equal(outcome.details.pane_id, "wM:p4Q");
  assert.equal(outcome.details.danger, "low");
  assert.equal(outcome.details.description, "verify release");
  assert.equal(outcome.details.staged_line, requiredLine);
  assert.match(outcome.content[0].text, /request notification/i);
  assert.match(outcome.content[0].text, /navigate to pane wM:p4Q/i);
  assert.match(outcome.content[0].text, /press Enter once/);
  assert.match(outcome.content[0].text, /herdr pane read wM:p4Q/);
  assert.match(outcome.content[0].text, /pane gone.*succeeded.*auto-closed/);
  assert.match(outcome.content[0].text, /pane present.*failure or abort/);
  assert.match(outcome.content[0].text, /agent never sends keys/i);
  assert.equal(
    h.listenerCalls,
    0,
    "operator_stage's nested pi.exec behavior was modeled as a bash tool call",
  );
}

async function testHighDanger() {
  setHerdrPane("source-pane");
  const h = createHarness();
  const command = "rm -rf build-output";
  const description = "remove owner's output";
  const outcome = await h.tool.execute(
    "call-high",
    { command, description, danger: "high" },
    undefined,
  );

  assert.deepEqual(
    operationNames(h.execCalls),
    ["split", "rename", "send-text", "wait-output", "show"],
  );
  const line = h.execCalls[2].args[3];
  assert.equal(
    line,
    `read -n1 -r -p 'HIGH DANGER — remove owner'"'"'s output — press y to run: ' __qq_c; [ "$__qq_c" = y ] && { bash -c '${command}'; __qq_s=$?; [ $__qq_s -eq 0 ] && exit; }`,
  );
  assert.match(line, /read -n1/);
  assert.match(line, /\[ "\$__qq_c" = y \]/);
  assert.ok(line.includes(command));
  assert.equal(line.includes("\n"), false, "staged high-danger line was not single-line");
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "close"), false);
  assert.equal(outcome.details.staged_line, line);
  assert.match(outcome.content[0].text, /press Enter, then press y/);
  assert.match(outcome.content[0].text, /any other key aborts/);
}

async function testShellCompositionSafety() {
  setHerdrPane("source-pane");
  const h = createHarness();
  // A command whose bare composition would break status capture or parsing
  // must run inside bash -c so its exit status is the child's status.
  const outcome = await h.tool.execute(
    "call-compose",
    { command: "exit 7;", description: "status-capture probe", danger: "low" },
    undefined,
  );
  const line = h.execCalls[2].args[3];
  assert.equal(line, "bash -c 'exit 7;'; __qq_s=$?; [ $__qq_s -eq 0 ] && exit");
  assert.equal(outcome.details.staged_line, line);

  const h2 = createHarness();
  await h2.tool.execute(
    "call-quote",
    { command: "printf 'a b'", description: "quoting probe", danger: "low" },
    undefined,
  );
  assert.equal(
    h2.execCalls[2].args[3],
    `bash -c 'printf '"'"'a b'"'"''; __qq_s=$?; [ $__qq_s -eq 0 ] && exit`,
  );
}

async function testRefusalsMakeNoExecCalls() {
  const cases = [
    {
      name: "newline",
      env: "source-pane",
      params: { command: "printf first\nprintf second", description: "two lines", danger: "low" },
      message: /newline/,
    },
    {
      name: "danger",
      env: "source-pane",
      params: { command: "printf ok", description: "bad danger", danger: "medium" },
      message: /danger must be low or high/,
    },
    {
      name: "missing herdr",
      env: undefined,
      params: { command: "printf ok", description: "no pane", danger: "low" },
      message: /operator_stage requires a herdr session/,
    },
    {
      name: "empty herdr",
      env: "",
      params: { command: "printf ok", description: "empty pane id", danger: "low" },
      message: /operator_stage requires a herdr session/,
    },
    {
      name: "blank herdr",
      env: "   ",
      params: { command: "printf ok", description: "blank pane id", danger: "low" },
      message: /operator_stage requires a herdr session/,
    },
  ];

  for (const testCase of cases) {
    setHerdrPane(testCase.env);
    const h = createHarness();
    const outcome = await h.tool.execute(testCase.name, testCase.params, undefined);
    assertErrorResult(outcome);
    assert.match(outcome.content[0].text, testCase.message);
    assert.equal(h.execCalls.length, 0, `${testCase.name} refusal ran herdr`);
  }
}

async function testSplitFailure() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply(call) {
      assert.equal(call.args[1], "split");
      return { code: 1, stdout: "", stderr: "split denied" };
    },
  });
  const outcome = await h.tool.execute(
    "split-failure",
    { command: "printf ok", description: "split failure", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.match(outcome.content[0].text, /split denied/);
  assert.deepEqual(operationNames(h.execCalls), ["split"]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-text"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "close"), false);
}

async function testUnparseablePaneId() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply() {
      return { code: 0, stdout: "pane created without an id", stderr: "" };
    },
  });
  const outcome = await h.tool.execute(
    "unparseable",
    { command: "printf ok", description: "missing id", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.deepEqual(operationNames(h.execCalls), ["split"]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-text"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "close"), false);
}

async function testSendFailureOwnsTeardown() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply(call) {
      if (call.args[1] === "split") {
        return { code: 0, stdout: "created wM:p9Z", stderr: "" };
      }
      if (call.args[1] === "send-text") {
        return { code: 1, stdout: "", stderr: "send denied" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const outcome = await h.tool.execute(
    "send-failure",
    { command: "printf ok", description: "send failure", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.match(outcome.content[0].text, /send denied/);
  assert.doesNotMatch(outcome.content[0].text, /orphaned/);
  assert.equal(outcome.details.teardown, "closed");
  assert.deepEqual(operationNames(h.execCalls), ["split", "rename", "send-text", "close"]);
  const closes = h.execCalls.filter(({ args }) => args[1] === "close");
  assert.equal(closes.length, 1);
  assert.deepEqual(closes[0].args, ["pane", "close", "wM:p9Z"]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
}

async function testWaitOutputVerifiesStaging() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply(call) {
      if (call.args[1] === "split") {
        return {
          code: 0,
          stdout: JSON.stringify({ result: { pane: { pane_id: "wM:p8R" } } }),
          stderr: "",
        };
      }
      if (call.args[1] === "wait-output") {
        return { code: 1, stdout: "", stderr: "timeout" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const outcome = await h.tool.execute(
    "unverified-staging",
    { command: "printf expected", description: "verify staging", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.match(outcome.content[0].text, /could not verify/);
  assert.deepEqual(
    operationNames(h.execCalls),
    ["split", "rename", "send-text", "wait-output", "close"],
  );
  const waits = h.execCalls.filter(({ args }) => args[1] === "wait-output");
  assert.equal(waits.length, 1);
  assert.equal(waits[0].args.includes("recent-unwrapped"), true);
  assert.equal(waits[0].args.includes("5000"), true);
  assert.equal(
    waits[0].args.includes("bash -c 'printf expected'; __qq_s=$?; [ $__qq_s -eq 0 ] && exit"),
    true,
  );
  assert.deepEqual(h.execCalls[4].args, ["pane", "close", "wM:p8R"]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
}

async function testNotificationFailureOwnsTeardown() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply(call) {
      if (call.args[1] === "split") {
        return { code: 0, stdout: "created wM:p6N", stderr: "" };
      }
      if (call.args[0] === "notification") {
        return { code: 1, stdout: "", stderr: "notifications unavailable" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const outcome = await h.tool.execute(
    "notification-failure",
    { command: "printf ok", description: "notify failure", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.match(outcome.content[0].text, /could not notify the operator/);
  assert.match(outcome.content[0].text, /notifications unavailable/);
  assert.doesNotMatch(outcome.content[0].text, /orphaned/);
  assert.equal(outcome.details.teardown, "closed");
  assert.deepEqual(
    operationNames(h.execCalls),
    ["split", "rename", "send-text", "wait-output", "show", "close"],
  );
  assert.deepEqual(h.execCalls[5].args, ["pane", "close", "wM:p6N"]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
}

async function testFocusDriftNet() {
  const h = createHarness();
  const previousChildRole = process.env.PI_SUBAGENT_CHILD_AGENT;
  delete process.env.PI_SUBAGENT_CHILD_AGENT;

  try {
    const blocked = [
      "herdr tab focus wM:t4D",
      "herdr --session demo tab focus wM:t4D",
      "bin/herdr --session demo tab focus wM:t4D",
      "/opt/herdr/bin/herdr --session demo workspace focus wM",
      "herdr agent focus wM:p1",
      `"$HERDR" pane focus left`,
      "herdr plugin pane focus wM:pPlugin",
      "herdr pane split --direction right wM:p1",
      "herdr --session demo pane split --direction right wM:p1",
      "herdr pane split --no-focus --focus wM:p1",
      "herdr tab create --workspace wM",
      "herdr tab create --no-focus --focus --workspace wM",
      "herdr workspace create --label uat",
      "herdr worktree create --branch uat",
      "herdr worktree open --no-focus --focus --path /repo",
      "herdr plugin pane open --plugin demo --placement tab",
      "herdr plugin pane open --plugin demo --no-focus --focus",
      "herdr pane move wM:p1 --tab wM:t2 --focus",
      "/usr/local/bin/qq-herdr-home focus-board --repo /repo",
      "bin/qq-herdr-home focus-board --repo /repo",
      "qq-herdr-home focus-architect --repo /repo",
      "bin/qq-herdr-snap",
      "qq-herdr-snap",
      "bin/qq-herdr-pull next",
      "./bin/qq-herdr-pull next",
    ];

    for (const command of blocked) {
      const decision = await h.toolCall({ toolName: "bash", input: { command } });
      assert.equal(decision?.block, true, `drift-net admitted: ${command}`);
      assert.match(decision.reason, /no-focus rule/i);
      assert.match(decision.reason, /notification/i);
    }

    const allowed = [
      "herdr api snapshot",
      "herdr agent list",
      "herdr agent get wM:p1",
      "herdr agent read wM:p1",
      "herdr tab get wM:t1",
      "herdr tab list",
      "herdr pane read wM:p1",
      "herdr workspace list",
      "herdr notification show Ready --body done --sound request",
      "herdr pane split --pane wM:p1 --no-focus --direction right",
      "herdr --session demo pane split --no-focus --direction right wM:p1",
      `"$HERDR" tab create --workspace wM --no-focus`,
      "herdr workspace create --no-focus --label uat",
      "herdr worktree create --no-focus --branch uat",
      "herdr worktree open --no-focus --path /repo",
      "herdr plugin pane open --plugin demo --placement tab --no-focus",
      "herdr pane move wM:p1 --tab wM:t2 --no-focus",
      "herdr pane swap --current --direction left",
      "herdr workspace close wUat",
      "herdr tab close wM:tUat",
      "herdr pane close wM:pUat",
      "herdr worktree remove --workspace wUat",
      "herdr plugin pane close wM:pPlugin",
      "qq-herdr-home inspect --repo /repo",
      "bin/qq-herdr-home inspect --repo /repo",
      "/repo/bin/qq-handoff --help",
      "printf '%s\\n' 'herdr tab focus is forbidden'",
    ];

    for (const command of allowed) {
      const decision = await h.toolCall({ toolName: "bash", input: { command } });
      assert.equal(decision, undefined, `drift-net refused: ${command}`);
    }

    process.env.PI_SUBAGENT_CHILD_AGENT = "reviewer";
    assert.equal(
      await h.toolCall({ toolName: "bash", input: { command: "herdr tab focus wM:t1" } }),
      undefined,
      "drift-net applied root policy to an asserted delegated child",
    );
    delete process.env.PI_SUBAGENT_CHILD_AGENT;

    assert.equal(
      await h.toolCall({ toolName: "read", input: { command: "herdr tab focus wM:t1" } }),
      undefined,
    );
    assert.equal(await h.toolCall({ toolName: "bash", input: { command: 42 } }), undefined);
    assert.equal(await h.toolCall({ toolName: "bash", input: null }), undefined);
  } finally {
    if (previousChildRole === undefined) delete process.env.PI_SUBAGENT_CHILD_AGENT;
    else process.env.PI_SUBAGENT_CHILD_AGENT = previousChildRole;
  }
}

async function testCloseFailureReportsOrphan() {
  setHerdrPane("source-pane");
  const h = createHarness({
    execReply(call) {
      if (call.args[1] === "split") {
        return { code: 0, stdout: "created wM:p7T", stderr: "" };
      }
      if (call.args[1] === "send-text") {
        return { code: 1, stdout: "", stderr: "send denied" };
      }
      if (call.args[1] === "close") {
        return { code: 1, stdout: "", stderr: "close denied" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const outcome = await h.tool.execute(
    "close-failure",
    { command: "printf ok", description: "close failure", danger: "low" },
    undefined,
  );

  assertErrorResult(outcome);
  assert.match(outcome.content[0].text, /send denied/);
  assert.match(outcome.content[0].text, /could not be torn down/);
  assert.match(outcome.content[0].text, /orphaned/);
  assert.equal(outcome.details.teardown, "close-failed: close denied");
  assert.deepEqual(operationNames(h.execCalls), ["split", "rename", "send-text", "close"]);
}

await testFocusDriftNet();
await testRegistrationAndLowDanger();
await testHighDanger();
await testShellCompositionSafety();
await testRefusalsMakeNoExecCalls();
await testSplitFailure();
await testUnparseablePaneId();
await testSendFailureOwnsTeardown();
await testWaitOutputVerifiesStaging();
await testNotificationFailureOwnsTeardown();
await testCloseFailureReportsOrphan();
setHerdrPane(undefined);

console.log("test-qq-operator-stage-extension: pass");
JS
then
  fail 'Pi operator-stage extension node suite failed'
fi
