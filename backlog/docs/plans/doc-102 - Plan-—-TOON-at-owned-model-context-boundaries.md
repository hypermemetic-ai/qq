---
id: doc-102
title: Plan — TOON at owned model-context boundaries
type: specification
created_date: '2026-07-27 04:22'
updated_date: '2026-07-27 04:22'
---
# Plan — TOON at owned model-context boundaries

## Outcome

qq presents substantial structured values through deterministic TOON encoding at explicit, owned model-ingress boundaries while JSON remains canonical for persistence, machine APIs, hashing, schemas, receipts, and provider protocols.

## Current evidence and boundary

The source audit found one current qualifying call site: `/architect` serializes the complete `qq-observer.architect-context` value directly into a Pi user message. Other extension messages are short prose; delegated Completion Envelopes and Observer analyses are provider-enforced structured output; Observer packages, facts, signals, transcripts, receipts, ledgers, and schemas are durable or tool-readable machine evidence rather than direct prompt serialization.

Using upstream `@toon-format/toon@4.1.0` against the current 42-finding Architect context measured approximately 9,249 compact-JSON tokens versus 8,723 TOON tokens under the upstream o200k estimator, a 5.7% reduction. A representative irregular Observer transcript measured only a 0.6% token reduction and grew slightly in bytes, so derived TOON package mirrors are outside this Change.

## Implementation

1. Add a private root npm manifest and lock pinning `@toon-format/toon@4.1.0`; ignore local `node_modules/`.
2. Add one shared extension helper that encodes a JSON-model value for model context through the upstream encoder.
3. Change `/architect` only at its existing `pi.sendUserMessage` boundary. Parsing and holding the authoritative JSON context, exact identity checks, proposals, confirmations, retries, and temporary machine inputs remain unchanged.
4. Update the mounted-extension bootstrap and CI to install the exact lock without lifecycle scripts.
5. Add ordinary tests for upstream encode/decode JSON-model identity and Architect prompt content, including exact occurrence/context identifiers and pending-intake visibility. Production performs one encode and no decode or comparison.
6. Document the boundary rule and the representative measured saving without promising uniform gains.

## Non-goals

- No generic JSON detector, message interception, or provider-payload rewriting.
- No TOON persistence, JSON Schema replacement, structured-output change, or machine command format change.
- No derived TOON mirrors for Observer JSON/JSONL packages or analyses.
- No runtime round-trip, validation layer, agent inspection, Observer check, telemetry, or reconciliation state.
- No OpenWiki update; its dedicated maintainer remains separately triggered.

## Success evidence

- The pinned package installs from the committed lock with lifecycle scripts disabled.
- Upstream encode/decode round-trips representative Architect-shaped JSON in a focused test.
- `/architect` emits a TOON-labelled context that preserves the exact canonical values and contains no verbatim compact-JSON dump.
- Existing Architect proposal, confirmation, pending-intake, retry, stale-context, and refusal tests remain green.
- Focused extension checks, repository shell tests, `git diff --check`, diagnostics, and fresh-context review pass.
