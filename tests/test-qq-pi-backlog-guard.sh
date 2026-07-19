#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# helpers.sh reads TEST_NAME while it is sourced.
# shellcheck disable=SC2034
TEST_NAME="test-qq-pi-backlog-guard"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/cockpit/pi/qq-backlog-guard.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

repo="$TMP/repo"
worktree="$TMP/linked"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" -c user.name=qq-test -c user.email=qq-test.invalid \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null \
  commit -q --allow-empty -m initial
git -C "$repo" worktree add -q -b guard-check "$worktree"
mkdir -p "$worktree/src/deep"

# The extension intentionally contains JavaScript-compatible TypeScript, so
# CI can exercise its real registration and handler without installing Pi.
module="$TMP/qq-backlog-guard.mjs"
cp -- "$EXTENSION" "$module"

HOME="$TMP" node --input-type=module - "$module" "$worktree" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const [modulePath, worktree] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
let handler;

register({
  on(eventName, candidate) {
    assert.equal(eventName, "tool_call", "extension registered wrong event");
    assert.equal(handler, undefined, "extension registered more than one handler");
    handler = candidate;
  },
});
assert.equal(typeof handler, "function", "tool_call handler was not registered");

const feedback =
  "managed Backlog markdown must be edited through the backlog CLI";
const call = (toolName, input, cwd = worktree) =>
  handler({ toolName, input }, { cwd });
const assertBlocked = (result, message) =>
  assert.deepEqual(result, { block: true, reason: feedback }, message);
const assertAllowed = (result, message) =>
  assert.equal(result, undefined, message);

assertBlocked(
  call("write", { path: "backlog/tasks/t-91.md", content: "no" }),
  "relative write under backlog was allowed",
);
assertBlocked(
  call("edit", { path: join(worktree, "backlog/docs/note.md") }),
  "absolute edit under backlog was allowed",
);
assertBlocked(
  call("write", { path: "src/../backlog/./tasks/t-91.md" }),
  "normalized path under backlog was allowed",
);
assertBlocked(
  call("edit", { path: "../../backlog/tasks/t-91.md" }, join(worktree, "src/deep")),
  "nested-cwd path under linked-worktree backlog was allowed",
);
assertBlocked(
  call("write", { path: "@backlog/tasks/t-91.md", content: "no" }),
  "Pi @-prefixed path under backlog was allowed",
);
assertBlocked(
  call("edit", { path: pathToFileURL(join(worktree, "backlog/docs/note.md")).href }),
  "Pi file URL under backlog was allowed",
);
assertBlocked(
  call("write", { path: "~/linked/backlog/tasks/t-91.md", content: "no" }),
  "Pi tilde path under backlog was allowed",
);

assertAllowed(
  call("write", { path: "backlog-copy/note.md", content: "ok" }),
  "backlog-prefix sibling was blocked",
);
assertAllowed(
  call("edit", { path: "README.md" }),
  "ordinary path was blocked",
);
assertAllowed(
  call("read", { path: "backlog/tasks/t-91.md" }),
  "non-write/edit tool was blocked",
);
assertAllowed(
  call("bash", { command: "backlog task edit 91 -s Done" }),
  "Bash command was blocked",
);

console.log("test-qq-pi-backlog-guard: pass");
JS
