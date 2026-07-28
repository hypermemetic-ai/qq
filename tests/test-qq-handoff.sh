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
fake_gh = scratch / "gh"
fake_gh.write_text("""#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2" = "repo view" ]
printf '{"nameWithOwner":"fixture/repo"}\n'
""", encoding="utf-8")
fake_gh.chmod(0o755)

env = os.environ.copy()
env.update({"QQ_HERDR_BIN":str(fake), "FAKE_LOG":str(log), "FAKE_STATE":str(state),
            "FAKE_MAIN":main, "FAKE_CHANGE":checkout, "FAKE_COMMON":common,
            "FAKE_REL_MAIN":os.path.relpath(main), "FAKE_REL_CHANGE":os.path.relpath(checkout),
            "FAKE_REL_COMMON":os.path.relpath(common),
            "HERDR_PANE_ID":"w:pCaller", "QQ_GH_BIN":str(fake_gh),
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

# Typed Architect intake reuses the same transaction while targeting primary main.
reset()
run_dir = scratch / "xdg-state/qq/observer/runs/by-repository/fixture/source/pr-4"
routing = run_dir / "routing"; routing.mkdir(parents=True, exist_ok=True)
def canonical_write(path, value):
    path.write_text(json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n")


def install_handoff(path, immutable_value):
    identity = "handoff-" + hashlib.sha256(
        json.dumps(immutable_value, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()[:32]
    canonical_write(path, {
        "schema":"qq-observer.handoff","schema_version":1,"handoff_id":identity,
        **immutable_value,"created_at":"2026-08-01T00:00:00.000Z",
    })
    return identity


package_path = run_dir / "package.json"
analysis_path = run_dir / "analysis.json"
package = {
    "schema":"qq-observer.package","schema_version":2,"repo":"/fixture/source",
    "repository":"fixture/source","pr":4,"variant":"guided",
}
episode = {
    "recurrence_key":"alpha",
    "evidence":[{"session":"/fixture/session","entries":[1],"quote":"fixture"}],
}
analysis = {
    "schema":"qq-observer.analysis","schema_version":1,"episodes":[episode],
}
canonical_write(package_path, package)
canonical_write(analysis_path, analysis)
immutable = {
    "kind":"episode_batch",
    "round":{"run_dir":str(run_dir.resolve()),"repo":"/fixture/source","repository":"fixture/source","legacy":False,"pr":4,"variant":"guided"},
    "outcomes":[{"recurrence_key":"alpha","verdict":"accepted","scope":"Approved intake scope","note":""}],
    "evidence":[{"recurrence_key":"alpha","episode":episode}],
    "source_hashes":{
        "package.json":hashlib.sha256(package_path.read_bytes()).hexdigest(),
        "analysis.json":hashlib.sha256(analysis_path.read_bytes()).hexdigest(),
    },
}
handoff_path = routing / "handoff.json"
handoff_id = install_handoff(handoff_path, immutable)
original_package = package_path.read_bytes()
original_analysis = analysis_path.read_bytes()

def restore_episode_handoff():
    package_path.unlink(missing_ok=True)
    analysis_path.unlink(missing_ok=True)
    package_path.write_bytes(original_package)
    analysis_path.write_bytes(original_analysis)
    return install_handoff(handoff_path, immutable)


# Every cited source is validated before any Herdr lifecycle mutation.
analysis_path.unlink()
reset(); invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main); assert_no_mutation()
restore_episode_handoff()
analysis_path.write_bytes(original_analysis + b" ")
reset(); invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main); assert_no_mutation()
restore_episode_handoff()
outside_analysis = scratch / "outside-analysis.json"
outside_analysis.write_bytes(original_analysis)
analysis_path.unlink(); analysis_path.symlink_to(outside_analysis)
reset(); invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main); assert_no_mutation()
restore_episode_handoff()
wrong_kind = {"schema":"qq-observer.analysis","schema_version":1,
              "status":"analysis_failed","reason":"wrong kind"}
canonical_write(analysis_path, wrong_kind)
wrong_kind_handoff = json.loads(json.dumps(immutable))
wrong_kind_handoff["source_hashes"]["analysis.json"] = hashlib.sha256(analysis_path.read_bytes()).hexdigest()
install_handoff(handoff_path, wrong_kind_handoff)
reset(); invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main); assert_no_mutation()
restore_episode_handoff()
mismatched_package = {**package, "repository":"fixture/other"}
canonical_write(package_path, mismatched_package)
mismatched_handoff = json.loads(json.dumps(immutable))
mismatched_handoff["source_hashes"]["package.json"] = hashlib.sha256(package_path.read_bytes()).hexdigest()
install_handoff(handoff_path, mismatched_handoff)
reset(); invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main); assert_no_mutation()
handoff_id = restore_episode_handoff()

foreign_repo = scratch / "foreign-intake"
command("git", "init", "-q", "-b", "main", str(foreign_repo))
command("git", "-C", str(foreign_repo), "-c", "user.name=test", "-c", "user.email=test@example.com",
        "commit", "--allow-empty", "-qm", "initial")
reset()
foreign_receipt = invoke(2, "intake-start", "--handoff", str(handoff_path),
                         "--repo", str(foreign_repo))
assert "running qq engine" in foreign_receipt["message"]
assert_no_mutation()

reset("wrong_architect_tab")
wrong_tab_receipt = invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main)
assert "dedicated architect tab" in wrong_tab_receipt["message"]
assert_no_mutation()

# Architect intake authority is the live root Pi in qq's project home and dedicated
# architect tab even while another workspace, tab, and pane are globally focused.
reset("focus_elsewhere")
focus_independent_receipt = invoke(0, "intake-start", "--handoff", str(handoff_path), "--repo", main)
assert focus_independent_receipt["status"] == "done"
assert_no_focus_commands()

reset()
receipt = invoke(0, "intake-start", "--handoff", str(handoff_path), "--repo", main)
assert receipt["action"] == "intake-start" and receipt["handoff_id"] == handoff_id
assert receipt["checkout"] == main and receipt["transaction"]["observed_state"] == "working"
intake_prompt = next(call[3] for call in calls() if call[:2] == ["agent","prompt"])
for phrase in ("genuinely new Architect intake", "not approved implementation", "the align contract",
               "born-in-worktree Task", "record-handoff-result", "No originating conversation"):
    assert phrase in intake_prompt, phrase
# The deterministic handoff agent name prevents a second live recipient.
second_receipt = invoke(2, "intake-start", "--handoff", str(handoff_path), "--repo", main)
assert "already owns" in second_receipt["message"]
assert len([call for call in calls() if call[:2] == ["tab","create"]]) == 1

# A strict global multi-source handoff uses the same one-recipient lifecycle and decision-ID mapping.
def global_content_bytes(value):
    return (json.dumps(value,separators=(",",":"),sort_keys=True)+"\n").encode()
global_run = scratch / "xdg-state/qq/observer/runs/by-repository/fixture/global/pr-7"
global_run.mkdir(parents=True)
global_package_path = global_run / "package.json"
global_analysis_path = global_run / "analysis.json"
global_package = {"schema":"qq-observer.package","schema_version":2,"repo":"/fixture/global","repository":"fixture/global","pr":7,"variant":"guided","assembled_at":"2026-08-07T00:00:00Z"}
global_episode = {"rank":1,"recurrence_key":"global-alpha","evidence":[{"session":"/fixture/session","entries":[1],"quote":"global evidence"}]}
global_analysis = {"schema":"qq-observer.analysis","schema_version":1,"episodes":[global_episode]}
canonical_write(global_package_path, global_package); canonical_write(global_analysis_path, global_analysis)
source = {"run_dir":str(global_run.resolve()),"repo":"/fixture/global","repository":"fixture/global","legacy":False,"pr":7,"variant":"guided","assembled_at":"2026-08-07T00:00:00Z"}
package_sha = hashlib.sha256(global_package_path.read_bytes()).hexdigest(); analysis_sha = hashlib.sha256(global_analysis_path.read_bytes()).hexdigest()
occurrence_immutable = {"source":source,"package_sha256":package_sha,"analysis_sha256":analysis_sha,"rank":1,"recurrence_key":"global-alpha"}
occurrence_id = "occurrence-" + hashlib.sha256(global_content_bytes(occurrence_immutable)).hexdigest()[:32]
occurrence = {"occurrence_id":occurrence_id,"recurrence_key":"global-alpha","source":source,"package_sha256":package_sha,"analysis_sha256":analysis_sha,"episode":global_episode}
decision_input = {"recurrence_key":"global-alpha","occurrence_ids":[occurrence_id],"action":"route","scope":"Agreed global scope","note":""}
decision_id = "decision-" + hashlib.sha256(global_content_bytes(decision_input)).hexdigest()[:32]
decision = {"decision_id":decision_id,**decision_input}
global_immutable = {"context_id":"context-" + "a"*32,"decisions":[decision],"occurrences":[occurrence],"source_hashes":{occurrence_id:{"package_sha256":package_sha,"analysis_sha256":analysis_sha}}}
global_digest = hashlib.sha256(global_content_bytes(global_immutable)).hexdigest()[:32]
global_batch = scratch / f"xdg-state/qq/observer/architect/batches/batch-{global_digest}"
global_batch.mkdir(parents=True)
global_path = global_batch / "handoff.json"
canonical_write(global_path,{"schema":"qq-observer.handoff","schema_version":2,"handoff_id":f"handoff-{global_digest}","kind":"global_decision_batch","batch_id":global_batch.name,**global_immutable,"created_at":"2026-08-07T00:00:00.000Z"})
reset()
global_receipt = invoke(0, "intake-start", "--handoff", str(global_path), "--repo", main)
assert global_receipt["handoff_id"] == f"handoff-{global_digest}"
global_prompt = next(call[3] for call in calls() if call[:2] == ["agent","prompt"])
assert "global confirmed batch" not in global_prompt  # prose stays natural, identity stays data
assert f"record-handoff-result --batch {global_batch}" in global_prompt
assert occurrence_id in global_prompt and "No originating conversation" in global_prompt
reset()
global_mapping = scratch / "global-mapping.json"
global_mapping.write_text(json.dumps([{"item":decision_id,"task_ids":["T-155"]}]) + "\n")
global_result = invoke(0, "intake-result", "--handoff", str(global_path), "--mapping", str(global_mapping), "--repo", main)
assert global_result["mapping"] == [{"item":decision_id,"task_ids":["T-155"]}]
# Changed source bytes and noncanonical/symlinked handoffs fail before lifecycle mutation.
original_global_analysis = global_analysis_path.read_bytes(); global_analysis_path.write_bytes(original_global_analysis + b" ")
reset(); invoke(2, "intake-start", "--handoff", str(global_path), "--repo", main); assert_no_mutation()
global_analysis_path.write_bytes(original_global_analysis)
outside_global = scratch / "outside-global-handoff.json"; outside_global.write_bytes(global_path.read_bytes())
global_path.unlink(); global_path.symlink_to(outside_global)
reset(); invoke(2, "intake-start", "--handoff", str(global_path), "--repo", main); assert_no_mutation()
global_path.unlink(); global_path.write_bytes(outside_global.read_bytes())

# Failed legacy rounds retain explicit local identity and use the same intake lifecycle.
legacy_run = scratch / "xdg-state/qq/observer/runs/pr-9"
legacy_routing = legacy_run / "routing"
legacy_routing.mkdir(parents=True, exist_ok=True)
legacy_package_path = legacy_run / "package.json"
legacy_failure_path = legacy_run / "analysis_failed.json"
canonical_write(legacy_package_path, {
    "schema":"qq-observer.package","schema_version":1,"repo":"/legacy/source",
    "pr":9,"variant":"guided",
})
canonical_write(legacy_failure_path, {
    "schema":"qq-observer.analysis","schema_version":1,
    "status":"analysis_failed","reason":"fixture failure",
})
legacy_immutable = {
    "kind":"failed_round_recovery",
    "round":{"run_dir":str(legacy_run.resolve()),"repo":"/legacy/source","repository":None,"legacy":True,"pr":9,"variant":"guided"},
    "outcomes":[{"recurrence_key":"recovery","verdict":"accepted","scope":"Recover the failed run","note":""}],
    "evidence":[{"recurrence_key":"recovery","reason":"fixture failure","artifacts":[str(legacy_package_path),str(legacy_failure_path)]}],
    "source_hashes":{
        "package.json":hashlib.sha256(legacy_package_path.read_bytes()).hexdigest(),
        "analysis_failed.json":hashlib.sha256(legacy_failure_path.read_bytes()).hexdigest(),
    },
}
legacy_path = legacy_routing / "handoff.json"
legacy_id = install_handoff(legacy_path, legacy_immutable)
reset()
legacy_receipt = invoke(0, "intake-start", "--handoff", str(legacy_path), "--repo", main)
assert legacy_receipt["handoff_id"] == legacy_id and legacy_receipt["transaction"]["observed_state"] == "working"
legacy_create = next(call for call in calls() if call[:2] == ["tab","create"])
assert legacy_create[legacy_create.index("--label") + 1] == "architect-legacy-source-9"

# Verified result covers every routed key with current linked Task/plan/ledger evidence.
reset()
mapping = scratch / "mapping.json"
mapping.write_text('[{"item":"alpha","task_ids":["T-155"]}]\n')
result_receipt = invoke(0, "intake-result", "--handoff", str(handoff_path),
                        "--mapping", str(mapping), "--repo", main)
assert result_receipt["schema"] == "qq-handoff/intake-result-v1"
assert result_receipt["handoff_id"] == handoff_id
assert result_receipt["mapping"] == [{"item":"alpha","task_ids":["T-155"]}]
assert result_receipt["tasks"][0]["checkout"] == checkout
assert result_receipt["tasks"][0]["repository"] == "fixture/repo"
assert result_receipt["tasks"][0]["plan_paths"] == [str(plan_path.resolve())]

# Intake preserves direct children and sorts parent before child by numeric identity.
reset()
child_path = task_dir / "t-155.3 - Child.md"
child_path.write_text(task_text().replace("id: T-155", "id: T-155.3"), encoding="utf-8")
mapping.write_text('[{"item":"alpha","task_ids":["T-155.3","T-155"]}]\n')
child_result = invoke(0, "intake-result", "--handoff", str(handoff_path),
                      "--mapping", str(mapping), "--repo", main)
assert [task["task_id"] for task in child_result["tasks"]] == ["T-155", "T-155.3"]
assert child_result["mapping"] == [{"item":"alpha","task_ids":["T-155.3","T-155"]}]

reset()
mapping.write_text('[{"item":"alpha","task_ids":["T-155"]}]\n')
foreign_result = invoke(2, "intake-result", "--handoff", str(handoff_path),
                        "--mapping", str(mapping), "--repo", str(foreign_repo))
assert "running qq engine" in foreign_result["message"]
assert_no_mutation()

for bad in ([], [{"item":"other","task_ids":["T-155"]}], [{"item":"alpha","task_ids":[]}],
            [{"item":"alpha","task_ids":["T-0"]}],
            [{"item":"alpha","task_ids":["T-155.2.3"]}],
            [{"item":"alpha","task_ids":["FEAT-155.3"]}]):
    mapping.write_text(json.dumps(bad) + "\n")
    invoke(2, "intake-result", "--handoff", str(handoff_path),
           "--mapping", str(mapping), "--repo", main)

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
