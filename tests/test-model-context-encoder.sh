#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
node --input-type=module - "$ROOT/extensions/lib/model-context.ts" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { decode } from "@toon-format/toon";

const [modulePath] = process.argv.slice(2);
const { encodeModelContext } = await import(pathToFileURL(modulePath));
const value = {
  schema: "qq-observer.architect-context",
  schema_version: 2,
  context_id: `context-${"a".repeat(32)}`,
  findings: [{
    recurrence_key: "quotes, commas: and [brackets]",
    title: "line one\nline two\t\"quoted\" \\ slash — 雪",
    kind: "friction",
    confidence: "high",
    suggested_scope: "",
    occurrences: [{ occurrence_id: `occurrence-${"b".repeat(32)}`, legacy: false, pr: 0, note: null }],
  }],
  pending_intakes: [],
  omitted_findings: 0,
  edge_strings: ["", "true", "null", " leading and trailing ", "a|b,c:d"],
  empty_object: {},
};
const encoded = encodeModelContext(value);
assert.equal(typeof encoded, "string");
assert.ok(encoded.length > 0);
assert.equal(encodeModelContext(value), encoded, "encoding is not deterministic");
assert.deepEqual(decode(encoded), value);
assert.notEqual(encoded, JSON.stringify(value));
console.log("test-model-context-encoder: pass");
JS
