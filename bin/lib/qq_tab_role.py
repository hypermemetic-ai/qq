#!/usr/bin/env python3
"""Fail-closed qq tab-role tags and current pane resolution.

Herdr 0.7.5 has no tab metadata field. This module stores only the named role
tag, keyed by exact workspace and tab identity. Herdr remains authority for
current pane membership and process evidence.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import errno
try:
    import fcntl
except ImportError:  # pragma: no cover - exercised only on unsupported platforms
    fcntl = None
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import stat
import subprocess
import sys
import time
from typing import Any, Callable, IO, Iterator

SCHEMA = "qq.tab-role/v1"
ROLES = frozenset(("architect", "coordinator", "change_owner"))
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9:_-]{0,159}\Z")
MAX_JSON = 256 * 1024
MAX_HERDR_DIAGNOSTIC = 4096
HERDR_TIMEOUT_SECONDS = 15.0
HERDR_REAP_SECONDS = 1.0
LOCK_NAME = ".state.lock"


class Refusal(Exception):
    pass


class _CaptureFailure(Exception):
    def __init__(self, reason: str, cause: BaseException | None = None):
        super().__init__(reason)
        self.reason = reason
        self.cause = cause


def require_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or IDENTIFIER.fullmatch(value) is None:
        raise Refusal(f"{label} is malformed")
    return value


def strict_json(raw: bytes | str, label: str) -> dict[str, Any]:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Refusal(f"{label} contains duplicate key {key!r}")
            result[key] = value
        return result

    if isinstance(raw, bytes):
        if len(raw) > MAX_JSON:
            raise Refusal(f"{label} exceeds its size bound")
        try:
            text = raw.decode("utf-8", errors="strict")
        except UnicodeError as error:
            raise Refusal(f"{label} is not strict UTF-8") from error
    else:
        text = raw
    try:
        value = json.loads(text, object_pairs_hook=pairs)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise Refusal(f"{label} is malformed JSON") from error
    if not isinstance(value, dict):
        raise Refusal(f"{label} must be a JSON object")
    return value


def canonical_json(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def state_root(explicit: str | None = None) -> Path:
    raw = explicit or os.environ.get("QQ_TAB_ROLE_ROOT")
    if raw is None:
        state = os.environ.get("XDG_STATE_HOME")
        if state is None:
            home = os.environ.get("HOME")
            if not home:
                raise Refusal("XDG state home is unavailable")
            state = os.path.join(home, ".local", "state")
        raw = os.path.join(state, "qq", "tab-roles")
    if not os.path.isabs(raw) or os.path.normpath(raw) != raw:
        raise Refusal("tab-role state root must be one normalized absolute path")
    root = Path(raw)
    # Refuse an existing symlink prefix before mkdir can follow it and create
    # state outside the requested exact path.
    current = Path(root.anchor)
    for part in root.parts[1:]:
        current /= part
        try:
            current_state = current.lstat()
        except FileNotFoundError:
            break
        except OSError as error:
            raise Refusal("tab-role state path is unavailable") from error
        if stat.S_ISLNK(current_state.st_mode):
            raise Refusal(f"tab-role state path has symlink ambiguity at {current}")
    try:
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
        root_state = root.lstat()
        resolved = root.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise Refusal("tab-role state root is unavailable") from error
    if (not stat.S_ISDIR(root_state.st_mode) or stat.S_ISLNK(root_state.st_mode)
            or resolved != root or root_state.st_uid != os.getuid()
            or stat.S_IMODE(root_state.st_mode) != 0o700):
        raise Refusal("tab-role state root must be an owned canonical non-symlink mode-0700 directory")
    current = Path(root.anchor)
    for part in root.parts[1:]:
        current /= part
        try:
            if stat.S_ISLNK(current.lstat().st_mode):
                raise Refusal(f"tab-role state path has symlink ambiguity at {current}")
        except OSError as error:
            raise Refusal("tab-role state path is unavailable") from error
    return root


def identity(workspace: str, tab: str) -> dict[str, str]:
    return {
        "workspace_id": require_identifier(workspace, "workspace identity"),
        "tab_id": require_identifier(tab, "tab identity"),
    }


def record_path(root: Path, workspace: str, tab: str) -> Path:
    key = identity(workspace, tab)
    digest = hashlib.sha256(canonical_json(key)).hexdigest()
    return root / f"{digest}.json"


def validate_record(value: Any, workspace: str, tab: str) -> dict[str, Any]:
    expected = {"schema", "version", "workspace_id", "tab_id", "role"}
    if not isinstance(value, dict) or set(value) != expected:
        raise Refusal("tab-role record has an invalid shape")
    wanted = identity(workspace, tab)
    if (value["schema"] != SCHEMA or value["version"] != 1
            or value["workspace_id"] != wanted["workspace_id"]
            or value["tab_id"] != wanted["tab_id"] or value["role"] not in ROLES):
        raise Refusal("tab-role record schema or exact identity does not match")
    return value


def lock_path(root: Path) -> Path:
    return root / LOCK_NAME


@contextmanager
def state_lock(root: Path, *, exclusive: bool) -> Iterator[None]:
    """Take the one validated, non-waiting lock for this private state root."""
    if fcntl is None or not hasattr(os, "O_NOFOLLOW"):
        raise Refusal("tab-role state locking is unsupported on this platform")
    validated_root = state_root(str(root))
    path = lock_path(validated_root)
    flags = (os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
             | getattr(os, "O_CLOEXEC", 0))
    descriptor = None
    acquired = False
    try:
        try:
            existing_state = path.lstat()
        except FileNotFoundError:
            existing_state = None
        if (existing_state is not None
                and (not stat.S_ISREG(existing_state.st_mode)
                     or stat.S_ISLNK(existing_state.st_mode)
                     or existing_state.st_uid != os.getuid()
                     or stat.S_IMODE(existing_state.st_mode) != 0o600)):
            raise Refusal("tab-role state lock must be an owned non-symlink mode-0600 file")
        descriptor = os.open(path, flags, 0o600)
        descriptor_state = os.fstat(descriptor)
        path_state = path.lstat()
        if (not stat.S_ISREG(descriptor_state.st_mode)
                or stat.S_ISLNK(path_state.st_mode)
                or descriptor_state.st_uid != os.getuid()
                or path_state.st_uid != os.getuid()
                or stat.S_IMODE(descriptor_state.st_mode) != 0o600
                or stat.S_IMODE(path_state.st_mode) != 0o600
                or (descriptor_state.st_dev, descriptor_state.st_ino)
                != (path_state.st_dev, path_state.st_ino)):
            raise Refusal("tab-role state lock must be an owned non-symlink mode-0600 file")
        operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
        try:
            fcntl.flock(descriptor, operation | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno in (errno.EACCES, errno.EAGAIN):
                raise Refusal("tab-role state lock is contended") from error
            raise Refusal("tab-role state locking is unavailable") from error
        acquired = True
        yield
    except Refusal:
        raise
    except OSError as error:
        raise Refusal("tab-role state lock is unavailable") from error
    finally:
        if descriptor is not None:
            unlock_error = None
            if acquired:
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_UN)
                except OSError as error:
                    unlock_error = error
            try:
                os.close(descriptor)
            except OSError as error:
                if unlock_error is None:
                    unlock_error = error
            if unlock_error is not None and sys.exc_info()[0] is None:
                raise Refusal("tab-role state lock could not be released") from unlock_error


def _read_record_unlocked(root: Path, workspace: str, tab: str) -> dict[str, Any] | None:
    path = record_path(root, workspace, tab)
    try:
        state = path.lstat()
    except FileNotFoundError:
        return None
    except OSError as error:
        raise Refusal("tab-role record is inaccessible") from error
    if (not stat.S_ISREG(state.st_mode) or stat.S_ISLNK(state.st_mode)
            or state.st_uid != os.getuid() or stat.S_IMODE(state.st_mode) != 0o600):
        raise Refusal("tab-role record must be an owned non-symlink mode-0600 file")
    try:
        return validate_record(strict_json(path.read_bytes(), "tab-role record"), workspace, tab)
    except OSError as error:
        raise Refusal("tab-role record cannot be read") from error


def read_record(root: Path, workspace: str, tab: str) -> dict[str, Any] | None:
    with state_lock(root, exclusive=False):
        return _read_record_unlocked(root, workspace, tab)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _bind_record_unlocked(root: Path, workspace: str, tab: str, role: str) -> dict[str, Any]:
    if role not in ROLES:
        raise Refusal("role tag must be architect, coordinator, or change_owner")
    existing = _read_record_unlocked(root, workspace, tab)
    if existing is not None:
        if existing["role"] != role:
            raise Refusal("tab already has a different named role tag; unbind it explicitly first")
        return existing
    value = {"schema": SCHEMA, "version": 1, **identity(workspace, tab), "role": role}
    target = record_path(root, workspace, tab)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except OSError as error:
        raise Refusal("tab-role record staging path is unavailable") from error
    try:
        try:
            os.write(descriptor, canonical_json(value))
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.link(temporary, target)
        os.chmod(target, 0o600, follow_symlinks=False)
        fsync_directory(root)
    except FileExistsError as error:
        raise Refusal("tab role was concurrently bound; inspect before retrying") from error
    except OSError as error:
        raise Refusal("tab-role record could not be written") from error
    finally:
        temporary.unlink(missing_ok=True)
    return value


def bind_record(root: Path, workspace: str, tab: str, role: str) -> dict[str, Any]:
    with state_lock(root, exclusive=True):
        return _bind_record_unlocked(root, workspace, tab, role)


def _unbind_record_unlocked(root: Path, workspace: str, tab: str) -> dict[str, Any] | None:
    existing = _read_record_unlocked(root, workspace, tab)
    if existing is None:
        return None
    path = record_path(root, workspace, tab)
    try:
        path.unlink()
        fsync_directory(root)
    except OSError as error:
        raise Refusal("tab-role record could not be removed") from error
    return existing


def unbind_record(root: Path, workspace: str, tab: str) -> dict[str, Any] | None:
    with state_lock(root, exclusive=True):
        return _unbind_record_unlocked(root, workspace, tab)


def result_object(document: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    result = document.get("result")
    value = result.get(key) if isinstance(result, dict) else None
    if not isinstance(value, dict):
        raise Refusal(f"{label} has no exact result.{key} object")
    return value


def result_array(document: dict[str, Any], key: str, label: str) -> list[Any]:
    result = document.get("result")
    value = result.get(key) if isinstance(result, dict) else None
    if not isinstance(value, list):
        raise Refusal(f"{label} has no exact result.{key} array")
    return value


def bounded_herdr_diagnostic(raw: bytes) -> str:
    clipped = raw[:MAX_HERDR_DIAGNOSTIC]
    detail = clipped.decode("utf-8", errors="replace").strip()
    if len(raw) > len(clipped):
        detail = f"{detail} [truncated]" if detail else "[truncated]"
    return detail


def _close_process_streams(process: subprocess.Popen[bytes]) -> BaseException | None:
    close_error = None
    for stream in (process.stdout, process.stderr):
        if stream is not None and not stream.closed:
            try:
                stream.close()
            except (OSError, ValueError) as error:
                if close_error is None:
                    close_error = error
    return close_error


def _terminate_and_reap(process: subprocess.Popen[bytes]) -> None:
    try:
        returncode = process.poll()
    except OSError as error:
        raise _CaptureFailure("reap", error) from error
    if returncode is not None:
        return
    try:
        process.terminate()
    except OSError:
        pass
    try:
        process.wait(timeout=HERDR_REAP_SECONDS)
        return
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        process.kill()
    except OSError:
        pass
    try:
        process.wait(timeout=HERDR_REAP_SECONDS)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise _CaptureFailure("reap", error) from error
    if process.returncode is None:
        raise _CaptureFailure("reap")


def _bounded_capture(command: list[str]) -> tuple[int, bytes, bytes]:
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            close_fds=True,
        )
    except (OSError, ValueError) as error:
        raise _CaptureFailure("spawn", error) from error

    selector = None
    failure: _CaptureFailure | None = None
    result: tuple[int, bytes, bytes] | None = None
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    try:
        stdout = process.stdout
        stderr = process.stderr
        if stdout is None or stderr is None:
            raise _CaptureFailure("drain")
        selector = selectors.DefaultSelector()
        streams: dict[int, IO[bytes]] = {}
        for name, stream in (("stdout", stdout), ("stderr", stderr)):
            descriptor = stream.fileno()
            os.set_blocking(descriptor, False)
            streams[descriptor] = stream
            selector.register(stream, selectors.EVENT_READ, name)
        deadline = time.monotonic() + HERDR_TIMEOUT_SECONDS
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise _CaptureFailure("timeout")
            try:
                events = selector.select(remaining)
            except (OSError, ValueError) as error:
                raise _CaptureFailure("drain", error) from error
            if not events:
                if time.monotonic() >= deadline:
                    raise _CaptureFailure("timeout")
                continue
            for key, _ in events:
                name = key.data
                retained = buffers[name]
                allowance = MAX_JSON + 1 - len(retained)
                if allowance <= 0:
                    raise _CaptureFailure("overflow")
                try:
                    chunk = os.read(key.fd, min(64 * 1024, allowance))
                except BlockingIOError:
                    continue
                except OSError as error:
                    raise _CaptureFailure("drain", error) from error
                if chunk:
                    retained.extend(chunk)
                    if len(retained) > MAX_JSON:
                        raise _CaptureFailure("overflow")
                else:
                    stream = streams[key.fd]
                    selector.unregister(stream)
                    stream.close()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise _CaptureFailure("timeout")
        try:
            returncode = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired as error:
            raise _CaptureFailure("timeout", error) from error
        except OSError as error:
            raise _CaptureFailure("reap", error) from error
        result = (returncode, bytes(buffers["stdout"]), bytes(buffers["stderr"]))
    except _CaptureFailure as error:
        failure = error
    except (OSError, ValueError) as error:
        failure = _CaptureFailure("drain", error)
    finally:
        if selector is not None:
            try:
                selector.close()
            except (OSError, ValueError) as error:
                if failure is None:
                    failure = _CaptureFailure("drain", error)
        if failure is not None or result is None:
            try:
                _terminate_and_reap(process)
            except _CaptureFailure as error:
                failure = error
        close_error = _close_process_streams(process)
        if close_error is not None and failure is None:
            failure = _CaptureFailure("drain", close_error)
    if failure is not None:
        raise failure from failure.cause
    if result is None:
        raise _CaptureFailure("reap")
    return result


def default_call(argv: list[str]) -> dict[str, Any]:
    configured = os.environ.get("QQ_HERDR_BIN")
    try:
        executable = configured or shutil.which("herdr")
    except (OSError, TypeError, ValueError) as error:
        raise Refusal("Herdr is unavailable") from error
    if not executable:
        raise Refusal("Herdr is unavailable")
    if configured:
        try:
            configured_ok = (os.path.isabs(configured) and os.path.isfile(configured)
                             and os.access(configured, os.X_OK))
        except (OSError, TypeError, ValueError):
            configured_ok = False
        if not configured_ok:
            raise Refusal("QQ_HERDR_BIN must be one absolute executable file")
    operation = " ".join(argv[:2])
    try:
        returncode, stdout, stderr = _bounded_capture([executable, *argv])
    except _CaptureFailure as error:
        if error.reason == "overflow":
            raise Refusal(f"Herdr inspection output exceeds its size bound for {operation}") from error
        raise Refusal(f"Herdr inspection failed for {operation}") from error
    if returncode != 0:
        detail = bounded_herdr_diagnostic(stderr)
        raise Refusal(f"Herdr inspection failed for {operation}: {detail or returncode}")
    if stderr:
        detail = bounded_herdr_diagnostic(stderr)
        raise Refusal(f"Herdr inspection returned stderr for {operation}: {detail}")
    return strict_json(stdout, f"Herdr {operation} output")


def tab_evidence(call: Callable[[list[str]], dict[str, Any]], workspace: str, tab: str) -> dict[str, Any]:
    wanted = identity(workspace, tab)
    value = result_object(call(["tab", "get", tab]), "tab", "Herdr tab evidence")
    if (require_identifier(value.get("tab_id"), "Herdr tab identity") != wanted["tab_id"]
            or require_identifier(value.get("workspace_id"), "Herdr tab workspace") != wanted["workspace_id"]):
        raise Refusal("Herdr returned a mismatched tab resource identity")
    return value


def pane_evidence(call: Callable[[list[str]], dict[str, Any]], pane: str) -> dict[str, str]:
    wanted = require_identifier(pane, "pane identity")
    value = result_object(call(["pane", "get", wanted]), "pane", "Herdr pane evidence")
    if require_identifier(value.get("pane_id"), "Herdr pane identity") != wanted:
        raise Refusal("Herdr returned a mismatched pane resource identity")
    return {
        "pane_id": wanted,
        "workspace_id": require_identifier(value.get("workspace_id"), "Herdr pane workspace"),
        "tab_id": require_identifier(value.get("tab_id"), "Herdr pane tab"),
    }


def process_is_board(process: Any) -> bool:
    if not isinstance(process, dict):
        raise Refusal("Herdr foreground-process evidence is malformed")
    argv = process.get("argv")
    if argv is None:
        return False
    if not isinstance(argv, list) or any(not isinstance(item, str) or "\x00" in item for item in argv):
        raise Refusal("Herdr foreground-process argv evidence is malformed")
    if len(argv) < 2 or argv[-1] != "board":
        return False
    return os.path.basename(argv[-2]) == "backlog"


def classify_board(call: Callable[[list[str]], dict[str, Any]], workspace: str, tab: str) -> bool:
    rows = result_array(call(["pane", "list", "--workspace", workspace]), "panes", "Herdr pane-list evidence")
    seen: set[str] = set()
    tab_panes: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            raise Refusal("Herdr pane-list row is malformed")
        pane = require_identifier(row.get("pane_id"), "Herdr listed pane identity")
        row_workspace = require_identifier(row.get("workspace_id"), "Herdr listed pane workspace")
        row_tab = require_identifier(row.get("tab_id"), "Herdr listed pane tab")
        if pane in seen or row_workspace != workspace:
            raise Refusal("Herdr pane-list resource identities are duplicated or mismatched")
        seen.add(pane)
        if row_tab == tab:
            tab_panes.append(pane)
    if not tab_panes:
        raise Refusal("tab has no pane in current Herdr evidence")
    board_panes = []
    for pane in tab_panes:
        info = result_object(call(["pane", "process-info", "--pane", pane]), "process_info", "Herdr process evidence")
        processes = info.get("foreground_processes")
        if not isinstance(processes, list):
            raise Refusal("Herdr process evidence has no foreground_processes array")
        if any(process_is_board(process) for process in processes):
            board_panes.append(pane)
    if board_panes and (len(tab_panes) != 1 or board_panes != tab_panes):
        raise Refusal("Backlog-board process evidence collides with an interactive tab")
    return len(tab_panes) == 1 and board_panes == tab_panes


def resolve_pane(pane: str, root: Path, call: Callable[[list[str]], dict[str, Any]] = default_call) -> dict[str, Any]:
    with state_lock(root, exclusive=False):
        first = pane_evidence(call, pane)
        tab_evidence(call, first["workspace_id"], first["tab_id"])
        board = classify_board(call, first["workspace_id"], first["tab_id"])
        tag = _read_record_unlocked(root, first["workspace_id"], first["tab_id"])
        second = pane_evidence(call, pane)
        if second != first:
            raise Refusal("pane tab membership changed during session-start role resolution; retry the fresh launch")
        final_board = classify_board(call, first["workspace_id"], first["tab_id"])
        final_tag = _read_record_unlocked(root, first["workspace_id"], first["tab_id"])
        if final_board != board:
            raise Refusal("display-only process classification changed during session-start role resolution")
        if final_tag != tag:
            raise Refusal("tab role tag changed during session-start role resolution")
        if board:
            if tag is not None:
                raise Refusal("display-only Backlog-board tab carries an illegal role tag")
            role = None
        else:
            role = tag["role"] if tag is not None else "runner"
        return {
            "schema": SCHEMA,
            "version": 1,
            "pane_id": first["pane_id"],
            "workspace_id": first["workspace_id"],
            "tab_id": first["tab_id"],
            "display_only": board,
            "role": role,
            "stored_tag": tag["role"] if tag is not None else None,
        }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="qq-tab-role")
    result.add_argument("action", choices=("bind", "inspect", "unbind"))
    result.add_argument("--workspace")
    result.add_argument("--tab")
    result.add_argument("--pane")
    result.add_argument("--role")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        root = state_root()
        if args.action == "inspect":
            if args.pane is None or any(value is not None for value in (args.workspace, args.tab, args.role)):
                raise Refusal("inspect requires exactly --pane")
            value = resolve_pane(args.pane, root)
        else:
            if args.workspace is None or args.tab is None or args.pane is not None:
                raise Refusal(f"{args.action} requires exact --workspace and --tab identities")
            role = args.role
            if args.action == "bind":
                if not isinstance(role, str):
                    raise Refusal("bind requires --role")
            elif role is not None:
                raise Refusal("unbind does not accept --role")
            with state_lock(root, exclusive=True):
                tab_evidence(default_call, args.workspace, args.tab)
                if isinstance(role, str):
                    if classify_board(default_call, args.workspace, args.tab):
                        raise Refusal("display-only Backlog-board tab cannot carry a role tag")
                    value = _bind_record_unlocked(root, args.workspace, args.tab, role)
                else:
                    value = _unbind_record_unlocked(root, args.workspace, args.tab)
        print(json.dumps({"ok": True, "schema": SCHEMA, "result": value}, sort_keys=True, separators=(",", ":")))
        return 0
    except Refusal as error:
        print(json.dumps({"ok": False, "schema": SCHEMA, "error": {"code": "refused", "message": str(error)}}, sort_keys=True, separators=(",", ":")))
        return 66


if __name__ == "__main__":
    raise SystemExit(main())
