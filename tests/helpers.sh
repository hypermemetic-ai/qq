#!/usr/bin/env bash

TEST_NAME="${TEST_NAME:-$(basename "$0" .sh)}"

fail() {
  printf '%s: %s\n' "$TEST_NAME" "$*" >&2
  exit 1
}

stock_pi_package_root() {
  local pi_bin pi_cli npm_root package
  if pi_bin="$(command -v pi 2>/dev/null)" &&
     pi_cli="$(readlink -f -- "$pi_bin" 2>/dev/null)" &&
     [[ "$pi_cli" == */@earendil-works/pi-coding-agent/dist/cli.js ]]; then
    package="${pi_cli%/dist/cli.js}"
    [[ -f "$package/package.json" ]] || return 1
    printf '%s\n' "$package"
    return 0
  fi

  command -v npm >/dev/null 2>&1 || return 1
  npm_root="$(npm root -g 2>/dev/null)" || return 1
  [[ "$npm_root" == /* && "$npm_root" != *$'\n'* ]] || return 1
  package="$npm_root/@earendil-works/pi-coding-agent"
  [[ -f "$package/package.json" ]] || return 1
  printf '%s\n' "$package"
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
