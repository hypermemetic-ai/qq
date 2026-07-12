---
name: deliver-change
description: Owns GitHub Flow delivery for every authorized Repository modification intended to land, from an aligned assignment through a green pull request and verified operator merge. Use only in the operator-facing accountable agent after alignment; do not use for read-only work, explicitly local experiments, or delegated research, implementation, or review within a Change another agent owns.
---

# Deliver a Change

Retain responsibility for scope, decisions, evidence, and delivery state. Give
delegated agents bounded assignments; do not hand them this lifecycle.

1. Bind the Change to the agreed outcome and current Repository state. Follow
   Backlog's task-execution instructions for Task operations, and confirm that
   the branch or worktree isolates this Change from unrelated work. Return to
   alignment before acting on any new consequential decision.
2. Implement and verify coherent units. When a decision needs durable,
   multi-source evidence, delegate that question through `research` and retain
   the judgment. Keep the Task aligned through the Backlog CLI and run the
   local Checks that observe the changed behavior.
3. After implementation and local verification, run `code-review` for every
   non-trivial Change before committing or publishing it. Verify its findings,
   resolve only confirmed in-scope issues, and rerun affected Checks.
4. Commit only green units, push each green commit, and open a pull request
   that carries the Task intent and Check evidence. Pass the Repository's final
   GitHub Checks.
5. When the pull request is green and reviewed, open its merge page for the
   operator and watch its state for up to three minutes. Never merge it. If it
   remains open, report the URL and current Checks, then stop without marking
   the Task Done.
6. If the operator merges during that window or later resumes the work, verify
   that the Change landed before following Backlog's task-finalization
   instructions and marking the Task Done.
