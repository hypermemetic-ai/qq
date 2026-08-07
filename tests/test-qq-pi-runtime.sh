#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-pi-runtime"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
WRAPPER="$ROOT/bin/pi"
HELPER="$ROOT/bin/lib/qq_role_identity.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$WRAPPER" ] || fail "missing Pi wrapper: $WRAPPER"
[ -f "$HELPER" ] || fail "missing Pi role helper: $HELPER"

fake_bin="$TMP/bin"
global_root="$TMP/global/lib/node_modules"
package="$global_root/@earendil-works/pi-coding-agent"
manifest="$package/package.json"
cli="$package/dist/cli.js"
parser="$package/dist/cli/args.js"
external_project="$TMP/non-qq-project"
decoy="$external_project/per-run-pi"
mkdir -p "$fake_bin" "$package/dist/cli" "$external_project" "$decoy/dist"
git init -q -b main "$external_project"
real_node="$(command -v node)"

cat >"$fake_bin/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$TEST_TMP/npm.argv"
[[ "$#" -eq 2 && "$1" == root && "$2" == -g ]] || exit 42
printf '%s\n' "$TEST_GLOBAL_ROOT"
SH
cat >"$fake_bin/node" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$TEST_TMP/node.argv"
exec "$TEST_REAL_NODE" "$@"
SH
cat >"$cli" <<'SH'
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
cat >"$manifest" <<'JSON'
{"name":"@earendil-works/pi-coding-agent","version":"0.81.1","type":"module"}
JSON
cat >"$parser" <<'JS'
export function parseArgs(args) {
  return { messages: [...args], fileArgs: [], unknownFlags: new Map(), diagnostics: [] };
}
JS
chmod 755 "$fake_bin/npm" "$fake_bin/node" "$cli" "$decoy/dist/cli.js"
cp "$manifest" "$TMP/manifest.good"
cp "$parser" "$TMP/parser.good"

wrapper_env=(
  TEST_TMP="$TMP" TEST_GLOBAL_ROOT="$global_root" TEST_REAL_NODE="$real_node"
  PI_CODING_AGENT_DIR="$decoy" PATH="$fake_bin:$PATH"
)
(
  cd -- "$external_project"
  env -u HERDR_PANE_ID -u QQ_DISPATCH_RUN_DIR "${wrapper_env[@]}" \
    "$WRAPPER" --provider openai-codex --model 'model with spaces' -- --literal
)
python3 - "$TMP/npm.argv" "$TMP/node.argv" "$TMP/pi.argv" \
  "$HELPER" "$package" "$manifest" "$cli" "$parser" <<'PY'
from pathlib import Path
import sys
npm = Path(sys.argv[1]).read_bytes().split(b"\0")
node = Path(sys.argv[2]).read_bytes().split(b"\0")
pi = Path(sys.argv[3]).read_bytes().split(b"\0")
helper, package, manifest, cli, parser = map(str.encode, sys.argv[4:])
assert npm == [b"root", b"-g", b""], npm
assert node == [
    helper, b"--package", package, b"--manifest", manifest,
    b"--cli", cli, b"--parser", parser, b"--",
    b"--provider", b"openai-codex", b"--model", b"model with spaces",
    b"--", b"--literal", b"",
], node
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
env "${wrapper_env[@]}" TEST_GLOBAL_ROOT="$missing_root" \
  "$WRAPPER" >"$TMP/no-package.out" 2>"$TMP/no-package.err"
status=$?
set -e
assert_equal 69 "$status" 'missing stock package did not refuse clearly'
assert_file_contains "$TMP/no-package.err" 'global @earendil-works/pi-coding-agent package is unavailable'

run_session_refusal() {
  local label=$1 expected=$2
  shift 2
  local -a invocation=(--model provider/model 'session call')
  (($# == 0)) || invocation=("$@")
  rm -f -- "$TMP/pi.argv"
  set +e
  env -u HERDR_PANE_ID "${wrapper_env[@]}" QQ_DISPATCH_RUN_DIR="$TMP/forged" \
    "$WRAPPER" "${invocation[@]}" \
    >"$TMP/$label.out" 2>"$TMP/$label.err"
  local status=$?
  set -e
  assert_equal 69 "$status" "$label did not refuse"
  assert_file_contains "$TMP/$label.err" "$expected"
  [[ ! -e "$TMP/pi.argv" ]] || fail "$label reached stock Pi"
}
restore_manifest() { cp "$TMP/manifest.good" "$manifest"; }
restore_parser() { rm -f -- "$parser"; cp "$TMP/parser.good" "$parser"; }

rm -f -- "$manifest"
run_session_refusal missing-manifest 'pinned stock Pi manifest is unsafe or unavailable'
restore_manifest
mv "$manifest" "$manifest.real"; ln -s package.json.real "$manifest"
run_session_refusal symlink-manifest 'pinned stock Pi manifest is unsafe or unavailable'
rm "$manifest"; mv "$manifest.real" "$manifest"
printf '{not-json\n' >"$manifest"
run_session_refusal malformed-manifest 'pinned stock Pi manifest is malformed JSON'
restore_manifest
printf '%s\n' '{"name":"foreign-pi","version":"0.81.1","type":"module"}' >"$manifest"
run_session_refusal wrong-name 'stock Pi package must be @earendil-works/pi-coding-agent@0.81.1'
restore_manifest
printf '%s\n' '{"name":"@earendil-works/pi-coding-agent","version":"0.81.2","type":"module"}' >"$manifest"
run_session_refusal wrong-version 'stock Pi package must be @earendil-works/pi-coding-agent@0.81.1'
restore_manifest

rm -f -- "$parser"
run_session_refusal missing-parser 'pinned stock Pi argument parser is unsafe or unavailable'
restore_parser
mv "$parser" "$parser.real"; ln -s args.js.real "$parser"
run_session_refusal symlink-parser 'pinned stock Pi argument parser is unsafe or unavailable'
rm "$parser"; mv "$parser.real" "$parser"
printf 'this is not JavaScript\n' >"$parser"
run_session_refusal malformed-parser-module 'pinned stock Pi argument parser module could not be loaded'
restore_parser
printf 'export const notParseArgs = true;\n' >"$parser"
run_session_refusal missing-parser-export 'pinned stock Pi argument parser has no parseArgs export'
restore_parser
cat >"$parser" <<'JS'
export function parseArgs() { throw new Error("parse failed"); }
JS
run_session_refusal parser-call-failure 'pinned stock Pi argument parse failed'
restore_parser
cat >"$parser" <<'JS'
export function parseArgs() { return null; }
JS
run_session_refusal malformed-parser-result 'pinned stock Pi argument parser returned a malformed result'
restore_parser
chmod 666 "$parser"
run_session_refusal world-writable-parser 'pinned stock Pi argument parser is unsafe or unavailable'
chmod 644 "$parser"

foreign_parser="$TMP/foreign-args.js"
cp "$TMP/parser.good" "$foreign_parser"
rm -f -- "$TMP/pi.argv"
set +e
env "${wrapper_env[@]}" "$real_node" "$HELPER" \
  --package "$package" --manifest "$manifest" --cli "$cli" --parser "$foreign_parser" -- \
  --model provider/model 'session call' >"$TMP/foreign-parser.out" 2>"$TMP/foreign-parser.err"
status=$?
set -e
assert_equal 69 "$status" 'foreign parser pointer did not refuse'
assert_file_contains "$TMP/foreign-parser.err" 'pinned stock Pi argument parser is outside the pinned stock Pi package'
[[ ! -e "$TMP/pi.argv" ]] || fail 'foreign parser pointer reached stock Pi'

# Exact first-token package/config administration remains a parser-free repair
# path. Neither a dispatch environment marker nor a later admin-looking token
# grants the bypass.
printf '{broken manifest\n' >"$manifest"
rm -f -- "$parser"
for command in install remove uninstall update list config; do
  rm -f -- "$TMP/pi.argv"
  env "${wrapper_env[@]}" "$WRAPPER" "$command" repair-target
  python3 - "$TMP/pi.argv" "$command" <<'PY'
from pathlib import Path
import sys
actual = Path(sys.argv[1]).read_bytes().split(b"\0")
assert actual == [sys.argv[2].encode(), b"repair-target", b""], actual
PY
done
restore_manifest
run_session_refusal admin-not-first 'pinned stock Pi argument parser is unsafe or unavailable' \
  'ordinary message' update

restore_parser
rm -f -- "$cli"
set +e
env "${wrapper_env[@]}" "$WRAPPER" >"$TMP/no-cli.out" 2>"$TMP/no-cli.err"
status=$?
set -e
assert_equal 69 "$status" 'missing stock CLI did not refuse clearly'
assert_file_contains "$TMP/no-cli.err" 'global Pi package executable dist/cli.js is unavailable'

printf 'test-qq-pi-runtime: pass\n'
