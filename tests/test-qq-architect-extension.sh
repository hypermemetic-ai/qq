#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-architect-extension
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d "$ROOT/.test-qq-architect.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
node --input-type=module - "$ROOT/extensions/qq-architect.ts" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [modulePath, scratch] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
function occurrence(id, key, repository, pr) {
  return { occurrence_id: `occurrence-${id.repeat(32)}`, recurrence_key: key,
    source: { run_dir: `/state/runs/${repository}/pr-${pr}`, repository, legacy: false,
      pr, variant: "guided", assembled_at: `2026-08-${String(pr).padStart(2,"0")}T00:00:00Z` } };
}
const a1 = occurrence("1", "same-key", "one/repo", 1);
const a2 = occurrence("2", "same-key", "two/repo", 2);
const b1 = occurrence("3", "other-key", "two/repo", 3);
const observerHealth = { rounds: [
  { status: "analysis_failed", repository: "health/repo", pr: 4,
    run_dir: "/state/runs/health/repo/pr-4", assembled_at: "2026-08-04T00:00:00Z",
    reason: "😀".repeat(250), reason_truncated: false },
  { status: "pending", repository: "health/repo", pr: 5,
    run_dir: "/state/runs/health/repo/pr-5", assembled_at: "2026-08-05T00:00:00Z",
    reason: "analysis is not finalized", reason_truncated: false },
], omitted_rounds: 0 };
function context(findings = [
  { recurrence_key: "same-key", title: "Cross source 😀", kind: "friction", confidence: "high", covered: false,
    suggested_scope: "Suggested", occurrences: [a1, a2] },
  { recurrence_key: "other-key", title: "Other", kind: "waste", confidence: "medium", covered: false,
    suggested_scope: "Other suggestion", occurrences: [b1] },
], observer_health = observerHealth) { return {
  schema: "qq-observer.architect-context", schema_version: 5,
  findings, observer_health, omitted_findings: 0 }; }
function result(body, code = 0, stderr = "") { return { stdout: typeof body === "string" ? body : JSON.stringify(body), stderr, code, killed: false }; }
function injectedContext(message) {
  const start = message.indexOf("\n\n") + 2;
  const end = message.indexOf("\n\n", start);
  assert.ok(start > 1 && end > start, "Architect context block is missing");
  return JSON.parse(message.slice(start, end));
}
function harness(queue, options = {}) {
  const commands = new Map(), tools = new Map(), events = new Map(), calls = [], messages = [], notifications = [];
  let temp = 0;
  const pi = {
    registerCommand(name, value) { commands.set(name, value); }, registerTool(value) { tools.set(value.name, value); },
    on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); },
    async exec(command, args, execOptions) { calls.push({ command, args, execOptions }); assert.ok(queue.length, `queue empty: ${command}`); const next = queue.shift(); return typeof next === "function" ? next(calls.at(-1)) : next; },
    sendUserMessage(value) { messages.push(value); },
  };
  register(pi, { mkdtemp: async () => { const path = join(scratch, `tmp-${temp++}`); await mkdir(path); return path; } });
  const forbidden = () => { throw new Error("forbidden UI invoked"); };
  const ctx = { cwd: "/qq", hasUI: options.hasUI ?? true, mode: options.mode ?? "tui", ui: {
    notify(message, level) { notifications.push({ message, level }); }, select: forbidden, custom: forbidden, editor: forbidden,
  } };
  async function tool(params) { return tools.get("architect_disposition").execute("id", params, undefined, undefined, ctx); }
  return { commands, tools, calls, messages, notifications, ctx, tool, queue };
}
const decisions = [
  { recurrence_key: "same-key", action: "route", scope: "Agreed cross-Repository scope.", note: "" },
  { recurrence_key: "other-key", action: "set_aside", scope: "", note: "Current evidence is not actionable." },
];

// /architect accepts only v5 and explains exact decision-record coverage plus
// the one-call settlement conversation.
const openedContext = context();
const h = harness([result(openedContext)]);
await h.commands.get("architect").handler("", h.ctx);
assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args, ["architect-context"]);
assert.match(h.messages[0], /compact JSON/);
assert.match(h.messages[0], /recurring preemptive complexity across findings[\s\S]*do not recommend or route a remedy that reproduces the pattern/);
assert.match(h.messages[0], /exact key hit in a Backlog decision record/);
assert.match(h.messages[0], /architect_disposition action=settle/);
assert.equal(h.messages[0].includes("awaiting affirmative"), false);
assert.equal(h.messages[0].includes("batch_id"), false);
assert.deepEqual(injectedContext(h.messages[0]), openedContext);
const toolSchema = h.tools.get("architect_disposition").parameters;
assert.deepEqual(toolSchema.properties.action.enum, ["settle"]);
assert.equal(Object.hasOwn(toolSchema.properties, "context_id"), false);
assert.equal(Object.hasOwn(toolSchema.properties, "batch_id"), false);
assert.equal(toolSchema.required.includes("decisions"), true);

// Settle writes decisions once and calls the one settlement verb; occurrence
// coverage and identities are derived engine-side.
let writtenDecisions;
h.queue.push(async (call) => {
  writtenDecisions = JSON.parse(await readFile(call.args[2], "utf8"));
  return result({ status: "settled", settled: ["same-key", "other-key"] });
});
const settled = await h.tool({ action: "settle", decisions });
assert.equal(settled.details.status, "settled");
assert.deepEqual(settled.details.settled, ["same-key", "other-key"]);
assert.match(settled.content[0].text, /Settled durable Architect dispositions/);
assert.match(settled.content[0].text, /same-key/);
assert.deepEqual(writtenDecisions, decisions);
assert.deepEqual(h.calls.at(-1).args.slice(0, 2), ["disposition-settle", "--decisions"]);
assert.equal(h.calls.some((call) => call.command === "qq-handoff"), false);
assert.match(h.notifications.at(-1).message, /Settled durable Architect dispositions/);

// Non-settle actions and identity echoes are refused before any engine call.
for (const [params, message] of [
  [{ action: "propose", decisions }, /Action invariant failed.*one settlement call/],
  [{ action: "confirm", context_id: "context-" + "b".repeat(32), batch_id: "batch-" + "c".repeat(32) }, /Action invariant failed/],
  [{ action: "settle", decisions, batch_id: "batch-" + "c".repeat(32) }, /exactly action and decisions/],
]) {
  const x = harness([]);
  const refusal = await x.tool(params);
  assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, message);
  assert.equal(x.calls.length, 0);
}

// Trust-bearing decision rejections identify their invariant before the writer.
for (const [bad, message] of [
  [[{ ...decisions[1], scope: "not empty" }], /set_aside scope invariant.*empty string/],
  [[decisions[0], decisions[0]], /recurrence invariant.*merge duplicate-key/],
  [[{ ...decisions[0], action: "hold" }], /action invariant failed.*route or set_aside/],
]) {
  const x = harness([]);
  const rejected = await x.tool({ action: "settle", decisions: bad });
  assert.equal(rejected.details.status, "refused"); assert.match(rejected.content[0].text, message);
  assert.equal(x.calls.length, 0);
}

// Engine failures and identity mismatches surface as errors, never as settles.
const failing = harness([result("", 65, "no unresolved occurrences: same-key")]);
const failed = await failing.tool({ action: "settle", decisions });
assert.equal(failed.details.status, "error");
assert.match(failed.content[0].text, /no unresolved occurrences/);
const mismatched = harness([result({ status: "settled", settled: ["other-key"] })]);
const mismatch = await mismatched.tool({ action: "settle", decisions });
assert.equal(mismatch.details.status, "error");
assert.match(mismatch.content[0].text, /identity invariant failed/);

// Malformed or v4 engine context names the failed invariant and emits no context message.
const v4 = structuredClone(context()); v4.schema_version = 4;
const malformedFinding = structuredClone(context()); delete malformedFinding.findings[0].covered;
for (const [bad, invariant] of [
  [result("not-json"), /Architect context JSON invariant failed/],
  [result(v4), /Architect context top-level invariant failed/],
  [result(malformedFinding), /Architect finding 0 invariant failed/],
  [result("", 65, "bad store"), /bad store/],
]) {
  const x = harness([bad]); await x.commands.get("architect").handler("", x.ctx);
  assert.equal(x.messages.length, 0); assert.match(x.notifications[0].message, invariant);
  assert.equal(x.notifications[0].level, "error");
}
const headless = harness([], { hasUI: false });
await headless.commands.get("architect").handler("", headless.ctx); assert.equal(headless.calls.length, 0);
console.log("test-qq-architect-extension: pass");
JS
printf 'test-qq-architect-extension: pass\n'
