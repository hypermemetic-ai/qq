---
id: decision-17
title: Use TOON only at explicit owned model-ingress boundaries
date: '2026-07-27 04:23'
status: accepted
---
## Context

qq controls several workflow boundaries where structured data may enter an
agent's context. JSON is the established canonical machine format: existing
code parses, validates, hashes, persists, and exchanges JSON through schemas,
receipts, ledgers, and provider protocols. Injecting the same representation
verbatim into a model prompt can repeat field names and structural punctuation
that a model-oriented encoding can avoid.

The operator chose a narrower boundary than replacing JSON system-wide: keep
canonical JSON everywhere and apply a deterministic TOON conversion only at
explicit qq-owned points that deliberately present a substantial structured
value to a workflow role. The current audit found `/architect` as the only
direct qualifying prompt injection. Upstream TOON 4.1.0 measured a 5.7% token
reduction on its current real context; irregular Observer transcript data
showed negligible savings and does not justify a parallel view.

## Decision

JSON remains qq's canonical structured-data format. At an explicit qq-owned
model-ingress boundary that deliberately injects a substantial structured
JSON-model value, qq encodes that value with one lock-pinned strict upstream
TOON encoder before sending it to the model when measured evidence supports
the conversion.

The conversion is declared at the known call site. qq does not scan arbitrary
text for JSON, rewrite provider payloads, replace JSON Schema or strict
structured output, or maintain TOON as parallel durable truth. Production
performs one encode only. Decode/encode identity is ordinary implementation-
test evidence, not runtime validation, agent review, Observer machinery,
telemetry, or reconciliation state.

The first and currently only qualifying boundary is `/architect`. Future
candidate boundaries must establish that they are owned model presentation
rather than machine contracts or durable/tool-readable evidence, and should
measure the actual shape rather than assume TOON is always smaller.

## Consequences

- `/architect` presents its global Observer context as TOON while retaining the
  parsed JSON value and exact disposition identities internally.
- qq pins one upstream encoder version and installs it as a mounted-extension
  runtime dependency.
- Machine commands, persistence, hashes, schemas, receipts, JSONL, Observer
  packages, analyses, and provider-enforced structured outputs stay JSON.
- There is no generic interception layer and no runtime round-trip machinery.
- Adding a future model-ingress conversion is an explicit call-site change with
  focused evidence, not an automatic system-wide rewrite.
