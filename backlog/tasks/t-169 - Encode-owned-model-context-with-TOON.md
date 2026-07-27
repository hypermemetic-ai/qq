---
id: T-169
title: Encode owned model context with TOON
status: In Progress
assignee: []
created_date: '2026-07-27 04:21'
updated_date: '2026-07-27 04:53'
labels: []
dependencies: []
documentation:
  - doc-102
modified_files:
  - .github/workflows/ci.yml
  - .gitignore
  - README.md
  - extensions/lib/model-context.ts
  - extensions/qq-architect.ts
  - package-lock.json
  - package.json
  - tests/test-model-context-encoder.sh
  - tests/test-qq-architect-extension.sh
priority: medium
type: enhancement
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: qq presents substantial structured data through deterministic TOON encoding at owned model-ingress boundaries while retaining JSON as the canonical machine, persistence, schema, and hashing format.

Current scope: adopt the shared boundary with `/architect`, the only current qq-owned call site that directly injects a substantial structured JSON value into model context. A current 42-finding payload measures about 5.7% fewer estimated o200k tokens under TOON 4.1.0. Do not create TOON mirrors for irregular Observer package/transcript files whose representative measured saving was negligible.

Decision ledger:
- Canonical JSON plus explicit, measured TOON model-boundary encoding, including the current `/architect` scope — decision-17 (operator asked-and-answered alignment and “Proceed targeted” selection, accountable project-home session, 2026-07-26).
- Production performs one encode; round-trip identity is implementation-test evidence only, with no runtime decode, agent inspection, or Observer machinery — decision-17 (operator clarification, same session, 2026-07-26).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `/architect` command injects its current structured context as deterministic TOON rather than serialized JSON.
- [ ] #2 Architect context parsing, freshness, exact identities, pending intake, proposal, confirmation, and retry behavior remain bound to canonical JSON state.
- [ ] #3 One exact upstream TOON version is lock-pinned, installed by documented bootstrap and CI steps, and loaded by the mounted Pi extension set.
- [ ] #4 Ordinary tests prove JSON-model round-trip conformance and the Architect prompt boundary; production performs no decode, comparison, agent inspection, or observation step.
- [ ] #5 The current eligible boundary and measured savings are recorded honestly; Observer packages, transcripts, schemas, receipts, JSONL, and durable JSON remain unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Pin the upstream TOON 4.1.0 encoder and expose one shared model-context encoding helper. Convert `/architect` at its existing injection call while keeping parsed JSON and all disposition rails unchanged. Add ordinary conformance and prompt-shape tests, wire the pinned dependency into bootstrap and CI, and document the model-boundary rule. Do not intercept arbitrary JSON or generate TOON mirrors.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation commits: 992307f (pinned TOON encoder, shared boundary, Architect conversion, dependency/bootstrap/CI/docs/tests) and 8fd50db (review-confirmed refusal of malformed Unicode at the existing Architect context boundary).

Fresh owner verification: npm lock install passed with lifecycle scripts disabled and zero reported vulnerabilities; primary LSP diagnostics were clean; every top-level tests/test-*.sh passed natively; ratchet and git diff checks passed. Fresh-context review first reproduced an unpaired-surrogate failure, then accepted the focused fix delta with no remaining findings.

Post-merge activation: after `qq-change land` updates the primary checkout, run `npm ci --ignore-scripts` from that checkout and reload/relaunch Pi so the mounted extension resolves the exact locked dependency. No live installation is mutated before merge.
<!-- SECTION:NOTES:END -->
