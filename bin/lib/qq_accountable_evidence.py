#!/usr/bin/env python3
"""Bounded read-only evidence for the panes named by one Actor binding."""
from __future__ import annotations

import argparse
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
from typing import Any, IO

SCHEMA = "qq.accountable-evidence/v1"
BINDING_SCHEMA = "qq.actor-binding/v1"
ROLES = frozenset(("architect", "coordinator", "change_owner"))
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}\Z")
PANE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9:_-]{0,63}\Z")
RESOURCE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9:_-]{0,159}\Z")
MAX_JSON = 64 * 1024
COMMAND_TIMEOUT_SECONDS = 15.0
REAP_TIMEOUT_SECONDS = 1.0


class Refusal(Exception):
    """A closed, operator-readable refusal."""


class CaptureFailure(Exception):
    """A bounded subprocess could not produce a complete receipt."""


class ContractParser(argparse.ArgumentParser):
    def error(self, _message: str) -> None:
        raise Refusal("command arguments are malformed")


def has_surrogate(value: str) -> bool:
    return any(0xD800 <= ord(character) <= 0xDFFF for character in value)


def require_safe_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or "\x00" in value or has_surrogate(value):
        raise Refusal(f"{label} is malformed")
    return value


def require_token(value: Any, label: str, *, pane: bool = False) -> str:
    text = require_safe_text(value, label)
    matcher = PANE_RE if pane else TOKEN_RE
    if matcher.fullmatch(text) is None:
        raise Refusal(f"{label} is malformed")
    return text


def require_resource(value: Any, label: str) -> str:
    text = require_safe_text(value, label)
    if RESOURCE_RE.fullmatch(text) is None:
        raise Refusal(f"{label} is malformed")
    return text


def actor_identity(product: Any, role: Any, change: Any) -> dict[str, Any]:
    product_value = require_token(product, "Product identity")
    role_value = require_safe_text(role, "accountable role")
    if role_value not in ROLES:
        raise Refusal("accountable role must be architect, coordinator, or change_owner")
    if role_value == "change_owner":
        if change is None:
            raise Refusal("change_owner evidence requires one Change identity")
        change_value: str | None = require_token(change, "Change identity")
    else:
        if change is not None:
            raise Refusal(f"{role_value} evidence cannot carry a Change identity")
        change_value = None
    return {"product": product_value, "role": role_value, "change": change_value}


def validate_repository(value: Any) -> str:
    path_text = require_safe_text(value, "Repository")
    if not os.path.isabs(path_text):
        raise Refusal("Repository must be one absolute resolvable directory")
    try:
        resolved = Path(path_text).resolve(strict=True)
        state = resolved.stat()
    except (OSError, RuntimeError, ValueError) as error:
        raise Refusal("Repository must be one absolute resolvable directory") from error
    if not stat.S_ISDIR(state.st_mode):
        raise Refusal("Repository must be one absolute resolvable directory")
    return path_text


def parser() -> argparse.ArgumentParser:
    result = ContractParser(prog="qq-accountable-evidence", add_help=False, allow_abbrev=False)
    result.add_argument("--repo", required=True)
    result.add_argument("--product", required=True)
    result.add_argument("--role", required=True)
    result.add_argument("--change")
    return result


def validate_unicode_tree(value: Any, label: str) -> None:
    if isinstance(value, str):
        require_safe_text(value, label)
    elif isinstance(value, list):
        for item in value:
            validate_unicode_tree(item, label)
    elif isinstance(value, dict):
        for key, item in value.items():
            require_safe_text(key, label)
            validate_unicode_tree(item, label)


def strict_json(raw: bytes, label: str) -> dict[str, Any]:
    if len(raw) > MAX_JSON:
        raise Refusal(f"{label} exceeds its size bound")
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeError as error:
        raise Refusal(f"{label} is not strict UTF-8") from error

    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise Refusal(f"{label} contains a duplicate JSON key")
            result[key] = value
        return result

    def constant(_value: str) -> Any:
        raise Refusal(f"{label} contains a non-finite JSON constant")

    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
    except Refusal:
        raise
    except (json.JSONDecodeError, UnicodeError, RecursionError) as error:
        raise Refusal(f"{label} is malformed JSON") from error
    if not isinstance(value, dict):
        raise Refusal(f"{label} must be one JSON object")
    validate_unicode_tree(value, label)
    return value


def _terminate_and_reap(process: subprocess.Popen[bytes]) -> None:
    try:
        if process.poll() is None:
            try:
                process.terminate()
            except OSError:
                pass
            try:
                process.wait(timeout=REAP_TIMEOUT_SECONDS)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    process.kill()
                except OSError:
                    pass
                try:
                    process.wait(timeout=REAP_TIMEOUT_SECONDS)
                except (OSError, subprocess.TimeoutExpired) as error:
                    raise CaptureFailure("subprocess could not be reaped") from error
    except OSError as error:
        raise CaptureFailure("subprocess could not be reaped") from error


def _close_streams(process: subprocess.Popen[bytes]) -> None:
    for stream in (process.stdout, process.stderr):
        if stream is not None and not stream.closed:
            try:
                stream.close()
            except (OSError, ValueError):
                pass


def bounded_capture(command: list[str]) -> tuple[int, bytes, bytes]:
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
        raise CaptureFailure("subprocess is unavailable") from error

    selector: selectors.BaseSelector | None = None
    completed = False
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    try:
        if process.stdout is None or process.stderr is None:
            raise CaptureFailure("subprocess streams are unavailable")
        selector = selectors.DefaultSelector()
        streams: dict[int, IO[bytes]] = {}
        for name, stream in (("stdout", process.stdout), ("stderr", process.stderr)):
            descriptor = stream.fileno()
            os.set_blocking(descriptor, False)
            streams[descriptor] = stream
            selector.register(stream, selectors.EVENT_READ, name)
        deadline = time.monotonic() + COMMAND_TIMEOUT_SECONDS
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CaptureFailure("subprocess timed out")
            try:
                events = selector.select(remaining)
            except (OSError, ValueError) as error:
                raise CaptureFailure("subprocess streams are unavailable") from error
            if not events:
                raise CaptureFailure("subprocess timed out")
            for key, _mask in events:
                name = key.data
                allowance = MAX_JSON + 1 - len(buffers[name])
                if allowance <= 0:
                    raise CaptureFailure("subprocess output exceeds its size bound")
                try:
                    chunk = os.read(key.fd, min(64 * 1024, allowance))
                except BlockingIOError:
                    continue
                except OSError as error:
                    raise CaptureFailure("subprocess streams are unavailable") from error
                if chunk:
                    buffers[name].extend(chunk)
                    if len(buffers[name]) > MAX_JSON:
                        raise CaptureFailure("subprocess output exceeds its size bound")
                else:
                    stream = streams[key.fd]
                    selector.unregister(stream)
                    stream.close()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise CaptureFailure("subprocess timed out")
        try:
            returncode = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired as error:
            raise CaptureFailure("subprocess timed out") from error
        except OSError as error:
            raise CaptureFailure("subprocess could not be reaped") from error
        completed = True
        return returncode, bytes(buffers["stdout"]), bytes(buffers["stderr"])
    finally:
        if selector is not None:
            try:
                selector.close()
            except (OSError, ValueError):
                pass
        if not completed:
            _terminate_and_reap(process)
        _close_streams(process)


def executable(environment: str, command: str, label: str) -> str:
    configured = os.environ.get(environment)
    try:
        selected = configured if configured is not None else shutil.which(command)
        valid = (
            isinstance(selected, str)
            and os.path.isabs(selected)
            and os.path.isfile(selected)
            and os.access(selected, os.X_OK)
        )
    except (OSError, TypeError, ValueError):
        selected = None
        valid = False
    if not valid or selected is None:
        raise Refusal(f"{label} is unavailable")
    return selected


def validate_source(value: Any, label: str) -> dict[str, str]:
    keys = {"role_source_fingerprint", "source_fingerprint", "operation_cursor"}
    if not isinstance(value, dict) or set(value) != keys:
        raise Refusal(f"{label} source fence has an invalid shape")
    return {key: require_token(value[key], f"{label} {key}") for key in sorted(keys)}


def validate_endpoint(value: Any, label: str, *, candidate: bool) -> dict[str, Any]:
    expected = {
        "pane_id", "source", "read_only", "acknowledged", "mutated",
        "runtime_active", "activation_nonce",
    }
    if candidate:
        expected |= {"expected_current_pane_id", "phase"}
    if not isinstance(value, dict) or set(value) != expected:
        raise Refusal(f"binding {label} endpoint has an invalid shape")
    if any(type(value[key]) is not bool for key in ("read_only", "acknowledged", "mutated", "runtime_active")):
        raise Refusal(f"binding {label} endpoint flags are malformed")
    nonce = value["activation_nonce"]
    if nonce is not None:
        nonce = require_token(nonce, f"binding {label} activation nonce")
    if value["runtime_active"] and nonce is not None:
        raise Refusal(f"binding {label} active runtime retained an activation nonce")
    result: dict[str, Any] = {
        "pane_id": require_token(value["pane_id"], f"binding {label} pane identity", pane=True),
        "source": validate_source(value["source"], f"binding {label}"),
        "read_only": value["read_only"],
        "acknowledged": value["acknowledged"],
        "mutated": value["mutated"],
        "runtime_active": value["runtime_active"],
        "activation_nonce": nonce,
    }
    if candidate:
        result["expected_current_pane_id"] = require_token(
            value["expected_current_pane_id"], "binding candidate expected pane", pane=True
        )
        if value["phase"] not in ("candidate", "cleanup", "predecessor"):
            raise Refusal("binding candidate phase is malformed")
        result["phase"] = value["phase"]
    return result


def validate_binding(document: dict[str, Any], wanted: dict[str, Any]) -> dict[str, Any]:
    if set(document) != {"ok", "schema", "result"} or type(document["ok"]) is not bool:
        raise Refusal("binding inspection response has an invalid shape")
    if not document["ok"] or document["schema"] != BINDING_SCHEMA:
        raise Refusal("binding inspection did not return exact T-189 evidence")
    value = document["result"]
    if not isinstance(value, dict) or set(value) != {"schema", "version", "identity", "current", "candidate"}:
        raise Refusal("binding record has an invalid shape")
    identity_value = value["identity"]
    if not isinstance(identity_value, dict) or set(identity_value) != {"product", "role", "change"}:
        raise Refusal("binding identity has an invalid shape")
    observed = actor_identity(identity_value["product"], identity_value["role"], identity_value["change"])
    if (
        value["schema"] != BINDING_SCHEMA
        or type(value["version"]) is not int
        or value["version"] != 1
        or observed != wanted
    ):
        raise Refusal("binding record schema or identity does not match")
    current = validate_endpoint(value["current"], "current", candidate=False)
    candidate = None if value["candidate"] is None else validate_endpoint(value["candidate"], "candidate", candidate=True)
    if candidate is not None and candidate["pane_id"] == current["pane_id"]:
        raise Refusal("binding current and candidate pane identities are duplicated")
    return {
        "schema": BINDING_SCHEMA,
        "version": 1,
        "identity": observed,
        "current": current,
        "candidate": candidate,
    }


def inspect_binding(repo: str, actor: dict[str, Any]) -> dict[str, Any]:
    command = ["inspect", "--repo", repo, "--product", actor["product"], "--role", actor["role"]]
    if actor["change"] is not None:
        command.extend(["--change", actor["change"]])
    selected = executable(
        "QQ_ACCOUNTABLE_EVIDENCE_BINDING_BIN", "qq-actor-binding", "accountable binding inspector"
    )
    try:
        returncode, stdout, stderr = bounded_capture([selected, *command])
    except CaptureFailure as error:
        raise Refusal("accountable binding inspection is unavailable or exceeded its bound") from error
    if returncode != 0 or stderr:
        raise Refusal("accountable binding inspection did not return one successful stdout receipt")
    return validate_binding(strict_json(stdout, "accountable binding inspection output"), actor)


def validate_location(value: Any, label: str) -> str:
    text = require_safe_text(value, label)
    if not os.path.isabs(text):
        raise Refusal(f"{label} is not an absolute resolvable directory")
    try:
        resolved = Path(text).resolve(strict=True)
        state = resolved.stat()
    except (OSError, RuntimeError, ValueError) as error:
        raise Refusal(f"{label} is unavailable or unresolvable") from error
    if not stat.S_ISDIR(state.st_mode):
        raise Refusal(f"{label} is unavailable or unresolvable")
    return text


def present_pane(document: dict[str, Any], pane_id: str) -> dict[str, str]:
    if (
        set(document) != {"id", "result"}
        or type(document["id"]) is not str
        or document["id"] != "cli:pane:get"
    ):
        raise Refusal("Herdr pane response has an invalid shape")
    result = document["result"]
    if not isinstance(result, dict) or set(result) != {"type", "pane"} or result["type"] != "pane_info":
        raise Refusal("Herdr pane response is not exact pane_info evidence")
    pane = result["pane"]
    if not isinstance(pane, dict):
        raise Refusal("Herdr pane response has no exact pane resource")
    observed_pane = require_resource(pane.get("pane_id"), "Herdr pane identity")
    if observed_pane != pane_id:
        raise Refusal("Herdr returned a mismatched pane resource identity")
    resource = {
        "pane_id": observed_pane,
        "terminal_id": require_resource(pane.get("terminal_id"), "Herdr terminal identity"),
        "workspace_id": require_resource(pane.get("workspace_id"), "Herdr workspace identity"),
        "tab_id": require_resource(pane.get("tab_id"), "Herdr tab identity"),
    }
    for field in ("cwd", "foreground_cwd"):
        if field in pane:
            resource[field] = validate_location(pane[field], f"Herdr pane {field}")
    return resource


def exact_absence(stderr: bytes) -> bool:
    document = strict_json(stderr, "Herdr pane absence output")
    if set(document) != {"error", "id"} or document["id"] != "cli:pane:get":
        return False
    error = document["error"]
    if not isinstance(error, dict) or set(error) != {"code", "message"}:
        return False
    require_safe_text(error["message"], "Herdr pane absence message")
    return error["code"] == "pane_not_found"


def inspect_pane(selected: str, pane_id: str, slot: str, order: int) -> dict[str, Any]:
    try:
        returncode, stdout, stderr = bounded_capture([selected, "pane", "get", pane_id])
    except CaptureFailure as error:
        raise Refusal(f"Herdr {slot} pane inspection is unavailable or exceeded its bound") from error
    entry: dict[str, Any] = {"slot": slot, "order": order, "pane_id": pane_id}
    if returncode == 0:
        if stderr:
            raise Refusal(f"Herdr {slot} pane inspection returned contradictory streams")
        entry["resource"] = present_pane(strict_json(stdout, f"Herdr {slot} pane output"), pane_id)
        return entry
    if returncode == 1 and not stdout:
        try:
            absent = exact_absence(stderr)
        except Refusal as error:
            raise Refusal(f"Herdr {slot} pane absence evidence is malformed") from error
        if absent:
            entry["error"] = {"code": "pane_not_found"}
            return entry
    raise Refusal(f"Herdr {slot} pane inspection failed without exact absence evidence")


def contract_bytes(value: dict[str, Any]) -> bytes:
    try:
        raw = (json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
        ) + "\n").encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise Refusal("accountable evidence could not be encoded") from error
    if len(raw) > MAX_JSON:
        raise Refusal("accountable evidence output exceeds its size bound")
    return raw


def write_contract(value: dict[str, Any]) -> None:
    raw = contract_bytes(value)
    try:
        sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()
    except BrokenPipeError:
        pass


def main(argv: list[str] | None = None) -> int:
    try:
        args = parser().parse_args(argv)
        actor = actor_identity(args.product, args.role, args.change)
        repo = validate_repository(args.repo)
        binding = inspect_binding(repo, actor)
        selected_herdr = executable(
            "QQ_ACCOUNTABLE_EVIDENCE_HERDR_BIN", "herdr", "Herdr pane inspector"
        )
        pane_values: list[dict[str, Any]] = []
        pane_values.append(inspect_pane(selected_herdr, binding["current"]["pane_id"], "current", 0))
        if binding["candidate"] is not None:
            pane_values.append(inspect_pane(selected_herdr, binding["candidate"]["pane_id"], "candidate", 1))
        response = {
            "ok": True,
            "schema": SCHEMA,
            "result": {"binding": binding, "panes": pane_values},
        }
        write_contract(response)
        return 0
    except Refusal as error:
        refusal = {
            "ok": False,
            "schema": SCHEMA,
            "error": {"code": "refused", "message": str(error)},
        }
        write_contract(refusal)
        return 66
    except Exception:
        refusal = {
            "ok": False,
            "schema": SCHEMA,
            "error": {"code": "refused", "message": "accountable evidence inspection failed closed"},
        }
        write_contract(refusal)
        return 66


if __name__ == "__main__":
    raise SystemExit(main())
