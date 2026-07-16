---
id: T-12
title: Standardize Change worktrees on Herdr and settle graph topology
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 20:19'
updated_date: '2026-07-12 20:37'
labels: []
dependencies: []
documentation:
  - doc-21
modified_files:
  - skills/deliver-change/SKILL.md
  - >-
    backlog/docs/research/doc-21 -
    Codebase-memory-graph-topology-for-Git-worktrees.md
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adopt Herdr's built-in Git-worktree lifecycle as the local checkout adapter for Change delivery, while keeping Change, branch, pull request, and merge ownership unchanged. Record current upstream evidence on whether codebase-memory should maintain one Repository graph or one path-isolated graph per worktree. No codebase-memory runtime or policy change is authorized until the operator reviews that conclusion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change tells an accountable agent how to create a new Herdr worktree from an explicit agreed base and how to open an existing checkout, using the returned workspace as the Change home
- [x] #2 Cleanup uses Herdr only after disposition and a clean-status check, never forces removal by default, leaves branch deletion separate, and preserves explicitly dedicated long-lived worktrees
- [x] #3 A confidence-tagged research report records upstream codebase-memory guidance and a reasoned recommendation for Repository-versus-worktree graph topology, with no runtime change made implicitly
- [x] #4 Focused Checks and fresh-context review verify the exact post-review Change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create the Change in a Herdr-managed worktree from explicit origin/main. 2. Research primary upstream codebase-memory sources and verify live 0.9.0 behavior. 3. Make the smallest deliver-change wording change that assigns checkout mechanics to Herdr without adding a qq entity or wrapper. 4. Attach one Backlog research report, run focused Checks and fresh-context review, then deliver one green pull request.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created the Change through Herdr from explicit origin/main; Herdr returned workspace wP and reopening the checkout returned already_open=true. Updated deliver-change with explicit-base create, existing-checkout open, returned-workspace ownership, and safe terminal cleanup. Research found explicit maintainer guidance: per-worktree DB identity is deliberate on 0.9.0; the intended future is a canonical base plus worktree overlays. No codebase-memory runtime setting changed.

Focused verification passed: skill-creator quick_validate; git diff --check; exact create/open/remove and safety assertions; live Herdr create/open workspace checks; codebase-memory 0.9.0 ready-status check; TASK/document linkage. A fresh forward test derived the intended Herdr lifecycle without prompting, and fresh-context code review found no material issues in the staged Change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Standardized Change checkout placement on Herdr without adding a qq abstraction: explicit-base creation, existing-checkout adoption, returned-workspace ownership, and clean guarded terminal removal now live in deliver-change. Attached doc-21 with maintainer-backed codebase-memory topology guidance: retain distinct worktree databases on 0.9.0 and wait for the endorsed canonical-base-plus-overlay model. No codebase-memory runtime setting changed. Focused Checks, forward testing, and independent review passed.
<!-- SECTION:FINAL_SUMMARY:END -->
