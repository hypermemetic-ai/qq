#!/usr/bin/env python3
"""Deterministic, machine-local qq Event Plane service.

The service is intentionally payload-agnostic.  It owns the only SQLite
connection, and its Unix-socket protocol exposes bounded state transitions,
not SQL.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import socketserver
import sqlite3
import stat
import struct
import sys
import threading
import time
from typing import Any, Callable, Iterator
import uuid

sys.dont_write_bytecode = True

PROTOCOL = "qq-event-plane/v1"
SCHEMA_VERSION = 2
MAX_FRAME_BYTES = 128 * 1024
MAX_PAYLOAD_BYTES = 64 * 1024
MAX_WAIT_MS = 30_000
SEND_TTL_MS = 60 * 60 * 1000
SUBSCRIPTION_LEASE_MS = 24 * 60 * 60 * 1000
PAYLOAD_RETENTION_MS = 24 * 60 * 60 * 1000
TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
BACKOFF_MS = (1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000)
BLOCK_AFTER_FAILURES = 8
CLEANUP_BATCH = 100

PRODUCT_RE = re.compile(r"[a-z][a-z0-9-]{0,62}\Z")
LOGICAL_ID_RE = re.compile(r"[a-z][a-z0-9-]{0,62}/[A-Za-z0-9][A-Za-z0-9._/-]{0,190}\Z")
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@/-]{0,190}\Z")
KIND_RE = re.compile(r"[a-z][a-z0-9.-]{0,126}\Z")
TERMINAL = ("acknowledged", "expired", "disposed", "abandoned")
OPEN = ("pending", "in_flight", "blocked")
MAX_SAFE_INTEGER = 2**53 - 1
MAX_JAVASCRIPT_ARRAY_INDEX = "4294967294"

# These definitions are both the migration input and the exact structural
# contract accepted at startup/restore. SQLite-created autoindexes are omitted;
# every Event Plane-owned table, explicit index, and trigger is included.
SCHEMA_V1_OBJECTS = {
    ("table", "metadata"): """CREATE TABLE metadata(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )""",
    ("table", "records"): """CREATE TABLE records(
        journal_position INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        producer_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        normalized_input BLOB,
        record_type TEXT NOT NULL CHECK(record_type IN ('send','publish')),
        product_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        origin_id TEXT NOT NULL,
        recipient_id TEXT,
        schema_version INTEGER NOT NULL,
        accepted_at INTEGER NOT NULL,
        deadline_at INTEGER,
        envelope_json BLOB,
        payload_json BLOB,
        terminal_at INTEGER,
        payload_purged_at INTEGER,
        UNIQUE(producer_id, request_id)
    )""",
    ("table", "subscriptions"): """CREATE TABLE subscriptions(
        subscription_id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        generation INTEGER NOT NULL,
        reconstruction_position INTEGER NOT NULL,
        high_water INTEGER NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK(active IN (0,1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expired_at INTEGER
    )""",
    ("table", "obligations"): """CREATE TABLE obligations(
        obligation_id TEXT PRIMARY KEY,
        record_position INTEGER NOT NULL REFERENCES records(journal_position) ON DELETE CASCADE,
        consumer_type TEXT NOT NULL CHECK(consumer_type IN ('recipient','subscription')),
        consumer_id TEXT NOT NULL,
        subscription_generation INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','in_flight','blocked','acknowledged','expired','disposed','abandoned')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        attempt_token TEXT,
        endpoint_token TEXT,
        next_attempt_at INTEGER NOT NULL,
        last_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        terminal_at INTEGER,
        UNIQUE(record_position, consumer_type, consumer_id, subscription_generation)
    )""",
    ("index", "obligations_delivery"): """CREATE INDEX obligations_delivery ON obligations(
        consumer_type, consumer_id, subscription_generation, status, next_attempt_at, record_position
    )""",
    ("table", "consumer_gaps"): """CREATE TABLE consumer_gaps(
        subscription_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        record_position INTEGER NOT NULL,
        obligation_id TEXT NOT NULL UNIQUE REFERENCES obligations(obligation_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY(subscription_id, generation, record_position)
    )""",
    ("table", "endpoints"): """CREATE TABLE endpoints(
        consumer_type TEXT NOT NULL,
        consumer_id TEXT NOT NULL,
        generation INTEGER NOT NULL,
        endpoint_token TEXT NOT NULL,
        bound_at INTEGER NOT NULL,
        PRIMARY KEY(consumer_type, consumer_id, generation)
    )""",
    ("table", "dispositions"): """CREATE TABLE dispositions(
        disposition_id TEXT PRIMARY KEY,
        obligation_id TEXT NOT NULL REFERENCES obligations(obligation_id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        authorized_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        disposed_at INTEGER NOT NULL
    )""",
    ("trigger", "records_immutable"): """CREATE TRIGGER records_immutable
    BEFORE UPDATE ON records
    WHEN OLD.event_id != NEW.event_id
      OR OLD.producer_id != NEW.producer_id
      OR OLD.request_id != NEW.request_id
      OR OLD.input_hash != NEW.input_hash
      OR OLD.record_type != NEW.record_type
      OR OLD.product_id != NEW.product_id
      OR OLD.kind != NEW.kind
      OR OLD.origin_id != NEW.origin_id
      OR COALESCE(OLD.recipient_id, '') != COALESCE(NEW.recipient_id, '')
      OR OLD.schema_version != NEW.schema_version
      OR OLD.accepted_at != NEW.accepted_at
      OR COALESCE(OLD.deadline_at, -1) != COALESCE(NEW.deadline_at, -1)
    BEGIN SELECT RAISE(ABORT, 'immutable journal record'); END""",
}
SCHEMA_V2_OBJECTS = {
    **SCHEMA_V1_OBJECTS,
    ("table", "retention_boundaries"): """CREATE TABLE retention_boundaries(
        product_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        unavailable_through_position INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(product_id, kind)
    )""",
}


class Refusal(Exception):
    def __init__(self, message: str, code: str = "refused"):
        super().__init__(message)
        self.message = message
        self.code = code


class ConfigurationError(Exception):
    pass


def _is_javascript_array_index(value: str) -> bool:
    if value == "0":
        return True
    if not value or value[0] == "0" or any(character < "0" or character > "9" for character in value):
        return False
    return len(value) < len(MAX_JAVASCRIPT_ARRAY_INDEX) or (
        len(value) == len(MAX_JAVASCRIPT_ARRAY_INDEX)
        and value <= MAX_JAVASCRIPT_ARRAY_INDEX
    )


def _validate_json_object_key(value: str) -> None:
    _validate_json_value(value, set())
    if _is_javascript_array_index(value):
        raise ValueError("JSON object keys cannot be JavaScript array-index keys")


def _validate_json_value(value: Any, seen: set[int]) -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise ValueError("JSON strings must contain only Unicode scalar values")
        return
    if isinstance(value, int):
        if not -MAX_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER:
            raise ValueError("JSON integer is outside the JavaScript safe-integer range")
        return
    if isinstance(value, float):
        raise ValueError("JSON numbers must be integers")
    if isinstance(value, (list, dict)):
        identity = id(value)
        if identity in seen:
            raise ValueError("JSON value is cyclic")
        seen.add(identity)
        try:
            values: Any
            if isinstance(value, dict):
                if not all(isinstance(key, str) for key in value):
                    raise ValueError("JSON object keys must be strings")
                for key in value:
                    _validate_json_object_key(key)
                values = value.values()
            else:
                values = value
            for item in values:
                _validate_json_value(item, seen)
        finally:
            seen.remove(identity)
        return
    raise ValueError(f"unsupported JSON value type: {type(value).__name__}")


def canonical_json(value: Any) -> bytes:
    try:
        _validate_json_value(value, set())
        return json.dumps(
            value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise Refusal(f"value is not bounded integer JSON: {error}") from error


def decode_json(raw: bytes, label: str) -> Any:
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
        value = json.loads(
            raw.decode("utf-8"),
            parse_int=safe_integer,
            parse_float=lambda value: (_ for _ in ()).throw(ValueError(value)),
            parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)),
            object_pairs_hook=unique_object,
        )
        _validate_json_value(value, set())
        return value
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise Refusal(f"{label} is not valid bounded integer UTF-8 JSON") from error


def exact_object(value: Any, required: set[str], optional: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise Refusal(f"{label} must be a JSON object")
    keys = set(value)
    unknown = sorted(keys - required - optional)
    missing = sorted(required - keys)
    if unknown:
        raise Refusal(f"{label} has unknown field(s): {', '.join(unknown)}")
    if missing:
        raise Refusal(f"{label} is missing field(s): {', '.join(missing)}")
    return value


def text_field(body: dict[str, Any], key: str, pattern: re.Pattern[str] = TOKEN_RE, maximum: int = 191) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > maximum:
        raise Refusal(f"{key} must be a non-empty string of at most {maximum} UTF-8 bytes")
    if (
        not pattern.fullmatch(value)
        or "//" in value
        or value.endswith("/")
        or any(segment in (".", "..") for segment in value.split("/"))
    ):
        raise Refusal(f"{key} has an invalid value")
    return value


def integer_field(
    body: dict[str, Any], key: str, *, minimum: int = 0, maximum: int = MAX_SAFE_INTEGER
) -> int:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise Refusal(f"{key} must be an integer from {minimum} through {maximum}")
    return value


def nullable_token(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    if value is None:
        return None
    return text_field(body, key)


def bounded_text(body: dict[str, Any], key: str, maximum: int = 191) -> str:
    value = body.get(key)
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value.encode("utf-8")) > maximum
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise Refusal(f"{key} must be bounded readable text")
    return value


def product_logical_id(body: dict[str, Any], key: str, product_id: str) -> str:
    value = text_field(body, key, LOGICAL_ID_RE)
    if not value.startswith(product_id + "/"):
        raise Refusal(f"{key} crosses the declared Product boundary")
    return value


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def response(ok: bool, value: dict[str, Any]) -> bytes:
    document = {"protocol": PROTOCOL, "ok": ok, "result" if ok else "error": value}
    raw = canonical_json(document)
    if len(raw) > MAX_FRAME_BYTES:
        raw = canonical_json(
            {
                "protocol": PROTOCOL,
                "ok": False,
                "error": {"code": "response_too_large", "message": "bounded response exceeded"},
            }
        )
    return raw


def private_directory(path: Path, *, create: bool) -> Path:
    if not path.is_absolute():
        raise ConfigurationError("state directory must be absolute")
    if create and not path.exists() and not path.is_symlink():
        try:
            path.mkdir(parents=True, mode=0o700)
        except OSError as error:
            raise ConfigurationError(f"cannot create state directory: {error}") from error
    try:
        info = path.lstat()
    except OSError as error:
        raise ConfigurationError(f"cannot inspect state directory: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise ConfigurationError("state directory must be a real directory, not a symlink")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ConfigurationError("state directory must be owned by this account with mode 0700")
    return path.resolve(strict=True)


def validate_private_file(path: Path, label: str) -> bool:
    """Return whether an existing fixed state file was validated."""
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise ConfigurationError(f"cannot inspect {label}: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ConfigurationError(f"{label} must be a real regular file, not a symlink")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ConfigurationError(f"{label} must be account-owned and account-private")
    return True


def validate_test_clock(path: Path) -> Path:
    if not path.is_absolute():
        raise ConfigurationError("isolated test clock path must be absolute")
    account = os.getuid()
    trusted_owners = {0, account}
    current = Path(path.anchor)
    try:
        parent_info = current.lstat()
        if not stat.S_ISDIR(parent_info.st_mode) or parent_info.st_uid not in trusted_owners:
            raise ConfigurationError("isolated test clock has an untrusted root directory")
        for index, part in enumerate(path.parts[1:], start=1):
            child = current / part
            child_info = child.lstat()
            if stat.S_ISLNK(child_info.st_mode):
                raise ConfigurationError("isolated test clock path cannot contain symlinks")
            if parent_info.st_uid not in trusted_owners:
                raise ConfigurationError("isolated test clock has a foreign-owned parent")
            if stat.S_IMODE(parent_info.st_mode) & 0o022:
                fenced_entry = bool(parent_info.st_mode & stat.S_ISVTX) and child_info.st_uid == account
                if not fenced_entry:
                    raise ConfigurationError(
                        "isolated test clock has a group/other-writable unfenced parent"
                    )
            if index < len(path.parts) - 1 and not stat.S_ISDIR(child_info.st_mode):
                raise ConfigurationError("isolated test clock parent component is not a directory")
            current = child
            parent_info = child_info
    except FileNotFoundError as error:
        raise ConfigurationError(f"cannot inspect isolated test clock: {error}") from error
    except OSError as error:
        raise ConfigurationError(f"cannot inspect isolated test clock: {error}") from error
    info = parent_info
    if not stat.S_ISREG(info.st_mode):
        raise ConfigurationError("isolated test clock must be a regular file")
    if info.st_uid != account or stat.S_IMODE(info.st_mode) & 0o077:
        raise ConfigurationError("isolated test clock must be account-owned and account-private")
    return path


def read_test_clock(path: Path) -> int:
    path = validate_test_clock(path)
    descriptor = -1
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise ConfigurationError("isolated test clock changed to an unsafe file")
        raw = os.read(descriptor, 128).decode("ascii").strip()
        value = int(raw)
    except (OSError, UnicodeError, ValueError) as error:
        raise ConfigurationError(f"cannot read isolated test clock: {error}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    if not 0 <= value <= MAX_SAFE_INTEGER:
        raise ConfigurationError("isolated test clock must be a non-negative safe integer")
    return value


def default_state_dir() -> Path:
    state_home = os.environ.get("XDG_STATE_HOME")
    if state_home:
        return Path(state_home) / "qq" / "event-plane"
    home = os.environ.get("HOME")
    if not home:
        raise ConfigurationError("HOME or XDG_STATE_HOME is required")
    return Path(home) / ".local" / "state" / "qq" / "event-plane"


class Clock:
    def __init__(self, test_file: Path | None):
        self.test_file = test_file

    def now_ms(self) -> int:
        if self.test_file is None:
            return time.time_ns() // 1_000_000
        return read_test_clock(self.test_file)


class Config:
    def __init__(self, state_dir: Path, test_clock: Path | None):
        self.state_dir = state_dir
        self.socket_path = state_dir / "event-plane.sock"
        self.database_path = state_dir / "event-plane.sqlite3"
        self.lock_path = state_dir / "event-plane.lock"
        testing = os.environ.get("QQ_EVENT_PLANE_TESTING") == "1"
        if test_clock is not None and not testing:
            raise ConfigurationError("--test-clock is available only in the isolated test seam")
        self.clock = Clock(test_clock)
        self.send_ttl_ms = self._constant("QQ_EVENT_PLANE_SEND_TTL_MS", SEND_TTL_MS, testing)
        self.subscription_lease_ms = self._constant(
            "QQ_EVENT_PLANE_SUBSCRIPTION_LEASE_MS", SUBSCRIPTION_LEASE_MS, testing
        )
        self.payload_retention_ms = self._constant(
            "QQ_EVENT_PLANE_PAYLOAD_RETENTION_MS", PAYLOAD_RETENTION_MS, testing
        )
        self.tombstone_retention_ms = self._constant(
            "QQ_EVENT_PLANE_TOMBSTONE_RETENTION_MS", TOMBSTONE_RETENTION_MS, testing
        )

    @staticmethod
    def _constant(name: str, production: int, testing: bool) -> int:
        raw = os.environ.get(name)
        if raw is None:
            return production
        if not testing:
            raise ConfigurationError(f"{name} is available only in the isolated test seam")
        try:
            value = int(raw)
        except ValueError as error:
            raise ConfigurationError(f"{name} must be an integer") from error
        if value < 1:
            raise ConfigurationError(f"{name} must be positive")
        return value


def _sqlite_side_paths(path: Path) -> tuple[Path, ...]:
    return tuple(Path(f"{path}{suffix}") for suffix in ("-journal", "-wal", "-shm"))


def _fsync_file(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _open_immutable_database(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{path.as_uri()}?mode=ro&immutable=1", uri=True)


def _copy_file_contents_durably(source: Path, destination: Path) -> None:
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        destination_fd = os.open(destination, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
        try:
            with os.fdopen(source_fd, "rb", closefd=False) as source_stream:
                with os.fdopen(destination_fd, "wb", closefd=False) as destination_stream:
                    shutil.copyfileobj(source_stream, destination_stream, length=1024 * 1024)
                    destination_stream.flush()
                    os.fsync(destination_fd)
        finally:
            os.close(destination_fd)
    finally:
        os.close(source_fd)


class Store:
    def __init__(self, config: Config):
        self.config = config
        self.clock = config.clock
        self.lock = threading.RLock()
        # State predicates and waiter installation use the same lock, making
        # commit/notification unobservable gaps impossible.
        self.changed = threading.Condition(self.lock)
        self._recover_interrupted_restore(config)
        database_existed = validate_private_file(config.database_path, "Event Plane database")
        self.conn = sqlite3.connect(
            config.database_path, timeout=10, isolation_level=None, check_same_thread=False
        )
        self.conn.row_factory = sqlite3.Row
        if not database_existed:
            os.chmod(config.database_path, 0o600)
        self._configure()
        self._migrate()
        self.instance_id = self._meta("instance_id")
        with self.lock:
            self._recover_startup()
            self.cleanup()

    @classmethod
    def _recover_interrupted_restore(cls, config: Config) -> None:
        """Conservatively restore a durable pre-restore marker before opening live state."""
        rollback = config.state_dir / ".restore-rollback.sqlite3"
        if not rollback.exists() and not rollback.is_symlink():
            return
        if not validate_private_file(rollback, "Event Plane restore safety database"):
            raise ConfigurationError("Event Plane restore safety database disappeared")
        if not validate_private_file(config.database_path, "Event Plane database"):
            raise ConfigurationError("restore safety exists without a live Event Plane database")
        rollback_info = rollback.lstat()
        database_info = config.database_path.lstat()
        if (rollback_info.st_dev, rollback_info.st_ino) == (database_info.st_dev, database_info.st_ino):
            raise ConfigurationError("restore safety and live database are not independent files")

        for side in _sqlite_side_paths(rollback):
            if side.exists() or side.is_symlink():
                raise ConfigurationError(
                    f"restore safety database has an ambiguous SQLite side file: {side.name}"
                )
        candidate_sides: list[Path] = []
        for side in _sqlite_side_paths(config.database_path):
            if side.exists() or side.is_symlink():
                if not validate_private_file(side, f"Event Plane SQLite side file {side.name}"):
                    raise ConfigurationError(f"Event Plane SQLite side file disappeared: {side.name}")
                candidate_sides.append(side)

        try:
            saved = _open_immutable_database(rollback)
            try:
                cls._validate_database(saved, allowed_versions=(SCHEMA_VERSION,))
                saved_instance = str(
                    saved.execute("SELECT value FROM metadata WHERE key='instance_id'").fetchone()[0]
                )
            finally:
                saved.close()
        except (OSError, sqlite3.Error) as error:
            raise ConfigurationError(f"cannot validate restore safety database: {error}") from error

        try:
            # A candidate rollback journal belongs only to the interrupted
            # candidate. Discard it before copying so it can never be applied
            # to the recovered pre-restore database.
            for side in candidate_sides:
                side.unlink()
            _copy_file_contents_durably(rollback, config.database_path)
            recovered = _open_immutable_database(config.database_path)
            try:
                cls._validate_database(recovered, allowed_versions=(SCHEMA_VERSION,))
                recovered_instance = str(
                    recovered.execute("SELECT value FROM metadata WHERE key='instance_id'").fetchone()[0]
                )
            finally:
                recovered.close()
            if recovered_instance != saved_instance:
                raise ConfigurationError("recovered database changed the restore safety identity")
            # The recovered bytes and candidate-side removal are durable before
            # the marker is removed. A crash before marker removal repeats this
            # conservative transition; after durable removal, live is truthful.
            _fsync_directory(config.state_dir)
            rollback.unlink()
            _fsync_directory(config.state_dir)
        except ConfigurationError:
            raise
        except (OSError, sqlite3.Error) as error:
            raise ConfigurationError(f"cannot recover interrupted restore: {error}") from error

    def _configure(self) -> None:
        journal = self.conn.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
        if str(journal).lower() != "delete":
            raise ConfigurationError("SQLite refused rollback journaling")
        self.conn.execute("PRAGMA synchronous=FULL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA busy_timeout=10000")
        if int(self.conn.execute("PRAGMA synchronous").fetchone()[0]) != 2:
            raise ConfigurationError("SQLite refused synchronous=FULL")

    @contextlib.contextmanager
    def transaction(self) -> Iterator[None]:
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            self.conn.execute("ROLLBACK")
            raise
        else:
            self.conn.execute("COMMIT")

    @staticmethod
    def _normalized_schema_sql(value: str) -> str:
        return re.sub(r"\s+", " ", value.strip().rstrip(";")).strip()

    @classmethod
    def _validate_schema(
        cls, connection: sqlite3.Connection, *, allowed_versions: tuple[int, ...], refusal: bool = False
    ) -> int:
        def fail(message: str) -> None:
            if refusal:
                raise Refusal(message, "invalid_restore")
            raise ConfigurationError(message)

        try:
            version = int(connection.execute("PRAGMA user_version").fetchone()[0])
            if version not in allowed_versions:
                fail(f"database schema {version} is not a supported Event Plane schema")
            expected = SCHEMA_V1_OBJECTS if version == 1 else SCHEMA_V2_OBJECTS
            rows = connection.execute(
                "SELECT type,name,sql FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','index','trigger')"
            ).fetchall()
            observed = {(str(row[0]), str(row[1])): row[2] for row in rows}
            if set(observed) != set(expected):
                missing = sorted(name for name in set(expected) - set(observed))
                extra = sorted(name for name in set(observed) - set(expected))
                fail(f"Event Plane schema objects differ (missing={missing}, extra={extra})")
            for identity, definition in expected.items():
                sql = observed.get(identity)
                if not isinstance(sql, str) or cls._normalized_schema_sql(sql) != cls._normalized_schema_sql(definition):
                    fail(f"Event Plane schema object is altered: {identity[1]}")
            metadata = {
                str(row[0]): str(row[1])
                for row in connection.execute("SELECT key,value FROM metadata").fetchall()
            }
            if set(metadata) != {"instance_id", "schema_version"}:
                fail("Event Plane metadata keys differ from the supported contract")
            if metadata["schema_version"] != str(version):
                fail("Event Plane schema metadata does not match user_version")
            if re.fullmatch(r"plane_[0-9a-f]{32}", metadata["instance_id"]) is None:
                fail("Event Plane instance identity is malformed")
            return version
        except (sqlite3.Error, TypeError, ValueError) as error:
            fail(f"cannot validate Event Plane schema: {error}")
        raise AssertionError("schema validation did not return or refuse")

    @classmethod
    def _validate_database(
        cls, connection: sqlite3.Connection, *, allowed_versions: tuple[int, ...], refusal: bool = False
    ) -> int:
        version = cls._validate_schema(
            connection, allowed_versions=allowed_versions, refusal=refusal
        )
        try:
            integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
            foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
        except sqlite3.Error as error:
            if refusal:
                raise Refusal(f"cannot inspect restore source integrity: {error}", "invalid_restore") from error
            raise ConfigurationError(f"cannot inspect Event Plane integrity: {error}") from error
        if integrity != "ok" or foreign_keys:
            message = "Event Plane database failed integrity or foreign-key inspection"
            if refusal:
                raise Refusal(message, "invalid_restore")
            raise ConfigurationError(message)
        return version

    @staticmethod
    def _v1_journal_is_complete(connection: sqlite3.Connection) -> bool:
        count, minimum, maximum = connection.execute(
            "SELECT COUNT(*),MIN(journal_position),MAX(journal_position) FROM records"
        ).fetchone()
        sequence_row = connection.execute(
            "SELECT seq FROM sqlite_sequence WHERE name='records'"
        ).fetchone()
        sequence = int(sequence_row[0]) if sequence_row is not None else 0
        if int(count) == 0:
            return sequence == 0
        return int(minimum) == 1 and int(count) == int(maximum) == sequence

    def _migrate(self) -> None:
        version = int(self.conn.execute("PRAGMA user_version").fetchone()[0])
        if version > SCHEMA_VERSION:
            raise ConfigurationError(
                f"database schema {version} is newer than supported schema {SCHEMA_VERSION}"
            )
        if version == SCHEMA_VERSION:
            self._validate_database(self.conn, allowed_versions=(SCHEMA_VERSION,))
            return
        if version == 1:
            self._validate_database(self.conn, allowed_versions=(1,))
            if not self._v1_journal_is_complete(self.conn):
                raise ConfigurationError(
                    "schema 1 has deleted journal positions and cannot acquire truthful selector retention boundaries"
                )
            try:
                with self.transaction():
                    self.conn.execute(SCHEMA_V2_OBJECTS[("table", "retention_boundaries")])
                    self.conn.execute(
                        "UPDATE metadata SET value='2' WHERE key='schema_version'"
                    )
                    self.conn.execute("PRAGMA user_version=2")
            except sqlite3.Error as error:
                raise ConfigurationError(f"schema 1 to 2 migration failed: {error}") from error
            self._validate_database(self.conn, allowed_versions=(SCHEMA_VERSION,))
            return
        if version != 0:
            raise ConfigurationError(f"no safe migration exists from database schema {version}")
        existing = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        if existing:
            raise ConfigurationError("unversioned non-empty database refuses implicit migration")
        instance_id = "plane_" + uuid.uuid4().hex
        try:
            with self.transaction():
                for definition in SCHEMA_V2_OBJECTS.values():
                    self.conn.execute(definition)
                self.conn.execute(
                    "INSERT INTO metadata(key,value) VALUES('instance_id',?)", (instance_id,)
                )
                self.conn.execute(
                    "INSERT INTO metadata(key,value) VALUES('schema_version','2')"
                )
                self.conn.execute("PRAGMA user_version=2")
        except sqlite3.Error as error:
            raise ConfigurationError(f"cannot create Event Plane schema: {error}") from error
        self._validate_database(self.conn, allowed_versions=(SCHEMA_VERSION,))

    def _meta(self, key: str) -> str:
        row = self.conn.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        if row is None:
            raise ConfigurationError(f"database metadata is missing {key}")
        return str(row[0])

    def close(self) -> None:
        with self.lock:
            self.conn.close()

    def notify(self) -> None:
        with self.changed:
            self.changed.notify_all()

    def _recover_startup(self) -> None:
        now = self.clock.now_ms()
        with self.transaction():
            self.conn.execute(
                "UPDATE obligations SET status='pending', next_attempt_at=?, updated_at=? "
                "WHERE status='in_flight'",
                (now, now),
            )
            self.conn.execute(
                "UPDATE consumer_gaps SET status='pending' WHERE status='in_flight'"
            )
            self.conn.execute("DELETE FROM endpoints")

    def cleanup(self) -> dict[str, int]:
        """Run one bounded cleanup batch. Caller holds self.lock."""
        now = self.clock.now_ms()
        counts = {"expired_subscriptions": 0, "abandoned_publications": 0, "expired_sends": 0, "purged_payloads": 0, "deleted_records": 0, "deleted_subscriptions": 0}
        with self.transaction():
            expired = self.conn.execute(
                "SELECT subscription_id,generation FROM subscriptions "
                "WHERE active=1 AND lease_expires_at<=? LIMIT ?",
                (now, CLEANUP_BATCH),
            ).fetchall()
            for row in expired:
                self.conn.execute(
                    "UPDATE subscriptions SET active=0,expired_at=?,updated_at=? WHERE subscription_id=? AND generation=?",
                    (now, now, row["subscription_id"], row["generation"]),
                )
                counts["expired_subscriptions"] += 1
            # One bounded pass also drains obligations left by an earlier bounded
            # lease-expiry pass.  A publication has its own 24-hour useful
            # horizon, so explicit lease renewal cannot retain poison forever.
            abandoned = self.conn.execute(
                "SELECT obligations.obligation_id,obligations.record_position FROM obligations "
                "LEFT JOIN subscriptions ON subscriptions.subscription_id=obligations.consumer_id "
                "AND subscriptions.generation=obligations.subscription_generation "
                "WHERE obligations.consumer_type='subscription' "
                "AND obligations.status IN ('pending','in_flight','blocked') "
                "AND ((subscriptions.active=0) OR obligations.created_at<=?) LIMIT ?",
                (now - self.config.subscription_lease_ms, CLEANUP_BATCH),
            ).fetchall()
            for obligation in abandoned:
                self.conn.execute(
                    "UPDATE obligations SET status='abandoned',"
                    "last_reason='subscription delivery horizon ended; reconstruct from authority',"
                    "terminal_at=?,updated_at=? WHERE obligation_id=?",
                    (now, now, obligation["obligation_id"]),
                )
                self.conn.execute("DELETE FROM consumer_gaps WHERE obligation_id=?", (obligation["obligation_id"],))
                self._refresh_record_terminal(int(obligation["record_position"]), now)
                counts["abandoned_publications"] += 1
            sends = self.conn.execute(
                "SELECT obligation_id,record_position FROM obligations JOIN records ON records.journal_position=obligations.record_position "
                "WHERE records.record_type='send' AND records.deadline_at<=? "
                "AND obligations.status IN ('pending','in_flight','blocked') LIMIT ?",
                (now, CLEANUP_BATCH),
            ).fetchall()
            for row in sends:
                self.conn.execute(
                    "UPDATE obligations SET status='expired',last_reason='expired—undelivered',terminal_at=?,updated_at=? "
                    "WHERE obligation_id=?",
                    (now, now, row["obligation_id"]),
                )
                self._refresh_record_terminal(int(row["record_position"]), now)
                counts["expired_sends"] += 1
            purge = self.conn.execute(
                "SELECT journal_position FROM records WHERE terminal_at IS NOT NULL AND payload_purged_at IS NULL "
                "AND terminal_at<=? LIMIT ?",
                (now - self.config.payload_retention_ms, CLEANUP_BATCH),
            ).fetchall()
            for row in purge:
                self.conn.execute(
                    "UPDATE records SET normalized_input=NULL,envelope_json=NULL,payload_json=NULL,payload_purged_at=? "
                    "WHERE journal_position=?",
                    (now, row["journal_position"]),
                )
                counts["purged_payloads"] += 1
            doomed = self.conn.execute(
                "SELECT journal_position,record_type,product_id,kind FROM records "
                "WHERE terminal_at IS NOT NULL AND terminal_at<=? LIMIT ?",
                (now - self.config.tombstone_retention_ms, CLEANUP_BATCH),
            ).fetchall()
            for row in doomed:
                if row["record_type"] == "publish":
                    self.conn.execute(
                        "INSERT INTO retention_boundaries(product_id,kind,unavailable_through_position,updated_at) "
                        "VALUES(?,?,?,?) ON CONFLICT(product_id,kind) DO UPDATE SET "
                        "unavailable_through_position=MAX(unavailable_through_position,excluded.unavailable_through_position),"
                        "updated_at=excluded.updated_at",
                        (row["product_id"], row["kind"], row["journal_position"], now),
                    )
                self.conn.execute("DELETE FROM records WHERE journal_position=?", (row["journal_position"],))
                counts["deleted_records"] += 1
            old_subscriptions = self.conn.execute(
                "SELECT subscription_id FROM subscriptions WHERE active=0 AND expired_at<=? "
                "AND NOT EXISTS(SELECT 1 FROM obligations WHERE consumer_type='subscription' "
                "AND consumer_id=subscriptions.subscription_id) LIMIT ?",
                (now - self.config.tombstone_retention_ms, CLEANUP_BATCH),
            ).fetchall()
            for row in old_subscriptions:
                self.conn.execute("DELETE FROM subscriptions WHERE subscription_id=?", (row["subscription_id"],))
                counts["deleted_subscriptions"] += 1
        if any(counts.values()):
            self.notify()
        return counts

    def _refresh_record_terminal(self, position: int, now: int) -> None:
        open_count = int(
            self.conn.execute(
                "SELECT COUNT(*) FROM obligations WHERE record_position=? AND status IN ('pending','in_flight','blocked')",
                (position,),
            ).fetchone()[0]
        )
        if open_count == 0:
            self.conn.execute(
                "UPDATE records SET terminal_at=COALESCE(terminal_at,?) WHERE journal_position=?",
                (now, position),
            )
        else:
            self.conn.execute("UPDATE records SET terminal_at=NULL WHERE journal_position=?", (position,))

    def _validate_envelope(self, operation: str, body: Any) -> tuple[dict[str, Any], bytes, bytes]:
        required = {
            "producer_id", "request_id", "origin_id", "product_id", "kind", "schema_version", "payload"
        }
        if operation == "send":
            required.add("recipient_id")
        optional = {
            "subject_id", "correlation_id", "causation_id", "source_revision", "source_ref",
            "occurred_at", "deadline_at",
        }
        body = exact_object(body, required, optional, f"{operation} body")
        product_id = text_field(body, "product_id", PRODUCT_RE, 63)
        product_logical_id(body, "producer_id", product_id)
        text_field(body, "request_id")
        product_logical_id(body, "origin_id", product_id)
        text_field(body, "kind", KIND_RE, 127)
        integer_field(body, "schema_version", minimum=1, maximum=2**31 - 1)
        if operation == "send":
            product_logical_id(body, "recipient_id", product_id)
        elif "deadline_at" in body:
            raise Refusal("deadline_at is valid only for send")
        for key in ("subject_id", "correlation_id", "causation_id", "source_revision", "source_ref", "occurred_at"):
            if key in body:
                text_field(body, key, TOKEN_RE, 191)
        payload = canonical_json(body["payload"])
        if len(payload) > MAX_PAYLOAD_BYTES:
            raise Refusal("payload exceeds the 64 KiB canonical JSON limit", "payload_too_large")
        normalized = canonical_json({"record_type": operation, **body})
        return body, normalized, payload

    def append(self, operation: str, body: Any) -> dict[str, Any]:
        body, normalized, payload = self._validate_envelope(operation, body)
        digest = sha256(normalized)
        product_id = body["product_id"]
        with self.lock:
            self.cleanup()
            prior = self.conn.execute(
                "SELECT * FROM records WHERE producer_id=? AND request_id=?",
                (body["producer_id"], body["request_id"]),
            ).fetchone()
            if prior is not None:
                if prior["input_hash"] != digest or (
                    prior["normalized_input"] is not None and bytes(prior["normalized_input"]) != normalized
                ):
                    raise Refusal("producer_id/request_id was already used with different normalized bytes", "idempotency_conflict")
                obligation_count = int(
                    self.conn.execute(
                        "SELECT COUNT(*) FROM obligations WHERE record_position=?",
                        (prior["journal_position"],),
                    ).fetchone()[0]
                )
                return {
                    "accepted": True, "idempotent": True, "obligation_count": obligation_count,
                    "record": self._record_document(prior),
                }
            now = self.clock.now_ms()
            deadline: int | None = None
            if operation == "send":
                deadline = now + self.config.send_ttl_ms
                if "deadline_at" in body:
                    deadline = integer_field(body, "deadline_at", minimum=now + 1, maximum=deadline)
            event_id = "evt_" + uuid.uuid4().hex
            envelope = canonical_json({"record_type": operation, **body})
            with self.transaction():
                cursor = self.conn.execute(
                    "INSERT INTO records(event_id,producer_id,request_id,input_hash,normalized_input,record_type,"
                    "product_id,kind,origin_id,recipient_id,schema_version,accepted_at,deadline_at,envelope_json,payload_json) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        event_id, body["producer_id"], body["request_id"], digest, normalized, operation,
                        product_id, body["kind"], body["origin_id"], body.get("recipient_id"),
                        body["schema_version"], now, deadline, envelope, payload,
                    ),
                )
                if cursor.lastrowid is None:
                    raise RuntimeError("record insert returned no journal position")
                position = int(cursor.lastrowid)
                obligation_count = 0
                if operation == "send":
                    self._create_obligation(
                        position, "recipient", body["recipient_id"], 0, now
                    )
                    obligation_count = 1
                else:
                    subscriptions = self.conn.execute(
                        "SELECT subscription_id,generation FROM subscriptions WHERE active=1 "
                        "AND lease_expires_at>? AND product_id=? AND kind=?",
                        (now, product_id, body["kind"]),
                    ).fetchall()
                    for subscription in subscriptions:
                        self._create_obligation(
                            position, "subscription", subscription["subscription_id"],
                            int(subscription["generation"]), now,
                        )
                        obligation_count += 1
                if obligation_count == 0:
                    self.conn.execute(
                        "UPDATE records SET terminal_at=? WHERE journal_position=?", (now, position)
                    )
            row = self.conn.execute(
                "SELECT * FROM records WHERE journal_position=?", (position,)
            ).fetchone()
        self.notify()
        return {"accepted": True, "idempotent": False, "obligation_count": obligation_count, "record": self._record_document(row)}

    def _create_obligation(
        self, position: int, consumer_type: str, consumer_id: str, generation: int, now: int
    ) -> None:
        obligation_id = "obl_" + uuid.uuid4().hex
        self.conn.execute(
            "INSERT OR IGNORE INTO obligations(obligation_id,record_position,consumer_type,consumer_id,"
            "subscription_generation,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?)",
            (obligation_id, position, consumer_type, consumer_id, generation, now, now, now),
        )
        created = self.conn.execute(
            "SELECT obligation_id FROM obligations WHERE record_position=? AND consumer_type=? AND consumer_id=? "
            "AND subscription_generation=?",
            (position, consumer_type, consumer_id, generation),
        ).fetchone()
        if consumer_type == "subscription":
            self.conn.execute(
                "INSERT OR IGNORE INTO consumer_gaps(subscription_id,generation,record_position,obligation_id,status) "
                "VALUES(?,?,?,?, 'pending')",
                (consumer_id, generation, position, created["obligation_id"]),
            )
        self.conn.execute("UPDATE records SET terminal_at=NULL WHERE journal_position=?", (position,))

    def ensure_subscription(self, body: Any) -> dict[str, Any]:
        body = exact_object(
            body,
            {"subscription_id", "product_id", "kind", "generation"},
            {"reconstruct_from"},
            "ensure_subscription body",
        )
        product_id = text_field(body, "product_id", PRODUCT_RE, 63)
        subscription_id = product_logical_id(body, "subscription_id", product_id)
        kind = text_field(body, "kind", KIND_RE, 127)
        generation = integer_field(body, "generation", minimum=1, maximum=2**31 - 1)
        reconstruct = body.get("reconstruct_from")
        if reconstruct is not None:
            reconstruct = integer_field(body, "reconstruct_from", minimum=1)
        now = self.clock.now_ms()
        with self.lock:
            self.cleanup()
            existing = self.conn.execute(
                "SELECT * FROM subscriptions WHERE subscription_id=?", (subscription_id,)
            ).fetchone()
            replayed = 0
            reconstructed = False
            with self.transaction():
                if existing is None:
                    if generation != 1 or reconstruct is None:
                        raise Refusal("a new subscription requires generation 1 and explicit reconstruct_from")
                    self.conn.execute(
                        "INSERT INTO subscriptions(subscription_id,product_id,kind,generation,reconstruction_position,"
                        "high_water,lease_expires_at,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
                        (
                            subscription_id, product_id, kind, generation, reconstruct,
                            reconstruct - 1, now + self.config.subscription_lease_ms, now, now,
                        ),
                    )
                    reconstructed = True
                else:
                    same = (
                        existing["active"] == 1
                        and int(existing["lease_expires_at"]) > now
                        and int(existing["generation"]) == generation
                        and existing["product_id"] == product_id
                        and existing["kind"] == kind
                    )
                    if same:
                        if reconstruct is not None:
                            raise Refusal("an active unchanged subscription renews without reconstruct_from")
                        self.conn.execute(
                            "UPDATE subscriptions SET lease_expires_at=?,updated_at=? WHERE subscription_id=?",
                            (now + self.config.subscription_lease_ms, now, subscription_id),
                        )
                    else:
                        if generation != int(existing["generation"]) + 1 or reconstruct is None:
                            raise Refusal(
                                "expired or changed subscription requires the next generation and explicit reconstruct_from",
                                "generation_conflict",
                            )
                        old_generation = int(existing["generation"])
                        old_obligations = self.conn.execute(
                            "SELECT obligation_id,record_position FROM obligations WHERE consumer_type='subscription' "
                            "AND consumer_id=? AND subscription_generation=? AND status IN ('pending','in_flight','blocked')",
                            (subscription_id, old_generation),
                        ).fetchall()
                        for obligation in old_obligations:
                            self.conn.execute(
                                "UPDATE obligations SET status='abandoned',last_reason='subscription reconstructed at explicit generation',"
                                "terminal_at=?,updated_at=? WHERE obligation_id=?",
                                (now, now, obligation["obligation_id"]),
                            )
                            self.conn.execute("DELETE FROM consumer_gaps WHERE obligation_id=?", (obligation["obligation_id"],))
                            self._refresh_record_terminal(int(obligation["record_position"]), now)
                        self.conn.execute(
                            "UPDATE subscriptions SET product_id=?,kind=?,generation=?,reconstruction_position=?,"
                            "high_water=?,lease_expires_at=?,active=1,updated_at=?,expired_at=NULL WHERE subscription_id=?",
                            (
                                product_id, kind, generation, reconstruct, reconstruct - 1,
                                now + self.config.subscription_lease_ms, now, subscription_id,
                            ),
                        )
                        self.conn.execute(
                            "DELETE FROM endpoints WHERE consumer_type='subscription' AND consumer_id=?",
                            (subscription_id,),
                        )
                        reconstructed = True
                if reconstructed:
                    assert reconstruct is not None
                    boundary = self.conn.execute(
                        "SELECT unavailable_through_position FROM retention_boundaries "
                        "WHERE product_id=? AND kind=?",
                        (product_id, kind),
                    ).fetchone()
                    if boundary is not None and reconstruct <= int(boundary["unavailable_through_position"]):
                        raise Refusal(
                            "requested replay crosses deleted compact retention; reconstruct current authority at a newer position",
                            "replay_unavailable",
                        )
                    unavailable = self.conn.execute(
                        "SELECT journal_position FROM records WHERE record_type='publish' AND product_id=? AND kind=? "
                        "AND journal_position>=? AND envelope_json IS NULL ORDER BY journal_position LIMIT 1",
                        (product_id, kind, reconstruct),
                    ).fetchone()
                    if unavailable is not None:
                        raise Refusal(
                            "requested replay crosses compact retention; reconstruct current authority at a newer position",
                            "replay_unavailable",
                        )
                    candidates = self.conn.execute(
                        "SELECT journal_position FROM records WHERE record_type='publish' AND product_id=? AND kind=? "
                        "AND journal_position>=? AND envelope_json IS NOT NULL ORDER BY journal_position",
                        (product_id, kind, reconstruct),
                    ).fetchall()
                    for candidate in candidates:
                        self._create_obligation(
                            int(candidate["journal_position"]), "subscription", subscription_id, generation, now
                        )
                        replayed += 1
            result = self._subscription_document(
                self.conn.execute(
                    "SELECT * FROM subscriptions WHERE subscription_id=?", (subscription_id,)
                ).fetchone()
            )
        self.notify()
        return {"subscription": result, "reconstructed": reconstructed, "replayed": replayed}

    def _consumer(self, body: dict[str, Any]) -> tuple[str, str, int, str]:
        consumer_type = body.get("consumer_type")
        if consumer_type not in ("recipient", "subscription"):
            raise Refusal("consumer_type must be recipient or subscription")
        consumer_id = text_field(body, "consumer_id", LOGICAL_ID_RE)
        generation = integer_field(body, "generation", minimum=0, maximum=2**31 - 1)
        if (consumer_type == "recipient" and generation != 0) or (
            consumer_type == "subscription" and generation == 0
        ):
            raise Refusal("recipient generation is 0 and subscription generations are positive")
        product = consumer_id.split("/", 1)[0]
        if not PRODUCT_RE.fullmatch(product):
            raise Refusal("consumer_id has an invalid Product prefix")
        endpoint = text_field(body, "endpoint_token")
        return consumer_type, consumer_id, generation, endpoint

    def next_delivery(self, body: Any) -> dict[str, Any]:
        body = exact_object(
            body,
            {"consumer_type", "consumer_id", "generation", "endpoint_token"},
            {"wait_ms"},
            "next body",
        )
        consumer_type, consumer_id, generation, endpoint = self._consumer(body)
        wait_ms = integer_field(body, "wait_ms", minimum=0, maximum=MAX_WAIT_MS) if "wait_ms" in body else 0
        end = time.monotonic() + wait_ms / 1000
        rebound = False
        while True:
            with self.lock:
                self.cleanup()
                now = self.clock.now_ms()
                subscription: sqlite3.Row | None = None
                if consumer_type == "subscription":
                    subscription = self.conn.execute(
                        "SELECT * FROM subscriptions WHERE subscription_id=?", (consumer_id,)
                    ).fetchone()
                    if subscription is None:
                        raise Refusal("subscription does not exist", "not_found")
                    if int(subscription["generation"]) != generation:
                        raise Refusal("subscription generation is stale", "generation_conflict")
                    if int(subscription["active"]) != 1 or int(subscription["lease_expires_at"]) <= now:
                        raise Refusal("subscription lease expired; explicit reconstruction is required", "lease_expired")
                binding = self.conn.execute(
                    "SELECT endpoint_token FROM endpoints WHERE consumer_type=? AND consumer_id=? AND generation=?",
                    (consumer_type, consumer_id, generation),
                ).fetchone()
                if binding is None or binding["endpoint_token"] != endpoint:
                    with self.transaction():
                        self.conn.execute(
                            "INSERT INTO endpoints(consumer_type,consumer_id,generation,endpoint_token,bound_at) VALUES(?,?,?,?,?) "
                            "ON CONFLICT(consumer_type,consumer_id,generation) DO UPDATE SET endpoint_token=excluded.endpoint_token,bound_at=excluded.bound_at",
                            (consumer_type, consumer_id, generation, endpoint, now),
                        )
                        self.conn.execute(
                            "UPDATE obligations SET status='pending',next_attempt_at=?,updated_at=? "
                            "WHERE consumer_type=? AND consumer_id=? AND subscription_generation=? "
                            "AND status IN ('pending','in_flight')",
                            (now, now, consumer_type, consumer_id, generation),
                        )
                        # Preserve blocked custody/reason, but clear stale
                        # delivery fencing so exactly the current endpoint can
                        # receive a new guard for retry or disposition.
                        self.conn.execute(
                            "UPDATE obligations SET attempt_token=NULL,endpoint_token=NULL,next_attempt_at=?,updated_at=? "
                            "WHERE consumer_type=? AND consumer_id=? AND subscription_generation=? AND status='blocked'",
                            (now, now, consumer_type, consumer_id, generation),
                        )
                        if consumer_type == "subscription":
                            self.conn.execute(
                                "UPDATE consumer_gaps SET status='pending' WHERE subscription_id=? AND generation=? AND status='in_flight'",
                                (consumer_id, generation),
                            )
                    rebound = True
                candidate = self.conn.execute(
                    "SELECT obligations.*,records.* FROM obligations JOIN records ON records.journal_position=obligations.record_position "
                    "WHERE obligations.consumer_type=? AND obligations.consumer_id=? "
                    "AND obligations.subscription_generation=? "
                    "AND (obligations.status IN ('pending','in_flight') "
                    "OR (obligations.status='blocked' AND obligations.endpoint_token IS NULL)) "
                    "AND obligations.next_attempt_at<=? AND records.envelope_json IS NOT NULL "
                    "ORDER BY obligations.record_position LIMIT 1",
                    (consumer_type, consumer_id, generation, now),
                ).fetchone()
                if candidate is not None:
                    attempt = "try_" + uuid.uuid4().hex
                    attempt_count = int(candidate["attempt_count"]) + 1
                    next_at = now + BACKOFF_MS[min(attempt_count - 1, len(BACKOFF_MS) - 1)]
                    blocked_redelivery = candidate["status"] == "blocked"
                    with self.transaction():
                        self.conn.execute(
                            "UPDATE obligations SET status=?,attempt_token=?,endpoint_token=?,attempt_count=?,"
                            "next_attempt_at=?,updated_at=? WHERE obligation_id=?",
                            (
                                "blocked" if blocked_redelivery else "in_flight",
                                attempt, endpoint, attempt_count, next_at, now,
                                candidate["obligation_id"],
                            ),
                        )
                        if consumer_type == "subscription" and not blocked_redelivery:
                            self.conn.execute(
                                "UPDATE consumer_gaps SET status='in_flight' WHERE obligation_id=?",
                                (candidate["obligation_id"],),
                            )
                    refreshed = self.conn.execute(
                        "SELECT obligations.*,records.* FROM obligations JOIN records ON records.journal_position=obligations.record_position "
                        "WHERE obligation_id=?", (candidate["obligation_id"],)
                    ).fetchone()
                    return {
                        "delivery": self._delivery_document(refreshed),
                        "rebound": rebound,
                    }
                state = self._consumer_state(consumer_type, consumer_id, generation)
                wake_times: list[int] = []
                due = self.conn.execute(
                    "SELECT MIN(next_attempt_at) FROM obligations WHERE consumer_type=? AND consumer_id=? "
                    "AND subscription_generation=? AND status IN ('pending','in_flight')",
                    (consumer_type, consumer_id, generation),
                ).fetchone()[0]
                if due is not None:
                    wake_times.append(int(due))
                if consumer_type == "subscription":
                    assert subscription is not None
                    wake_times.append(int(subscription["lease_expires_at"]))
                    oldest = self.conn.execute(
                        "SELECT MIN(created_at) FROM obligations WHERE consumer_type='subscription' "
                        "AND consumer_id=? AND subscription_generation=? AND status IN ('pending','in_flight','blocked')",
                        (consumer_id, generation),
                    ).fetchone()[0]
                    if oldest is not None:
                        wake_times.append(int(oldest) + self.config.subscription_lease_ms)
                else:
                    deadline = self.conn.execute(
                        "SELECT MIN(records.deadline_at) FROM obligations JOIN records "
                        "ON records.journal_position=obligations.record_position "
                        "WHERE obligations.consumer_type='recipient' AND obligations.consumer_id=? "
                        "AND obligations.status IN ('pending','in_flight','blocked')",
                        (consumer_id,),
                    ).fetchone()[0]
                    if deadline is not None:
                        wake_times.append(int(deadline))
                wake_after = max(0.0, (min(wake_times) - now) / 1000) if wake_times else None
                remaining = end - time.monotonic()
                if remaining <= 0:
                    return {"delivery": None, "rebound": rebound, "consumer_state": state}
                wait_for = remaining if wake_after is None else min(remaining, wake_after)
                if self.config.clock.test_file:
                    wait_for = min(wait_for, 0.25)
                if wait_for <= 0:
                    continue
                # Condition.wait atomically releases self.lock only after this
                # waiter is registered; every state-changing notifier uses the
                # same lock/condition.
                self.changed.wait(wait_for)

    def _gap_state(self, consumer_type: str, consumer_id: str, generation: int) -> tuple[int | None, list[dict[str, Any]], str]:
        if consumer_type == "subscription":
            subscription = self.conn.execute(
                "SELECT high_water FROM subscriptions WHERE subscription_id=? AND generation=?",
                (consumer_id, generation),
            ).fetchone()
            high_water = int(subscription["high_water"]) if subscription else None
            rows = self.conn.execute(
                "SELECT record_position,obligation_id,status FROM consumer_gaps "
                "WHERE subscription_id=? AND generation=? ORDER BY record_position",
                (consumer_id, generation),
            ).fetchall()
            gaps = [
                {"journal_position": int(row["record_position"]), "obligation_id": row["obligation_id"], "status": row["status"]}
                for row in rows
            ]
        else:
            high_water = None
            gaps = []
        token = sha256(canonical_json({"high_water": high_water, "gaps": gaps}))
        return high_water, gaps, token

    def _consumer_state(self, consumer_type: str, consumer_id: str, generation: int) -> dict[str, Any]:
        high_water, gaps, token = self._gap_state(consumer_type, consumer_id, generation)
        return {"high_water": high_water, "gaps": gaps, "gap_token": token}

    def _delivery_document(self, row: sqlite3.Row) -> dict[str, Any]:
        high_water, gaps, token = self._gap_state(
            row["consumer_type"], row["consumer_id"], int(row["subscription_generation"])
        )
        return {
            "record": self._record_document(row),
            "obligation": self._obligation_document(row),
            "attempt_token": row["attempt_token"],
            "endpoint_token": row["endpoint_token"],
            "guard": {"expected_high_water": high_water, "expected_gap_token": token, "gaps": gaps},
        }

    def _guarded_obligation(self, body: dict[str, Any], *, statuses: tuple[str, ...]) -> sqlite3.Row:
        obligation_id = text_field(body, "obligation_id")
        event_id = text_field(body, "event_id")
        consumer_type = body.get("consumer_type")
        if consumer_type not in ("recipient", "subscription"):
            raise Refusal("consumer_type must be recipient or subscription")
        consumer_id = text_field(body, "consumer_id", LOGICAL_ID_RE)
        generation = integer_field(body, "generation", minimum=0, maximum=2**31 - 1)
        attempt = nullable_token(body, "attempt_token")
        endpoint = nullable_token(body, "endpoint_token")
        expected_high = body.get("expected_high_water")
        if expected_high is not None and (isinstance(expected_high, bool) or not isinstance(expected_high, int) or expected_high < 0):
            raise Refusal("expected_high_water must be null or a non-negative integer")
        expected_gap = text_field(body, "expected_gap_token", re.compile(r"[0-9a-f]{64}\Z"), 64)
        row = self.conn.execute(
            "SELECT obligations.*,records.event_id FROM obligations JOIN records ON records.journal_position=obligations.record_position "
            "WHERE obligation_id=?", (obligation_id,)
        ).fetchone()
        if row is None:
            raise Refusal("obligation does not exist", "not_found")
        if (
            row["event_id"] != event_id
            or row["consumer_type"] != consumer_type
            or row["consumer_id"] != consumer_id
            or int(row["subscription_generation"]) != generation
        ):
            raise Refusal("record or consumer guard does not match the named obligation", "guard_conflict")
        if row["status"] not in statuses:
            raise Refusal("obligation state no longer permits this transition", "stale_attempt")
        if row["attempt_token"] != attempt or row["endpoint_token"] != endpoint:
            raise Refusal("delivery attempt or endpoint token is stale", "stale_attempt")
        binding = self.conn.execute(
            "SELECT endpoint_token FROM endpoints WHERE consumer_type=? AND consumer_id=? AND generation=?",
            (consumer_type, consumer_id, generation),
        ).fetchone()
        if endpoint is not None and (binding is None or binding["endpoint_token"] != endpoint):
            raise Refusal("endpoint binding was replaced", "stale_endpoint")
        if consumer_type == "subscription":
            subscription = self.conn.execute(
                "SELECT generation FROM subscriptions WHERE subscription_id=?", (consumer_id,)
            ).fetchone()
            if subscription is None or int(subscription["generation"]) != generation:
                raise Refusal("subscription generation was replaced", "generation_conflict")
        current_high, _, current_gap = self._gap_state(consumer_type, consumer_id, generation)
        if current_high != expected_high or current_gap != expected_gap:
            raise Refusal("expected high-water/gap state is stale", "gap_conflict")
        return row

    def acknowledge(self, body: Any) -> dict[str, Any]:
        required = {
            "obligation_id", "event_id", "consumer_type", "consumer_id", "generation",
            "attempt_token", "endpoint_token", "expected_high_water", "expected_gap_token",
        }
        body = exact_object(body, required, set(), "acknowledge body")
        now = self.clock.now_ms()
        with self.lock:
            self.cleanup()
            row = self._guarded_obligation(body, statuses=("in_flight",))
            with self.transaction():
                self.conn.execute(
                    "UPDATE obligations SET status='acknowledged',last_reason='consumer boundary acknowledged',"
                    "terminal_at=?,updated_at=? WHERE obligation_id=?",
                    (now, now, row["obligation_id"]),
                )
                if row["consumer_type"] == "subscription":
                    self.conn.execute("DELETE FROM consumer_gaps WHERE obligation_id=?", (row["obligation_id"],))
                    self.conn.execute(
                        "UPDATE subscriptions SET high_water=MAX(high_water,?),updated_at=? "
                        "WHERE subscription_id=? AND generation=?",
                        (row["record_position"], now, row["consumer_id"], row["subscription_generation"]),
                    )
                self._refresh_record_terminal(int(row["record_position"]), now)
            result = self._status_by_position(int(row["record_position"]))
        self.notify()
        return {"acknowledged": True, "record_status": result}

    def retry(self, body: Any) -> dict[str, Any]:
        required = {
            "obligation_id", "event_id", "consumer_type", "consumer_id", "generation",
            "attempt_token", "endpoint_token", "expected_high_water", "expected_gap_token", "reason",
        }
        body = exact_object(body, required, set(), "retry body")
        reason = bounded_text(body, "reason")
        now = self.clock.now_ms()
        with self.lock:
            row = self._guarded_obligation(body, statuses=("in_flight", "blocked"))
            failures = int(row["failure_count"]) + 1
            status_value = "blocked" if failures >= BLOCK_AFTER_FAILURES else "pending"
            next_at = now + BACKOFF_MS[min(failures - 1, len(BACKOFF_MS) - 1)]
            with self.transaction():
                self.conn.execute(
                    "UPDATE obligations SET status=?,failure_count=?,next_attempt_at=?,last_reason=?,updated_at=? "
                    "WHERE obligation_id=?",
                    (status_value, failures, next_at, reason, now, row["obligation_id"]),
                )
                if row["consumer_type"] == "subscription":
                    self.conn.execute(
                        "UPDATE consumer_gaps SET status=?,reason=? WHERE obligation_id=?",
                        (status_value, reason, row["obligation_id"]),
                    )
            document = self._obligation_document(
                self.conn.execute("SELECT * FROM obligations WHERE obligation_id=?", (row["obligation_id"],)).fetchone()
            )
        self.notify()
        return {"obligation": document}

    def block(self, body: Any) -> dict[str, Any]:
        required = {
            "obligation_id", "event_id", "consumer_type", "consumer_id", "generation",
            "attempt_token", "endpoint_token", "expected_high_water", "expected_gap_token", "reason",
        }
        body = exact_object(body, required, set(), "block body")
        reason = bounded_text(body, "reason")
        now = self.clock.now_ms()
        with self.lock:
            row = self._guarded_obligation(body, statuses=("in_flight",))
            with self.transaction():
                self.conn.execute(
                    "UPDATE obligations SET status='blocked',last_reason=?,updated_at=? WHERE obligation_id=?",
                    (reason, now, row["obligation_id"]),
                )
                if row["consumer_type"] == "subscription":
                    self.conn.execute(
                        "UPDATE consumer_gaps SET status='blocked',reason=? WHERE obligation_id=?",
                        (reason, row["obligation_id"]),
                    )
            result = self._obligation_document(
                self.conn.execute("SELECT * FROM obligations WHERE obligation_id=?", (row["obligation_id"],)).fetchone()
            )
        self.notify()
        return {"obligation": result}

    def disposition(self, body: Any) -> dict[str, Any]:
        required = {
            "obligation_id", "event_id", "consumer_type", "consumer_id", "generation",
            "attempt_token", "endpoint_token", "expected_high_water", "expected_gap_token",
            "authorized_by", "authorization", "reason", "expected_status",
        }
        body = exact_object(body, required, set(), "disposition body")
        if body.get("authorization") != "operator":
            raise Refusal("explicit disposition requires local operator authorization")
        authorized_by = text_field(body, "authorized_by", LOGICAL_ID_RE)
        reason = bounded_text(body, "reason")
        expected_status = body.get("expected_status")
        if expected_status not in OPEN:
            raise Refusal("expected_status must name one unresolved obligation state")
        now = self.clock.now_ms()
        with self.lock:
            row = self._guarded_obligation(body, statuses=(expected_status,))
            disposition_id = "dsp_" + uuid.uuid4().hex
            with self.transaction():
                self.conn.execute(
                    "UPDATE obligations SET status='disposed',last_reason=?,terminal_at=?,updated_at=? WHERE obligation_id=?",
                    (reason, now, now, row["obligation_id"]),
                )
                self.conn.execute(
                    "INSERT INTO dispositions(disposition_id,obligation_id,event_id,authorized_by,reason,disposed_at) "
                    "VALUES(?,?,?,?,?,?)",
                    (disposition_id, row["obligation_id"], row["event_id"], authorized_by, reason, now),
                )
                if row["consumer_type"] == "subscription":
                    self.conn.execute("DELETE FROM consumer_gaps WHERE obligation_id=?", (row["obligation_id"],))
                    self.conn.execute(
                        "UPDATE subscriptions SET high_water=MAX(high_water,?),updated_at=? "
                        "WHERE subscription_id=? AND generation=?",
                        (row["record_position"], now, row["consumer_id"], row["subscription_generation"]),
                    )
                self._refresh_record_terminal(int(row["record_position"]), now)
        self.notify()
        return {"disposed": True, "disposition_id": disposition_id, "obligation_id": row["obligation_id"]}

    def status(self, body: Any) -> dict[str, Any]:
        body = exact_object(body, set(), {"event_id", "producer_id", "request_id", "wait_ms"}, "status body")
        event_id = body.get("event_id")
        producer_id = body.get("producer_id")
        request_id = body.get("request_id")
        if event_id is not None:
            if producer_id is not None or request_id is not None:
                raise Refusal("status selects either event_id or producer_id/request_id")
            text_field(body, "event_id")
        else:
            if producer_id is None or request_id is None:
                raise Refusal("status requires event_id or producer_id/request_id")
            text_field(body, "producer_id")
            text_field(body, "request_id")
        wait_ms = integer_field(body, "wait_ms", minimum=0, maximum=MAX_WAIT_MS) if "wait_ms" in body else 0
        end = time.monotonic() + wait_ms / 1000
        while True:
            with self.lock:
                self.cleanup()
                if event_id is not None:
                    row = self.conn.execute("SELECT * FROM records WHERE event_id=?", (event_id,)).fetchone()
                else:
                    row = self.conn.execute(
                        "SELECT * FROM records WHERE producer_id=? AND request_id=?", (producer_id, request_id)
                    ).fetchone()
                if row is None:
                    raise Refusal("record does not exist", "not_found")
                result = self._status_by_position(int(row["journal_position"]))
                if result["terminal"] or time.monotonic() >= end:
                    return result
                wake_at: int | None
                if row["record_type"] == "send":
                    wake_at = int(row["deadline_at"])
                else:
                    oldest = self.conn.execute(
                        "SELECT MIN(created_at) FROM obligations WHERE record_position=? "
                        "AND status IN ('pending','in_flight','blocked')",
                        (row["journal_position"],),
                    ).fetchone()[0]
                    wake_at = int(oldest) + self.config.subscription_lease_ms if oldest is not None else None
                wake_after = max(0.0, (wake_at - self.clock.now_ms()) / 1000) if wake_at is not None else None
                remaining = end - time.monotonic()
                wait_for = remaining if wake_after is None else min(remaining, wake_after)
                if self.config.clock.test_file:
                    wait_for = min(wait_for, 0.25)
                if wait_for <= 0:
                    continue
                self.changed.wait(wait_for)

    def _status_by_position(self, position: int) -> dict[str, Any]:
        record = self.conn.execute("SELECT * FROM records WHERE journal_position=?", (position,)).fetchone()
        if record is None:
            raise Refusal("record does not exist", "not_found")
        obligations = self.conn.execute(
            "SELECT * FROM obligations WHERE record_position=? ORDER BY consumer_type,consumer_id,subscription_generation",
            (position,),
        ).fetchall()
        terminal = record["terminal_at"] is not None
        terminal_failure = bool(
            record["record_type"] == "send"
            and obligations
            and obligations[0]["status"] in ("expired", "disposed")
        )
        return {
            "record": self._record_document(record),
            "obligations": [self._obligation_document(row) for row in obligations],
            "terminal": terminal,
            "terminal_failure": terminal_failure,
        }

    def inspect(self, body: Any) -> dict[str, Any]:
        body = exact_object(body, {"view"}, {"limit", "after_position", "status", "consumer_id"}, "inspect body")
        view = body.get("view")
        if view not in ("health", "integrity", "journal", "obligations", "subscriptions", "dispositions"):
            raise Refusal("inspect view is not supported")
        allowed: dict[str, set[str]] = {
            "health": {"view"}, "integrity": {"view"},
            "journal": {"view", "limit", "after_position"},
            "obligations": {"view", "limit", "status", "consumer_id"},
            "subscriptions": {"view", "limit"}, "dispositions": {"view", "limit"},
        }
        extra = set(body) - allowed[view]
        if extra:
            raise Refusal(f"inspect {view} has unknown field(s): {', '.join(sorted(extra))}")
        with self.lock:
            self.cleanup()
            if view == "health":
                return self._health()
            if view == "integrity":
                result = str(self.conn.execute("PRAGMA integrity_check(100)").fetchone()[0])
                return {"integrity": result, "ok": result == "ok", "schema_version": SCHEMA_VERSION}
            limit = integer_field(body, "limit", minimum=1, maximum=20) if "limit" in body else 20
            if view == "journal":
                after = integer_field(body, "after_position", minimum=0) if "after_position" in body else 0
                rows = self.conn.execute(
                    "SELECT * FROM records WHERE journal_position>? ORDER BY journal_position LIMIT ?", (after, limit)
                ).fetchall()
                return {"records": [self._record_summary(row) for row in rows], "limit": limit}
            if view == "obligations":
                clauses: list[str] = []
                values: list[Any] = []
                if "status" in body:
                    status_value = body["status"]
                    if status_value not in OPEN + TERMINAL:
                        raise Refusal("status filter is invalid")
                    clauses.append("status=?")
                    values.append(status_value)
                if "consumer_id" in body:
                    clauses.append("consumer_id=?")
                    values.append(text_field(body, "consumer_id", LOGICAL_ID_RE))
                where = " WHERE " + " AND ".join(clauses) if clauses else ""
                rows = self.conn.execute(
                    "SELECT * FROM obligations" + where + " ORDER BY record_position,consumer_id LIMIT ?",
                    (*values, limit),
                ).fetchall()
                return {"obligations": [self._obligation_document(row) for row in rows], "limit": limit}
            if view == "subscriptions":
                rows = self.conn.execute(
                    "SELECT * FROM subscriptions ORDER BY subscription_id LIMIT ?", (limit,)
                ).fetchall()
                return {"subscriptions": [self._subscription_document(row) for row in rows], "limit": limit}
            rows = self.conn.execute(
                "SELECT * FROM dispositions ORDER BY disposed_at,disposition_id LIMIT ?", (limit,)
            ).fetchall()
            return {"dispositions": [dict(row) for row in rows], "limit": limit}

    def _health(self) -> dict[str, Any]:
        counts = {
            "records": int(self.conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]),
            "obligations": int(self.conn.execute("SELECT COUNT(*) FROM obligations").fetchone()[0]),
            "unresolved": int(
                self.conn.execute("SELECT COUNT(*) FROM obligations WHERE status IN ('pending','in_flight','blocked')").fetchone()[0]
            ),
            "subscriptions": int(self.conn.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]),
        }
        return {
            "service": "qq-event-plane", "instance_id": self.instance_id,
            "schema_version": SCHEMA_VERSION, "protocol": PROTOCOL,
            "journal_mode": str(self.conn.execute("PRAGMA journal_mode").fetchone()[0]).lower(),
            "synchronous": "FULL" if int(self.conn.execute("PRAGMA synchronous").fetchone()[0]) == 2 else "other",
            "counts": counts,
            "constants": {
                "max_payload_bytes": MAX_PAYLOAD_BYTES, "send_ttl_ms": self.config.send_ttl_ms,
                "subscription_lease_ms": self.config.subscription_lease_ms,
                "payload_retention_ms": self.config.payload_retention_ms,
                "tombstone_retention_ms": self.config.tombstone_retention_ms,
                "backoff_ms": list(BACKOFF_MS),
            },
        }

    def backup(self, body: Any) -> dict[str, Any]:
        body = exact_object(body, {"path"}, set(), "backup body")
        path = self._admin_path(body.get("path"), must_exist=False)
        if path.exists() or path.is_symlink():
            raise Refusal("backup destination must not already exist")
        with self.lock:
            self.cleanup()
            destination = sqlite3.connect(path)
            try:
                self.conn.backup(destination)
                destination.execute("PRAGMA synchronous=FULL")
                result = str(destination.execute("PRAGMA integrity_check").fetchone()[0])
                if result != "ok":
                    raise Refusal("created backup failed integrity inspection")
            finally:
                destination.close()
            os.chmod(path, 0o600)
            with path.open("rb") as stream:
                os.fsync(stream.fileno())
            directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        return {"backup": str(path), "integrity": "ok", "instance_id": self.instance_id}

    def _write_restore_safety(self, rollback: Path) -> None:
        descriptor = os.open(
            rollback, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
        )
        os.close(descriptor)
        try:
            safety = sqlite3.connect(rollback)
            try:
                safety.execute("PRAGMA journal_mode=DELETE")
                safety.execute("PRAGMA synchronous=FULL")
                self.conn.backup(safety)
            finally:
                safety.close()
            os.chmod(rollback, 0o600)
            _fsync_file(rollback)
            _fsync_directory(rollback.parent)
            saved = _open_immutable_database(rollback)
            try:
                self._validate_database(saved, allowed_versions=(SCHEMA_VERSION,))
                saved_instance = str(
                    saved.execute("SELECT value FROM metadata WHERE key='instance_id'").fetchone()[0]
                )
            finally:
                saved.close()
            if saved_instance != self.instance_id:
                raise ConfigurationError("restore safety copy changed the live instance identity")
        except BaseException:
            # Ordinary safety-copy failure has not touched live state. Remove
            # only artifacts created by this call; process death bypasses this
            # cleanup and startup validates any leftover before changing state.
            for side in _sqlite_side_paths(rollback):
                side.unlink(missing_ok=True)
            rollback.unlink(missing_ok=True)
            _fsync_directory(rollback.parent)
            raise

    def _copy_restore_candidate(self, source: sqlite3.Connection) -> None:
        source.backup(self.conn)

    def _finalize_restore(self, rollback: Path) -> None:
        self._validate_database(self.conn, allowed_versions=(SCHEMA_VERSION,))
        if self._meta("instance_id") != self.instance_id:
            raise ConfigurationError("live Event Plane identity changed before restore finalization")
        for side in _sqlite_side_paths(self.config.database_path):
            if side.exists() or side.is_symlink():
                raise ConfigurationError(
                    f"live database has an unexpected SQLite side file before restore finalization: {side.name}"
                )
        _fsync_file(self.config.database_path)
        _fsync_directory(self.config.state_dir)
        rollback.unlink()
        _fsync_directory(self.config.state_dir)

    def restore(self, body: Any) -> dict[str, Any]:
        body = exact_object(body, {"path", "expected_instance_id"}, set(), "restore body")
        if body.get("expected_instance_id") != self.instance_id:
            raise Refusal("service instance guard does not match", "guard_conflict")
        path = self._admin_path(body.get("path"), must_exist=True)
        try:
            source = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
        except sqlite3.Error as error:
            raise Refusal(f"cannot open restore source: {error}", "invalid_restore") from error
        source.row_factory = sqlite3.Row
        try:
            # A candidate cannot touch live state until its complete supported
            # version-specific schema, identity, integrity, and references pass.
            source_version = self._validate_database(
                source, allowed_versions=(1, SCHEMA_VERSION), refusal=True
            )
            if source_version == 1 and not self._v1_journal_is_complete(source):
                raise Refusal(
                    "schema 1 restore has deleted journal positions without truthful selector boundaries",
                    "replay_unavailable",
                )
            rollback = self.config.state_dir / ".restore-rollback.sqlite3"
            if rollback.exists() or rollback.is_symlink():
                raise Refusal("restore safety path already exists; live state retained", "restore_incomplete")
            with self.lock:
                if body.get("expected_instance_id") != self.instance_id:
                    raise Refusal("service instance guard no longer matches", "guard_conflict")
                old_instance = self.instance_id
                self._write_restore_safety(rollback)
                try:
                    self._copy_restore_candidate(source)
                    self._configure()
                    self._migrate()
                    self._validate_database(
                        self.conn, allowed_versions=(SCHEMA_VERSION,), refusal=True
                    )
                    candidate_instance = self._meta("instance_id")
                    self.instance_id = candidate_instance
                    self._recover_startup()
                    self._validate_database(
                        self.conn, allowed_versions=(SCHEMA_VERSION,), refusal=True
                    )
                    if self._meta("instance_id") != candidate_instance:
                        raise Refusal("restored Event Plane identity changed during recovery", "invalid_restore")
                    self._finalize_restore(rollback)
                except BaseException as candidate_error:
                    # Do not return any candidate failure until the exact live
                    # safety copy has itself been restored, made durable, and
                    # fully validated under its original instance identity.
                    try:
                        saved = _open_immutable_database(rollback)
                        try:
                            saved.backup(self.conn)
                        finally:
                            saved.close()
                        self._configure()
                        self._validate_database(
                            self.conn, allowed_versions=(SCHEMA_VERSION,)
                        )
                        restored_instance = self._meta("instance_id")
                        if restored_instance != old_instance:
                            raise ConfigurationError("restore safety copy changed the live instance identity")
                        self.instance_id = restored_instance
                        self._finalize_restore(rollback)
                    except BaseException as safety_error:
                        raise ConfigurationError(
                            f"candidate restore failed and safety restoration could not be validated: {safety_error}"
                        ) from candidate_error
                    raise
        finally:
            source.close()
        self.notify()
        return {"restored": True, "instance_id": self.instance_id, "integrity": "ok"}

    def _admin_path(self, raw: Any, *, must_exist: bool) -> Path:
        if not isinstance(raw, str) or not raw or not os.path.isabs(raw):
            raise Refusal("administrative path must be absolute")
        path = Path(raw)
        if path.is_symlink():
            raise Refusal("administrative path cannot be a symlink")
        parent = path.parent
        try:
            info = parent.lstat()
        except OSError as error:
            raise Refusal(f"cannot inspect administrative path parent: {error}") from error
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise Refusal("administrative path parent must be a real directory")
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise Refusal("administrative path parent must be account-private")
        if must_exist:
            try:
                item = path.lstat()
            except OSError as error:
                raise Refusal(f"cannot inspect administrative file: {error}") from error
            if not stat.S_ISREG(item.st_mode) or item.st_uid != os.getuid() or stat.S_IMODE(item.st_mode) & 0o077:
                raise Refusal("administrative file must be a private account-owned regular file")
        return path

    def _record_document(self, row: sqlite3.Row) -> dict[str, Any]:
        envelope = decode_json(bytes(row["envelope_json"]), "stored envelope") if row["envelope_json"] is not None else None
        return {
            "journal_position": int(row["journal_position"]), "event_id": row["event_id"],
            "producer_id": row["producer_id"], "request_id": row["request_id"],
            "record_type": row["record_type"], "product_id": row["product_id"], "kind": row["kind"],
            "origin_id": row["origin_id"], "recipient_id": row["recipient_id"],
            "schema_version": int(row["schema_version"]), "accepted_at": int(row["accepted_at"]),
            "deadline_at": row["deadline_at"], "input_hash": row["input_hash"],
            "retention": "full" if envelope is not None else "tombstone", "envelope": envelope,
            "terminal_at": row["terminal_at"],
        }

    def _record_summary(self, row: sqlite3.Row) -> dict[str, Any]:
        document = self._record_document(row)
        document.pop("envelope")
        return document

    @staticmethod
    def _obligation_document(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "obligation_id": row["obligation_id"], "journal_position": int(row["record_position"]),
            "consumer_type": row["consumer_type"], "consumer_id": row["consumer_id"],
            "generation": int(row["subscription_generation"]), "status": row["status"],
            "attempt_count": int(row["attempt_count"]), "failure_count": int(row["failure_count"]),
            "attempt_token": row["attempt_token"], "endpoint_token": row["endpoint_token"],
            "next_attempt_at": int(row["next_attempt_at"]), "last_reason": row["last_reason"],
            "created_at": int(row["created_at"]), "updated_at": int(row["updated_at"]),
            "terminal_at": row["terminal_at"],
        }

    def _subscription_document(self, row: sqlite3.Row) -> dict[str, Any]:
        state = self._consumer_state("subscription", row["subscription_id"], int(row["generation"]))
        return {
            "subscription_id": row["subscription_id"], "product_id": row["product_id"],
            "kind": row["kind"], "generation": int(row["generation"]),
            "reconstruction_position": int(row["reconstruction_position"]),
            "high_water": int(row["high_water"]), "lease_expires_at": int(row["lease_expires_at"]),
            "active": bool(row["active"]), "expired_at": row["expired_at"], "gaps": state["gaps"],
            "gap_token": state["gap_token"],
        }


class EventPlane:
    def __init__(self, store: Store):
        self.store = store
        self.shutdown_requested: Callable[[], None] | None = None
        self.shutting_down = False

    def dispatch(self, request: Any) -> dict[str, Any]:
        request = exact_object(request, {"protocol", "operation", "body"}, set(), "request")
        if request.get("protocol") != PROTOCOL:
            raise Refusal("unsupported protocol version", "protocol_version")
        operation = request.get("operation")
        if not isinstance(operation, str):
            raise Refusal("operation must be a string")
        if self.shutting_down:
            raise Refusal("service is shutting down", "unavailable")
        body = request["body"]
        operations: dict[str, Callable[[Any], dict[str, Any]]] = {
            "send": lambda value: self.store.append("send", value),
            "publish": lambda value: self.store.append("publish", value),
            "ensure_subscription": self.store.ensure_subscription,
            "next": self.store.next_delivery,
            "acknowledge": self.store.acknowledge,
            "retry": self.store.retry,
            "block": self.store.block,
            "disposition": self.store.disposition,
            "status": self.store.status,
            "inspect": self.store.inspect,
            "backup": self.store.backup,
            "restore": self.store.restore,
            "shutdown": self.shutdown,
        }
        handler = operations.get(operation)
        if handler is None:
            raise Refusal("operation is not supported")
        return handler(body)

    def shutdown(self, body: Any) -> dict[str, Any]:
        body = exact_object(body, {"expected_instance_id", "authorization"}, set(), "shutdown body")
        if body.get("expected_instance_id") != self.store.instance_id:
            raise Refusal("service instance guard does not match", "guard_conflict")
        if body.get("authorization") != "operator":
            raise Refusal("guarded shutdown requires local operator authorization")
        self.shutting_down = True
        if self.shutdown_requested is not None:
            threading.Thread(target=self.shutdown_requested, daemon=True).start()
        return {"shutdown": True, "instance_id": self.store.instance_id}


class RequestHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        self.request.settimeout(35)
        try:
            header = self._read_exact(4)
            if header is None:
                return
            length = struct.unpack(">I", header)[0]
            if length < 2 or length > MAX_FRAME_BYTES:
                raise Refusal("request frame length is outside the bounded protocol", "frame_too_large")
            raw = self._read_exact(length)
            if raw is None:
                raise Refusal("request frame ended before its declared length")
            # Promised clients half-close after one frame. Dispatch is forbidden
            # until EOF proves there are no trailing bytes or duplicate frames.
            trailing = self.request.recv(1)
            if trailing:
                raise Refusal("request contains trailing bytes outside its single frame", "invalid_frame")
            request = decode_json(raw, "request")
            result = self.server.plane.dispatch(request)  # type: ignore[attr-defined]
            outgoing = response(True, result)
        except Refusal as error:
            outgoing = response(False, {"code": error.code, "message": error.message})
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            return
        except Exception as error:
            print(f"qq-event-plane: internal request error: {error}", file=sys.stderr)
            outgoing = response(False, {"code": "internal", "message": "internal service error"})
        try:
            self.request.sendall(struct.pack(">I", len(outgoing)) + outgoing)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass

    def _read_exact(self, length: int) -> bytes | None:
        parts = bytearray()
        while len(parts) < length:
            chunk = self.request.recv(length - len(parts))
            if not chunk:
                return None if not parts else bytes(parts)
            parts.extend(chunk)
        return bytes(parts)


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = False
    request_queue_size = 64

    def __init__(self, path: str, handler: type[RequestHandler], plane: EventPlane):
        self.plane = plane
        super().__init__(path, handler)


class Singleton:
    def __init__(self, path: Path):
        existed = validate_private_file(path, "Event Plane singleton lock")
        self.fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
        if not existed:
            os.fchmod(self.fd, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            os.close(self.fd)
            raise ConfigurationError("another qq Event Plane service owns the singleton lock") from error

    def record_owner(self) -> None:
        os.ftruncate(self.fd, 0)
        os.write(self.fd, f"{os.getpid()}\n".encode("ascii"))
        os.fsync(self.fd)

    def close(self) -> None:
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)


def serve(config: Config) -> int:
    restore_marker = config.state_dir / ".restore-rollback.sqlite3"
    if (restore_marker.exists() or restore_marker.is_symlink()) and not validate_private_file(
        config.lock_path, "Event Plane singleton lock"
    ):
        raise ConfigurationError("restore safety exists without the service-owned singleton lock")
    singleton = Singleton(config.lock_path)
    store: Store | None = None
    server: Server | None = None
    try:
        # Restore recovery and all marker validation happen while fenced but
        # before mutable database open, lock-content update, or stale-socket
        # removal. Invalid safety therefore refuses without changing state.
        store = Store(config)
        singleton.record_owner()
        if config.socket_path.is_symlink():
            raise ConfigurationError("socket path cannot be a symlink")
        if config.socket_path.exists():
            info = config.socket_path.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                raise ConfigurationError("stale socket path is not an account-owned socket")
            config.socket_path.unlink()
        plane = EventPlane(store)
        active_server = Server(str(config.socket_path), RequestHandler, plane)
        server = active_server
        os.chmod(config.socket_path, 0o600)
        plane.shutdown_requested = active_server.shutdown

        stopping = threading.Event()

        def stop(_signum: int, _frame: Any) -> None:
            if not stopping.is_set():
                stopping.set()
                threading.Thread(target=active_server.shutdown, daemon=True).start()

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        active_server.serve_forever(poll_interval=0.1)
        active_server.server_close()
        server = None
        return 0
    finally:
        if server is not None:
            server.server_close()
        if store is not None:
            store.close()
        try:
            if config.socket_path.exists() and stat.S_ISSOCK(config.socket_path.lstat().st_mode):
                config.socket_path.unlink()
        finally:
            singleton.close()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="qq-event-plane")
    parser.add_argument("command", choices=("serve",))
    parser.add_argument("--state-dir")
    parser.add_argument("--test-clock")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    os.umask(0o077)
    try:
        args = parse_args(argv)
        test_clock: Path | None = None
        if args.test_clock:
            if os.environ.get("QQ_EVENT_PLANE_TESTING") != "1":
                raise ConfigurationError("--test-clock is available only in the isolated test seam")
            # Validate the destructive-time seam before creating even the state
            # directory, singleton lock, database, or socket.
            test_clock = validate_test_clock(Path(args.test_clock))
            read_test_clock(test_clock)
        state = private_directory(Path(args.state_dir) if args.state_dir else default_state_dir(), create=True)
        config = Config(state, test_clock)
        return serve(config)
    except ConfigurationError as error:
        print(f"qq-event-plane: {error}", file=sys.stderr)
        return 73
    except (OSError, sqlite3.Error) as error:
        print(f"qq-event-plane: startup failed: {error}", file=sys.stderr)
        return 74


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
