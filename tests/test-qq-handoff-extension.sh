#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-handoff-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-handoff.ts"
INDEX="$ROOT/extensions/index.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'
module="$TMP/qq-handoff.mjs"
cp -- "$EXTENSION" "$module"

node --input-type=module - "$module" "$INDEX" <<'JS'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [modulePath, indexPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));

function receipt(status, message = `${status} fixture`) {
  return JSON.stringify({
    schema: "qq-handoff/v1",
    version: 1,
    engine: "qq-handoff",
    action: "start",
    status,
    message,
    rails: [],
    ...(status === "done" ? { transaction: { created_tab_id: "w:tNew" } } : {}),
  });
}

function harness(reply, options = {}) {
  const commands = new Map();
  const calls = [];
  const notifications = [];
  const pi = {
    registerCommand(name, definition) {
      assert.equal(commands.has(name), false, `${name} registered twice`);
      commands.set(name, definition);
    },
    async exec(command, args, execOptions) {
      calls.push({ command, args, options: execOptions });
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  register(pi);
  assert.deepEqual([...commands.keys()], ["handoff"]);
  const ctx = {
    mode: options.mode ?? "tui",
    hasUI: options.hasUI ?? true,
    cwd: options.cwd ?? "/fixture/change",
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
  return { calls, commands, ctx, notifications };
}

async function invoke(h, args) {
  await h.commands.get("handoff").handler(args, h.ctx);
}

const indexSource = await readFile(indexPath, "utf8");
assert.equal((indexSource.match(/from\s+["']\.\/qq-handoff\.ts["']/g) ?? []).length, 1);
assert.equal((indexSource.match(/registerHandoff\s*\(/g) ?? []).length, 1);

for (const args of ["", " ", "T-0", "T-01", "T-1.0", "T-1.2.3", "--help", "-T-155", "T-155/child", "T-155 extra", "T-155 ", " T-155", "T-155\nT-156"]) {
  const h = harness({ code: 0, killed: false, stdout: receipt("done"), stderr: "" });
  await invoke(h, args);
  assert.equal(h.calls.length, 0, `engine ran for invalid args ${JSON.stringify(args)}`);
  assert.deepEqual(h.notifications, [{
    message: "Usage: /handoff <Task-ID> (for example, /handoff FEAT-12.3)",
    level: "warning",
  }]);
}

for (const options of [{ mode: "rpc" }, { mode: "json" }, { mode: "tui", hasUI: false }]) {
  const h = harness({ code: 0, killed: false, stdout: receipt("done") }, options);
  await invoke(h, "T-155");
  assert.equal(h.calls.length, 0);
  assert.match(h.notifications[0].message, /interactive root Pi/);
  assert.equal(h.notifications[0].level, "warning");
}

const missingContext = harness({ code: 0, killed: false, stdout: receipt("done") }, { cwd: "" });
await invoke(missingContext, "T-155");
assert.equal(missingContext.calls.length, 0);
assert.deepEqual(missingContext.notifications, [{
  message: "/handoff cannot identify the current Repository context.",
  level: "error",
}]);

const success = harness({ code: 0, killed: false, stdout: receipt("done", "working and focused"), stderr: "" });
await invoke(success, "FEAT-12.3");
assert.deepEqual(success.calls, [{
  command: "qq-handoff",
  args: ["start", "FEAT-12.3", "--repo", "/fixture/change"],
  options: { cwd: "/fixture/change" },
}]);
assert.deepEqual(success.notifications, [{
  message: "Handoff complete: working and focused New tab: w:tNew.",
  level: "info",
}]);

const refusal = harness({ code: 2, killed: false, stdout: receipt("refused", "duplicate owner"), stderr: "diagnostic" });
await invoke(refusal, "T-155");
assert.deepEqual(refusal.notifications, [{ message: "Handoff refused: duplicate owner", level: "warning" }]);

const failure = harness({ code: 1, killed: false, stdout: receipt("error", "possible live Pi preserved"), stderr: "diagnostic" });
await invoke(failure, "T-155");
assert.deepEqual(failure.notifications, [{ message: "Handoff error: possible live Pi preserved", level: "error" }]);

const killed = harness({ code: 137, killed: true, stdout: receipt("error"), stderr: "killed" });
await invoke(killed, "T-155");
assert.match(killed.notifications[0].message, /was killed; lifecycle outcome is uncertain/);
assert.equal(killed.notifications[0].level, "error");

for (const stdout of [
  "", "null", "[]", "{}", "{bad", `${receipt("done")}\n${receipt("done")}`,
  JSON.stringify({ ...JSON.parse(receipt("done")), engine: "other" }),
  JSON.stringify({ ...JSON.parse(receipt("done")), version: 2 }),
  JSON.stringify({ ...JSON.parse(receipt("done")), action: "inspect" }),
]) {
  const malformed = harness({ code: 0, killed: false, stdout, stderr: "" });
  await invoke(malformed, "T-155");
  assert.match(malformed.notifications[0].message, /malformed JSON; lifecycle outcome is uncertain/);
  assert.equal(malformed.notifications[0].level, "error");
}

for (const [code, status] of [[0, "refused"], [2, "done"], [1, "done"], [7, "error"]]) {
  const mismatch = harness({ code, killed: false, stdout: receipt(status), stderr: "" });
  await invoke(mismatch, "T-155");
  assert.match(mismatch.notifications[0].message, /exit status and JSON receipt disagree/);
}

const thrown = harness(new Error("spawn unavailable"));
await invoke(thrown, "T-155");
assert.deepEqual(thrown.notifications, [{
  message: "Handoff engine could not be executed: spawn unavailable",
  level: "error",
}]);

console.log("test-qq-handoff-extension: pass");
JS
