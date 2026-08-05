#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-session-lineage-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-session-lineage.ts"
INDEX="$ROOT/extensions/index.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

# The extension intentionally contains JavaScript-compatible TypeScript, so
# CI can exercise its real registration and handler without installing Pi.
module="$TMP/qq-session-lineage.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));

const handlers = new Map();
const pi = { on: (event, fn) => handlers.set(event, fn) };
register(pi);
const sessionStart = handlers.get("session_start");
assert.equal(typeof sessionStart, "function", "session_start handler not registered");

delete process.env.PI_SUBAGENT_PARENT_SESSION;
await sessionStart({}, { sessionManager: { getSessionId: () => "session-abc-123" } });
assert.equal(
  process.env.PI_SUBAGENT_PARENT_SESSION,
  "session-abc-123",
  "session id was not exported as the lineage variable",
);

await sessionStart({}, { sessionManager: { getSessionId: () => "session-next-456" } });
assert.equal(
  process.env.PI_SUBAGENT_PARENT_SESSION,
  "session-next-456",
  "each session names itself in the lineage variable",
);

for (const missing of [undefined, "", 42]) {
  process.env.PI_SUBAGENT_PARENT_SESSION = "session-kept";
  await sessionStart({}, { sessionManager: { getSessionId: () => missing } });
  assert.equal(
    process.env.PI_SUBAGENT_PARENT_SESSION,
    "session-kept",
    `invalid session id ${String(missing)} overwrote the lineage variable`,
  );
}

delete process.env.PI_SUBAGENT_PARENT_SESSION;
await sessionStart({}, { sessionManager: {} });
assert.equal(
  process.env.PI_SUBAGENT_PARENT_SESSION,
  undefined,
  "a session manager without getSessionId set the lineage variable",
);
JS
then
  fail 'session-lineage extension assertions failed'
fi

# The conditional bootstrap owns extension membership (mount, don't mirror).
grep -Fq '"./qq-session-lineage.ts"' "$ROOT/extensions/qq-methodology.ts" \
  || fail 'conditional bootstrap does not include qq-session-lineage'

printf 'test-qq-session-lineage-extension: pass\n'
