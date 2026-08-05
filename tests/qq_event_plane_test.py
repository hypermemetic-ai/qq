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
import shutil
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
        self.clock.chmod(0o600)
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
        temporary.chmod(0o600)
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


def read_framed_response(connection: socket.socket) -> dict[str, Any]:
    header = bytearray()
    while len(header) < 4:
        chunk = connection.recv(4 - len(header))
        assert chunk
        header.extend(chunk)
    length = struct.unpack(">I", header)[0]
    data = bytearray()
    while len(data) < length:
        chunk = connection.recv(length - len(data))
        assert chunk
        data.extend(chunk)
    return json.loads(data)


def raw_request(path: Path, document: Any = None, raw: bytes | None = None, declared: int | None = None) -> dict[str, Any]:
    if raw is None:
        raw = json.dumps(document, separators=(",", ":")).encode()
    if declared is None:
        declared = len(raw)
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(3)
    connection.connect(str(path))
    connection.sendall(struct.pack(">I", declared) + raw)
    connection.shutdown(socket.SHUT_WR)
    result = read_framed_response(connection)
    connection.close()
    return result


def streamed_raw_request(
    path: Path, declared_raw: bytes, *, trailing: bytes = b"", fragmented: bool = False
) -> dict[str, Any]:
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(3)
    connection.connect(str(path))
    frame = struct.pack(">I", len(declared_raw)) + declared_raw
    if fragmented:
        for byte in frame:
            connection.sendall(bytes((byte,)))
    else:
        connection.sendall(frame)
    if trailing:
        time.sleep(0.05)
        connection.sendall(trailing)
    connection.shutdown(socket.SHUT_WR)
    result = read_framed_response(connection)
    connection.close()
    return result


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
    assert not duplicate["ok"] and "bounded integer" in duplicate["error"]["message"]
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
    recovered_blocked = c.next({
        "consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1,
        "endpoint_token": "endpoint-blocked-b",
    })["delivery"]
    assert recovered_blocked["record"]["event_id"] == poison["record"]["event_id"]
    assert recovered_blocked["obligation"]["status"] == "blocked"
    assert recovered_blocked["obligation"]["last_reason"] == "authority payload is temporarily poison"
    assert recovered_blocked["attempt_token"] != poison_delivery["attempt_token"]
    refused("stale_attempt", c.retry, {**guard(poison_delivery), "reason": "stale endpoint cannot retry"})
    refused("stale_attempt", c.disposition, {
        **guard(poison_delivery), "authorized_by": "qq/operator", "authorization": "operator",
        "reason": "stale endpoint cannot dispose", "expected_status": "blocked",
    })
    later = c.publish(publish_body("later-wakeup"))
    later_delivery = c.next({"consumer_type": "subscription", "consumer_id": "qq/consumer-a", "generation": 1, "endpoint_token": "endpoint-blocked-b"})["delivery"]
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
        **guard(recovered_blocked),
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
    proofs.update({"send-publish-engine", "identity-fencing", "independent-gaps", "crash-redelivery", "guarded-ack", "poison-nonfreezing", "blocked-rebind-resolution", "audited-disposition", "acceptance-order-only"})
    plane.close()


def post_copy_restore_atomicity() -> None:
    service_source = ROOT / "bin/lib/qq_event_plane_service.py"
    service_spec = importlib.util.spec_from_file_location("qq_event_plane_service_restore_test", service_source)
    assert service_spec is not None and service_spec.loader is not None
    service_module = importlib.util.module_from_spec(service_spec)
    service_spec.loader.exec_module(service_module)
    root = SCRATCH / "post-copy-restore"
    root.mkdir(mode=0o700)
    state = root / "state"; state.mkdir(mode=0o700)
    store = service_module.Store(service_module.Config(state, None))
    try:
        baseline = store.append("send", send_body("post-copy-baseline"))
        backup = root / "before-later.sqlite3"
        store.backup({"path": str(backup)})
        later = store.append("send", send_body("post-copy-live"))
        original_recovery = store._recover_startup

        def injected_recovery_failure() -> None:
            raise RuntimeError("injected failure after candidate copy")

        store._recover_startup = injected_recovery_failure
        try:
            store.restore({"path": str(backup), "expected_instance_id": store.instance_id})
        except RuntimeError as error:
            assert "after candidate copy" in str(error)
        else:
            raise AssertionError("post-copy recovery failure unexpectedly accepted restore")
        finally:
            store._recover_startup = original_recovery
        assert store.status({"event_id": baseline["record"]["event_id"]})["record"]["event_id"] == baseline["record"]["event_id"]
        assert store.status({"event_id": later["record"]["event_id"]})["record"]["event_id"] == later["record"]["event_id"]
        assert not (state / ".restore-rollback.sqlite3").exists()
    finally:
        store.close()
    proofs.add("post-copy-restore-rollback")


def predicate_wait_atomicity() -> None:
    service_source = ROOT / "bin/lib/qq_event_plane_service.py"
    service_spec = importlib.util.spec_from_file_location("qq_event_plane_service_wait_test", service_source)
    assert service_spec is not None and service_spec.loader is not None
    service_module = importlib.util.module_from_spec(service_spec)
    service_spec.loader.exec_module(service_module)
    state = SCRATCH / "predicate-waits" / "state"
    state.mkdir(parents=True, mode=0o700)
    store = service_module.Store(service_module.Config(state, None))
    workers: list[threading.Thread] = []

    def inject_at_wait(callback) -> None:
        original_wait = store.changed.wait
        armed = True

        def hooked_wait(timeout: float | None = None):
            nonlocal armed
            if armed:
                armed = False
                store.changed.wait = original_wait
                worker = threading.Thread(target=callback)
                workers.append(worker)
                worker.start()
            return original_wait(timeout)

        store.changed.wait = hooked_wait

    try:
        store.ensure_subscription({
            "subscription_id": "qq/atomic-wait", "product_id": "qq", "kind": "atomic.fact",
            "generation": 1, "reconstruct_from": 1,
        })
        empty = store.next_delivery({
            "consumer_type": "subscription", "consumer_id": "qq/atomic-wait", "generation": 1,
            "endpoint_token": "atomic-endpoint", "wait_ms": 0,
        })
        assert empty["delivery"] is None
        inject_at_wait(lambda: store.append("publish", publish_body("atomic-next", kind="atomic.fact")))
        started = time.monotonic()
        delivered = store.next_delivery({
            "consumer_type": "subscription", "consumer_id": "qq/atomic-wait", "generation": 1,
            "endpoint_token": "atomic-endpoint", "wait_ms": 2000,
        })["delivery"]
        next_elapsed = time.monotonic() - started
        assert delivered is not None and delivered["record"]["request_id"] == "atomic-next"
        assert next_elapsed < 1.0, next_elapsed
        for worker in workers:
            worker.join(timeout=2)
            assert not worker.is_alive()
        workers.clear()
        store.acknowledge(guard(delivered))

        accepted = store.append("send", send_body("atomic-status", recipient="qq/atomic-target"))
        direct = store.next_delivery({
            "consumer_type": "recipient", "consumer_id": "qq/atomic-target", "generation": 0,
            "endpoint_token": "atomic-status-endpoint", "wait_ms": 0,
        })["delivery"]
        assert direct is not None
        inject_at_wait(lambda: store.acknowledge(guard(direct)))
        started = time.monotonic()
        status = store.status({"event_id": accepted["record"]["event_id"], "wait_ms": 2000})
        status_elapsed = time.monotonic() - started
        assert status["terminal"] and status["obligations"][0]["status"] == "acknowledged"
        assert status_elapsed < 1.0, status_elapsed
        for worker in workers:
            worker.join(timeout=2)
            assert not worker.is_alive()
    finally:
        store.close()
    proofs.update({"next-lost-wake-atomic", "status-lost-wake-atomic"})


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

    deleted_position = fact["record"]["journal_position"]
    refused("replay_unavailable", c.ensure_subscription, {
        "subscription_id": "qq/deleted-boundary", "product_id": "qq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": deleted_position,
    })
    later_start = c.ensure_subscription({
        "subscription_id": "qq/after-deleted-boundary", "product_id": "qq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": deleted_position + 1,
    })
    assert later_start["reconstructed"] and later_start["replayed"] == 0
    isolated_kind = c.ensure_subscription({
        "subscription_id": "qq/isolated-kind", "product_id": "qq", "kind": "other.fact",
        "generation": 1, "reconstruct_from": deleted_position,
    })
    isolated_product = c.ensure_subscription({
        "subscription_id": "deciq/isolated-product", "product_id": "deciq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": deleted_position,
    })
    assert isolated_kind["reconstructed"] and isolated_product["reconstructed"]
    boundary_backup = plane.root / "retention-boundary.sqlite3"
    health = c.inspect({"view": "health"})
    c.backup({"path": str(boundary_backup)})
    plane.restart(); c = plane.client
    refused("replay_unavailable", c.ensure_subscription, {
        "subscription_id": "qq/deleted-after-restart", "product_id": "qq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": deleted_position,
    })
    c.restore({"path": str(boundary_backup), "expected_instance_id": health["instance_id"]})
    refused("replay_unavailable", c.ensure_subscription, {
        "subscription_id": "qq/deleted-after-restore", "product_id": "qq", "kind": "lease.fact",
        "generation": 1, "reconstruct_from": deleted_position,
    })
    proofs.update({"addressed-expiry-waiter", "lease-reconstruction", "retention-tombstone-deletion", "retention-replay-boundary", "blocked-abandoned-cleanup"})
    plane.close()


def framing_exactness() -> None:
    plane = Plane("framing-exact")
    c = plane.client
    before = c.inspect({"view": "health"})["counts"]["records"]
    valid_document = {"protocol": PROTOCOL, "operation": "send", "body": send_body("fragmented-valid")}
    valid_raw = json.dumps(valid_document, separators=(",", ":")).encode()
    fragmented = streamed_raw_request(plane.socket, valid_raw, fragmented=True)
    assert fragmented["ok"] and fragmented["result"]["accepted"]

    malformed_streams = [
        ("same-write", send_body("trailing-same"), b"TRAILING", False),
        ("split-write", send_body("trailing-split"), b"TRAILING", True),
    ]
    for _label, body, trailing, split in malformed_streams:
        document = {"protocol": PROTOCOL, "operation": "send", "body": body}
        raw = json.dumps(document, separators=(",", ":")).encode()
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(3)
        connection.connect(str(plane.socket))
        frame = struct.pack(">I", len(raw)) + raw
        if split:
            connection.sendall(frame)
            time.sleep(0.05)
            connection.sendall(trailing)
        else:
            connection.sendall(frame + trailing)
        connection.shutdown(socket.SHUT_WR)
        result = read_framed_response(connection)
        connection.close()
        assert not result["ok"] and result["error"]["code"] == "invalid_frame"
    duplicate_body = send_body("duplicate-frame")
    duplicate_raw = json.dumps(
        {"protocol": PROTOCOL, "operation": "send", "body": duplicate_body},
        separators=(",", ":"),
    ).encode()
    duplicate_frame = struct.pack(">I", len(duplicate_raw)) + duplicate_raw
    duplicate = streamed_raw_request(plane.socket, duplicate_raw, trailing=duplicate_frame)
    assert not duplicate["ok"] and duplicate["error"]["code"] == "invalid_frame"
    after = c.inspect({"view": "health"})["counts"]["records"]
    assert after == before + 1
    for request_id in ("trailing-same", "trailing-split", "duplicate-frame"):
        refused("not_found", c.status, {"producer_id": "qq/producer", "request_id": request_id})

    counter = 0

    def fake_response(*, split: bool, duplicate_response: bool = False) -> tuple[Path, threading.Thread]:
        nonlocal counter
        counter += 1
        path = plane.root / f"fake-response-{counter}.sock"
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(str(path))
        listener.listen(1)

        def serve_one() -> None:
            connection, _ = listener.accept()
            try:
                header = bytearray()
                while len(header) < 4:
                    header.extend(connection.recv(4 - len(header)))
                length = struct.unpack(">I", header)[0]
                request = bytearray()
                while len(request) < length:
                    request.extend(connection.recv(length - len(request)))
                assert connection.recv(1) == b""
                response_raw = json.dumps(
                    {"protocol": PROTOCOL, "ok": True, "result": {"accepted": True}},
                    separators=(",", ":"),
                ).encode()
                response_frame = struct.pack(">I", len(response_raw)) + response_raw
                trailing = response_frame if duplicate_response else b"TRAILING"
                if split:
                    connection.sendall(response_frame)
                    time.sleep(0.05)
                    connection.sendall(trailing)
                else:
                    connection.sendall(response_frame + trailing)
            finally:
                connection.close()
                listener.close()

        worker = threading.Thread(target=serve_one)
        worker.start()
        return path, worker

    for split, duplicate_response in ((False, False), (True, False), (True, True)):
        fake, worker = fake_response(split=split, duplicate_response=duplicate_response)
        refused("client_error", Client(str(fake), timeout_seconds=2).send, {})
        worker.join(timeout=3)
        assert not worker.is_alive()

    ts_refusal_script = r'''
const { EventPlaneClient } = await import(process.argv[2]);
try {
  await new EventPlaneClient(process.argv[3], 2000).send({});
  console.error("unexpected response acceptance");
  process.exit(1);
} catch (error) {
  console.log(JSON.stringify({rejected:true,code:error.code}));
}
'''
    for split, duplicate_response in ((False, False), (True, False), (True, True)):
        fake, worker = fake_response(split=split, duplicate_response=duplicate_response)
        process = subprocess.run(
            ["node", "--experimental-strip-types", "--input-type=module", "-", Path(TS_CLIENT).resolve().as_uri(), str(fake)],
            input=ts_refusal_script, text=True, capture_output=True, check=False,
        )
        worker.join(timeout=3)
        assert process.returncode == 0, (process.stdout, process.stderr)
        assert json.loads(process.stdout)["rejected"]
        assert not worker.is_alive()
    proofs.add("single-frame-stream-exactness")
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


def shared_integer_json_state_space() -> None:
    plane = Plane("shared-json")
    c = plane.client
    payloads: list[Any] = [
        None,
        False,
        -9007199254740991,
        "é shared text",
        [None, True, 7, "array"],
        {"😀": [1, {"nested": False}], "\ue000": "scalar-key-order"},
    ]
    def json_body(request_id: str, payload: Any) -> dict[str, Any]:
        body = send_body(request_id)
        body["payload"] = payload
        return body

    python_first: list[dict[str, Any]] = []
    for index, payload in enumerate(payloads):
        python_first.append(c.send(json_body(f"json-python-{index}", payload)))

    script = r'''
const { EventPlaneClient, canonicalEventPlaneJson } = await import(process.argv[2]);
const client = new EventPlaneClient(process.argv[3]);
const payloads = JSON.parse(process.argv[4]);
const body = (request_id, payload) => ({
  producer_id:"qq/producer",request_id,origin_id:"qq/change/T-209.16",recipient_id:"qq/actor",
  product_id:"qq",kind:"actor.message",schema_version:1,payload,
});
const retried = [];
const accepted = [];
for (let index = 0; index < payloads.length; index += 1) {
  retried.push(await client.send(body(`json-python-${index}`, payloads[index])));
  accepted.push(await client.send(body(`json-typescript-${index}`, payloads[index])));
}
console.log(JSON.stringify({retried,accepted,canonical:payloads.map(canonicalEventPlaneJson)}));
'''
    process = subprocess.run(
        [
            "node", "--experimental-strip-types", "--input-type=module", "-",
            Path(TS_CLIENT).resolve().as_uri(), str(plane.socket),
            json.dumps(payloads, ensure_ascii=False, separators=(",", ":")),
        ],
        input=script, text=True, capture_output=True, check=False,
    )
    assert process.returncode == 0, (process.stdout, process.stderr)
    observed = json.loads(process.stdout)
    for index, payload in enumerate(payloads):
        assert observed["retried"][index]["idempotent"]
        assert observed["retried"][index]["record"]["event_id"] == python_first[index]["record"]["event_id"]
        python_retry = c.send(json_body(f"json-typescript-{index}", payload))
        assert python_retry["idempotent"]
        assert python_retry["record"]["event_id"] == observed["accepted"][index]["record"]["event_id"]
        expected = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        assert observed["canonical"][index] == expected

    valid_count = c.inspect({"view": "health"})["counts"]["records"]
    invalid_values: list[Any] = [
        1.0, 1.5, float("nan"), float("inf"), float("-inf"),
        9007199254740992, -9007199254740992,
        {"nested": [0, {"unsafe": 9007199254740992}]}, "\ud800", {"2": "index-key"},
    ]
    for index, value in enumerate(invalid_values):
        refused("client_error", c.send, json_body(f"invalid-python-{index}", value))

    raw_numeric_values = [
        "1.0", "1.5", "NaN", "Infinity", "-Infinity",
        "9007199254740992", "-9007199254740992", "{\"nested\":[1.0]}", '"\\ud800"',
        '{"2":"index-key"}',
    ]
    for index, literal in enumerate(raw_numeric_values):
        raw = (
            '{"protocol":"qq-event-plane/v1","operation":"send","body":'
            '{"producer_id":"qq/raw","request_id":"raw-number-' + str(index) + '",'
            '"origin_id":"qq/source/raw","recipient_id":"qq/actor","product_id":"qq",'
            '"kind":"actor.message","schema_version":1,"payload":' + literal + '}}'
        ).encode()
        refusal = raw_request(plane.socket, raw=raw)
        assert not refusal["ok"]

    ts_invalid_script = r'''
const { EventPlaneClient } = await import(process.argv[2]);
const client = new EventPlaneClient(process.argv[3]);
const values = [1.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1,Number.MIN_SAFE_INTEGER-1,{nested:[1.5]},"\ud800",{"2":"index-key"}];
const refused = [];
for (let index = 0; index < values.length; index += 1) {
  try {
    await client.send({producer_id:"qq/ts",request_id:`invalid-ts-${index}`,origin_id:"qq/source/ts",recipient_id:"qq/actor",product_id:"qq",kind:"actor.message",schema_version:1,payload:values[index]});
    refused.push(false);
  } catch (error) { refused.push(error.code === "client_error"); }
}
console.log(JSON.stringify(refused));
'''
    invalid_process = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-", Path(TS_CLIENT).resolve().as_uri(), str(plane.socket)],
        input=ts_invalid_script, text=True, capture_output=True, check=False,
    )
    assert invalid_process.returncode == 0, (invalid_process.stdout, invalid_process.stderr)
    assert all(json.loads(invalid_process.stdout))
    assert c.inspect({"view": "health"})["counts"]["records"] == valid_count
    proofs.update({"cross-client-json-classes", "strict-integer-json-refusal"})
    plane.close()


def administration_and_rollback() -> None:
    plane = Plane("administration")
    c = plane.client
    baseline = c.send(send_body("backup-baseline"))
    health = c.inspect({"view": "health"})
    assert health["journal_mode"] == "delete" and health["synchronous"] == "FULL"
    assert c.inspect({"view": "integrity"}) == {"integrity": "ok", "ok": True, "schema_version": 2}
    database = plane.state / "event-plane.sqlite3"
    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
        trigger = db.execute("SELECT sql FROM sqlite_master WHERE name='records_immutable'").fetchone()[0]
        assert "immutable journal record" in trigger
    backup = plane.root / "backup.sqlite3"
    c.backup({"path": str(backup)})
    assert stat.S_IMODE(backup.stat().st_mode) == 0o600

    # Build an exact prior v1 backup, then independently alter each supported
    # structural class. Every integrity-clean candidate refuses before live
    # replacement and the accepted baseline remains usable.
    valid_v1 = plane.root / "valid-v1.sqlite3"
    shutil.copy2(backup, valid_v1)
    with sqlite3.connect(valid_v1) as db:
        db.execute("DROP TABLE retention_boundaries")
        db.execute("UPDATE metadata SET value='1' WHERE key='schema_version'")
        db.execute("PRAGMA user_version=1")
        db.commit()
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    valid_v1.chmod(0o600)
    mutations = {
        "missing-table": ["DROP TABLE endpoints"],
        "altered-columns": ["ALTER TABLE endpoints ADD COLUMN unexpected TEXT"],
        "altered-index": [
            "DROP INDEX obligations_delivery",
            "CREATE INDEX obligations_delivery ON obligations(consumer_id,record_position)",
        ],
        "missing-trigger": ["DROP TRIGGER records_immutable"],
    }
    for label, statements in mutations.items():
        candidate = plane.root / f"invalid-{label}.sqlite3"
        shutil.copy2(valid_v1, candidate)
        with sqlite3.connect(candidate) as db:
            for statement in statements:
                db.execute(statement)
            db.commit()
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        candidate.chmod(0o600)
        refused("invalid_restore", c.restore, {
            "path": str(candidate), "expected_instance_id": health["instance_id"],
        })
        assert c.status({"event_id": baseline["record"]["event_id"]})["record"]["event_id"] == baseline["record"]["event_id"]

    deleted_v1 = plane.root / "deleted-history-v1.sqlite3"
    shutil.copy2(valid_v1, deleted_v1)
    with sqlite3.connect(deleted_v1) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("DELETE FROM records")
        db.commit()
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    deleted_v1.chmod(0o600)
    refused("replay_unavailable", c.restore, {
        "path": str(deleted_v1), "expected_instance_id": health["instance_id"],
    })
    assert c.status({"event_id": baseline["record"]["event_id"]})["record"]["event_id"] == baseline["record"]["event_id"]

    # Prior exact schema backups migrate both on restore and cold startup.
    migrated_restore = c.restore({"path": str(valid_v1), "expected_instance_id": health["instance_id"]})
    assert migrated_restore["integrity"] == "ok"
    assert c.inspect({"view": "health"})["schema_version"] == 2
    migration_state = plane.root / "migration-state"
    migration_state.mkdir(mode=0o700)
    migrated_database = migration_state / "event-plane.sqlite3"
    shutil.copy2(valid_v1, migrated_database)
    migrated_database.chmod(0o600)
    migration_process = subprocess.Popen(
        [SERVICE, "serve", "--state-dir", str(migration_state), "--test-clock", str(plane.clock)],
        env=plane.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    migration_socket = migration_state / "event-plane.sock"
    for _ in range(250):
        if migration_socket.is_socket():
            break
        if migration_process.poll() is not None:
            out, err = migration_process.communicate()
            raise AssertionError((migration_process.returncode, out, err))
        time.sleep(0.01)
    else:
        raise AssertionError("v1 migration service did not start")
    migration_client = Client(str(migration_socket))
    assert migration_client.inspect({"view": "health"})["schema_version"] == 2
    migration_process.terminate(); migration_process.wait(timeout=10)
    with sqlite3.connect(migrated_database) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("SELECT COUNT(*) FROM retention_boundaries").fetchone()[0] == 0

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
    proofs.update({"migration-integrity", "schema-v1-v2-migration", "structural-restore-atomic", "backup-restore", "singleton", "permissions", "signal-cleanup", "exact-rollback"})


def test_clock_preflight() -> None:
    root = SCRATCH / "clock-preflight"
    root.mkdir(mode=0o700)
    good = root / "good-clock"
    good.write_text("1000000\n", encoding="ascii"); good.chmod(0o600)
    loose = root / "loose-clock"
    loose.write_text("1000000\n", encoding="ascii"); loose.chmod(0o666)
    target = root / "target-clock"
    target.write_text("1000000\n", encoding="ascii"); target.chmod(0o600)
    symlink = root / "clock-link"; symlink.symlink_to(target)
    directory = root / "clock-directory"; directory.mkdir(mode=0o700)
    fifo = root / "clock-fifo"; os.mkfifo(fifo, mode=0o600)
    malformed = root / "malformed-clock"
    malformed.write_text("not-a-clock\n", encoding="ascii"); malformed.chmod(0o600)
    real_parent = root / "real-parent"; real_parent.mkdir(mode=0o700)
    nested = real_parent / "clock"; nested.write_text("1000000\n", encoding="ascii"); nested.chmod(0o600)
    linked_parent = root / "linked-parent"; linked_parent.symlink_to(real_parent, target_is_directory=True)
    rejected = [
        loose, symlink, directory, fifo, malformed, root / "missing-clock",
        Path("/dev/null"), linked_parent / "clock",
    ]
    if os.geteuid() == 0:
        foreign = root / "foreign-clock"
        foreign.write_text("1000000\n", encoding="ascii"); foreign.chmod(0o600); os.chown(foreign, 65534, 65534)
        rejected.append(foreign)
    env = os.environ.copy(); env["QQ_EVENT_PLANE_TESTING"] = "1"
    for index, clock in enumerate(rejected):
        state = root / f"rejected-state-{index}"
        result = subprocess.run(
            [SERVICE, "serve", "--state-dir", str(state), "--test-clock", str(clock)],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5,
        )
        assert result.returncode == 73, (clock, result.returncode, result.stderr)
        assert not state.exists(), f"rejected clock created Event Plane state: {clock}"

    production_state = root / "production-seam-state"
    production_env = os.environ.copy(); production_env.pop("QQ_EVENT_PLANE_TESTING", None)
    production = subprocess.run(
        [SERVICE, "serve", "--state-dir", str(production_state), "--test-clock", str(good)],
        env=production_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5,
    )
    assert production.returncode == 73 and not production_state.exists()

    valid_state = root / "valid-state"
    process = subprocess.Popen(
        [SERVICE, "serve", "--state-dir", str(valid_state), "--test-clock", str(good)],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    valid_socket = valid_state / "event-plane.sock"
    for _ in range(250):
        if valid_socket.is_socket():
            break
        if process.poll() is not None:
            out, err = process.communicate()
            raise AssertionError((process.returncode, out, err))
        time.sleep(0.01)
    else:
        raise AssertionError("valid isolated clock service did not start")
    assert Client(str(valid_socket)).inspect({"view": "health"})["service"] == "qq-event-plane"
    process.terminate(); process.wait(timeout=10)
    proofs.add("test-clock-preflight-no-state")


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
    post_copy_restore_atomicity()
    predicate_wait_atomicity()
    backoff_blocking()
    expiry_lease_and_retention()
    framing_exactness()
    ts_equivalence()
    shared_integer_json_state_space()
    administration_and_rollback()
    test_clock_preflight()
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
    "crash-redelivery", "guarded-ack", "poison-nonfreezing", "blocked-rebind-resolution",
    "audited-disposition", "acceptance-order-only", "next-lost-wake-atomic", "status-lost-wake-atomic",
    "backoff-blocked-no-hot-loop", "addressed-expiry-waiter", "lease-reconstruction",
    "retention-tombstone-deletion", "retention-replay-boundary", "blocked-abandoned-cleanup",
    "single-frame-stream-exactness", "python-typescript-equivalence", "cross-client-json-classes",
    "strict-integer-json-refusal", "migration-integrity", "schema-v1-v2-migration",
    "structural-restore-atomic", "post-copy-restore-rollback", "backup-restore", "singleton", "permissions", "signal-cleanup",
    "exact-rollback", "test-clock-preflight-no-state", "inactive-nongoal-absence",
}
assert proofs == expected, (expected - proofs, proofs - expected)
print(f"event-plane proof matrix: {len(proofs)} named proofs")
