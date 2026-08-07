#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-actor-messaging"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
ADAPTER="$ROOT/extensions/qq-actor-messaging.ts"
METHODOLOGY="$ROOT/extensions/qq-methodology.ts"
SKILL="$ROOT/skills/agent-messaging/SKILL.md"
CONCEPTS="$ROOT/CONCEPTS.md"

[[ -f "$ADAPTER" ]] || fail "missing adapter extension"
[[ -f "$ROOT/tests/probes/qq-actor-messaging-live.sh" ]] || fail "missing disposable live probe"
[[ -x "$ROOT/tests/probes/qq-actor-messaging-live.sh" ]] || fail "live probe is not executable"

grep -F '"./qq-actor-messaging.ts"' "$METHODOLOGY" >/dev/null || fail 'methodology does not mount the adapter sibling'
grep -F 'await invokeSiblingRegister' "$METHODOLOGY" >/dev/null || fail 'methodology does not await async sibling factories'

assert_file_contains "$SKILL" 'Self-service first' 'interim Skill lacks evidence-first rule'
assert_file_contains "$SKILL" 'one plain nonblocking message' 'interim Skill lacks one-way Coordinator escalation'
assert_file_contains "$SKILL" 'exactly one exchange' 'interim Skill lacks bounded broker exchange'
assert_file_contains "$SKILL" 'Do not use intercom `ask` or `reply`' 'interim Skill permits ask/reply'
assert_file_contains "$SKILL" 'Herdr remains the operator-notification surface' 'interim Skill lost Herdr notification rule'
assert_file_not_matches "$SKILL" 'intercom\(\{ action: "(ask|reply)"' 'interim Skill demonstrates ask/reply'
assert_file_not_matches "$SKILL" 'Use `ask`' 'interim Skill retains old ask instruction'

assert_file_contains "$CONCEPTS" 'one plain nonblocking message' 'shared vocabulary lacks one-way escalation'
assert_file_contains "$CONCEPTS" 'request/return/forward' 'shared vocabulary lacks bounded broker exchange'
assert_file_contains "$CONCEPTS" 'No intercom `ask`/`reply`' 'shared vocabulary permits ask/reply'
assert_file_contains "$CONCEPTS" 'Herdr' 'shared vocabulary lost operator notification'

# Bounded synchronous CLI invocation (execFile) of the landed T-189 binding and
# Herdr authorities is integration, not messaging infrastructure; the adapter
# must still add no daemon spawn, watcher, timer, polling loop, mailbox,
# registry, or automatic transport fallback of its own.
assert_file_not_matches "$ADAPTER" 'spawn|watch\(|setInterval|polling|mailbox|registry|fallback' 'adapter contains forbidden daemon/watch/polling/registry/fallback surface'
assert_file_not_matches "$ADAPTER" 'pi-intercom|subagents|Router|settings\.json|packages' 'adapter touches incumbent/settings/package/Router surface'
assert_file_contains "$ADAPTER" 'qq.actor-messaging-enable/v1' 'adapter enable schema is missing'
assert_file_contains "$ADAPTER" 'EventPlaneClient' 'adapter does not use the landed TypeScript client'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node --input-type=module - "$ADAPTER" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [adapterPath, scratch] = process.argv.slice(2);
const adapter = await import(pathToFileURL(adapterPath));
const { default: register, enableRecordPath, readEnableRecord } = adapter;

const home = join(scratch, "home");
const xdg = join(home, ".config");
mkdirSync(xdg, { recursive: true, mode: 0o700 });
chmodSync(home, 0o700);
chmodSync(xdg, 0o700);
const env = { HOME: home, XDG_CONFIG_HOME: xdg };
const path = enableRecordPath(env);
assert.equal(path, join(xdg, "qq", "actor-messaging", "enable.json"));

function piHarness() {
  const calls = [];
  const handlers = new Map();
  return {
    calls,
    handlers,
    pi: {
      on(name, handler) { calls.push(["on", name]); handlers.set(name, handler); },
      registerTool(tool) { calls.push(["tool", tool.name]); this.tool = tool; },
      registerCommand(name) { calls.push(["command", name]); },
      sendMessage(message, options) { calls.push(["message", message.customType, options]); },
      appendEntry(type) { calls.push(["entry", type]); },
      setActiveTools(names) { calls.push(["tools", names]); },
    },
  };
}

async function assertInert(label, deps) {
  const h = piHarness();
  await register(h.pi, deps);
  assert.deepEqual(h.calls, [], `${label} was not production-inert`);
}

await assertInert("missing enable record", { env });
await assertInert("explicit null injection", { enableRecord: null, env });

mkdirSync(join(xdg, "qq", "actor-messaging"), { recursive: true, mode: 0o700 });
chmodSync(join(xdg, "qq"), 0o700);
chmodSync(join(xdg, "qq", "actor-messaging"), 0o700);
const valid = {
  schema: "qq.actor-messaging-enable/v1",
  version: 1,
  enabled: true,
  product_id: "qq",
  event_plane_socket: join(scratch, "state", "event-plane.sock"),
  actor: { role: "change_owner", change: "T-209.17", pane: "w:p1", session_file: join(scratch, "session.jsonl"), session_id: "session-a" },
};
const writeRecord = (value, mode = 0o600) => {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode });
  chmodSync(path, mode);
};
for (const [label, mutate] of [
  ["disabled", (record) => ({ ...record, enabled: false })],
  ["unsupported schema", (record) => ({ ...record, schema: "wrong" })],
  ["unsupported version", (record) => ({ ...record, version: 2 })],
  ["malformed enabled", (record) => ({ ...record, enabled: "true" })],
  ["bad product", (record) => ({ ...record, product_id: "QQ" })],
  ["relative socket", (record) => ({ ...record, event_plane_socket: "state.sock" })],
  ["bad role", (record) => ({ ...record, actor: { ...record.actor, role: "operator" } })],
  ["missing change", (record) => ({ ...record, actor: { ...record.actor, change: undefined } })],
  ["bad pane", (record) => ({ ...record, actor: { ...record.actor, pane: "bad pane" } })],
  ["relative session", (record) => ({ ...record, actor: { ...record.actor, session_file: "session.jsonl" } })],
]) {
  writeRecord(mutate(valid));
  if (label === "disabled") {
    assert.equal(await readEnableRecord(env), undefined);
    await assertInert(label, { env });
  } else {
    await assert.rejects(readEnableRecord(env), /./, label);
    await assertInert(label, { env });
  }
}
writeRecord(valid, 0o644);
await assert.rejects(readEnableRecord(env), /private regular file/);
writeRecord(valid);
await assert.equal((await readEnableRecord(env)).actor.change, "T-209.17");

// Duplicate keys are refused without trusting JavaScript's lossy parser.
writeFileSync(path, '{"schema":"qq.actor-messaging-enable/v1","schema":"other","version":1,"enabled":true,"product_id":"qq","event_plane_socket":"/tmp/s.sock","actor":{"role":"architect","pane":"w:p1"}}\n', { mode: 0o600 });
chmodSync(path, 0o600);
await assert.rejects(readEnableRecord(env), /duplicate field/);

// Namespace and file-link ambiguity fail closed.
writeRecord(valid);
const linkPath = join(scratch, "linked-config");
symlinkSync(xdg, linkPath);
await assert.rejects(readEnableRecord({ ...env, XDG_CONFIG_HOME: linkPath }), /symlink|canonical/);
const stale = join(scratch, "stale.sock");
writeRecord({ ...valid, event_plane_socket: stale });
assert.equal((await readEnableRecord(env)).event_plane_socket, stale);

console.log("enable-record and inertness checks pass");
JS

node --input-type=module - "$ADAPTER" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [adapterPath, scratch] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(adapterPath));

const socket = join(scratch, "event-plane.sock");
const sessionFile = join(scratch, "session.jsonl");
const record = {
  schema: "qq.actor-messaging-enable/v1",
  version: 1,
  enabled: true,
  product_id: "qq",
  event_plane_socket: socket,
  actor: { role: "change_owner", change: "T-209.17", pane: "w:p1", session_file: sessionFile, session_id: "session-a" },
};

const calls = { send: [], publish: [], next: [], acknowledge: [], retry: [], block: [], status: [] };
let deliveries = [];
let postNextBindingBarrier;
let bindingBarrier;
let bindingBarrierStarted = false;
let acknowledgementGuardBarrier;
let acknowledgementGuardStarted = false;
let statusResult = { record: { event_id: "evt_out" }, obligations: [{ status: "pending" }], terminal: false, terminal_failure: false };
const publishedRequests = new Map();
const sentRequests = new Map();
let sendResponseLosses = 0;
let attentionBarrier;
let attentionStarted = false;
let attentionFailures = 0;
let settleBeforeCriticalEffect = false;
let replaceWithSuccessorBeforeCriticalEffect = false;
let successorSignal;
let criticalClaimResponseLosses = 0;
const client = {
  send(body) {
    calls.send.push(body);
    const key = `${body.producer_id}\0${body.request_id}`;
    const normalized = JSON.stringify(body);
    const prior = sentRequests.get(key);
    if (prior) {
      if (prior.normalized !== normalized) throw Object.assign(new Error("idempotency conflict"), { code: "idempotency_conflict" });
      return { accepted: true, idempotent: true, obligation_count: 1, record: prior.record };
    }
    const sentRecord = { event_id: `evt_${calls.send.length}`, ...body, envelope: body };
    sentRequests.set(key, { normalized, record: sentRecord });
    if (sendResponseLosses > 0) {
      sendResponseLosses -= 1;
      throw Object.assign(new Error("send response lost after acceptance"), { code: "transport_error" });
    }
    return { accepted: true, idempotent: false, obligation_count: 1, record: sentRecord };
  },
  publish(body) {
    if (body.kind === "attention-needed" && attentionBarrier) {
      const barrier = attentionBarrier;
      attentionBarrier = undefined;
      attentionStarted = true;
      return barrier.then(() => client.publish(body));
    }
    calls.publish.push(body);
    if (body.kind === "attention-needed" && attentionFailures > 0) {
      attentionFailures -= 1;
      throw Object.assign(new Error("transient attention publication outage"), { code: "unavailable" });
    }
    if (body.kind === "pi.critical-abort" && settleBeforeCriticalEffect) {
      settleBeforeCriticalEffect = false;
      idle = true;
    }
    if (body.kind === "pi.critical-abort" && replaceWithSuccessorBeforeCriticalEffect) {
      replaceWithSuccessorBeforeCriticalEffect = false;
      successorSignal = { aborted: false };
      currentSignal = successorSignal;
      idle = false;
    }
    const key = `${body.producer_id}\0${body.request_id}`;
    const normalized = JSON.stringify(body);
    const prior = publishedRequests.get(key);
    if (prior) {
      if (prior.normalized !== normalized) throw Object.assign(new Error("idempotency conflict"), { code: "idempotency_conflict" });
      return { accepted: true, idempotent: true, obligation_count: 0, record: prior.record };
    }
    const record = { event_id: `fact_${calls.publish.length}`, ...body, envelope: body };
    publishedRequests.set(key, { normalized, record });
    if (body.kind === "pi.critical-abort" && criticalClaimResponseLosses > 0) {
      criticalClaimResponseLosses -= 1;
      throw Object.assign(new Error("critical claim response lost after acceptance"), { code: "transport_error" });
    }
    return { accepted: true, idempotent: false, obligation_count: 0, record };
  },
  async next(body) {
    calls.next.push(body);
    await new Promise((resolveTick) => setTimeout(resolveTick, 1));
    const nextDelivery = deliveries.shift() ?? null;
    if (nextDelivery && postNextBindingBarrier) {
      bindingBarrier = postNextBindingBarrier;
      postNextBindingBarrier = undefined;
    }
    return { delivery: nextDelivery, rebound: calls.next.length === 1 };
  },
  acknowledge(body) { calls.acknowledge.push(body); return { acknowledged: true, record_status: { terminal: true } }; },
  retry(body) { calls.retry.push(body); return { obligation: { status: "pending" } }; },
  block(body) { calls.block.push(body); return { obligation: { status: "blocked" } }; },
  status(body) {
    calls.status.push(body);
    if (body.producer_id && body.request_id) {
      const prior = publishedRequests.get(`${body.producer_id}\0${body.request_id}`);
      if (!prior) throw Object.assign(new Error("not found"), { code: "not_found" });
      return { record: prior.record, obligations: [], terminal: true, terminal_failure: false };
    }
    return statusResult;
  },
};

let sessionText = "";
let receiptText = "";
let receiptLive = false;
let receiptError = false;
let freshSessionMissing = false;
let persistMessages = true;
let sendBarrier;
const messageWrites = [];
const tool = { value: undefined };
const handlers = new Map();
let aborted = 0;
let idle = false;
let currentSignal = { aborted: false };
const ctx = {
  hasUI: true,
  isIdle: () => idle,
  get signal() { return currentSignal; },
  abort: () => { aborted += 1; currentSignal.aborted = true; idle = true; },
  sessionManager: {
    getSessionFile: () => sessionFile,
    getSessionId: () => "session-a",
    isPersisted: () => true,
    getEntries: () => freshSessionMissing ? [{ type: "thinking_level_change", id: "startup" }] : [{ type: "custom_message", id: "persisted" }],
  },
  ui: { notify() {} },
};
const pi = {
  on(name, handler) { handlers.set(name, handler); },
  registerTool(definition) { tool.value = definition; },
  async sendMessage(message, options) {
    messageWrites.push({ message, options });
    const barrier = sendBarrier;
    if (barrier) await barrier;
    const details = message.details;
    if (persistMessages) {
      sessionText += `${JSON.stringify({ type: "custom_message", id: `entry_${messageWrites.length}`, parentId: "root", customType: message.customType, content: message.content, details })}\n`;
    }
    return `entry_${messageWrites.length}`;
  },
};
const binding = {
  state: "current",
  record: { current: { pane_id: "w:p1", runtime_active: true, read_only: false } },
};
const bindingCall = async (action, facts) => {
  if (action === "classify" && bindingBarrier) {
    const barrier = bindingBarrier;
    bindingBarrier = undefined;
    bindingBarrierStarted = true;
    await barrier;
  }
  if (action === "guard" && acknowledgementGuardBarrier) {
    const barrier = acknowledgementGuardBarrier;
    acknowledgementGuardBarrier = undefined;
    acknowledgementGuardStarted = true;
    await barrier;
  }
  return action === "classify" ? { value: binding } : { value: binding.record };
};
const panes = [{ pane_id: "w:p1", agent: "pi", agent_session: { value: sessionFile } }];
await register(pi, {
  enableRecord: record,
  clientFactory: () => client,
  bindingCall,
  listPanes: async () => panes,
  actorAuthorities: async () => [
    { id: "T-209.17", assignee: "subagent-chat-019fd7bb" },
    { id: "T-189", assignee: "subagent-chat-t189" },
  ],
  sessionRead: async () => {
    if (freshSessionMissing) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    if (receiptError) throw Object.assign(new Error("EIO"), { code: "EIO" });
    return receiptLive ? sessionText : receiptText;
  },
  sleep: async () => {},
  abortableSleep: async () => {},
});
assert.ok(tool.value, "enabled adapter did not register its messaging tool");
assert.deepEqual(tool.value.parameters.properties.urgency.enum, ["default", "urgent"], "model-facing tool can select critical urgency");
assert.equal(tool.value.parameters.properties.critical, undefined, "model-facing tool exposes a critical selector");
assert.equal(tool.value.parameters.properties.wait_ms.maximum, 30000, "status wait exceeds the landed Event Plane protocol");
await handlers.get("session_start")({ reason: "startup" }, ctx);
// The receiver loop runs as a background task after session_start resolves;
// with a synchronously-resolving fake client its first next() may already be queued.

const published = await tool.value.execute("p0", { action: "publish", kind: "task.changed", payload: { fact: "changed" }, request_id: "req_fact" }, undefined, undefined, ctx);
assert.equal(published.details.status, "accepted");
const factPublication = calls.publish.find((entry) => entry.kind === "task.changed");
assert.ok(factPublication, "task.changed fact was never published");
assert.equal(factPublication.request_id, "req_fact");
assert.ok(calls.publish.some((entry) => entry.kind === "pi.lifecycle"), "session_start did not publish the lifecycle fact");

const actors = await tool.value.execute("l0", { action: "list_actors" }, undefined, undefined, ctx);
assert.ok(Array.isArray(actors.details.actors), "list_actors did not return an array");
assert.ok(actors.details.actors.some((candidate) => candidate.actor === "qq/change/T-209.17"), "list_actors omits the Active Change Owner");

const sent = await tool.value.execute("s0", { action: "send", recipient: "qq/change/T-189", content: "please inspect", request_id: "req_send" }, undefined, undefined, ctx);
assert.equal(sent.details.transport, "accepted");
assert.equal(calls.send[0].recipient_id, "qq/change/T-189");
const question = await tool.value.execute("q0", { action: "question", recipient: "qq/change/T-189", content: "question?", request_id: "req_question" }, undefined, undefined, ctx);
assert.equal(question.details.event_id, "evt_2");
assert.match(question.details.correlation_id, /^corr_/);
assert.equal(calls.send[1].correlation_id, question.details.correlation_id, "question correlation was absent from the Event Plane envelope");
const reply = await tool.value.execute("r0", { action: "reply", recipient: "qq/change/T-189", content: "answer", correlation_id: question.details.correlation_id, request_id: "req_reply" }, undefined, undefined, ctx);
assert.equal(reply.details.event_id, "evt_3");
const refused = await tool.value.execute("bad", { action: "send", recipient: "qq/random/session", content: "no" }, undefined, undefined, ctx);
assert.equal(refused.details.status, "refused");
assert.match(refused.details.reason, /current accountable Actor/);
const unknownChange = await tool.value.execute("unknown-change", { action: "send", recipient: "qq/change/T-does-not-exist", content: "no" }, undefined, undefined, ctx);
assert.equal(unknownChange.details.status, "refused", "syntax-only Change identity gained durable unsolicited custody");
const criticalFromModel = await tool.value.execute("model-critical", { action: "send", recipient: "qq/coordinator", content: "no", urgency: "critical", critical: true }, undefined, undefined, ctx);
assert.equal(criticalFromModel.details.status, "refused", "model selected critical urgency");

function delivery(eventId, content, { urgency = "default", kind = "message", correlation = "corr-in", origin = "qq/coordinator", outerKind = "actor.message", outerOrigin = origin } = {}) {
  const recipient = "qq/change/T-209.17";
  return {
    record: {
      event_id: eventId,
      record_type: "send",
      product_id: "qq",
      kind: outerKind,
      origin_id: outerOrigin,
      recipient_id: recipient,
      schema_version: 1,
      envelope: {
        record_type: "send",
        product_id: "qq",
        kind: outerKind,
        origin_id: outerOrigin,
        recipient_id: recipient,
        schema_version: 1,
        correlation_id: correlation,
        payload: {
          schema: "qq.actor-message/v1",
          record: { origin_id: origin, content, kind, correlation_id: correlation, urgency, critical: urgency === "critical" },
        },
      },
    },
    obligation: { obligation_id: `obl_${eventId}`, consumer_type: "recipient", consumer_id: "qq/change/T-209.17", generation: 0, status: "in_flight" },
    attempt_token: `try_${eventId}`,
    endpoint_token: calls.next[0]?.endpoint_token,
    guard: { expected_high_water: 0, expected_gap_token: "0".repeat(64), gaps: [] },
  };
}
const tick = () => new Promise((resolveTick) => setTimeout(resolveTick, 25));

// A brand-new Pi session has an allocated path before its JSONL exists. Pi's
// metadata-only loaded state proves an empty scan and must not deadlock delivery.
idle = true;
freshSessionMissing = true;
deliveries.push(delivery("evt_default", "default body"));
await tick();
freshSessionMissing = false;
assert.equal(calls.acknowledge.length, 0, "acknowledged before any readback existed");
assert.match(messageWrites[0].message.content, /evt_default/);
receiptText = sessionText;
await handlers.get("turn_start")({}, ctx);
await tick();
assert.equal(calls.acknowledge.length, 1);
assert.match(sessionText, /entry_1/);

// Restart reconstruction: redelivering an already-persisted obligation does not
// inject a duplicate; it acknowledges the existing receipt.
const writesBeforeRestart = messageWrites.length;
deliveries.push(delivery("evt_default", "default body"));
await tick();
assert.equal(messageWrites.length, writesBeforeRestart, "restart redelivery injected a duplicate custom message");
assert.equal(calls.acknowledge.length, 2, "restart redelivery did not acknowledge the reconstructed receipt");

// Outer Event Plane identity and the inner actor payload are one authority.
// A mismatched kind or origin is blocked before rendering or acknowledgement.
const writesBeforeMalformed = messageWrites.length;
deliveries.push(delivery("evt_wrong_kind", "wrong kind", { outerKind: "task.changed" }));
await tick();
deliveries.push(delivery("evt_spoofed_origin", "spoofed origin", { origin: "qq/client/spoofed", outerOrigin: "qq/client/actual" }));
await tick();
assert.ok(calls.block.some((body) => body.event_id === "evt_wrong_kind"), "non-actor outer kind was accepted");
assert.ok(calls.block.some((body) => body.event_id === "evt_spoofed_origin"), "outer/inner origin mismatch was accepted");
assert.equal(messageWrites.length, writesBeforeMalformed, "malformed envelope entered the Pi transcript");

// Urgent attention is a best-effort hint. Even a publication call that remains
// unresolved must not hold transcript delivery or acknowledgement.
let releaseAttention;
attentionStarted = false;
attentionBarrier = new Promise((resolve) => { releaseAttention = resolve; });
receiptLive = true;
const writesBeforeDelayedAttention = messageWrites.length;
deliveries.push(delivery("evt_attention_delayed", "delayed attention", { urgency: "urgent" }));
await tick();
assert.equal(attentionStarted, true, "urgent attention attempt did not start");
assert.equal(messageWrites.length, writesBeforeDelayedAttention + 1, "attention delay held message delivery");
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_attention_delayed"), "attention delay held acknowledgement");
releaseAttention();
await tick();
receiptLive = false;

// A steering promise can remain unsettled until Pi reaches its natural safe
// boundary. Lifecycle reentry and same-instance lease redelivery still submit
// only once; rare cross-reload duplicates are explicitly accepted.
receiptText = "";
receiptLive = false;
let resolveQueuedSend;
sendBarrier = new Promise((resolve) => { resolveQueuedSend = resolve; });
const writesBeforeQueue = messageWrites.length;
deliveries.push(delivery("evt_queued", "queued body"));
await tick();
assert.equal(messageWrites.length, writesBeforeQueue + 1, "steering injection did not start");
await handlers.get("agent_settled")({}, ctx);
assert.equal(messageWrites.length, writesBeforeQueue + 1, "lifecycle reentry duplicated an in-progress injection");
sendBarrier = undefined;
resolveQueuedSend();
await tick();
deliveries.push(delivery("evt_queued", "queued body"));
await tick();
assert.equal(messageWrites.length, writesBeforeQueue + 1, "same-instance lease redelivery duplicated a queued injection");

// Urgent publishes attention-needed, uses Pi steering's next safe boundary,
// and does not abort a busy run.
aborted = 0; idle = false;
deliveries.push(delivery("evt_urgent", "urgent body", { urgency: "urgent" }));
await tick();
assert.equal(aborted, 0);
const urgentFact = calls.publish.find((body) => body.kind === "attention-needed" && body.correlation_id === "evt_urgent");
assert.ok(urgentFact);
assert.equal(urgentFact.correlation_id, "evt_urgent", "urgent fact lost stable correlation");
assert.equal(messageWrites.find((write) => write.message.details.event_id === "evt_urgent")?.options?.deliverAs, "steer", "busy urgent delivery did not use Pi's next safe boundary");

// A transient attention failure is reported locally but never returns or holds
// message custody: the transcript entry and acknowledgement still complete.
attentionFailures = 1;
const retriesBeforeAttentionFailure = calls.retry.length;
const writesBeforeAttentionFailure = messageWrites.length;
receiptLive = true;
deliveries.push(delivery("evt_urgent_unavailable", "urgent unavailable body", { urgency: "urgent" }));
await tick();
assert.equal(calls.retry.length, retriesBeforeAttentionFailure, "best-effort attention failure retried message custody");
assert.equal(calls.publish.filter((body) => body.kind === "attention-needed" && body.correlation_id === "evt_urgent_unavailable").length, 1);
assert.equal(messageWrites.length, writesBeforeAttentionFailure + 1, "attention failure held transcript injection");
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_urgent_unavailable"), "attention failure held delivery acknowledgement");
receiptLive = false;

// Critical: fenced single abort attempt, transcript readback, truthful outcome.
idle = false;
receiptLive = true;
deliveries.push(delivery("evt_critical", "critical body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, 1, "critical did not make exactly one abort attempt");
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_critical"), "critical was not acknowledged after readback");
assert.ok(messageWrites.some((write) => write.message.content.includes("evt_critical")), "critical content never entered the transcript");
assert.equal(messageWrites.find((write) => write.message.details.event_id === "evt_critical")?.message.details.critical_outcome, "interrupted", "critical transcript did not use post-abort signal evidence");
assert.equal(calls.publish.filter((body) => body.kind === "pi.critical-abort" && body.payload.event_id === "evt_critical").length, 1, "critical claim was not stable");
receiptLive = false;

// The run may settle while the durable claim is being committed. Rechecking
// after that round trip must record abort-ignored and must not claim that an
// idle no-op interrupted anything.
idle = false;
currentSignal = { aborted: false };
settleBeforeCriticalEffect = true;
receiptLive = true;
const abortsBeforeSettledClaim = aborted;
deliveries.push(delivery("evt_critical_settled", "critical settled body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, abortsBeforeSettledClaim, "critical claim aborted after the target run had settled");
assert.equal(messageWrites.find((write) => write.message.details.event_id === "evt_critical_settled")?.message.details.critical_outcome, "abort-ignored");
receiptLive = false;

// A run that starts while claim acceptance is in flight is a successor, not
// the claimed target, and must never be aborted.
idle = false;
currentSignal = { aborted: false };
replaceWithSuccessorBeforeCriticalEffect = true;
receiptLive = true;
const abortsBeforeSuccessor = aborted;
deliveries.push(delivery("evt_critical_successor", "critical successor body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, abortsBeforeSuccessor, "critical claim aborted a successor run");
assert.equal(successorSignal?.aborted, false, "successor signal was aborted");
assert.equal(messageWrites.find((write) => write.message.details.event_id === "evt_critical_successor")?.message.details.critical_outcome, "abort-ignored");
receiptLive = false;

// Pre-append critical replay: the durable Event Plane audit claim, not process
// memory or transcript presence, makes the stable event at-most-one-abort.
persistMessages = false;
receiptLive = true;
idle = false;
currentSignal = { aborted: false };
const abortsBeforePreappendReplay = aborted;
deliveries.push(delivery("evt_critical_preappend", "critical before append", { urgency: "critical", kind: "action" }));
await tick();
deliveries.push(delivery("evt_critical_preappend", "critical before append", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, abortsBeforePreappendReplay + 1, "pre-append critical replay repeated the stable event's abort");
assert.equal(calls.publish.filter((body) => body.kind === "pi.critical-abort" && body.payload.event_id === "evt_critical_preappend").length, 1, "in-process critical redelivery republished its stable audit claim");
persistMessages = true;
receiptLive = false;

// If claim acceptance succeeds but the response/effect evidence is lost, replay
// never aborts a successor run and records the honest low-consequence outcome.
criticalClaimResponseLosses = 1;
idle = false;
currentSignal = { aborted: false };
const abortsBeforeUnknown = aborted;
deliveries.push(delivery("evt_critical_unknown", "critical unknown body", { urgency: "critical", kind: "action" }));
await tick();
assert.ok(calls.retry.some((body) => body.event_id === "evt_critical_unknown"), "response-lost critical claim did not return custody");
receiptLive = true;
deliveries.push(delivery("evt_critical_unknown", "critical unknown body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, abortsBeforeUnknown, "unknown critical replay aborted a successor run");
assert.equal(messageWrites.find((write) => write.message.details.event_id === "evt_critical_unknown")?.message.details.critical_outcome, "unknown");
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_critical_unknown"), "unknown critical replay did not deliver recognizably");
receiptLive = false;

// One-off initiated thread: a correlated reply returns to the exact live origin
// without granting it a durable accountable identity.
receiptLive = true;
deliveries.push(delivery("evt_oneoff", "one-off question", { correlation: "corr-oneoff", origin: "qq/client/live-1" }));
await tick();
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_oneoff"), "one-off inbound was not acknowledged");
sendResponseLosses = 1;
const lostOneoffReply = await tool.value.execute("reply-oneoff-lost", { action: "reply", correlation_id: "corr-oneoff", content: "one-off answer" }, undefined, undefined, ctx);
assert.equal(lostOneoffReply.details.status, "refused", "response-loss simulation did not reach the adapter");
const oneoffReply = await tool.value.execute("reply-oneoff-retry", { action: "reply", correlation_id: "corr-oneoff", content: "one-off answer" }, undefined, undefined, ctx);
assert.equal(oneoffReply.details.status, "accepted", `one-off reply retry refused: ${JSON.stringify(oneoffReply.details)}`);
const oneoffEnvelopes = calls.send.filter((body) => body.recipient_id === "qq/client/live-1");
assert.equal(oneoffEnvelopes.length, 2, "one-off retry did not exercise Event Plane idempotence");
assert.equal(oneoffEnvelopes[0].request_id, oneoffEnvelopes[1].request_id, "one-off retry changed request identity");
assert.equal(oneoffEnvelopes[0].deadline_at, oneoffEnvelopes[1].deadline_at, "one-off retry changed normalized deadline bytes");
assert.ok(Number.isInteger(oneoffEnvelopes[0].deadline_at) && oneoffEnvelopes[0].deadline_at > Date.now() && oneoffEnvelopes[0].deadline_at <= Date.now() + 30000, "one-off reply gained the durable one-hour unsolicited custody window");

// An inbound reply answers its question without conflating that application
// state with transport delivery or resolution.
deliveries.push(delivery("evt_answer", "answer received", { kind: "reply", correlation: question.details.correlation_id, origin: "qq/change/T-189" }));
await tick();
const answered = await tool.value.execute("status-answer", { action: "status", correlation_id: question.details.correlation_id }, undefined, undefined, ctx);
assert.equal(answered.details.state.answered, true);
assert.equal(answered.details.state.resolved, false);
assert.equal(answered.details.state.delivered, true);
receiptLive = false;

// Post-append critical restart: a persisted critical receipt is reconstructed
// before any abort, so redelivery does not interrupt a second run.
receiptLive = true;
const abortsBeforeCriticalRestart = aborted;
const criticalAcksBeforeRestart = calls.acknowledge.filter((body) => body.event_id === "evt_critical").length;
deliveries.push(delivery("evt_critical", "critical body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, abortsBeforeCriticalRestart, "critical restart aborted again before reconstructing the persisted receipt");
assert.equal(calls.acknowledge.filter((body) => body.event_id === "evt_critical").length, criticalAcksBeforeRestart + 1, "critical restart did not acknowledge the reconstructed receipt");
receiptLive = false;

// Fail-closed outbound: a session whose startup binding check is refused cannot
// send or publish under the configured Actor identity.
{
  const refusingMessages = [];
  const refusingHandlers = new Map();
  const refusingPi = {
    on(name, handler) { refusingHandlers.set(name, handler); },
    registerTool(definition) { this.tool = definition; },
    async sendMessage(message) { refusingMessages.push(message); return "entry_refusing"; },
  };
  await register(refusingPi, {
    enableRecord: record,
    clientFactory: () => client,
    bindingCall: async () => ({ value: undefined, reason: "accountable source fingerprints are unavailable" }),
    listPanes: async () => panes,
    sessionRead: async () => "",
    sleep: async () => {},
    abortableSleep: async () => {},
  });
  await refusingHandlers.get("session_start")({ reason: "startup" }, ctx).catch(() => {});
  const refusedSend = await refusingPi.tool.execute("blocked-send", { action: "send", recipient: "qq/coordinator", content: "unauthorized" }, undefined, undefined, ctx);
  assert.equal(refusedSend.details.status, "refused", "unauthorized session was allowed to send");
  const refusedPublish = await refusingPi.tool.execute("blocked-publish", { action: "publish", kind: "task.changed", payload: {} }, undefined, undefined, ctx);
  assert.equal(refusedPublish.details.status, "refused", "unauthorized session was allowed to publish");
  assert.equal(refusingMessages.length, 0, "unauthorized session injected a message");
}

// Read-failure fail-closed: a transient readback error before a critical abort
// returns custody to T-209.16 and cannot be bypassed by agent_settled.
{
  const abortsBeforeReadError = aborted;
  const writesBeforeReadError = messageWrites.length;
  receiptError = true;
  deliveries.push(delivery("evt_read_error", "read error body", { urgency: "critical", kind: "action" }));
  await tick();
  assert.equal(aborted, abortsBeforeReadError, "a read failure before a critical abort still interrupted a run");
  assert.ok(calls.retry.some((body) => body.event_id === "evt_read_error"), "read-failure critical was not retried");
  receiptError = false;
  await handlers.get("agent_settled")({}, ctx);
  await tick();
  assert.equal(messageWrites.length, writesBeforeReadError, "agent_settled bypassed the returned critical retry");
}

// Shutdown/replacement during the asynchronous T-189 acknowledgement guard
// must close the old session's final acknowledgement window.
let releaseAcknowledgementGuard;
acknowledgementGuardStarted = false;
acknowledgementGuardBarrier = new Promise((resolve) => { releaseAcknowledgementGuard = resolve; });
receiptLive = true;
const acknowledgementsBeforeShutdown = calls.acknowledge.length;
deliveries.push(delivery("evt_shutdown_ack", "shutdown acknowledgement body"));
await tick();
assert.equal(acknowledgementGuardStarted, true, "acknowledgement test did not reach T-189 guard");
await handlers.get("session_shutdown")({}, ctx);
releaseAcknowledgementGuard();
await tick();
assert.equal(calls.acknowledge.length, acknowledgementsBeforeShutdown, "old Pi session acknowledged after shutdown during T-189 guard");
receiptLive = false;
await handlers.get("session_start")({ reason: "test-resume" }, ctx);
await tick();

const status = await tool.value.execute("st0", { action: "status", event_id: "evt_out", wait_ms: 0 }, undefined, undefined, ctx);
assert.equal(status.details.status, "current");
assert.ok(calls.status.some((request) => request.event_id === "evt_out"));
const badWait = await tool.value.execute("st-bad-wait", { action: "status", event_id: "evt_out", wait_ms: 30001 }, undefined, undefined, ctx);
assert.equal(badWait.details.status, "refused", "status exceeded T-209.16's exact wait bound");

// Effect-boundary authorization: once the source goes stale, neither outbound
// effects nor receive/disposition effects can occur under the configured Actor.
{
  const sendsBefore = calls.send.length;
  const publishesBefore = calls.publish.length;
  const blocksBefore = calls.block.length;
  const retriesBefore = calls.retry.length;
  const writesBeforeStale = messageWrites.length;
  let releaseStalePostNext;
  bindingBarrierStarted = false;
  postNextBindingBarrier = new Promise((resolve) => { releaseStalePostNext = resolve; });
  deliveries.push(delivery("evt_stale", "stale body"));
  await tick();
  assert.equal(bindingBarrierStarted, true, "stale test did not reach the post-next authorization boundary");
  binding.state = "source_mismatch";
  releaseStalePostNext();
  const staleSend = await tool.value.execute("stale-send", { action: "send", recipient: "qq/coordinator", content: "stale outbound" }, undefined, undefined, ctx);
  assert.equal(staleSend.details.status, "refused", "stale source was allowed to send");
  assert.equal(calls.send.length, sendsBefore, "stale source reached the Event Plane send seam");
  const stalePublish = await tool.value.execute("stale-publish", { action: "publish", kind: "task.changed", payload: {} }, undefined, undefined, ctx);
  assert.equal(stalePublish.details.status, "refused", "stale source was allowed to publish");
  await tick();
  assert.equal(calls.publish.length, publishesBefore, "stale source reached the Event Plane publish seam");
  assert.equal(calls.block.length, blocksBefore, "stale receiver blocked an obligation after losing T-189 authority");
  assert.equal(calls.retry.length, retriesBefore, "stale receiver retried an obligation after losing T-189 authority");
  assert.equal(messageWrites.length, writesBeforeStale, "stale post-next provisional custody reached Pi injection");
}

await handlers.get("session_shutdown")({}, ctx);

// Production discovery consumes Backlog's canonical quoted @assignee scalar;
// tests must not bypass this parser through injected actor authorities.
const taskDirectory = join(scratch, "backlog", "tasks");
mkdirSync(taskDirectory, { recursive: true });
writeFileSync(join(taskDirectory, "t-214.1.md"), "---\nid: T-214.1\nstatus: Active\nassignee:\n  - '@subagent-chat-019fdb5e'\n---\n");
const discoveryHandlers = new Map();
let discoveryTool;
const discoveryClient = {
  publish(body) { return { accepted: true, idempotent: false, record: { event_id: "fact_discovery", ...body, envelope: body } }; },
  next() { return new Promise(() => {}); },
};
const discoveryPi = {
  on(name, handler) { discoveryHandlers.set(name, handler); },
  registerTool(value) { discoveryTool = value; },
};
const discoveryContext = { ...ctx, signal: { aborted: false }, isIdle: () => true };
const discoveryBinding = { ...binding, state: "current" };
await register(discoveryPi, {
  cwd: scratch,
  env: { QQ_ACTOR_MESSAGING_ENABLE: join(scratch, "enable.json") },
  enableRecord: record,
  clientFactory: () => discoveryClient,
  bindingCall: async (action) => action === "inspect"
    ? { value: { current: { pane_id: "w:p214", runtime_active: true, read_only: false } } }
    : action === "classify" ? { value: discoveryBinding } : { value: discoveryBinding.record },
  listPanes: async () => [{ pane_id: "w:p214", agent: "pi", agent_session: { value: sessionFile } }],
  sessionRead: async () => "",
});
await discoveryHandlers.get("session_start")({ reason: "discovery-test" }, discoveryContext);
const discovered = await discoveryTool.execute("discover-canonical-assignee", { action: "list_actors" }, undefined, undefined, discoveryContext);
assert.ok(discovered.details.actors.some((actor) => actor.actor === "qq/change/T-214.1"), "canonical quoted Backlog assignee was omitted");
await discoveryHandlers.get("session_shutdown")({}, discoveryContext);

console.log("adapter behavior checks pass");
JS

node --input-type=module - "$METHODOLOGY" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const [methodologyPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(methodologyPath));
const calls = [];
let asyncRan = false;
await register({ on(name) { calls.push(["on", name]); }, registerTool(tool) { calls.push(["tool", tool.name]); } }, {
  cwd: "/tmp/nonexistent",
  inspectLink: async () => ({ linked: true, state: "linked" }),
  bundleRoot: "/tmp",
  readFile: async (path) => path.endsWith("AGENTS.md") ? "agents" : "concepts",
  siblingRegisters: [async (pi) => { asyncRan = true; pi.registerTool({ name: "async_tool" }); }],
  watch: () => ({ on() {}, close() {} }),
});
assert.equal(asyncRan, true);
assert.ok(calls.some(([kind, value]) => kind === "tool" && value === "async_tool"));
console.log("methodology async mount check pass");
JS

printf 'test-qq-actor-messaging: pass\n'
