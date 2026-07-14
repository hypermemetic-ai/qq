#!/usr/bin/env python3
"""Verify a browser merge for a qq-linked Repository and activate its maintainer."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
from typing import Any
from urllib.parse import parse_qs, urlparse


PR_URL = re.compile(
    r"https://github\.com/(?P<owner>[A-Za-z0-9][A-Za-z0-9-]*)/"
    r"(?P<repo>[A-Za-z0-9_.-]+)/pull/(?P<number>[1-9][0-9]*)"
)
SHA = re.compile(r"[0-9a-f]{40}")
GITHUB_REMOTE = re.compile(
    r"(?:git@github\.com:|https://github\.com/|ssh://git@github\.com/)"
    r"(?P<slug>[^/]+/[^/]+?)(?:\.git)?$",
    re.IGNORECASE,
)


class ActivationError(RuntimeError):
    """A refused activation or failed local dispatch."""


def executable(command: str) -> str:
    resolver = Path(__file__).resolve().parent / "lib" / "qq-bin.sh"
    try:
        completed = subprocess.run(
            [str(resolver), command],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ActivationError(f"binary resolver failed for {command}: {error}") from error
    if completed.returncode != 0:
        detail = completed.stderr.strip().removeprefix("qq-bin: ")
        raise ActivationError(detail or f"binary resolver failed for {command}")
    fields = completed.stdout.split("\0")
    if len(fields) != 3 or fields[2] or not fields[0]:
        raise ActivationError(f"binary resolver returned invalid output for {command}")
    path, path_prepend, _ = fields
    if path_prepend:
        current_path = os.environ.get("PATH", "")
        entries = current_path.split(os.pathsep) if current_path else []
        if path_prepend not in entries:
            os.environ["PATH"] = os.pathsep.join([path_prepend, *entries])
    return path


def run(arguments: list[str], *, timeout: float = 20) -> str:
    try:
        completed = subprocess.run(
            arguments,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ActivationError(f"command failed: {arguments[0]}: {error}") from error
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise ActivationError(f"command failed: {arguments[0]}: {detail}")
    return completed.stdout


def run_json(arguments: list[str], *, timeout: float = 20) -> dict[str, Any]:
    output = run(arguments, timeout=timeout)
    try:
        value = json.loads(output)
    except json.JSONDecodeError as error:
        raise ActivationError(f"command returned invalid JSON: {arguments[0]}") from error
    if not isinstance(value, dict):
        raise ActivationError(f"command returned non-object JSON: {arguments[0]}")
    return value


def parse_activation(argument: str) -> str:
    if PR_URL.fullmatch(argument):
        return argument
    parsed = urlparse(argument)
    if (
        parsed.scheme != "qq-openwiki"
        or parsed.netloc != "activate"
        or parsed.path not in ("", "/")
        or parsed.params
        or parsed.fragment
    ):
        raise ActivationError("refusing malformed qq-openwiki activation URL")
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    if set(query) != {"pr"} or len(query["pr"]) != 1:
        raise ActivationError("activation URL must contain exactly one pr parameter")
    pull_request = query["pr"][0]
    if PR_URL.fullmatch(pull_request) is None:
        raise ActivationError("refusing malformed GitHub pull-request URL")
    return pull_request


def qq_root() -> Path:
    return Path(__file__).resolve().parent.parent


def project_roots() -> list[Path]:
    configured = os.environ.get("QQ_PROJECT_ROOTS")
    values = configured.split(os.pathsep) if configured else [str(Path.home() / "projects")]
    roots: list[Path] = []
    for value in values:
        root = Path(value).expanduser()
        if not root.is_absolute() or not root.is_dir():
            raise ActivationError(f"project root unavailable: {root}")
        roots.append(root.resolve())
    return roots


def repositories_below(root: Path) -> list[Path]:
    repositories: list[Path] = []
    for current, directories, files in os.walk(root):
        git_marker = ".git" in directories or ".git" in files
        directories[:] = [
            name
            for name in directories
            if name not in {"node_modules", "vendor", "target", "dist", "build"}
            and not name.startswith(".")
        ]
        repository = Path(current).resolve()
        # Configured roots are search containers, never repository candidates.
        if repository != root and git_marker:
            repositories.append(repository)
            directories[:] = []
    return repositories


def remote_slug(repository: Path, git: str) -> str | None:
    try:
        remote = run([git, "-C", str(repository), "remote", "get-url", "origin"])
    except ActivationError:
        return None
    match = GITHUB_REMOTE.fullmatch(remote.strip())
    return match.group("slug").removesuffix(".git") if match else None


def linked_repository(slug: str) -> Path | None:
    git = executable("git")
    roots = project_roots()
    containers = set(roots)
    matches = {
        repository
        for root in roots
        for repository in repositories_below(root)
        if repository not in containers
        and (remote_slug(repository, git) or "").casefold() == slug.casefold()
    }
    if len(matches) > 1:
        raise ActivationError(f"multiple local checkouts match GitHub Repository {slug}")
    if not matches:
        return None
    repository = matches.pop()
    canonical_qq = qq_root().resolve()
    agents = repository / "AGENTS.md"
    if repository == canonical_qq:
        return repository if agents.resolve() == (canonical_qq / "AGENTS.md").resolve() else None
    if not agents.is_symlink():
        return None
    return repository if agents.resolve() == (canonical_qq / "AGENTS.md").resolve() else None


def retry_configuration() -> tuple[int, float]:
    attempts = int(os.environ.get("QQ_OPENWIKI_ACTIVATE_ATTEMPTS", "30"))
    interval = float(os.environ.get("QQ_OPENWIKI_ACTIVATE_INTERVAL", "1"))
    if attempts < 1 or attempts > 120 or interval < 0 or interval > 10:
        raise ActivationError("invalid activation retry configuration")
    return attempts, interval


def verify_merge(url: str) -> dict[str, str] | None:
    match = PR_URL.fullmatch(url)
    if match is None:
        raise ActivationError("refusing malformed GitHub pull-request URL")
    slug = f"{match.group('owner')}/{match.group('repo')}"
    repository = linked_repository(slug)
    if repository is None:
        return None

    gh = executable("gh")
    operator = run([gh, "api", "user", "--jq", ".login"]).strip()
    if not operator:
        raise ActivationError("GitHub authenticated operator login is empty")
    attempts, interval = retry_configuration()

    fields = "state,mergedAt,mergeCommit,baseRefName,headRefName,url,mergedBy"
    payload: dict[str, Any] | None = None
    for attempt in range(attempts):
        payload = run_json([gh, "pr", "view", url, "--repo", slug, "--json", fields])
        if payload.get("state") == "MERGED":
            break
        if attempt + 1 < attempts:
            time.sleep(interval)
    if not payload or payload.get("state") != "MERGED":
        return None
    returned_url = payload.get("url")
    returned = PR_URL.fullmatch(returned_url) if isinstance(returned_url, str) else None
    if (
        returned is None
        or returned.group("owner").casefold() != match.group("owner").casefold()
        or returned.group("repo").casefold() != match.group("repo").casefold()
        or returned.group("number") != match.group("number")
    ):
        raise ActivationError("GitHub returned a different pull-request URL")
    if payload.get("baseRefName") != "main" or payload.get("headRefName") == "openwiki/update":
        return None
    merged_by = payload.get("mergedBy")
    merged_login = merged_by.get("login") if isinstance(merged_by, dict) else None
    if not isinstance(merged_login, str) or merged_login.casefold() != operator.casefold():
        return None
    merge_commit = payload.get("mergeCommit")
    merge_sha = merge_commit.get("oid") if isinstance(merge_commit, dict) else None
    if not isinstance(merge_sha, str) or SHA.fullmatch(merge_sha) is None:
        raise ActivationError("GitHub returned an invalid merge commit")
    if not isinstance(payload.get("mergedAt"), str) or not payload["mergedAt"]:
        raise ActivationError("GitHub returned no merge timestamp")
    return {
        "url": url,
        "slug": slug,
        "repository": str(repository),
        "merge_sha": merge_sha,
    }


def openwiki_worktree(repository: Path) -> Path:
    git = executable("git")
    output = run([git, "-C", str(repository), "worktree", "list", "--porcelain"])
    matches: list[Path] = []
    current: Path | None = None
    for line in output.splitlines():
        if line.startswith("worktree "):
            current = Path(line.removeprefix("worktree ")).resolve()
        elif line == "branch refs/heads/openwiki/update" and current is not None:
            matches.append(current)
    if len(matches) != 1:
        raise ActivationError(
            f"expected exactly one openwiki/update worktree for {repository}, found {len(matches)}"
        )
    return matches[0]


def workspace_id(opened: dict[str, Any]) -> str:
    result = opened.get("result")
    if not isinstance(result, dict):
        raise ActivationError("Herdr worktree open returned no result")
    workspace = result.get("workspace")
    if isinstance(workspace, dict) and isinstance(workspace.get("workspace_id"), str):
        return workspace["workspace_id"]
    worktree = result.get("worktree")
    if isinstance(worktree, dict) and isinstance(worktree.get("open_workspace_id"), str):
        return worktree["open_workspace_id"]
    raise ActivationError("Herdr worktree open returned no workspace id")


def placeholder_pane(herdr: str, opened: dict[str, Any], workspace: str) -> str:
    result = opened.get("result")
    root = result.get("root_pane") if isinstance(result, dict) else None
    opened_workspace = result.get("workspace") if isinstance(result, dict) else None
    pane = root.get("pane_id") if isinstance(root, dict) else None
    if (
        not isinstance(pane, str)
        or not pane
        or root.get("workspace_id") != workspace
        or root.get("agent") is not None
        or root.get("agent_session") is not None
        or not isinstance(opened_workspace, dict)
        or opened_workspace.get("workspace_id") != workspace
        or opened_workspace.get("pane_count") != 1
    ):
        raise ActivationError("Herdr worktree did not return one unassigned root pane")
    process = run_json([herdr, "pane", "process-info", "--pane", pane])
    process_result = process.get("result")
    info = process_result.get("process_info") if isinstance(process_result, dict) else None
    foreground = info.get("foreground_processes") if isinstance(info, dict) else None
    shell = info.get("shell_pid") if isinstance(info, dict) else None
    if (
        shell is None
        or info.get("foreground_process_group_id") != shell
        or not isinstance(foreground, list)
        or len(foreground) != 1
        or not isinstance(foreground[0], dict)
        or foreground[0].get("pid") != shell
    ):
        raise ActivationError("OpenWiki worktree root pane is not an idle shell")
    return pane


def maintainer_name(slug: str) -> str:
    normalized = slug.casefold()
    readable = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")[:32]
    digest = hashlib.sha256(normalized.encode()).hexdigest()[:8]
    return f"openwiki-{readable}-{digest}"


def named_agent(herdr: str, name: str) -> dict[str, Any] | None:
    arguments = [herdr, "agent", "get", name]
    try:
        completed = subprocess.run(
            arguments,
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ActivationError(f"command failed: {herdr}: {error}") from error
    raw = completed.stdout.strip() or completed.stderr.strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ActivationError(f"command returned invalid JSON: {herdr}") from error
    if not isinstance(payload, dict):
        raise ActivationError(f"command returned non-object JSON: {herdr}")
    if completed.returncode != 0:
        failure = payload.get("error")
        if isinstance(failure, dict) and failure.get("code") == "agent_not_found":
            return None
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise ActivationError(f"command failed: {herdr}: {detail}")
    result = payload.get("result")
    agent = result.get("agent") if isinstance(result, dict) else None
    if not isinstance(agent, dict):
        raise ActivationError("Herdr agent get returned no agent")
    return agent


def wait_for_codex_agent(herdr: str, pane: str) -> dict[str, Any]:
    attempts, interval = retry_configuration()
    for attempt in range(attempts):
        agent = named_agent(herdr, pane)
        detected = agent.get("agent") if isinstance(agent, dict) else None
        if detected == "codex":
            return agent
        if detected is not None:
            raise ActivationError("OpenWiki placeholder started a non-Codex agent")
        if attempt + 1 < attempts:
            time.sleep(interval)
    raise ActivationError("OpenWiki maintainer was not detected in its placeholder")


def write_marker(path: Path, payload: dict[str, str], *, exclusive: bool) -> None:
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    created = False
    try:
        descriptor = os.open(path, flags, 0o600)
        created = exclusive
        with os.fdopen(descriptor, "w", encoding="utf-8") as marker:
            json.dump(payload, marker, sort_keys=True)
            marker.write("\n")
            marker.flush()
            os.fsync(marker.fileno())
        if exclusive:
            directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
            directory = os.open(path.parent, directory_flags)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    except OSError as error:
        if created:
            path.unlink(missing_ok=True)
        raise ActivationError(f"cannot record activation marker {path}: {error}") from error


def retryable_marker(path: Path) -> bool:
    try:
        with path.open(encoding="utf-8") as marker:
            payload = json.load(marker)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    return isinstance(payload, dict) and payload.get("action") == "failed"


def dispatch(merge: dict[str, str], marker: Path, *, exclusive_marker: bool) -> str:
    repository = Path(merge["repository"])
    worktree = openwiki_worktree(repository)
    herdr = executable("herdr")
    codex = executable("codex")
    agent_name = maintainer_name(merge["slug"])
    active = named_agent(herdr, agent_name)
    if active is not None and (
        active.get("agent") != "codex"
        or not isinstance(active.get("pane_id"), str)
        or not active["pane_id"]
    ):
        raise ActivationError("named OpenWiki agent is not an active Codex session")
    opened = run_json(
        [
            herdr,
            "worktree",
            "open",
            "--cwd",
            str(repository),
            "--path",
            str(worktree),
            "--no-focus",
            "--json",
        ]
    )
    workspace = workspace_id(opened)

    prompt = (
        "Use $openwiki-maintainer to process the landed main advance ending at "
        f"{merge['merge_sha']} for {merge['slug']} from {merge['url']} and deliver or supersede "
        "the OpenWiki update Change."
    )
    marker_written = False
    try:
        if active is not None:
            if active.get("workspace_id") != workspace:
                raise ActivationError("named OpenWiki agent is not active in its dedicated workspace")
            write_marker(
                marker,
                {**merge, "action": "dispatching", "agent": agent_name},
                exclusive=exclusive_marker,
            )
            marker_written = True
            pane = active["pane_id"]
            run([herdr, "pane", "run", pane, prompt])
            return "woke"
        pane = placeholder_pane(herdr, opened, workspace)
        write_marker(
            marker,
            {**merge, "action": "dispatching", "agent": agent_name},
            exclusive=exclusive_marker,
        )
        marker_written = True
        command = shlex.join([codex, "-C", str(worktree), prompt])
        run([herdr, "pane", "run", pane, command])
        launched = wait_for_codex_agent(herdr, pane)
        if launched.get("pane_id") != pane or launched.get("workspace_id") != workspace:
            raise ActivationError("detected OpenWiki maintainer left its placeholder")
        run([herdr, "agent", "rename", pane, agent_name])
        active = named_agent(herdr, agent_name)
        if (
            active is None
            or active.get("agent") != "codex"
            or active.get("pane_id") != pane
            or active.get("workspace_id") != workspace
        ):
            raise ActivationError("OpenWiki maintainer name did not resolve to its placeholder")
        return "launched"
    except ActivationError:
        if marker_written:
            write_marker(marker, {**merge, "action": "failed", "agent": agent_name}, exclusive=False)
        raise


def state_directory(slug: str) -> Path:
    override = os.environ.get("QQ_OPENWIKI_ACTIVATE_STATE_DIR")
    if override:
        base = Path(override)
    else:
        base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
        base = base / "qq" / "openwiki-activate"
    directory = base / slug.casefold().replace("/", "--")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    return directory


def activate(url: str) -> dict[str, str]:
    match = PR_URL.fullmatch(url)
    if match is None:
        raise ActivationError("refusing malformed GitHub pull-request URL")
    slug = f"{match.group('owner')}/{match.group('repo')}"
    directory = state_directory(slug)
    lock_path = directory / "activate.lock"
    with lock_path.open("a+", encoding="utf-8") as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        merge = verify_merge(url)
        if merge is None:
            return {"status": "ignored", "reason": "not-an-eligible-qq-linked-merge"}
        marker = directory / f"{merge['merge_sha']}.json"
        marker_exists = marker.exists()
        if marker_exists and not retryable_marker(marker):
            return {
                "status": "ignored",
                "reason": "already-dispatched",
                "merge_sha": merge["merge_sha"],
            }
        action = dispatch(merge, marker, exclusive_marker=not marker_exists)
        write_marker(marker, {**merge, "action": action}, exclusive=False)
        return {
            "status": "dispatched",
            "action": action,
            "merge_sha": merge["merge_sha"],
            "repository": merge["slug"],
        }


def notify_activation_error(error: ActivationError) -> None:
    try:
        herdr = executable("herdr")
        subprocess.run(
            [herdr, "notification", "show", "qq-openwiki-activate", "--body", str(error)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (ActivationError, OSError, subprocess.TimeoutExpired):
        pass


def main() -> int:
    if len(sys.argv) != 2:
        print("qq-openwiki-activate: usage: qq-openwiki-activate <qq-openwiki:// URL or GitHub PR URL>", file=sys.stderr)
        return 2
    try:
        result = activate(parse_activation(sys.argv[1]))
    except ActivationError as error:
        notify_activation_error(error)
        print(f"qq-openwiki-activate: {error}", file=sys.stderr)
        return 1
    except ValueError as error:
        print(f"qq-openwiki-activate: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
