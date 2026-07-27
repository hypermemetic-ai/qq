#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
export PYTHONDONTWRITEBYTECODE=1

[ -x "$ROOT/bin/qq-pi-runtime" ]
[ -x "$ROOT/bin/pi" ]
python3 "$TESTS_DIR/qq_pi_runtime_test.py"

# Structural launch rails: project-home bin/pi owns the aligner profile, while
# governed children and Architect invoke the pinned runtime adapter directly.
grep -Fq 'runtime="$bin_dir/qq-pi-runtime"' "$ROOT/bin/pi"
grep -Fq 'inherited child execution assertion' "$ROOT/bin/pi"
grep -Fq -- '--no-extensions --extension "$env_extension" --extension "$execution_profile_extension" --extension "$profile_extension" --extension "$vendor_extension"' "$ROOT/bin/pi"
grep -Fq "pi_runtime=\"\$bin_dir/qq-pi-runtime\"" "$ROOT/bin/qq-dispatch"
grep -Fq '"$pi_runtime" exec -- --approve --offline' "$ROOT/bin/qq-dispatch"
grep -Fq 'exec "$runtime" exec -- "$@"' "$ROOT/bin/qq-pi-role"
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
