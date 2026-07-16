---
id: TASK-37
title: Give agents a dedicated machine identity for merges
status: Done
assignee: []
created_date: '2026-07-14 17:39'
updated_date: '2026-07-15 23:37'
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
- [x] #1 Agent sessions on this machine authenticate to GitHub as the machine account, not the operator account
- [x] #2 A merge attempt with agent-held credentials is rejected by GitHub (verified against a real pull request)
- [x] #3 The operator can still merge in the browser and admins remain subject to the PR-plus-green-checks ruleset
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented 2026-07-15/16. Machine account qqp-bot (id 305644191) created by operator; invited as write collaborator and accepted; gh device-flow auth captured agent-side (scopes repo, read:org, admin:public_key, workflow; token stored in gh keyring, temp file shredded). Dedicated SSH key ~/.ssh/qqp-bot registered (key id 157418022); repo core.sshCommand pins it (applies to all worktrees), ssh -T answers 'Hi qqp-bot!'; gh active account qqp-bot. New ruleset 19016968 'main: ref updates by operators only' (active, update rule, bypass: repository admins) alongside untouched 18942749. AC2 evidence on scratch PR #92 (closed unmerged, branch deleted): API merge attempt as qqp-bot with green checks -> HTTP 405 'Cannot update this protected ref'; direct push to main -> GH013 remote rejection. AC3: 18942749 verified unchanged; qqp-dev retains admin bypass; the operator's browser merge of this finalization PR is the live re-proof. Bypass scope decision (operator, 2026-07-15): repository-admin role, not a single-account team. Note: merge-rejection probe used the pulls/merge API deliberately, expecting rejection — the guarded 'gh pr merge' idiom was not used.

Mechanism correction (2026-07-16, after operator hit 'unable to merge' on PR 93): the ruleset 'update' rule blocks the PR merge box even for bypass actors — mergeStateStatus stayed BLOCKED for qqp-dev under both bypass_mode always and pull_request, despite current_user_can_bypass=always. Ruleset 19016968 was deleted and replaced by classic branch protection on main restricting pushes to the three admin accounts (qqp-dev, hypermemetic, sshmendez — same operator-decided scope); ruleset 18942749 unchanged. With the restriction in place, qqp-dev's merge state is CLEAN. AC2 re-verified under the final mechanism on scratch PR #94 (closed unmerged): green checks, API merge as qqp-bot -> HTTP 405 'You're not authorized to push to this branch.'
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agents on this machine now authenticate to GitHub as the dedicated machine account qqp-bot, and GitHub itself rejects agent-credential merges. Delivered: operator-created qqp-bot as write collaborator; agent-side device-flow auth, dedicated SSH key, repo-pinned push identity, gh active-account switch; and classic branch protection on main restricting pushes/merges to the three admin accounts (operator-decided scope) alongside the unchanged PR-plus-green-checks ruleset 18942749. A ruleset-based update restriction was tried first and abandoned: its rule blocks the merge box even for bypass actors (operator UX failure observed live on this PR). Verified: SSH and gh identify as qqp-bot; merge attempts with agent credentials on green scratch PRs #92 and #94 returned HTTP 405 under each mechanism respectively; direct push rejected (GH013); operator merge state CLEAN, re-proven by this PR's own merge.
<!-- SECTION:FINAL_SUMMARY:END -->
