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
import { decode } from "@toon-format/toon";
const [modulePath, scratch] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
const contextId = `context-${"b".repeat(32)}`;
const pendingContextId = `context-${"d".repeat(32)}`;
const batchId = `batch-${"c".repeat(32)}`;
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
function context(id = contextId, findings = [
  { recurrence_key: "same-key", title: "Cross source 😀", kind: "friction", confidence: "high", covered: false,
    suggested_scope: "Suggested", occurrences: [a1, a2] },
  { recurrence_key: "other-key", title: "Other", kind: "waste", confidence: "medium", covered: false,
    suggested_scope: "Other suggestion", occurrences: [b1] },
], pending_intakes = [], observer_health = observerHealth) { return {
  schema: "qq-observer.architect-context", schema_version: 4,
  context_id: id, findings, pending_intakes, observer_health, omitted_findings: 0 }; }
function result(body, code = 0, stderr = "") { return { stdout: typeof body === "string" ? body : JSON.stringify(body), stderr, code, killed: false }; }
function injectedContext(message) {
  const start = message.indexOf("\n\n") + 2;
  const end = message.indexOf("\n\n", start);
  assert.ok(start > 1 && end > start, "Architect context block is missing");
  return decode(message.slice(start, end));
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
  async function input(text, source = "interactive") { for (const fn of events.get("input") ?? []) await fn({ text, source }, ctx); }
  async function tool(params) { return tools.get("architect_disposition").execute("id", params, undefined, undefined, ctx); }
  return { commands, tools, calls, messages, notifications, ctx, input, tool, queue };
}
const decisions = [
  { recurrence_key: "same-key", occurrence_ids: [a1.occurrence_id, a2.occurrence_id].sort(), action: "route", scope: "Agreed cross-Repository scope.", note: "" },
  { recurrence_key: "other-key", occurrence_ids: [b1.occurrence_id], action: "set_aside", scope: "", note: "Current evidence is not actionable." },
];
const proposalParams = { action: "propose", context_id: contextId, decisions };
const pendingIntake = { batch_id: batchId, context_id: contextId, status: "proposed", decisions,
  occurrences: [a1, a2, b1] };
const pendingContext = context(pendingContextId, [], [pendingIntake]);

// /architect accepts only v4 and explains doc-backed proposals plus Backlog coverage.
const openedContext = context();
const h = harness([result(openedContext)]);
await h.commands.get("architect").handler("", h.ctx);
assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args, ["architect-context"]);
assert.match(h.messages[0], /deterministic TOON/); assert.match(h.messages[0], /Backlog search/);
assert.match(h.messages[0], /doc-backed operator-settled dispositions awaiting affirmative/);
assert.equal(h.messages[0].includes("starts the recipient"), false);
assert.deepEqual(injectedContext(h.messages[0]), openedContext);
const toolSchema = h.tools.get("architect_disposition").parameters;
assert.deepEqual(toolSchema.properties.action.enum, ["propose", "confirm"]);
assert.equal(Object.hasOwn(toolSchema.properties, "operator_confirmation"), false);
assert.equal(toolSchema.required.includes("decisions"), false);

// Propose validates current occurrences, writes decisions once, and calls the doc verb.
let writtenDecisions;
h.queue.push(result(context()), async (call) => {
  writtenDecisions = JSON.parse(await readFile(call.args[4], "utf8"));
  return result({ status: "proposed", batch_id: batchId, context_id: contextId });
});
const proposed = await h.tool(proposalParams);
assert.equal(proposed.details.status, "proposed"); assert.equal(proposed.details.batch_id, batchId);
assert.match(proposed.content[0].text, new RegExp(batchId)); assert.match(proposed.content[0].text, /doc-backed dispositions/);
assert.deepEqual(writtenDecisions, decisions);
assert.deepEqual(h.calls.at(-1).args.slice(0, 4), ["disposition-propose", "--context", contextId, "--decisions"]);
assert.equal(h.calls.some((call) => call.command === "qq-handoff"), false);

// Confirmation re-reads the doc-backed proposal and requires the latest clear interactive affirmative.
await h.input(`Yes, please proceed with ${batchId}; this looks good.`);
h.queue.push(result(pendingContext), result({ status: "settled", batch_id: batchId }));
const confirmed = await h.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
assert.equal(confirmed.details.status, "settled");
assert.deepEqual(h.calls.at(-1).args, ["disposition-confirm", "--context", contextId, "--batch", batchId]);
assert.equal(h.calls.some((call) => call.command === "qq-handoff"), false);

// Authority and exact-field refusals never reach disposition-confirm.
for (const text of ["Yes, please proceed.", `Do not confirm ${batchId}.`]) {
  const authority = harness([result(pendingContext)]); await authority.input(text);
  const refusal = await authority.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
  assert.equal(refusal.details.status, "refused");
  assert.equal(authority.calls.some((call) => call.args[0] === "disposition-confirm"), false);
}
const extra = harness([]);
let refusal = await extra.tool({ action: "confirm", context_id: contextId, batch_id: batchId, decisions });
assert.equal(refusal.details.status, "refused"); assert.equal(extra.calls.length, 0);

// Durable identity mismatches and stale proposal contexts are refused.
const wrongIdentity = harness([result(pendingContext)]);
await wrongIdentity.input(`Approve batch-${"f".repeat(32)}.`);
refusal = await wrongIdentity.tool({ action: "confirm", context_id: contextId, batch_id: `batch-${"f".repeat(32)}` });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /not in durable pending_intakes/);
const wrongContext = harness([result(pendingContext)]);
await wrongContext.input(`Approve ${batchId}.`);
refusal = await wrongContext.tool({ action: "confirm", context_id: pendingContextId, batch_id: batchId });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /belongs to context-/);
const stale = harness([result(context(`context-${"e".repeat(32)}`))]);
refusal = await stale.tool(proposalParams);
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /run \/architect and rebuild/);

// Trust-bearing decision rejections identify their invariant before the writer.
for (const [bad, message] of [
  [[{ ...decisions[1], scope: "not empty" }], /set_aside scope invariant.*empty string/],
  [[decisions[0], { ...decisions[0], occurrence_ids: [b1.occurrence_id] }], /recurrence invariant.*merge duplicate-key/],
  [[{ ...decisions[0], occurrence_ids: [a1.occurrence_id, a1.occurrence_id] }], /occurrence uniqueness invariant.*remove duplicates/],
]) {
  const x = harness([result(context())]);
  const rejected = await x.tool({ action: "propose", context_id: contextId, decisions: bad });
  assert.equal(rejected.details.status, "refused"); assert.match(rejected.content[0].text, message);
  assert.equal(x.calls.length, 1);
}

// Malformed or v3 engine context names the failed invariant and emits no context message.
const v3 = structuredClone(context()); v3.schema_version = 3;
const malformedFinding = structuredClone(context()); delete malformedFinding.findings[0].covered;
for (const [bad, invariant] of [
  [result("not-json"), /Architect context JSON invariant failed/],
  [result(v3), /Architect context top-level invariant failed/],
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
