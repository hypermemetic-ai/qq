#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-architect-extension
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
TMP="$(mktemp -d "${TMPDIR:?TMPDIR is required}/qq-architect.XXXXXX")"
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
    reason: "😀".repeat(500), reason_truncated: false },
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
const params = { action: "propose", context_id: contextId, decisions };
const batchId = `batch-${"c".repeat(32)}`, handoffId = `handoff-${"c".repeat(32)}`;
const pendingIntake = { batch_id: batchId, handoff_id: handoffId, status: "prepared", attempt_statuses: [],
  decisions: decisions.map((decision, index) => ({ decision_id: `decision-${String(index + 1).repeat(32)}`, ...decision })),
  occurrences: [a1, a2, b1], batch_dir: `/state/architect/batches/${batchId}`,
  handoff_path: `/state/architect/batches/${batchId}/handoff.json`, result_path: `/state/architect/batches/${batchId}/result.json`, attempt_paths: [] };
const pendingContextId = `context-${"d".repeat(32)}`;
const pendingContext = context(pendingContextId, [], [pendingIntake]);
const pendingDecisions = pendingIntake.decisions.map(({ decision_id, ...decision }) => decision);

// /architect directly loads one global context and invokes no selector/custom/editor.
const openedContext = context();
const h = harness([result(openedContext)]);
await h.commands.get("architect").handler("", h.ctx);
assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].args, ["architect-context"]);
assert.match(h.messages[0], /deterministic TOON/); assert.match(h.messages[0], /open-ended conversation/);
assert.match(h.messages[0], /Observer health is informational only/);
assert.deepEqual(injectedContext(h.messages[0]), openedContext);
assert.equal(injectedContext(h.messages[0]).findings[0].title, "Cross source 😀");
assert.equal(injectedContext(h.messages[0]).context_id, contextId);
assert.deepEqual(injectedContext(h.messages[0]).findings.flatMap((finding) => finding.occurrences.map(({ occurrence_id }) => occurrence_id)),
  [a1.occurrence_id, a2.occurrence_id, b1.occurrence_id]);
assert.equal(injectedContext(h.messages[0]).pending_intakes.length, 0);
assert.deepEqual(injectedContext(h.messages[0]).observer_health, observerHealth);
assert.equal(h.messages[0].includes(JSON.stringify(openedContext)), false, "Architect injected compact JSON instead of TOON");
assert.equal(h.commands.has("architect-discussed"), false, "round compatibility command was advertised");
assert.ok(h.tools.get("architect_disposition").parameters.required.includes("decisions"), "confirm could omit the proposed decisions");

// Proposal reloads current evidence and remains read-only.
h.queue.push(result(context()));
const proposed = await h.tool(params);
assert.equal(proposed.details.status, "proposed"); assert.match(proposed.content[0].text, /Confirm this exact batch\?/);
assert.match(proposed.content[0].text, /Agreed cross-Repository scope/);
assert.equal(h.calls.filter((call) => call.args[0] !== "architect-context").length, 0);

// Same-turn, negative, unrelated, mismatched text, and altered decisions all refuse without mutation and retain proposal.
h.queue.push(result(context()));
assert.equal((await h.tool({ ...params, action: "confirm" })).details.status, "refused");
await h.input("No, hold this."); h.queue.push(result(context()));
assert.equal((await h.tool({ ...params, action: "confirm", operator_confirmation: "No, hold this." })).details.status, "refused");
await h.input("What about another issue?"); h.queue.push(result(context()));
assert.equal((await h.tool({ ...params, action: "confirm", operator_confirmation: "What about another issue?" })).details.status, "refused");
await h.input("Yes"); h.queue.push(result(context()));
assert.equal((await h.tool({ ...params, action: "confirm", operator_confirmation: "Okay" })).details.status, "refused");
const altered = structuredClone(params); altered.decisions[0].scope = "Altered scope";
h.queue.push(result(context()));
assert.equal((await h.tool({ ...altered, action: "confirm", operator_confirmation: "Yes" })).details.status, "refused");
assert.equal(h.calls.filter((call) => call.args[0] === "prepare-handoff").length, 0);

// One later exact affirmative confirms, prepares immutably, then starts exactly one recipient and records one attempt.
let writtenDecisions;
h.queue.push(result(context()), async (call) => { writtenDecisions = JSON.parse(await readFile(call.args[4], "utf8")); return result({ status: "confirmed", batch_dir: `/state/architect/batches/${batchId}`, handoff_path: `/state/architect/batches/${batchId}/handoff.json`, batch: { batch_id: batchId, context_id: contextId, handoff_id: handoffId } }); },
  result(pendingContext), result({ schema: "qq-handoff/v1", version: 1, engine: "qq-handoff", action: "intake-start", status: "done", transaction: { created_tab_id: "w:t" }, handoff_id: handoffId }), result({ status: "recorded" }));
const confirmed = await h.tool({ ...params, action: "confirm", operator_confirmation: "Yes" });
assert.equal(confirmed.details.status, "routed"); assert.deepEqual(writtenDecisions, decisions);
assert.equal(h.calls.filter((call) => call.command === "qq-handoff").length, 1);
assert.deepEqual(h.calls.at(-1).args.slice(0, 3), ["record-handoff-attempt", "--batch", `/state/architect/batches/${batchId}`]);
const beforeReplay = h.calls.length;
assert.equal((await h.tool({ ...params, action: "confirm", operator_confirmation: "Yes" })).details.status, "refused");
assert.equal(h.calls.length, beforeReplay, "replay reloaded or wrote state after pending proposal was consumed");

// An uncertain start is recorded, remains pending on the next /architect, and exact explicit retry reuses the handoff without preparing a new batch.
const u = harness([result(context()), result(context())]);
await u.commands.get("architect").handler("", u.ctx);
assert.equal((await u.tool(params)).details.status, "proposed"); await u.input("Yes");
u.queue.push(result(context()), result({ status: "confirmed", batch_dir: pendingIntake.batch_dir, handoff_path: pendingIntake.handoff_path,
  batch: { batch_id: batchId, context_id: contextId, handoff_id: handoffId } }), result(pendingContext), result("not-json", 70, "start uncertain"), result({ status: "recorded" }));
assert.equal((await u.tool({ ...params, action: "confirm", operator_confirmation: "Yes" })).details.status, "pending");
const attemptedPendingContext = { ...pendingContext, pending_intakes: [{ ...pendingIntake, status: "attempted_awaiting_result", attempt_statuses: ["error"], attempt_paths: [`${pendingIntake.batch_dir}/attempts/attempt-${"a".repeat(64)}.json`] }] };
u.queue.push(result(attemptedPendingContext));
await u.commands.get("architect").handler("", u.ctx);
assert.match(u.messages.at(-1), /already operator-settled/);
const injectedPending = injectedContext(u.messages.at(-1));
assert.deepEqual(injectedPending, attemptedPendingContext);
assert.equal(injectedPending.context_id, pendingContextId);
assert.equal(injectedPending.pending_intakes[0].status, "attempted_awaiting_result");
assert.equal(injectedPending.pending_intakes[0].batch_id, batchId);
assert.equal(injectedPending.pending_intakes[0].handoff_id, handoffId);
assert.deepEqual(injectedPending.pending_intakes[0].occurrences.map(({ occurrence_id }) => occurrence_id),
  [a1.occurrence_id, a2.occurrence_id, b1.occurrence_id]);
u.queue.push(result(attemptedPendingContext));
assert.equal((await u.tool({ action: "propose", context_id: pendingContextId, decisions })).details.status, "refused", "pending decisions were re-proposable");
await u.input(`retry ${batchId}`);
u.queue.push(result(attemptedPendingContext),
  result({ schema: "qq-handoff/v1", version: 1, engine: "qq-handoff", action: "intake-start", status: "refused", message: "live recipient", handoff_id: handoffId }), result({ status: "recorded" }));
const retried = await u.tool({ action: "retry", context_id: pendingContextId, decisions: pendingDecisions,
  batch_id: batchId, handoff_id: handoffId, operator_request: `retry ${batchId}` });
assert.equal(retried.details.status, "pending");
assert.equal(u.calls.filter((call) => call.args[0] === "prepare-handoff").length, 1, "retry prepared another batch");
assert.equal(u.calls.filter((call) => call.command === "qq-handoff" && call.args[2] === pendingIntake.handoff_path).length, 2, "retry changed the immutable handoff");
// A verified result removes pending state on the next context.
u.queue.push(result(context(`context-${"9".repeat(32)}`, [])));
await u.commands.get("architect").handler("", u.ctx);
assert.equal(injectedContext(u.messages.at(-1)).pending_intakes.length, 0);

// Set-aside-only confirmation records selective state but starts no intake.
const s = harness([result(context()), result(context())]);
await s.commands.get("architect").handler("", s.ctx);
const setAside = [{ recurrence_key: "other-key", occurrence_ids: [b1.occurrence_id], action: "set_aside", scope: "", note: "Explicitly settled." }];
const sp = { action: "propose", context_id: contextId, decisions: setAside };
assert.equal((await s.tool(sp)).details.status, "proposed"); await s.input("Okay");
s.queue.push(result(context()), result({ status: "confirmed", batch_dir: "/state/architect/batches/batch-dddddddddddddddddddddddddddddddd", handoff_path: null,
  batch: { batch_id: "batch-dddddddddddddddddddddddddddddddd", context_id: contextId } }));
assert.equal((await s.tool({ ...sp, action: "confirm", operator_confirmation: "Okay" })).details.status, "settled");
assert.equal(s.calls.some((call) => call.command === "qq-handoff"), false);

// Changed context, wrong context, duplicate key/occurrence, and malformed scope refuse.
for (const bad of [
  [{ ...decisions[0], action: "set_aside", scope: "still scoped" }],
  [decisions[0], { ...decisions[0], occurrence_ids: [b1.occurrence_id] }],
  [{ ...decisions[0], occurrence_ids: [a1.occurrence_id, a1.occurrence_id] }],
]) {
  const x = harness([result(context()), result(context())]); await x.commands.get("architect").handler("", x.ctx);
  assert.equal((await x.tool({ action: "propose", context_id: contextId, decisions: bad })).details.status, "refused");
  assert.equal(x.calls.length, 2);
}
const stale = harness([result(context()), result(context(`context-${"e".repeat(32)}`))]);
await stale.commands.get("architect").handler("", stale.ctx);
assert.equal((await stale.tool(params)).details.status, "refused");
const wrong = harness([result(context())]); await wrong.commands.get("architect").handler("", wrong.ctx);
assert.equal((await wrong.tool({ ...params, context_id: `context-${"f".repeat(32)}` })).details.status, "refused"); assert.equal(wrong.calls.length, 1);

const unpairedSurrogateContext = structuredClone(context());
unpairedSurrogateContext.findings[0].title = JSON.parse('"\\ud800"');
const malformedHealthContext = structuredClone(context());
malformedHealthContext.observer_health.rounds[0].status = "covered";
for (const bad of [result("not-json"), result("", 65, "bad store"), result(unpairedSurrogateContext), result(malformedHealthContext)]) {
  const x = harness([bad]); await x.commands.get("architect").handler("", x.ctx);
  assert.equal(x.messages.length, 0); assert.match(x.notifications[0].message, /Cannot load Architect context/);
  assert.equal(x.notifications[0].level, "error");
}
const headless = harness([], { hasUI: false }); await headless.commands.get("architect").handler("", headless.ctx); assert.equal(headless.calls.length, 0);
console.log("test-qq-architect-extension: pass");
JS
printf 'test-qq-architect-extension: pass\n'
