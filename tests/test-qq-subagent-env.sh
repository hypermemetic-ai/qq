#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-subagent-env"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
EXT="$ROOT/.pi/extensions/qq-subagent-env.ts"

[ -f "$EXT" ] || fail "missing extension: $EXT"

# Structural guards: both adapter vars, set only when unset, resolved from
# the checkout root via the extension's own location.
assert_file_contains "$EXT" 'PI_SUBAGENT_PI_BINARY'
assert_file_contains "$EXT" 'PI_SUBAGENT_EXTRA_AGENT_DIRS'
assert_file_contains "$EXT" 'process.env.PI_SUBAGENT_PI_BINARY === undefined'
assert_file_contains "$EXT" 'process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS === undefined'
assert_file_contains "$EXT" '"bin/qq-dispatch"'
assert_file_contains "$EXT" '"delegation",'
assert_file_contains "$EXT" 'fileURLToPath(import.meta.url)'

# The extension establishes the pi-subagents session root at session start
# (created mode 700 when absent, tightened when operator-owned and loose) so
# pi-subagents' umask-dependent mkdir can never deadlock dispatch against
# the adapter's fail-closed mode check.
assert_file_contains "$EXT" 'ensureSessionRoot'
assert_file_contains "$EXT" 'mkdirSync(root, { mode: 0o700 })'
assert_file_contains "$EXT" 'chmodSync(root, 0o700)'
assert_file_contains "$EXT" 'defaultSessionDir'

# Functional: import the extension with a mock pi and observe process.env.
EXT="$EXT" ROOT="$ROOT" node --experimental-strip-types --input-type=module -e '
import { pathToFileURL } from "node:url";
const ext = process.env.EXT;
const root = process.env.ROOT;
const pi = { on() {} };
const assertEq = (actual, expected, label) => {
  if (actual !== expected) {
    console.error(`${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
};

delete process.env.PI_SUBAGENT_PI_BINARY;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;
const mod = await import(pathToFileURL(ext).href);
mod.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, `${root}/bin/qq-dispatch`, "PI_SUBAGENT_PI_BINARY");
assertEq(
  process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS,
  `${root}/delegation/manifests/agents`,
  "PI_SUBAGENT_EXTRA_AGENT_DIRS",
);

// Explicit operator env wins: a re-loaded copy must not override it.
process.env.PI_SUBAGENT_PI_BINARY = "/tmp/operator-override";
const second = await import(pathToFileURL(ext).href + "?second");
second.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, "/tmp/operator-override", "operator override preserved");

// An explicit empty value is also an operator choice: pi-subagents reads it
// as selecting the vanilla fallback, so the extension must leave it alone.
process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS = "";
const third = await import(pathToFileURL(ext).href + "?third");
third.default(pi);
assertEq(process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS, "", "explicit empty override preserved");
' || fail "extension applyEnv behavior mismatch"

# The targets the extension points at must exist in this checkout.
[ -x "$ROOT/bin/qq-dispatch" ] || fail "extension target missing: bin/qq-dispatch"
for role in implementer reviewer researcher; do
  [ -f "$ROOT/delegation/manifests/agents/$role.md" ] || fail "extension target missing: $role manifest"
done

# README Install documents the extension as the by-construction mechanism.
assert_file_contains "$ROOT/README.md" '.pi/extensions/qq-subagent-env.ts'

# Pivot tripwire: the shell surface must not re-introduce shell-level exports.
if grep -q 'export PI_SUBAGENT' "$ROOT/cockpit/shell/file-navigation.bash"; then
  fail "file-navigation.bash re-exports PI_SUBAGENT_* (mechanism moved to .pi/extensions/qq-subagent-env.ts)"
fi

printf 'test-qq-subagent-env: pass\n'
