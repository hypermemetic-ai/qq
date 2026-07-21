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

# Functional: import the extension with a mock pi under an ISOLATED HOME and
# observe process.env and the session-root filesystem behavior.
EXT="$EXT" ROOT="$ROOT" node --experimental-strip-types --input-type=module -e '
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const ext = process.env.EXT;
const root = process.env.ROOT;
const pi = { on() {} };
const die = (msg) => { console.error(msg); process.exit(1); };
const assertEq = (actual, expected, label) => {
  if (actual !== expected) die(`${label}: expected ${expected}, got ${actual}`);
};

// Isolated HOME so the extension never touches operator state.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qq-ext-home-"));
process.env.HOME = home;
const cfgDir = path.join(home, ".pi/agent/extensions/subagent");
fs.mkdirSync(cfgDir, { recursive: true });
const sessRoot = path.join(os.tmpdir(), `pi-subagent-envtest-${process.pid}`);
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: sessRoot }));

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

// Session root: created mode 700 when absent, tightened when loose.
if (!fs.existsSync(sessRoot)) die("session root was not created");
assertEq(fs.statSync(sessRoot).mode & 0o777, 0o700, "session root mode");
fs.chmodSync(sessRoot, 0o755);
const second = await import(pathToFileURL(ext).href + "?second");
second.default(pi);
assertEq(fs.statSync(sessRoot).mode & 0o777, 0o700, "session root tightened");

// Explicit operator env wins, including an explicit empty value.
process.env.PI_SUBAGENT_PI_BINARY = "/tmp/operator-override";
process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS = "";
const third = await import(pathToFileURL(ext).href + "?third");
third.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, "/tmp/operator-override", "operator override preserved");
assertEq(process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS, "", "explicit empty override preserved");

// A configured root outside the adapter-accepted set is left untouched.
const outside = path.join(home, "outside-root");
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: outside }));
const fourth = await import(pathToFileURL(ext).href + "?fourth");
fourth.default(pi);
if (fs.existsSync(outside)) die("extension created a root outside the accepted set");

fs.rmSync(sessRoot, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
' || fail "extension behavior mismatch"

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
