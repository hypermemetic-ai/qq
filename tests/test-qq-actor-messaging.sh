#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
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
import { writeFileSync } from "node:fs";
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
let statusResult = { record: { event_id: "evt_out" }, obligations: [{ status: "pending" }], terminal: false, terminal_failure: false };
const client = {
  send(body) { calls.send.push(body); return { accepted: true, idempotent: false, obligation_count: 1, record: { event_id: `evt_${calls.send.length}`, ...body, envelope: body } }; },
  publish(body) { calls.publish.push(body); return { accepted: true, idempotent: false, obligation_count: 0, record: { event_id: `fact_${calls.publish.length}`, ...body, envelope: body } }; },
  async next(body) { calls.next.push(body); await new Promise((resolveTick) => setTimeout(resolveTick, 1)); return { delivery: deliveries.shift() ?? null, rebound: calls.next.length === 1 }; },
  acknowledge(body) { calls.acknowledge.push(body); return { acknowledged: true, record_status: { terminal: true } }; },
  retry(body) { calls.retry.push(body); return { obligation: { status: "pending" } }; },
  block(body) { calls.block.push(body); return { obligation: { status: "blocked" } }; },
  status(body) { calls.status.push(body); return statusResult; },
};

let sessionText = "";
let receiptText = "";
let receiptLive = false;
const messageWrites = [];
const tool = { value: undefined };
const handlers = new Map();
let aborted = 0;
let idle = false;
const ctx = {
  hasUI: true,
  isIdle: () => idle,
  abort: async () => { aborted += 1; idle = true; },
  sessionManager: {
    getSessionFile: () => sessionFile,
    getSessionId: () => "session-a",
  },
  ui: { notify() {} },
};
const pi = {
  on(name, handler) { handlers.set(name, handler); },
  registerTool(definition) { tool.value = definition; },
  async sendMessage(message, options) {
    messageWrites.push({ message, options });
    const details = message.details;
    sessionText += `${JSON.stringify({ type: "custom_message", id: `entry_${messageWrites.length}`, parentId: "root", customType: message.customType, content: message.content, details })}\n`;
    return `entry_${messageWrites.length}`;
  },
};
const binding = {
  state: "current",
  record: { current: { pane_id: "w:p1", runtime_active: true, read_only: false } },
};
const bindingCall = async (action, facts) => action === "classify" ? { value: binding } : { value: binding.record };
const panes = [{ pane_id: "w:p1", agent: "pi", agent_session: { value: sessionFile } }];
await register(pi, {
  enableRecord: record,
  clientFactory: () => client,
  bindingCall,
  listPanes: async () => panes,
  actorAuthorities: async () => [{ id: "T-209.17", assignee: "subagent-chat-019fd7bb" }],
  sessionRead: async () => (receiptLive ? sessionText : receiptText),
  sleep: async () => {},
  abortableSleep: async () => {},
});
assert.ok(tool.value, "enabled adapter did not register its messaging tool");
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
const question = await tool.value.execute("q0", { action: "question", recipient: "qq/change/T-189", content: "question?", correlation_id: "corr-1", request_id: "req_question" }, undefined, undefined, ctx);
assert.equal(question.details.event_id, "evt_2");
const reply = await tool.value.execute("r0", { action: "reply", recipient: "qq/change/T-189", content: "answer", correlation_id: "corr-1", request_id: "req_reply" }, undefined, undefined, ctx);
assert.equal(reply.details.event_id, "evt_3");
const refused = await tool.value.execute("bad", { action: "send", recipient: "qq/random/session", content: "no" }, undefined, undefined, ctx);
assert.equal(refused.details.status, "refused");
assert.match(refused.details.reason, /accountable logical Actor/);

function delivery(eventId, content, { urgency = "default", kind = "message", correlation = "corr-in", origin = "qq/coordinator" } = {}) {
  return {
    record: {
      event_id: eventId,
      recipient_id: "qq/change/T-209.17",
      envelope: {
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

// Idle default append: persisted custom message; exact readback acknowledges.
deliveries.push(delivery("evt_default", "default body"));
await tick();
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

// A still-pending injection gates the whole tool batch for every sibling call.
receiptText = "";
receiptLive = false;
deliveries.push(delivery("evt_gate", "gate body"));
await tick();
const gateOne = await handlers.get("tool_call")({ toolName: "write", input: {} }, ctx);
const gateTwo = await handlers.get("tool_call")({ toolName: "bash", input: {} }, ctx);
assert.equal(gateOne.block, true);
assert.equal(gateTwo.block, true);

// Urgent publishes attention-needed but does not abort a busy run.
aborted = 0; idle = false;
deliveries.push(delivery("evt_urgent", "urgent body", { urgency: "urgent" }));
await tick();
assert.equal(aborted, 0);
assert.ok(calls.publish.some((body) => body.kind === "attention-needed"));

// Critical: fenced single abort attempt, transcript readback, truthful outcome.
idle = false;
receiptLive = true;
deliveries.push(delivery("evt_critical", "critical body", { urgency: "critical", kind: "action" }));
await tick();
assert.equal(aborted, 1, "critical did not make exactly one abort attempt");
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_critical"), "critical was not acknowledged after readback");
assert.ok(messageWrites.some((write) => write.message.content.includes("evt_critical")), "critical content never entered the transcript");
receiptLive = false;

// Stale/source-mismatched binding cannot deliver or acknowledge.
binding.state = "source_mismatch";
deliveries.push(delivery("evt_stale", "stale body"));
await tick();
assert.ok(calls.block.some((body) => body.reason.includes("source_mismatch")));
binding.state = "current";

// One-off initiated thread: a correlated reply returns to the exact live origin
// without granting it a durable accountable identity.
receiptLive = true;
deliveries.push(delivery("evt_oneoff", "one-off question", { correlation: "corr-oneoff", origin: "qq/client/live-1" }));
await tick();
assert.ok(calls.acknowledge.some((body) => body.event_id === "evt_oneoff"), "one-off inbound was not acknowledged");
const oneoffReply = await tool.value.execute("reply-oneoff", { action: "reply", correlation_id: "corr-oneoff", content: "one-off answer" }, undefined, undefined, ctx);
assert.equal(oneoffReply.details.status, "accepted", `one-off reply refused: ${JSON.stringify(oneoffReply.details)}`);
assert.ok(calls.send.some((body) => body.recipient_id === "qq/client/live-1"), "one-off reply was not addressed to the received origin");
receiptLive = false;

const status = await tool.value.execute("st0", { action: "status", event_id: "evt_out", wait_ms: 0 }, undefined, undefined, ctx);
assert.equal(status.details.status, "current");
assert.equal(calls.status[0].event_id, "evt_out");

await handlers.get("session_shutdown")({}, ctx);
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
