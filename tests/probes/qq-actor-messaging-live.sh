#!/usr/bin/env bash
set -euo pipefail

# Disposable, no-focus integration proof for the qq Actor-messaging adapter.
#
# It proves, against a REAL throwaway Event Plane service and the REAL
# EventPlaneClient + enable-record reader, that:
#   1. with no enable record the adapter registers nothing (production inert);
#   2. with a disposable enable record it registers, publishes its lifecycle
#      fact, sends an obligation a peer can receive, and receives/acknowledges
#      an inbound obligation through exact persisted-session readback.
#
# Everything lives under a private temporary HOME/XDG tree; no productive
# session, pane, enable record, or Event Plane state is touched.

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
command -v node >/dev/null 2>&1 || { printf 'qq-actor-messaging-live: node is required\n' >&2; exit 69; }

TMP="$(mktemp -d)"
cleanup() {
  [[ -n "${SERVICE_PID:-}" ]] && kill "$SERVICE_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

export HOME="$TMP/home"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_STATE_HOME="$HOME/.local/state"
STATE_DIR="$XDG_STATE_HOME/qq/event-plane"
SOCKET="$STATE_DIR/event-plane.sock"
ENABLE_DIR="$XDG_CONFIG_HOME/qq/actor-messaging"
ENABLE="$ENABLE_DIR/enable.json"
SESSION_FILE="$TMP/session.jsonl"

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$STATE_DIR" "$ENABLE_DIR"
chmod -R 0700 "$HOME"
: >"$SESSION_FILE"

# Refuse to run if anyone points us at a productive namespace.
for guarded in "$HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME"; do
  case "$guarded" in
    "$TMP"/*) : ;;
    *) printf 'qq-actor-messaging-live: refusing non-disposable namespace %s\n' "$guarded" >&2; exit 2 ;;
  esac
done

printf 'qq-actor-messaging-live: starting disposable Event Plane service\n'
"$ROOT/bin/qq-event-plane" serve --state-dir "$STATE_DIR" \
  >"$TMP/service.out" 2>"$TMP/service.err" &
SERVICE_PID=$!

for _ in $(seq 1 250); do
  [[ -S "$SOCKET" ]] && break
  kill -0 "$SERVICE_PID" 2>/dev/null || { printf 'service died early\n' >&2; cat "$TMP/service.err" >&2; exit 1; }
  sleep 0.02
done
[[ -S "$SOCKET" ]] || { printf 'qq-actor-messaging-live: service socket never appeared\n' >&2; cat "$TMP/service.err" >&2; exit 1; }

printf 'qq-actor-messaging-live: writing disposable enable record\n'
cat >"$ENABLE" <<JSON
{
  "schema": "qq.actor-messaging-enable/v1",
  "version": 1,
  "enabled": true,
  "product_id": "qq",
  "event_plane_socket": "$SOCKET",
  "actor": {
    "role": "change_owner",
    "change": "T-209.17",
    "pane": "probe:p1",
    "session_file": "$SESSION_FILE",
    "session_id": "probe-session"
  }
}
JSON
chmod 0600 "$ENABLE"

ADAPTER="$ROOT/extensions/qq-actor-messaging.ts"
CLIENT="$ROOT/bin/lib/qq-event-plane-client.ts"

node --input-type=module - "$ADAPTER" "$CLIENT" "$ENABLE" "$SOCKET" "$SESSION_FILE" <<'NODE'
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const [adapterPath, clientPath, enablePath, socketPath, sessionFile] = process.argv.slice(2);
const adapter = await import(pathToFileURL(adapterPath));
const { EventPlaneClient } = await import(pathToFileURL(clientPath));

const env = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };

async function waitFor(label, predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function recordingPi() {
  const calls = [];
  const handlers = new Map();
  const writes = [];
  let sessionText = "";
  return {
    calls, handlers, writes,
    get sessionText() { return sessionText; },
    pi: {
      on(name, handler) { calls.push(["on", name]); handlers.set(name, handler); },
      registerTool(tool) { calls.push(["tool", tool.name]); this.tool = tool; },
      async sendMessage(message, options) {
        writes.push({ message, options });
        const line = JSON.stringify({
          type: "custom_message", id: `entry_${writes.length}`, parentId: "root",
          customType: message.customType, content: message.content, details: message.details,
        });
        sessionText += `${line}\n`;
        return `entry_${writes.length}`;
      },
    },
  };
}

const ctx = {
  hasUI: false,
  isIdle: () => true,
  abort: async () => {},
  sessionManager: { getSessionFile: () => sessionFile, getSessionId: () => "probe-session" },
  ui: { notify() {} },
};
const bindingOk = { state: "current", record: { current: { pane_id: "probe:p1", runtime_active: true, read_only: false } } };
const bindingCall = async (action) => (action === "classify" ? { value: bindingOk } : { value: bindingOk.record });
const panes = [{ pane_id: "probe:p1", agent: "pi", agent_session: { value: sessionFile } }];
const fastAbortableSleep = async () => { await sleep(15); };

// --- 1. Production inertness: no enable record -> registers nothing. --------
{
  const empty = recordingPi();
  await adapter.default(empty.pi, { env: { ...env, XDG_CONFIG_HOME: `${process.env.HOME}/no-such-config` }, bindingCall, listPanes: async () => panes, abortableSleep: fastAbortableSleep });
  assert.equal(empty.calls.length, 0, "adapter registered something without an enable record");
  console.log("live: disabled inertness holds against the real reader");
}

// --- 2. Enabled round-trip against the real service. -------------------------
const harness = recordingPi();
await adapter.default(harness.pi, {
  env,
  clientFactory: (path) => new EventPlaneClient(path),
  bindingCall,
  listPanes: async () => panes,
  sessionRead: async () => harness.sessionText,
  actorAuthorities: async () => [{ id: "T-209.17", assignee: "probe-actor" }],
  abortableSleep: fastAbortableSleep,
});
assert.ok(harness.pi.tool, "enabled adapter did not register its messaging tool");
await harness.handlers.get("session_start")({ reason: "startup" }, ctx);
console.log("live: adapter registered and session_start completed");

// Lifecycle publication must reach the real service.
const peer = new EventPlaneClient(socketPath);
await waitFor("lifecycle publication on the real service", async () => {
  const journal = await peer.inspect({ view: "journal", limit: 20 }).catch(() => undefined);
  return (journal?.records ?? []).some((record) => record.kind === "pi.lifecycle" && record.producer_id === "qq/change/T-209.17/adapter");
});
console.log("live: lifecycle publication visible in the real journal");

// Outbound: the adapter sends an obligation a peer consumer can receive.
const sent = await harness.pi.tool.execute("live-send", { action: "send", recipient: "qq/coordinator", content: "live proof outbound" }, undefined, undefined, ctx);
assert.equal(sent.details.status, "accepted", `outbound send refused: ${JSON.stringify(sent.details)}`);
const peerDelivery = await (async () => {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await peer.next({ consumer_type: "recipient", consumer_id: "qq/coordinator", generation: 0, endpoint_token: "live-proof/peer", wait_ms: 250 });
    if (result?.delivery) return result.delivery;
  }
  throw new Error("peer never received the outbound obligation");
})();
assert.equal(peerDelivery.record.event_id, sent.details.event_id);
assert.match(JSON.stringify(peerDelivery.record.envelope.payload.record), /live proof outbound/);
await peer.acknowledge({
  obligation_id: peerDelivery.obligation.obligation_id,
  event_id: peerDelivery.record.event_id,
  consumer_type: peerDelivery.obligation.consumer_type,
  consumer_id: peerDelivery.obligation.consumer_id,
  generation: peerDelivery.obligation.generation,
  attempt_token: peerDelivery.attempt_token,
  endpoint_token: "live-proof/peer",
  expected_high_water: peerDelivery.guard.expected_high_water,
  expected_gap_token: peerDelivery.guard.expected_gap_token,
});
console.log("live: outbound obligation received and acknowledged by a peer consumer");

// Inbound correlated: peer sends to this actor; adapter delivers + acknowledges.
const inbound = await peer.send({
  producer_id: "qq/coordinator",
  request_id: "live-proof-inbound-1",
  origin_id: "qq/coordinator",
  recipient_id: "qq/change/T-209.17",
  product_id: "qq",
  kind: "actor.message",
  schema_version: 1,
  correlation_id: "live-corr-1",
  payload: { schema: "qq.actor-message/v1", record: { origin_id: "qq/coordinator", content: "live proof inbound", kind: "message", correlation_id: "live-corr-1", urgency: "default", critical: false } },
});
const inboundEventId = inbound.record.event_id;
await waitFor("inbound custom message injected", async () => harness.writes.some((w) => w.message.content.includes(inboundEventId)));
await waitFor("inbound obligation acknowledged on the real service", async () => {
  const status = await peer.status({ event_id: inboundEventId, wait_ms: 0 }).catch(() => undefined);
  return status?.terminal === true || (status?.obligations ?? []).every((o) => o.status === "acknowledged" || o.status === "terminal");
});
assert.ok(harness.writes.some((w) => w.message.content.includes("live proof inbound")), "inbound content never reached the Pi sendMessage seam");
console.log("live: inbound obligation delivered and acknowledged through exact readback");

// Inbound plain (no correlation) proves the optional correlation over real JSON.
const plain = await peer.send({
  producer_id: "qq/coordinator",
  request_id: "live-proof-inbound-2",
  origin_id: "qq/coordinator",
  recipient_id: "qq/change/T-209.17",
  product_id: "qq",
  kind: "actor.message",
  schema_version: 1,
  payload: { schema: "qq.actor-message/v1", record: { origin_id: "qq/coordinator", content: "live proof plain", kind: "message", urgency: "default", critical: false } },
});
await waitFor("plain inbound injected", async () => harness.writes.some((w) => w.message.content.includes(plain.record.event_id)));
console.log("live: plain (uncorrelated) inbound delivered over the real JSON round-trip");

await harness.handlers.get("session_shutdown")({}, ctx);
console.log("qq-actor-messaging-live: PASS");
NODE

printf 'qq-actor-messaging-live: disposable proof complete\n'
