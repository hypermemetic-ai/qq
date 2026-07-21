#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-continue-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-continue.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

module="$TMP/qq-continue.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
let shortcut;
const sent = [];
const pi = {
  registerShortcut(key, options) {
    assert.equal(shortcut, undefined, "extension registered more than one shortcut");
    shortcut = { key, ...options };
  },
  sendUserMessage(message) {
    sent.push(message);
  },
};

register(pi);
assert.equal(shortcut?.key, "shift+alt+enter");
assert.equal(shortcut?.description, 'Send "continue" when the agent is stopped');
assert.equal(typeof shortcut?.handler, "function");

shortcut.handler({ isIdle: () => false });
assert.deepEqual(sent, [], "busy handler sent a continuation prompt");
shortcut.handler({ isIdle: () => true });
assert.deepEqual(sent, ["continue"], "idle handler did not send exactly one continuation prompt");

console.log("test-qq-continue-extension: pass");
JS
then
  fail 'Pi continue extension node suite failed'
fi
