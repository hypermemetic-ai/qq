#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-install-flags"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
INSTALLER="$ROOT/bin/install.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

assert_path_absent() {
  local path="$1"

  if [ -e "$path" ] || [ -L "$path" ]; then
    fail "installer created a path during argument handling: $path"
  fi
}

assert_sandbox_untouched() {
  assert_path_absent "$1"
  assert_path_absent "$2"
  assert_path_absent "$3"
}

run_help() {
  local flag="$1"
  local label="$2"
  local home="$tmp/$label-home"
  local data_home="$tmp/$label-data"
  local config_home="$tmp/$label-config"
  local stdout="$tmp/$label.stdout"
  local stderr="$tmp/$label.stderr"
  local output

  if ! HOME="$home" \
    XDG_DATA_HOME="$data_home" \
    XDG_CONFIG_HOME="$config_home" \
      bash "$INSTALLER" "$flag" >"$stdout" 2>"$stderr"; then
    sed 's/^/installer: /' "$stderr" >&2
    fail "$flag did not exit successfully"
  fi

  output="$(<"$stdout")"
  assert_contains "$output" 'Usage: bin/install.sh [-h|--help]'
  assert_contains "$output" \
    "Link qq's live skills, cockpit configs, and commands from this checkout."
  assert_contains "$output" '-h, --help'
  [ ! -s "$stderr" ] || fail "$flag wrote to stderr"
  assert_sandbox_untouched "$home" "$data_home" "$config_home"
}

run_refusal() {
  local offending="$1"
  local label="$2"
  shift 2
  local home="$tmp/$label-home"
  local data_home="$tmp/$label-data"
  local config_home="$tmp/$label-config"
  local stdout="$tmp/$label.stdout"
  local stderr="$tmp/$label.stderr"
  local output
  local status=0

  HOME="$home" \
  XDG_DATA_HOME="$data_home" \
  XDG_CONFIG_HOME="$config_home" \
    bash "$INSTALLER" "$@" >"$stdout" 2>"$stderr" || status=$?

  assert_equal '1' "$status" "$offending did not exit 1"
  [ ! -s "$stdout" ] || \
    fail "$offending wrote usage or installation output to stdout"
  output="$(<"$stderr")"
  assert_contains "$output" "qq install: unsupported argument: $offending"
  assert_contains "$output" 'Usage: bin/install.sh [-h|--help]'
  assert_contains "$output" '-h, --help'
  assert_sandbox_untouched "$home" "$data_home" "$config_home"
}

assert_link_target() {
  local link="$1"
  local expected="$2"

  [ -L "$link" ] || fail "installer did not create symlink: $link"
  assert_equal "$expected" "$(readlink "$link")" "unexpected target for $link"
}

run_help --help help-long
run_help -h help-short
run_refusal --force unknown-flag --force
run_refusal destination unknown-positional destination
run_refusal --force help-and-unknown --help --force

install_home="$tmp/install-home"
install_data="$tmp/install-data"
install_config="$tmp/install-config"
install_stdout="$tmp/install.stdout"
install_stderr="$tmp/install.stderr"

if ! HOME="$install_home" \
  XDG_DATA_HOME="$install_data" \
  XDG_CONFIG_HOME="$install_config" \
    bash "$INSTALLER" >"$install_stdout" 2>"$install_stderr"; then
  sed 's/^/installer: /' "$install_stderr" >&2
  fail 'zero-argument installation failed'
fi

[ ! -s "$install_stderr" ] || fail 'zero-argument installation wrote to stderr'
assert_contains "$(<"$install_stdout")" 'qq install: links complete'
assert_link_target \
  "$install_home/.codex/skills/agent-messaging" \
  "$ROOT/skills/agent-messaging"
assert_link_target \
  "$install_home/.config/yazi/yazi.toml" \
  "$ROOT/cockpit/yazi/yazi.toml"
assert_link_target \
  "$install_home/.local/bin/qq-openwiki" \
  "$ROOT/bin/qq-openwiki"

printf 'test-install-flags: pass\n'
