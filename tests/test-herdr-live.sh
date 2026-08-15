#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
binary=${QQ_HERDR_TEST_BINARY:-$HOME/.local/lib/qq/herdr/bin/herdr}
[[ -x "$binary" ]] || {
  printf 'test-herdr-live: installed binary not executable: %s\n' "$binary" >&2
  exit 1
}
"$root/bin/qq-herdr-smoke" "$binary"
