---
id: TASK-36
title: Enforce the merge mandate at the resource layer
status: Done
assignee: []
created_date: '2026-07-14 17:04'
updated_date: '2026-07-14 17:53'
labels: []
dependencies: []
documentation:
  - doc-38
  - doc-39
priority: high
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per the doc-39 enforcement-layer lesson: the exact enforcement of "only the operator merges" belongs at the resource that owns the invariant, not in string parsing. Enable branch protection on main (pull request required, direct pushes rejected, CI checks required before merge) and formally reclassify bin/qq-claude-guard as a drift-net per CONCEPTS.md — declared threat model, lexer-arcana finding classes owner-declined by default. The guard keeps its fast-local-feedback role unchanged.

Descoped at alignment (2026-07-14, operator decision): establishing that agent-held credentials cannot merge pull requests requires an agent identity GitHub can distinguish from the operator's; every credential on this machine is the operator's own admin account. That responsibility moved to TASK-37 (dedicated machine account plus merge-actor ruleset).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 main requires a pull request with passing CI checks and rejects direct pushes
- [x] #2 The guard's drift-net role, threat model, and declined finding classes are documented in the guard and doc-39 is linked from doc-38
- [x] #3 The operator-approved deferral of agent-credential merge separation is recorded as follow-up TASK-37 carrying the machine-account and merge-actor-ruleset spec
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Alignment (2026-07-14): operator chose protection-only enforcement now, deferring agent-credential separation. Investigation found every credential on this machine (gh token, SSH key) authenticates as the operator's own admin account qqp-dev; the second keyring entry "abacus-git" was the same account (id 287262891) under its pre-rename name — the GitHub account no longer exists under that login. The stale alias was removed from the keyring with the operator's approval. Because agent and operator are indistinguishable to GitHub today, AC "agent-held credentials cannot merge" is unachievable without a new identity; deferred to TASK-37 (machine account plus a merge-actor ruleset whose bypass scope — repository admins versus a single-operator team — is settled with the operator at TASK-37 alignment).

Resource-layer enforcement delivered: GitHub ruleset id 18942749, "main: pull request with green checks", enforcement active, targeting the default branch, bypass list empty (admins included). Rules: deletion blocked, non-fast-forward blocked, pull_request required (0 approvals, all merge methods), required status checks bpmn-tests and shell-tests pinned to GitHub Actions (integration 15368), strict up-to-date policy off (out-of-order merges stay possible; lesson from the PR #78/#79 conflict). Verified live by API read of rules/branches/main and by a real probe: an empty-commit direct push was rejected with GH013 "Changes must be made through a pull request" and "2 of 2 required status checks are expected"; local main reset clean afterward.

Documentation delivered in this Change: bin/qq-claude-guard module docstring now declares the drift-net role per mandate — Bash command-string inspection (approximate lexing) for merges; structured edit-tool path checks for managed Backlog markdown — the resource layer that owns exact enforcement, and the owner-declined finding classes (adversarial obfuscation; lexer arcana such as case-pattern parentheses in command substitution or a quoted redirection operator as option value; shell-mediated writes to managed markdown, whose provenance no current layer enforces). doc-38 gained an Amendments section linking doc-39 and recording the reclassification and the deferral.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resource-layer enforcement live: GitHub ruleset 18942749 on main (PR required, green bpmn-tests/shell-tests pinned to Actions, no bypass — admins included; deletion and force-push blocked; strict up-to-date off), verified by a rejected direct-push probe (GH013). Guard reclassified as a drift-net: per-mandate threat model and owner-declined finding classes documented in its module docstring; doc-38 links doc-39 via an Amendments section. Agent-credential separation descoped by operator decision to TASK-37 (machine account; bypass scope settled at its alignment). Stale abacus-git keyring alias (pre-rename name of the operator's own account) removed. Change reviewed fresh-context: two FIX-FIRST rounds (record contradictions, threat-model overclaims) fixed and delta-reviewed to SHIP.
<!-- SECTION:FINAL_SUMMARY:END -->
