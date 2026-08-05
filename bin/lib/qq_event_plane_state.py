#!/usr/bin/env python3
"""Private filesystem state transitions shared by Event Plane service and admin.

Offline restore is deliberately not part of the socket protocol.  This module
owns only the fixed local names, validation, singleton fencing, fsync/copy
helpers, and recovery protocol needed before SQLite mutable state is opened. Fsyncs
support the claimed process-crash truth; sudden power loss and storage-hardware
durability are explicitly outside this operation's guarantee.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any, Callable

sys.dont_write_bytecode = True

DATABASE_NAME = "event-plane.sqlite3"
LOCK_NAME = "event-plane.lock"
SOCKET_NAME = "event-plane.sock"
CANDIDATE_TEMP_NAME = ".event-plane-restore-candidate.tmp"
CANDIDATE_NAME = ".event-plane-restore-candidate.sqlite3"
SAFETY_TEMP_NAME = ".event-plane-restore-safety.tmp"
SAFETY_NAME = ".event-plane-restore-safety.sqlite3"
COMMIT_TEMP_NAME = ".event-plane-restore-commit.tmp"
COMMIT_NAME = ".event-plane-restore-committed"
RESTORE_NAMES = frozenset({
    CANDIDATE_TEMP_NAME, CANDIDATE_NAME, SAFETY_TEMP_NAME, SAFETY_NAME,
    COMMIT_TEMP_NAME, COMMIT_NAME,
})
COMMIT_FORMAT = "qq-event-plane-offline-restore/v1"


class RestoreStateError(Exception):
    """A fixed filesystem state is unsafe or ambiguous."""


class SingletonBusy(RestoreStateError):
    """The running service owns the exact singleton."""


def sqlite_side_paths(path: Path) -> tuple[Path, ...]:
    return tuple(Path(f"{path}{suffix}") for suffix in ("-journal", "-wal", "-shm"))


def fsync_file(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                return digest.hexdigest()
            digest.update(block)
    finally:
        os.close(descriptor)


def _private_regular(path: Path, label: str) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError as error:
        raise RestoreStateError(f"cannot inspect {label}: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise RestoreStateError(f"{label} must be a real regular file, not a symlink")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise RestoreStateError(f"{label} must be account-owned with mode 0600")
    if info.st_nlink != 1:
        raise RestoreStateError(f"{label} must have exactly one link")
    return info


def _private_socket(path: Path) -> None:
    try:
        info = path.lstat()
    except OSError as error:
        raise RestoreStateError(f"cannot inspect Event Plane socket: {error}") from error
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        raise RestoreStateError("Event Plane socket name is not an account-owned socket")
    if stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise RestoreStateError("Event Plane socket must have mode 0600 and exactly one link")


def private_state_directory(path: Path) -> Path:
    if not path.is_absolute():
        raise RestoreStateError("state directory must be absolute")
    try:
        info = path.lstat()
    except OSError as error:
        raise RestoreStateError(f"cannot inspect state directory: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise RestoreStateError("state directory must be a real directory, not a symlink")
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise RestoreStateError("state directory must be account-owned with mode 0700")
    return path.resolve(strict=True)


def inspect_state_namespace(
    state_dir: Path, *, require_database: bool, require_lock: bool
) -> dict[str, Path]:
    """Validate every installed name without creating, deleting, or chmodding it."""
    state_dir = private_state_directory(state_dir)
    paths = {entry.name: entry for entry in state_dir.iterdir()}
    allowed = {DATABASE_NAME, LOCK_NAME, SOCKET_NAME, *RESTORE_NAMES}
    side_names: set[str] = set()
    for name in (DATABASE_NAME, CANDIDATE_TEMP_NAME, CANDIDATE_NAME, SAFETY_TEMP_NAME, SAFETY_NAME):
        side_names.update(side.name for side in sqlite_side_paths(state_dir / name))
    unknown = sorted(set(paths) - allowed - side_names)
    if unknown:
        raise RestoreStateError(f"state directory contains unknown name(s): {', '.join(unknown)}")
    present_sides = sorted(set(paths) & side_names)
    if present_sides:
        raise RestoreStateError(
            f"state directory contains ambiguous SQLite side file(s): {', '.join(present_sides)}"
        )
    if require_database and DATABASE_NAME not in paths:
        raise RestoreStateError("state directory has no installed Event Plane database")
    if require_lock and LOCK_NAME not in paths:
        raise RestoreStateError("state directory has no installed Event Plane singleton lock")
    for name, label in (
        (DATABASE_NAME, "Event Plane database"),
        (LOCK_NAME, "Event Plane singleton lock"),
        (CANDIDATE_TEMP_NAME, "restore candidate construction file"),
        (CANDIDATE_NAME, "restore candidate database"),
        (SAFETY_TEMP_NAME, "restore safety construction file"),
        (SAFETY_NAME, "restore safety database"),
        (COMMIT_TEMP_NAME, "restore commit construction file"),
        (COMMIT_NAME, "restore commit marker"),
    ):
        if name in paths:
            _private_regular(paths[name], label)
    if SOCKET_NAME in paths:
        _private_socket(paths[SOCKET_NAME])
    return paths


class OfflineSingleton:
    """Acquire an already-installed service singleton without changing its file."""

    def __init__(self, lock_path: Path):
        _private_regular(lock_path, "Event Plane singleton lock")
        self.fd = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW)
        try:
            info = os.fstat(self.fd)
            current = lock_path.lstat()
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_nlink != 1
                or (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino)
            ):
                raise RestoreStateError("Event Plane singleton lock changed during acquisition")
            try:
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise SingletonBusy(
                    "Event Plane service is running; stop it before offline administration"
                ) from error
        except BaseException:
            os.close(self.fd)
            self.fd = -1
            raise

    def close(self) -> None:
        if self.fd >= 0:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)
            self.fd = -1

    def __enter__(self) -> "OfflineSingleton":
        return self

    def __exit__(self, _kind: Any, _value: Any, _traceback: Any) -> None:
        self.close()


def _unlink_many(state_dir: Path, names: tuple[str, ...]) -> None:
    changed = False
    for name in names:
        path = state_dir / name
        if path.exists() or path.is_symlink():
            path.unlink()
            changed = True
    if changed:
        fsync_directory(state_dir)


def _load_commit(path: Path) -> dict[str, str]:
    try:
        raw = path.read_bytes()
        value = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RestoreStateError(f"cannot validate restore commit marker: {error}") from error
    required = {"format", "instance_id", "pre_restore_sha256", "candidate_sha256"}
    if not isinstance(value, dict) or set(value) != required or not all(
        isinstance(item, str) for item in value.values()
    ):
        raise RestoreStateError("restore commit marker has an invalid structural contract")
    if value["format"] != COMMIT_FORMAT:
        raise RestoreStateError("restore commit marker has an unsupported format")
    if any(
        len(value[key]) != 64 or any(character not in "0123456789abcdef" for character in value[key])
        for key in ("pre_restore_sha256", "candidate_sha256")
    ):
        raise RestoreStateError("restore commit marker has an invalid database digest")
    return value


def validated_database_evidence(
    path: Path, validate_database: Callable[[Path], dict[str, Any]]
) -> dict[str, Any]:
    evidence = validate_database(path)
    instance = evidence.get("instance_id")
    if not isinstance(instance, str):
        raise RestoreStateError("database validation returned no instance identity")
    return {**evidence, "sha256": file_digest(path)}


def reconcile_restore_state(
    state_dir: Path,
    validate_database: Callable[[Path], dict[str, Any]],
    *,
    require_database: bool = True,
) -> str:
    """Select pre-state before commit and candidate after commit, then clean names.

    The atomic publication of COMMIT_NAME is the process-crash commit boundary.
    A safety database without that marker is authoritative pre-restore state.
    A validated marker is authoritative candidate evidence.  Construction files
    are disposable only at their exact private, uniquely-linked fixed names.
    """
    paths = inspect_state_namespace(
        state_dir, require_database=require_database, require_lock=True
    )
    state_dir = private_state_directory(state_dir)
    live = state_dir / DATABASE_NAME
    candidate = state_dir / CANDIDATE_NAME
    safety = state_dir / SAFETY_NAME
    commit = state_dir / COMMIT_NAME
    has_restore = any(name in paths for name in RESTORE_NAMES)
    if not has_restore:
        return "none"
    if not live.exists():
        raise RestoreStateError("offline restore state exists without an installed database")

    live_evidence = validated_database_evidence(live, validate_database)
    candidate_evidence = (
        validated_database_evidence(candidate, validate_database) if candidate.exists() else None
    )
    safety_evidence = (
        validated_database_evidence(safety, validate_database) if safety.exists() else None
    )

    if commit.exists():
        marker = _load_commit(commit)
        if candidate_evidence is not None or any(
            name in paths for name in (CANDIDATE_TEMP_NAME, SAFETY_TEMP_NAME, COMMIT_TEMP_NAME)
        ):
            raise RestoreStateError("committed restore has ambiguous construction state")
        if (
            live_evidence["sha256"] != marker["candidate_sha256"]
            or live_evidence["instance_id"] != marker["instance_id"]
        ):
            raise RestoreStateError("committed restore marker does not identify the live database")
        if safety_evidence is not None and (
            safety_evidence["sha256"] != marker["pre_restore_sha256"]
            or safety_evidence["instance_id"] != marker["instance_id"]
        ):
            raise RestoreStateError("committed restore safety evidence is inconsistent")
        # Keep the commit marker while safety is removed.  A crash in this
        # interval still selects the already-validated candidate.
        _unlink_many(state_dir, (SAFETY_NAME,))
        _unlink_many(state_dir, (COMMIT_NAME,))
        _unlink_many(
            state_dir,
            (CANDIDATE_TEMP_NAME, SAFETY_TEMP_NAME, COMMIT_TEMP_NAME),
        )
        return "candidate"

    if safety_evidence is not None:
        if live_evidence["instance_id"] != safety_evidence["instance_id"]:
            raise RestoreStateError("restore safety and live database identities differ")
        if candidate_evidence is not None:
            if live_evidence["sha256"] != safety_evidence["sha256"]:
                raise RestoreStateError("pre-commit restore has mixed live and candidate state")
            if candidate_evidence["instance_id"] != safety_evidence["instance_id"]:
                raise RestoreStateError("restore candidate and safety identities differ")
        else:
            # Once candidate has been renamed over live, the already-durable
            # commit construction file is required evidence for both bytes.
            commit_temp = state_dir / COMMIT_TEMP_NAME
            if not commit_temp.exists():
                raise RestoreStateError("pre-commit candidate live state has no commit evidence")
            marker = _load_commit(commit_temp)
            if (
                safety_evidence["sha256"] != marker["pre_restore_sha256"]
                or live_evidence["sha256"] != marker["candidate_sha256"]
                or safety_evidence["instance_id"] != marker["instance_id"]
                or live_evidence["instance_id"] != marker["instance_id"]
            ):
                raise RestoreStateError("pre-commit live and safety evidence is inconsistent")
        # No commit marker means safety is authoritative.  Consuming it with an
        # atomic replace cannot expose a partial database and cannot carry a
        # candidate rollback journal (side files were refused above).
        os.replace(safety, live)
        fsync_file(live)
        fsync_directory(state_dir)
        _unlink_many(
            state_dir,
            (CANDIDATE_NAME, CANDIDATE_TEMP_NAME, SAFETY_TEMP_NAME, COMMIT_TEMP_NAME),
        )
        return "pre_restore"

    # A final candidate before safety publication is validated but never
    # authoritative. Exact private construction names are likewise disposable.
    if candidate_evidence is not None and (
        candidate_evidence["instance_id"] != live_evidence["instance_id"]
    ):
        raise RestoreStateError("uncommitted restore candidate has a foreign instance identity")
    _unlink_many(
        state_dir,
        (CANDIDATE_NAME, CANDIDATE_TEMP_NAME, SAFETY_TEMP_NAME, COMMIT_TEMP_NAME),
    )
    return "pre_restore"


def validate_backup_path(path: Path) -> os.stat_result:
    if not path.is_absolute():
        raise RestoreStateError("backup_path must be absolute")
    try:
        parent_info = path.parent.lstat()
    except OSError as error:
        raise RestoreStateError(f"cannot inspect backup_path parent: {error}") from error
    if (
        stat.S_ISLNK(parent_info.st_mode)
        or not stat.S_ISDIR(parent_info.st_mode)
        or parent_info.st_uid != os.getuid()
        or stat.S_IMODE(parent_info.st_mode) != 0o700
    ):
        raise RestoreStateError("backup_path parent must be an account-owned mode-0700 directory")
    info = _private_regular(path, "restore backup")
    for side in sqlite_side_paths(path):
        if side.exists() or side.is_symlink():
            raise RestoreStateError(f"restore backup has an ambiguous SQLite side file: {side.name}")
    return info


def write_commit_temp(path: Path, value: dict[str, str]) -> None:
    raw = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("ascii")
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        view = memoryview(raw)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def copy_into_existing(source: Path, destination: Path) -> None:
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    destination_fd = os.open(destination, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
    try:
        source_info = os.fstat(source_fd)
        while True:
            block = os.read(source_fd, 1024 * 1024)
            if not block:
                break
            view = memoryview(block)
            while view:
                written = os.write(destination_fd, view)
                view = view[written:]
        os.fsync(destination_fd)
        after = os.fstat(source_fd)
        if (
            source_info.st_dev,
            source_info.st_ino,
            source_info.st_size,
            source_info.st_mtime_ns,
            source_info.st_ctime_ns,
        ) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        ):
            raise RestoreStateError("restore source changed while it was copied")
    finally:
        os.close(destination_fd)
        os.close(source_fd)
