#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-bin-resolution"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
RESOLVER="$ROOT/bin/lib/qq-bin.sh"
# shellcheck source=bin/lib/qq-bin.sh
source "$RESOLVER"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fake_bin="$tmp/bin"
mkdir -p "$fake_bin"
fake_tool="$fake_bin/sample-tool"
printf '#!/usr/bin/env bash\nexit 0\n' >"$fake_tool"
chmod +x "$fake_tool"

export QQ_SAMPLE_TOOL_BIN="$fake_tool"
qq_resolve_bin sample-tool
assert_equal "$fake_tool" "$QQ_BIN_RESULT" 'QQ_<TOOL>_BIN override was not selected'

export QQ_SAMPLE_TOOL_BIN=sample-tool
if qq_resolve_bin sample-tool; then
  fail 'relative QQ_<TOOL>_BIN override was accepted'
fi
assert_contains "$QQ_BIN_ERROR" \
  'QQ_SAMPLE_TOOL_BIN must be an absolute executable file'

unset QQ_SAMPLE_TOOL_BIN
original_path="$PATH"
PATH="$fake_bin:/usr/bin:/bin"
qq_resolve_bin sample-tool
assert_equal "$fake_tool" "$QQ_BIN_RESULT" 'PATH tool was not selected'
PATH="$original_path"

export QQ_SAMPLE_TOOL_BIN="$fake_tool"
"$RESOLVER" sample-tool >"$tmp/resolution"
python3 - "$tmp/resolution" "$fake_tool" <<'PY'
from pathlib import Path
import sys

fields = Path(sys.argv[1]).read_bytes().split(b"\0")
assert fields == [sys.argv[2].encode(), b"", b""], fields
PY

if [ -x /home/linuxbrew/.linuxbrew/bin/herdr ]; then
  (
    PATH=/usr/bin:/bin
    unset QQ_HERDR_BIN
    qq_resolve_bin herdr
    assert_equal /home/linuxbrew/.linuxbrew/bin/herdr "$QQ_BIN_RESULT" \
      'known Homebrew fallback was not selected'
    assert_equal /home/linuxbrew/.linuxbrew/bin "$QQ_BIN_PATH_PREPEND" \
      'fallback directory was not reported'
    assert_contains ":$PATH:" ':/home/linuxbrew/.linuxbrew/bin:' \
      'fallback directory was not added to PATH'
  )
fi

for script in \
  qq-change qq-dispatch qq-herdr-home qq-herdr-pull qq-openwiki; do
  assert_file_contains "$ROOT/bin/$script" 'lib/qq-bin.sh' \
    "$script does not source the shared resolver"
done

old_names='HERDR_BIN_''PATH|(^|[^A-Z0-9_])OPENWIKI_''BIN|QQ_OPENWIKI_NODE_''BIN'
if grep -rnE "$old_names" "$ROOT/bin" "$ROOT/tests" "$ROOT/cockpit" "$ROOT/README.md"; then
  fail 'retired binary override name remains in an active source, test, or operator surface'
fi
assert_equal 1 "$(grep -rlE '/home/linuxbrew/\.linuxbrew/bin|/opt/homebrew/bin' "$ROOT/bin" | wc -l)" \
  'Homebrew fallback paths are duplicated outside the shared resolver'

printf 'test-bin-resolution: pass\n'
