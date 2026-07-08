---
id: TASK-7
title: Generate the initial openwiki/ wiki
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
labels:
  - blocked
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocked on the operator pasting a real Anthropic API key into ~/.openwiki/.env (config pre-staged 07-08). Then run openwiki --init in qq, review the generated openwiki/, confirm its AGENTS.md injection coexists with ours (or strip it), and land via the gate. After this, bin/qq-openwiki-refresh keeps it fresh at every landing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 openwiki/ exists, reviewed, and tracked; refresh script exercises green on a real landing
<!-- AC:END -->
