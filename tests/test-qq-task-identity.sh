#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-task-identity"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
HELPER="$ROOT/bin/lib/qq_task_identity.py"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

python3 - "$HELPER" "$tmp" <<'PY'
import importlib.util
from pathlib import Path
import sys

helper, scratch = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("qq_task_identity_test", helper)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

repo = scratch / "repo"
config = repo / "backlog" / "config.yml"
config.parent.mkdir(parents=True)
config.write_text('project_name: "fixture"\ntask_prefix: "t"\n', encoding="utf-8")
original = config.read_bytes()

identity = module.TaskIdentityConfig.from_repository(repo)
parent = identity.parse_display("T-12")
child = identity.parse_display("T-12.3")
assert parent.as_dict() == {
    "configured_prefix":"t", "display_prefix":"T", "token_prefix":"t",
    "display_id":"T-12", "token":"t-12", "parent_number":12,
    "child_number":None, "ordering_key":[12,0,0],
}
assert child.display_id == "T-12.3" and child.token == "t-12.3"
assert child.ordering_key == (12, 1, 3)
assert identity.parse_token("t-12.3") == child
assert identity.parse_filename("t-12.3 - Child.md") == child
assert identity.parse_branch("feat/t-12.3-child") == child
assert identity.parse_branch("main") is None
assert sorted([child, identity.parse_display("T-2"), parent], key=lambda item:item.ordering_key) == [identity.parse_display("T-2"), parent, child]
assert config.read_bytes() == original

# A config-only prefix change immediately changes the accepted identity.
config.write_text('task_prefix: feat\n', encoding="utf-8")
identity = module.TaskIdentityConfig.from_repository(repo)
assert identity.parse_display("FEAT-12").token == "feat-12"
assert identity.parse_display("FEAT-12.3").parent_number == 12
for value in ("T-12", "feat-12", "FEAT-0", "FEAT-01", "FEAT-12.0",
              "FEAT-12.03", "FEAT-12.3.4", " FEAT-12", "FEAT-12 ",
              "FEAT-12 other", "FEAT/12", "FEAT-12/child"):
    try:
        identity.parse_display(value)
    except module.TaskIdentityError:
        pass
    else:
        raise AssertionError(f"accepted invalid configured identity: {value!r}")

for value in ("T-1", "FEAT-12.3", "x-999"):
    assert module.is_generic_task_id(value)
for value in ("", "T-0", "T-01", "T-1.0", "T-1.2.3", "T-1 T-2", "T/1"):
    assert not module.is_generic_task_id(value)
assert module.task_artifact_filename("FEAT-12.3") == "FEAT-12.3.json"

bad_configs = (
    "project_name: fixture\n",
    "task_prefix:\n",
    "task_prefix: t\ntask_prefix: feat\n",
    "task_prefix: feature_1\n",
    "task_prefix: t extra\n",
    "task_prefix: [t]\n",
    "  task_prefix: t\n",
    "task_prefix: >\n  t\n",
    "task_prefix: \"\"\n",
)
for value in bad_configs:
    config.write_text(value, encoding="utf-8")
    before = config.read_bytes()
    try:
        module.TaskIdentityConfig.from_repository(repo)
    except module.TaskIdentityError:
        pass
    else:
        raise AssertionError(f"accepted invalid config: {value!r}")
    assert config.read_bytes() == before
PY

mkdir -p "$tmp/cli/backlog"
printf '%s\n' 'task_prefix: "feat"' >"$tmp/cli/backlog/config.yml"
python3 "$HELPER" id --repo "$tmp/cli" FEAT-12.3 >"$tmp/identity.json"
jq -e '
  .display_id == "FEAT-12.3" and .token == "feat-12.3"
  and .parent_number == 12 and .child_number == 3
  and .ordering_key == [12,1,3]
' "$tmp/identity.json" >/dev/null
python3 "$HELPER" branches --repo "$tmp/cli" main \
  feat/feat-12.3-child fix/t-12-wrong >"$tmp/branches.json"
jq -e '.identities == [{input:"feat/feat-12.3-child",display_id:"FEAT-12.3",
  configured_prefix:"feat",display_prefix:"FEAT",token_prefix:"feat",
  token:"feat-12.3",parent_number:12,child_number:3,ordering_key:[12,1,3]}]' \
  "$tmp/branches.json" >/dev/null
python3 "$HELPER" filenames --repo "$tmp/cli" \
  'feat-12 - Parent.md' 'feat-12.3 - Child.md' >"$tmp/filenames.json"
jq -e '[.identities[].display_id] == ["FEAT-12","FEAT-12.3"]' \
  "$tmp/filenames.json" >/dev/null

printf 'test-qq-task-identity: pass\n'
