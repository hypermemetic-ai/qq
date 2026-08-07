#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME=test-qq-role-identity
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
WRAPPER="$ROOT/bin/pi"
HELPER="$ROOT/bin/lib/qq_role_identity.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$ROOT/bin/qq-tab-role" ] || fail 'qq-tab-role wrapper is not executable'
[ -x "$WRAPPER" ] || fail 'Pi wrapper is not executable'
[ -f "$HELPER" ] || fail 'session-start role helper is missing'
[ ! -e "$ROOT/extensions/role-identity" ] || fail 'rejected runtime role extension remains'

# Retain direct proof for stable tags, board classification, exact resource
# identity, move-during-resolution refusal, and durable-work independence.
python3 - "$ROOT/bin/lib/qq_tab_role.py" "$TMP" <<'PY'
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
from types import SimpleNamespace
from unittest import mock
module_path, scratch_text = sys.argv[1:]
spec = importlib.util.spec_from_file_location("qq_tab_role_test", module_path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
scratch = Path(scratch_text)
state = scratch / "state"; state.mkdir(mode=0o700)
root = module.state_root(str(state))

class Herdr:
    def __init__(self):
        self.workspace = "wExact"; self.tab = "wExact:tStable"; self.pane = "wExact:p1"
        self.label = "architect"  # labels are display only and never authority
        self.board = False; self.second_tab = None; self.pane_reads = 0
    def __call__(self, argv):
        key = argv[:2]
        if key == ["tab", "get"]:
            return {"result":{"tab":{"tab_id":argv[2], "workspace_id":self.workspace, "label":self.label}}}
        if key == ["pane", "get"]:
            self.pane_reads += 1
            tab = self.second_tab if self.second_tab and self.pane_reads % 2 == 0 else self.tab
            return {"result":{"pane":{"pane_id":argv[2], "workspace_id":self.workspace, "tab_id":tab}}}
        if key == ["pane", "list"]:
            return {"result":{"panes":[{"pane_id":self.pane, "workspace_id":self.workspace, "tab_id":self.tab}]}}
        if key == ["pane", "process-info"]:
            processes = [{"argv":["node", "/opt/bin/backlog", "board"]}] if self.board else [{"argv":["bash"]}]
            return {"result":{"process_info":{"foreground_processes":processes}}}
        raise AssertionError(argv)

herdr = Herdr()
resolved = module.resolve_pane(herdr.pane, root, herdr)
assert resolved["role"] == "runner" and resolved["stored_tag"] is None and not resolved["display_only"]

record = module.bind_record(root, herdr.workspace, herdr.tab, "coordinator")
assert record["role"] == "coordinator"
assert module.bind_record(root, herdr.workspace, herdr.tab, "coordinator") == record
try: module.bind_record(root, herdr.workspace, herdr.tab, "architect")
except module.Refusal: pass
else: raise AssertionError("different role overwrote a stable tag")
resolved = module.resolve_pane(herdr.pane, root, herdr)
assert resolved["role"] == "coordinator" and resolved["stored_tag"] == "coordinator"

for bad in ("runner", "implementer", "Architect", "change-owner"):
    try: module.bind_record(root, herdr.workspace, "wExact:tOther", bad)
    except module.Refusal: pass
    else: raise AssertionError(("invalid named role accepted", bad))

module.unbind_record(root, herdr.workspace, herdr.tab)
herdr.label = "ordinary-working-tab"; herdr.board = True
board = module.resolve_pane(herdr.pane, root, herdr)
assert board["display_only"] is True and board["role"] is None and board["stored_tag"] is None
module.bind_record(root, herdr.workspace, herdr.tab, "architect")
try: module.resolve_pane(herdr.pane, root, herdr)
except module.Refusal as error: assert "illegal role tag" in str(error)
else: raise AssertionError("tagged Backlog board resolved")
module.unbind_record(root, herdr.workspace, herdr.tab)

herdr.board = False; herdr.pane_reads = 0; herdr.second_tab = "wExact:tMoved"
try: module.resolve_pane(herdr.pane, root, herdr)
except module.Refusal as error: assert "changed during session-start role resolution" in str(error)
else: raise AssertionError("pane move was normalized")
herdr.second_tab = None

def mismatch(argv):
    value = herdr(argv)
    if argv[:2] == ["tab", "get"]: value["result"]["tab"]["workspace_id"] = "wOther"
    return value
try: module.resolve_pane(herdr.pane, root, mismatch)
except module.Refusal as error: assert "mismatched tab resource" in str(error)
else: raise AssertionError("mismatched tab resource accepted")

durable = scratch / "durable"
durable.mkdir()
for name in ("Task.md", "worktree", "branch", "commit", "pr", "run-dir"):
    (durable / name).write_bytes((name + "\x00durable\n").encode())
def digest():
    return hashlib.sha256(b"".join((durable / p).read_bytes() for p in sorted(os.listdir(durable)))).hexdigest()
before = digest()
module.bind_record(root, herdr.workspace, herdr.tab, "change_owner")
assert module.unbind_record(root, herdr.workspace, herdr.tab)["role"] == "change_owner"
assert digest() == before and module.read_record(root, herdr.workspace, herdr.tab) is None

path = module.record_path(root, herdr.workspace, herdr.tab)
path.write_text("{}\n"); path.chmod(0o644)
try: module.read_record(root, herdr.workspace, herdr.tab)
except module.Refusal: pass
else: raise AssertionError("loose role record accepted")
path.unlink()

# A direct same-user lock bypass is not supported, but a hostile final-edge
# mutation is still detected by the post-pane tag and process re-samples.
module.bind_record(root, herdr.workspace, herdr.tab, "architect")
herdr.pane_reads = 0
def remove_tag_during_final_pane(argv):
    value = herdr(argv)
    if argv[:2] == ["pane", "get"] and herdr.pane_reads == 2:
        module.record_path(root, herdr.workspace, herdr.tab).unlink()
    return value
try: module.resolve_pane(herdr.pane, root, remove_tag_during_final_pane)
except module.Refusal as error: assert "tag changed during" in str(error)
else: raise AssertionError("final-pane hostile tag removal returned a mixed role")

herdr.pane_reads = 0; herdr.board = False
def become_board_during_final_pane(argv):
    value = herdr(argv)
    if argv[:2] == ["pane", "get"] and herdr.pane_reads == 2:
        herdr.board = True
    return value
try: module.resolve_pane(herdr.pane, root, become_board_during_final_pane)
except module.Refusal as error: assert "process classification changed" in str(error)
else: raise AssertionError("final-pane board-process change returned stale classification")
herdr.board = False
module.bind_record(root, herdr.workspace, herdr.tab, "architect")

# Every direct record helper uses the same validated advisory lock. An active
# lock refuses immediately; an unlocked ordinary lock file is valid stale state.
lock = module.lock_path(root)
assert stat.S_IMODE(lock.lstat().st_mode) == 0o600 and not lock.is_symlink()
descriptor = os.open(lock, os.O_RDWR | os.O_NOFOLLOW)
fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
try:
    for operation in (
        lambda: module.read_record(root, herdr.workspace, herdr.tab),
        lambda: module.bind_record(root, herdr.workspace, herdr.tab, "architect"),
        lambda: module.unbind_record(root, herdr.workspace, herdr.tab),
        lambda: module.resolve_pane(herdr.pane, root, herdr),
    ):
        try: operation()
        except module.Refusal as error: assert "lock is contended" in str(error)
        else: raise AssertionError("tag operation waited for or ignored lock contention")
finally:
    fcntl.flock(descriptor, fcntl.LOCK_UN)
    os.close(descriptor)
assert module.read_record(root, herdr.workspace, herdr.tab)["role"] == "architect"

lock.unlink()
lock_target = scratch / "lock-target"
lock_target.write_text("ordinary\n"); lock_target.chmod(0o600)
lock.symlink_to(lock_target)
try: module.read_record(root, herdr.workspace, herdr.tab)
except module.Refusal: pass
else: raise AssertionError("symlink state lock accepted")
lock.unlink()
lock.write_text("ordinary stale lock\n"); lock.chmod(0o644)
try: module.read_record(root, herdr.workspace, herdr.tab)
except module.Refusal: pass
else: raise AssertionError("loose state lock accepted")
lock.chmod(0o600)
real_fstat = os.fstat
def foreign_lock_state(fd):
    state = real_fstat(fd)
    if (state.st_dev, state.st_ino) == (lock.stat().st_dev, lock.stat().st_ino):
        return SimpleNamespace(st_mode=state.st_mode, st_uid=state.st_uid + 1,
                               st_dev=state.st_dev, st_ino=state.st_ino)
    return state
with mock.patch.object(module.os, "fstat", side_effect=foreign_lock_state):
    try: module.read_record(root, herdr.workspace, herdr.tab)
    except module.Refusal: pass
    else: raise AssertionError("foreign-owned state lock accepted")
assert module.read_record(root, herdr.workspace, herdr.tab)["role"] == "architect"
assert module.unbind_record(root, herdr.workspace, herdr.tab)["role"] == "architect"
print("python tab-role locking and coherent sampling: pass")
PY

# Bounded capture drains both child streams concurrently, stops output at the
# cap, and preserves the established short-result refusal semantics.
python3 - "$ROOT/bin/lib/qq_tab_role.py" "$TMP" <<'PY'
import importlib.util
import os
from pathlib import Path
import signal
import sys
import time
module_path, scratch_text = sys.argv[1:]
spec = importlib.util.spec_from_file_location("qq_tab_role_capture_test", module_path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
scratch = Path(scratch_text)
child = scratch / "capture-child"
child.write_text(r'''#!/usr/bin/env python3
import os
from pathlib import Path
import signal
import sys
import time
mode = os.environ["TEST_CAPTURE_MODE"]
marker = Path(os.environ["TEST_CAPTURE_MARKER"])
valid = b'{"result":{}}\n'
if mode == "valid":
    os.write(1, valid)
elif mode == "stderr-short":
    os.write(1, valid); os.write(2, b"short warning\n")
elif mode == "nonzero":
    os.write(2, b"short diagnostic\n"); raise SystemExit(17)
elif mode == "invalid-utf8":
    os.write(1, b"\xff")
elif mode in ("stdout-overflow", "stderr-overflow"):
    if mode == "stderr-overflow": os.write(1, valid)
    descriptor = 1 if mode == "stdout-overflow" else 2
    chunk = b"x" * 65536
    for _ in range(1024): os.write(descriptor, chunk)
    marker.write_text("large write completed\n")
elif mode == "near-both":
    os.write(1, b'{"result":{"padding":"')
    chunk = b"n" * 4096
    for _ in range(60):
        os.write(1, chunk); os.write(2, chunk)
    os.write(1, b'"}}\n')
    marker.write_text("both streams completed\n")
elif mode == "timeout":
    time.sleep(5); marker.write_text("sleep completed\n")
elif mode == "signal":
    os.kill(os.getpid(), signal.SIGTERM)
else:
    raise SystemExit(64)
''')
child.chmod(0o755)
marker = scratch / "capture.marker"
os.environ["QQ_HERDR_BIN"] = str(child)
os.environ["TEST_CAPTURE_MARKER"] = str(marker)

def call(mode):
    marker.unlink(missing_ok=True)
    os.environ["TEST_CAPTURE_MODE"] = mode
    return module.default_call(["pane", "get", "w:p"])

def refused(mode, expected):
    try: call(mode)
    except module.Refusal as error:
        assert str(error) == expected, (mode, str(error))
    else: raise AssertionError((mode, "unexpected success"))

assert call("valid") == {"result": {}}
refused("stderr-short", "Herdr inspection returned stderr for pane get: short warning")
refused("nonzero", "Herdr inspection failed for pane get: short diagnostic")
refused("invalid-utf8", "Herdr pane get output is not strict UTF-8")
for mode in ("stdout-overflow", "stderr-overflow"):
    refused(mode, "Herdr inspection output exceeds its size bound for pane get")
    time.sleep(0.05)
    assert not marker.exists(), f"{mode} child completed its large write"
try: call("near-both")
except module.Refusal as error: assert str(error).startswith("Herdr inspection returned stderr for pane get: ")
else: raise AssertionError("near-cap successful stderr was accepted")
assert marker.read_text() == "both streams completed\n"
module.HERDR_TIMEOUT_SECONDS = 0.1
refused("timeout", "Herdr inspection failed for pane get")
time.sleep(0.15)
assert not marker.exists(), "timed-out child remained running"
refused("signal", "Herdr inspection failed for pane get: -15")
bad_spawn = scratch / "capture-bad-spawn"
bad_spawn.write_text("#!/definitely/missing/interpreter\n")
bad_spawn.chmod(0o755)
os.environ["QQ_HERDR_BIN"] = str(bad_spawn)
try: module.default_call(["pane", "get", "w:p"])
except module.Refusal as error: assert str(error) == "Herdr inspection failed for pane get"
else: raise AssertionError("Herdr spawn failure was accepted")
print("bounded Herdr capture behavior: pass")
PY

# Deterministic Herdr evidence consumed through the real qq-tab-role process.
fixture="$TMP/herdr-fixture"
mkdir -p "$fixture"
printf '%s\n' 'wRole:tRunner' >"$fixture/tab"
printf '%s\n' 'mutable-label' >"$fixture/label"
printf '0\n' >"$fixture/board"
printf '%s\n' 'normal' >"$fixture/mode"
printf '0\n' >"$fixture/pane-reads"
printf '%s\n' 'wRole:tMoved' >"$fixture/move-tab"
: >"$fixture/calls"
fake_herdr="$TMP/herdr"
cat >"$fake_herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >>"$TEST_HERDR_FIXTURE/calls"; printf '\n' >>"$TEST_HERDR_FIXTURE/calls"
mode=$(cat "$TEST_HERDR_FIXTURE/mode")
pane_reads=$(cat "$TEST_HERDR_FIXTURE/pane-reads")
if [[ "$mode" == malformed ]]; then printf '{not-json\n'; exit 0; fi
if [[ "$mode" == successful-stderr ]]; then
  printf 'warning: uncertain Herdr snapshot\n' >&2
fi
if [[ "$mode" == nonzero ]]; then
  printf 'expected Herdr failure\n' >&2
  exit 17
fi
if [[ "$1 $2" == 'pane get' && "$mode" == second-malformed && "$pane_reads" -ge 2 ]]; then
  printf '{not-json\n'
  exit 0
fi
if [[ "$1 $2" == 'pane get' && "$mode" == second-error && "$pane_reads" -ge 2 ]]; then
  printf 'second inspection failed\n' >&2
  exit 17
fi
tab=$(cat "$TEST_HERDR_FIXTURE/tab")
label=$(cat "$TEST_HERDR_FIXTURE/label")
case "$1 $2" in
  'tab get')
    workspace=wRole
    [[ "$mode" != mismatched-tab ]] || workspace=wOther
    printf '{"result":{"tab":{"tab_id":"%s","workspace_id":"%s","label":"%s"}}}\n' "$3" "$workspace" "$label"
    ;;
  'pane get')
    pane_reads=$((pane_reads + 1))
    printf '%s\n' "$pane_reads" >"$TEST_HERDR_FIXTURE/pane-reads"
    printf '{"result":{"pane":{"pane_id":"%s","workspace_id":"wRole","tab_id":"%s"}}}\n' "$3" "$tab"
    if [[ "$mode" == lock-inspect && "$pane_reads" -eq 2 ]]; then
      : >"$TEST_HERDR_FIXTURE/inspect-ready"
      for _ in $(seq 1 500); do
        [[ -e "$TEST_HERDR_FIXTURE/inspect-release" ]] && break
        sleep 0.02
      done
      [[ -e "$TEST_HERDR_FIXTURE/inspect-release" ]] || exit 75
    fi
    if [[ "$pane_reads" -eq 4 ]]; then
      case "$mode" in
        second-tag)
          tag_target=$(cat "$TEST_HERDR_FIXTURE/tag-target")
          cp "$TEST_HERDR_FIXTURE/tag-record" "$tag_target"
          chmod 600 "$tag_target"
          ;;
        final-tag-remove)
          rm -f -- "$(cat "$TEST_HERDR_FIXTURE/tag-target")"
          ;;
        final-board) printf '1\n' >"$TEST_HERDR_FIXTURE/board" ;;
      esac
    fi
    ;;
  'pane list')
    printf '{"result":{"panes":[{"pane_id":"wRole:p1","workspace_id":"wRole","tab_id":"%s"}]}}\n' "$tab"
    ;;
  'pane process-info')
    if [[ $(cat "$TEST_HERDR_FIXTURE/board") == 1 ]]; then
      printf '%s\n' '{"result":{"process_info":{"foreground_processes":[{"argv":["node","/opt/bin/backlog","board"]}]}}}'
    else
      printf '%s\n' '{"result":{"process_info":{"foreground_processes":[{"argv":["bash"]}]}}}'
    fi
    if [[ "$pane_reads" -eq 2 ]]; then
      case "$mode" in
        pane-race) cat "$TEST_HERDR_FIXTURE/move-tab" >"$TEST_HERDR_FIXTURE/tab" ;;
        second-display) printf '1\n' >"$TEST_HERDR_FIXTURE/board" ;;
      esac
    fi
    ;;
  *) exit 64 ;;
esac
SH
chmod 755 "$fake_herdr"
role_state="$TMP/tab-role-state"; mkdir -m 700 "$role_state"
role_env=(TEST_HERDR_FIXTURE="$fixture" QQ_HERDR_BIN="$fake_herdr" QQ_TAB_ROLE_ROOT="$role_state")

# Fake only the final stock CLI. It records the exact exec argument vector and
# asks the installed Pi 0.81.1 buildSystemPrompt to append context, Skills, cwd.
# Its same-package parser module re-exports the installed pinned parser rather
# than copying any Pi option grammar.
STOCK_PACKAGE="$(npm root -g)/@earendil-works/pi-coding-agent"
SYSTEM_PROMPT="$STOCK_PACKAGE/dist/core/system-prompt.js"
STOCK_ARGS="$STOCK_PACKAGE/dist/cli/args.js"
[ -f "$SYSTEM_PROMPT" ] || fail 'installed Pi system-prompt builder is missing'
[ -f "$STOCK_ARGS" ] || fail 'installed Pi argument parser is missing'
stock_version="$(node -e 'console.log(require(process.argv[1]).version)' "$STOCK_PACKAGE/package.json")"
assert_equal 0.81.1 "$stock_version" 'installed stock Pi version drifted'
fake_bin="$TMP/bin"
global_root="$TMP/global/lib/node_modules"
package="$global_root/@earendil-works/pi-coding-agent"
mkdir -p "$fake_bin" "$package/dist/cli"
cat >"$fake_bin/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$#" -eq 2 && "$1" == root && "$2" == -g ]] || exit 42
printf '%s\n' "$TEST_GLOBAL_ROOT"
SH
cat >"$package/dist/cli.js" <<'JS'
#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
if (process.env.TEST_STOCK_REACHED_FILE) {
  await writeFile(process.env.TEST_STOCK_REACHED_FILE, "reached\n");
}
if (process.env.TEST_READY_FILE) {
  await writeFile(process.env.TEST_READY_FILE, "ready\n");
  const deadline = Date.now() + 10000;
  while (!process.env.TEST_RELEASE_FILE || !(await import("node:fs")).existsSync(process.env.TEST_RELEASE_FILE)) {
    if (Date.now() > deadline) throw new Error("timed out waiting for release fixture");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const at = (name) => args.indexOf(name);
const promptAt = at("--system-prompt");
const customPrompt = promptAt >= 0 ? args[promptAt + 1] : undefined;
const skillPaths = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--skill") skillPaths.push(args[index + 1]);
}
const skills = await Promise.all(skillPaths.map(async (filePath) => {
  const text = await readFile(filePath, "utf8");
  const name = filePath.split("/").at(-2);
  const description = /^description: (.+)$/mu.exec(text)?.[1] ?? name;
  return { name, description, filePath, disableModelInvocation: false };
}));
const { buildSystemPrompt } = await import(pathToFileURL(process.env.TEST_SYSTEM_PROMPT));
const contextContent = await readFile(process.env.TEST_CONTEXT_FILE, "utf8");
const fullPrompt = buildSystemPrompt({
  customPrompt,
  selectedTools: ["read", "bash", "edit", "write"],
  cwd: process.cwd(),
  contextFiles: [{ path: process.env.TEST_CONTEXT_FILE, content: contextContent }],
  skills,
});
await writeFile(process.env.TEST_OUTPUT, JSON.stringify({ args, cwd: process.cwd(), fullPrompt }) + "\n");
JS
cat >"$package/package.json" <<'JSON'
{"name":"@earendil-works/pi-coding-agent","version":"0.81.1","type":"module"}
JSON
node --input-type=module - "$STOCK_ARGS" "$package/dist/cli/args.js" <<'JS'
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const [stockParser, target] = process.argv.slice(2);
await writeFile(target, `export { parseArgs } from ${JSON.stringify(pathToFileURL(stockParser).href)};\n`);
JS
chmod 755 "$fake_bin/npm" "$package/dist/cli.js"

# Every activation assertion uses disposable Repositories. No test reads or
# mutates this checkout's qq.methodology value.
new_repo() {
  local path=$1
  git init -q -b main "$path"
  git -C "$path" config user.name 'Role Activation Test'
  git -C "$path" config user.email 'role-activation@example.invalid'
  printf 'fixture\n' >"$path/file.txt"
  git -C "$path" add file.txt
  git -C "$path" commit -qm initial
}
activation_root="$TMP/activation"
linked_primary="$activation_root/linked-primary"
linked_worktree="$activation_root/linked-worktree"
mkdir -p "$activation_root"
new_repo "$linked_primary"
git -C "$linked_primary" config --local qq.methodology true
git -C "$linked_primary" worktree add -q -b linked-worktree "$linked_worktree"

set_tab() {
  local tab=$1 label=$2 role=${3-}
  printf '%s\n' "$tab" >"$fixture/tab"
  printf '%s\n' "$label" >"$fixture/label"
  printf '0\n' >"$fixture/board"
  printf '%s\n' normal >"$fixture/mode"
  printf '0\n' >"$fixture/pane-reads"
  if [[ -n "$role" ]]; then
    env "${role_env[@]}" "$ROOT/bin/qq-tab-role" bind \
      --workspace wRole --tab "$tab" --role "$role" >/dev/null
  fi
}

run_bound_in() {
  local cwd=$1 output=$2
  shift 2
  rm -f -- "$output"
  (
    cd -- "$cwd"
    env -u QQ_DISPATCH_RUN_DIR \
      "${role_env[@]}" HERDR_PANE_ID=wRole:p1 \
      TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
      TEST_CONTEXT_FILE="$ROOT/AGENTS.md" TEST_OUTPUT="$output" \
      PATH="$fake_bin:$PATH" "$WRAPPER" "$@"
  )
}

run_bound() {
  run_bound_in "$linked_primary" "$@"
}

# A supported bind/unbind cannot cross an inspect transaction. Both writers
# refuse without waiting, the in-progress real CLI inspect returns one exact
# role, and the ordinary lock file remains reusable after release.
set_tab wRole:tLockedInspect ordinary architect
printf '%s\n' lock-inspect >"$fixture/mode"
printf '0\n' >"$fixture/pane-reads"
rm -f -- "$fixture/inspect-ready" "$fixture/inspect-release"
env "${role_env[@]}" "$ROOT/bin/qq-tab-role" inspect --pane wRole:p1 \
  >"$TMP/locked-inspect.out" 2>"$TMP/locked-inspect.err" &
inspect_pid=$!
for _ in $(seq 1 500); do [[ -e "$fixture/inspect-ready" ]] && break; sleep 0.02; done
[[ -e "$fixture/inspect-ready" ]] || {
  kill "$inspect_pid" 2>/dev/null || true
  fail 'real inspect did not reach its locked final pane sample'
}
for action in bind unbind; do
  set +e
  if [[ "$action" == bind ]]; then
    env "${role_env[@]}" "$ROOT/bin/qq-tab-role" bind \
      --workspace wRole --tab wRole:tLockedInspect --role architect \
      >"$TMP/locked-$action.out" 2>"$TMP/locked-$action.err"
  else
    env "${role_env[@]}" "$ROOT/bin/qq-tab-role" unbind \
      --workspace wRole --tab wRole:tLockedInspect \
      >"$TMP/locked-$action.out" 2>"$TMP/locked-$action.err"
  fi
  action_status=$?
  set -e
  assert_equal 66 "$action_status" "supported $action crossed an inspect transaction"
  assert_file_contains "$TMP/locked-$action.out" 'tab-role state lock is contended'
done
: >"$fixture/inspect-release"
wait "$inspect_pid"
assert_file_contains "$TMP/locked-inspect.out" '"role":"architect"'
printf '%s\n' normal >"$fixture/mode"
env "${role_env[@]}" "$ROOT/bin/qq-tab-role" unbind \
  --workspace wRole --tab wRole:tLockedInspect >"$TMP/unbind-after-inspect.out"
assert_file_contains "$TMP/unbind-after-inspect.out" '"role":"architect"'

set_tab wRole:tRunner architect
run_bound "$TMP/runner.json" --offline 'message with spaces' $'line one\nline two' -- --literal
assert_equal 4 "$(cat "$fixture/pane-reads")" \
  'unchanged launch did not complete two full pane-binding inspections'
set_tab wRole:tArchitect mutable-runner-label architect
run_bound_in "$linked_worktree" "$TMP/architect.json" --offline 'architect message'
set_tab wRole:tCoordinator renamed-after-binding coordinator
run_bound "$TMP/coordinator.json" --offline 'coordinator message'
set_tab wRole:tOwner 'not authority' change_owner
run_bound "$TMP/change_owner.json" --offline 'owner message'

node --input-type=module - "$ROOT" "$TMP" "$linked_primary" "$linked_worktree" <<'JS'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [root, scratch, linkedPrimary, linkedWorktree] = process.argv.slice(2);
const { loadRolePrompt, loadRoleSkillPolicy, loadExecutionProfiles } =
  await import(pathToFileURL(join(root, "bin/lib/qq_role_identity.mjs")));
const policy = await loadRoleSkillPolicy({ root });
const profiles = await loadExecutionProfiles({ root });
const originals = {
  runner: ["--offline", "message with spaces", "line one\nline two", "--", "--literal"],
  architect: ["--offline", "architect message"],
  coordinator: ["--offline", "coordinator message"],
  change_owner: ["--offline", "owner message"],
};
const expectedCwds = {
  runner: linkedPrimary,
  architect: linkedWorktree,
  coordinator: linkedPrimary,
  change_owner: linkedPrimary,
};
for (const role of Object.keys(originals)) {
  const observed = JSON.parse(await readFile(join(scratch, `${role}.json`), "utf8"));
  const prompt = await loadRolePrompt(role, { root });
  const profile = profiles[role];
  const expectedSkills = policy.roles[role].map((name) => join(root, "skills", name, "SKILL.md"));
  assert.equal(observed.args[0], "--system-prompt", role);
  assert.equal(observed.args[1], prompt, role);
  assert.deepEqual(observed.args.slice(2, 5), [
    "--model", `${profile.provider}/${profile.model}:${profile.effort}`, "--no-skills",
  ], role);
  const mounted = [];
  let index = 5;
  while (observed.args[index] === "--skill") {
    mounted.push(observed.args[index + 1]); index += 2;
  }
  assert.deepEqual(mounted, expectedSkills, role);
  assert.deepEqual(observed.args.slice(index), originals[role], role);
  assert.equal((prompt.match(/# qq methodology kernel/gu) ?? []).length, 1, role);
  assert.match(prompt, new RegExp(`# ${role === "change_owner" ? "Change Owner" : role[0].toUpperCase() + role.slice(1)} identity`, "u"), role);
  assert.match(observed.fullPrompt, /<project_context>/u, role);
  assert.match(observed.fullPrompt, /# qq Repository orientation/u, role);
  assert.equal(observed.cwd, expectedCwds[role], role);
  assert.match(observed.fullPrompt, new RegExp(`Current working directory: ${expectedCwds[role].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"), role);
  assert.doesNotMatch(observed.fullPrompt, /You are an expert coding assistant operating inside pi/u, role);
  assert.doesNotMatch(observed.fullPrompt, /skills\/(?:\.system|openwiki-maintainer|architect|deliver-change|idea)\//u, role);
  assert.doesNotMatch(observed.fullPrompt, /arbitrary\/SKILL\.md/u, role);
}
console.log("real wrapper role prompt/profile/Skill startup arguments: pass");
JS

# The launch vector is immutable once stock Pi has execed. Moving the fixture
# changes only a later fresh wrapper launch.
set_tab wRole:tFixedRunner display-only-label
ready="$TMP/running.ready"; release="$TMP/running.release"; running_out="$TMP/running.json"
(
  cd -- "$linked_primary"
  env -u QQ_DISPATCH_RUN_DIR \
    "${role_env[@]}" HERDR_PANE_ID=wRole:p1 \
    TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
    TEST_CONTEXT_FILE="$ROOT/AGENTS.md" TEST_OUTPUT="$running_out" \
    TEST_READY_FILE="$ready" TEST_RELEASE_FILE="$release" PATH="$fake_bin:$PATH" \
    "$WRAPPER" 'running process input'
) &
running_pid=$!
for _ in $(seq 1 200); do [[ -f "$ready" ]] && break; sleep 0.02; done
[[ -f "$ready" ]] || { kill "$running_pid" 2>/dev/null || true; fail 'fake stock Pi did not start'; }
set_tab wRole:tFreshArchitect changed-after-start architect
: >"$release"
wait "$running_pid"
run_bound "$TMP/fresh-after-move.json" 'fresh process input'
node - "$running_out" "$TMP/fresh-after-move.json" <<'JS'
const fs = require("node:fs");
const [runningPath, freshPath] = process.argv.slice(2);
const running = JSON.parse(fs.readFileSync(runningPath, "utf8"));
const fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));
if (!running.args[1].includes("# Runner identity")) throw new Error("running launch identity changed");
if (!fresh.args[1].includes("# Architect identity")) throw new Error("fresh launch did not resolve destination role");
JS

expect_no_exec() {
  local label=$1 output=$2
  shift 2
  rm -f -- "$output"
  set +e
  run_bound "$output" "$@" >"$TMP/$label.out" 2>"$TMP/$label.err"
  local status=$?
  set -e
  assert_equal 69 "$status" "$label did not refuse"
  [[ ! -e "$output" ]] || fail "$label reached stock Pi"
}

# Moving immediately after the first inspector's final pane sample must make
# the second full inspector observe a different exact tab and fence stock Pi.
set_tab wRole:tRaceArchitect destination architect
printf '%s\n' wRole:tRaceRunner >"$fixture/tab"
printf '%s\n' wRole:tRaceArchitect >"$fixture/move-tab"
printf '%s\n' pane-race >"$fixture/mode"
printf '0\n' >"$fixture/pane-reads"
: >"$fixture/calls"
expect_no_exec pane-race "$TMP/pane-race.json" 'must not launch old role'
assert_file_contains "$TMP/pane-race.err" 'tab-role binding changed before stock Pi exec'
assert_equal wRole:tRaceArchitect "$(cat "$fixture/tab")" 'race fixture did not move to destination tab'
assert_equal 4 "$(cat "$fixture/pane-reads")" 'second inspector did not sample the moved exact tab'
assert_equal 4 "$(grep -c '^pane get ' "$fixture/calls")" \
  'race did not run two complete production pane inspections'

# An uncertain second inspector refuses rather than accepting the first sample.
set_tab wRole:tSecondMalformed ordinary
printf '%s\n' second-malformed >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec second-malformed "$TMP/second-malformed.json" 'must refuse malformed reinspection'
assert_equal 3 "$(grep -c '^pane get ' "$fixture/calls")" \
  'malformed second inspector was not attempted after the complete first inspector'

set_tab wRole:tSecondError ordinary
printf '%s\n' second-error >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec second-error "$TMP/second-error.json" 'must refuse failed reinspection'
assert_equal 3 "$(grep -c '^pane get ' "$fixture/calls")" \
  'failed second inspector was not attempted after the complete first inspector'

set_tab wRole:tSecondDisplay ordinary
printf '%s\n' second-display >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec second-display "$TMP/second-display.json" 'must refuse display-only reinspection'
assert_file_contains "$TMP/second-display.err" 'tab-role binding changed before stock Pi exec'
assert_equal 4 "$(cat "$fixture/pane-reads")" 'display-only second inspection did not complete'

# A direct hostile write during the second inspector's final pane sample is
# caught by that same inspection's post-fence tag read.
set_tab wRole:tSecondTag ordinary
python3 - "$ROOT/bin/lib/qq_tab_role.py" "$role_state" "$fixture" <<'PY'
import importlib.util
from pathlib import Path
import sys
module_path, state_text, fixture_text = sys.argv[1:]
spec = importlib.util.spec_from_file_location("qq_tab_role_tag_fixture", module_path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
state = Path(state_text); fixture = Path(fixture_text)
workspace = "wRole"; tab = "wRole:tSecondTag"
target = module.record_path(state, workspace, tab)
assert not target.exists()
value = {"schema": module.SCHEMA, "version": 1, "workspace_id": workspace,
         "tab_id": tab, "role": "architect"}
(fixture / "tag-record").write_bytes(module.canonical_json(value))
(fixture / "tag-target").write_text(str(target) + "\n")
PY
printf '%s\n' second-tag >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec second-tag "$TMP/second-tag.json" 'must refuse changed stored tag'
assert_file_contains "$TMP/second-tag.err" 'tab-role binding inspection failed'
assert_equal 4 "$(cat "$fixture/pane-reads")" 'changed-tag second inspection did not complete'
printf '%s\n' normal >"$fixture/mode"
env "${role_env[@]}" "$ROOT/bin/qq-tab-role" unbind \
  --workspace wRole --tab wRole:tSecondTag >/dev/null

# Reproduce the review's exact old-tag return edge: remove an Architect record
# directly while final pane sample four exits. Stock Pi must not be reached.
set_tab wRole:tFinalTagRemove ordinary architect
python3 - "$ROOT/bin/lib/qq_tab_role.py" "$role_state" "$fixture" <<'PY'
import importlib.util
from pathlib import Path
import sys
module_path, state_text, fixture_text = sys.argv[1:]
spec = importlib.util.spec_from_file_location("qq_tab_role_remove_fixture", module_path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
state = Path(state_text); fixture = Path(fixture_text)
target = module.record_path(state, "wRole", "wRole:tFinalTagRemove")
assert target.exists()
(fixture / "tag-target").write_text(str(target) + "\n")
PY
printf '%s\n' final-tag-remove >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec final-tag-remove "$TMP/final-tag-remove.json" 'must refuse final-edge tag removal'
assert_file_contains "$TMP/final-tag-remove.err" 'tab-role binding inspection failed'
assert_equal 4 "$(cat "$fixture/pane-reads")" 'tag-removal fixture missed the final pane sample'
[[ ! -e "$TMP/final-tag-remove.json" ]] || fail 'final tag removal reached stock Pi'

# Display-only process classification receives the same before/after fence.
set_tab wRole:tFinalBoard ordinary
printf '%s\n' final-board >"$fixture/mode"
: >"$fixture/calls"
expect_no_exec final-board "$TMP/final-board.json" 'must refuse final-edge board process change'
assert_file_contains "$TMP/final-board.err" 'tab-role binding inspection failed'
assert_equal 4 "$(cat "$fixture/pane-reads")" 'board fixture missed the final pane sample'

# Every Herdr query boundary rejects successful stderr. The direct protocol
# keeps a bounded diagnostic; the real wrapper translates refusal to status 69
# and never reaches stock Pi.
set_tab wRole:tSuccessfulStderr ordinary
printf '%s\n' successful-stderr >"$fixture/mode"
expect_stderr_refusal() {
  local label=$1
  shift
  set +e
  env "${role_env[@]}" "$ROOT/bin/qq-tab-role" "$@" \
    >"$TMP/$label.direct.out" 2>"$TMP/$label.direct.err"
  local status=$?
  set -e
  assert_equal 66 "$status" "$label accepted successful Herdr stderr"
  assert_file_contains "$TMP/$label.direct.out" 'Herdr inspection returned stderr'
  assert_file_contains "$TMP/$label.direct.out" 'warning: uncertain Herdr snapshot'
}
expect_stderr_refusal stderr-inspect inspect --pane wRole:p1
expect_stderr_refusal stderr-bind bind --workspace wRole --tab wRole:tSuccessfulStderr --role architect
expect_stderr_refusal stderr-unbind unbind --workspace wRole --tab wRole:tSuccessfulStderr
expect_no_exec successful-herdr-stderr "$TMP/successful-herdr-stderr.json" 'must refuse successful stderr'
assert_file_contains "$TMP/successful-herdr-stderr.err" 'tab-role binding inspection failed'

# Preserve the established nonzero diagnostic while keeping it bounded.
printf '%s\n' nonzero >"$fixture/mode"
set +e
env "${role_env[@]}" "$ROOT/bin/qq-tab-role" inspect --pane wRole:p1 \
  >"$TMP/nonzero-herdr.out" 2>"$TMP/nonzero-herdr.err"
nonzero_status=$?
set -e
assert_equal 66 "$nonzero_status" 'nonzero Herdr result did not refuse'
assert_file_contains "$TMP/nonzero-herdr.out" 'Herdr inspection failed for pane get: expected Herdr failure'

# Board and malformed Herdr evidence refuse before stock Pi exec.
printf '%s\n' wRole:tBoard >"$fixture/tab"; printf '1\n' >"$fixture/board"; printf '%s\n' normal >"$fixture/mode"
expect_no_exec board "$TMP/board.json" 'must not launch'
assert_file_contains "$TMP/board.err" 'display-only Backlog-board tab cannot start Pi'
printf '0\n' >"$fixture/board"; printf '%s\n' malformed >"$fixture/mode"
expect_no_exec malformed-herdr "$TMP/malformed-herdr.json" 'must not launch'

# Every native flag capable of replacing/augmenting role identity, profile,
# Skill scope, or required project context is rejected for a bound launch.
set_tab wRole:tOverrides ordinary
expect_no_exec override-system "$TMP/o1.json" --system-prompt forged
expect_no_exec override-system-equals "$TMP/o2.json" --system-prompt=forged
expect_no_exec override-append "$TMP/o3.json" --append-system-prompt forged
expect_no_exec override-provider "$TMP/o4.json" --provider forged
expect_no_exec override-model "$TMP/o5.json" --model forged
expect_no_exec override-models "$TMP/o6.json" --models forged
expect_no_exec override-thinking "$TMP/o7.json" --thinking low
expect_no_exec override-skill "$TMP/o8.json" --skill /tmp/forged/SKILL.md
expect_no_exec override-no-skills "$TMP/o9.json" --no-skills
expect_no_exec override-no-skills-short "$TMP/o10.json" -ns
expect_no_exec override-extension "$TMP/o11.json" --extension /tmp/forged-extension.mjs
expect_no_exec override-extension-short "$TMP/o12.json" -e /tmp/forged-extension.mjs
expect_no_exec override-context "$TMP/o13.json" --no-context-files
expect_no_exec override-context-short "$TMP/o14.json" -nc

# Only mechanically administrative or explicitly noninteractive operations
# preserve their vector. A dispatch marker and a missing pane grant no linked
# interactive bypass, while the engine's complete headless delegate vector
# remains unchanged without pane evidence.
: >"$fixture/calls"
pass_common=(TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
  TEST_CONTEXT_FILE="$ROOT/AGENTS.md" PATH="$fake_bin:$PATH")
headless=(--approve --offline --mode json -p --system-prompt 'headless prompt' \
  --model provider/model:xhigh --no-skills --no-context-files \
  'Task: Read-and-perform:/tmp/BRIEF.md')
env -u HERDR_PANE_ID "${pass_common[@]}" TEST_OUTPUT="$TMP/headless.json" \
  QQ_DISPATCH_RUN_DIR="$TMP/run dir" "$WRAPPER" "${headless[@]}"

set +e
(
  cd -- "$linked_primary"
  env "${pass_common[@]}" TEST_OUTPUT="$TMP/forged-dispatch.json" \
    QQ_DISPATCH_RUN_DIR="$TMP/forged" HERDR_PANE_ID=wRole:p1 \
    "$WRAPPER" --system-prompt forged
) >"$TMP/forged-dispatch.out" 2>"$TMP/forged-dispatch.err"
forged_status=$?
(
  cd -- "$linked_primary"
  env "${role_env[@]}" "${pass_common[@]}" TEST_OUTPUT="$TMP/forged-double-dash.json" \
    QQ_DISPATCH_RUN_DIR="$TMP/forged" HERDR_PANE_ID=wRole:p1 \
    "$WRAPPER" -- --system-prompt forged
) >"$TMP/forged-double-dash.out" 2>"$TMP/forged-double-dash.err"
forged_double_dash_status=$?
(
  cd -- "$linked_primary"
  env -u QQ_DISPATCH_RUN_DIR -u HERDR_PANE_ID "${pass_common[@]}" \
    TEST_OUTPUT="$TMP/no-pane.json" "$WRAPPER" 'linked interactive call'
) >"$TMP/no-pane.out" 2>"$TMP/no-pane.err"
no_pane_status=$?
set -e
assert_equal 69 "$forged_status" 'forged dispatch marker bypassed identity flags'
assert_equal 69 "$forged_double_dash_status" 'double dash bypassed a later identity flag'
assert_equal 69 "$no_pane_status" 'linked interactive no-pane call reached stock Pi'
[[ ! -e "$TMP/forged-dispatch.json" ]] || fail 'forged dispatch reached stock Pi'
[[ ! -e "$TMP/forged-double-dash.json" ]] || fail 'double-dash override reached stock Pi'
[[ ! -e "$TMP/no-pane.json" ]] || fail 'linked interactive no-pane call reached stock Pi'
assert_file_contains "$TMP/forged-dispatch.err" 'rejects identity override --system-prompt'
assert_file_contains "$TMP/forged-double-dash.err" 'rejects identity override --system-prompt'
assert_file_contains "$TMP/no-pane.err" 'requires one exact HERDR_PANE_ID'

env -u QQ_DISPATCH_RUN_DIR "${pass_common[@]}" TEST_OUTPUT="$TMP/help.json" \
  HERDR_PANE_ID=wRole:p1 "$WRAPPER" --help --provider ignored
env -u QQ_DISPATCH_RUN_DIR "${pass_common[@]}" TEST_OUTPUT="$TMP/admin.json" \
  HERDR_PANE_ID=wRole:p1 "$WRAPPER" list --model ignored
env -u QQ_DISPATCH_RUN_DIR "${pass_common[@]}" TEST_OUTPUT="$TMP/print.json" \
  HERDR_PANE_ID=wRole:p1 "$WRAPPER" -p 'print mode'
env -u QQ_DISPATCH_RUN_DIR "${pass_common[@]}" TEST_OUTPUT="$TMP/rpc.json" \
  HERDR_PANE_ID=wRole:p1 "$WRAPPER" --mode rpc
[[ ! -s "$fixture/calls" ]] || fail 'classified pass-through or early refusal inspected Herdr'
node - "$TMP" <<'JS'
const fs = require("node:fs"), path = require("node:path");
const root = process.argv[2];
const cases = {
  headless:["--approve","--offline","--mode","json","-p","--system-prompt","headless prompt",
    "--model","provider/model:xhigh","--no-skills","--no-context-files",
    "Task: Read-and-perform:/tmp/BRIEF.md"],
  help:["--help","--provider","ignored"], admin:["list","--model","ignored"],
  print:["-p","print mode"], rpc:["--mode","rpc"],
};
for (const [name, expected] of Object.entries(cases)) {
  const actual = JSON.parse(fs.readFileSync(path.join(root, `${name}.json`), "utf8")).args;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${name}: ${JSON.stringify(actual)}`);
}
JS

# Production classification consumes the installed pinned parser's complete
# final result. This compact matrix covers current callers and control
# composition without maintaining a qq option-consumption grammar.
node --input-type=module - \
  "$ROOT" "$linked_primary" "$WRAPPER" "$STOCK_ARGS" "$fake_bin" \
  "$global_root" "$SYSTEM_PROMPT" "$TMP" <<'JS'
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const [root, linked, wrapper, stockArgsPath, fakeBin, globalRoot, systemPrompt, scratch] =
  process.argv.slice(2);
const { buildLaunchSpec } = await import(pathToFileURL(join(root, "bin/lib/qq_role_identity.mjs")));
const { parseArgs } = await import(pathToFileURL(stockArgsPath));
const noPane = { ...process.env, QQ_DISPATCH_RUN_DIR: "/tmp/forged" };
delete noPane.HERDR_PANE_ID;
const options = { cwd: linked, env: noPane, parsePiArgs: parseArgs };
const reached = join(scratch, "stock-final-state-reached");
const output = join(scratch, "stock-final-state-output.json");
const wrapperEnv = {
  ...noPane,
  PATH: `${fakeBin}:${process.env.PATH}`,
  TEST_GLOBAL_ROOT: globalRoot,
  TEST_SYSTEM_PROMPT: systemPrompt,
  TEST_CONTEXT_FILE: join(root, "AGENTS.md"),
  TEST_OUTPUT: output,
  TEST_STOCK_REACHED_FILE: reached,
};
const stockPasses = (argv) => {
  const parsed = parseArgs(argv);
  return parsed.diagnostics.some((diagnostic) => diagnostic.type === "error")
    || parsed.version === true || parsed.help === true || parsed.listModels !== undefined
    || Boolean(parsed.export) || parsed.print === true
    || parsed.mode === "json" || parsed.mode === "rpc";
};
const passVectors = [
  ["mode text then json", ["--mode", "text", "--mode", "json", "--system-prompt", "ENGINE ROLE"]],
  ["empty export overwritten", ["--export", "", "--export", "session.jsonl", "--system-prompt", "EXPORT ONLY"]],
  ["sticky print", ["--print", "--mode", "json", "--mode", "text", "--system-prompt", "PRINT ROLE"]],
  ["sticky help", ["--help", "--mode", "text", "--system-prompt", "HELP ROLE"]],
  ["sticky version", ["--version", "--mode", "text", "--system-prompt", "VERSION ROLE"]],
  ["sticky list models", ["--list-models", "search", "--mode", "text", "--system-prompt", "LIST ROLE"]],
  ["parser error", ["-z", "--system-prompt", "ERROR ROLE"]],
  ["delegate", ["--approve", "--offline", "--mode", "json", "-p",
    "--system-prompt", "ENGINE ROLE", "--model", "provider/model:xhigh",
    "--no-skills", "--no-context-files", "Task: Read-and-perform:/tmp/BRIEF.md"]],
  ["scheduled OpenWiki", ["--print", "--no-session", "--approve", "--skill",
    join(root, "skills/openwiki-maintainer/SKILL.md"), "scheduled assignment"]],
];
const interactiveVectors = [
  ["mode json then text", ["--mode", "json", "--mode", "text", "--system-prompt", "FORGED"]],
  ["mode rpc then text", ["--mode", "rpc", "--mode", "text", "--system-prompt", "FORGED"]],
  ["empty export", ["--export", "", "--system-prompt", "FORGED"]],
  ["export overwritten empty", ["--export", "session.jsonl", "--export", "", "--system-prompt", "FORGED"]],
  ["double dash caller override", ["--", "--system-prompt", "FORGED"]],
  ["interactive no pane", ["ordinary interactive message"]],
  ["caller model override", ["--model", "caller/model:xhigh", "ordinary interactive message"]],
];
for (const [label, argv] of passVectors) {
  assert.equal(stockPasses(argv), true, `${label}: stock final state`);
  const result = await buildLaunchSpec(argv, options);
  assert.equal(result.bound, false, label);
  assert.deepEqual(result.args, argv, label);
  for (const path of [reached, output]) if (existsSync(path)) unlinkSync(path);
  const wrapped = spawnSync(wrapper, argv, { cwd: linked, env: wrapperEnv, encoding: "utf8" });
  assert.equal(wrapped.status, 0, `${label}: ${wrapped.stdout}\n${wrapped.stderr}`);
  assert.equal(existsSync(reached), true, `${label}: fake stock Pi was not reached`);
}
for (const [label, argv] of interactiveVectors) {
  assert.equal(stockPasses(argv), false, `${label}: stock final state`);
  await assert.rejects(
    () => buildLaunchSpec(argv, options),
    /requires one exact HERDR_PANE_ID|rejects identity override/u,
    label,
  );
  for (const path of [reached, output]) if (existsSync(path)) unlinkSync(path);
  const wrapped = spawnSync(wrapper, argv, { cwd: linked, env: wrapperEnv, encoding: "utf8" });
  assert.equal(wrapped.status, 69, `${label}: ${wrapped.stdout}\n${wrapped.stderr}`);
  assert.equal(existsSync(reached), false, `${label}: reached fake stock Pi`);
}
console.log("pinned stock Pi complete final-state matrix: pass");
JS

# Normal interactive Herdr launches bind only for one exact common-local true.
# Every unlinked/invalid case passes even identity-shaped arguments to stock Pi
# unchanged and must leave the Herdr call log empty.
absent_repo="$activation_root/absent"
false_repo="$activation_root/false"
duplicate_true_repo="$activation_root/duplicate-true"
mixed_repo="$activation_root/true-and-false"
malformed_repo="$activation_root/malformed"
include_repo="$activation_root/include-only"
global_repo="$activation_root/global-only"
unreadable_repo="$activation_root/unreadable"
worktree_common="$activation_root/worktree-common"
worktree_only="$activation_root/worktree-only"
for repo in "$absent_repo" "$false_repo" "$duplicate_true_repo" "$mixed_repo" \
  "$malformed_repo" "$include_repo" "$global_repo" "$unreadable_repo" "$worktree_common"; do
  new_repo "$repo"
done
mkdir -p "$activation_root/non-git"
git -C "$false_repo" config --local qq.methodology false
git -C "$duplicate_true_repo" config --local --add qq.methodology true
git -C "$duplicate_true_repo" config --local --add qq.methodology true
git -C "$mixed_repo" config --local --add qq.methodology true
git -C "$mixed_repo" config --local --add qq.methodology false
git -C "$malformed_repo" config --local qq.methodology not-a-boolean
included_config="$activation_root/included.config"
printf '[qq]\n\tmethodology = true\n' >"$included_config"
git -C "$include_repo" config --local include.path "$included_config"
global_config="$activation_root/global.config"
printf '[qq]\n\tmethodology = true\n' >"$global_config"
git -C "$worktree_common" config --local extensions.worktreeConfig true
git -C "$worktree_common" worktree add -q -b worktree-only "$worktree_only"
git -C "$worktree_only" config --worktree qq.methodology true
failure_bin="$activation_root/failure-bin"
mkdir -p "$failure_bin"
cat >"$failure_bin/git" <<'SH'
#!/usr/bin/env bash
exit 77
SH
chmod 755 "$failure_bin/git"

stock_args=(--system-prompt 'caller prompt with spaces' --model caller/model:xhigh \
  $'caller line one\ncaller line two' -- --literal)
run_stock_case() {
  local label=$1 cwd=$2
  shift 2
  local -a extra_env=()
  while (($#)) && [[ "$1" != -- ]]; do
    extra_env+=("$1")
    shift
  done
  (($#)) || fail "$label stock-case fixture omitted argument separator"
  shift
  local output="$TMP/stock-$label.json"
  rm -f -- "$output"
  : >"$fixture/calls"
  (
    cd -- "$cwd"
    env -u QQ_DISPATCH_RUN_DIR \
      "${role_env[@]}" HERDR_PANE_ID=wRole:p1 \
      TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
      TEST_CONTEXT_FILE="$ROOT/AGENTS.md" TEST_OUTPUT="$output" \
      PATH="$fake_bin:$PATH" "${extra_env[@]}" "$WRAPPER" "${stock_args[@]}"
  )
  [[ ! -s "$fixture/calls" ]] || fail "$label unlinked launch inspected Herdr"
  printf '%s\n' "$cwd" >"$TMP/stock-$label.expected-cwd"
}

run_stock_case absent "$absent_repo" --
run_stock_case false "$false_repo" --
run_stock_case duplicate-true "$duplicate_true_repo" --
run_stock_case true-and-false "$mixed_repo" --
run_stock_case malformed "$malformed_repo" --
run_stock_case non-git "$activation_root/non-git" --
run_stock_case global-only "$global_repo" GIT_CONFIG_GLOBAL="$global_config" --
run_stock_case include-only "$include_repo" --
run_stock_case worktree-only "$worktree_only" --
run_stock_case env-config-only "$absent_repo" \
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=qq.methodology GIT_CONFIG_VALUE_0=true --
run_stock_case env-repository-only "$activation_root/non-git" \
  GIT_DIR="$linked_primary/.git" GIT_WORK_TREE="$linked_primary" --
run_stock_case inspection-failure "$absent_repo" PATH="$failure_bin:$fake_bin:$PATH" --
chmod 000 "$unreadable_repo/.git/config"
run_stock_case unreadable "$unreadable_repo" --
chmod 600 "$unreadable_repo/.git/config"

node --input-type=module - "$TMP" <<'JS'
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const scratch = process.argv[2];
const expectedArgs = [
  "--system-prompt", "caller prompt with spaces", "--model", "caller/model:xhigh",
  "caller line one\ncaller line two", "--", "--literal",
];
const outputs = (await readdir(scratch)).filter((name) => /^stock-.+\.json$/u.test(name));
assert.equal(outputs.length, 13, outputs);
for (const name of outputs) {
  const observed = JSON.parse(await readFile(join(scratch, name), "utf8"));
  const label = name.slice("stock-".length, -".json".length);
  const expectedCwd = (await readFile(join(scratch, `stock-${label}.expected-cwd`), "utf8")).trimEnd();
  assert.deepEqual(observed.args, expectedArgs, label);
  assert.equal(observed.cwd, expectedCwd, label);
}
console.log("methodology activation fail-closed wrapper cases: pass");
JS

# Copy the exact launcher/helper into an isolated canonical-root fixture so
# destructive malformed/duplicate/unsafe policy cases exercise the full wrapper
# without mutating Repository source.
negative_root="$TMP/negative-root"
mkdir -p "$negative_root/bin/lib" "$negative_root/delegation/manifests/agents" \
  "$negative_root/delegation/policies" "$negative_root/methodology" "$negative_root/skills"
cp "$WRAPPER" "$negative_root/bin/pi"
cp "$HELPER" "$negative_root/bin/lib/qq_role_identity.mjs"
cp "$ROOT"/delegation/manifests/agents/*.md "$negative_root/delegation/manifests/agents/"
cp "$ROOT"/delegation/policies/role-skills.json "$ROOT"/delegation/policies/execution-profiles.json \
  "$negative_root/delegation/policies/"
cp "$ROOT/methodology/KERNEL.md" "$negative_root/methodology/KERNEL.md"
for skill in agent-messaging delegate diagnosing-bugs operator-input research review uat-signoff writing-for-clients; do
  mkdir -p "$negative_root/skills/$skill"
  cp "$ROOT/skills/$skill/SKILL.md" "$negative_root/skills/$skill/SKILL.md"
done
binding_file="$TMP/binding.json"
cat >"$negative_root/bin/qq-tab-role" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == 'inspect --pane wRole:p1' ]] || exit 64
cat "$TEST_BINDING_FILE"
SH
chmod 755 "$negative_root/bin/pi" "$negative_root/bin/qq-tab-role"
write_runner_binding() {
  printf '%s\n' '{"ok":true,"schema":"qq.tab-role/v1","result":{"schema":"qq.tab-role/v1","version":1,"pane_id":"wRole:p1","workspace_id":"wRole","tab_id":"wRole:t1","display_only":false,"role":"runner","stored_tag":null}}' >"$binding_file"
}
write_runner_binding
run_negative() {
  local label=$1
  local output="$TMP/negative-$label.json"
  rm -f -- "$output"
  set +e
  (
    cd -- "$linked_primary"
    env -u QQ_DISPATCH_RUN_DIR HERDR_PANE_ID=wRole:p1 TEST_BINDING_FILE="$binding_file" \
      TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
      TEST_CONTEXT_FILE="$ROOT/AGENTS.md" TEST_OUTPUT="$output" PATH="$fake_bin:$PATH" \
      "$negative_root/bin/pi" 'must refuse'
  ) >"$TMP/negative-$label.out" 2>"$TMP/negative-$label.err"
  local status=$?
  set -e
  assert_equal 69 "$status" "$label did not refuse"
  [[ ! -e "$output" ]] || fail "$label reached stock Pi"
}
# Sanity: the isolated exact launcher reaches fake Pi before corruption.
(
  cd -- "$linked_primary"
  env -u QQ_DISPATCH_RUN_DIR HERDR_PANE_ID=wRole:p1 TEST_BINDING_FILE="$binding_file" \
    TEST_GLOBAL_ROOT="$global_root" TEST_SYSTEM_PROMPT="$SYSTEM_PROMPT" \
    TEST_CONTEXT_FILE="$ROOT/AGENTS.md" TEST_OUTPUT="$TMP/negative-valid.json" PATH="$fake_bin:$PATH" \
    "$negative_root/bin/pi" 'fixture sanity'
)

skill_policy="$negative_root/delegation/policies/role-skills.json"
profile_policy="$negative_root/delegation/policies/execution-profiles.json"
cp "$skill_policy" "$TMP/skill-policy.good"
cp "$profile_policy" "$TMP/profile-policy.good"
printf '{not-json\n' >"$skill_policy"; run_negative malformed-policy
cp "$TMP/skill-policy.good" "$skill_policy"
python3 - "$skill_policy" <<'PY'
from pathlib import Path
p=Path(__import__('sys').argv[1]); text=p.read_text(); p.write_text(text.replace('{', '{"schema":"duplicate",', 1))
PY
run_negative duplicate-policy
cp "$TMP/skill-policy.good" "$skill_policy"
jq '.roles.runner += ["diagnosing-bugs"]' "$skill_policy" >"$TMP/duplicate-skill.json"
cp "$TMP/duplicate-skill.json" "$skill_policy"; run_negative duplicate-skill-path
cp "$TMP/skill-policy.good" "$skill_policy"
chmod 666 "$profile_policy"; run_negative unsafe-policy-mode; chmod 644 "$profile_policy"
mv "$negative_root/methodology/KERNEL.md" "$negative_root/methodology/KERNEL.real"
ln -s KERNEL.real "$negative_root/methodology/KERNEL.md"; run_negative symlink-kernel
rm "$negative_root/methodology/KERNEL.md"; mv "$negative_root/methodology/KERNEL.real" "$negative_root/methodology/KERNEL.md"
jq '.runner.serviceClass="priority"' "$profile_policy" >"$TMP/unsupported-profile.json"
cp "$TMP/unsupported-profile.json" "$profile_policy"; run_negative unsupported-profile
cp "$TMP/profile-policy.good" "$profile_policy"
printf '%s\n' '{"ok":true,"schema":"qq.tab-role/v1","result":{"schema":"qq.tab-role/v1","version":1,"pane_id":"wRole:p1","workspace_id":"wRole","tab_id":"wRole:t1","display_only":false,"role":"implementer","stored_tag":"implementer"}}' >"$binding_file"
run_negative unknown-tag
printf '%s\n' '{"ok":true,"schema":"qq.tab-role/v1","schema":"qq.tab-role/v1","result":{}}' >"$binding_file"
run_negative duplicate-binding-evidence
write_runner_binding

# No runtime extension lifecycle or cross-role handoff fiction remains. Split
# the forbidden spellings so this absence test does not itself preserve them.
runtime_pattern='qq-role-''transition|before_''agent_start|resources_''discover|register''Command|append''Entry|private''Prompt|ctx\.reload|trigger''Turn'
assert_file_not_matches "$HELPER" "$runtime_pattern" \
  'session-start helper contains rejected runtime transition machinery'
for forbidden in 'Extension''Runner' 'emit''Input' 'emitBefore''AgentStart' 'parseTransition''State'; do
  if grep -F -- "$forbidden" "$ROOT/tests/test-qq-role-identity.sh" >/dev/null; then
    fail 'role identity test simulates an impossible runtime role movement lifecycle'
  fi
done
transition_pattern='qq-role-''transition|TRANSITION_(COM''MAND|EN''TRY)|Private nonce-bound tab-role ''reload'
if grep -R -n -E "$transition_pattern" \
  "$ROOT/bin" "$ROOT/extensions" "$ROOT/delegation" "$ROOT/methodology" >/dev/null; then
  fail 'rejected transition command/state source remains'
fi

printf 'test-qq-role-identity: pass\n'
