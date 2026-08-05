#!/usr/bin/env python3
"""Isolated process/failure matrix for the inactive qq Event Plane foundation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import sqlite3
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any

SERVICE, ADMIN, CLIENT_SOURCE, TS_CLIENT, ROOT_TEXT, SCRATCH_TEXT = sys.argv[1:]
ROOT = Path(ROOT_TEXT)
SCRATCH = Path(SCRATCH_TEXT)
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("qq_event_plane_client_test", CLIENT_SOURCE)
assert spec is not None and spec.loader is not None
client_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client_module)
Client = client_module.EventPlaneClient
ClientError = client_module.EventPlaneClientError
PROTOCOL = "qq-event-plane/v1"
active: list["Plane"] = []
proofs: set[str] = set()


def refused(code: str, function, *args, contains: str | None = None):
    try:
        function(*args)
    except ClientError as error:
        assert error.code == code, (error.code, code, error.message)
        if contains is not None:
            assert contains in error.message, (contains, error.message)
        return error
    raise AssertionError(f"operation unexpectedly succeeded; expected {code}")


def guard(delivery: dict[str, Any]) -> dict[str, Any]:
    return {
        "obligation_id": delivery["obligation"]["obligation_id"],
        "event_id": delivery["record"]["event_id"],
        "consumer_type": delivery["obligation"]["consumer_type"],
        "consumer_id": delivery["obligation"]["consumer_id"],
        "generation": delivery["obligation"]["generation"],
        "attempt_token": delivery["attempt_token"],
        "endpoint_token": delivery["endpoint_token"],
        "expected_high_water": delivery["guard"]["expected_high_water"],
        "expected_gap_token": delivery["guard"]["expected_gap_token"],
    }


def send_body(request: str, recipient: str = "qq/actor", payload: Any = None) -> dict[str, Any]:
    return {
        "producer_id": "qq/producer",
        "request_id": request,
        "origin_id": "qq/change/T-209.16",
        "recipient_id": recipient,
        "product_id": "qq",
        "kind": "actor.message",
        "schema_version": 1,
        "payload": {"request": request} if payload is None else payload,
    }


def publish_body(request: str, kind: str = "task.changed", payload: Any = None) -> dict[str, Any]:
    return {
        "producer_id": "qq/producer",
        "request_id": request,
        "origin_id": "qq/source/backlog",
        "product_id": "qq",
        "kind": kind,
        "schema_version": 1,
        "payload": {"request": request} if payload is None else payload,
    }


class Plane:
    def __init__(self, name: str, *, short: bool = False):
        self.root = SCRATCH / name
        self.root.mkdir(mode=0o700)
        self.state = self.root / "state"
        self.clock = self.root / "clock"
        self.clock.write_text("1000000\n", encoding="ascii")
        self.stderr = self.root / "stderr.log"
        self.stdout = self.root / "stdout.log"
        self.process: subprocess.Popen[bytes] | None = None
        self.env = os.environ.copy()
        self.env["QQ_EVENT_PLANE_TESTING"] = "1"
        if short:
            self.env.update({
                "QQ_EVENT_PLANE_SEND_TTL_MS": "1000",
                "QQ_EVENT_PLANE_SUBSCRIPTION_LEASE_MS": "2000",
                "QQ_EVENT_PLANE_PAYLOAD_RETENTION_MS": "1000",
                "QQ_EVENT_PLANE_TOMBSTONE_RETENTION_MS": "3000",
            })
        active.append(self)
        self.start()

    @property
    def socket(self) -> Path:
        return self.state / "event-plane.sock"

    @property
    def client(self):
        return Client(str(self.socket))

    @property
    def now(self) -> int:
        return int(self.clock.read_text())

    def set_time(self, value: int) -> None:
        assert value >= self.now
        temporary = self.root / ".clock-new"
        temporary.write_text(f"{value}\n", encoding="ascii")
        temporary.replace(self.clock)

    def advance(self, amount: int) -> None:
        self.set_time(self.now + amount)

    def start(self) -> None:
        assert self.process is None
        output = self.stdout.open("ab")
        errors = self.stderr.open("ab")
        self.process = subprocess.Popen(
            [SERVICE, "serve", "--state-dir", str(self.state), "--test-clock", str(self.clock)],
            stdout=output, stderr=errors, env=self.env,
        )
        output.close()
        errors.close()
        for _ in range(250):
            if self.socket.is_socket():
                probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                probe.settimeout(0.05)
                try:
                    probe.connect(str(self.socket))
                except OSError:
                    pass
                else:
                    probe.close()
                    return
                finally:
                    probe.close()
            if self.process.poll() is not None:
                raise AssertionError(
                    f"service failed ({self.process.returncode}): {self.stderr.read_text(errors='replace')}"
                )
            time.sleep(0.01)
        raise AssertionError("service socket did not appear")

    def stop(self, sig: int = signal.SIGTERM) -> None:
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.send_signal(sig)
            self.process.wait(timeout=10)
        self.process = None
        if sig != signal.SIGKILL:
            assert not self.socket.exists(), "graceful signal did not clean up the socket"

    def restart(self) -> None:
        self.stop(signal.SIGKILL)
        assert self.socket.exists(), "SIGKILL fixture should leave a stale socket"
        self.start()

    def close(self) -> None:
        self.stop()
        if self in active:
            active.remove(self)


def raw_request(path: Path, document: Any = None, raw: bytes | None = None, declared: int | None = None) -> dict[str, Any]:
    if raw is None:
        raw = json.dumps(document, separators=(",", ":")).encode()
    if declared is None:
        declared = len(raw)
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(3)
    connection.connect(str(path))
    connection.sendall(struct.pack(">I", declared) + raw)
    header = connection.recv(4)
    assert len(header) == 4
    length = struct.unpack(">I", header)[0]
    data = bytearray()
    while len(data) < length:
        chunk = connection.recv(length - len(data))
        assert chunk
        data.extend(chunk)
    connection.close()
    return json.loads(data)


def crash_and_validation() -> None:
    plane = Plane("crash-validation")
    client = plane.client
    accepted = client.send(send_body("durable-1"))
    event = accepted["record"]["event_id"]
    position = accepted["record"]["journal_position"]
    plane.stop(signal.SIGKILL)
    refused("unavailable", client.send, send_body("never-accepted"))
    plane.start()
    survived = plane.client.status({"event_id": event})
    assert survived["record"]["journal_position"] == position and not survived["terminal"]
    refused("not_found", plane.client.status, {"producer_id": "qq/producer", "request_id": "never-accepted"})
    other_product = send_body("deciq-record")
    other_product.update({
        "producer_id": "deciq/producer", "origin_id": "deciq/source", "recipient_id": "deciq/actor",
        "product_id": "deciq",
    })
    accepted_other = plane.client.send(other_product)
    assert accepted_other["record"]["journal_position"] > position

    before = plane.client.inspect({"view": "health"})["counts"].copy()
    first = plane.client.send(send_body("stable", payload={"a": 1, "b": 2}))
    same = plane.client.send({
        "schema_version": 1, "kind": "actor.message", "product_id": "qq",
        "recipient_id": "qq/actor", "origin_id": "qq/change/T-209.16",
        "request_id": "stable", "producer_id": "qq/producer", "payload": {"b": 2, "a": 1},
    })
    assert same["idempotent"] and same["record"]["event_id"] == first["record"]["event_id"]
    refused("idempotency_conflict", plane.client.send, send_body("stable", payload={"a": 2}))
    invalid = [
        ({**send_body("unknown"), "unknown": True}, "refused"),
        ({**send_body("cross"), "recipient_id": "other/actor"}, "refused"),
        ({**send_body("cross-producer"), "producer_id": "other/producer"}, "refused"),
        ({**send_body("large"), "payload": "x" * 65537}, "payload_too_large"),
    ]
    for body, code in invalid:
        refused(code, plane.client.send, body)
    malformed = raw_request(plane.socket, raw=b"{not-json")
    assert not malformed["ok"] and malformed["error"]["code"] == "refused"
    unknown_root = raw_request(plane.socket, {
        "protocol": PROTOCOL, "operation": "send", "body": send_body("root"), "extra": 1,
    })
    assert not unknown_root["ok"]
    duplicate = raw_request(
        plane.socket,
        raw=b'{"protocol":"qq-event-plane/v1","operation":"send","operation":"publish","body":{}}',
    )
    assert not duplicate["ok"] and "valid finite" in duplicate["error"]["message"]
    oversized = raw_request(plane.socket, raw=b"{}", declared=128 * 1024 + 1)
    assert oversized["error"]["code"] == "frame_too_large"
    selector = {
        "subscription_id": "qq/strict", "product_id": "qq", "kind": "task.changed",
        "generation": 1, "reconstruct_from": 1, "subject_id": "forbidden",
    }
    refused("refused", plane.client.ensure_subscription, selector)
    after = plane.client.inspect({"view": "health"})["counts"]
    assert after["records"] == before["records"] + 1 and after["obligations"] == before["obligations"] + 1
    proofs.update({"committed-crash", "absence-not-accepted", "idempotency-validation", "bounded-framing"})
    plane.close()


def concurrent_acceptance() -> None:
    plane = Plane("concurrent")
    def append(index: int):
        return plane.client.publish(publish_body(f"concurrent-{index}"))
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(append, range(32)))
    positions = [item["record"]["journal_position"] for item in results]
    assert len(set(positions)) == 32
    assert sorted(positions) == list(range(min(positions), max(positions) + 1))
    journal = []
    after = 0
    while True:
        page = plane.client.inspect({"view": "journal", "after_position": after, "limit": 20})["records"]
        if not page:
            break
        journal.extend(page)
        after = page[-1]["journal_position"]
    assert len(journal) == 32
    assert [row["journal_position"] for row in journal] == sorted(positions)
    proofs.add("concurrent-monotonic")
    plane.close()


def delivery_gaps_and_guards() -> None:
    plane = Plane("delivery")
    c = plane.client
    for subscription in ("qq/consumer-a", "qq/consumer-b"):
        result = c.ensure_subscription({
            "subscription_id": subscription, "product_id": "qq", "kind": "task.changed",
            "generation": 1, "reconstruct_from": 1,
        })
        assert result["subscription"]["lease_expires_at"] == plane.now + 24 * 60 * 60 * 1000
    # A connected long-poll is a wake-up, not database polling.
    c.ensure_subscription({
        "subscription_id": "qq/waiter", "product_id": "qq", "kind": "wake.fact",
        "generation": 1, "reconstruct_from": 1,
    })
    waited: dict[str, Any] = {}
    wait_thread = threading.Thread(target=lambda: waited.update(c.wait({
        "consumer_type": "subscription", "consumer_id": "qq/waiter", "generation": 1,
        "endpoint_token": "wait-endpoint", "wait_ms": 2000,
    })))
    wait_thread.start(); time.sleep(0.1)
    wake = c.publish(publish_body("connected-wake", kind="wake.fact"))
    wait_thread.join(timeout=3)
    assert not wait_thread.is_alive()
    assert waited["delivery"]["record"]["event_id"] == wake["record"]["event_id"]
    c.acknowledge(guard(waited["delivery"]))

    published = c.publish(publish_body("fanout"))
    direct = c.send(send_body("disconnected", recipient="qq/disconnected"))
    assert published["obligation_count"] == 2 and direct["obligation_count"] == 1
    assert direct["record"]["deadline_at"] == direct["record"]["accepted_at"] + 60 * 60 * 1000
    assert c.status({"event_id": direct["record"]["event_id"]})["obligations"][0]["status"] == "pending"

    a1 = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1, "endpoint_token": "endpoint-a1"})["delivery"]
    b1 = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-b", "generation": 1, "endpoint_token": "endpoint-b1"})["delivery"]
    assert a1["record"]["event_id"] == b1["record"]["event_id"] == published["record"]["event_id"]
    assert a1["obligation"]["obligation_id"] != b1["obligation"]["obligation_id"]
    stolen = guard(a1)
    stolen["consumer_id"] = "qq/consumer-b"
    refused("guard_conflict", c.acknowledge, stolen)

    # Rebinding is an immediate topology wake. It keeps readable identities and fences diagnostics.
    a2 = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1, "endpoint_token": "endpoint-a2"})["delivery"]
    assert a2["record"]["origin_id"] == "qq/source/backlog"
    assert a2["record"]["event_id"] == a1["record"]["event_id"]
    assert a2["attempt_token"] != a1["attempt_token"]
    refused("stale_attempt", c.acknowledge, guard(a1))
    wrong_generation = guard(a2); wrong_generation["generation"] = 2
    refused("guard_conflict", c.acknowledge, wrong_generation)
    c.acknowledge(guard(a2))
    refused("stale_attempt", c.acknowledge, guard(a2))
    assert c.status({"event_id": published["record"]["event_id"]})["obligations"][1]["status"] in ("in_flight", "acknowledged")

    # A service crash before B's acknowledgement redelivers the same immutable record.
    plane.restart(); c = plane.client
    persisted_a = next(
        row for row in c.inspect({"view": "subscriptions"})["subscriptions"]
        if row["subscription_id"] == "qq/consumer-a"
    )
    assert persisted_a["high_water"] == published["record"]["journal_position"] and persisted_a["gaps"] == []
    b2 = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-b", "generation": 1, "endpoint_token": "endpoint-b2"})["delivery"]
    assert b2["record"]["event_id"] == b1["record"]["event_id"] and b2["attempt_token"] != b1["attempt_token"]
    refused("stale_attempt", c.acknowledge, guard(b1))
    c.acknowledge(guard(b2))

    # Poison fact blocks only its own gap; a later wake-up advances high-water past it.
    poison = c.publish(publish_body("poison"))
    poison_delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1, "endpoint_token": "endpoint-a2"})["delivery"]
    assert poison_delivery["record"]["event_id"] == poison["record"]["event_id"]
    c.block({**guard(poison_delivery), "reason": "authority payload is temporarily poison"})
    plane.restart(); c = plane.client
    persisted_gap = next(
        row for row in c.inspect({"view": "subscriptions"})["subscriptions"]
        if row["subscription_id"] == "qq/consumer-a"
    )
    assert len(persisted_gap["gaps"]) == 1 and persisted_gap["gaps"][0]["status"] == "blocked"
    later = c.publish(publish_body("later-wakeup"))
    later_delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1, "endpoint_token": "endpoint-a2"})["delivery"]
    assert later_delivery["record"]["event_id"] == later["record"]["event_id"]
    stale_gap = guard(later_delivery); stale_gap["expected_gap_token"] = poison_delivery["guard"]["expected_gap_token"]
    refused("gap_conflict", c.acknowledge, stale_gap)
    c.acknowledge(guard(later_delivery))
    subscription = next(
        row for row in c.inspect({"view": "subscriptions"})["subscriptions"]
        if row["subscription_id"] == "qq/consumer-a"
    )
    assert subscription["high_water"] == later["record"]["journal_position"]
    assert len(subscription["gaps"]) == 1
    assert subscription["gaps"][0]["journal_position"] == poison["record"]["journal_position"]
    assert subscription["gaps"][0]["status"] == "blocked"

    # Disposition uses current gap state, is audited, and changes no B obligation.
    disposition = {
        **guard(poison_delivery),
        "expected_high_water": subscription["high_water"],
        "expected_gap_token": subscription["gap_token"],
        "authorized_by": "qq/operator",
        "authorization": "operator",
        "reason": "operator reconstructed current authority",
        "expected_status": "blocked",
    }
    disposed = c.disposition(disposition)
    assert disposed["disposed"]
    audit = c.inspect({"view": "dispositions"})["dispositions"]
    assert any(row["obligation_id"] == poison_delivery["obligation"]["obligation_id"] for row in audit)
    poison_status = c.status({"event_id": poison["record"]["event_id"]})
    states = {(row["consumer_id"], row["status"]) for row in poison_status["obligations"]}
    assert ("qq/consumer-a", "disposed") in states and ("qq/consumer-b", "pending") in states

    # Acceptance order is explicit while source chronology remains opaque metadata.
    old_world = publish_body("world-old", kind="ordering.fact"); old_world["source_revision"] = "revision-99"; old_world["occurred_at"] = "2099-01-01T00:00:00Z"
    new_world = publish_body("world-new", kind="ordering.fact"); new_world["source_revision"] = "revision-1"; new_world["occurred_at"] = "2001-01-01T00:00:00Z"
    first = c.publish(old_world)["record"]; second = c.publish(new_world)["record"]
    assert first["journal_position"] < second["journal_position"]
    assert first["envelope"]["source_revision"] == "revision-99" and second["envelope"]["source_revision"] == "revision-1"
    proofs.update({"send-publish-engine", "identity-fencing", "independent-gaps", "crash-redelivery", "guarded-ack", "poison-nonfreezing", "audited-disposition", "acceptance-order-only"})
    plane.close()


def backoff_blocking() -> None:
    plane = Plane("backoff")
    c = plane.client
    c.ensure_subscription({"subscription_id": "qq/retry", "product_id": "qq", "kind": "retry.fact", "generation": 1, "reconstruct_from": 1})
    record = c.publish(publish_body("retry-me", kind="retry.fact"))
    delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/retry", "generation": 1, "endpoint_token": "retry-endpoint"})["delivery"]
    observed_delays = []
    for failure in range(1, 9):
        result = c.retry({**guard(delivery), "reason": f"transient failure {failure}"})["obligation"]
        expected_delay = (1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000)[failure - 1]
        observed_delays.append(result["next_attempt_at"] - plane.now)
        if failure < 8:
            assert result["status"] == "pending"
            assert c.next({"consumer_type": "subscription", "consumer_id": "qq/retry", "generation": 1, "endpoint_token": "retry-endpoint"})["delivery"] is None
            plane.set_time(result["next_attempt_at"])
            delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/retry", "generation": 1, "endpoint_token": "retry-endpoint"})["delivery"]
        else:
            assert result["status"] == "blocked"
    assert observed_delays == [1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000]
    assert c.next({"consumer_type": "subscription", "consumer_id": "qq/retry", "generation": 1, "endpoint_token": "retry-endpoint"})["delivery"] is None
    assert c.status({"event_id": record["record"]["event_id"]})["obligations"][0]["status"] == "blocked"
    proofs.add("backoff-blocked-no-hot-loop")
    plane.close()


def expiry_lease_and_retention() -> None:
    plane = Plane("retention", short=True)
    c = plane.client
    subscription = c.ensure_subscription({
        "subscription_id": "qq/leased", "product_id": "qq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": 1,
    })["subscription"]
    assert subscription["lease_expires_at"] == plane.now + 2000
    addressed = c.send(send_body("will-expire"))
    fact = c.publish(publish_body("will-abandon", kind="lease.fact"))
    fact_delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/leased", "generation": 1, "endpoint_token": "lease-endpoint"})["delivery"]
    c.block({**guard(fact_delivery), "reason": "blocked until lease reconstruction"})
    acknowledged = c.send(send_body("will-ack", recipient="qq/ack-target"))
    ack_delivery = c.next({"consumer_type": "recipient", "consumer_id": "qq/ack-target", "generation": 0, "endpoint_token": "ack-endpoint"})["delivery"]
    c.acknowledge(guard(ack_delivery))
    disposed = c.send(send_body("will-dispose", recipient="qq/dispose-target"))
    dispose_delivery = c.next({"consumer_type": "recipient", "consumer_id": "qq/dispose-target", "generation": 0, "endpoint_token": "dispose-endpoint"})["delivery"]
    c.disposition({
        **guard(dispose_delivery), "authorized_by": "qq/operator", "authorization": "operator",
        "reason": "operator cancelled the named obligation", "expected_status": "in_flight",
    })

    result: dict[str, Any] = {}
    error: list[BaseException] = []
    def waiter():
        try:
            result.update(c.status({"event_id": addressed["record"]["event_id"], "wait_ms": 3000}))
        except BaseException as caught:
            error.append(caught)
    thread = threading.Thread(target=waiter)
    thread.start(); time.sleep(0.1); plane.advance(1001); thread.join(timeout=3)
    assert not thread.is_alive() and not error
    assert result["terminal"] and result["terminal_failure"]
    assert result["obligations"][0]["status"] == "expired"
    assert result["obligations"][0]["last_reason"] == "expired—undelivered"

    plane.advance(1000)
    c.inspect({"view": "health"})
    expired_sub = c.inspect({"view": "subscriptions"})["subscriptions"][0]
    assert not expired_sub["active"]
    assert c.status({"event_id": fact["record"]["event_id"]})["obligations"][0]["status"] == "abandoned"
    refused("generation_conflict", c.ensure_subscription, {
        "subscription_id": "qq/leased", "product_id": "qq", "kind": "lease.fact", "generation": 1,
    })
    rebuilt = c.ensure_subscription({
        "subscription_id": "qq/leased", "product_id": "qq", "kind": "lease.fact",
        "generation": 2, "reconstruct_from": fact["record"]["journal_position"] + 1,
    })
    assert rebuilt["reconstructed"] and rebuilt["replayed"] == 0
    for terminal_record, expected_status in ((acknowledged, "acknowledged"), (disposed, "disposed")):
        retained = c.status({"event_id": terminal_record["record"]["event_id"]})
        assert retained["record"]["retention"] == "tombstone"
        assert retained["obligations"][0]["status"] == expected_status

    # Full terminal payload becomes a compact hash/status tombstone, then disappears.
    plane.advance(1001)
    c.inspect({"view": "health"})
    tombstone = c.status({"event_id": addressed["record"]["event_id"]})
    assert tombstone["record"]["retention"] == "tombstone" and tombstone["record"]["envelope"] is None
    assert len(tombstone["record"]["input_hash"]) == 64
    tombstone_retry = c.send(send_body("will-expire"))
    assert tombstone_retry["idempotent"] and tombstone_retry["record"]["retention"] == "tombstone"
    refused("idempotency_conflict", c.send, send_body("will-expire", payload={"changed": True}))
    plane.advance(2001)  # terminal age is now beyond the shortened seven-day seam.
    c.inspect({"view": "health"})
    refused("not_found", c.status, {"event_id": addressed["record"]["event_id"]})
    refused("not_found", c.status, {"event_id": fact["record"]["event_id"]})
    refused("not_found", c.status, {"event_id": acknowledged["record"]["event_id"]})
    refused("not_found", c.status, {"event_id": disposed["record"]["event_id"]})
    proofs.update({"addressed-expiry-waiter", "lease-reconstruction", "retention-tombstone-deletion", "blocked-abandoned-cleanup"})
    plane.close()


def ts_equivalence() -> None:
    plane = Plane("typescript")
    c = plane.client
    body = send_body("cross-client", payload={"z": 1, "a": [True, None, "é"]})
    python_result = c.send(body)
    script = r'''
const { EventPlaneClient, canonicalEventPlaneJson } = await import(process.argv[2]);
const socketPath = process.argv[3];
const body = JSON.parse(process.argv[4]);
const backupPath = process.argv[5];
const client = new EventPlaneClient(socketPath);
const guard = (delivery) => ({
  obligation_id: delivery.obligation.obligation_id,
  event_id: delivery.record.event_id,
  consumer_type: delivery.obligation.consumer_type,
  consumer_id: delivery.obligation.consumer_id,
  generation: delivery.obligation.generation,
  attempt_token: delivery.attempt_token,
  endpoint_token: delivery.endpoint_token,
  expected_high_water: delivery.guard.expected_high_water,
  expected_gap_token: delivery.guard.expected_gap_token,
});
const result = await client.send(body);
let conflict;
try { await client.send({...body, payload: {changed: true}}); }
catch (error) { conflict = {code: error.code, message: error.message}; }
await client.ensureSubscription({subscription_id:"qq/ts-consumer",product_id:"qq",kind:"ts.fact",generation:1,reconstruct_from:1});
const fact = await client.publish({producer_id:"qq/ts",request_id:"ts-publish",origin_id:"qq/ts-source",product_id:"qq",kind:"ts.fact",schema_version:1,payload:{wake:true}});
const first = (await client.next({consumer_type:"subscription",consumer_id:"qq/ts-consumer",generation:1,endpoint_token:"ts-e1"})).delivery;
await client.block({...guard(first),reason:"TypeScript consumer blocked once"});
const subscriptions = (await client.inspect({view:"subscriptions"})).subscriptions;
const subscription = subscriptions.find((row) => row.subscription_id === "qq/ts-consumer");
await client.retry({...guard(first),expected_high_water:subscription.high_water,expected_gap_token:subscription.gap_token,reason:"TypeScript consumer retries"});
const second = (await client.next({consumer_type:"subscription",consumer_id:"qq/ts-consumer",generation:1,endpoint_token:"ts-e2"})).delivery;
await client.acknowledge(guard(second));
const waited = await client.wait({consumer_type:"subscription",consumer_id:"qq/ts-consumer",generation:1,endpoint_token:"ts-e2",wait_ms:1});
const disposable = await client.send({producer_id:"qq/ts",request_id:"ts-dispose",origin_id:"qq/ts-source",recipient_id:"qq/ts-target",product_id:"qq",kind:"actor.message",schema_version:1,payload:{cancel:true}});
const direct = (await client.next({consumer_type:"recipient",consumer_id:"qq/ts-target",generation:0,endpoint_token:"ts-direct"})).delivery;
await client.disposition({...guard(direct),authorized_by:"qq/operator",authorization:"operator",reason:"TypeScript explicit disposition",expected_status:"in_flight"});
const status = await client.status({event_id:fact.record.event_id});
const inspection = await client.inspect({view:"health"});
const backup = await client.backup({path:backupPath});
const methods = ["send","publish","ensureSubscription","next","wait","acknowledge","retry","block","disposition","status","inspect","backup","restore","shutdown"];
console.log(JSON.stringify({result, conflict, fact, disposable, waited, status, inspection, backup, canonical: canonicalEventPlaneJson({body,operation:"send",protocol:"qq-event-plane/v1"}), methods: methods.every((name) => typeof client[name] === "function")}));
'''
    ts_backup = plane.root / "typescript-backup.sqlite3"
    process = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-", Path(TS_CLIENT).resolve().as_uri(), str(plane.socket), json.dumps(body, ensure_ascii=False), str(ts_backup)],
        input=script, text=True, capture_output=True, check=False,
    )
    assert process.returncode == 0, (process.stdout, process.stderr)
    observed = json.loads(process.stdout)
    assert observed["result"]["idempotent"]
    assert observed["result"]["record"]["event_id"] == python_result["record"]["event_id"]
    assert observed["conflict"]["code"] == "idempotency_conflict" and observed["methods"]
    assert observed["waited"]["delivery"] is None
    assert observed["status"]["terminal"] and observed["status"]["obligations"][0]["status"] == "acknowledged"
    assert observed["inspection"]["journal_mode"] == "delete"
    assert observed["backup"]["integrity"] == "ok" and ts_backup.exists()
    expected_request = json.dumps(
        {"body": body, "operation": "send", "protocol": PROTOCOL},
        ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"),
    )
    assert observed["canonical"] == expected_request
    proofs.add("python-typescript-equivalence")
    plane.close()


def administration_and_rollback() -> None:
    plane = Plane("administration")
    c = plane.client
    baseline = c.send(send_body("backup-baseline"))
    health = c.inspect({"view": "health"})
    assert health["journal_mode"] == "delete" and health["synchronous"] == "FULL"
    assert c.inspect({"view": "integrity"}) == {"integrity": "ok", "ok": True, "schema_version": 1}
    database = plane.state / "event-plane.sqlite3"
    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
        trigger = db.execute("SELECT sql FROM sqlite_master WHERE name='records_immutable'").fetchone()[0]
        assert "immutable journal record" in trigger
    backup = plane.root / "backup.sqlite3"
    c.backup({"path": str(backup)})
    assert stat.S_IMODE(backup.stat().st_mode) == 0o600
    later = c.send(send_body("after-backup"))
    refused("guard_conflict", c.restore, {"path": str(backup), "expected_instance_id": "wrong"})
    restored = c.restore({"path": str(backup), "expected_instance_id": health["instance_id"]})
    assert restored["integrity"] == "ok"
    assert c.status({"event_id": baseline["record"]["event_id"]})["record"]["event_id"] == baseline["record"]["event_id"]
    refused("not_found", c.status, {"event_id": later["record"]["event_id"]})

    # Singleton overlap refuses without touching the live socket.
    overlap = subprocess.run(
        [SERVICE, "serve", "--state-dir", str(plane.state), "--test-clock", str(plane.clock)],
        env=plane.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5,
    )
    assert overlap.returncode == 73 and b"singleton lock" in overlap.stderr
    assert c.inspect({"view": "health"})["instance_id"] == restored["instance_id"]

    # Strict account-only state/socket/database modes.
    assert stat.S_IMODE(plane.state.stat().st_mode) == 0o700
    for path in (plane.socket, database, plane.state / "event-plane.lock"):
        assert stat.S_IMODE(path.lstat().st_mode) == 0o600

    # A corrupt restore source refuses and preserves current state exactly.
    corrupt = plane.root / "corrupt.sqlite3"; corrupt.write_bytes(b"not sqlite"); corrupt.chmod(0o600)
    try:
        c.restore({"path": str(corrupt), "expected_instance_id": restored["instance_id"]})
    except ClientError:
        pass
    else:
        raise AssertionError("corrupt restore source was accepted")
    assert c.status({"event_id": baseline["record"]["event_id"]})["record"]["event_id"] == baseline["record"]["event_id"]

    # Guarded shutdown cleans its socket; restart proves recovery after the signal.
    refused("guard_conflict", c.shutdown, {"expected_instance_id": "wrong", "authorization": "operator"})
    c.shutdown({"expected_instance_id": restored["instance_id"], "authorization": "operator"})
    assert plane.process is not None
    plane.process.wait(timeout=10); plane.process = None
    assert not plane.socket.exists()
    plane.start(); c = plane.client

    # Exact rollback is backup + guarded shutdown + singleton-fenced removal of only known files.
    rollback_backup = plane.root / "rollback.sqlite3"
    admin = subprocess.run(
        [ADMIN, "--state-dir", str(plane.state), "rollback", json.dumps({
            "backup_path": str(rollback_backup),
            "expected_instance_id": c.inspect({"view": "health"})["instance_id"],
            "authorization": "operator",
        })],
        text=True, capture_output=True, check=False,
    )
    assert admin.returncode == 0, (admin.stdout, admin.stderr)
    receipt = json.loads(admin.stdout)
    assert receipt["result"]["rolled_back"] and rollback_backup.exists() and not plane.state.exists()
    assert plane.process is not None
    plane.process.wait(timeout=10); plane.process = None

    # Unknown unversioned state fails closed without a partial migration.
    legacy_state = plane.root / "legacy-state"; legacy_state.mkdir(mode=0o700)
    legacy_db = legacy_state / "event-plane.sqlite3"
    with sqlite3.connect(legacy_db) as db:
        db.execute("CREATE TABLE foreign_state(value TEXT)")
        db.execute("INSERT INTO foreign_state VALUES('unchanged')")
    legacy_db.chmod(0o600)
    migration = subprocess.run(
        [SERVICE, "serve", "--state-dir", str(legacy_state), "--test-clock", str(plane.clock)],
        env=plane.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5,
    )
    assert migration.returncode == 73 and b"refuses implicit migration" in migration.stderr
    with sqlite3.connect(legacy_db) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 0
        assert db.execute("SELECT value FROM foreign_state").fetchone()[0] == "unchanged"
    loose_state = plane.root / "loose-state"; loose_state.mkdir(mode=0o700)
    loose_db = loose_state / "event-plane.sqlite3"; loose_db.touch(mode=0o644)
    loose_db.chmod(0o644)
    loose = subprocess.run(
        [SERVICE, "serve", "--state-dir", str(loose_state), "--test-clock", str(plane.clock)],
        env=plane.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5,
    )
    assert loose.returncode == 73 and b"account-private" in loose.stderr
    assert stat.S_IMODE(loose_db.stat().st_mode) == 0o644  # refuse, do not silently chmod.
    active.remove(plane)
    proofs.update({"migration-integrity", "backup-restore", "singleton", "permissions", "signal-cleanup", "exact-rollback"})


def source_boundaries() -> None:
    sources = [
        ROOT / "bin/lib/qq_event_plane_service.py",
        ROOT / "bin/lib/qq_event_plane_client.py",
        ROOT / "bin/lib/qq-event-plane-client.ts",
        ROOT / "bin/qq-event-plane",
        ROOT / "bin/qq-event-plane-admin",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in sources)
    service_source = sources[0].read_text(encoding="utf-8")
    # Standard-library implementation: every imported Python root is in the stdlib.
    imports: set[str] = set()
    for source in sources[:2]:
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split(".")[0])
    assert imports <= set(sys.stdlib_module_names) | {"__future__"}, imports - set(sys.stdlib_module_names)
    assert 'from "node:net"' in sources[2].read_text(encoding="utf-8")
    forbidden = (
        "node:sqlite", "better-sqlite", "nats", "redis", "dead_letter", "dead-letter",
        "routing_dsl", "free_form_tags", "mailbox_registry", "session_registry",
        "notify_operator", "model_call", "backlog update", "herdr ", "pi-intercom",
    )
    lowered = combined.lower()
    for token in forbidden:
        assert token not in lowered, f"out-of-scope surface appeared in Event Plane source: {token}"
    index = (ROOT / "extensions/index.ts").read_text(encoding="utf-8")
    assert "event-plane" not in index.lower() and "event_plane" not in index.lower()
    assert not (ROOT / "extensions/qq-event-plane.ts").exists()
    assert "sqlite3.connect" in service_source and "AF_UNIX" not in service_source  # socketserver owns the private Unix listener.
    proofs.add("inactive-nongoal-absence")


try:
    crash_and_validation()
    concurrent_acceptance()
    delivery_gaps_and_guards()
    backoff_blocking()
    expiry_lease_and_retention()
    ts_equivalence()
    administration_and_rollback()
    source_boundaries()
finally:
    for plane in active[:]:
        try:
            plane.close()
        except BaseException as error:
            print(f"fixture cleanup warning: {error}", file=sys.stderr)

expected = {
    "committed-crash", "absence-not-accepted", "idempotency-validation", "bounded-framing",
    "concurrent-monotonic", "send-publish-engine", "identity-fencing", "independent-gaps",
    "crash-redelivery", "guarded-ack", "poison-nonfreezing", "audited-disposition",
    "acceptance-order-only", "backoff-blocked-no-hot-loop", "addressed-expiry-waiter",
    "lease-reconstruction", "retention-tombstone-deletion", "blocked-abandoned-cleanup",
    "python-typescript-equivalence", "migration-integrity", "backup-restore", "singleton",
    "permissions", "signal-cleanup", "exact-rollback", "inactive-nongoal-absence",
}
assert proofs == expected, (expected - proofs, proofs - expected)
print(f"event-plane proof matrix: {len(proofs)} named proofs")
