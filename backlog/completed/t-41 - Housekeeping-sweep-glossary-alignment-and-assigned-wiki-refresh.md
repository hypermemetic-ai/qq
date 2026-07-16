---
id: T-41
title: 'Housekeeping sweep: glossary alignment and assigned wiki refresh'
status: Done
assignee: []
created_date: '2026-07-14 22:47'
updated_date: '2026-07-15 01:23'
labels: []
dependencies:
  - T-39
documentation:
  - doc-42
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-42: clear Phase-4 vocabulary debt. CONCEPTS.md gains the new delegation vocabulary and its agent-messaging entry reflects the narrowed skill; the stale activation-chain description leaves the wiki through an assigned maintainer refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CONCEPTS.md defines work order and completion envelope, and its agent-messaging entry reflects cross-runtime coordination plus operator notifications
- [x] #2 An assigned openwiki refresh lands as a maintainer docs pull request removing the deleted activation-chain description from openwiki/operations.md
- [x] #3 Repository suites pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1 delivered in this Change (PR #87): CONCEPTS.md's agent-messaging entry narrowed to the landed skill and the work-order and completion-envelope entries added, word-for-word aligned with skills/agent-messaging and skills/delegate-batch on load-bearing phrases; one policy pin per entry; independent review APPROVE with pins verified. AC2 delivered through the maintainer flow (PR #88): assigned qq-openwiki --update in the openwiki/update worktree removed the deleted activation chain (-401 lines) and the obsolete guarded-merge BPMN bundle; refresh review found three skill-contradiction defects, corrected via qq-openwiki --correct and the delta re-reviewed PASS; docs-only diff verified. AC3: shell suite 7/7 PASS and BPMN 16 pass/0 fail/2 skipped on this Change's head, owner-run outside the codex sandbox. Both halves implemented by delegates (gpt-5.6-sol worker under delegate-batch; OpenWiki generator under the maintainer procedure); envelopes and generator output verified against the trees. Done records the agreed work complete; operator merge dispositions pending on PRs #87 and #88.
<!-- SECTION:NOTES:END -->
