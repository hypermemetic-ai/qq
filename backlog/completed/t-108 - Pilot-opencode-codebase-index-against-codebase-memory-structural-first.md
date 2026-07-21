---
id: T-108
title: Pilot opencode-codebase-index against codebase-memory (structural-first)
status: Done
assignee: []
created_date: '2026-07-19 19:40'
updated_date: '2026-07-19 20:51'
labels: []
dependencies: []
documentation:
  - doc-64
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-minted from archived T-102 per T-107 disposition (operator, 2026-07-19). The challenger (opencode-codebase-index 0.14.0) has a verified real pi surface: pi-extension.js + skills, 15 tools. Scope is STRUCTURAL-FIRST: call graph, callers/callees, impact — no embeddings provider; semantic codebase_search is out of scope unless structural passes, since it needs ollama/openai/gemini embeddings. codebase-memory stays until the corpus passes on the challenger. Do not run two permanent indexes without measured benefit. Evidence: T-107 trial notes (2026-07-19), doc-58.

Decision ledger:
- Pilot re-mint and structural-first scope (no embeddings provider; semantic search out of scope): operator disposition recorded in T-107 final ledger (2026-07-19) and doc-64.
- Verdict is PROPOSED-only; the operator disposes replace/keep/additive; no AGENTS.md routing change in this Change: doc-64 (operator-settled batch constraints, 2026-07-19).
- No two permanent indexes without measured benefit; codebase-memory stays until the corpus passes on the challenger: operator disposition, T-107 final ledger (2026-07-19).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 Query corpus defined and attached (architecture, dependency, route, impact questions over the qq repo)
- [x] #2 #2 Structural tools (call_graph, call_graph_path, pr_impact, implementation_lookup, index_codebase) exercised on qq and compared against codebase-memory CLI answers with correctness notes
- [x] #3 #3 Verdict recorded: replace, keep codebase-memory, or additive-with-benefit (named); if replace, AGENTS.md routing updated in the same Change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FINAL SUMMARY (2026-07-19, dispatch orchestrator): Structural-first pilot complete. Corpus: 12 source-grounded questions (3 per class). Challenger opencode-codebase-index 0.14.0 answered 0/12 — every structural path incl. index_codebase refuses without an embedding-capable provider (owner-reproduced). Incumbent codebase-memory 0.9.0: 7 correct / 2 wrong / 3 cannot-answer; live gap = extensionless bin/qq-* entrypoints unmodeled. PROPOSED verdict: KEEP codebase-memory (pilot/proposed-verdict.md) — operator disposition outstanding; AGENTS.md routing deliberately untouched per doc-64. Raw responses (35 JSON + README) attached under pilot/raw/ per doc-64. Review round 1: one finding (raw results) fixed and owner-verified. PR #153.
<!-- SECTION:NOTES:END -->
