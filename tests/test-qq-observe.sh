#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-observe"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
OBSERVE="$ROOT/bin/qq-observe"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[ -x "$OBSERVE" ] || fail "qq-observe is not executable"
export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"
git_common_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
repository_name="$(basename "$(dirname "$(realpath -e "$git_common_dir")")")"
store="$XDG_STATE_HOME/qq/spans/$repository_name/spans.jsonl"

span_id="$($OBSERVE id span)"
trace_id="$($OBSERVE id trace)"
[[ "$span_id" =~ ^[0-9a-f]{16}$ ]] || fail "span ID has the wrong shape"
[[ "$trace_id" =~ ^[0-9a-f]{32}$ ]] || fail "trace ID has the wrong shape"

(
  cd "$ROOT"
  "$OBSERVE" record \
    --name execute_tool --phase implementation --actor engine \
    --start 2026-07-21T10:00:00Z --end 2026-07-21T10:00:01.250Z \
    --trace-id 11111111111111111111111111111111 \
    --span-id 2222222222222222 --root-span-id 2222222222222222 \
    --attribute tool=qq-test >/dev/null
)
[ -f "$store" ] || fail "span store was not created"
assert_equal 600 "$(stat -c '%a' "$store")" "span store mode is not private"
jq -e '
  .schema_version == 1
  and .name == "execute_tool"
  and .phase == "implementation"
  and .actor == "engine"
  and .trace_id == "11111111111111111111111111111111"
  and .span_id == "2222222222222222"
  and .root_span_id == "2222222222222222"
  and .parent_span_id == null
  and .duration_ms == 1250
  and .attributes.tool == "qq-test"
' "$store" >/dev/null

session="$tmp/session.jsonl"
cat >"$session" <<'JSONL'
{"type":"session","version":3,"timestamp":"2026-07-21T11:00:00.000Z"}
{"type":"message","timestamp":"2026-07-21T11:00:03.500Z","message":{"role":"user"}}
JSONL
(
  cd "$ROOT"
  "$OBSERVE" read-session "$session" \
    --phase orientation --actor accountable-session \
    --trace-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    --span-id bbbbbbbbbbbbbbbb >/dev/null
)
assert_equal 2 "$(wc -l <"$store")" "span records were not appended"
tail -n 1 "$store" | jq -e \
  --arg session "$(realpath "$session")" '
  .name == "invoke_workflow"
  and .source == "pi-session-jsonl"
  and .duration_ms == 3500
  and .attributes["session.file"] == $session
  and .attributes["session.entries"] == 2
' >/dev/null

set +e
(
  cd "$ROOT"
  XDG_STATE_HOME="$ROOT/.observation-test-state" \
    "$OBSERVE" record --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/refusal.stdout" 2>"$tmp/refusal.stderr"
refusal_status=$?
set -e
assert_equal 65 "$refusal_status" "worktree-local store was not refused"
assert_file_contains "$tmp/refusal.stderr" "refusing span store inside Git worktree"
[ ! -e "$ROOT/.observation-test-state" ] || fail "refusal wrote runtime state into the worktree"

set +e
(
  cd "$ROOT"
  "$OBSERVE" record --name invoke_agent --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z \
    --trace-id NOT-A-TRACE-ID
) >"$tmp/malformed.stdout" 2>"$tmp/malformed.stderr"
malformed_status=$?
set -e
assert_equal 64 "$malformed_status" "malformed trace context was accepted"
assert_equal 2 "$(wc -l <"$store")" "a refused record was appended"

assert_session_refused() {
  local label="$1" content="$2" expected="$3"
  local fixture="$tmp/$label.jsonl"
  printf '%s\n' "$content" >"$fixture"
  set +e
  (
    cd "$ROOT"
    "$OBSERVE" read-session "$fixture"
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  assert_equal 64 "$status" "$label session was accepted"
  assert_file_contains "$tmp/$label.stderr" "$expected"
  assert_equal 2 "$(wc -l <"$store")" "$label appended a span"
}

assert_session_refused version-999 \
  '{"type":"session","version":999,"timestamp":"2026-07-21T11:00:00Z"}' \
  'type=session, version=3 header'
assert_session_refused missing-version \
  '{"type":"session","timestamp":"2026-07-21T11:00:00Z"}' \
  'type=session, version=3 header'
assert_session_refused corrupt-partial \
  $'{"type":"session","version":3,"timestamp":"2026-07-21T11:00:00Z"}\n{"type":"message"' \
  'cannot read session JSONL'

assert_store_refused() {
  local label="$1" state="$2" expected="$3"
  set +e
  (
    cd "$ROOT"
    XDG_STATE_HOME="$state" timeout 2 "$OBSERVE" record \
      --name invoke_agent --actor test \
      --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
  ) >"$tmp/$label.stdout" 2>"$tmp/$label.stderr"
  local status=$?
  set -e
  [ "$status" -ne 124 ] || fail "$label blocked"
  [ "$status" -ne 0 ] || fail "$label unexpectedly succeeded"
  assert_file_contains "$tmp/$label.stderr" "$expected"
}

symlink_state="$tmp/symlink-state"
symlink_target="$tmp/symlink-target"
mkdir -p "$symlink_state/qq/spans/$repository_name"
printf 'sentinel\n' >"$symlink_target"
ln -s "$symlink_target" "$symlink_state/qq/spans/$repository_name/spans.jsonl"
assert_store_refused symlink-leaf "$symlink_state" 'span store leaf is not a regular file'
assert_equal sentinel "$(cat "$symlink_target")" 'symlink leaf target was modified'

fifo_state="$tmp/fifo-state"
mkdir -p "$fifo_state/qq/spans/$repository_name"
mkfifo "$fifo_state/qq/spans/$repository_name/spans.jsonl"
assert_store_refused fifo-leaf "$fifo_state" 'span store leaf is not a regular file'

escape_state="$tmp/escape-state"
escape_target="$tmp/escape-target"
mkdir -p "$escape_state" "$escape_target"
ln -s "$escape_target" "$escape_state/qq"
assert_store_refused store-dir-escape "$escape_state" 'span store escapes the resolved state root'
[ ! -e "$escape_target/spans" ] || fail 'store directory escape wrote outside the state root'

fixture_primary="$tmp/repository-primary"
fixture_linked="$tmp/repository-linked"
git init -q "$fixture_primary"
git -C "$fixture_primary" -c user.name=test -c user.email=test@example.invalid \
  commit --allow-empty -qm base
git -C "$fixture_primary" worktree add -q -b observe-linked "$fixture_linked"
linked_state="$tmp/linked-state"
(
  cd "$fixture_linked"
  XDG_STATE_HOME="$linked_state" "$OBSERVE" record \
    --name linked_test --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z >/dev/null
)
primary_store="$linked_state/qq/spans/$(basename "$fixture_primary")/spans.jsonl"
[ -f "$primary_store" ] || fail 'linked-worktree span did not land in the primary Repository store'
[ ! -e "$linked_state/qq/spans/$(basename "$fixture_linked")" ] \
  || fail 'linked-worktree span created a basename-keyed store'

outside="$tmp/not-a-worktree"
mkdir "$outside"
set +e
(
  cd "$outside"
  "$OBSERVE" record --name outside --actor test \
    --start 2026-07-21T00:00:00Z --end 2026-07-21T00:00:01Z
) >"$tmp/outside.stdout" 2>"$tmp/outside.stderr"
outside_status=$?
set -e
assert_equal 65 "$outside_status" 'non-worktree invocation was accepted'
assert_file_contains "$tmp/outside.stderr" 'not in a Git worktree'

printf 'test-qq-observe: pass\n'
