#!/usr/bin/env python3
"""Transient qq methodology activation records and replacement lifecycle."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import uuid
from typing import Any, NoReturn

SCHEMA_VERSION = 1
WATCHER_VERSION = "qq-activation-watch-v1"
LOADED_PATHS = (
    "AGENTS.md",
    "skills",
    "extensions",
    ".pi/prompts/bro.md",
    ".pi/prompts/check-in.md",
)
REPLACEMENT_ONLY_PATHS = ("bin/pi", "package.json", "package-lock.json")
OID = re.compile(r"[0-9a-f]{40}")
TASK_ID = re.compile(r"T-[1-9][0-9]*(?:\.[1-9][0-9]*)*")
SAFE_ID = re.compile(r"[A-Za-z0-9:_-]{1,128}")
BRANCH = re.compile(
    r"(?!/)(?!.*(?:^|/)\.)(?!.*\.\.)(?!.*@\{)(?!.*[~^:?*\\\[\x00-\x20\x7f])"
    r"(?!.*//)(?!.*(?:/|\.lock)$).{1,240}"
)
CITATION = re.compile(r"decision-[1-9][0-9]*")
RESOURCE = re.compile(r"(?!/)(?!.*(?:^|/)\.\.(?:/|$))(?!.*[\r\n\x00]).{1,240}")
HASH = re.compile(r"[0-9a-f]{64}")
MAX_RECORD = 256 * 1024
ABSENT_REASON = "target absent from fresh Herdr interactive Pi discovery"
RECEIPT_KEYS = {
    "schema", "version", "run_id", "target", "pane_id", "session_path", "status",
    "reason", "action", "source_watcher_version", "running_watcher_version",
    "resource_fingerprint", "process_id", "recorded_at",
}


class Refusal(Exception):
    pass


def fail(message: str, code: int = 2) -> NoReturn:
    print(f"qq-activation: {message}", file=sys.stderr)
    raise SystemExit(code)


def json_output(value: Any) -> None:
    print(json.dumps(value, separators=(",", ":"), sort_keys=True))


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def run(argv: list[str], *, input_bytes: bytes | None = None, timeout: int = 30) -> bytes:
    try:
        result = subprocess.run(
            argv,
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Refusal(f"required command could not run: {argv[0]}") from error
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise Refusal(f"required command failed: {' '.join(argv)}{': ' + detail if detail else ''}")
    return result.stdout


def git(repo: Path, *args: str) -> bytes:
    return run(["git", "-C", os.fspath(repo), *args])


def canonical_repo(value: str) -> Path:
    path = Path(value)
    try:
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise Refusal("Repository path is unavailable") from error
    top = git(resolved, "rev-parse", "--show-toplevel").decode().strip()
    if Path(top).resolve(strict=True) != resolved:
        raise Refusal("Repository path is not its exact Git top level")
    return resolved


def validate_oid(repo: Path, value: str, label: str) -> str:
    if not OID.fullmatch(value):
        raise Refusal(f"{label} is not a full commit identity")
    observed = git(repo, "rev-parse", "--verify", f"{value}^{{commit}}").decode().strip()
    if observed != value:
        raise Refusal(f"{label} does not resolve exactly")
    return value


def loaded_tree_bytes(repo: Path, tree: str) -> bytes:
    return git(repo, "ls-tree", "-rz", "--full-tree", tree, "--", *LOADED_PATHS)


def fingerprint(repo: Path, tree: str) -> str:
    return hashlib.sha256(loaded_tree_bytes(repo, tree)).hexdigest()


def changed_paths(repo: Path, before: str, after: str, paths: tuple[str, ...] | None = None) -> list[str]:
    argv = ["diff", "--name-only", "-z", "--no-renames", before, after]
    if paths:
        argv.extend(["--", *paths])
    raw = git(repo, *argv)
    values: list[str] = []
    for item in raw.split(b"\0"):
        if not item:
            continue
        try:
            value = item.decode("utf-8")
        except UnicodeDecodeError as error:
            raise Refusal("changed resource path is not UTF-8") from error
        if not RESOURCE.fullmatch(value):
            raise Refusal("changed resource path is unsafe")
        values.append(value)
    if values != sorted(set(values)):
        raise Refusal("Git returned duplicate or non-deterministic changed paths")
    return values


def secure_regular(path: Path, label: str, maximum: int = MAX_RECORD) -> bytes:
    try:
        state = path.lstat()
    except OSError as error:
        raise Refusal(f"{label} is missing") from error
    if path.is_symlink() or not stat.S_ISREG(state.st_mode) or state.st_uid != os.getuid():
        raise Refusal(f"{label} is not an operator-owned regular non-symlink file")
    if state.st_size > maximum:
        raise Refusal(f"{label} exceeds its size bound")
    try:
        return path.read_bytes()
    except OSError as error:
        raise Refusal(f"{label} cannot be read") from error


def task_from_pr_body(body: str) -> str | None:
    matches = set(re.findall(r"(?m)^\s*(T-[1-9][0-9]*(?:\.[1-9][0-9]*)*)\b", body))
    if not matches:
        return None
    if len(matches) != 1:
        raise Refusal("pull-request body has ambiguous Task identity")
    return next(iter(matches))


def find_one(root: Path, pattern: str, label: str) -> Path:
    matches = sorted(root.glob(pattern))
    if len(matches) != 1:
        raise Refusal(f"{label} did not resolve exactly once in the managed store")
    return matches[0]


def replacement_exception(repo: Path, task_id: str | None) -> dict[str, Any] | None:
    if task_id is None:
        return None
    backlog_entry = repo / "backlog"
    if not os.path.lexists(backlog_entry):
        return None
    try:
        backlog = backlog_entry.resolve(strict=True)
        state = backlog.lstat()
    except OSError as error:
        raise Refusal("managed Task store is unavailable for replacement evidence") from error
    if not stat.S_ISDIR(state.st_mode) or state.st_uid != os.getuid():
        raise Refusal("managed Task store is not an operator-owned directory")
    task = find_one(backlog / "tasks", f"{task_id.lower()} - *.md", "replacement Task")
    raw = secure_regular(task, "replacement Task").decode("utf-8", "strict")
    lines = [line[len("qq-activation-exception:") :].strip() for line in raw.splitlines() if line.startswith("qq-activation-exception:")]
    if not lines:
        return None
    if len(lines) != 1:
        raise Refusal("managed Task contains ambiguous activation exceptions")
    try:
        value = json.loads(lines[0])
    except json.JSONDecodeError as error:
        raise Refusal("managed Task activation exception is not strict JSON") from error
    expected = {"schema", "version", "action", "resources", "replacement", "reason", "citation"}
    if not isinstance(value, dict) or set(value) != expected:
        raise Refusal("managed Task activation exception has an unexpected schema shape")
    if value.get("schema") != "qq.activation-exception" or value.get("version") != 1 or value.get("action") != "replace":
        raise Refusal("managed Task activation exception schema is unsupported")
    if value.get("replacement") != "pi-session-cwd-v1":
        raise Refusal("managed Task activation exception names an unsupported reconstruction contract")
    resources = value.get("resources")
    if (
        not isinstance(resources, list)
        or not resources
        or resources != sorted(set(resources))
        or any(not isinstance(item, str) or not RESOURCE.fullmatch(item) for item in resources)
    ):
        raise Refusal("managed Task activation exception resources are unsafe or non-deterministic")
    reason = value.get("reason")
    citation = value.get("citation")
    if not isinstance(reason, str) or not 1 <= len(reason) <= 500 or reason.strip() != reason:
        raise Refusal("managed Task activation exception reason is missing or unbounded")
    if not isinstance(citation, str) or not CITATION.fullmatch(citation):
        raise Refusal("managed Task activation exception citation is not a decision identity")
    if citation not in raw:
        raise Refusal("replacement citation is absent from the owning Task")
    decision_number = citation.removeprefix("decision-")
    decision = find_one(backlog / "decisions", f"decision-{decision_number} - *.md", "replacement decision citation")
    decision_raw = secure_regular(decision, "replacement decision citation").decode("utf-8", "strict")
    if (not re.search(rf"(?m)^id:\s*{re.escape(citation)}\s*$", decision_raw)
            or not re.search(r"(?m)^status:\s*accepted\s*$", decision_raw)):
        raise Refusal("replacement decision citation identity or accepted disposition is contradictory")
    return value


def command_classify(args: argparse.Namespace) -> None:
    repo = canonical_repo(args.repo)
    before = validate_oid(repo, args.before, "pre-fast-forward tree")
    after = validate_oid(repo, args.after, "landed tree")
    try:
        body = Path(args.pr_body_file).read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise Refusal("pull-request body cannot be read") from error
    loaded = changed_paths(repo, before, after, LOADED_PATHS)
    all_changes = changed_paths(repo, before, after)
    replacement_only = [path for path in all_changes if path in REPLACEMENT_ONLY_PATHS]
    changed_extensions = [path for path in loaded if path == "extensions" or path.startswith("extensions/")]
    needs_replacement_identity = bool(replacement_only or changed_extensions)
    task_id = task_from_pr_body(body) if needs_replacement_identity else None
    if changed_extensions and task_id is None:
        raise Refusal("loaded extension change lacks an unambiguous owning Task identity")
    exception = replacement_exception(repo, task_id) if task_id else None

    if exception is not None:
        declared = exception["resources"]
        if not set(declared).issubset(all_changes):
            raise Refusal("aligned replacement exception does not exactly bind changed resources")
        action = "replace"
        reason = exception["reason"]
        citation = exception["citation"]
        replacement = exception["replacement"]
        replacement_resources = declared
    elif replacement_only:
        raise Refusal("replacement-required runtime/package/launch surface changed without a machine-verifiable aligned exception")
    elif loaded:
        action = "reload"
        reason = "globally loaded qq resources changed and are reload-compatible"
        citation = None
        replacement = None
        replacement_resources = []
    else:
        action = "none"
        reason = "no globally loaded qq resources changed"
        citation = None
        replacement = None
        replacement_resources = []

    json_output(
        {
            "schema": "qq.activation-classification",
            "version": SCHEMA_VERSION,
            "action": action,
            "before_tree": before,
            "landed_tree": after,
            "resource_fingerprint": fingerprint(repo, after),
            "changed_loaded_resources": loaded,
            "replacement_resources": replacement_resources,
            "replacement": replacement,
            "reason": reason,
            "citation": citation,
            "task_id": task_id,
        }
    )


def required_string(value: Any, key: str) -> str:
    item = value.get(key) if isinstance(value, dict) else None
    if not isinstance(item, str) or not item:
        raise Refusal(f"Herdr target lacks {key}")
    return item


def target_token(pane: str, session: str) -> str:
    return hashlib.sha256(f"{pane}\0{session}".encode()).hexdigest()[:32]


def targets_from_discovery(document: Any) -> list[dict[str, Any]]:
    agents = document.get("result", {}).get("agents") if isinstance(document, dict) else None
    if not isinstance(agents, list):
        raise Refusal("Herdr agent discovery lacks an agents array")
    targets: list[dict[str, Any]] = []
    panes: set[str] = set()
    sessions: set[str] = set()
    for agent in agents:
        if not isinstance(agent, dict) or agent.get("agent") != "pi":
            continue
        pane = required_string(agent, "pane_id")
        tab = required_string(agent, "tab_id")
        workspace = required_string(agent, "workspace_id")
        if not all(SAFE_ID.fullmatch(item) for item in (pane, tab, workspace)):
            raise Refusal("Herdr returned an unsafe Pi target identity")
        status = required_string(agent, "agent_status")
        if status not in {"idle", "working", "blocked"}:
            continue
        interactive_ready = agent.get("interactive_ready")
        if not isinstance(interactive_ready, bool) or not interactive_ready:
            raise Refusal("Herdr Pi target is not verifiably interactive-ready")
        session_value = agent.get("agent_session")
        if not isinstance(session_value, dict) or set(session_value) < {"agent", "kind", "source", "value"}:
            raise Refusal("Herdr Pi target lacks durable session evidence")
        if session_value.get("agent") != "pi" or session_value.get("kind") != "path" or session_value.get("source") != "herdr:pi":
            raise Refusal("Herdr Pi target session authority is contradictory")
        session = required_string(session_value, "value")
        cwd = agent.get("foreground_cwd") or agent.get("cwd")
        if not isinstance(session, str) or not os.path.isabs(session) or not isinstance(cwd, str) or not os.path.isabs(cwd):
            raise Refusal("Herdr Pi target durable state is not absolute")
        if pane in panes or session in sessions:
            raise Refusal("Herdr returned duplicate Pi pane or session authority")
        panes.add(pane)
        sessions.add(session)
        name = agent.get("name")
        if name is not None and (not isinstance(name, str) or not SAFE_ID.fullmatch(name)):
            raise Refusal("Herdr Pi target name is unsafe")
        targets.append(
            {
                "token": target_token(pane, session),
                "pane_id": pane,
                "tab_id": tab,
                "workspace_id": workspace,
                "session_path": session,
                "cwd": cwd,
                "name": name,
                "observed_status": status,
                "replacement_launch": {"kind": "pi", "contract": "pi-session-cwd-v1", "args": ["--session", session]},
            }
        )
    targets.sort(key=lambda item: (item["workspace_id"], item["tab_id"], item["pane_id"]))
    return targets


def command_targets(_args: argparse.Namespace) -> None:
    try:
        document = json.load(sys.stdin)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Refusal("Herdr agent discovery is malformed") from error
    json_output(targets_from_discovery(document))


def safe_directory(path: Path, label: str, *, create: bool = False) -> Path:
    if not path.is_absolute():
        raise Refusal(f"{label} must be absolute")
    if create and not os.path.lexists(path):
        try:
            path.mkdir(parents=True, mode=0o700)
        except OSError as error:
            raise Refusal(f"{label} cannot be created") from error
    try:
        state = path.lstat()
    except OSError as error:
        raise Refusal(f"{label} is unavailable") from error
    if path.is_symlink() or not stat.S_ISDIR(state.st_mode) or state.st_uid != os.getuid():
        raise Refusal(f"{label} must be an operator-owned non-symlink directory")
    if stat.S_IMODE(state.st_mode) != 0o700:
        raise Refusal(f"{label} must be mode 0700")
    try:
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise Refusal(f"{label} cannot be resolved") from error
    if resolved != path:
        raise Refusal(f"{label} must resolve exactly")
    return resolved


def atomic_json(path: Path, value: Any, *, replace: bool = False) -> None:
    data = (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode()
    if len(data) > MAX_RECORD:
        raise Refusal("activation record exceeds its size bound")
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.write(descriptor, data)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path, follow_symlinks=False)
    finally:
        temporary.unlink(missing_ok=True)


def load_json(path: Path, label: str) -> Any:
    try:
        state = path.lstat()
    except OSError as error:
        raise Refusal(f"{label} is missing") from error
    if stat.S_IMODE(state.st_mode) != 0o600:
        raise Refusal(f"{label} must be mode 0600")
    raw = secure_regular(path, label)
    try:
        return json.loads(raw)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Refusal(f"{label} is malformed") from error


def activation_root(runtime_value: str, *, create: bool) -> tuple[Path, Path]:
    runtime = safe_directory(Path(runtime_value), "dispatch runtime root", create=create)
    activation = safe_directory(runtime / ".qq-activation", "activation lifecycle root", create=create)
    return runtime, activation


def valid_resource_list(value: Any) -> bool:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        return False
    resources: list[str] = value
    return resources == sorted(set(resources)) and all(RESOURCE.fullmatch(item) for item in resources)


def validate_request_shape(request: Any) -> dict[str, Any]:
    expected = {
        "schema", "version", "run_id", "action", "before_tree", "landed_tree",
        "resource_fingerprint", "changed_loaded_resources", "replacement_resources",
        "replacement", "reason", "citation", "task_id", "pull_request", "pr_url",
        "merge_commit", "source_branch", "expected_watcher_version", "created_at", "targets",
        "probe_id",
    }
    if not isinstance(request, dict) or set(request) != expected:
        raise Refusal("activation request has an unexpected schema shape")
    if request.get("schema") != "qq.activation-request" or request.get("version") != 1:
        raise Refusal("activation request schema is unsupported")
    action = request.get("action")
    if action not in {"reload", "replace"}:
        raise Refusal("activation request action is unsupported")
    run_id = request.get("run_id")
    before_tree = request.get("before_tree")
    landed_tree = request.get("landed_tree")
    merge_commit = request.get("merge_commit")
    resource_fingerprint = request.get("resource_fingerprint")
    source_branch = request.get("source_branch")
    pull_request = request.get("pull_request")
    pr_url = request.get("pr_url")
    task_id = request.get("task_id")
    probe_id = request.get("probe_id")
    reason = request.get("reason")
    citation = request.get("citation")
    replacement = request.get("replacement")
    changed_resources = request.get("changed_loaded_resources")
    replacement_resources = request.get("replacement_resources")
    if not isinstance(run_id, str) or not SAFE_ID.fullmatch(run_id):
        raise Refusal("activation request identity is unsafe")
    if (not isinstance(before_tree, str) or not OID.fullmatch(before_tree)
            or not isinstance(landed_tree, str) or not OID.fullmatch(landed_tree)
            or not isinstance(merge_commit, str) or not OID.fullmatch(merge_commit)
            or not isinstance(resource_fingerprint, str) or not HASH.fullmatch(resource_fingerprint)):
        raise Refusal("activation request source identity is malformed")
    if not isinstance(source_branch, str) or not BRANCH.fullmatch(source_branch):
        raise Refusal("activation request source branch is malformed")
    if not isinstance(pull_request, str) or (pull_request != "probe" and not re.fullmatch(r"[1-9][0-9]*", pull_request)):
        raise Refusal("activation request pull-request identity is malformed")
    if pr_url is not None and (not isinstance(pr_url, str) or not pr_url.startswith("https://")):
        raise Refusal("activation request pull-request URL is malformed")
    if task_id is not None and (not isinstance(task_id, str) or not TASK_ID.fullmatch(task_id)):
        raise Refusal("activation request Task identity is malformed")
    if probe_id is not None and (not isinstance(probe_id, str) or not SAFE_ID.fullmatch(probe_id)):
        raise Refusal("activation request probe identity is malformed")
    if not isinstance(reason, str) or not 1 <= len(reason) <= 500 or reason.strip() != reason:
        raise Refusal("activation request reason is malformed")
    if not valid_resource_list(changed_resources):
        raise Refusal("activation request loaded resources are malformed")
    if not valid_resource_list(replacement_resources):
        raise Refusal("activation request replacement resources are malformed")
    if action == "replace":
        if replacement != "pi-session-cwd-v1" or not isinstance(citation, str) or not CITATION.fullmatch(citation):
            raise Refusal("activation request replacement authority is malformed")
    elif replacement is not None or replacement_resources or citation is not None:
        raise Refusal("reload activation request contains contradictory replacement authority")
    if request.get("expected_watcher_version") != WATCHER_VERSION:
        raise Refusal("activation request expects a stale or unknown watcher version")
    targets = request.get("targets")
    if not isinstance(targets, list):
        raise Refusal("activation request targets are malformed or duplicate")
    target_keys = {"token", "pane_id", "tab_id", "workspace_id", "session_path", "cwd", "name", "observed_status", "replacement_launch"}
    seen_tokens: set[str] = set()
    seen_panes: set[str] = set()
    seen_sessions: set[str] = set()
    for target in targets:
        if not isinstance(target, dict) or set(target) != target_keys:
            raise Refusal("activation request target has an unexpected schema shape")
        pane = target.get("pane_id")
        tab = target.get("tab_id")
        workspace = target.get("workspace_id")
        session = target.get("session_path")
        cwd = target.get("cwd")
        token = target.get("token")
        name = target.get("name")
        launch = target.get("replacement_launch")
        if (not isinstance(pane, str) or not SAFE_ID.fullmatch(pane)
                or not isinstance(tab, str) or not SAFE_ID.fullmatch(tab)
                or not isinstance(workspace, str) or not SAFE_ID.fullmatch(workspace)
                or not isinstance(session, str) or not os.path.isabs(session)
                or not isinstance(cwd, str) or not os.path.isabs(cwd)
                or not isinstance(token, str) or token != target_token(pane, session)
                or token in seen_tokens or pane in seen_panes or session in seen_sessions
                or target.get("observed_status") not in {"idle", "working", "blocked"}
                or (name is not None and (not isinstance(name, str) or not SAFE_ID.fullmatch(name)))
                or launch != {"kind": "pi", "contract": "pi-session-cwd-v1", "args": ["--session", session]}):
            raise Refusal("activation request target authority is malformed or duplicate")
        seen_tokens.add(token)
        seen_panes.add(pane)
        seen_sessions.add(session)
    return request


def safe_children(directory: Path, label: str) -> list[Path]:
    try:
        return sorted(directory.iterdir(), key=lambda path: path.name)
    except OSError as error:
        raise Refusal(f"{label} cannot be inspected") from error


def request_source_relation(request: dict[str, Any], branch: str, pull_request: str | None) -> bool:
    branch_matches = request["source_branch"] == branch
    if pull_request is None:
        return branch_matches
    pr_matches = request["pull_request"] == pull_request
    if branch_matches != pr_matches:
        raise Refusal("activation request source branch and pull request are contradictory")
    return branch_matches and pr_matches


def validate_target_receipt(run_dir: Path, request: dict[str, Any], target: dict[str, Any]) -> None:
    receipt_path = run_dir / "receipts" / f"{target['token']}.json"
    if not os.path.lexists(receipt_path):
        raise Refusal("activation request is pending because an exact target receipt is missing")
    receipt = load_json(receipt_path, "activation receipt")
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        raise Refusal("activation receipt has an unexpected schema shape")
    if receipt.get("status") == "failed":
        raise Refusal("activation request has a failed target receipt")
    if (receipt.get("schema") != "qq.activation-receipt" or receipt.get("version") != 1
            or receipt.get("run_id") != request["run_id"] or receipt.get("target") != target["token"]
            or receipt.get("pane_id") != target["pane_id"]
            or receipt.get("session_path") != target["session_path"]
            or receipt.get("action") != request["action"]
            or receipt.get("resource_fingerprint") != request["resource_fingerprint"]):
        raise Refusal("activation receipt authority is contradictory")
    if receipt.get("status") == "absent":
        if (receipt.get("reason") != ABSENT_REASON
                or receipt.get("source_watcher_version") is not None
                or receipt.get("running_watcher_version") is not None
                or receipt.get("process_id") is not None
                or not isinstance(receipt.get("recorded_at"), str)):
            raise Refusal("absent activation receipt claims watcher or process authority")
        return
    if receipt.get("status") != "activated":
        raise Refusal("activation receipt authority is contradictory")
    if (not isinstance(receipt.get("source_watcher_version"), str)
            or not SAFE_ID.fullmatch(receipt["source_watcher_version"])
            or not isinstance(receipt.get("process_id"), int) or receipt["process_id"] <= 0
            or not isinstance(receipt.get("reason"), str)
            or not isinstance(receipt.get("recorded_at"), str)):
        raise Refusal("activation receipt watcher or process proof is malformed")
    if receipt.get("running_watcher_version") != request["expected_watcher_version"]:
        raise Refusal("activation receipt watcher or fingerprint proof is stale")


def validate_completed_request(run_dir: Path, request: dict[str, Any]) -> None:
    for target in request["targets"]:
        validate_target_receipt(run_dir, request, target)


def write_absent_receipt(run_dir: Path, request: dict[str, Any], target: dict[str, Any]) -> None:
    receipts_path = run_dir / "receipts"
    if not os.path.lexists(receipts_path):
        try:
            receipts_path.mkdir(mode=0o700)
        except OSError as error:
            raise Refusal("activation receipts cannot be created") from error
    receipts = safe_directory(receipts_path, "activation receipts")
    atomic_json(receipts / f"{target['token']}.json", {
        "schema": "qq.activation-receipt", "version": 1, "run_id": request["run_id"],
        "target": target["token"], "pane_id": target["pane_id"],
        "session_path": target["session_path"], "status": "absent", "reason": ABSENT_REASON,
        "action": request["action"], "source_watcher_version": None,
        "running_watcher_version": None, "resource_fingerprint": request["resource_fingerprint"],
        "process_id": None, "recorded_at": now(),
    })


def settle_absent_targets(run_dir: Path, request: dict[str, Any], herdr: str) -> None:
    if not Path(herdr).is_absolute():
        raise Refusal("passed Herdr discovery authority is not an absolute executable file")
    try:
        herdr_state = os.stat(herdr)
        herdr_executable = os.access(herdr, os.X_OK)
    except OSError as error:
        raise Refusal("passed Herdr discovery authority is unavailable") from error
    if not stat.S_ISREG(herdr_state.st_mode) or not herdr_executable:
        raise Refusal("passed Herdr discovery authority is not an absolute executable file")
    missing = [
        target
        for target in request["targets"]
        if not os.path.lexists(run_dir / "receipts" / f"{target['token']}.json")
    ]
    if not missing:
        return
    raw = run([herdr, "agent", "list"])
    try:
        discovery = json.loads(raw)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Refusal("fresh Herdr agent discovery is malformed") from error
    live = targets_from_discovery(discovery)
    for target in missing:
        pane_matches = [item for item in live if item["pane_id"] == target["pane_id"]]
        session_matches = [item for item in live if item["session_path"] == target["session_path"]]
        if not pane_matches and not session_matches:
            write_absent_receipt(run_dir, request, target)
            continue
        if (len(pane_matches) != 1 or len(session_matches) != 1
                or pane_matches[0] is not session_matches[0]):
            raise Refusal("fresh Herdr discovery contradicts activation target pane/session authority")
        observed = pane_matches[0]
        if (observed["tab_id"] != target["tab_id"]
                or observed["workspace_id"] != target["workspace_id"]
                or os.path.normpath(observed["cwd"]) != os.path.normpath(target["cwd"])):
            raise Refusal("fresh Herdr discovery contradicts activation target tab/workspace/cwd authority")
        # The exact target remains live and therefore pending at its watcher-owned boundary.


def exact_successor_chain(
    runs: list[tuple[Path, dict[str, Any], bool]],
    selected: tuple[Path, dict[str, Any], bool],
) -> list[tuple[Path, dict[str, Any], bool]]:
    chain: list[tuple[Path, dict[str, Any], bool]] = []
    current = selected
    visited = {selected[0]}
    while True:
        current_request = current[1]
        if current_request["before_tree"] == current_request["landed_tree"]:
            raise Refusal("activation supersession chain contains a self-reference")
        candidates = [
            item for item in runs
            if item[1]["before_tree"] == current_request["landed_tree"]
        ]
        if not candidates:
            return chain
        if len(candidates) != 1:
            raise Refusal("activation supersession chain has an ambiguous direct successor")
        successor = candidates[0]
        if successor[0] in visited:
            raise Refusal("activation supersession chain contains a cycle")
        if (current_request["task_id"] is None
                or successor[1]["task_id"] != current_request["task_id"]):
            raise Refusal("activation supersession successor lacks the exact same non-null Task identity")
        if successor[2]:
            raise Refusal("activation supersession refuses a pending successor request")
        chain.append(successor)
        visited.add(successor[0])
        current = successor


def validate_successor_coverage(
    selected_request: dict[str, Any],
    terminal_dir: Path,
    terminal_request: dict[str, Any],
) -> None:
    for old_target in selected_request["targets"]:
        identity = (old_target["token"], old_target["pane_id"], old_target["session_path"])
        matches = [
            target for target in terminal_request["targets"]
            if (target["token"], target["pane_id"], target["session_path"]) == identity
        ]
        if len(matches) != 1:
            raise Refusal("terminal activation successor is missing or drifted from an old target identity")
        validate_target_receipt(terminal_dir, terminal_request, matches[0])


def retirement_chain_record(run: tuple[Path, dict[str, Any], bool]) -> dict[str, str]:
    return {"run_id": run[1]["run_id"], "run_dir": os.fspath(run[0])}


def command_retire_change(args: argparse.Namespace) -> None:
    branch = args.source_branch
    pull_request = args.pull_request
    if not BRANCH.fullmatch(branch):
        raise Refusal("activation retirement source branch is malformed")
    if pull_request is not None and not re.fullmatch(r"[1-9][0-9]*", pull_request):
        raise Refusal("activation retirement pull-request identity is malformed")
    runtime_path = Path(args.runtime_root)
    if not os.path.lexists(runtime_path) or not os.path.lexists(runtime_path / ".qq-activation"):
        json_output({"status": "not-found", "matched": False, "retired": False,
                     "source_branch": branch, "pull_request": pull_request, "run_id": None,
                     "retirement_kind": None, "successor_chain": [],
                     "terminal_successor_run_id": None, "terminal_successor_run_dir": None})
        return
    _runtime, root = activation_root(args.runtime_root, create=False)
    runs: list[tuple[Path, dict[str, Any], bool]] = []
    matches: list[tuple[Path, dict[str, Any], bool]] = []
    for candidate in safe_children(root, "activation lifecycle root"):
        if candidate.is_symlink() or not candidate.is_dir():
            continue
        run_dir = safe_directory(candidate, "activation run")
        armed_path = run_dir / "REQUEST.json"
        pending_path = run_dir / "REQUEST.pending"
        has_armed = os.path.lexists(armed_path)
        has_pending = os.path.lexists(pending_path)
        if not has_armed and not has_pending:
            continue
        if has_armed and has_pending:
            raise Refusal("activation run contains contradictory armed and pending requests")
        request = validate_request_shape(load_json(armed_path if has_armed else pending_path, "activation request"))
        run_record = (run_dir, request, has_pending)
        runs.append(run_record)
        if request_source_relation(request, branch, pull_request):
            matches.append(run_record)
    if len(matches) > 1:
        raise Refusal("activation retirement matched more than one exact request")
    if not matches:
        json_output({"status": "not-found", "matched": False, "retired": False,
                     "source_branch": branch, "pull_request": pull_request, "run_id": None,
                     "retirement_kind": None, "successor_chain": [],
                     "terminal_successor_run_id": None, "terminal_successor_run_dir": None})
        return
    selected = matches[0]
    run_dir, request, pending = selected
    if pending:
        raise Refusal("activation retirement refuses a pending request")

    retirement_kind = "ordinary"
    successor_chain: list[tuple[Path, dict[str, Any], bool]] = []
    try:
        validate_completed_request(run_dir, request)
    except Refusal:
        successor_chain = exact_successor_chain(runs, selected)
        if successor_chain:
            terminal_dir, terminal_request, _terminal_pending = successor_chain[-1]
            validate_successor_coverage(request, terminal_dir, terminal_request)
            retirement_kind = "superseded"
        else:
            settle_absent_targets(run_dir, request, args.herdr_bin)
            validate_completed_request(run_dir, request)

    if args.inspect:
        status = "eligible"
        retired = False
    else:
        try:
            shutil.rmtree(run_dir)
        except OSError as error:
            raise Refusal("exact activation run could not be retired") from error
        status = "retired"
        retired = True
    terminal = successor_chain[-1] if successor_chain else None
    json_output({
        "status": status, "matched": True, "retired": retired,
        "source_branch": branch, "pull_request": pull_request,
        "run_id": request["run_id"], "run_dir": os.fspath(run_dir),
        "retirement_kind": retirement_kind,
        "successor_chain": [retirement_chain_record(item) for item in [selected, *successor_chain]]
        if successor_chain else [],
        "terminal_successor_run_id": terminal[1]["run_id"] if terminal else None,
        "terminal_successor_run_dir": os.fspath(terminal[0]) if terminal else None,
    })


def command_stage(args: argparse.Namespace) -> None:
    _runtime, root = activation_root(args.runtime_root, create=True)
    try:
        payload = json.load(sys.stdin)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Refusal("activation staging payload is malformed") from error
    classification = payload.get("classification") if isinstance(payload, dict) else None
    targets = payload.get("targets") if isinstance(payload, dict) else None
    source = payload.get("source") if isinstance(payload, dict) else None
    if not isinstance(classification, dict) or classification.get("schema") != "qq.activation-classification":
        raise Refusal("activation staging classification is malformed")
    if classification.get("action") not in {"reload", "replace"} or not isinstance(targets, list) or not isinstance(source, dict):
        raise Refusal("activation staging payload is incomplete")
    run_id = f"land-{classification['landed_tree'][:12]}-{classification['resource_fingerprint'][:12]}"
    run_dir = root / run_id
    if os.path.lexists(run_dir):
        run_dir = safe_directory(run_dir, "activation run")
    else:
        run_dir.mkdir(mode=0o700)
    request = {
        "schema": "qq.activation-request", "version": 1, "run_id": run_id,
        "action": classification["action"], "before_tree": classification["before_tree"],
        "landed_tree": classification["landed_tree"],
        "resource_fingerprint": classification["resource_fingerprint"],
        "changed_loaded_resources": classification["changed_loaded_resources"],
        "replacement_resources": classification["replacement_resources"],
        "replacement": classification["replacement"], "reason": classification["reason"],
        "citation": classification["citation"], "task_id": classification["task_id"],
        "pull_request": source.get("pull_request"), "pr_url": source.get("pr_url"),
        "merge_commit": source.get("merge_commit"), "source_branch": source.get("source_branch"),
        "expected_watcher_version": WATCHER_VERSION, "created_at": now(), "targets": targets,
        "probe_id": source.get("probe_id"),
    }
    validate_request_shape(request)
    pending = run_dir / "REQUEST.pending"
    armed = run_dir / "REQUEST.json"
    if os.path.lexists(armed):
        existing = validate_request_shape(load_json(armed, "existing activation request"))
        comparable = {key: value for key, value in request.items() if key != "created_at"}
        existing_comparable = {key: value for key, value in existing.items() if key != "created_at"}
        if comparable != existing_comparable:
            raise Refusal("activation run identity collides with a different request")
    elif os.path.lexists(pending):
        existing = validate_request_shape(load_json(pending, "pending activation request"))
        comparable = {key: value for key, value in request.items() if key != "created_at"}
        existing_comparable = {key: value for key, value in existing.items() if key != "created_at"}
        if comparable != existing_comparable:
            raise Refusal("pending activation run identity collides with a different request")
    else:
        atomic_json(pending, request)
    json_output({"run_dir": os.fspath(run_dir), "run_id": run_id, "request": request, "armed": armed.exists()})


def command_arm(args: argparse.Namespace) -> None:
    _runtime, root = activation_root(args.runtime_root, create=False)
    run_dir = safe_directory(root / args.run_id, "activation run")
    pending = run_dir / "REQUEST.pending"
    armed = run_dir / "REQUEST.json"
    if armed.exists():
        request = validate_request_shape(load_json(armed, "activation request"))
    else:
        request = validate_request_shape(load_json(pending, "pending activation request"))
        try:
            os.replace(pending, armed)
        except OSError as error:
            raise Refusal("activation request could not be armed atomically") from error
    json_output({"run_dir": os.fspath(run_dir), "run_id": args.run_id, "request": request, "armed": True})


def command_cancel(args: argparse.Namespace) -> None:
    _runtime, root = activation_root(args.runtime_root, create=False)
    run_dir = safe_directory(root / args.run_id, "activation run")
    armed = run_dir / "REQUEST.json"
    if armed.exists():
        raise Refusal("an armed activation request cannot be cancelled")
    pending = run_dir / "REQUEST.pending"
    if pending.exists():
        pending.unlink()
    try:
        run_dir.rmdir()
    except OSError:
        pass
    json_output({"run_id": args.run_id, "cancelled": True})


def command_recover_pending(args: argparse.Namespace) -> None:
    runtime_path = Path(args.runtime_root)
    if not os.path.lexists(runtime_path) or not os.path.lexists(runtime_path / ".qq-activation"):
        json_output({"recovered": False})
        return
    _runtime, root = activation_root(args.runtime_root, create=False)
    matches: list[tuple[Path, dict[str, Any]]] = []
    for candidate in safe_children(root, "activation lifecycle root"):
        if candidate.is_symlink() or not candidate.is_dir():
            continue
        pending = candidate / "REQUEST.pending"
        if not pending.exists():
            continue
        request = validate_request_shape(load_json(pending, "pending activation request"))
        if request["landed_tree"] == args.landed_tree and request["merge_commit"] == args.merge_commit:
            matches.append((candidate, request))
    if not matches:
        json_output({"recovered": False})
        return
    if len(matches) != 1:
        raise Refusal("interrupted activation publication is ambiguous")
    run_dir, request = matches[0]
    os.replace(run_dir / "REQUEST.pending", run_dir / "REQUEST.json")
    json_output({"recovered": True, "run_dir": os.fspath(run_dir), "run_id": request["run_id"], "request": request})


def command_recover_existing(args: argparse.Namespace) -> None:
    runtime_path = Path(args.runtime_root)
    if not os.path.lexists(runtime_path) or not os.path.lexists(runtime_path / ".qq-activation"):
        json_output({"found": False})
        return
    _runtime, root = activation_root(args.runtime_root, create=False)
    matches: list[tuple[Path, dict[str, Any]]] = []
    for candidate in safe_children(root, "activation lifecycle root"):
        if candidate.is_symlink() or not candidate.is_dir():
            continue
        armed = candidate / "REQUEST.json"
        if not armed.exists():
            continue
        request = validate_request_shape(load_json(armed, "activation request"))
        if request["landed_tree"] == args.landed_tree and request["merge_commit"] == args.merge_commit:
            matches.append((candidate, request))
    if not matches:
        json_output({"found": False})
        return
    if len(matches) != 1:
        raise Refusal("existing activation publication is ambiguous")
    run_dir, request = matches[0]
    retried: list[str] = []
    for target in request["targets"]:
        receipt_path = run_dir / "receipts" / f"{target['token']}.json"
        if not receipt_path.exists():
            continue
        receipt = load_json(receipt_path, "activation receipt")
        if receipt.get("run_id") != request["run_id"] or receipt.get("target") != target["token"]:
            raise Refusal("activation failure receipt authority is contradictory")
        if receipt.get("status") != "failed":
            continue
        for relative in (
            ("receipts", f"{target['token']}.json"),
            ("claims", f"{target['token']}.json"),
            ("attempts", f"{target['token']}.json"),
            ("helpers", f"{target['token']}.json"),
        ):
            (run_dir / relative[0] / relative[1]).unlink(missing_ok=True)
        retried.append(target["token"])
    if retried:
        atomic_json(run_dir / "RECOVERY.json", {
            "schema": "qq.activation-recovery", "version": 1,
            "run_id": request["run_id"], "retried_targets": retried, "recorded_at": now(),
        }, replace=True)
    json_output({"found": True, "run_dir": os.fspath(run_dir), "run_id": request["run_id"], "request": request, "retried_targets": retried})


def default_runtime() -> Path:
    state = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    return Path(state) / "qq" / "delegate"


def command_probe_prepare(args: argparse.Namespace) -> None:
    root = Path(args.runtime_root)
    if not root.is_absolute():
        raise Refusal("probe runtime root must be absolute")
    if os.path.lexists(root):
        raise Refusal("probe runtime root is reused or spent")
    try:
        if root.resolve(strict=False) == default_runtime().resolve(strict=False):
            raise Refusal("probe refuses the default/shared dispatch runtime root")
    except OSError as error:
        raise Refusal("probe runtime root cannot be resolved") from error
    root.mkdir(parents=True, mode=0o700)
    root = safe_directory(root, "probe runtime root")
    probe_id = uuid.uuid4().hex
    source_root = Path(__file__).resolve(strict=True).parents[2]
    try:
        source_head = git(source_root, "rev-parse", "HEAD").decode().strip()
        watcher_blob = git(source_root, "rev-parse", "HEAD:extensions/qq-activation-watch.ts").decode().strip()
    except Refusal:
        source_head = "uncommitted"
        watcher_blob = hashlib.sha256((source_root / "extensions" / "qq-activation-watch.ts").read_bytes()).hexdigest()
    atomic_json(root / "PROBE.json", {
        "schema": "qq.activation-probe", "version": 1, "probe_id": probe_id,
        "expected_watcher_version": WATCHER_VERSION, "source_head": source_head,
        "watcher_source_identity": watcher_blob, "created_at": now(), "status": "prepared",
    })
    exports = {
        "QQ_DISPATCH_RUNTIME_ROOT": os.fspath(root),
        "QQ_ACTIVATION_PROBE_ID": probe_id,
        "QQ_ACTIVATION_EXPECTED_WATCHER_VERSION": WATCHER_VERSION,
    }
    print("; ".join(f"export {key}={shell_quote(value)}" for key, value in exports.items()))


def validate_probe(runtime_root: str) -> tuple[Path, dict[str, Any]]:
    root = safe_directory(Path(runtime_root), "probe runtime root")
    if root.resolve() == default_runtime().resolve(strict=False):
        raise Refusal("probe refuses the default/shared dispatch runtime root")
    probe = load_json(root / "PROBE.json", "probe identity")
    expected = {"schema", "version", "probe_id", "expected_watcher_version", "source_head", "watcher_source_identity", "created_at", "status"}
    if not isinstance(probe, dict) or set(probe) != expected or probe.get("schema") != "qq.activation-probe" or probe.get("version") != 1:
        raise Refusal("probe identity is malformed")
    if probe.get("expected_watcher_version") != WATCHER_VERSION or probe.get("status") != "prepared":
        raise Refusal("probe identity is stale or spent")
    return root, probe


def command_probe_validate(args: argparse.Namespace) -> None:
    _root, probe = validate_probe(args.runtime_root)
    json_output(probe)


def command_probe_request(args: argparse.Namespace) -> None:
    root, probe = validate_probe(args.runtime_root)
    if os.environ.get("QQ_DISPATCH_RUNTIME_ROOT") != os.fspath(root):
        raise Refusal("probe runtime must be exported before constructing its request")
    if os.environ.get("QQ_ACTIVATION_PROBE_ID") != probe["probe_id"] or os.environ.get("QQ_ACTIVATION_EXPECTED_WATCHER_VERSION") != WATCHER_VERSION:
        raise Refusal("probe environment does not bind the prepared identity and expected watcher version")
    if len(set(args.pane)) != len(args.pane) or len(args.pane) < 2 or any(not SAFE_ID.fullmatch(item) for item in args.pane):
        raise Refusal("probe request requires at least two unique safe pane identities")
    herdr = shutil.which("herdr")
    if not herdr:
        raise Refusal("herdr is unavailable for live probe target discovery")
    agents = run([herdr, "agent", "list"])
    targets_raw = run([os.fspath(Path(__file__).resolve(strict=True)), "targets"], input_bytes=agents)
    try:
        all_targets = json.loads(targets_raw)
    except json.JSONDecodeError as error:
        raise Refusal("live probe target validation returned malformed data") from error
    targets = [target for target in all_targets if target.get("pane_id") in set(args.pane)]
    if sorted(target["pane_id"] for target in targets) != sorted(args.pane):
        raise Refusal("one or more exact live probe panes are absent from validated Herdr discovery")
    repo = canonical_repo(args.repo)
    head = git(repo, "rev-parse", "HEAD").decode().strip()
    validate_oid(repo, head, "probe source tree")
    classification = {
        "schema": "qq.activation-classification", "version": 1, "action": "reload",
        "before_tree": head, "landed_tree": head, "resource_fingerprint": fingerprint(repo, head),
        "changed_loaded_resources": ["extensions/qq-activation-watch.ts"],
        "replacement_resources": [], "replacement": None,
        "reason": "private-runtime live acceptance probe", "citation": None, "task_id": "T-209.2",
    }
    payload = {
        "classification": classification, "targets": targets,
        "source": {"pull_request": "probe", "pr_url": None, "merge_commit": head,
                   "source_branch": "probe", "probe_id": probe["probe_id"]},
    }
    try:
        staged = json.loads(run([
            os.fspath(Path(__file__).resolve(strict=True)), "stage", "--runtime-root", os.fspath(root),
        ], input_bytes=json.dumps(payload).encode()))
        armed = json.loads(run([
            os.fspath(Path(__file__).resolve(strict=True)), "arm", "--runtime-root", os.fspath(root),
            "--run-id", staged["run_id"],
        ]))
    except json.JSONDecodeError as error:
        raise Refusal("live probe activation lifecycle returned malformed data") from error
    json_output(armed)


def command_probe_verify(args: argparse.Namespace) -> None:
    root, probe = validate_probe(args.runtime_root)
    if os.environ.get("QQ_DISPATCH_RUNTIME_ROOT") != os.fspath(root):
        raise Refusal("probe verification runtime root is not the exact exported identity")
    if (os.environ.get("QQ_ACTIVATION_PROBE_ID") != probe["probe_id"]
            or os.environ.get("QQ_ACTIVATION_EXPECTED_WATCHER_VERSION") != probe["expected_watcher_version"]
            or probe["expected_watcher_version"] != WATCHER_VERSION):
        raise Refusal("probe verification environment does not bind the exported probe and watcher identity")
    activation = safe_directory(root / ".qq-activation", "probe activation root")
    receipts: list[dict[str, Any]] = []
    watchers: list[dict[str, Any]] = []
    for run_dir in safe_children(activation, "probe activation root"):
        if run_dir.is_symlink() or not run_dir.is_dir():
            continue
        request_path = run_dir / "REQUEST.json"
        if not request_path.exists():
            continue
        request = validate_request_shape(load_json(request_path, "probe activation request"))
        if request.get("probe_id") != probe["probe_id"]:
            continue
        for target in request["targets"]:
            receipt_path = run_dir / "receipts" / f"{target['token']}.json"
            receipt = load_json(receipt_path, "probe activation receipt")
            if receipt.get("status") != "activated" or receipt.get("running_watcher_version") != WATCHER_VERSION or receipt.get("resource_fingerprint") != request["resource_fingerprint"]:
                raise Refusal("probe receipt does not prove the expected post-reload watcher and fingerprint")
            receipts.append(receipt)
    watchers_root = root / ".qq-activation-watchers"
    if watchers_root.exists():
        watchers_root = safe_directory(watchers_root, "probe watcher evidence")
        for path in safe_children(watchers_root, "probe watcher evidence"):
            if path.is_file() and not path.is_symlink():
                record = load_json(path, "probe watcher evidence")
                if (record.get("probe_id") == probe["probe_id"]
                        and record.get("expected_watcher_version") == WATCHER_VERSION
                        and record.get("running_watcher_version") == WATCHER_VERSION):
                    watchers.append(record)
    for receipt in receipts:
        if not any(
            watcher.get("probe_id") == probe["probe_id"]
            and watcher.get("process_id") == receipt.get("process_id")
            and watcher.get("session_path") == receipt.get("session_path")
            and watcher.get("start_reason") == "reload"
            and watcher.get("running_watcher_version") == receipt.get("running_watcher_version")
            and watcher.get("resource_fingerprint") == receipt.get("resource_fingerprint")
            for watcher in watchers
        ):
            raise Refusal("probe receipt is not bound to an exact running post-reload watcher record")
    if len(receipts) < args.minimum or len(watchers) < args.minimum:
        raise Refusal("probe has insufficient exact post-reload watcher receipts")
    json_output({"status": "verified", "expected_watcher_version": WATCHER_VERSION, "receipts": receipts, "watchers": watchers})


def write_helper(run_dir: Path, token: str, value: dict[str, Any], *, replace: bool) -> None:
    helpers = run_dir / "helpers"
    try:
        helpers.mkdir(mode=0o700, exist_ok=True)
    except OSError as error:
        raise Refusal("replacement helper record directory cannot be created") from error
    helpers = safe_directory(helpers, "replacement helper records")
    atomic_json(helpers / f"{token}.json", value, replace=replace)


def write_helper_acceptance(descriptor: int, value: dict[str, Any]) -> None:
    if descriptor < 3:
        raise Refusal("replacement helper acceptance descriptor is unsafe")
    body = (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode()
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            stream.write(body)
            stream.flush()
    except OSError as error:
        raise Refusal("replacement helper could not acknowledge launch ownership") from error


def command_replace(args: argparse.Namespace) -> None:
    run_dir = safe_directory(Path(args.run), "activation run")
    request = validate_request_shape(load_json(run_dir / "REQUEST.json", "activation request"))
    if request["action"] != "replace" or request["replacement"] != "pi-session-cwd-v1":
        raise Refusal("activation request does not authorize replacement")
    matches = [target for target in request["targets"] if target.get("token") == args.target]
    if len(matches) != 1:
        raise Refusal("replacement target identity is absent or ambiguous")
    target = matches[0]
    pane = target["pane_id"]
    status = {
        "schema": "qq.activation-replacement", "version": 1, "run_id": request["run_id"],
        "target": args.target, "pane_id": pane, "old_pid": args.old_pid,
        "helper_pid": os.getpid(), "status": "waiting-for-graceful-shutdown",
        "expected_watcher_version": WATCHER_VERSION,
        "resource_fingerprint": request["resource_fingerprint"], "updated_at": now(),
    }
    owns_request = False
    try:
        herdr = shutil.which("herdr")
        if not herdr:
            raise Refusal("herdr is unavailable to the replacement lifecycle")
        try:
            write_helper(run_dir, args.target, status, replace=False)
        except FileExistsError as error:
            raise Refusal("replacement helper ownership is already claimed") from error
        owns_request = True
        if args.accept_fd is not None:
            write_helper_acceptance(args.accept_fd, {
                "schema": "qq.activation-replacement-acceptance", "version": 1,
                "status": "accepted", "run_id": request["run_id"], "target": args.target,
                "pane_id": pane, "old_pid": args.old_pid, "helper_pid": os.getpid(),
                "expected_watcher_version": WATCHER_VERSION,
                "resource_fingerprint": request["resource_fingerprint"],
            })
        run([herdr, "agent", "wait", pane, "--until", "unknown", "--timeout", "30000"], timeout=35)
        pane_doc = json.loads(run([herdr, "pane", "get", pane]).decode())
        observed = pane_doc.get("result", {}).get("pane", {})
        if observed.get("pane_id") != pane or observed.get("tab_id") != target["tab_id"] or observed.get("workspace_id") != target["workspace_id"]:
            raise Refusal("replacement pane authority changed after shutdown")
        observed_cwd = observed.get("cwd")
        if not isinstance(observed_cwd, str) or Path(observed_cwd).resolve(strict=True) != Path(target["cwd"]).resolve(strict=True):
            raise Refusal("replacement pane cwd changed after shutdown")
        name = target.get("name") or f"qq-replacement-{args.target[:12]}"
        output = run([
            herdr, "agent", "start", name, "--kind", "pi", "--pane", pane,
            "--timeout", "30000", "--", "--session", target["session_path"],
        ], timeout=35)
        started = json.loads(output)
        result = started.get("result", {})
        agent = result.get("agent", {})
        if result.get("type") not in {"agent_started", "agent_start"} or agent.get("pane_id") != pane:
            raise Refusal("Herdr replacement start did not return a recognized result for the exact pane")
        status.update({"status": "started", "updated_at": now()})
        write_helper(run_dir, args.target, status, replace=True)
    except (Refusal, json.JSONDecodeError, OSError) as error:
        if owns_request:
            status.update({"status": "failed", "error": str(error)[:500], "updated_at": now()})
            write_helper(run_dir, args.target, status, replace=True)
        raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="qq-activation")
    commands = result.add_subparsers(dest="command", required=True)
    classify = commands.add_parser("classify")
    classify.add_argument("--repo", required=True)
    classify.add_argument("--before", required=True)
    classify.add_argument("--after", required=True)
    classify.add_argument("--pr-body-file", required=True)
    classify.set_defaults(function=command_classify)
    targets = commands.add_parser("targets")
    targets.set_defaults(function=command_targets)
    for name, function in (("stage", command_stage), ("arm", command_arm), ("cancel", command_cancel)):
        item = commands.add_parser(name)
        item.add_argument("--runtime-root", required=True)
        if name != "stage":
            item.add_argument("--run-id", required=True)
        item.set_defaults(function=function)
    recover = commands.add_parser("recover-pending")
    recover.add_argument("--runtime-root", required=True)
    recover.add_argument("--landed-tree", required=True)
    recover.add_argument("--merge-commit", required=True)
    recover.set_defaults(function=command_recover_pending)
    recover_existing = commands.add_parser("recover-existing")
    recover_existing.add_argument("--runtime-root", required=True)
    recover_existing.add_argument("--landed-tree", required=True)
    recover_existing.add_argument("--merge-commit", required=True)
    recover_existing.set_defaults(function=command_recover_existing)
    retire_change = commands.add_parser("retire-change")
    retire_change.add_argument("--runtime-root", required=True)
    retire_change.add_argument("--source-branch", required=True)
    retire_change.add_argument("--pull-request")
    retire_change.add_argument("--herdr-bin", required=True)
    retire_change.add_argument("--inspect", action="store_true")
    retire_change.set_defaults(function=command_retire_change)
    prepare = commands.add_parser("probe-prepare")
    prepare.add_argument("--runtime-root", required=True)
    prepare.set_defaults(function=command_probe_prepare)
    validate = commands.add_parser("probe-validate")
    validate.add_argument("--runtime-root", required=True)
    validate.set_defaults(function=command_probe_validate)
    request = commands.add_parser("probe-request")
    request.add_argument("--runtime-root", required=True)
    request.add_argument("--repo", required=True)
    request.add_argument("--pane", action="append", required=True)
    request.set_defaults(function=command_probe_request)
    verify = commands.add_parser("probe-verify")
    verify.add_argument("--runtime-root", required=True)
    verify.add_argument("--minimum", type=int, default=2)
    verify.set_defaults(function=command_probe_verify)
    replace = commands.add_parser("replace")
    replace.add_argument("--run", required=True)
    replace.add_argument("--target", required=True)
    replace.add_argument("--old-pid", type=int, required=True)
    replace.add_argument("--accept-fd", type=int)
    replace.set_defaults(function=command_replace)
    return result


def main() -> None:
    args = parser().parse_args()
    args.function(args)


if __name__ == "__main__":
    try:
        main()
    except Refusal as error:
        fail(str(error))
