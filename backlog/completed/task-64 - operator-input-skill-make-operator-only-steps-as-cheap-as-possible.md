---
id: TASK-64
title: 'operator-input skill: make operator-only steps as cheap as possible'
status: Done
assignee: []
created_date: '2026-07-16 19:14'
updated_date: '2026-07-16 19:24'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-16 13:57): work sometimes needs operator input — visiting websites, answering questions, copy-pasting values, updating configuration. Add a new Skill (skills/operator-input/SKILL.md) that governs how an agent hands such steps to the operator, minimizing operator effort even at high background cost to the agent.

Trigger: whenever the agent must hand a step to the operator because it cannot or may not perform it itself (logins/auth walls, browser-only actions, operator-held values, machine/account changes, facts only the operator knows). Doctrine (operator-aligned): self-service first; batch operator steps into one handoff; minimize each step to the smallest feasible operator action (principle, not a rigid single-click rule); bring the surface to the operator rather than sending them off with instructions — for secrets, pre-stage the destination (e.g. open the env file at the paste point) so values need not transit the transcript, and flag exposure when they do. Boundary: grilling keeps alignment decisions, uat-signoff keeps acceptance checks; no installer changes, no notification mandate, no rewrites of other skills, no openwiki edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 skills/operator-input/SKILL.md exists with sibling-convention frontmatter (name, trigger-bearing description) and covers all four aligned doctrine points plus the secrets stance
- [x] #2 The skill states its boundary: alignment decisions stay with grilling, acceptance checks stay with uat-signoff
- [x] #3 bin/install.sh picks the skill up unchanged and reports linked: skill/operator-input
- [x] #4 Shell test suite passes (CI shell-tests green)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft SKILL.md per aligned doctrine, matching sibling tone/format. 2. Run bin/install.sh and the shell test suite. 3. code-review; fix confirmed in-scope findings. 4. PR through GitHub Flow.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Codex-first delegate authored the skill within aligned bounds; owner verified the envelope against the tree. Doctrine order and boundary paragraph as aligned; secrets guidance adds place-without-repeating on transcript exposure (delegate decision, owner-accepted). Local suite 8/8 green; sandboxed install links skill/operator-input for both destinations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
skills/operator-input/SKILL.md added: governs operator-only steps (auth walls, browser-only actions, operator-held values/facts) with doctrine self-service first, batch into one handoff, minimize each step (principle, not rigid rule), bring the surface to the operator; secrets pre-staged to their destination without transiting the transcript, exposure flagged otherwise. Boundary: grilling keeps alignment decisions, uat-signoff keeps acceptance checks. Installer picks it up unchanged; full shell suite green; fresh-context review verdict: pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
