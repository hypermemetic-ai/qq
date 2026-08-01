#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/bin/qq-ghostty-profile"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
export XDG_CONFIG_HOME="$HOME/.config"
mkdir -p "$XDG_CONFIG_HOME"
ln -s "$ROOT/cockpit/ghostty" "$XDG_CONFIG_HOME/ghostty"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_profile() {
  local name="$1"
  local expected="$ROOT/cockpit/ghostty/profiles/$name"
  "$SCRIPT" "$name" >/dev/null
  [ -L "$XDG_CONFIG_HOME/qq/ghostty-profile" ] || fail 'selector is not a symlink'
  [ "$(readlink "$XDG_CONFIG_HOME/qq/ghostty-profile")" = "$expected" ] ||
    fail "$name selector target differs"
}

assert_profile laptop
if command -v ghostty >/dev/null 2>&1; then
  laptop_config="$(ghostty +show-config --changes-only=false 2>/dev/null)"
  grep -Fxq 'font-size = 12' <<<"$laptop_config" || fail 'effective laptop font size differs'
  grep -Fxq 'window-padding-x = 12' <<<"$laptop_config" || fail 'effective laptop padding differs'
fi

assert_profile 4k
if command -v ghostty >/dev/null 2>&1; then
  couch_config="$(ghostty +show-config --changes-only=false 2>/dev/null)"
  grep -Fxq 'font-size = 24' <<<"$couch_config" || fail 'effective 4K font size differs'
  grep -Fxq 'window-padding-x = 480' <<<"$couch_config" || fail 'effective 4K padding differs'
fi

if "$SCRIPT" desktop >/dev/null 2>&1; then
  fail 'invalid profile succeeded'
fi
if "$SCRIPT" laptop extra >/dev/null 2>&1; then
  fail 'extra argument succeeded'
fi

rm "$XDG_CONFIG_HOME/qq/ghostty-profile"
printf 'operator-owned\n' >"$XDG_CONFIG_HOME/qq/ghostty-profile"
if "$SCRIPT" laptop >/dev/null 2>&1; then
  fail 'non-symlink selector was replaced'
fi
grep -Fxq 'operator-owned' "$XDG_CONFIG_HOME/qq/ghostty-profile" ||
  fail 'non-symlink selector content changed'

grep -Fxq 'font-size = 12' "$ROOT/cockpit/ghostty/profiles/laptop" ||
  fail 'laptop font size differs'
grep -Fxq 'window-padding-x = 12' "$ROOT/cockpit/ghostty/profiles/laptop" ||
  fail 'laptop padding differs'
grep -Fxq 'font-size = 24' "$ROOT/cockpit/ghostty/profiles/4k" ||
  fail '4K font size differs'
grep -Fxq 'window-padding-x = 480' "$ROOT/cockpit/ghostty/profiles/4k" ||
  fail '4K padding differs'

printf 'qq-ghostty-profile tests passed\n'
