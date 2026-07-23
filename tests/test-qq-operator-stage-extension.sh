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
  const execCalls = [];
  const pi = {
    registerTool(tool) {
      registrations.push(tool);
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
    return { code: 0, stdout: "", stderr: "" };
  };

  register(pi, { exec });
  assert.equal(registrations.length, 1, "extension must register exactly one tool");
  return { tool: registrations[0], execCalls };
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
  assert.equal(h.tool.label, "Operator Stage");
  assert.equal(typeof h.tool.description, "string");
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

  assert.deepEqual(operationNames(h.execCalls), ["split", "rename", "send-text", "wait-output"]);
  assert.deepEqual(h.execCalls[0].args, [
    "pane",
    "split",
    "--current",
    "--direction",
    "right",
    "--cwd",
    process.cwd(),
    "--focus",
  ]);
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
    "--source",
    "recent-unwrapped",
    "--timeout",
    "5000",
    "--match",
    requiredLine,
    "wM:p4Q",
  ]);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "send-keys"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "close"), false);
  assert.equal(h.execCalls.some(({ args }) => args[1] === "read"), false);

  assert.equal(outcome.details.pane_id, "wM:p4Q");
  assert.equal(outcome.details.danger, "low");
  assert.equal(outcome.details.description, "verify release");
  assert.equal(outcome.details.staged_line, requiredLine);
  assert.match(outcome.content[0].text, /press Enter once/);
  assert.match(outcome.content[0].text, /herdr pane read wM:p4Q/);
  assert.match(outcome.content[0].text, /pane gone.*succeeded.*auto-closed/);
  assert.match(outcome.content[0].text, /pane present.*failure or abort/);
  assert.match(outcome.content[0].text, /agent never sends keys/i);
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

  assert.deepEqual(operationNames(h.execCalls), ["split", "rename", "send-text", "wait-output"]);
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

await testRegistrationAndLowDanger();
await testHighDanger();
await testShellCompositionSafety();
await testRefusalsMakeNoExecCalls();
await testSplitFailure();
await testUnparseablePaneId();
await testSendFailureOwnsTeardown();
await testWaitOutputVerifiesStaging();
await testCloseFailureReportsOrphan();
setHerdrPane(undefined);

console.log("test-qq-operator-stage-extension: pass");
JS
then
  fail 'Pi operator-stage extension node suite failed'
fi
