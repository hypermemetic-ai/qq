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
from typing import Any, Callable

from qq_event_plane_state import (
    CANDIDATE_NAME,
    CANDIDATE_TEMP_NAME,
    COMMIT_FORMAT,
    COMMIT_NAME,
    COMMIT_TEMP_NAME,
    DATABASE_NAME,
    LOCK_NAME,
    RESTORE_NAMES,
    SAFETY_NAME,
    SAFETY_TEMP_NAME,
    OfflineSingleton,
    RestoreStateError,
    SingletonBusy,
    copy_into_existing,
    fsync_directory,
    fsync_file,
    inspect_state_namespace,
    private_state_directory,
    reconcile_restore_state,
    validate_backup_path,
    validated_database_evidence,
    write_commit_temp,
)

sys.dont_write_bytecode = True

PROTOCOL = "qq-event-plane/v1"
MAX_FRAME_BYTES = 128 * 1024
MAX_SAFE_INTEGER = 2**53 - 1
MAX_JAVASCRIPT_ARRAY_INDEX = "4294967294"
OPERATIONS = (
    "send", "publish", "ensure_subscription", "next", "acknowledge", "retry", "block",
    "disposition", "status", "inspect", "backup", "shutdown",
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
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise EventPlaneClientError("state directory must be account-owned with mode 0700")
    return path.resolve(strict=True)


def load_body(raw: str | None) -> dict[str, Any]:
    def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON field: {key}")
            result[key] = value
        return result

    def safe_integer(value: str) -> int:
        parsed = int(value)
        if not -MAX_SAFE_INTEGER <= parsed <= MAX_SAFE_INTEGER:
            raise ValueError("integer outside shared range")
        return parsed

    try:
        if raw is None or raw == "-":
            text = sys.stdin.read()
        elif raw.startswith("@"):
            text = Path(raw[1:]).read_text(encoding="utf-8")
        else:
            text = raw
        value = json.loads(
            text,
            parse_int=safe_integer,
            parse_float=lambda item: (_ for _ in ()).throw(ValueError(item)),
            parse_constant=lambda item: (_ for _ in ()).throw(ValueError(item)),
            object_pairs_hook=unique_object,
        )
        validate_json_value(value)
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise EventPlaneClientError(f"cannot read strict JSON body: {error}") from error
    if not isinstance(value, dict):
        raise EventPlaneClientError("JSON body must be an object")
    return value


def restore_checkpoint(name: str) -> None:
    """Isolated process-death seam at real internal publication boundaries."""
    if os.environ.get("QQ_EVENT_PLANE_TESTING") != "1":
        return
    if os.environ.get("QQ_EVENT_PLANE_RESTORE_CRASH_AT") == name:
        os._exit(97)


def perform_offline_restore(
    state_dir: Path,
    body: dict[str, Any],
    validate_database: Callable[[Path], dict[str, Any]],
) -> dict[str, Any]:
    required = {"backup_path", "expected_instance_id", "authorization"}
    if not isinstance(body, dict) or set(body) != required:
        raise RestoreStateError(
            "restore requires exactly backup_path, expected_instance_id, and authorization"
        )
    if body.get("authorization") != "operator":
        raise RestoreStateError("restore requires exact local operator authorization")
    backup_raw = body.get("backup_path")
    expected = body.get("expected_instance_id")
    if not isinstance(backup_raw, str) or not isinstance(expected, str) or not expected:
        raise RestoreStateError("restore backup and instance guards are malformed")

    state_dir = private_state_directory(state_dir)
    # Unknown/type/mode/link ambiguity is rejected before lock acquisition and
    # before any mutation. The lock itself must already be installed.
    inspect_state_namespace(state_dir, require_database=True, require_lock=True)
    backup = Path(backup_raw)
    try:
        backup_parent = backup.parent.resolve(strict=True) if backup.is_absolute() else None
    except OSError as error:
        raise RestoreStateError(f"cannot resolve backup_path parent: {error}") from error
    if backup_parent == state_dir:
        raise RestoreStateError("backup_path must be outside the installed state directory")
    with OfflineSingleton(state_dir / LOCK_NAME):
        reconcile_restore_state(state_dir, validate_database)
        paths = inspect_state_namespace(state_dir, require_database=True, require_lock=True)
        if any(name in paths for name in RESTORE_NAMES):
            raise RestoreStateError("offline restore reconciliation left fixed restore state")
        live = state_dir / DATABASE_NAME
        live_info = live.lstat()
        live_evidence = validated_database_evidence(live, validate_database)
        if live_evidence["instance_id"] != expected:
            raise RestoreStateError("expected_instance_id does not match the installed database")

        backup_info = validate_backup_path(backup)
        if (backup_info.st_dev, backup_info.st_ino) == (live_info.st_dev, live_info.st_ino):
            raise RestoreStateError("restore backup must be independent from the live database")
        source_evidence = validated_database_evidence(backup, validate_database)
        if source_evidence["instance_id"] != expected:
            raise RestoreStateError("restore backup instance does not match expected_instance_id")

        candidate_temp = state_dir / CANDIDATE_TEMP_NAME
        candidate = state_dir / CANDIDATE_NAME
        safety_temp = state_dir / SAFETY_TEMP_NAME
        safety = state_dir / SAFETY_NAME
        commit_temp = state_dir / COMMIT_TEMP_NAME
        commit = state_dir / COMMIT_NAME
        committed = False
        try:
            # Candidate and safety final names never exist partially: each is
            # copied, fsynced, fully validated, then atomically published.
            descriptor = os.open(
                candidate_temp,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            os.close(descriptor)
            restore_checkpoint("candidate-temp-created")
            copy_into_existing(backup, candidate_temp)
            restore_checkpoint("candidate-temp-durable")
            candidate_evidence = validated_database_evidence(candidate_temp, validate_database)
            if candidate_evidence != source_evidence:
                raise RestoreStateError("durable restore candidate differs from validated backup")
            os.replace(candidate_temp, candidate)
            restore_checkpoint("candidate-published")
            fsync_directory(state_dir)
            restore_checkpoint("candidate-publication-durable")

            descriptor = os.open(
                safety_temp,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            os.close(descriptor)
            restore_checkpoint("safety-temp-created")
            copy_into_existing(live, safety_temp)
            restore_checkpoint("safety-temp-durable")
            safety_evidence = validated_database_evidence(safety_temp, validate_database)
            if safety_evidence != live_evidence:
                raise RestoreStateError("durable restore safety differs from installed database")
            restore_checkpoint("before-safety-publication")
            os.replace(safety_temp, safety)
            restore_checkpoint("after-safety-publication")
            fsync_directory(state_dir)
            restore_checkpoint("safety-publication-durable")

            marker = {
                "format": COMMIT_FORMAT,
                "instance_id": expected,
                "pre_restore_sha256": live_evidence["sha256"],
                "candidate_sha256": candidate_evidence["sha256"],
            }
            write_commit_temp(commit_temp, marker)
            restore_checkpoint("commit-temp-durable")

            restore_checkpoint("before-live-publication")
            os.replace(candidate, live)
            restore_checkpoint("after-live-publication")
            fsync_file(live)
            fsync_directory(state_dir)
            restore_checkpoint("candidate-live-durable")

            # This atomic marker publication is the process-crash commit
            # boundary. Before it, safety wins; from it onward, candidate wins.
            restore_checkpoint("before-commit-publication")
            os.replace(commit_temp, commit)
            committed = True
            restore_checkpoint("after-commit-publication")
            fsync_directory(state_dir)
            restore_checkpoint("commit-publication-durable")

            safety.unlink()
            fsync_directory(state_dir)
            restore_checkpoint("after-safety-cleanup")
            commit.unlink()
            fsync_directory(state_dir)
            restore_checkpoint("after-final-cleanup")
        except Exception as error:
            try:
                outcome = reconcile_restore_state(state_dir, validate_database)
            except BaseException as recovery_error:
                raise RestoreStateError(
                    f"offline restore failed and recovery refused ambiguous state: {recovery_error}"
                ) from error
            if committed and outcome == "candidate":
                final = validated_database_evidence(live, validate_database)
                return {
                    "restored": True,
                    "instance_id": final["instance_id"],
                    "integrity": final.get("integrity", "ok"),
                    "sha256": final["sha256"],
                }
            raise

        final = validated_database_evidence(live, validate_database)
        if final["sha256"] != candidate_evidence["sha256"]:
            raise RestoreStateError("restored live database differs from validated candidate")
        return {
            "restored": True,
            "instance_id": final["instance_id"],
            "integrity": final.get("integrity", "ok"),
            "sha256": final["sha256"],
        }


def validate_offline_database(path: Path) -> dict[str, Any]:
    # The schema contract remains owned by the service implementation while
    # fixed-name validation/reconciliation is shared with service startup.
    from qq_event_plane_service import Store

    return Store.validate_offline_database(path)


def restore(state_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return perform_offline_restore(state_dir, body, validate_offline_database)
    except SingletonBusy as error:
        raise EventPlaneClientError(str(error), "service_running") from error
    except RestoreStateError as error:
        raise EventPlaneClientError(str(error), "invalid_restore") from error
    except Exception as error:
        # Configuration/schema errors from the service validator are rendered as
        # bounded administration refusals rather than Python tracebacks.
        raise EventPlaneClientError(str(error), "invalid_restore") from error


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
    lock_path = state_dir / LOCK_NAME
    deadline = time.monotonic() + 10
    while socket_path.exists() and time.monotonic() < deadline:
        time.sleep(0.02)
    if socket_path.exists():
        raise EventPlaneClientError("service did not stop; rollback retained all state", "rollback_incomplete")
    try:
        inspect_state_namespace(state_dir, require_database=True, require_lock=True)
        with OfflineSingleton(lock_path):
            reconcile_restore_state(state_dir, validate_offline_database)
            observed = inspect_state_namespace(
                state_dir, require_database=True, require_lock=True
            )
            if any(name in observed for name in RESTORE_NAMES):
                raise RestoreStateError("rollback reconciliation left offline restore state")
            if set(observed) != {DATABASE_NAME, LOCK_NAME}:
                raise RestoreStateError("rollback state contains names outside the exact installed pair")
            validate_offline_database(state_dir / DATABASE_NAME)
            (state_dir / DATABASE_NAME).unlink()
            fsync_directory(state_dir)
        lock_path.unlink()
        fsync_directory(state_dir)
        state_dir.rmdir()
    except SingletonBusy as error:
        raise EventPlaneClientError(str(error), "rollback_incomplete") from error
    except Exception as error:
        raise EventPlaneClientError(str(error), "rollback_incomplete") from error
    return {"rolled_back": True, "backup": backup_result, "shutdown": shutdown_result}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="qq-event-plane-admin")
    parser.add_argument("--state-dir")
    parser.add_argument("operation", choices=(*OPERATIONS, "wait", "restore", "rollback"))
    parser.add_argument("body", nargs="?", help="JSON object, @file, or - for stdin (default)")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    try:
        args = parse_args(argv)
        state = private_state_dir(args.state_dir)
        body = load_body(args.body)
        if args.operation == "restore":
            result = restore(state, body)
        else:
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
