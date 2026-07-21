---
id: T-105
title: Refresh openwiki against current source
status: Done
assignee: []
created_date: '2026-07-19 16:42'
updated_date: '2026-07-19 20:23'
labels: []
dependencies: []
documentation:
  - doc-57
  - doc-58
priority: medium
type: docs
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drift found by the sweep (evidence: doc-58, verified): openwiki/ was generated 2026-07-16 at c5fa552; bin/qq-openwiki changed 2026-07-18, and the wiki still describes durable stale-snapshot recovery the 137-line wrapper no longer implements. doc-57 adds: openwiki/operations.md describes Claude-first snap selection while source is Pi-first. Regenerate from fresh main through the openwiki-maintainer contract. Independent of T-89's reap scans; this fixes concrete known drift now.

Decision ledger:
- Refresh scope (both staleness findings): doc-57/doc-58 verified by owning agent, ticketed per operator instruction in the T-93 follow-up session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wiki regenerated from fresh main; architecture.md and operations.md match current bin/qq-openwiki and Pi-first snap behavior
- [x] #2 Maintainer contract followed (fresh review, docs-only, operator merge)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wiki regenerated from fresh origin/main 0863c6b through the openwiki-maintainer contract and merged as PR #149 (operator merge, merge commit b36ba0e). Both named drift findings verified fixed: stale-snapshot recovery prose removed (wrapper restores from Git baseline); operations.md snap description matches Pi-first source (bin/qq-herdr-snap:83-91). Fresh review round + bounded --correct + delta review: one verified finding (qq-board fail-closed vs watch-mode fail-open) corrected; docs-only diff confined to openwiki/.
<!-- SECTION:FINAL_SUMMARY:END -->
