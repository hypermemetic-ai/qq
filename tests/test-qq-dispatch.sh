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
pi_subagent_own_temp="$parent_tmp/pi-subagent-THIS"
pi_subagent_sess="$parent_tmp/pi-subagent-sessions"
mkdir -p "$test_home" "$pi_subagent_own_temp"
export HOME="$test_home"
export TMPDIR="$parent_tmp"

# The adapter requires the dispatcher-side pi-subagents config to name the
# session root (README Install); stage it for every dispatch in this suite.
mkdir -p "$test_home/.pi/agent/extensions/subagent"
printf '{"defaultSessionDir": "%s"}\n' "$parent_tmp/pi-subagent-sessions" \
  > "$test_home/.pi/agent/extensions/subagent/config.json"

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
    "$(grep -c '^model: openai-codex/gpt-5\.6-sol:xhigh$' "$manifest")" \
    "$role does not have exactly one GPT-5.6 Sol xhigh model pin"
  assert_file_contains "$manifest" \
    '# Runtime model-identity verification is assigned to T-95 ticket 3.'
done

FAST_EXTENSION="$ROOT/extensions/qq-codex-fast.ts"
[ -f "$FAST_EXTENSION" ] || fail "GPT-5.6 fast-mode extension is missing: $FAST_EXTENSION"
assert_file_contains "$DISPATCH" 'qq-codex-fast.ts'
assert_file_contains "$FAST_EXTENSION" 'service_tier'
assert_file_contains "$FAST_EXTENSION" 'before_provider_request'
jq -e '
  .schemaVersion == 1
  and .landstripVersion == "0.17.31"
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
  printf 'landstrip %s\n' "${FAKE_LANDSTRIP_VERSION:-0.17.31}"
  exit 0
fi

[ "${1:-}" = -p ] || exit 64
[ "$#" -ge 3 ] || exit 64
policy="$2"
shift 2
if [ -n "${FAKE_POLICY_SNAPSHOT:-}" ]; then
  cp "$policy" "$FAKE_POLICY_SNAPSHOT"
fi
jq -e '.filesystem.allowWrite | index("/dev/null") != null' \
  "$policy" >/dev/null \
  || { printf 'sandbox policy does not grant /dev/null\n' >&2; exit 77; }
# decision-8 accepts open egress under Landstrip 0.17.31; policies must not
# imply domain enforcement by emitting fields the native binary ignores.
jq -e '
  .network == {
    allowNetwork: true,
    allowLocalBinding: false,
    allowAllUnixSockets: false,
    allowUnixSockets: []
  }
  and (.network | has("allowedDomains") | not)
  and (.network | has("deniedDomains") | not)
' "$policy" >/dev/null \
  || { printf 'sandbox policy misstates the accepted network posture\n' >&2; exit 77; }
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
sh -c 'git status >/dev/null'
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

declare -A role_policy_snapshots=()
declare -A role_run_dirs=()

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
  python3 - "$FAKE_PI_ARGS" "$ROOT" <<'PY'
from pathlib import Path
import sys

args = Path(sys.argv[1]).read_bytes().split(b"\0")
extension = str(Path(sys.argv[2]) / "extensions" / "qq-codex-fast.ts").encode()
assert args == [
    b"--approve",
    b"--offline",
    b"--extension",
    extension,
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
  role_policy_snapshots["$role"]="$policy_snapshot"
  role_run_dirs["$role"]="$role_run_dir"
  [ ! -e "$pi_config_dir/auth.json" ] \
    || fail "$role staged an absent launcher auth file"
  grep -Fxq "TMPDIR=$role_run_dir/tmp" "$FAKE_PI_ENV" \
    || fail "$role did not retain its run-local child TMPDIR"

  if [ "$role" = implementer ]; then
    jq -e \
      --arg worktree "$ROOT" \
      --arg common "$git_common_dir" \
      --arg worktree_git "$git_worktree_dir" \
      --arg run "$role_run_dir" \
      --arg runtime "$runtime_root" \
      --arg auth "$pi_config_dir/auth.json" \
      --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" '
        .enabled == true
        and .network == {
          allowNetwork: true,
          allowLocalBinding: false,
          allowAllUnixSockets: false,
          allowUnixSockets: []
        }
        and (.network | has("allowedDomains") | not)
        and (.network | has("deniedDomains") | not)
        and (.filesystem.allowWrite | sort) == (
          [$run, $worktree, $common, $worktree_git, "/dev/null", $temp, $sess]
          | unique
          | sort
        )
        and (.filesystem.allowWrite | index($runtime)) == null
        and .filesystem.denyWrite == [$auth]
      ' "$policy_snapshot" >/dev/null
  else
    jq -e \
      --arg run "$role_run_dir" \
      --arg runtime "$runtime_root" \
      --arg auth "$pi_config_dir/auth.json" \
      --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" \
      '.enabled == true
       and .network == {
         allowNetwork: true,
         allowLocalBinding: false,
         allowAllUnixSockets: false,
         allowUnixSockets: []
       }
       and (.network | has("allowedDomains") | not)
       and (.network | has("deniedDomains") | not)
       and .filesystem.allowWrite == [$run, "/dev/null", $temp, $sess]
       and (.filesystem.allowWrite | index($runtime)) == null
       and .filesystem.denyWrite == [$auth]
      ' \
      "$policy_snapshot" >/dev/null
  fi
done

# Correlation propagation experiment: qq-dispatch receives accountable-side
# context and the stubbed child records the environment that crosses the policy.
propagation_runtime="$tmp/propagation-runtime"
mkdir -p "$propagation_runtime"
(
  cd "$ROOT"
  QQ_TRACE_ID=11111111111111111111111111111111 \
  PI_ROOT_SPAN_ID=2222222222222222 \
  PI_PARENT_SPAN_ID=3333333333333333 \
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=trace-propagation-smoke \
  PI_SUBAGENT_CHILD_INDEX=7 \
  QQ_DISPATCH_RUNTIME_ROOT="$propagation_runtime" \
    "$DISPATCH" --json
) >"$tmp/propagation.stdout" 2>"$tmp/propagation.stderr"
grep -Fxq 'QQ_TRACE_ID=11111111111111111111111111111111' "$FAKE_PI_ENV" \
  || fail 'trace ID did not propagate to the child'
grep -Fxq 'PI_ROOT_SPAN_ID=2222222222222222' "$FAKE_PI_ENV" \
  || fail 'root span ID did not propagate to the child'
propagated_parent="$(sed -n 's/^PI_PARENT_SPAN_ID=//p' "$FAKE_PI_ENV")"
[[ "$propagated_parent" =~ ^[0-9a-f]{16}$ ]] \
  || fail 'delegate span ID did not propagate as the child parent'
[ "$propagated_parent" != 3333333333333333 ] \
  || fail 'child was parented directly to the accountable parent instead of the delegate span'
repository_name="$(basename "$(dirname "$git_common_dir")")"
span_store="$HOME/.local/state/qq/spans/$repository_name/spans.jsonl"
jq -s -e \
  --arg parent "$propagated_parent" \
  --arg worktree "$ROOT" '
  map(select(.attributes["run.id"] == "trace-propagation-smoke")) as $spans
  | ($spans | length) == 1
  and $spans[0].name == "invoke_agent"
  and $spans[0].phase == "review"
  and $spans[0].trace_id == "11111111111111111111111111111111"
  and $spans[0].span_id == $parent
  and $spans[0].parent_span_id == "3333333333333333"
  and $spans[0].root_span_id == "2222222222222222"
  and $spans[0].attributes["child.index"] == "7"
  and $spans[0].attributes.worktree == $worktree
  and $spans[0].attributes["exit.status"] == "0"
' "$span_store" >/dev/null

# Observation is not on the dispatch critical path: an unsafe configured store
# is refused, while the child result remains successful.
(
  cd "$ROOT"
  XDG_STATE_HOME="$ROOT/.dispatch-observation-test" \
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=observation-failure-smoke \
    "$DISPATCH" --json
) >"$tmp/observation-failure.stdout" 2>"$tmp/observation-failure.stderr"
assert_file_contains "$tmp/observation-failure.stdout" 'pi-live-event role=reviewer'
assert_file_contains "$tmp/observation-failure.stderr" 'observation write failed; dispatch result preserved'
[ ! -e "$ROOT/.dispatch-observation-test" ] \
  || fail 'failed observation wrote state inside the worktree'

# Pi-subagents creates this run's temp directories before spawn. A later run's
# directory, created after these policies were rendered, must not be covered by
# an earlier policy (there is deliberately no shared pi-subagent-* grant).
pi_subagent_later_temp="$parent_tmp/pi-subagent-OTHER"
mkdir "$pi_subagent_later_temp"
for role in reviewer researcher implementer; do
  jq -e --arg later "$pi_subagent_later_temp" '
    (.filesystem.allowWrite | index($later)) == null
    and all(.filesystem.allowWrite[]; endswith("/pi-subagent-*") | not)
  ' "${role_policy_snapshots[$role]}" >/dev/null
done
rmdir "$pi_subagent_later_temp"

for role in reviewer researcher implementer; do
  for sibling_role in reviewer researcher implementer; do
    [ "$role" = "$sibling_role" ] && continue
    jq -e --arg sibling "${role_run_dirs[$sibling_role]}" \
      '(.filesystem.allowWrite | index($sibling)) == null' \
      "${role_policy_snapshots[$role]}" >/dev/null
  done
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
auth_run_dir="$(dirname -- "$auth_config_dir")"
staged_auth="$auth_config_dir/auth.json"
[ -f "$staged_auth" ] || fail 'launcher auth was not staged'
cmp -s -- "$auth_source" "$staged_auth" \
  || fail 'staged auth does not match the launcher auth'
assert_equal 600 "$(stat -c '%a' "$staged_auth")" \
  'staged auth mode is not 600'
jq -e --arg run "$auth_run_dir" --arg auth "$staged_auth" --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" '
  .filesystem.allowWrite == [$run, "/dev/null", $temp, $sess]
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
default_home="$tmp/default-home"
mkdir -p "$default_home/.pi/agent/extensions/subagent"
printf '{"defaultSessionDir": "%s"}\n' "$default_tmp/pi-subagent-sessions" \
  > "$default_home/.pi/agent/extensions/subagent/config.json"
(
  cd "$ROOT"
  env -u QQ_DISPATCH_RUNTIME_ROOT \
    HOME="$default_home" \
    TMPDIR="$default_tmp" \
    PI_SUBAGENT_CHILD_AGENT=implementer \
    PI_SUBAGENT_RUN_ID=default-runtime-smoke \
    FAKE_POLICY_SNAPSHOT="$tmp/default-runtime-policy.json" \
    "$DISPATCH" --json
) >"$tmp/default-runtime.stdout" 2>"$tmp/default-runtime.stderr"
assert_file_contains "$tmp/default-runtime.stdout" \
  'pi-live-event role=implementer'
default_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
default_run_dir="$(dirname -- "$default_config_dir")"
jq -e \
  --arg run "$default_run_dir" \
  --arg runtime "$default_runtime" \
  --arg temp_prefix "$default_tmp/pi-subagent-" \
  --arg sess "$default_tmp/pi-subagent-sessions" '
    (.filesystem.allowWrite | index($run) != null)
    and (.filesystem.allowWrite | index($runtime) == null)
    and (.filesystem.allowWrite | index("/dev/null") != null)
    and (.filesystem.allowWrite | map(select(startswith($temp_prefix))) == [$sess])
  ' \
  "$tmp/default-runtime-policy.json" >/dev/null

platform="$(node -p 'process.platform')"
architecture="$(node -p 'process.arch')"
operator_landstrip="$HOME/.pi/agent/npm/node_modules/@landstrip/landstrip-${platform}-${architecture}/bin/landstrip"
mkdir -p "$(dirname -- "$operator_landstrip")"
cp "$fake_landstrip" "$operator_landstrip"
(
  cd "$ROOT"
  env -u QQ_LANDSTRIP_BIN \
    PI_SUBAGENT_CHILD_AGENT=reviewer \
    PI_SUBAGENT_RUN_ID=operator-npm-resolution-smoke \
    FAKE_POLICY_SNAPSHOT="$tmp/operator-npm-policy.json" \
    "$DISPATCH" --json
) >"$tmp/operator-npm.stdout" 2>"$tmp/operator-npm.stderr"
assert_file_contains "$tmp/operator-npm.stdout" 'pi-live-event role=reviewer'

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
    "$fixture_checkout/delegation/policies" \
    "$fixture_checkout/extensions"
  cp "$DISPATCH" "$fixture_checkout/bin/qq-dispatch"
  cp "$ROOT/bin/lib/qq-bin.sh" "$fixture_checkout/bin/lib/qq-bin.sh"
  cp "$RENDERER" "$fixture_checkout/bin/lib/qq-render-landstrip-policy.mjs"
  cp "$SUPERVISOR" "$fixture_checkout/bin/lib/qq-process-tree-supervisor.py"
  cp "$ROOT/delegation/policies/roles.json" \
    "$fixture_checkout/delegation/policies/roles.json"
  cp "$FAST_EXTENSION" "$fixture_checkout/extensions/qq-codex-fast.ts"
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
linked_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
linked_run_dir="$(dirname -- "$linked_config_dir")"
grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$fixture_common_dir" "$FAKE_PI_ENV" \
  || fail 'linked adapter did not discover its common Git directory'
grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$fixture_git_dir" "$FAKE_PI_ENV" \
  || fail 'linked adapter did not discover its per-worktree Git directory'
jq -e \
  --arg worktree "$fixture_worktree" \
  --arg common "$fixture_common_dir" \
  --arg worktree_git "$fixture_git_dir" \
  --arg run "$linked_run_dir" \
  --arg runtime "$fixture_runtime" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" '
    .filesystem.allowWrite == [
      $run, $worktree, $common, $worktree_git, "/dev/null", $temp, $sess
    ]
    and (.filesystem.allowWrite | index($runtime)) == null
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
linked_capture_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
linked_capture_run_dir="$(dirname -- "$linked_capture_config_dir")"
jq -e \
  --arg run "$linked_capture_run_dir" \
  --arg capture "$fixture_capture_path" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" \
  '.filesystem.allowWrite == [$run, $capture, "/dev/null", $temp, $sess]' \
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
canonical_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
canonical_run_dir="$(dirname -- "$canonical_config_dir")"
grep -Fxq "QQ_DISPATCH_WORKTREE=$fixture_worktree" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not select the child worktree'
grep -Fxq "QQ_DISPATCH_GIT_COMMON_DIR=$fixture_common_dir" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not discover the shared Git common directory'
grep -Fxq "QQ_DISPATCH_GIT_WORKTREE_DIR=$fixture_git_dir" "$FAKE_PI_ENV" \
  || fail 'canonical adapter did not discover the child worktree Git directory'
jq -e \
  --arg worktree "$fixture_worktree" \
  --arg common "$fixture_common_dir" \
  --arg worktree_git "$fixture_git_dir" \
  --arg run "$canonical_run_dir" \
  --arg runtime "$canonical_runtime" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" '
    .filesystem.allowWrite == [
      $run, $worktree, $common, $worktree_git, "/dev/null", $temp, $sess
    ]
    and (.filesystem.allowWrite | index($runtime)) == null
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
canonical_capture_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
canonical_capture_run_dir="$(dirname -- "$canonical_capture_config_dir")"
jq -e \
  --arg run "$canonical_capture_run_dir" \
  --arg capture "$canonical_capture_path" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" \
  '.filesystem.allowWrite == [$run, $capture, "/dev/null", $temp, $sess]' \
  "$tmp/canonical-capture-policy.json" >/dev/null

jq -s -e '
  map(select(
    .runId == "reviewer-smoke"
    or .runId == "researcher-smoke"
    or .runId == "implementer-smoke"
  )) as $role_events
  | ($role_events | length) == 3
  and all($role_events[]; .type == "qq.dispatch.adapter.launch")
  and ($role_events | map(.policyIdentity) | sort) == ([
    "qq-reviewer-read-only-v1",
    "qq-researcher-read-only-v1",
    "qq-implementer-workspace-write-v1"
  ] | sort)
' "$runtime_root/wrapper-events.jsonl" >/dev/null

capture_dir="$runtime_root/capture"
capture_path="$capture_dir/envelope.json"
mkdir -p "$capture_dir"
printf '%s\n' '{"existing":"parent-owned"}' >"$capture_path"
(
  cd "$ROOT"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=capture-smoke \
  PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE="$capture_path" \
  FAKE_POLICY_SNAPSHOT="$tmp/capture-policy.json" \
    "$DISPATCH" --json
) >"$tmp/capture.stdout" 2>"$tmp/capture.stderr"
capture_config_dir="$(sed -n 's/^PI_CODING_AGENT_DIR=//p' "$FAKE_PI_ENV")"
capture_run_dir="$(dirname -- "$capture_config_dir")"
jq -e \
  --arg run "$capture_run_dir" \
  --arg capture "$capture_path" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" \
  '.filesystem.allowWrite == [$run, $capture, "/dev/null", $temp, $sess]' \
  "$tmp/capture-policy.json" >/dev/null
jq -s -e \
  --arg run "$capture_run_dir" \
  --arg capture "$capture_path" \
  --arg temp "$pi_subagent_own_temp" --arg sess "$pi_subagent_sess" '
  map(select(.runId == "capture-smoke")) as $events
  | ($events | length) == 1
  and $events[0].type == "qq.dispatch.adapter.launch"
  and $events[0].role == "reviewer"
  and $events[0].policyIdentity == "qq-reviewer-read-only-v1"
  and $events[0].access == "read-only"
  and $events[0].allowWrite == [$run, $capture, "/dev/null", $temp, $sess]
  and $events[0].structuredOutputCapture == $capture
  and $events[0].timeout == "2s"
  and $events[0].landstripVersion == "landstrip 0.17.31"
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
  local expected_message="$3"
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
  assert_file_contains "$tmp/$label.stderr" "$expected_message"
  [ ! -s "$FAKE_PI_ARGS" ] || fail "$label launched Pi"
}

home_capture_dir="$tmp/home/capture"
mkdir -p "$home_capture_dir"
run_capture_refusal home-capture-refusal \
  "$home_capture_dir/envelope.json" \
  'structured-output capture path must stay beneath the runtime root or assigned worktree'

escape_capture_dir="$tmp/escaped-capture"
mkdir -p "$escape_capture_dir"
run_capture_refusal capture-dotdot-refusal \
  "$capture_dir/../../escaped-capture/envelope.json" \
  'structured-output capture path must stay beneath the runtime root or assigned worktree'

capture_directory_target="$runtime_root/capture-directory-target"
mkdir "$capture_directory_target"
run_capture_refusal capture-directory-refusal \
  "$capture_directory_target" \
  'structured-output capture path must be a regular file when it exists'

capture_fifo_target="$runtime_root/capture-fifo-target"
mkfifo "$capture_fifo_target"
run_capture_refusal capture-fifo-refusal \
  "$capture_fifo_target" \
  'structured-output capture path must be a regular file when it exists'

renderer_refusal_run="$runtime_root/runs/renderer-capture-refusal"
mkdir -p "$renderer_refusal_run/pi-config"
run_renderer_capture_refusal() {
  local label="$1"
  local capture="$2"
  set +e
  "$RENDERER" \
    --roles "$ROOT/delegation/policies/roles.json" \
    --role reviewer \
    --run-id "$label" \
    --worktree "$ROOT" \
    --git-common-dir "$git_common_dir" \
    --git-worktree-dir "$git_worktree_dir" \
    --runtime-root "$runtime_root" \
    --pi-auth "$renderer_refusal_run/pi-config/auth.json" \
    --pi-subagent-temp-dir "$parent_tmp" \
    --structured-output-capture "$capture" \
    --policy "$renderer_refusal_run/$label-policy.json" \
    --event-log "$renderer_refusal_run/events.jsonl" \
    --timeout 2s \
    --landstrip-version 'landstrip 0.17.31' \
    >"$tmp/$label-renderer.stdout" 2>"$tmp/$label-renderer.stderr"
  local status=$?
  set -e
  [ "$status" -ne 0 ] || fail "$label renderer refusal unexpectedly succeeded"
  assert_file_contains "$tmp/$label-renderer.stderr" \
    'structured-output capture path must be a regular file when it exists'
}
run_renderer_capture_refusal capture-directory "$capture_directory_target"
run_renderer_capture_refusal capture-fifo "$capture_fifo_target"

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

: >"$FAKE_PI_ARGS"
run_failure mismatched-landstrip-version "$ROOT" \
  env \
    FAKE_LANDSTRIP_VERSION=0.17.30 \
    PI_SUBAGENT_CHILD_AGENT=reviewer \
    "$DISPATCH" --json
assert_file_contains "$tmp/mismatched-landstrip-version.stderr" \
  "Landstrip version mismatch: expected 'landstrip 0.17.31', got 'landstrip 0.17.30'"
[ ! -s "$FAKE_PI_ARGS" ] || fail 'mismatched Landstrip version launched Pi'

policy_fixture="$tmp/policy-fixture"
mkdir -p "$policy_fixture/bin/lib" "$policy_fixture/extensions"
git init -q "$policy_fixture"
cp "$DISPATCH" "$policy_fixture/bin/qq-dispatch"
cp "$ROOT/bin/lib/qq-bin.sh" "$policy_fixture/bin/lib/qq-bin.sh"
cp "$RENDERER" "$policy_fixture/bin/lib/qq-render-landstrip-policy.mjs"
cp "$SUPERVISOR" "$policy_fixture/bin/lib/qq-process-tree-supervisor.py"
cp "$FAST_EXTENSION" "$policy_fixture/extensions/qq-codex-fast.ts"

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

# The adapter pre-creates the pi-subagents session root (mode 700) beneath
# the launcher temp dir so the Landstrip policy's pi-subagent-* enumeration
# always has it to grant; without it, child session transcripts nest in the
# parent session tree, which the policy deliberately does not grant (T-128).
[ -d "$parent_tmp/pi-subagent-sessions" ] \
  || fail "adapter did not create the pi-subagents session root"
[ "$(stat -c %a "$parent_tmp/pi-subagent-sessions")" = "700" ] \
  || fail "pi-subagents session root is not mode 700"

# The session-root contract fails closed: a loose-mode or symlinked root, or
# a configured defaultSessionDir outside the launcher temp contract, must
# refuse dispatch rather than widen the grant or strand the child (T-128).
chmod 755 "$pi_subagent_sess"
run_failure session-root-loose-mode "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-guard "$DISPATCH" --json
assert_file_contains "$tmp/session-root-loose-mode.stderr" 'must be mode 700'
rm -rf "$pi_subagent_sess"
ln -s "$parent_tmp/elsewhere" "$pi_subagent_sess"
run_failure session-root-symlink "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-guard "$DISPATCH" --json
assert_file_contains "$tmp/session-root-symlink.stderr" 'is a symlink'
rm -f "$pi_subagent_sess"
rm -f "$test_home/.pi/agent/extensions/subagent/config.json"
run_failure session-root-no-config "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-guard "$DISPATCH" --json
assert_file_contains "$tmp/session-root-no-config.stderr" 'defaultSessionDir is not configured'
printf 'not json\n' > "$test_home/.pi/agent/extensions/subagent/config.json"
run_failure session-root-bad-json "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-guard "$DISPATCH" --json
assert_file_contains "$tmp/session-root-bad-json.stderr" 'defaultSessionDir is not configured'
mkdir -p "$test_home/.pi/agent/extensions/subagent"
printf '{"defaultSessionDir": "%s"}\n' "$tmp/outside-root" \
  > "$test_home/.pi/agent/extensions/subagent/config.json"
run_failure session-root-bad-config "$ROOT" \
  env PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-guard "$DISPATCH" --json
assert_file_contains "$tmp/session-root-bad-config.stderr" 'direct pi-subagent-* child'
printf '{"defaultSessionDir": "%s"}\n' "$parent_tmp/pi-subagent-custom" \
  > "$test_home/.pi/agent/extensions/subagent/config.json"
env -u FAKE_PI_MODE PI_SUBAGENT_CHILD_AGENT=reviewer PI_SUBAGENT_RUN_ID=session-root-custom \
  "$DISPATCH" --json >"$tmp/session-root-custom.stdout" 2>"$tmp/session-root-custom.stderr"
[ -d "$parent_tmp/pi-subagent-custom" ] \
  || fail "configured session root was not created"
[ "$(stat -c %a "$parent_tmp/pi-subagent-custom")" = "700" ] \
  || fail "configured session root is not mode 700"

# Observation spans below dispatch against the default session root again;
# the session-root contract cases above leave a custom config in place.
printf '{"defaultSessionDir": "%s"}\n' "$parent_tmp/pi-subagent-sessions" \
  > "$test_home/.pi/agent/extensions/subagent/config.json"

# PID-directed termination of qq-dispatch must be forwarded through timeout to
# the process-tree supervisor, while still leaving an error observation.
rm -f "$FAKE_CHILD_PID"
(
  cd "$ROOT"
  PI_SUBAGENT_CHILD_AGENT=reviewer \
  PI_SUBAGENT_RUN_ID=signal-smoke \
  QQ_DISPATCH_TIMEOUT=30s \
  FAKE_POLICY_SNAPSHOT="$tmp/signal-policy.json" \
    exec "$DISPATCH" --json
) >"$tmp/signal.stdout" 2>"$tmp/signal.stderr" &
dispatch_pid=$!
for _ in $(seq 1 100); do
  [ -s "$FAKE_CHILD_PID" ] && break
  sleep 0.02
done
[ -s "$FAKE_CHILD_PID" ] || fail 'signal probe did not announce its descendant'
python3 - "$dispatch_pid" >"$tmp/signal-descendants" <<'PY'
from pathlib import Path
import sys

root = int(sys.argv[1])
parents = {}
for entry in Path('/proc').iterdir():
    if not entry.name.isdigit():
        continue
    try:
        text = (entry / 'stat').read_text()
        fields = text[text.rfind(')') + 2:].split()
        parents[int(entry.name)] = int(fields[1])
    except (FileNotFoundError, PermissionError, ValueError, IndexError):
        pass
found = set()
while True:
    added = {pid for pid, parent in parents.items() if parent == root or parent in found} - found
    if not added:
        break
    found |= added
print(*sorted(found), sep='\n')
PY
[ -s "$tmp/signal-descendants" ] || fail 'signal probe found no dispatch descendants'
kill -TERM "$dispatch_pid"
set +e
wait "$dispatch_pid"
signal_status=$?
set -e
assert_equal 143 "$signal_status" 'PID-directed SIGTERM status was not preserved'
while read -r descendant_pid; do
  [ -n "$descendant_pid" ] || continue
  if kill -0 "$descendant_pid" 2>/dev/null; then
    fail "PID-directed SIGTERM leaked dispatch descendant $descendant_pid"
  fi
done <"$tmp/signal-descendants"
jq -s -e '
  map(select(.attributes["run.id"] == "signal-smoke")) as $spans
  | ($spans | length) == 1
  and $spans[0].phase == "review"
  and $spans[0].status == "error"
  and $spans[0].duration_ms >= 0
  and $spans[0].attributes["exit.status"] == "143"
' "$span_store" >/dev/null


printf 'test-qq-dispatch: pass\n'
