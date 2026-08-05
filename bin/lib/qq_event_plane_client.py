#!/usr/bin/env python3
"""Dependency-free Python client for qq Event Plane inspection and administration."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import stat
import struct
import sys
import time
from typing import Any

sys.dont_write_bytecode = True

PROTOCOL = "qq-event-plane/v1"
MAX_FRAME_BYTES = 128 * 1024
MAX_SAFE_INTEGER = 2**53 - 1
MAX_JAVASCRIPT_ARRAY_INDEX = "4294967294"
OPERATIONS = (
    "send", "publish", "ensure_subscription", "next", "acknowledge", "retry", "block",
    "disposition", "status", "inspect", "backup", "restore", "shutdown",
)


class EventPlaneClientError(Exception):
    def __init__(self, message: str, code: str = "client_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def is_javascript_array_index(value: str) -> bool:
    if value == "0":
        return True
    if not value or value[0] == "0" or any(character < "0" or character > "9" for character in value):
        return False
    return len(value) < len(MAX_JAVASCRIPT_ARRAY_INDEX) or (
        len(value) == len(MAX_JAVASCRIPT_ARRAY_INDEX)
        and value <= MAX_JAVASCRIPT_ARRAY_INDEX
    )


def validate_json_object_key(value: str) -> None:
    validate_json_value(value)
    if is_javascript_array_index(value):
        raise EventPlaneClientError("operation body object keys cannot be JavaScript array indexes")


def validate_json_value(value: Any, seen: set[int] | None = None) -> None:
    active = set() if seen is None else seen
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise EventPlaneClientError("operation body strings must contain only Unicode scalar values")
        return
    if isinstance(value, int):
        if not -MAX_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER:
            raise EventPlaneClientError("operation body contains an integer outside the shared safe range")
        return
    if isinstance(value, float):
        raise EventPlaneClientError("operation body JSON numbers must be integers")
    if isinstance(value, (list, dict)):
        identity = id(value)
        if identity in active:
            raise EventPlaneClientError("operation body is cyclic")
        active.add(identity)
        try:
            values: Any
            if isinstance(value, dict):
                if not all(isinstance(key, str) for key in value):
                    raise EventPlaneClientError("operation body JSON object keys must be strings")
                for key in value:
                    validate_json_object_key(key)
                values = value.values()
            else:
                values = value
            for item in values:
                validate_json_value(item, active)
        finally:
            active.remove(identity)
        return
    raise EventPlaneClientError("operation body contains a non-JSON value")


class EventPlaneClient:
    """One-request-per-connection bounded protocol client."""

    def __init__(self, socket_path: str, timeout_seconds: float = 35):
        if not isinstance(socket_path, str) or not os.path.isabs(socket_path):
            raise EventPlaneClientError("socket path must be absolute")
        if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool) or not 0 < timeout_seconds <= 60:
            raise EventPlaneClientError("timeout_seconds must be positive and at most 60")
        self.socket_path = socket_path
        self.timeout_seconds = float(timeout_seconds)

    def _request(self, operation: str, body: dict[str, Any]) -> dict[str, Any]:
        if operation not in OPERATIONS:
            raise EventPlaneClientError("operation is not supported by the bounded client")
        if not isinstance(body, dict):
            raise EventPlaneClientError("operation body must be a JSON object")
        try:
            validate_json_value(body)
            raw = json.dumps(
                {"protocol": PROTOCOL, "operation": operation, "body": body},
                ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise EventPlaneClientError(f"operation body is not finite JSON: {error}") from error
        if len(raw) > MAX_FRAME_BYTES:
            raise EventPlaneClientError("request exceeds the bounded protocol frame", "frame_too_large")
        connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.settimeout(self.timeout_seconds)
        try:
            connection.connect(self.socket_path)
            connection.sendall(struct.pack(">I", len(raw)) + raw)
            # EOF on the write half is the exact-one-request handshake. The
            # service cannot dispatch before observing it.
            connection.shutdown(socket.SHUT_WR)
            header = self._read_exact(connection, 4)
            length = struct.unpack(">I", header)[0]
            if length < 2 or length > MAX_FRAME_BYTES:
                raise EventPlaneClientError("service returned an invalid bounded frame")
            response_raw = self._read_exact(connection, length)
            trailing = connection.recv(1)
            if trailing:
                raise EventPlaneClientError("service returned trailing bytes outside its frame")
        except (FileNotFoundError, ConnectionRefusedError) as error:
            raise EventPlaneClientError("Event Plane service is unavailable", "unavailable") from error
        except (OSError, socket.timeout) as error:
            raise EventPlaneClientError(f"Event Plane transport failed: {error}", "transport_error") from error
        finally:
            connection.close()
        try:
            document = json.loads(response_raw.decode("utf-8"))
            validate_json_value(document)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise EventPlaneClientError("service returned malformed JSON") from error
        if (
            not isinstance(document, dict)
            or document.get("protocol") != PROTOCOL
            or not isinstance(document.get("ok"), bool)
        ):
            raise EventPlaneClientError("service returned a malformed protocol response")
        if not document["ok"]:
            failure = document.get("error")
            if not isinstance(failure, dict):
                raise EventPlaneClientError("service returned a malformed refusal")
            code = failure.get("code")
            message = failure.get("message")
            if not isinstance(code, str) or not isinstance(message, str):
                raise EventPlaneClientError("service returned a malformed refusal")
            raise EventPlaneClientError(message, code)
        result = document.get("result")
        if not isinstance(result, dict):
            raise EventPlaneClientError("service returned a non-object result")
        return result

    @staticmethod
    def _read_exact(connection: socket.socket, size: int) -> bytes:
        value = bytearray()
        while len(value) < size:
            chunk = connection.recv(size - len(value))
            if not chunk:
                raise EventPlaneClientError("service closed an incomplete response")
            value.extend(chunk)
        return bytes(value)

    def send(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("send", body)

    def publish(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("publish", body)

    def ensure_subscription(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("ensure_subscription", body)

    def next(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("next", body)

    def wait(self, body: dict[str, Any]) -> dict[str, Any]:
        if "wait_ms" not in body:
            raise EventPlaneClientError("wait requires an explicit wait_ms")
        return self._request("next", body)

    def acknowledge(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("acknowledge", body)

    def retry(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("retry", body)

    def block(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("block", body)

    def disposition(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("disposition", body)

    def status(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("status", body)

    def inspect(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("inspect", body)

    def backup(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("backup", body)

    def restore(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("restore", body)

    def shutdown(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("shutdown", body)


def default_state_dir() -> Path:
    state_home = os.environ.get("XDG_STATE_HOME")
    if state_home:
        return Path(state_home) / "qq" / "event-plane"
    home = os.environ.get("HOME")
    if not home:
        raise EventPlaneClientError("HOME or XDG_STATE_HOME is required")
    return Path(home) / ".local" / "state" / "qq" / "event-plane"


def private_state_dir(raw: str | None) -> Path:
    path = Path(raw) if raw else default_state_dir()
    if not path.is_absolute():
        raise EventPlaneClientError("state directory must be absolute")
    try:
        info = path.lstat()
    except OSError as error:
        raise EventPlaneClientError(f"cannot inspect state directory: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise EventPlaneClientError("state directory must be a real directory")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise EventPlaneClientError("state directory must be account-private")
    return path.resolve(strict=True)


def load_body(raw: str | None) -> dict[str, Any]:
    try:
        if raw is None or raw == "-":
            value = json.load(sys.stdin)
        elif raw.startswith("@"):
            value = json.loads(Path(raw[1:]).read_text(encoding="utf-8"))
        else:
            value = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise EventPlaneClientError(f"cannot read JSON body: {error}") from error
    if not isinstance(value, dict):
        raise EventPlaneClientError("JSON body must be an object")
    return value


def rollback(client: EventPlaneClient, state_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    expected = {"backup_path", "expected_instance_id", "authorization"}
    unknown = set(body) - expected
    missing = expected - set(body)
    if unknown or missing:
        raise EventPlaneClientError("rollback requires exactly backup_path, expected_instance_id, and authorization")
    if body["authorization"] != "operator":
        raise EventPlaneClientError("rollback requires local operator authorization")
    backup_path = body["backup_path"]
    instance = body["expected_instance_id"]
    if not isinstance(backup_path, str) or not os.path.isabs(backup_path) or not isinstance(instance, str):
        raise EventPlaneClientError("rollback backup and instance guards are malformed")
    backup_result = client.backup({"path": backup_path})
    shutdown_result = client.shutdown({"expected_instance_id": instance, "authorization": "operator"})
    socket_path = state_dir / "event-plane.sock"
    lock_path = state_dir / "event-plane.lock"
    deadline = time.monotonic() + 10
    while socket_path.exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    if socket_path.exists():
        raise EventPlaneClientError("service did not stop; rollback retained all state", "rollback_incomplete")
    lock_fd = os.open(lock_path, os.O_RDWR)
    try:
        import fcntl
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise EventPlaneClientError("singleton lock remains owned; rollback retained all state") from error
        allowed = {"event-plane.sqlite3", "event-plane.lock"}
        observed = {path.name for path in state_dir.iterdir()}
        if observed - allowed:
            raise EventPlaneClientError("state directory contains unknown files; rollback retained all state")
        database = state_dir / "event-plane.sqlite3"
        if database.exists():
            database.unlink()
        os.close(lock_fd)
        lock_fd = -1
        lock_path.unlink(missing_ok=True)
        state_dir.rmdir()
    finally:
        if lock_fd >= 0:
            os.close(lock_fd)
    return {"rolled_back": True, "backup": backup_result, "shutdown": shutdown_result}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="qq-event-plane-admin")
    parser.add_argument("--state-dir")
    parser.add_argument("operation", choices=(*OPERATIONS, "wait", "rollback"))
    parser.add_argument("body", nargs="?", help="JSON object, @file, or - for stdin (default)")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    try:
        args = parse_args(argv)
        state = private_state_dir(args.state_dir)
        body = load_body(args.body)
        client = EventPlaneClient(str(state / "event-plane.sock"))
        if args.operation == "rollback":
            result = rollback(client, state, body)
        else:
            method = getattr(client, args.operation)
            result = method(body)
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        return 0
    except EventPlaneClientError as error:
        print(
            json.dumps(
                {"ok": False, "error": {"code": error.code, "message": error.message}},
                ensure_ascii=False, sort_keys=True, separators=(",", ":"),
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
