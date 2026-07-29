#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"

[ -x "$ROOT/bin/qq-pi-runtime" ]
[ -x "$ROOT/bin/pi" ]
python3 "$TESTS_DIR/qq_pi_runtime_test.py"

# Structural launch rail: the PATH command is a minimal relative wrapper.
grep -Fq 'qq-pi-runtime" exec -- "$@"' "$ROOT/bin/pi"
if grep -Eq 'QQ_PI_RUNTIME_BIN|--binary|PI_RUNTIME_BINARY' "$ROOT/bin/qq-pi-runtime" "$ROOT/bin/pi"; then
  printf 'test-qq-pi-runtime: raw runtime binary override found\n' >&2
  exit 1
fi

printf 'test-qq-pi-runtime: pass\n'
