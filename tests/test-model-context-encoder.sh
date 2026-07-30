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
const contextId = `context-${"a".repeat(32)}`;
const source = { run_dir: "/state/runs/fixture/repo/pr-1", repository: "fixture/repo",
  legacy: false, pr: 1, variant: "guided", assembled_at: "2026-08-01T00:00:00Z" };
const findingOccurrence = { occurrence_id: `occurrence-${"b".repeat(32)}`,
  recurrence_key: "quotes, commas: and [brackets]", source };
const pendingOccurrence = { occurrence_id: `occurrence-${"c".repeat(32)}`,
  recurrence_key: "pending-key", source: { ...source, pr: 2, run_dir: "/state/runs/fixture/repo/pr-2" } };
const value = {
  schema: "qq-observer.architect-context",
  schema_version: 4,
  context_id: contextId,
  findings: [{
    recurrence_key: findingOccurrence.recurrence_key,
    title: "line one\nline two\t\"quoted\" \\ slash — 雪",
    kind: "friction", confidence: "high", covered: false,
    suggested_scope: "", occurrences: [findingOccurrence],
  }],
  pending_intakes: [{
    batch_id: `batch-${"d".repeat(32)}`, context_id: `context-${"e".repeat(32)}`, status: "proposed",
    decisions: [{ recurrence_key: "pending-key", action: "set_aside", scope: "",
      note: " leading and trailing ", occurrence_ids: [pendingOccurrence.occurrence_id] }],
    occurrences: [pendingOccurrence],
  }],
  observer_health: { rounds: [], omitted_rounds: 0 },
  omitted_findings: 0,
};
assert.deepEqual(Object.keys(value), ["schema", "schema_version", "context_id", "findings", "pending_intakes", "observer_health", "omitted_findings"]);
assert.deepEqual(Object.keys(value.pending_intakes[0]), ["batch_id", "context_id", "status", "decisions", "occurrences"]);
const encoded = encodeModelContext(value);
assert.equal(typeof encoded, "string");
assert.ok(encoded.length > 0);
assert.equal(encodeModelContext(value), encoded, "encoding is not deterministic");
assert.deepEqual(decode(encoded), value);
assert.notEqual(encoded, JSON.stringify(value));
console.log("test-model-context-encoder: pass");
JS
