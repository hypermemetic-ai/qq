---
id: T-168
title: Retire compound
status: In Progress
assignee: []
created_date: '2026-07-27 03:44'
updated_date: '2026-07-27 03:53'
labels: []
dependencies: []
type: chore
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retire the compound Skill because Observer Architect now owns the useful synthesis and routing behavior. Remove the Skill and every reference from current-system surfaces; leave historical Backlog records unchanged.

## Decision ledger

- Retire `compound`, remove its current-system references, rely on Observer Architect instead, and preserve history — operator direction in this exchange, verbatim: “-- Ah. very straightforward change that doesn't need to be explained at all. we completely retire compound. inter the observer architect does what it was trying to do so much better. so let's remove it and any references to it in the current system. Of course history doesn't have to change.”
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `compound` Skill no longer exists.
- [ ] #2 No current-system source, documentation, or configuration file outside Backlog records references `compound`; historical Backlog records remain unchanged.
- [ ] #3 Current Skill guidance identifies Observer Architect without adding a replacement knowledge-capture ceremony.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete `skills/compound/SKILL.md`.
2. Remove or replace current-system references in canonical vocabulary, current OpenWiki guidance, and live configuration comments while leaving `backlog/` history untouched.
3. Verify the Skill set and grep for non-historical references; run focused repository checks and diff validation.
<!-- SECTION:PLAN:END -->
