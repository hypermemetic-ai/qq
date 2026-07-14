#!/usr/bin/env bash

TEST_NAME="${TEST_NAME:-$(basename "$0" .sh)}"

fail() {
  printf '%s: %s\n' "$TEST_NAME" "$*" >&2
  exit 1
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local message="${3:-}"

  [ -n "$message" ] || message="expected '$expected', got '$actual'"

  [ "$actual" = "$expected" ] || fail "$message"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="${3:-}"

  [ -n "$message" ] || message="expected '$needle' in: $haystack"

  [[ "$haystack" == *"$needle"* ]] || fail "$message"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local message="${3:-}"

  [ -n "$message" ] || message="did not expect '$needle' in: $haystack"

  [[ "$haystack" != *"$needle"* ]] || fail "$message"
}

assert_file_contains() {
  local file="$1"
  local needle="$2"
  local message="${3:-}"

  [ -n "$message" ] || message="expected '$needle' in $file"

  grep -Fq -- "$needle" "$file" || fail "$message"
}

assert_file_not_matches() {
  local file="$1"
  local pattern="$2"
  local message="${3:-}"

  [ -n "$message" ] || message="did not expect pattern '$pattern' in $file"

  if grep -Eq -- "$pattern" "$file"; then
    fail "$message"
  fi
}
