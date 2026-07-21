#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-derive"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
DERIVE="$ROOT/bin/qq-derive"

tmp="$(mktemp -d)"
writer=""
cleanup() {
  if [ -n "$writer" ]; then
    kill "$writer" 2>/dev/null || true
    wait "$writer" 2>/dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

repo="$tmp/repo with space"
git init -q "$repo"
git -C "$repo" config user.name test
git -C "$repo" config user.email test@example.com
printf 'base\n' >"$repo/tracked.txt"
git -C "$repo" add tracked.txt
git -C "$repo" commit -qm base

export QQ_DERIVE_ROOT="$tmp/derive-root"
key_args=(--repo "$repo" --kind reviewer-brief \
  --input 'intent text' --input $'brief body\nsecond line' --input model-a)
key_one="$($DERIVE key "${key_args[@]}")"
key_two="$($DERIVE key "${key_args[@]}")"
assert_equal "$key_one" "$key_two" 'same derivation inputs did not produce a stable key'
[[ "$key_one" =~ ^[0-9a-f]{64}$ ]] || fail "key is not lowercase SHA-256: $key_one"

assert_input_count_refused() {
  local description="$1"
  shift
  if "$DERIVE" key --repo "$repo" --kind reviewer-brief "$@" \
    >"$tmp/error.out" 2>"$tmp/error.err"; then
    fail "$description input count was accepted"
  fi
  assert_file_contains "$tmp/error.err" 'invalid-input-count:' \
    "$description input count lacked a named error"
}

assert_input_count_refused 'zero'
assert_input_count_refused 'one' --input 'intent text'
assert_input_count_refused 'two' --input 'intent text' --input 'brief body'
assert_input_count_refused 'four' --input 'intent text' --input 'brief body' \
  --input model-a --input extra

assert_key_changes() {
  local description="$1"
  shift
  local changed
  changed="$($DERIVE key "$@")"
  [ "$changed" != "$key_one" ] || fail "$description did not change the key"
}

assert_key_changes 'intent text' --repo "$repo" --kind reviewer-brief \
  --input 'different intent' --input $'brief body\nsecond line' --input model-a
assert_key_changes 'brief body' --repo "$repo" --kind reviewer-brief \
  --input 'intent text' --input 'different brief' --input model-a
assert_key_changes 'model id' --repo "$repo" --kind reviewer-brief \
  --input 'intent text' --input $'brief body\nsecond line' --input model-b
assert_key_changes 'derivation kind' --repo "$repo" --kind orientation-digest \
  --input 'intent text' --input $'brief body\nsecond line' --input model-a
printf 'next\n' >>"$repo/tracked.txt"
git -C "$repo" add tracked.txt
git -C "$repo" commit -qm next
assert_key_changes 'Repository revision' "${key_args[@]}"

if "$DERIVE" has --repo "$repo" --kind reviewer-brief --key "$key_one"; then
  fail 'has reported a missing key as present'
else
  status=$?
  assert_equal 1 "$status" 'has missing-key exit was not 1'
fi
if "$DERIVE" get --repo "$repo" --kind reviewer-brief --key "$key_one" >"$tmp/missing"; then
  fail 'get reported a missing key as present'
else
  status=$?
  assert_equal 1 "$status" 'get missing-key exit was not 1'
fi

artifact="$({ printf 'artifact body\nwith detail\n'; } \
  | "$DERIVE" put --repo "$repo" --kind reviewer-brief --key "$key_one")"
[[ "$artifact" == "$QQ_DERIVE_ROOT"/* ]] \
  || fail 'put did not honor QQ_DERIVE_ROOT'
[ -f "$artifact" ] || fail 'put did not create the artifact'
"$DERIVE" has --repo "$repo" --kind reviewer-brief --key "$key_one" \
  || fail 'has did not find a stored artifact'
actual="$($DERIVE get --repo "$repo" --kind reviewer-brief --key "$key_one")"
assert_equal $'artifact body\nwith detail' "$actual" 'get did not return stored bytes'
path="$($DERIVE get --repo "$repo" --kind reviewer-brief --key "$key_one" --path)"
assert_equal "$artifact" "$path" 'get --path did not return the artifact path'
mode="$(stat -c '%a' "$artifact")"
assert_equal 600 "$mode" 'artifact mode was not owner-only'

atomic_key="$($DERIVE key --repo "$repo" --kind atomic-test \
  --input 'atomic write intent' --input 'atomic write brief' --input test-model)"
(
  printf 'partial bytes'
  sleep 30
) | "$DERIVE" put --repo "$repo" --kind atomic-test --key "$atomic_key" \
  >"$tmp/atomic-path" &
writer=$!
repo_store="$(dirname "$artifact")"
for _ in $(seq 1 100); do
  if compgen -G "$repo_store/.qq-derive.$atomic_key.*" >/dev/null; then
    break
  fi
  sleep 0.02
done
compgen -G "$repo_store/.qq-derive.$atomic_key.*" >/dev/null \
  || fail 'atomic writer did not create its private temporary file'
kill -TERM "$writer"
if wait "$writer" 2>/dev/null; then
  fail 'killed writer exited successfully'
fi
writer=""
if "$DERIVE" has --repo "$repo" --kind atomic-test --key "$atomic_key"; then
  fail 'killed writer published a partial artifact'
else
  status=$?
  assert_equal 1 "$status" 'killed-writer miss did not exit 1'
fi
if compgen -G "$repo_store/.qq-derive.$atomic_key.*" >/dev/null; then
  fail 'killed writer left a temporary artifact'
fi

if "$DERIVE" has --repo "$repo" --kind reviewer-brief --key invalid \
  >"$tmp/error.out" 2>"$tmp/error.err"; then
  fail 'malformed key was accepted'
fi
assert_file_contains "$tmp/error.err" 'malformed-key:' 'malformed key lacked a named error'
if "$DERIVE" unknown --repo "$repo" --kind reviewer-brief \
  >"$tmp/error.out" 2>"$tmp/error.err"; then
  fail 'unknown operation was accepted'
fi
assert_file_contains "$tmp/error.err" 'unknown-operation:' 'unknown operation lacked a named error'
printf 'not a directory\n' >"$tmp/not-a-store"
if QQ_DERIVE_ROOT="$tmp/not-a-store" \
  "$DERIVE" has --repo "$repo" --kind reviewer-brief --key "$key_one" \
  >"$tmp/error.out" 2>"$tmp/error.err"; then
  fail 'non-directory store root was accepted'
fi
assert_file_contains "$tmp/error.err" 'unreadable-store:' \
  'unreadable store lacked a named error'

printf 'test-qq-derive: pass\n'
