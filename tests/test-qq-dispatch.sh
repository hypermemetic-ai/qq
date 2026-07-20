#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-dispatch"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
DISPATCH="$ROOT/bin/qq-dispatch"
SUPERVISOR="$ROOT/bin/lib/qq-process-tree-supervisor.py"
RENDERER="$ROOT/bin/lib/qq-render-landstrip-policy.mjs"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
test_home="$tmp/home"
parent_tmp="$tmp/parent-tmp"
mkdir -p "$test_home" "$parent_tmp"
export HOME="$test_home"
export TMPDIR="$parent_tmp"
pi_subagent_temp_prefix="$parent_tmp/pi-subagent-*"

for expected in \
  "$DISPATCH" \
  "$SUPERVISOR" \
  "$RENDERER"; do
  [ -x "$expected" ] || fail "expected executable is missing: $expected"
done

for retired in \
  "$ROOT/codex-profiles" \
  "$ROOT/pilot/bin" \
  "$ROOT/pilot/checks" \
  "$ROOT/pilot/manifests" \
  "$ROOT/pilot/policies"; do
  [ ! -e "$retired" ] || fail "retired delegation machinery remains: $retired"
done

for role in implementer reviewer researcher; do
  manifest="$ROOT/delegation/manifests/agents/$role.md"
  assert_equal 1 \
    "$(grep -c '^model: openai-codex/gpt-5\.6-sol$' "$manifest")" \
    "$role does not have exactly one GPT-5.6 Sol model pin"
  assert_file_contains "$manifest" \
    '# Runtime model-identity verification is assigned to T-95 ticket 3.'
done
jq -e '
  .schemaVersion == 1
  and .roles.reviewer == {
    access: "read-only",
    policyIdentity: "qq-reviewer-read-only-v1"
  }
  and .roles.researcher == {
    access: "read-only",
    policyIdentity: "qq-researcher-read-only-v1"
  }
  and .roles.implementer == {
    access: "workspace-write",
    policyIdentity: "qq-implementer-workspace-write-v1"
  }
' "$ROOT/delegation/policies/roles.json" >/dev/null
jq -e '
  .additionalProperties == false
  and (.required | sort) == ([
    "status", "summary", "commits", "checks", "filesChanged",
    "contestableDecisions", "openQuestions", "unresolvedRisks",
    "branch", "worktree"
  ] | sort)
' "$ROOT/delegation/manifests/completion-envelope.schema.json" >/dev/null

fake_landstrip="$tmp/landstrip"
cat >"$fake_landstrip" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = --version ]; then
  printf 'landstrip 0.17.30\n'
  exit 0
fi

[ "${1:-}" = -p ] || exit 64
[ "$#" -ge 3 ] || exit 64
policy="$2"
shift 2
if [ -n "${FAKE_POLICY_SNAPSHOT:-}" ]; then
  cp "$policy" "$FAKE_POLICY_SNAPSHOT"
fi
exec "$@"
SH
chmod +x "$fake_landstrip"

fake_pi="$tmp/pi"
cat >"$fake_pi" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\0' "$@" >"$FAKE_PI_ARGS"
env | LC_ALL=C sort >"$FAKE_PI_ENV"
if [ -n "${FAKE_EXPECT_AUTH_SOURCE:-}" ]; then
  [ -r "$PI_CODING_AGENT_DIR/auth.json" ]
  cmp -s -- "$FAKE_EXPECT_AUTH_SOURCE" "$PI_CODING_AGENT_DIR/auth.json"
fi
printf 'pi-live-event role=%s\n' "${PI_SUBAGENT_CHILD_AGENT:-missing}"

case "${FAKE_PI_MODE:-done}" in
  done) ;;
  wedge)
    sleep 300 &
    child=$!
    printf '%s\n' "$child" >"$FAKE_CHILD_PID"
    wait "$child"
    ;;
  *) exit 64 ;;
esac
SH
chmod +x "$fake_pi"

runtime_root="$tmp/runtime"
mkdir -p "$runtime_root"
export QQ_LANDSTRIP_BIN="$fake_landstrip"
export QQ_PI_BIN="$fake_pi"
export QQ_DISPATCH_RUNTIME_ROOT="$runtime_root"
export QQ_DISPATCH_TIMEOUT=2s
export FAKE_PI_ARGS="$tmp/pi.args"
export FAKE_PI_ENV="$tmp/pi.env"

git_common_dir="$(
  git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir
)"
git_worktree_dir="$(
  git -C "$ROOT" rev-parse --path-format=absolute --git-dir
)"
git_common_dir="$(realpath -e "$git_common_dir")"
git_worktree_dir="$(realpath -e "$git_worktree_dir")"

for role in reviewer researcher implementer; do
  case "$role" in
    reviewer)
      expected_policy=qq-reviewer-read-only-v1
      expected_scope=read-only
      ;;
    researcher)
      expected_policy=qq-researcher-read-only-v1
      expected_scope=read-only
      ;;
    implementer)
      expected_policy=qq-implementer-workspace-write-v1
      expected_scope=workspace-write
      ;;
  esac

  policy_snapshot="$tmp/$role-policy.json"
  stdout_file="$tmp/$role.stdout"
  stderr_file="$tmp/$role.stderr"
  (
    cd "$ROOT"
    PI_SUBAGENT_CHILD_AGENT="$role" \
    PI_SUBAGENT_RUN_ID="$role-smoke" \
    PI_SUBAGENT_CHILD_INDEX=2 \
    FAKE_POLICY_SNAPSHOT="$policy_snapshot" \
      "$DISPATCH" --json --model smoke/model
  ) >"$stdout_file" 2>"$stderr_file"

  assert_file_contains "$stdout_file" "pi-live-event role=$role" \
    "$role did not retain the Pi events stream"
  assert_file_contains "$stderr_file" \
    "role=$role policy=$expected_policy scope=$expected_scope boundary=landstrip"
  python3 - "$FAKE_PI_ARGS" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
assert args == [
    b"--approve",
    b"--offline",
    b"--json",
    b"--model",
    b"smoke/model",
    b"",
], args
PY
  grep -Fxq "QQ_DISPATCH_WORKTREE=$ROOT" "$FAKE_PI_ENV" \
    || fail "$role did not receive the assigned worktree"
  grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$git_common_dir" "$FAKE_PI_ENV" \
    || fail "$role did not receive the Git common directory"
  grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$git_worktree_dir" "$FAKE_PI_ENV" \
    || fail "$role did not receive the worktree Git directory"
  grep -Fxq "QQ_DISPATCH_POLICY_IDENTITY=$expected_policy" "$FAKE_PI_ENV" \
    || fail "$role did not receive its policy identity"
  grep -Fxq "QQ_DISPATCH_POLICY_SCOPE=$expected_scope" "$FAKE_PI_ENV" \
    || fail "$role did not receive its policy scope"
  pi_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
  role_run_dir="$(dirname -- "$pi_config_dir")"
  [ ! -e "$pi_config_dir/auth.json" ] \
    || fail "$role staged an absent launcher auth file"
  grep -Fxq "TMPDIR=$role_run_dir/tmp" "$FAKE_PI_ENV" \
    || fail "$role did not retain its run-local child TMPDIR"

  if [ "$role" = implementer ]; then
    jq -e \
      --arg runtime "$runtime_root" \
      --arg worktree "$ROOT" \
      --arg common "$git_common_dir" \
      --arg worktree_git "$git_worktree_dir" \
      --arg auth "$pi_config_dir/auth.json" \
      --arg temp "$pi_subagent_temp_prefix" '
        .enabled == true
        and .network == {
          allowNetwork: false,
          allowLocalBinding: false,
          allowAllUnixSockets: false,
          allowUnixSockets: [],
          allowedDomains: [],
          deniedDomains: []
        }
        and (.filesystem.allowWrite | sort) == (
          [$runtime, $worktree, $common, $worktree_git, "/dev/null", $temp]
          | unique
          | sort
        )
        and .filesystem.denyWrite == [$auth]
      ' "$policy_snapshot" >/dev/null
  else
    jq -e --arg auth "$pi_config_dir/auth.json" --arg temp "$pi_subagent_temp_prefix" \
      '.enabled == true
       and .filesystem.allowWrite == [$temp]
       and .filesystem.denyWrite == [$auth]
       and .network.allowNetwork == false' \
      "$policy_snapshot" >/dev/null
  fi
done

auth_source="$HOME/.pi/agent/auth.json"
auth_runtime="$tmp/auth-runtime"
mkdir -p "$(dirname -- "$auth_source")" "$auth_runtime"
printf '%s\n' '{"credential":"test-only-auth-sentinel"}' >"$auth_source"
chmod 644 "$auth_source"
(
  cd "$ROOT"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=auth-staging-smoke \
  QQ_DISPATCH_RUNTIME_ROOT="$auth_runtime" \
  FAKE_EXPECT_AUTH_SOURCE="$auth_source" \
  FAKE_POLICY_SNAPSHOT="$tmp/auth-policy.json" \
    "$DISPATCH" --json
) >"$tmp/auth.stdout" 2>"$tmp/auth.stderr"
auth_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
staged_auth="$auth_config_dir/auth.json"
[ -f "$staged_auth" ] || fail 'launcher auth was not staged'
cmp -s -- "$auth_source" "$staged_auth" \
  || fail 'staged auth does not match the launcher auth'
assert_equal 600 "$(stat -c '%a' "$staged_auth")" \
  'staged auth mode is not 600'
jq -e --arg auth "$staged_auth" --arg temp "$pi_subagent_temp_prefix" '
  .filesystem.allowWrite == [$temp]
  and .filesystem.denyWrite == [$auth]
' "$tmp/auth-policy.json" >/dev/null
for auth_output in \
  "$tmp/auth.stdout" \
  "$tmp/auth.stderr" \
  "$auth_runtime/wrapper-events.jsonl"; do
  if grep -Fq 'test-only-auth-sentinel' "$auth_output"; then
    fail "auth content leaked through $auth_output"
  fi
done
rm "$auth_source"

default_tmp="$tmp/default-tmp"
default_runtime="$default_tmp/qq-delegate-runtime"
(
  cd "$ROOT"
  env -u QQ_DISPATCH_RUNTIME_ROOT \
    TMPDIR="$default_tmp" \
    PI_SUBAGENT_CHILD_AGENT=implementer \
    PI_SUBAGENT_RUN_ID=default-runtime-smoke \
    FAKE_POLICY_SNAPSHOT="$tmp/default-runtime-policy.json" \
    "$DISPATCH" --json
) >"$tmp/default-runtime.stdout" 2>"$tmp/default-runtime.stderr"
assert_file_contains "$tmp/default-runtime.stdout" \
  'pi-live-event role=implementer'
jq -e \
  --arg runtime "$default_runtime" \
  --arg temp "$default_tmp/pi-subagent-*" '
    (.filesystem.allowWrite | index($runtime) != null)
    and (.filesystem.allowWrite | index($temp) != null)
  ' \
  "$tmp/default-runtime-policy.json" >/dev/null

# Exercise distinct common/per-worktree Git metadata even when the checkout
# running this suite is a primary checkout, as it is in ordinary CI clones.
fixture_primary="$tmp/linked-fixture-primary"
fixture_worktree="$tmp/linked-fixture-worktree"
git init -q "$fixture_primary"
git -C "$fixture_primary" \
  -c user.name='qq dispatch test' \
  -c user.email='qq-dispatch@example.invalid' \
  -c commit.gpgSign=false \
  commit --allow-empty -qm 'dispatch test base'
git -C "$fixture_primary" worktree add -q -b dispatch-linked "$fixture_worktree"
for fixture_checkout in "$fixture_primary" "$fixture_worktree"; do
  mkdir -p \
    "$fixture_checkout/bin/lib" \
    "$fixture_checkout/delegation/policies"
  cp "$DISPATCH" "$fixture_checkout/bin/qq-dispatch"
  cp "$ROOT/bin/lib/qq-bin.sh" "$fixture_checkout/bin/lib/qq-bin.sh"
  cp "$RENDERER" "$fixture_checkout/bin/lib/qq-render-landstrip-policy.mjs"
  cp "$SUPERVISOR" "$fixture_checkout/bin/lib/qq-process-tree-supervisor.py"
  cp "$ROOT/delegation/policies/roles.json" \
    "$fixture_checkout/delegation/policies/roles.json"
done
fixture_common_dir="$(
  git -C "$fixture_worktree" rev-parse --path-format=absolute --git-common-dir
)"
fixture_git_dir="$(
  git -C "$fixture_worktree" rev-parse --path-format=absolute --git-dir
)"
fixture_common_dir="$(realpath -e "$fixture_common_dir")"
fixture_git_dir="$(realpath -e "$fixture_git_dir")"
[ "$fixture_common_dir" != "$fixture_git_dir" ] \
  || fail 'linked-worktree fixture did not produce distinct Git directories'
fixture_runtime="$tmp/linked-runtime"
mkdir -p "$fixture_runtime"
(
  cd "$fixture_worktree"
  PI_SUBAGENT_CHILD_AGENT=implementer \
  PI_SUBAGENT_RUN_ID=linked-smoke \
  QQ_DISPATCH_RUNTIME_ROOT="$fixture_runtime" \
  FAKE_POLICY_SNAPSHOT="$tmp/linked-policy.json" \
    "$fixture_worktree/bin/qq-dispatch" --json
) >"$tmp/linked.stdout" 2>"$tmp/linked.stderr"
grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$fixture_common_dir" "$FAKE_PI_ENV" \
  || fail 'linked adapter did not discover its common Git directory'
grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$fixture_git_dir" "$FAKE_PI_ENV" \
  || fail 'linked adapter did not discover its per-worktree Git directory'
jq -e \
  --arg runtime "$fixture_runtime" \
  --arg worktree "$fixture_worktree" \
  --arg common "$fixture_common_dir" \
  --arg worktree_git "$fixture_git_dir" \
  --arg temp "$pi_subagent_temp_prefix" '
    .filesystem.allowWrite == [
      $runtime, $worktree, $common, $worktree_git, "/dev/null", $temp
    ]
  ' "$tmp/linked-policy.json" >/dev/null

fixture_capture_dir="$fixture_worktree/.pi-subagents/artifacts"
fixture_capture_path="$fixture_capture_dir/same-worktree-envelope.json"
mkdir -p "$fixture_capture_dir"
(
  cd "$fixture_worktree"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=linked-capture-smoke \
  PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE="$fixture_capture_path" \
  QQ_DISPATCH_RUNTIME_ROOT="$fixture_runtime" \
  FAKE_POLICY_SNAPSHOT="$tmp/linked-capture-policy.json" \
    "$fixture_worktree/bin/qq-dispatch" --json
) >"$tmp/linked-capture.stdout" 2>"$tmp/linked-capture.stderr"
assert_file_contains "$tmp/linked-capture.stdout" \
  'pi-live-event role=reviewer'
jq -e --arg capture "$fixture_capture_path" --arg temp "$pi_subagent_temp_prefix" \
  '.filesystem.allowWrite == [$capture, $temp]' \
  "$tmp/linked-capture-policy.json" >/dev/null

# Exercise the production shape: the canonical adapter and its policy sources
# remain in the primary checkout while pi-subagents starts the child in a
# linked worktree from the same Repository.
rm "$fixture_worktree/delegation/policies/roles.json"
canonical_runtime="$tmp/canonical-runtime"
mkdir -p "$canonical_runtime"
(
  cd "$fixture_worktree"
  PI_SUBAGENT_CHILD_AGENT=implementer \
  PI_SUBAGENT_RUN_ID=canonical-smoke \
  QQ_DISPATCH_RUNTIME_ROOT="$canonical_runtime" \
  FAKE_POLICY_SNAPSHOT="$tmp/canonical-policy.json" \
    "$fixture_primary/bin/qq-dispatch" --json
) >"$tmp/canonical.stdout" 2>"$tmp/canonical.stderr"
grep -Fxq "QQ_DISPATCH_WORKTREE=$fixture_worktree" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not select the child worktree'
grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$fixture_common_dir" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not discover the shared Git common directory'
grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$fixture_git_dir" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not discover the child worktree Git directory'
jq -e \
  --arg runtime "$canonical_runtime" \
  --arg worktree "$fixture_worktree" \
  --arg common "$fixture_common_dir" \
  --arg worktree_git "$fixture_git_dir" \
  --arg temp "$pi_subagent_temp_prefix" '
    .filesystem.allowWrite == [
      $runtime, $worktree, $common, $worktree_git, "/dev/null", $temp
    ]
  ' "$tmp/canonical-policy.json" >/dev/null

canonical_capture_path="$fixture_capture_dir/canonical-envelope.json"
(
  cd "$fixture_worktree"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=canonical-capture-smoke \
  PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE="$canonical_capture_path" \
  QQ_DISPATCH_RUNTIME_ROOT="$canonical_runtime" \
  FAKE_POLICY_SNAPSHOT="$tmp/canonical-capture-policy.json" \
    "$fixture_primary/bin/qq-dispatch" --json
) >"$tmp/canonical-capture.stdout" 2>"$tmp/canonical-capture.stderr"
assert_file_contains "$tmp/canonical-capture.stdout" \
  'pi-live-event role=reviewer'
jq -e --arg capture "$canonical_capture_path" --arg temp "$pi_subagent_temp_prefix" \
  '.filesystem.allowWrite == [$capture, $temp]' \
  "$tmp/canonical-capture-policy.json" >/dev/null

jq -s -e '
  length == 3
  and all(.[]; .type == "qq.dispatch.adapter.launch")
  and (map(.policyIdentity) | sort) == ([
    "qq-reviewer-read-only-v1",
    "qq-researcher-read-only-v1",
    "qq-implementer-workspace-write-v1"
  ] | sort)
' "$runtime_root/wrapper-events.jsonl" >/dev/null

capture_dir="$runtime_root/capture"
capture_path="$capture_dir/envelope.json"
mkdir -p "$capture_dir"
(
  cd "$ROOT"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=capture-smoke \
  PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE="$capture_path" \
  FAKE_POLICY_SNAPSHOT="$tmp/capture-policy.json" \
    "$DISPATCH" --json
) >"$tmp/capture.stdout" 2>"$tmp/capture.stderr"
jq -e --arg capture "$capture_path" --arg temp "$pi_subagent_temp_prefix" \
  '.filesystem.allowWrite == [$capture, $temp]' \
  "$tmp/capture-policy.json" >/dev/null
jq -s -e --arg capture "$capture_path" --arg temp "$pi_subagent_temp_prefix" '
  map(select(.runId == "capture-smoke")) as $events
  | ($events | length) == 1
  and $events[0].type == "qq.dispatch.adapter.launch"
  and $events[0].role == "reviewer"
  and $events[0].policyIdentity == "qq-reviewer-read-only-v1"
  and $events[0].access == "read-only"
  and $events[0].allowWrite == [$capture, $temp]
  and $events[0].structuredOutputCapture == $capture
  and $events[0].timeout == "2s"
  and $events[0].landstripVersion == "landstrip 0.17.30"
' "$runtime_root/wrapper-events.jsonl" >/dev/null

run_failure() {
  local label="$1"
  local cwd="$2"
  shift 2
  set +e
  (
    cd "$cwd"
    "$@"
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  [ "$status" -ne 0 ] || fail "$label unexpectedly succeeded"
}

run_capture_refusal() {
  local label="$1"
  local capture="$2"
  : >"$FAKE_PI_ARGS"
  set +e
  (
    cd "$ROOT"
    HOME="$tmp/home" \
      PI_SUBAGENT_CHILD_AGENT=reviewer \
      PI_SUBAGENT_RUN_ID="$label" \
      PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE="$capture" \
        "$DISPATCH" --json
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  assert_equal 68 "$status" "$label did not exit 68"
  assert_file_contains "$tmp/$label.stderr" \
    'structured-output capture path must stay beneath the runtime root or assigned worktree'
  [ ! -s "$FAKE_PI_ARGS" ] || fail "$label launched Pi"
}

home_capture_dir="$tmp/home/capture"
mkdir -p "$home_capture_dir"
run_capture_refusal home-capture-refusal \
  "$home_capture_dir/envelope.json"

escape_capture_dir="$tmp/escaped-capture"
mkdir -p "$escape_capture_dir"
run_capture_refusal capture-dotdot-refusal \
  "$capture_dir/../../escaped-capture/envelope.json"

run_failure missing-role "$ROOT" \
  env -u PI_SUBAGENT_CHILD_AGENT "$DISPATCH" --json
assert_file_contains "$tmp/missing-role.stderr" \
  'PI_SUBAGENT_CHILD_AGENT is required'

run_failure unsupported-role "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=planner "$DISPATCH" --json
assert_file_contains "$tmp/unsupported-role.stderr" \
  "unsupported child role 'planner'"

unrelated_repository="$tmp/unrelated-repository"
git init -q "$unrelated_repository"
run_failure unrelated-repository "$unrelated_repository" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer \
  "$fixture_primary/bin/qq-dispatch" --json
assert_file_contains "$tmp/unrelated-repository.stderr" \
  'child cwd belongs to an unrelated repository'

outside="$tmp/outside"
mkdir -p "$outside"
run_failure non-git-cwd "$outside" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer \
  "$fixture_primary/bin/qq-dispatch" --json
assert_file_contains "$tmp/non-git-cwd.stderr" \
  'child cwd is not a Git worktree'

real_git="$(command -v git)"
fake_git="$tmp/git"
cat >"$fake_git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case " $* " in
  *' --git-common-dir '*) exit 1 ;;
esac
exec "$REAL_GIT_BIN" "$@"
SH
chmod +x "$fake_git"
run_failure undiscoverable-git "$ROOT" \
  env \
    REAL_GIT_BIN="$real_git" \
    QQ_GIT_BIN="$fake_git" \
    PI_SUBAGENT_CHILD_AGENT=implementer \
    "$DISPATCH" --json
assert_file_contains "$tmp/undiscoverable-git.stderr" \
  'cannot discover the Git common directory'

: >"$FAKE_PI_ARGS"
run_failure missing-landstrip "$ROOT" \
  env \
    QQ_LANDSTRIP_BIN="$tmp/missing-landstrip" \
    PI_SUBAGENT_CHILD_AGENT=reviewer \
    "$DISPATCH" --json
assert_file_contains "$tmp/missing-landstrip.stderr" \
  'QQ_LANDSTRIP_BIN must be an absolute executable file'
[ ! -s "$FAKE_PI_ARGS" ] || fail 'missing Landstrip launched Pi'

policy_fixture="$tmp/policy-fixture"
mkdir -p "$policy_fixture/bin/lib"
git init -q "$policy_fixture"
cp "$DISPATCH" "$policy_fixture/bin/qq-dispatch"
cp "$ROOT/bin/lib/qq-bin.sh" "$policy_fixture/bin/lib/qq-bin.sh"
cp "$RENDERER" "$policy_fixture/bin/lib/qq-render-landstrip-policy.mjs"
cp "$SUPERVISOR" "$policy_fixture/bin/lib/qq-process-tree-supervisor.py"

: >"$FAKE_PI_ARGS"
run_failure missing-policy "$policy_fixture" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer \
  "$policy_fixture/bin/qq-dispatch" --json
assert_file_contains "$tmp/missing-policy.stderr" \
  'Landstrip role policy is unavailable'
[ ! -s "$FAKE_PI_ARGS" ] || fail 'missing policy launched Pi'

mkdir -p "$policy_fixture/delegation/policies"
printf '{ malformed\n' >"$policy_fixture/delegation/policies/roles.json"
: >"$FAKE_PI_ARGS"
run_failure malformed-policy "$policy_fixture" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer \
  "$policy_fixture/bin/qq-dispatch" --json
assert_file_contains "$tmp/malformed-policy.stderr" \
  'Landstrip policy rendering failed'
[ ! -s "$FAKE_PI_ARGS" ] || fail 'malformed policy launched Pi'

export FAKE_PI_MODE=wedge
export FAKE_CHILD_PID="$tmp/wedged-child.pid"
set +e
(
  cd "$ROOT"
  PI_SUBAGENT_CHILD_AGENT=implementer \
  PI_SUBAGENT_RUN_ID=timeout-smoke \
  QQ_DISPATCH_TIMEOUT=0.2s \
  FAKE_POLICY_SNAPSHOT="$tmp/timeout-policy.json" \
    "$DISPATCH" --json
) >"$tmp/timeout.stdout" 2>"$tmp/timeout.stderr"
timeout_status=$?
set -e
assert_equal 124 "$timeout_status" 'adapter did not preserve GNU timeout status'
[ -s "$FAKE_CHILD_PID" ] || fail 'timeout probe did not announce its child'
child_pid="$(cat "$FAKE_CHILD_PID")"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$child_pid" 2>/dev/null; then
    break
  fi
  sleep 0.05
done
if kill -0 "$child_pid" 2>/dev/null; then
  fail "process-tree supervisor leaked wedged descendant $child_pid"
fi

printf 'test-qq-dispatch: pass\n'
