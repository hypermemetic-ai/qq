#!/usr/bin/env python3
"""Configured Backlog Task identity parsing shared by qq runtime engines."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import sys
from typing import Any, Sequence


_GENERIC_ID_RE = re.compile(
    r"(?P<prefix>[A-Za-z]+)-(?P<parent>[1-9][0-9]*)(?:\.(?P<child>[1-9][0-9]*))?\Z"
)
_PREFIX_LINE_RE = re.compile(r"task_prefix[ \t]*:[ \t]*(.*)\Z")
_PREFIX_LIKE_RE = re.compile(r"[ \t]*task_prefix(?:[ \t]*:|[ \t]+|\Z)")


class TaskIdentityError(ValueError):
    """Configured prefix or Task identity is missing, ambiguous, or malformed."""


@dataclass(frozen=True)
class TaskIdentity:
    configured_prefix: str
    display_prefix: str
    token_prefix: str
    display_id: str
    token: str
    parent_number: int
    child_number: int | None

    @property
    def ordering_key(self) -> tuple[int, int, int]:
        return (
            self.parent_number,
            0 if self.child_number is None else 1,
            self.child_number or 0,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "configured_prefix": self.configured_prefix,
            "display_prefix": self.display_prefix,
            "token_prefix": self.token_prefix,
            "display_id": self.display_id,
            "token": self.token,
            "parent_number": self.parent_number,
            "child_number": self.child_number,
            "ordering_key": list(self.ordering_key),
        }


@dataclass(frozen=True)
class GenericTaskIdentity:
    prefix: str
    parent_number: int
    child_number: int | None

    @property
    def ordering_key(self) -> tuple[str, int, int, int]:
        return (
            self.prefix.upper(),
            self.parent_number,
            0 if self.child_number is None else 1,
            self.child_number or 0,
        )


class TaskIdentityConfig:
    def __init__(self, configured_prefix: str):
        if not re.fullmatch(r"[A-Za-z]+", configured_prefix):
            raise TaskIdentityError("Backlog task_prefix must contain ASCII letters only.")
        self.configured_prefix = configured_prefix
        self.display_prefix = configured_prefix.upper()
        self.token_prefix = configured_prefix.lower()

    @classmethod
    def from_repository(cls, repository: str | Path) -> "TaskIdentityConfig":
        root = Path(repository)
        config = root / "backlog" / "config.yml"
        try:
            raw = config.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise TaskIdentityError("Backlog config.yml is missing or unreadable UTF-8.") from error
        if "\x00" in raw:
            raise TaskIdentityError("Backlog config.yml contains a NUL byte.")

        candidates: list[str] = []
        for line in raw.splitlines():
            stripped = line.lstrip()
            if not stripped or stripped.startswith("#"):
                continue
            match = _PREFIX_LINE_RE.fullmatch(line)
            if match:
                candidates.append(match.group(1))
            elif _PREFIX_LIKE_RE.match(line):
                raise TaskIdentityError(
                    "Backlog task_prefix must be one unambiguous top-level scalar."
                )
        if len(candidates) != 1:
            reason = "missing" if not candidates else "duplicated"
            raise TaskIdentityError(f"Backlog task_prefix is {reason}.")
        return cls(_decode_prefix(candidates[0]))

    def parse_display(self, value: str) -> TaskIdentity:
        generic = parse_generic_task_id(value)
        if generic.prefix != self.display_prefix:
            raise TaskIdentityError(
                "Task ID prefix does not match the Repository's configured Backlog prefix."
            )
        suffix = str(generic.parent_number)
        if generic.child_number is not None:
            suffix += f".{generic.child_number}"
        return TaskIdentity(
            configured_prefix=self.configured_prefix,
            display_prefix=self.display_prefix,
            token_prefix=self.token_prefix,
            display_id=f"{self.display_prefix}-{suffix}",
            token=f"{self.token_prefix}-{suffix}",
            parent_number=generic.parent_number,
            child_number=generic.child_number,
        )

    def parse_token(self, value: str) -> TaskIdentity:
        generic = parse_generic_task_id(value)
        if generic.prefix != self.token_prefix:
            raise TaskIdentityError(
                "Task token prefix does not match the Repository's configured Backlog prefix."
            )
        display = f"{self.display_prefix}-{generic.parent_number}"
        if generic.child_number is not None:
            display += f".{generic.child_number}"
        return self.parse_display(display)

    def parse_filename(self, filename: str) -> TaskIdentity:
        if not isinstance(filename, str) or "/" in filename or "\\" in filename:
            raise TaskIdentityError("Task filename is malformed.")
        match = re.fullmatch(
            r"([a-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?)(?:[ -].*)?\.md",
            filename,
        )
        if match is None:
            raise TaskIdentityError(
                "Task filename does not expose a canonical parent or direct-child token."
            )
        return self.parse_token(match.group(1))

    def parse_branch(self, branch: str) -> TaskIdentity | None:
        if not isinstance(branch, str):
            return None
        match = re.fullmatch(
            r"[^/]+/([a-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?)-[^/]+",
            branch,
        )
        if match is None:
            return None
        try:
            return self.parse_token(match.group(1))
        except TaskIdentityError:
            return None

    def as_dict(self) -> dict[str, str]:
        return {
            "configured_prefix": self.configured_prefix,
            "display_prefix": self.display_prefix,
            "token_prefix": self.token_prefix,
        }


def _decode_prefix(raw: str) -> str:
    value = raw.strip()
    match = re.fullmatch(r"([A-Za-z]+)(?:[ \t]+#.*)?", value)
    if match is not None:
        return match.group(1)
    match = re.fullmatch(r"\"([A-Za-z]+)\"(?:[ \t]+#.*)?", value)
    if match is not None:
        return match.group(1)
    match = re.fullmatch(r"'([A-Za-z]+)'(?:[ \t]+#.*)?", value)
    if match is not None:
        return match.group(1)
    raise TaskIdentityError(
        "Backlog task_prefix must be one plain or quoted ASCII letters-only scalar."
    )


def parse_generic_task_id(value: str) -> GenericTaskIdentity:
    if not isinstance(value, str):
        raise TaskIdentityError("Task ID must be text.")
    match = _GENERIC_ID_RE.fullmatch(value)
    if match is None:
        raise TaskIdentityError(
            "Task ID must be one letters-prefix parent or direct-child identity."
        )
    child = match.group("child")
    try:
        return GenericTaskIdentity(
            prefix=match.group("prefix"),
            parent_number=int(match.group("parent")),
            child_number=int(child) if child is not None else None,
        )
    except ValueError as error:
        raise TaskIdentityError("Task ID numeric segment is too large.") from error


def is_generic_task_id(value: Any) -> bool:
    try:
        parse_generic_task_id(value)
    except TaskIdentityError:
        return False
    return True


def generic_task_ordering_key(value: str) -> tuple[str, int, int, int]:
    return parse_generic_task_id(value).ordering_key


def task_artifact_filename(value: str) -> str:
    parse_generic_task_id(value)
    return f"{value}.json"


def _emit(value: dict[str, Any]) -> int:
    print(json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True))
    return 0


def _main(argv: Sequence[str]) -> int:
    if len(argv) < 3 or argv[1] != "--repo":
        raise TaskIdentityError(
            "usage: qq_task_identity.py config|id|filename|branch|filenames|branches "
            "--repo ROOT [VALUE ...]"
        )
    action, repository = argv[0], argv[2]
    config = TaskIdentityConfig.from_repository(repository)
    if action == "config" and len(argv) == 3:
        return _emit(config.as_dict())
    if action == "id" and len(argv) == 4:
        return _emit(config.parse_display(argv[3]).as_dict())
    if action == "filename" and len(argv) == 4:
        return _emit(config.parse_filename(argv[3]).as_dict())
    if action == "branch" and len(argv) == 4:
        identity = config.parse_branch(argv[3])
        return 3 if identity is None else _emit(identity.as_dict())
    if action == "filenames" and len(argv) >= 3:
        return _emit({
            "identities": [
                {"input": value, **config.parse_filename(value).as_dict()}
                for value in argv[3:]
            ]
        })
    if action == "branches" and len(argv) >= 3:
        identities = []
        for value in argv[3:]:
            identity = config.parse_branch(value)
            if identity is not None:
                identities.append({"input": value, **identity.as_dict()})
        return _emit({"identities": identities})
    raise TaskIdentityError(
        "usage: qq_task_identity.py config|id|filename|branch|filenames|branches "
        "--repo ROOT [VALUE ...]"
    )


if __name__ == "__main__":
    try:
        raise SystemExit(_main(sys.argv[1:]))
    except TaskIdentityError as error:
        print(f"qq-task-identity: {error}", file=sys.stderr)
        raise SystemExit(65)
