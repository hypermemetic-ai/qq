#!/usr/bin/env python3
"""External, pane-fenced accountable Actor binding and recovery primitives.

This module owns only mechanics.  Owning role policies decide whether an
unavailable-pane recovery is authorized and must supply that testimony.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from typing import Any

from qq_product_discovery import ProductDiscoveryError, discover_products

SCHEMA = "qq.actor-binding/v1"
ROLES = frozenset(("architect", "coordinator", "change_owner"))
PANE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9:_-]{0,63}\Z")
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}\Z")


class Refusal(Exception):
    pass


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def require_token(value: str, label: str, *, pane: bool = False) -> str:
    matcher = PANE_RE if pane else TOKEN_RE
    if not isinstance(value, str) or matcher.fullmatch(value) is None:
        raise Refusal(f"{label} is malformed")
    return value


def identity(product: str, role: str, change: str | None) -> dict[str, Any]:
    require_token(product, "Product identity")
    if role not in ROLES:
        raise Refusal("accountable role must be architect, coordinator, or change_owner")
    if role == "change_owner":
        if change is None:
            raise Refusal("change_owner binding requires one Change identity")
        require_token(change, "Change identity")
    elif change is not None:
        raise Refusal(f"{role} binding cannot carry a Change identity")
    return {"product": product, "role": role, "change": change}


def binding_root(explicit: str | None = None, *, create: bool = True) -> Path:
    if explicit:
        root = Path(explicit)
    else:
        state = os.environ.get("XDG_STATE_HOME")
        if not state:
            home = os.environ.get("HOME")
            if not home:
                raise Refusal("XDG state home is unavailable")
            state = os.path.join(home, ".local", "state")
        root = Path(state) / "qq" / "actor-bindings"
    if not root.is_absolute() or os.path.normpath(os.fspath(root)) != os.fspath(root):
        raise Refusal("binding root must be one canonical absolute path")
    if create:
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
    current = Path(root.anchor)
    for part in root.parts[1:]:
        current /= part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError:
            if not create:
                return root
            raise
        if stat.S_ISLNK(mode):
            raise Refusal(f"binding namespace has symlink ambiguity at {current}")
    mode = root.lstat().st_mode
    if stat.S_ISDIR(mode) is False or root.resolve(strict=True) != root or stat.S_IMODE(mode) != 0o700:
        raise Refusal("binding root must be a canonical non-symlink directory with mode 0700")
    return root


def record_path(root: Path, actor: dict[str, Any]) -> Path:
    digest = hashlib.sha256(canonical_json(actor)).hexdigest()
    return root / f"{digest}.json"


def validate_source(source: Any, label: str) -> dict[str, str]:
    keys = {"role_source_fingerprint", "source_fingerprint", "operation_cursor"}
    if not isinstance(source, dict) or set(source) != keys:
        raise Refusal(f"{label} source fence has an invalid shape")
    return {key: require_token(source[key], f"{label} {key}") for key in sorted(keys)}


def validate_endpoint(value: Any, label: str, *, candidate: bool) -> dict[str, Any]:
    expected = {
        "pane_id", "source", "read_only", "acknowledged", "mutated",
        "runtime_active", "activation_nonce",
    }
    if candidate:
        expected |= {"expected_current_pane_id", "phase"}
    if not isinstance(value, dict) or set(value) != expected:
        raise Refusal(f"{label} endpoint has an invalid shape")
    pane = require_token(value["pane_id"], f"{label} pane ID", pane=True)
    if any(type(value[key]) is not bool for key in ("read_only", "acknowledged", "mutated", "runtime_active")):
        raise Refusal(f"{label} endpoint flags are malformed")
    nonce = value["activation_nonce"]
    if nonce is not None:
        nonce = require_token(nonce, f"{label} activation nonce")
    if value["runtime_active"] and nonce is not None:
        raise Refusal(f"{label} active runtime cannot retain an activation nonce")
    result = {
        "pane_id": pane,
        "source": validate_source(value["source"], label),
        "read_only": value["read_only"],
        "acknowledged": value["acknowledged"],
        "mutated": value["mutated"],
        "runtime_active": value["runtime_active"],
        "activation_nonce": nonce,
    }
    if candidate:
        result["expected_current_pane_id"] = require_token(value["expected_current_pane_id"], f"{label} expected pane", pane=True)
        if value["phase"] not in ("candidate", "cleanup", "predecessor"):
            raise Refusal(f"{label} phase is malformed")
        result["phase"] = value["phase"]
    return result


def validate_record(value: Any, actor: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"schema", "version", "identity", "current", "candidate"}:
        raise Refusal("binding record has an invalid shape")
    if value["schema"] != SCHEMA or value["version"] != 1 or value["identity"] != actor:
        raise Refusal("binding record schema or identity does not match")
    current = validate_endpoint(value["current"], "current", candidate=False)
    candidate = None if value["candidate"] is None else validate_endpoint(value["candidate"], "candidate", candidate=True)
    if candidate and candidate["pane_id"] == current["pane_id"]:
        raise Refusal("current and candidate pane IDs must be unique")
    return {"schema": SCHEMA, "version": 1, "identity": actor, "current": current, "candidate": candidate}


def read_record(path: Path, actor: dict[str, Any]) -> dict[str, Any]:
    try:
        mode = path.lstat().st_mode
        if not stat.S_ISREG(mode) or stat.S_ISLNK(mode) or stat.S_IMODE(mode) != 0o600:
            raise Refusal("binding record must be a non-symlink regular file with mode 0600")
        raw = path.read_bytes()
        if len(raw) > 32 * 1024:
            raise Refusal("binding record exceeds 32 KiB")
        return validate_record(json.loads(raw.decode("utf-8")), actor)
    except FileNotFoundError as error:
        raise Refusal("binding record does not exist") from error
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Refusal("binding record is not strict UTF-8 JSON") from error


def fsync_directory(root: Path) -> None:
    descriptor = os.open(root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def publish(path: Path, value: dict[str, Any], *, create: bool = False) -> None:
    data = canonical_json(value)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.write(descriptor, data)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        if create:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        os.chmod(path, 0o600, follow_symlinks=False)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


class LockedRecord:
    def __init__(self, root: Path, actor: dict[str, Any]):
        self.root, self.actor = root, actor
        self.path = record_path(root, actor)
        # One namespace lock makes cross-record pane uniqueness and each
        # record's compare-and-swap one atomic transaction.
        self.lock_path = root / ".namespace.lock"
        self.descriptor = -1

    def __enter__(self):
        self.descriptor = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        lock_mode = os.fstat(self.descriptor).st_mode
        if not stat.S_ISREG(lock_mode) or stat.S_IMODE(lock_mode) != 0o600:
            os.close(self.descriptor); self.descriptor = -1
            raise Refusal("binding namespace lock is unsafe")
        fcntl.flock(self.descriptor, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_args):
        fcntl.flock(self.descriptor, fcntl.LOCK_UN)
        os.close(self.descriptor)

    def read(self):
        return read_record(self.path, self.actor)

    def write(self, value, *, create=False):
        publish(self.path, validate_record(value, self.actor), create=create)


def endpoint(pane: str, source: dict[str, str], *, read_only: bool, runtime_active: bool) -> dict[str, Any]:
    return {
        "pane_id": require_token(pane, "pane ID", pane=True),
        "source": validate_source(source, "endpoint"),
        "read_only": read_only,
        "acknowledged": False,
        "mutated": False,
        "runtime_active": runtime_active,
        "activation_nonce": None,
    }


def require_namespace_unique(root: Path, actor: dict[str, Any], pane: str) -> None:
    for path in root.glob("*.json"):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw_identity = raw.get("identity") if isinstance(raw, dict) else None
            if not isinstance(raw_identity, dict) or set(raw_identity) != {"product", "role", "change"}:
                raise Refusal(f"binding namespace contains an ambiguous record: {path.name}")
            other_actor = identity(raw_identity["product"], raw_identity["role"], raw_identity["change"])
            validated = read_record(path, other_actor)
        except (OSError, UnicodeError, json.JSONDecodeError, TypeError, KeyError) as error:
            raise Refusal(f"binding namespace contains an unreadable record: {path.name}") from error
        for endpoint_value in (validated["current"], validated["candidate"]):
            if isinstance(endpoint_value, dict) and endpoint_value.get("pane_id") == pane and other_actor != actor:
                raise Refusal("pane ID is already owned by another accountable binding")


def create(root, actor, pane, source):
    with LockedRecord(root, actor) as locked:
        require_namespace_unique(root, actor, pane)
        value = {"schema": SCHEMA, "version": 1, "identity": actor, "current": endpoint(pane, source, read_only=False, runtime_active=True), "candidate": None}
        try:
            locked.write(value, create=True)
        except FileExistsError as error:
            raise Refusal("binding already exists") from error
        return value


def create_candidate(root, actor, expected, pane, source):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        if value["current"]["pane_id"] != expected:
            raise Refusal(f"candidate CAS refused: current pane is {value['current']['pane_id']!r}, expected {expected!r}")
        if value["candidate"] is not None:
            raise Refusal("candidate CAS refused: one temporary candidate already exists")
        require_namespace_unique(root, actor, pane)
        candidate = endpoint(pane, source, read_only=True, runtime_active=False)
        if candidate["pane_id"] == expected:
            raise Refusal("pane reuse is forbidden")
        candidate.update({"expected_current_pane_id": expected, "phase": "candidate"})
        value["candidate"] = candidate
        locked.write(value)
        return value


def ready(root, actor, expected, pane, source):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        candidate = value["candidate"]
        if value["current"]["pane_id"] != expected or candidate is None or candidate["phase"] != "candidate" or candidate["pane_id"] != pane:
            raise Refusal("readiness acknowledgement does not match the exact current/candidate pair")
        supplied = validate_source(source, "readiness")
        if candidate["source"] != supplied or value["current"]["source"] != supplied:
            raise Refusal("readiness expected-current/candidate source fingerprints/cursor changed")
        if candidate["acknowledged"] or candidate["mutated"] or candidate["runtime_active"] or not candidate["read_only"]:
            raise Refusal("candidate readiness activity/read-only facts changed")
        if not value["current"]["runtime_active"] or value["current"]["read_only"]:
            raise Refusal("expected-current runtime authority changed")
        candidate["acknowledged"] = True
        locked.write(value)
        return value


def swap(root, actor, expected, pane, activation_nonce):
    nonce = require_token(activation_nonce, "activation nonce")
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        old = value["current"]
        candidate = value["candidate"]
        if old["pane_id"] != expected or candidate is None or candidate["phase"] != "candidate" or candidate["pane_id"] != pane:
            raise Refusal("swap CAS does not match the exact current/candidate pair")
        if not candidate["acknowledged"] or candidate["mutated"] or not candidate["read_only"] or candidate["runtime_active"]:
            raise Refusal("candidate is not conflict-free, acknowledged, and mechanically read-only")
        value["current"] = {
            **candidate,
            "read_only": True,
            "acknowledged": False,
            "runtime_active": False,
            "activation_nonce": nonce,
        }
        value["current"].pop("expected_current_pane_id")
        value["current"].pop("phase")
        value["candidate"] = {
            **old,
            "read_only": True,
            "runtime_active": False,
            "activation_nonce": None,
            "expected_current_pane_id": pane,
            "phase": "predecessor",
        }
        locked.write(value)
        return value


def runtime_activate(root, actor, pane, source, activation_nonce):
    nonce = require_token(activation_nonce, "activation nonce")
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        current, predecessor = value["current"], value["candidate"]
        if current["pane_id"] != pane or current["source"] != validate_source(source, "activation"):
            raise Refusal("runtime activation pane/source fence changed")
        if current["runtime_active"] or not current["read_only"] or current["activation_nonce"] != nonce:
            raise Refusal("runtime activation nonce or phase does not match")
        if predecessor is None or predecessor["phase"] != "predecessor" or predecessor["expected_current_pane_id"] != pane:
            raise Refusal("runtime activation has no exact predecessor fence")
        current["runtime_active"] = True
        current["read_only"] = False
        current["activation_nonce"] = None
        locked.write(value)
        return value


def finalize(root, actor, pane):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        current, predecessor = value["current"], value["candidate"]
        if current["pane_id"] != pane or not current["runtime_active"] or current["read_only"]:
            raise Refusal("finalization requires the exact active current runtime")
        if predecessor is None or predecessor["phase"] != "predecessor" or predecessor["expected_current_pane_id"] != pane:
            raise Refusal("finalization has no exact predecessor fence")
        value["candidate"] = None
        locked.write(value)
        return value


def reverse(root, actor, expected, predecessor, predecessor_live):
    if not predecessor_live:
        raise Refusal("reverse CAS requires exact testimony that the predecessor is still live")
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        current, prior = value["current"], value["candidate"]
        if current["pane_id"] != expected or prior is None or prior["phase"] != "predecessor" or prior["pane_id"] != predecessor:
            raise Refusal("reverse CAS does not match the exact current/predecessor pair")
        if current["mutated"] or current["acknowledged"] or current["runtime_active"]:
            raise Refusal("reverse CAS is forbidden after candidate mutation, acknowledgement, or runtime activation")
        value["current"] = {**prior, "read_only": False, "runtime_active": True, "activation_nonce": None}
        value["current"].pop("expected_current_pane_id")
        value["current"].pop("phase")
        value["candidate"] = None
        locked.write(value)
        return value


def guard(root, actor, pane, source, mutation, acknowledgement):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        current = value["current"]
        if current["pane_id"] != pane:
            raise Refusal(f"stale pane refused: current binding belongs to {current['pane_id']!r}")
        supplied = validate_source(source, "guard")
        facts = {key: {"expected": current["source"][key], "observed": supplied[key]} for key in supplied if supplied[key] != current["source"][key]}
        if facts:
            raise Refusal(f"source/operation fence mismatch: {json.dumps(facts, sort_keys=True, separators=(',', ':'))}")
        if current["read_only"] or not current["runtime_active"]:
            raise Refusal("current endpoint has no active mutating runtime")
        if mutation:
            current["mutated"] = True
        if acknowledgement:
            current["acknowledged"] = True
        if mutation or acknowledgement:
            locked.write(value)
        return value


def cleanup_claim(root, actor, expected_current, candidate_pane):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        candidate = value["candidate"]
        if value["current"]["pane_id"] != expected_current or candidate is None or candidate["phase"] not in ("candidate", "cleanup") or candidate["pane_id"] != candidate_pane or candidate["expected_current_pane_id"] != expected_current:
            raise Refusal("leftover authority is ambiguous; operator judgment is required")
        if candidate["acknowledged"] or candidate["mutated"] or candidate["runtime_active"]:
            raise Refusal("leftover candidate has activity evidence; operator judgment is required")
        candidate["phase"] = "cleanup"
        locked.write(value)
        return value


def cleanup_finalize(root, actor, expected_current, candidate_pane):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        candidate = value["candidate"]
        if value["current"]["pane_id"] != expected_current or candidate is None or candidate["phase"] != "cleanup" or candidate["pane_id"] != candidate_pane or candidate["expected_current_pane_id"] != expected_current:
            raise Refusal("cleanup finalization authority changed")
        if candidate["acknowledged"] or candidate["mutated"] or candidate["runtime_active"]:
            raise Refusal("cleanup finalization observed candidate activity")
        value["candidate"] = None
        locked.write(value)
        return value


def classify(root, actor, pane, source):
    with LockedRecord(root, actor) as locked:
        value = locked.read()
        supplied = validate_source(source, "classification")
        current, candidate = value["current"], value["candidate"]
        if current["pane_id"] == pane:
            state = "current" if current["runtime_active"] and not current["read_only"] else "activating"
            endpoint_value = current
        elif candidate is not None and candidate["pane_id"] == pane:
            state = "candidate" if candidate["phase"] == "candidate" else "stale"
            endpoint_value = candidate
        else:
            state = "unbound"
            endpoint_value = None
        if endpoint_value is not None and endpoint_value["source"] != supplied:
            state = "source_mismatch"
        return {"state": state, "record": value}


def source_args(args) -> dict[str, str]:
    return {"role_source_fingerprint": args.role_source_fingerprint, "source_fingerprint": args.source_fingerprint, "operation_cursor": args.operation_cursor}


def verify_product(repo: str, product: str) -> None:
    try:
        products = discover_products(repo)
    except ProductDiscoveryError as error:
        raise Refusal(f"Product authority unavailable: {error}") from error
    matches = [item for item in products if item.id == product]
    if len(matches) != 1:
        raise Refusal("Product identity does not resolve exactly through qq Product discovery")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="qq-actor-binding")
    result.add_argument("action", choices=("path", "create", "inspect", "classify", "guard", "candidate-create", "candidate-ready", "swap", "runtime-activate", "finalize", "reverse", "cleanup-claim", "cleanup-finalize"))
    result.add_argument("--repo", required=True)
    result.add_argument("--product", required=True)
    result.add_argument("--role", required=True, choices=sorted(ROLES))
    result.add_argument("--change")
    result.add_argument("--pane")
    result.add_argument("--expected-current")
    result.add_argument("--predecessor")
    result.add_argument("--predecessor-live", action="store_true")
    result.add_argument("--activation-nonce")
    result.add_argument("--role-source-fingerprint")
    result.add_argument("--source-fingerprint")
    result.add_argument("--operation-cursor")
    result.add_argument("--mutation", action="store_true")
    result.add_argument("--acknowledgement", action="store_true")
    result.add_argument("--policy-proved-unavailable", action="store_true")
    result.add_argument("--continuation-required", action="store_true")
    result.add_argument("--recovery-reason")
    return result


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    try:
        actor = identity(args.product, args.role, args.change)
        verify_product(args.repo, args.product)
        root = binding_root(create=args.action != "inspect")
        if args.action == "path":
            value: Any = {"path": os.fspath(record_path(root, actor))}
        elif args.action == "inspect":
            value = read_record(record_path(root, actor), actor)
        else:
            if args.pane is None and args.action != "reverse":
                raise Refusal(f"{args.action} requires --pane")
            source: dict[str, str] | None = None
            if args.action in ("create", "classify", "guard", "candidate-create", "candidate-ready", "runtime-activate"):
                if None in (args.role_source_fingerprint, args.source_fingerprint, args.operation_cursor):
                    raise Refusal(f"{args.action} requires all three source fences")
                source = source_args(args)
            if args.action == "create":
                assert source is not None
                value = create(root, actor, args.pane, source)
            elif args.action == "classify":
                assert source is not None
                value = classify(root, actor, args.pane, source)
            elif args.action == "guard":
                assert source is not None
                value = guard(root, actor, args.pane, source, args.mutation, args.acknowledgement)
            elif args.action == "candidate-create":
                if args.expected_current is None: raise Refusal("candidate-create requires --expected-current")
                if not args.policy_proved_unavailable or not args.continuation_required or args.recovery_reason != "unavailable-pane":
                    raise Refusal("recovery candidate requires owning-policy testimony of unavailable-pane and required continuation")
                assert source is not None
                value = create_candidate(root, actor, args.expected_current, args.pane, source)
            elif args.action == "candidate-ready":
                if args.expected_current is None: raise Refusal("candidate-ready requires --expected-current")
                assert source is not None
                value = ready(root, actor, args.expected_current, args.pane, source)
            elif args.action == "swap":
                if args.expected_current is None or args.activation_nonce is None:
                    raise Refusal("swap requires --expected-current and --activation-nonce")
                value = swap(root, actor, args.expected_current, args.pane, args.activation_nonce)
            elif args.action == "runtime-activate":
                if args.activation_nonce is None: raise Refusal("runtime-activate requires --activation-nonce")
                assert source is not None
                value = runtime_activate(root, actor, args.pane, source, args.activation_nonce)
            elif args.action == "finalize": value = finalize(root, actor, args.pane)
            elif args.action == "reverse":
                if None in (args.expected_current, args.predecessor): raise Refusal("reverse requires --expected-current and --predecessor")
                value = reverse(root, actor, args.expected_current, args.predecessor, args.predecessor_live)
            elif args.action == "cleanup-claim":
                if args.expected_current is None: raise Refusal("cleanup-claim requires --expected-current")
                value = cleanup_claim(root, actor, args.expected_current, args.pane)
            elif args.action == "cleanup-finalize":
                if args.expected_current is None: raise Refusal("cleanup-finalize requires --expected-current")
                value = cleanup_finalize(root, actor, args.expected_current, args.pane)
            else: raise AssertionError(args.action)
        print(json.dumps({"ok": True, "schema": SCHEMA, "result": value}, sort_keys=True, separators=(",", ":")))
        return 0
    except Refusal as error:
        print(json.dumps({"ok": False, "schema": SCHEMA, "error": {"code": "refused", "message": str(error)}}, sort_keys=True, separators=(",", ":")))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
