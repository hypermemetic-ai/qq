---
id: TASK-1
title: Adopt the document stack
status: In Progress
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 14:41'
labels: []
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retire Understand-Anything (untrack .understand-anything/, drop plugin refs), rewrite methodology to the settled stack (codebase-memory MCP / backlog / openwiki / compound) and the single all-gated landing path, wire gate checks (registry check on test, openwiki refresh on format), seed this registry. Lands as feat/document-stack.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No tracked .understand-anything/ and no plugin references in README/methodology/install
- [ ] #2 Gate refuses a landing that does not touch backlog/ (once config is on main)
- [x] #3 Methodology documents the four-document stack and the herdr agent-comms primitives
<!-- AC:END -->
