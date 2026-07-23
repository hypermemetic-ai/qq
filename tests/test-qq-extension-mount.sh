#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-extension-mount"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
INDEX="$ROOT/extensions/index.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension mount'

if ! node --input-type=module - "$INDEX" <<'JS'
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const [indexPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(indexPath));
const registrations = {
  tools: [],
  shortcuts: [],
  commands: [],
  listeners: [],
};

register({
  registerTool(tool) {
    registrations.tools.push(tool.name);
  },
  registerShortcut(shortcut) {
    registrations.shortcuts.push(shortcut);
  },
  registerCommand(command) {
    registrations.commands.push(command);
  },
  on(eventName) {
    registrations.listeners.push(eventName);
  },
});

const count = (items, item) => items.filter((candidate) => candidate === item).length;
assert.equal(count(registrations.tools, "qq_pr_watch"), 1, "qq_pr_watch was not registered exactly once");
assert.equal(count(registrations.tools, "operator_stage"), 1, "operator_stage was not registered exactly once");
assert.equal(count(registrations.shortcuts, "shift+alt+enter"), 1, "continue shortcut was not registered exactly once");
assert.equal(count(registrations.commands, "split-fork"), 1, "split-fork was not registered exactly once");
assert.equal(count(registrations.listeners, "tool_call"), 1, "backlog guard was not registered exactly once");

const indexSource = await readFile(indexPath, "utf8");
const extensionFiles = (await readdir(dirname(indexPath)))
  .filter((filename) => filename.endsWith(".ts"))
  .sort();
const excluded = new Set([
  "index.ts",
  // Delegate-child scope via bin/qq-dispatch; never a global extension.
  "qq-codex-fast.ts",
]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const filename of extensionFiles) {
  if (excluded.has(filename)) continue;
  const importSpecifier = new RegExp(`from\\s+["']\\./${escapeRegExp(filename)}["']`);
  assert.match(indexSource, importSpecifier, `${filename} is missing from extensions/index.ts`);
}
assert.doesNotMatch(
  indexSource,
  /from\s+["']\.\/qq-codex-fast\.ts["']/,
  "delegate-only qq-codex-fast.ts was mounted globally",
);

console.log("test-qq-extension-mount: pass");
JS
then
  fail 'Pi extension mount node suite failed'
fi
