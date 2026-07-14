---
id: TASK-37
title: Give agents a dedicated machine identity for merges
status: To Do
assignee: []
created_date: '2026-07-14 17:39'
updated_date: '2026-07-14 17:49'
labels: []
dependencies:
  - TASK-36
documentation:
  - doc-38
  - doc-39
priority: medium
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Carries the agent-credential separation that TASK-36 deferred by operator decision (2026-07-14): make agent-issued merges rejectable by GitHub itself. Today every credential on the operator's machine — gh token and SSH key — authenticates as the operator's own admin account (qqp-dev), so GitHub cannot distinguish an agent's merge from the operator's. The stale abacus-git keyring alias was investigated and removed: it was an old name of the same account (id 287262891), not a second identity.

Plan: the operator creates a dedicated machine account (GitHub ToS allows one free machine account alongside a personal account; ~3 minutes in a browser). Then, agent-side: invite it as a write-only collaborator and accept, register an SSH key for it, switch this machine's gh active account and git push identity to it, and add a second ruleset on main restricting ref updates so the machine account cannot merge while the operator merges in the browser. The existing ruleset 18942749 (PR + green checks, no bypass) stays as-is; no rework needed.

Bypass-scope decision for the implementer: ruleset bypass lists cannot name individual user accounts, only roles, teams, and apps. A repository-admin bypass treats all three admin accounts (qqp-dev, hypermemetic, sshmendez) as operator-side merge actors; restricting merges to the single operator account requires an organization team containing only qqp-dev as the bypass actor. Either choice separates agents from operators; settle the human-side scope with the operator at alignment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent sessions on this machine authenticate to GitHub as the machine account, not the operator account
- [ ] #2 A merge attempt with agent-held credentials is rejected by GitHub (verified against a real pull request)
- [ ] #3 The operator can still merge in the browser and admins remain subject to the PR-plus-green-checks ruleset
<!-- AC:END -->
