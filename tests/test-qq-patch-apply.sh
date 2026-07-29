#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-patch-apply"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
PATCH_APPLY="$ROOT/bin/qq-patch-apply"
FIXTURE="$ROOT/tests/fixtures/pi-intercom-0.6.0"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
real_home="$HOME"

# The carried context must describe the currently installed package. This is
# deliberately valid for both states so the test remains stable after apply.
HOME="$real_home" "$PATCH_APPLY" check >"$tmp/real-check"
grep -Eq '^pi-intercom@0\.6\.0: (pristine|applied|absent)( — |$)' "$tmp/real-check" \
  || fail 'patch context does not match the currently installed pi-intercom 0.6.0 files'

fixture_home="$tmp/home"
installed="$fixture_home/.pi/agent/npm/node_modules/pi-intercom"
mkdir -p "$(dirname "$installed")"
cp -a "$FIXTURE" "$installed"

HOME="$fixture_home" "$PATCH_APPLY" check >"$tmp/pristine-check"
assert_equal 'pi-intercom@0.6.0: pristine' "$(cat "$tmp/pristine-check")" \
  'pristine fixture did not hash as pristine'

HOME="$fixture_home" "$PATCH_APPLY" apply >"$tmp/applied"
assert_equal 'pi-intercom@0.6.0: applied' "$(cat "$tmp/applied")" \
  'fixture apply did not finish in applied state'
HOME="$fixture_home" "$PATCH_APPLY" check >"$tmp/applied-check"
assert_equal 'pi-intercom@0.6.0: applied' "$(cat "$tmp/applied-check")" \
  'applied fixture did not re-hash as applied'

# The loaded source contains both ordinary tool refusals and attaches a handler
# immediately to the reply promise that used to escape the parallel-ask race.
assert_file_contains "$installed/index.ts" \
  'single-flight: an outbound ask is already pending'
assert_file_contains "$installed/index.ts" \
  "single-flight: inbound ask \${pendingIds} is pending; use reply instead of send"
assert_file_contains "$installed/index.ts" \
  'details: { error: true, pendingAskIds:'
assert_file_contains "$installed/index.ts" 'replyPromise.catch(() => undefined);'
assert_file_contains "$installed/index.ts" 'case "reply": {'

# Apply is idempotent and verifies hashes rather than relying on a marker.
HOME="$fixture_home" "$PATCH_APPLY" apply >"$tmp/reapplied"
assert_equal 'pi-intercom@0.6.0: applied' "$(cat "$tmp/reapplied")" \
  'second apply was not an applied no-op'
find "$installed" -name '*qq-patch*' -print >"$tmp/sentinels"
[ ! -s "$tmp/sentinels" ] || fail 'patch application left a sentinel file'

# Drift inside a carried hunk is reported and apply prints the exact hunk rather
# than forcing it over unknown source.
python3 - "$installed/index.ts" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
data = path.read_text()
old = "single-flight: an outbound ask is already pending"
if old not in data:
    raise SystemExit("drift target missing")
path.write_text(data.replace(old, "locally drifted outbound ask", 1))
PY
set +e
HOME="$fixture_home" "$PATCH_APPLY" check >"$tmp/drift-check" 2>"$tmp/drift-check.err"
status=$?
set -e
assert_equal 1 "$status" 'drifted fixture check did not refuse'
assert_file_contains "$tmp/drift-check" 'pi-intercom@0.6.0: DRIFTED'
set +e
HOME="$fixture_home" "$PATCH_APPLY" apply >"$tmp/drift-apply" 2>"$tmp/drift-apply.err"
status=$?
set -e
assert_equal 1 "$status" 'drifted fixture apply did not refuse'
assert_file_contains "$tmp/drift-apply.err" 'mismatched hunk for pi-intercom@0.6.0:'
assert_file_contains "$tmp/drift-apply.err" '@@ -1169,14 +1170,15 @@'
assert_file_contains "$tmp/drift-apply.err" \
  '+            content: [{ type: "text", text: "single-flight: an outbound ask is already pending" }],'
assert_file_contains "$installed/index.ts" 'locally drifted outbound ask'

# The installed package root itself may not redirect through a symlink.
symlink_home="$tmp/symlink-home"
mkdir -p "$symlink_home/.pi/agent/npm/node_modules" "$tmp/elsewhere"
ln -s "$tmp/elsewhere" "$symlink_home/.pi/agent/npm/node_modules/pi-intercom"
set +e
HOME="$symlink_home" "$PATCH_APPLY" check >"$tmp/symlink-check" 2>"$tmp/symlink-check.err"
status=$?
set -e
assert_equal 1 "$status" 'symlinked package root did not refuse'
assert_file_contains "$tmp/symlink-check" 'is a symlink'

printf 'test-qq-patch-apply: pass\n'
