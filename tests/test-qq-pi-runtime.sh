#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"

[ -x "$ROOT/bin/qq-pi-runtime" ]
[ -x "$ROOT/bin/pi" ]
python3 "$TESTS_DIR/qq_pi_runtime_test.py"

# Structural launch rails: the PATH command is a minimal relative wrapper and
# delegated children select only the adapter worktree's exact wrapper.
grep -Fq 'qq-pi-runtime" exec -- "$@"' "$ROOT/bin/pi"
grep -Fq "pi_binary=\"\$bin_dir/pi\"" "$ROOT/bin/qq-dispatch"
if grep -Fq 'qq_resolve_bin pi' "$ROOT/bin/qq-dispatch"; then
  printf 'test-qq-pi-runtime: generic Pi resolution remains in dispatch\n' >&2
  exit 1
fi
grep -Fq '"bin/qq-dispatch"' "$ROOT/extensions/qq-subagent-env.ts"
if grep -Eq 'QQ_PI_RUNTIME_BIN|--binary|PI_RUNTIME_BINARY' "$ROOT/bin/qq-pi-runtime" "$ROOT/bin/pi"; then
  printf 'test-qq-pi-runtime: raw runtime binary override found\n' >&2
  exit 1
fi

printf 'test-qq-pi-runtime: pass\n'
