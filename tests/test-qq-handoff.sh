#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-handoff"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
ENGINE="$ROOT/bin/qq-handoff"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v python3 >/dev/null 2>&1 || fail 'python3 is required'
command -v jq >/dev/null 2>&1 || fail 'jq is required'

python3 - "$ENGINE" "$TMP" <<'PY'
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

engine_source_text, scratch_text = sys.argv[1:]
engine_source = Path(engine_source_text)
scratch = Path(scratch_text)
repo = scratch / "repo"
change = scratch / "change ; touch PATH_INJECTION_RAN"
second = scratch / "second"
fake = scratch / "herdr"
log = scratch / "herdr.jsonl"
state = scratch / "state.json"
outside = scratch / "outside.md"


def command(*argv, cwd=None, check=True):
    return subprocess.run(argv, cwd=cwd, text=True, capture_output=True, check=check)


command("git", "init", "-q", "-b", "main", str(repo))
(repo / "bin" / "lib").mkdir(parents=True)
(repo / "backlog").mkdir()
(repo / "backlog" / "config.yml").write_text('task_prefix: "t"\n', encoding="utf-8")
engine = repo / "bin" / "qq-handoff"
shutil.copy2(engine_source, engine)
shutil.copy2(engine_source.parent / "lib" / "qq-bin.sh", repo / "bin" / "lib" / "qq-bin.sh")
shutil.copy2(engine_source.parent / "lib" / "qq-handoff.py", repo / "bin" / "lib" / "qq-handoff.py")
shutil.copy2(engine_source.parent / "lib" / "qq_task_identity.py", repo / "bin" / "lib" / "qq_task_identity.py")
command("git", "-C", str(repo), "remote", "add", "origin", "git@github.com:fixture/repo.git")
command("git", "-C", str(repo), "config", "branch.main.remote", "origin")
command("git", "-C", str(repo), "add", "bin", "backlog")
command("git", "-C", str(repo), "-c", "user.name=test", "-c", "user.email=test@example.com",
        "commit", "-qm", "initial")
command("git", "-C", str(repo), "worktree", "add", "-qb", "feat/change", str(change))
main = str(repo.resolve())
checkout = str(change.resolve())
common = command("git", "-C", main, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()

task_dir = change / "backlog" / "tasks"
plan_dir = change / "backlog" / "docs" / "plans"
task_path = task_dir / "t-155 - Fixture.md"
plan_path = plan_dir / "doc-90 - Fixture.md"
dirty_path = change / "dirty bytes.bin"

def task_text(status="In Progress", ledger="- none", documentation=("doc-90",), title="Fixture accountable handoff"):
    docs = "\n".join(f"  - {item}" for item in documentation)
    return f'''---
id: T-155
title: {title}
status: {status}
documentation:
{docs}
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Aligned fixture.

## Decision ledger

{ledger}
<!-- SECTION:DESCRIPTION:END -->
'''


def plan_text(identity="doc-90"):
    return f'''---
id: {identity}
title: Approved fixture plan
type: specification
---
**Status:** APPROVED
# Plan
'''


def restore_records():
    task_dir.mkdir(parents=True, exist_ok=True)
    plan_dir.mkdir(parents=True, exist_ok=True)
    for path in task_dir.iterdir():
        if path.is_dir() and not path.is_symlink(): shutil.rmtree(path)
        else: path.unlink()
    for path in plan_dir.iterdir():
        if path.is_dir() and not path.is_symlink(): shutil.rmtree(path)
        else: path.unlink()
    task_path.write_text(task_text(), encoding="utf-8")
    plan_path.write_text(plan_text(), encoding="utf-8")
    dirty_path.write_bytes(b"dirty\x00bytes\n")


fake.write_text(r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
log = Path(os.environ["FAKE_LOG"])
state_path = Path(os.environ["FAKE_STATE"])
mode = os.environ.get("FAKE_MODE", "success")
argv = sys.argv[1:]
with log.open("a", encoding="utf-8") as stream:
    stream.write(json.dumps(argv, separators=(",", ":")) + "\n")
try:
    current = json.loads(state_path.read_text())
except Exception:
    current = {"tab": False, "live": False}

def save(): state_path.write_text(json.dumps(current))
def emit(value, code=0):
    print(json.dumps(value, separators=(",", ":")))
    raise SystemExit(code)

def agent(pane="w:pCaller", cwd=None, foreground=None, name=None, state="idle"):
    row = {"agent":"pi","agent_status":state,"cwd":cwd or os.environ["FAKE_MAIN"],
           "foreground_cwd":foreground or os.environ["FAKE_MAIN"],"pane_id":pane,
           "tab_id":"w:tCaller" if pane == "w:pCaller" else "w:tNew","workspace_id":"w",
           "agent_session":{"agent":"pi","kind":"path","value":"/tmp/session"}}
    if name: row["name"] = name
    return row

key = argv[:2]
if key == ["workspace", "list"]:
    checkout_path = os.environ["FAKE_REL_MAIN"] if mode == "relative_home" else os.environ["FAKE_MAIN"]
    repo_key = os.environ["FAKE_REL_COMMON"] if mode == "relative_home" else os.environ["FAKE_COMMON"]
    worktree = {"checkout_path":checkout_path,"is_linked_worktree":False,
                "repo_key":repo_key,"repo_root":os.environ["FAKE_MAIN"]}
    rows = [] if mode == "no_home" else [{"workspace_id":"w","worktree":worktree}]
    if mode == "multi_home": rows.append({"workspace_id":"w2","worktree":worktree})
    emit({"result":{"type":"workspace_list","workspaces":rows}})
if key == ["agent", "list"]:
    rows = [] if mode == "no_caller" else [agent()]
    if mode == "ambiguous_caller": rows.append(agent())
    if mode == "owner_cwd": rows.append(agent("w:pOwner", os.environ["FAKE_CHANGE"], os.environ["FAKE_MAIN"], "owner", "done"))
    if mode == "owner_foreground": rows.append(agent("w:pOwner", os.environ["FAKE_MAIN"], os.environ["FAKE_CHANGE"], "owner", "blocked"))
    if mode == "owner_subdir": rows.append(agent("w:pOwner", os.environ["FAKE_CHANGE"] + "/backlog", os.environ["FAKE_MAIN"], "owner", "idle"))
    if mode == "malformed_agent": rows.append({"agent":"pi","pane_id":"w:pBad","tab_id":"w:tBad","workspace_id":"w","agent_status":7,"cwd":os.environ["FAKE_CHANGE"]})
    if mode == "startup_failed_other_agent" and current.get("tab"):
        rows.append({"agent":"codex","agent_status":"working","cwd":os.environ["FAKE_CHANGE"],
                     "foreground_cwd":os.environ["FAKE_CHANGE"],"pane_id":"w:pOther",
                     "tab_id":"w:tNew","workspace_id":"w"})
    if current.get("live"):
        target = os.environ["FAKE_MAIN"] if mode == "final_reinspection_mismatch" else current.get("target", os.environ["FAKE_CHANGE"])
        rows.append(agent("w:pNew", target, target, current.get("name"), "working"))
    emit({"result":{"type":"agent_list","agents":rows}})
if key == ["pane", "current"]:
    emit({"result":{"type":"pane_current","pane":{"pane_id":"w:pCaller"}}})
if key == ["pane", "get"]:
    pane = argv[2]
    if pane == "w:pCaller":
        emit({"result":{"pane":{"pane_id":pane,"tab_id":"w:tCaller","workspace_id":"w","agent":"pi"}}})
    emit({"result":{"pane":{"pane_id":pane,"tab_id":"w:tNew","workspace_id":"w","agent":"pi"}}})
if key == ["api", "snapshot"]:
    focus_elsewhere = mode == "focus_elsewhere"
    focused_workspace = "other" if focus_elsewhere else "w"
    focused_pane = "other:pFocused" if focus_elsewhere else "w:pCaller"
    focused_tab = "other:tFocused" if focus_elsewhere else "w:tCaller"
    panes = [{"pane_id":"w:pCaller"}]
    tabs = [{"tab_id":"w:tCaller"}]
    if current.get("tab"):
        panes.append({"pane_id":"w:pNew"}); tabs.append({"tab_id":"w:tNew"})
    emit({"result":{"type":"session_snapshot","snapshot":{"focused_workspace_id":focused_workspace,
         "focused_tab_id":focused_tab,"focused_pane_id":focused_pane,"panes":panes,"tabs":tabs}}})
if key == ["tab", "create"]:
    current["tab"] = True
    current["target"] = argv[argv.index("--cwd") + 1]; save()
    if mode == "create_malformed": print("{not-json"); raise SystemExit(0)
    created_cwd = os.environ["FAKE_REL_CHANGE"] if mode == "create_relative_cwd" else current["target"]
    emit({"result":{"type":"tab_created",
         "tab":{"tab_id":"w:tNew","workspace_id":"w","focused":False,"pane_count":1},
         "root_pane":{"pane_id":"w:pNew","tab_id":"w:tNew","workspace_id":"w",
                      "cwd":created_cwd,"focused":False}}})
if key == ["agent", "start"]:
    current["name"] = argv[2]
    if mode in ("startup_failed", "startup_failed_close_failed", "startup_failed_other_agent"):
        save(); emit({"error":{"code":"agent_start_failed","message":"fixture failure"}}, 1)
    current["live"] = True; save()
    if mode == "start_malformed": print("{not-json"); raise SystemExit(0)
    if mode == "start_invalid_utf8": sys.stdout.buffer.write(b"\xff"); raise SystemExit(0)
    if mode == "startup_uncertain": emit({"result":{"type":"timeout"}}, 124)
    started_cwd = os.environ["FAKE_REL_CHANGE"] if mode == "start_relative_cwd" else current.get("target", os.environ["FAKE_CHANGE"])
    started_argv = ["pi"] if mode == "start_wrong_argv" else ["pi", "--approve"]
    emit({"result":{"type":"agent_started","agent":{"agent":"pi","name":argv[2],
         "pane_id":"w:pNew","workspace_id":"w","cwd":started_cwd,
         "interactive_ready":True,"agent_session":{"agent":"pi","kind":"path","value":"/tmp/new-session"}},
         "argv":started_argv}})
if key == ["agent", "prompt"]:
    if mode == "prompt_malformed": print("{not-json"); raise SystemExit(0)
    if mode == "prompt_failed": emit({"result":{"type":"agent_prompt_failed"}}, 3)
    prompt_state = "idle" if mode == "prompt_idle" else "working"
    emit({"result":{"type":"agent_prompted","agent":{"agent":"pi","pane_id":"w:pNew","agent_status":prompt_state}}})
if key == ["agent", "focus"]:
    emit({"result":{"type":"agent_focused","agent":argv[2]}})
if key == ["tab", "get"]:
    label = "general" if mode == "wrong_architect_tab" else "architect"
    emit({"result":{"tab":{"tab_id":argv[2],"workspace_id":"w","label":label}}})
if key == ["tab", "close"]:
    if argv[2] != "w:tNew": emit({"result":{"type":"wrong_tab"}}, 3)
    if mode == "startup_failed_close_failed": emit({"error":{"code":"close_failed"}}, 1)
    current["tab"] = False; current["live"] = False; save(); emit({"result":{"type":"tab_closed","tab_id":argv[2]}})
if key == ["tab", "list"]:
    rows = [{"tab_id":"w:tCaller"}]
    if current.get("tab"): rows.append({"tab_id":"w:tNew"})
    emit({"result":{"tabs":rows}})
if key == ["pane", "list"]:
    rows = [{"pane_id":"w:pCaller"}]
    if current.get("tab"): rows.append({"pane_id":"w:pNew"})
    emit({"result":{"panes":rows}})
print("unexpected fake herdr argv", argv, file=sys.stderr)
raise SystemExit(64)
''', encoding="utf-8")
fake.chmod(0o755)
env = os.environ.copy()
env.update({"QQ_HERDR_BIN":str(fake), "FAKE_LOG":str(log), "FAKE_STATE":str(state),
            "FAKE_MAIN":main, "FAKE_CHANGE":checkout, "FAKE_COMMON":common,
            "FAKE_REL_MAIN":os.path.relpath(main), "FAKE_REL_CHANGE":os.path.relpath(checkout),
            "FAKE_REL_COMMON":os.path.relpath(common),
            "HERDR_PANE_ID":"w:pCaller",
            "XDG_STATE_HOME":str(scratch / "xdg-state")})


def reset(mode="success"):
    restore_records()
    log.write_text("")
    state.write_text('{"tab":false,"live":false}')
    env["FAKE_MODE"] = mode


def invoke(expected, *args):
    before = dirty_path.read_bytes() if dirty_path.exists() else None
    result = subprocess.run([engine, *args], env=env, text=True, capture_output=True)
    assert result.returncode == expected, (args, result.returncode, result.stdout, result.stderr)
    assert result.stderr == "", (args, result.stderr)
    receipt = json.loads(result.stdout)
    assert isinstance(receipt, dict) and result.stdout.count("\n") == 1
    if before is not None: assert dirty_path.read_bytes() == before, "dirty bytes changed"
    return receipt


def calls():
    return [json.loads(line) for line in log.read_text().splitlines()]


def assert_no_mutation():
    mutating = {("tab","create"),("tab","close"),("agent","start"),("agent","prompt"),("agent","focus")}
    assert not any(tuple(call[:2]) in mutating for call in calls()), calls()


def assert_no_focus_commands():
    forbidden = {("agent","focus"),("api","snapshot"),("pane","current")}
    assert not any(tuple(call[:2]) in forbidden for call in calls()), calls()

# Exact argument grammar and strict IDs stop before lifecycle inspection.
for args, code in [
    ((), 1), (("inspect",), 1), (("inspect","T-155"), 1),
    (("inspect","T-155","--repo"), 1), (("inspect","T-155","--repo",main,"extra"), 1),
    (("other","T-155","--repo",main), 1), (("inspect","T-155","--other",main), 1),
    (("inspect","--help","--repo",main), 2), (("inspect","T-0","--repo",main), 2),
    (("inspect","t-155","--repo",main), 2), (("inspect","T-01","--repo",main), 2),
    (("inspect","T-155.0","--repo",main), 2), (("inspect","T-155.2.3","--repo",main), 2),
    (("inspect","T-155/child","--repo",main), 2), (("inspect","FEAT-155","--repo",main), 2),
    (("inspect","T-155","--repo","--bad"), 1),
]:
    reset(); invoke(code, *args); assert calls() == []

# Baseline inspect is complete, read-only, and preserves dirty bytes.
reset()
receipt = invoke(0, "inspect", "T-155", "--repo", main)
assert receipt["status"] == "done" and receipt["task"]["title"] == "Fixture accountable handoff"
assert receipt["branch"] == "feat/change" and receipt["checkout"] == checkout
assert receipt["plans"] == [str(plan_path.resolve())]
assert [rail["name"] for rail in receipt["rails"]] == ["repository_topology","change_checkout","task_and_plan_evidence","duplicate_owner","caller_identity"]
caller_rail = next(rail for rail in receipt["rails"] if rail["name"] == "caller_identity")
assert "focused" not in caller_rail["evidence"]
assert_no_mutation()

# A direct child resolves exactly, preserving its complete identity without a surrogate Task.
reset()
child_path = task_dir / "t-155.3 - Child.md"
child_path.write_text(task_text().replace("id: T-155", "id: T-155.3"), encoding="utf-8")
child_receipt = invoke(0, "inspect", "T-155.3", "--repo", main)
assert child_receipt["task"]["id"] == "T-155.3"
assert child_receipt["task"]["path"] == str(child_path.resolve())
assert_no_mutation()

# The Repository config, not source edits, selects a non-t parent/direct-child prefix.
reset()
(repo / "backlog" / "config.yml").write_text('task_prefix: "feat"\n', encoding="utf-8")
task_path.unlink()
feat_path = task_dir / "feat-12.3 - Fixture.md"
feat_path.write_text(task_text().replace("id: T-155", "id: FEAT-12.3"), encoding="utf-8")
feat_receipt = invoke(0, "inspect", "FEAT-12.3", "--repo", main)
assert feat_receipt["task"]["id"] == "FEAT-12.3"
assert feat_receipt["task"]["path"] == str(feat_path.resolve())
assert_no_mutation()
(repo / "backlog" / "config.yml").write_text('task_prefix: "t"\n', encoding="utf-8")

# No candidate and primary-only evidence refuse without mutation.
reset(); task_path.unlink(); invoke(2, "inspect", "T-155", "--repo", main); assert_no_mutation()
reset(); task_path.unlink(); primary_task_dir = repo / "backlog" / "tasks"; primary_task_dir.mkdir(parents=True, exist_ok=True)
primary_task = primary_task_dir / task_path.name; primary_task.write_text(task_text());
invoke(2, "inspect", "T-155", "--repo", main); assert_no_mutation(); primary_task.unlink()

# Two linked candidates refuse; detached candidate and unavailable path refuse.
reset(); command("git","-C",main,"worktree","add","-qb","feat/second",str(second));
(second / "backlog/tasks").mkdir(parents=True); (second / "backlog/tasks" / task_path.name).write_text(task_text())
(second / "backlog/docs/plans").mkdir(parents=True); (second / "backlog/docs/plans" / plan_path.name).write_text(plan_text())
invoke(2, "inspect", "T-155", "--repo", main); assert_no_mutation()
command("git","-C",main,"worktree","remove","--force",str(second)); command("git","-C",main,"branch","-D","feat/second")
reset(); command("git","-C",checkout,"checkout","--detach","-q"); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
command("git","-C",checkout,"checkout","-q","feat/change")
reset(); moved = scratch / "temporarily missing"; change.rename(moved)
try: invoke(2,"inspect","T-155","--repo",main)
finally: moved.rename(change)

# A listed checkout resolving through a foreign gitdir cannot become the Change.
reset(); dotgit = change / ".git"; original_gitfile = dotgit.read_text(); foreign = scratch / "foreign"
command("git","init","-q","-b","other",str(foreign))
dotgit.write_text(f"gitdir: {foreign / '.git'}\n")
try:
    foreign_receipt = invoke(2,"inspect","T-155","--repo",main)
    assert "foreign" in foreign_receipt["message"].lower()
finally: dotgit.write_text(original_gitfile)

# Task status, ledger, and plan evidence rails.
for text in [task_text(status="Done"), task_text(ledger=""), task_text(documentation=()), task_text(documentation=("doc-99",)), task_text(documentation=("doc-90","doc-90"))]:
    reset(); task_path.write_text(text); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); task_path.write_text(task_text(ledger="none")); invoke(0,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); task_path.write_text(task_text(documentation=("doc-90", "doc-91"))); invoke(0,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); plan_path.write_text("---\nid: doc-90\nmalformed frontmatter\n---\n"); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); plan_path.unlink(); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); duplicate = plan_dir / "doc-90 - Duplicate.md"; duplicate.write_text(plan_text()); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); duplicate_task = task_dir / "t-155 - Duplicate.md"; duplicate_task.write_text(task_text()); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); outside.write_text(plan_text()); plan_path.unlink(); plan_path.symlink_to(outside); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset(); outside.write_text(task_text()); task_path.unlink(); task_path.symlink_to(outside); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()

# Home/caller ambiguity, owner matching by either cwd field, and malformed evidence.
for mode in ("no_home","multi_home","relative_home","no_caller","ambiguous_caller","owner_cwd","owner_foreground","owner_subdir","malformed_agent"):
    reset(mode); invoke(2,"inspect","T-155","--repo",main); assert_no_mutation()
reset("owner_cwd"); invoke(2,"start","T-155","--repo",main); assert_no_mutation()

# Malformed/hostile Herdr JSON refuses or errors before mutation.
malformed = scratch / "malformed-herdr"
malformed.write_text('#!/usr/bin/env bash\nprintf "{not-json"\n', encoding="utf-8"); malformed.chmod(0o755)
old_fake = env["QQ_HERDR_BIN"]; env["QQ_HERDR_BIN"] = str(malformed)
reset(); invoke(1,"inspect","T-155","--repo",main)
env["QQ_HERDR_BIN"] = old_fake

# Success is independent of foreign global focus and observes exact argv/order,
# bounded identifiers, fixed prompt, and receipt.
reset("focus_elsewhere")
hostile_marker = scratch / "TITLE_INJECTION_RAN"
task_path.write_text(task_text(ledger="- INHERITED_SECRET_SENTINEL", title=f'Hostile "; touch {hostile_marker}; echo title'))
receipt = invoke(0,"start","T-155","--repo",main)
assert not hostile_marker.exists()
assert not (scratch / "PATH_INJECTION_RAN").exists()
assert receipt["status"] == "done" and receipt["transaction"]["observed_state"] == "working"
assert "focus" not in receipt["message"].lower()
transaction = receipt["transaction"]
assert transaction["created_tab_id"] == "w:tNew" and transaction["created_pane_id"] == "w:pNew"
assert transaction["prompt_submission"]["working_transition_observed"] is True
assert "focus_restoration" not in transaction
assert transaction["agent_reinspection"]["present"] is True
assert transaction["agent_reinspection"]["verified"] is True
assert transaction["cleanup"] == "not_needed"
actual = calls()
sequence = [tuple(call[:2]) for call in actual]
expected = [("workspace","list"),("agent","list"),("pane","get"),
            ("tab","list"),("pane","list"),("tab","create"),("agent","start"),
            ("agent","prompt"),("agent","list")]
assert sequence == expected, sequence
assert_no_focus_commands()
create = next(call for call in actual if call[:2] == ["tab","create"])
assert create == ["tab","create","--workspace","w","--cwd",checkout,"--label",create[7],"--no-focus"]
assert len(create[7]) <= 48 and hostile_marker.name not in create[7]
start = next(call for call in actual if call[:2] == ["agent","start"])
assert start == ["agent","start",start[2],"--kind","pi","--pane","w:pNew",
                 "--timeout","60000","--","--approve"]
assert len(start[2]) <= 48
prompt_call = next(call for call in actual if call[:2] == ["agent","prompt"])
prompt = prompt_call[3]
for phrase in ("Take accountable ownership","already aligned; do not restart alignment","preserve all existing dirt",
               "skills/deliver-change/SKILL.md","fresh-context code review and fix-delta review","Never merge",
               "Report progress and results in this tab","No originating conversation"):
    assert phrase in prompt, phrase
assert "INHERITED_SECRET_SENTINEL" not in prompt
assert prompt_call[4:] == ["--wait","--until","working","--timeout","60000"]
assert hashlib.sha256(prompt.encode()).hexdigest() == transaction["prompt_submission"]["prompt_sha256"]

# A working prompt with mismatched final agent evidence stays an error and preserves the tab.
reset("final_reinspection_mismatch")
receipt = invoke(1,"start","T-155","--repo",main)
assert "final Pi reinspection was inconclusive" in receipt["message"]
assert receipt["transaction"]["observed_state"] == "working"
assert receipt["transaction"]["agent_reinspection"]["present"] is True
assert receipt["transaction"]["agent_reinspection"]["verified"] is False
assert receipt["transaction"]["cleanup"] == "not_needed"
assert_no_focus_commands()
assert not any(call[:2] == ["tab","close"] for call in calls())

# Proven pre-agent startup failure closes only the exact created tab and verifies absence.
reset("startup_failed")
receipt = invoke(1,"start","T-155","--repo",main)
assert receipt["transaction"]["cleanup"] == "closed_created_tab_verified_absent"
assert receipt["message"].endswith("cleanup outcome: closed_created_tab_verified_absent.")
assert "focus_restoration" not in receipt["transaction"]
assert_no_focus_commands()
close_calls = [call for call in calls() if call[:2] == ["tab","close"]]
assert close_calls == [["tab","close","w:tNew"]]

reset("startup_failed_close_failed")
receipt = invoke(1,"start","T-155","--repo",main)
assert receipt["transaction"]["cleanup"] == "close attempted but not confirmed; exact created tab preserved if present"
assert receipt["message"].endswith(f"cleanup outcome: {receipt['transaction']['cleanup']}.")
assert "closed_created_tab_verified_absent" not in receipt["message"]
assert json.loads(state.read_text())["tab"] is True
assert_no_focus_commands()

reset("startup_failed_other_agent")
receipt = invoke(1,"start","T-155","--repo",main)
assert receipt["transaction"]["cleanup"] == "created tab preserved; Pi may be live"
assert receipt["transaction"]["agent_reinspection"]["kind"] == "codex"
assert receipt["transaction"]["agent_reinspection"]["verified"] is False
assert json.loads(state.read_text())["tab"] is True
assert_no_focus_commands()
assert not any(call[:2] == ["tab","close"] for call in calls())

# A code-zero prompt receipt without the correlated working transition remains uncertain.
reset("prompt_idle")
receipt = invoke(1,"start","T-155","--repo",main)
assert receipt["transaction"]["prompt_submission"]["submitted"] is False
assert receipt["transaction"]["prompt_submission"]["working_transition_observed"] is False
assert receipt["transaction"]["cleanup"] == "created tab preserved; prompt may have been accepted"
assert_no_focus_commands()
assert not any(call[:2] == ["tab","close"] for call in calls())

# Timeout, malformed startup evidence, and prompt uncertainty preserve identifiers.
for mode in ("startup_uncertain","start_malformed","start_invalid_utf8","start_relative_cwd","start_wrong_argv","prompt_failed","prompt_malformed"):
    reset(mode); receipt = invoke(1,"start","T-155","--repo",main)
    assert receipt["transaction"]["created_tab_id"] == "w:tNew"
    assert "preserved" in receipt["transaction"]["cleanup"]
    assert_no_focus_commands()
    assert not any(call[:2] == ["tab","close"] for call in calls())

for mode in ("create_malformed", "create_relative_cwd"):
    reset(mode); receipt = invoke(1,"start","T-155","--repo",main)
    assert receipt["transaction"]["created_tab_id"] is None
    assert receipt["transaction"]["possible_new_tab_ids"] == ["w:tNew"]
    assert_no_focus_commands()
    assert not any(call[:2] == ["tab","close"] for call in calls())

# Without the invoking Pi's injected identity, global current focus is not a fallback.
reset(); env.pop("HERDR_PANE_ID")
missing_identity = invoke(2,"inspect","T-155","--repo",main)
assert "pane identity is unavailable" in missing_identity["message"]
assert_no_focus_commands(); assert_no_mutation()
env["HERDR_PANE_ID"] = "w:pCaller"

implementation = Path(engine).parent / "lib" / "qq-handoff.py"
sys.path.insert(0, str(implementation.parent))
spec = importlib.util.spec_from_file_location("qq_handoff_test", implementation)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
long_task = "T-" + ("9" * 60)
first_name = module.bounded_agent_name(long_task, "w:p-one")
second_name = module.bounded_agent_name(long_task, "w:p-two")
assert first_name != second_name
assert len(first_name) <= 48 and len(second_name) <= 48
assert first_name.endswith(hashlib.sha256(b"w:p-one").hexdigest()[:10])
assert second_name.endswith(hashlib.sha256(b"w:p-two").hexdigest()[:10])

print("test-qq-handoff: pass")
PY
