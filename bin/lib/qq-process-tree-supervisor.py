#!/usr/bin/env python3
"""Bounded Linux descendant cleanup for one Landstrip child tree."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import NoReturn


PR_SET_CHILD_SUBREAPER = 36
TERM_GRACE_SECONDS = 0.75
KILL_GRACE_SECONDS = 0.75


def fail(message: str) -> NoReturn:
    print(f"[qq-dispatch] process-tree supervisor: {message}", file=sys.stderr)
    raise SystemExit(125)


def enable_subreaper() -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        error_number = ctypes.get_errno()
        fail(f"PR_SET_CHILD_SUBREAPER failed: {os.strerror(error_number)}")


def process_parents() -> dict[int, int]:
    parents: dict[int, int] = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text(encoding="utf-8")
            close = stat.rfind(")")
            fields = stat[close + 2 :].split()
            parents[int(entry.name)] = int(fields[1])
        except (FileNotFoundError, PermissionError, ProcessLookupError, ValueError, IndexError):
            continue
    return parents


def descendants(root_pid: int) -> list[int]:
    parents = process_parents()
    found: set[int] = set()
    changed = True
    while changed:
        changed = False
        for pid, parent_pid in parents.items():
            if pid == root_pid or pid in found:
                continue
            if parent_pid == root_pid or parent_pid in found:
                found.add(pid)
                changed = True
    return sorted(found, reverse=True)


def signal_descendants(root_pid: int, signal_number: int) -> None:
    for pid in descendants(root_pid):
        try:
            os.kill(pid, signal_number)
        except ProcessLookupError:
            continue
        except PermissionError as error:
            fail(f"cannot signal owned descendant {pid}: {error}")


def reap_children() -> None:
    while True:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        if pid == 0:
            return


def wait_until_empty(root_pid: int, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        reap_children()
        if not descendants(root_pid):
            return True
        time.sleep(0.02)
    reap_children()
    return not descendants(root_pid)


def cleanup(root_pid: int, first_signal: int = signal.SIGTERM) -> None:
    signal_descendants(root_pid, first_signal)
    if wait_until_empty(root_pid, TERM_GRACE_SECONDS):
        return
    signal_descendants(root_pid, signal.SIGKILL)
    if not wait_until_empty(root_pid, KILL_GRACE_SECONDS):
        fail("descendants remained after SIGKILL")


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] != "--":
        fail("usage: qq-process-tree-supervisor.py -- command [args ...]")
    enable_subreaper()
    root_pid = os.getpid()
    pending_signal = 0

    def note_signal(signal_number: int, _frame: object) -> None:
        nonlocal pending_signal
        pending_signal = signal_number

    for signal_number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signal_number, note_signal)

    try:
        child = subprocess.Popen(sys.argv[2:])
    except OSError as error:
        fail(f"child launch failed: {error}")

    while True:
        if pending_signal:
            cleanup(root_pid, pending_signal)
            return 128 + pending_signal
        return_code = child.poll()
        if return_code is not None:
            cleanup(root_pid)
            return return_code
        time.sleep(0.02)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
