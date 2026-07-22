#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-trace-context-extension"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
EXT="$ROOT/.pi/extensions/qq-trace-context.ts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[ -f "$EXT" ] || fail "missing extension: $EXT"

# Structural guards: root resolution, absent-only context, required ID shapes,
# structural marker, and non-fatal observation all stay visible in source.
assert_file_contains "$EXT" 'fileURLToPath(import.meta.url)'
assert_file_contains "$EXT" 'process.env.QQ_TRACE_ID === undefined'
assert_file_contains "$EXT" 'process.env.PI_ROOT_SPAN_ID === undefined'
assert_file_contains "$EXT" 'process.env.PI_PARENT_SPAN_ID === undefined'
assert_file_contains "$EXT" 'randomBytes(16).toString("hex")'
assert_file_contains "$EXT" 'randomBytes(8).toString("hex")'
assert_file_contains "$EXT" 'process.env.PI_PARENT_SPAN_ID = process.env.PI_ROOT_SPAN_ID'
assert_file_contains "$EXT" '"bin/qq-observe"'
assert_file_contains "$EXT" '"invoke_workflow"'
assert_file_contains "$EXT" '"accountable-session"'
assert_file_contains "$EXT" '"qq-trace-context"'
assert_file_contains "$EXT" '[qq-trace-context] trace_id='
assert_file_contains "$EXT" 'unable to record session-root span'

# Functional: import with a mock Pi under isolated state, verify the context and
# marker, then verify explicit values and a missing observer are both non-fatal.
export HOME="$tmp/home"
export XDG_STATE_HOME="$tmp/state"
mkdir -p "$HOME"
git_common_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
repository_name="$(basename "$(dirname "$(realpath -e "$git_common_dir")")")"
store="$XDG_STATE_HOME/qq/spans/$repository_name/spans.jsonl"

EXT="$EXT" ROOT="$ROOT" STORE="$store" LAYOUT="$tmp/missing-observer" \
  node --experimental-strip-types --input-type=module - <<'JS'
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ext = process.env.EXT;
const store = process.env.STORE;
const layout = process.env.LAYOUT;
const pi = { on() {} };
const die = (message) => { console.error(message); process.exit(1); };
const assertEq = (actual, expected, label) => {
  if (actual !== expected) die(`${label}: expected ${expected}, got ${actual}`);
};
const captureNotes = async (load) => {
  const notes = [];
  const original = console.error;
  console.error = (...args) => notes.push(args.join(" "));
  try {
    await load();
  } finally {
    console.error = original;
  }
  return notes;
};

for (const key of ["QQ_TRACE_ID", "PI_ROOT_SPAN_ID", "PI_PARENT_SPAN_ID"]) {
  delete process.env[key];
}
const firstNotes = await captureNotes(async () => {
  const mod = await import(pathToFileURL(ext).href);
  mod.default(pi);
});
if (!/^[0-9a-f]{32}$/.test(process.env.QQ_TRACE_ID ?? "")) die("trace ID has the wrong shape");
if (!/^[0-9a-f]{16}$/.test(process.env.PI_ROOT_SPAN_ID ?? "")) die("root span ID has the wrong shape");
assertEq(process.env.PI_PARENT_SPAN_ID, process.env.PI_ROOT_SPAN_ID, "dispatch parent");
assertEq(firstNotes.length, 1, "load-time note count");
assertEq(
  firstNotes[0],
  `[qq-trace-context] trace_id=${process.env.QQ_TRACE_ID} root_span_id=${process.env.PI_ROOT_SPAN_ID}`,
  "load-time note",
);
if (!fs.existsSync(store)) die("session-root marker was not recorded");
const records = fs.readFileSync(store, "utf8").trim().split("\n").map(JSON.parse);
assertEq(records.length, 1, "initial marker count");
const marker = records[0];
assertEq(marker.trace_id, process.env.QQ_TRACE_ID, "marker trace ID");
assertEq(marker.span_id, process.env.PI_ROOT_SPAN_ID, "marker span ID");
assertEq(marker.root_span_id, process.env.PI_ROOT_SPAN_ID, "marker root span ID");
assertEq(marker.parent_span_id, null, "marker parent span ID");
assertEq(marker.name, "invoke_workflow", "marker name");
assertEq(marker.actor, "accountable-session", "marker actor");
assertEq(marker.source, "qq-trace-context", "marker source");
assertEq(marker.phase, null, "marker phase");
assertEq(marker.duration_ms, 0, "marker duration");
assertEq(marker.start_time, marker.end_time, "marker timestamps");

const explicit = {
  QQ_TRACE_ID: "11111111111111111111111111111111",
  PI_ROOT_SPAN_ID: "2222222222222222",
  PI_PARENT_SPAN_ID: "3333333333333333",
};
Object.assign(process.env, explicit);
const explicitNotes = await captureNotes(async () => {
  const mod = await import(pathToFileURL(ext).href + "?explicit");
  mod.default(pi);
});
for (const [key, value] of Object.entries(explicit)) {
  assertEq(process.env[key], value, `${key} explicit value`);
}
assertEq(explicitNotes.length, 0, "explicit-context note count");
assertEq(fs.readFileSync(store, "utf8").trim().split("\n").length, 1, "explicit-context marker count");

const copiedExtension = path.join(layout, ".pi/extensions/qq-trace-context.ts");
fs.mkdirSync(path.dirname(copiedExtension), { recursive: true });
fs.copyFileSync(ext, copiedExtension);
for (const key of Object.keys(explicit)) delete process.env[key];
const missingNotes = await captureNotes(async () => {
  const mod = await import(pathToFileURL(copiedExtension).href);
  mod.default(pi);
});
if (!/^[0-9a-f]{32}$/.test(process.env.QQ_TRACE_ID ?? "")) die("missing-observer trace ID has the wrong shape");
if (!/^[0-9a-f]{16}$/.test(process.env.PI_ROOT_SPAN_ID ?? "")) die("missing-observer root ID has the wrong shape");
assertEq(process.env.PI_PARENT_SPAN_ID, process.env.PI_ROOT_SPAN_ID, "missing-observer dispatch parent");
if (!missingNotes.some((note) => note.includes("unable to record session-root span"))) {
  die("missing observer did not produce a stderr note");
}
JS

assert_file_contains "$ROOT/README.md" '.pi/extensions/qq-trace-context.ts'
assert_file_contains "$ROOT/README.md" 'qq-observe read-session <session.jsonl> --trace-id <trace> --parent-span-id <root>'

printf 'test-qq-trace-context-extension: pass\n'
