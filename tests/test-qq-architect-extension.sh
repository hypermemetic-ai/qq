#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-architect-extension
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d "$ROOT/.test-qq-architect.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
node --input-type=module - "$ROOT/extensions/qq-architect.ts" "$ROOT/prompts/architect.md" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [modulePath, promptPath, scratch] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
function result(body, code = 0, stderr = "") {
  return { stdout: typeof body === "string" ? body : JSON.stringify(body), stderr, code, killed: false };
}
function harness(queue = []) {
  const commands = new Map(), tools = new Map(), events = new Map(), calls = [], notifications = [];
  let temp = 0;
  const pi = {
    registerCommand(name, value) { commands.set(name, value); },
    registerTool(value) { tools.set(value.name, value); },
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    async exec(command, args, execOptions) {
      calls.push({ command, args, execOptions });
      assert.ok(queue.length, `queue empty: ${command}`);
      const next = queue.shift();
      return typeof next === "function" ? next(calls.at(-1)) : next;
    },
    sendUserMessage() { throw new Error("model-triggering context injection is forbidden"); },
  };
  register(pi, { mkdtemp: async () => { const path = join(scratch, `tmp-${temp++}`); await mkdir(path); return path; } });
  const ctx = { cwd: "/qq", hasUI: true, mode: "tui", ui: {
    notify(message, level) { notifications.push({ message, level }); },
    select() { throw new Error("forbidden UI invoked"); },
  } };
  async function tool(params) {
    return tools.get("architect_disposition").execute("id", params, undefined, undefined, ctx);
  }
  return { commands, tools, events, calls, notifications, tool, queue };
}

// The extension surface is mechanical only: no /architect command, context
// loader, message trigger, or event hook remains.
const h = harness();
assert.deepEqual([...h.commands.keys()], []);
assert.deepEqual([...h.events.keys()], []);
assert.deepEqual([...h.tools.keys()], ["architect_disposition"]);

// Stock Pi discovers this manual template. It obtains bounded Observer context
// through the existing command and instructs conversation without self-trigger.
const template = await readFile(promptPath, "utf8");
for (const phrase of [
  "operator-invoked only", "never self-triggers", "bin/qq-observe architect-context",
  "at most 50 ranked uncovered findings", "one consequential question at a time",
  "exact recurrence-key hit in a Backlog decision record", "call `architect_disposition` once",
  "`route` with the agreed nonempty scope", "`set_aside` with an empty scope",
]) assert.match(template, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const decisions = [
  { recurrence_key: "same-key", action: "route", scope: "Agreed cross-Repository scope.", note: "" },
  { recurrence_key: "other-key", action: "set_aside", scope: "", note: "Current evidence is not actionable." },
];
const toolSchema = h.tools.get("architect_disposition").parameters;
assert.deepEqual(toolSchema.properties.action.enum, ["settle"]);
assert.equal(Object.hasOwn(toolSchema.properties, "context_id"), false);
assert.equal(Object.hasOwn(toolSchema.properties, "batch_id"), false);
assert.equal(toolSchema.required.includes("decisions"), true);

let writtenDecisions;
h.queue.push(async (call) => {
  writtenDecisions = JSON.parse(await readFile(call.args[2], "utf8"));
  return result({ status: "settled", settled: ["same-key", "other-key"] });
});
const settled = await h.tool({ action: "settle", decisions });
assert.equal(settled.details.status, "settled");
assert.deepEqual(settled.details.settled, ["same-key", "other-key"]);
assert.match(settled.content[0].text, /Settled durable Architect dispositions/);
assert.deepEqual(writtenDecisions, decisions);
assert.deepEqual(h.calls.at(-1).args.slice(0, 2), ["disposition-settle", "--decisions"]);
assert.equal(h.calls.some((call) => call.command === "qq-handoff"), false);

// Malformed action/decision shapes refuse before the one writer call.
for (const [params, message] of [
  [{ action: "propose", decisions }, /Action invariant failed.*one settlement call/],
  [{ action: "settle", decisions, batch_id: "batch-" + "c".repeat(32) }, /exactly action and decisions/],
  [{ action: "settle", decisions: [{ ...decisions[1], scope: "not empty" }] }, /set_aside scope invariant.*empty string/],
  [{ action: "settle", decisions: [decisions[0], decisions[0]] }, /recurrence invariant.*merge duplicate-key/],
  [{ action: "settle", decisions: [{ ...decisions[0], action: "hold" }] }, /action invariant failed.*route or set_aside/],
]) {
  const x = harness();
  const refusal = await x.tool(params);
  assert.equal(refusal.details.status, "refused");
  assert.match(refusal.content[0].text, message);
  assert.equal(x.calls.length, 0);
}

// Writer failures and exact settled-key mismatches are never reported settled.
const failing = harness([result("", 65, "no unresolved occurrences: same-key")]);
const failed = await failing.tool({ action: "settle", decisions });
assert.equal(failed.details.status, "error");
assert.match(failed.content[0].text, /no unresolved occurrences/);
const mismatched = harness([result({ status: "settled", settled: ["other-key"] })]);
const mismatch = await mismatched.tool({ action: "settle", decisions });
assert.equal(mismatch.details.status, "error");
assert.match(mismatch.content[0].text, /identity invariant failed/);
console.log("test-qq-architect-extension: pass");
JS
printf 'test-qq-architect-extension: pass\n'
