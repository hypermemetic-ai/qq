#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-pi-runtime"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
WRAPPER="$ROOT/bin/pi"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$WRAPPER" ] || fail "missing Pi wrapper: $WRAPPER"

fake_bin="$TMP/bin"
global_root="$TMP/global/lib/node_modules"
package="$global_root/@earendil-works/pi-coding-agent"
external_project="$TMP/non-qq-project"
decoy="$external_project/per-run-pi"
mkdir -p "$fake_bin" "$package/dist" "$external_project" "$decoy/dist"
git init -q -b main "$external_project"

cat >"$fake_bin/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$TEST_TMP/npm.argv"
[[ "$#" -eq 2 && "$1" == root && "$2" == -g ]] || exit 42
printf '%s\n' "$TEST_GLOBAL_ROOT"
SH
cat >"$package/dist/cli.js" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$TEST_TMP/pi.argv"
printf '%s\n' "$PWD" >"$TEST_TMP/pi.cwd"
printf '%s\n' "${PI_CODING_AGENT_DIR-}" >"$TEST_TMP/pi.config"
SH
cat >"$decoy/dist/cli.js" <<'SH'
#!/usr/bin/env bash
printf 'per-run PI_CODING_AGENT_DIR was used as the runtime source\n' >&2
exit 99
SH
chmod 755 "$fake_bin/npm" "$package/dist/cli.js" "$decoy/dist/cli.js"

(
  cd -- "$external_project"
  env -u HERDR_PANE_ID -u QQ_DISPATCH_RUN_DIR \
    TEST_TMP="$TMP" TEST_GLOBAL_ROOT="$global_root" \
    PI_CODING_AGENT_DIR="$decoy" PATH="$fake_bin:$PATH" \
    "$WRAPPER" --provider openai-codex --model 'model with spaces' -- --literal
)
python3 - "$TMP/npm.argv" "$TMP/pi.argv" <<'PY'
from pathlib import Path
import sys
npm = Path(sys.argv[1]).read_bytes().split(b"\0")
pi = Path(sys.argv[2]).read_bytes().split(b"\0")
assert npm == [b"root", b"-g", b""], npm
assert pi == [
    b"--provider", b"openai-codex", b"--model", b"model with spaces",
    b"--", b"--literal", b"",
], pi
PY
assert_equal "$external_project" "$(cat "$TMP/pi.cwd")" 'Pi wrapper changed the caller cwd'
assert_equal "$decoy" "$(cat "$TMP/pi.config")" 'Pi wrapper changed caller environment arguments'

set +e
PATH="$TMP/no-commands" /usr/bin/bash "$WRAPPER" >"$TMP/no-npm.out" 2>"$TMP/no-npm.err"
status=$?
set -e
assert_equal 69 "$status" 'missing npm did not refuse clearly'
assert_file_contains "$TMP/no-npm.err" 'npm is unavailable'

missing_root="$TMP/missing/lib/node_modules"
set +e
TEST_TMP="$TMP" TEST_GLOBAL_ROOT="$missing_root" PATH="$fake_bin:$PATH" \
  "$WRAPPER" >"$TMP/no-package.out" 2>"$TMP/no-package.err"
status=$?
set -e
assert_equal 69 "$status" 'missing stock package did not refuse clearly'
assert_file_contains "$TMP/no-package.err" 'global @earendil-works/pi-coding-agent package is unavailable'

rm -f -- "$package/dist/cli.js"
set +e
TEST_TMP="$TMP" TEST_GLOBAL_ROOT="$global_root" PATH="$fake_bin:$PATH" \
  "$WRAPPER" >"$TMP/no-cli.out" 2>"$TMP/no-cli.err"
status=$?
set -e
assert_equal 69 "$status" 'missing stock CLI did not refuse clearly'
assert_file_contains "$TMP/no-cli.err" 'global Pi package executable dist/cli.js is unavailable'

printf 'test-qq-pi-runtime: pass\n'
