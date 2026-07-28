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
const handoffId = `handoff-${"c".repeat(32)}`;
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
  { recurrence_key: "same-key", title: "Cross source 😀", kind: "friction", confidence: "high",
    suggested_scope: "Suggested", occurrences: [a1, a2] },
  { recurrence_key: "other-key", title: "Other", kind: "waste", confidence: "medium",
    suggested_scope: "Other suggestion", occurrences: [b1] },
], pending_intakes = [], observer_health = observerHealth) { return {
  schema: "qq-observer.architect-context", schema_version: 3,
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
const pendingIntake = { batch_id: batchId, context_id: contextId, handoff_id: handoffId, status: "prepared", attempt_statuses: [],
  decisions: decisions.map((decision, index) => ({ decision_id: `decision-${String(index + 1).repeat(32)}`, ...decision })),
  occurrences: [a1, a2, b1], batch_dir: `/state/architect/batches/${batchId}`,
  handoff_path: `/state/architect/batches/${batchId}/handoff.json`, result_path: `/state/architect/batches/${batchId}/result.json`, attempt_paths: [] };
const pendingContext = context(pendingContextId, [], [pendingIntake]);

// /architect reads one global durable context and advertises identity-only confirmation.
const openedContext = context();
const h = harness([result(openedContext)]);
await h.commands.get("architect").handler("", h.ctx);
assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args, ["architect-context"]);
assert.match(h.messages[0], /deterministic TOON/); assert.match(h.messages[0], /open-ended conversation/);
assert.match(h.messages[0], /confirm it with only that batch_id and its context_id/);
assert.deepEqual(injectedContext(h.messages[0]), openedContext);
assert.equal(injectedContext(h.messages[0]).findings[0].title, "Cross source 😀");
const toolSchema = h.tools.get("architect_disposition").parameters;
assert.deepEqual(toolSchema.properties.action.enum, ["propose", "confirm"]);
assert.equal(Object.hasOwn(toolSchema.properties, "operator_confirmation"), false);
assert.equal(Object.hasOwn(toolSchema.properties, "operator_request"), false);
assert.equal(toolSchema.required.includes("decisions"), false, "confirm still required decision replay");

// Propose validates current occurrence identity, then durably prepares and presents the batch once.
let writtenDecisions;
h.queue.push(result(context()), async (call) => {
  writtenDecisions = JSON.parse(await readFile(call.args[4], "utf8"));
  return result({ status: "confirmed", batch_dir: pendingIntake.batch_dir, handoff_path: pendingIntake.handoff_path,
    batch: { batch_id: batchId, context_id: contextId, handoff_id: handoffId } });
});
const proposed = await h.tool(proposalParams);
assert.equal(proposed.details.status, "proposed"); assert.equal(proposed.details.batch_id, batchId);
assert.match(proposed.content[0].text, new RegExp(batchId));
assert.match(proposed.content[0].text, /clear affirmative/);
assert.equal(proposed.content[0].text.includes("Confirm this exact batch?"), false);
assert.deepEqual(writtenDecisions, decisions);
assert.equal(h.calls.filter((call) => call.args[0] === "prepare-handoff").length, 1);

// Plain-language affirmative plus batch identity re-reads durable state and starts one recipient.
await h.input(`Yes, please proceed with ${batchId}; this looks good.`);
h.queue.push(result(pendingContext), result({ schema: "qq-handoff/v1", version: 1, engine: "qq-handoff", action: "intake-start", status: "done", transaction: { created_tab_id: "w:t" }, handoff_id: handoffId }));
const confirmed = await h.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
assert.equal(confirmed.details.status, "routed");
assert.deepEqual(h.calls.at(-1).args, ["intake-start", "--handoff", pendingIntake.handoff_path, "--repo", "/qq"]);

// Confirmation is independent of an in-memory proposal or /architect context and tolerates a changed top-level context id.
const durable = harness([]);
await durable.input(`I approve ${batchId}; go ahead.`);
durable.queue.push(result(pendingContext), result({ schema: "qq-handoff/v1", version: 1, engine: "qq-handoff", action: "intake-start", status: "refused", message: "live recipient", handoff_id: handoffId }));
const retried = await durable.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
assert.equal(retried.details.status, "pending");
assert.equal(durable.calls.filter((call) => call.args[0] === "prepare-handoff").length, 0);
assert.equal(durable.calls.filter((call) => call.command === "qq-handoff").length, 1);

// Authority must be a clear affirmative referencing the batch; no operator prose is replayed through the tool.
const authority = harness([]);
await authority.input("Yes, please proceed."); authority.queue.push(result(pendingContext));
let refusal = await authority.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /references batch-/);
await authority.input(`Do not confirm ${batchId}.`); authority.queue.push(result(pendingContext));
refusal = await authority.tool({ action: "confirm", context_id: contextId, batch_id: batchId });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /clear affirmative/);
const beforeExtra = authority.calls.length;
refusal = await authority.tool({ action: "confirm", context_id: contextId, batch_id: batchId, decisions });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /pass only action, context_id, and batch_id/);
assert.equal(authority.calls.length, beforeExtra, "invalid confirmation touched durable state");

// Wrong durable identity gives an invariant-specific correction.
const wrongIdentity = harness([result(pendingContext)]);
await wrongIdentity.input(`Approve batch-${"f".repeat(32)}.`);
refusal = await wrongIdentity.tool({ action: "confirm", context_id: contextId, batch_id: `batch-${"f".repeat(32)}` });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /not in durable pending_intakes/);
const wrongContext = harness([result(pendingContext)]);
await wrongContext.input(`Approve ${batchId}.`);
refusal = await wrongContext.tool({ action: "confirm", context_id: `context-${"f".repeat(32)}`, batch_id: batchId });
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /belongs to context-/);

// A Task-free proposal is durably settled without creating recipient ceremony.
const setAside = [{ recurrence_key: "other-key", occurrence_ids: [b1.occurrence_id], action: "set_aside", scope: "", note: "Explicitly settled." }];
const s = harness([result(context()), result({ status: "confirmed", batch_dir: `/state/architect/batches/batch-${"e".repeat(32)}`, handoff_path: null,
  batch: { batch_id: `batch-${"e".repeat(32)}`, context_id: contextId } })]);
const settled = await s.tool({ action: "propose", context_id: contextId, decisions: setAside });
assert.equal(settled.details.status, "settled"); assert.match(settled.content[0].text, /no Task or recipient/);
assert.equal(s.calls.some((call) => call.command === "qq-handoff"), false);

// Trust-bearing proposal rejections identify the invariant and correction.
for (const [bad, message] of [
  [[{ ...decisions[1], scope: "not empty" }], /set_aside scope invariant.*set scope to an empty string/],
  [[decisions[0], { ...decisions[0], occurrence_ids: [b1.occurrence_id] }], /recurrence invariant.*merge duplicate-key/],
  [[{ ...decisions[0], occurrence_ids: [a1.occurrence_id, a1.occurrence_id] }], /occurrence uniqueness invariant.*remove duplicates/],
]) {
  const x = harness([result(context())]);
  const rejected = await x.tool({ action: "propose", context_id: contextId, decisions: bad });
  assert.equal(rejected.details.status, "refused"); assert.match(rejected.content[0].text, message);
  assert.equal(x.calls.length, 1, "invalid decisions reached prepare-handoff");
}
const stale = harness([result(context(`context-${"e".repeat(32)}`))]);
refusal = await stale.tool(proposalParams);
assert.equal(refusal.details.status, "refused"); assert.match(refusal.content[0].text, /run \/architect and rebuild/);

// Existing attempt files remain readable history but cause no attempt writes.
const historical = structuredClone(pendingContext);
historical.pending_intakes[0].status = "attempted_awaiting_result";
historical.pending_intakes[0].attempt_statuses = ["error"];
historical.pending_intakes[0].attempt_paths = [`${pendingIntake.batch_dir}/attempts/attempt-${"a".repeat(64)}.json`];
const history = harness([result(historical)]);
await history.commands.get("architect").handler("", history.ctx);
assert.deepEqual(injectedContext(history.messages[0]), historical);

// Malformed engine context reports the exact failed invariant and corrective reader.
const malformedHealthContext = structuredClone(context());
malformedHealthContext.observer_health.rounds[0].status = "covered";
const badFieldsContext = structuredClone(context()); delete badFieldsContext.omitted_findings;
for (const [bad, invariant] of [
  [result("not-json"), /Architect context JSON invariant failed/],
  [result(badFieldsContext), /Architect context top-level invariant failed/],
  [result(malformedHealthContext), /Observer health round 0 invariant failed/],
  [result("", 65, "bad store"), /bad store/],
]) {
  const x = harness([bad]); await x.commands.get("architect").handler("", x.ctx);
  assert.equal(x.messages.length, 0); assert.match(x.notifications[0].message, invariant);
  assert.equal(x.notifications[0].level, "error");
  assert.equal(x.notifications[0].message.includes("wrong shape"), false);
}
const headless = harness([], { hasUI: false }); await headless.commands.get("architect").handler("", headless.ctx); assert.equal(headless.calls.length, 0);
console.log("test-qq-architect-extension: pass");
JS
printf 'test-qq-architect-extension: pass\n'
