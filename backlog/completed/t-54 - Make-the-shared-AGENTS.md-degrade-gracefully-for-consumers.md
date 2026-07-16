---
id: T-54
title: Make the shared AGENTS.md degrade gracefully for consumers
status: Done
assignee: []
created_date: '2026-07-16 03:57'
updated_date: '2026-07-16 16:54'
labels: []
dependencies: []
priority: medium
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`AGENTS.md` is symlinked into consumer projects and mandates surfaces they lack: `REVIEW.md` in deciq and deciq-logic, `openwiki/` in deciq-logic, and codebase-memory-mcp in both. Either add the surfaces to consumers, make the canonical text conditional ("where present"), or split project-conditional sections out of the shared file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A settled approach lands
- [x] #2 Consumer-project sessions no longer receive mandates they cannot follow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Settled approach: conditional canonical text. Context-section surface bullets and the Review-guidelines mandate now apply 'where present'; a canonical preamble before the tool-managed blocks scopes them to repositories where the surface exists. Managed marker blocks left byte-identical (bin/qq-openwiki verified not to own the OPENWIKI template). CONCEPTS.md kept unconditional — verified present in deciq and deciq-logic.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AGENTS.md surface mandates degrade gracefully in consumer repositories: REVIEW.md, openwiki/, codebase-memory, and Backlog guidance are conditional on the surface existing; tool-managed blocks are scoped by a preamble and remain untouched. Docs-only Change; full test suite green; fresh-context review verdict: pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
