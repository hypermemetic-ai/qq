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

const indexRecording = recordingPi();
register(indexRecording.pi);

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
  const escapedFilename = escapeRegExp(filename);
  const importSpecifier = new RegExp(`from\\s+["']\\./${escapedFilename}["']`);
  assert.match(indexSource, importSpecifier, `${filename} is missing from extensions/index.ts`);
  const defaultImport = new RegExp(
    `import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["']\\./${escapedFilename}["']`,
  );
  const importMatch = indexSource.match(defaultImport);
  assert.ok(
    importMatch,
    `${filename} is imported in extensions/index.ts but its default-import binding cannot be identified`,
  );
  const binding = importMatch[1];
  assert.match(
    indexSource,
    new RegExp(`\\b${binding}\\s*\\(`),
    `${filename} is imported in extensions/index.ts but its register is never invoked`,
  );
}
assert.doesNotMatch(
  indexSource,
  /from\s+["']\.\/qq-codex-fast\.ts["']/,
  "delegate-only qq-codex-fast.ts was mounted globally",
);

const siblingRegistrations = [];
for (const filename of extensionFiles) {
  if (excluded.has(filename)) continue;
  const { default: registerSibling } = await import(
    pathToFileURL(`${dirname(indexPath)}/${filename}`)
  );
  const siblingRecording = recordingPi();
  registerSibling(siblingRecording.pi);
  assert.notEqual(
    siblingRecording.registrations.length,
    0,
    `${filename} registered nothing when invoked directly`,
  );
  siblingRegistrations.push(...siblingRecording.registrations);
}

assert.deepEqual(
  indexRecording.registrations.sort(),
  siblingRegistrations.sort(),
  "extensions/index.ts registrations differ from its mounted extension siblings",
);

console.log("test-qq-extension-mount: pass");
JS
then
  fail 'Pi extension mount node suite failed'
fi
