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

# qq-communication-moments registers nothing in delegate/headless contexts by
# design (T-204); this suite asserts direct-registration shape in a clean env.
unset QQ_DISPATCH_RUN_DIR

git init -q -b main "$TMP/unlinked"
git init -q -b main "$TMP/linked"
git -C "$TMP/linked" config --local qq.methodology true

if ! node --input-type=module - "$INDEX" "$TMP/unlinked" "$TMP/linked" <<'JS'
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const [indexPath, unlinkedRepository, linkedRepository] = process.argv.slice(2);
const indexModule = await import(pathToFileURL(indexPath));
const { default: register, QQ_EXTENSION_MODULES } = indexModule;

function recordingPi() {
  const registrations = [];
  return {
    registrations,
    pi: {
      registerTool(tool) {
        registrations.push(`tool:${tool.name}`);
      },
      registerShortcut(shortcut) {
        registrations.push(`shortcut:${shortcut}`);
      },
      registerCommand(command) {
        registrations.push(`command:${command}`);
      },
      on(eventName) {
        registrations.push(`listener:${eventName}`);
      },
    },
  };
}

const indexSource = await readFile(indexPath, "utf8");
assert.match(indexSource, /from\s+["']\.\/qq-methodology\.ts["']/);
assert.doesNotMatch(
  indexSource,
  /from\s+["']\.\/qq-(?!methodology)[^"']+\.ts["']/,
  "the global mount statically imports a conditional qq extension",
);

const extensionDirectory = dirname(indexPath);
const siblingFiles = (await readdir(extensionDirectory))
  .filter((filename) => filename.startsWith("qq-") && filename.endsWith(".ts"))
  .filter((filename) => filename !== "qq-methodology.ts")
  .sort();
const listedFiles = QQ_EXTENSION_MODULES.map((specifier) => specifier.slice(2)).sort();
assert.deepEqual(
  listedFiles,
  siblingFiles,
  "conditional bootstrap membership differs from the qq extension siblings",
);

const unlinked = recordingPi();
await register(unlinked.pi, { cwd: unlinkedRepository });
assert.deepEqual(
  unlinked.registrations,
  [],
  "unlinked Repository received qq tools, commands, guards, or listeners",
);

const linked = recordingPi();
await register(linked.pi, { cwd: linkedRepository });
const siblingRegistrations = [];
for (const specifier of QQ_EXTENSION_MODULES) {
  const { default: registerSibling } = await import(
    pathToFileURL(`${extensionDirectory}/${specifier.slice(2)}`)
  );
  const sibling = recordingPi();
  await registerSibling(sibling.pi);
  assert.notEqual(
    sibling.registrations.length,
    0,
    `${specifier} registered nothing when invoked directly`,
  );
  siblingRegistrations.push(...sibling.registrations);
}

const bootstrapRegistrations = [
  "listener:session_start",
  "listener:resources_discover",
  "listener:before_agent_start",
  "listener:session_shutdown",
];
assert.deepEqual(
  linked.registrations.sort(),
  [...bootstrapRegistrations, ...siblingRegistrations].sort(),
  "linked bootstrap registrations differ from the whole qq extension bundle",
);

console.log("test-qq-extension-mount: pass");
JS
then
  fail 'Pi extension mount node suite failed'
fi
