---
id: T-71
title: >-
  Declare the qq glossary canonical and give linked Repositories a local
  appendix
status: In Progress
assignee: []
created_date: '2026-07-17 02:32'
updated_date: '2026-07-17 02:32'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction 2026-07-16: the qq glossary is canonical; linked projects need a way to append their own vocabulary. Mechanism (consistent with the AGENTS.md symlink precedent and the by-construction principle): a linked Repository symlinks CONCEPTS.md to qq's canonical glossary and appends project vocabulary in a root CONCEPTS.local.md; local files never redefine canonical terms. Motivating drift: deciq's CONCEPTS.md holds only project terms, so agents there never see the canonical vocabulary the shared skills are written in (Actor, Change, Check, green, work order, ...). qq side of the mechanism: CONCEPTS.md preamble declares canonical scope and the appendix rule; the shared AGENTS.md instructs reading CONCEPTS.local.md where present. Adoption by deciq is separate follow-on work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CONCEPTS.md's preamble states the glossary is the canonical shared language for qq and every linked Repository, and defines the CONCEPTS.local.md appendix rule (append project vocabulary; never redefine canonical terms)
- [ ] #2 AGENTS.md's Context section instructs: read CONCEPTS.md and, where present, CONCEPTS.local.md as the Repository's appended vocabulary
- [ ] #3 All tests/test-*.sh pass (several assert exact strings in CONCEPTS.md and AGENTS.md-adjacent files)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. CONCEPTS.md preamble: declare canonical scope for qq and linked Repositories; add the CONCEPTS.local.md appendix rule (append, never redefine). Leave every term definition untouched (tests grep exact strings).
2. AGENTS.md Context section: after 'Read CONCEPTS.md before working and use its vocabulary.', add the where-present CONCEPTS.local.md sentence.
3. Checks: all tests/test-*.sh; grep the exact strings tests assert in CONCEPTS.md remain.
4. code-review; commit; PR.
<!-- SECTION:PLAN:END -->
