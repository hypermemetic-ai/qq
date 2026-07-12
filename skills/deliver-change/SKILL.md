---
name: deliver-change
description: Owns one-PR GitHub Flow delivery for every authorized Repository modification intended to land, from an aligned assignment through Task completion, a green pull-request handoff, and verification of the operator's disposition. Use only in the operator-facing accountable agent after alignment; do not use for read-only work, explicitly local experiments, or delegated research, implementation, or review within a Change another agent owns.
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
5. Before the final merge handoff, follow Backlog's task-finalization
   instructions inside this Change: verify the acceptance criteria, record the
   final summary, mark the Task Done, and push that finalization through the
   same pull request. Rerun Checks affected by the final commit. Done records
   that the agreed Task work is complete; it does not claim that the operator
   accepted or landed its Change.
6. If a Check or operator feedback shows that an existing acceptance criterion
   is unmet, return the same Task to an active status and correct it in this
   Change while its pull request remains open. If that Change is already
   closed or unavailable, realign its branch disposition without replacing
   the Task; the unmet criterion is not new work. If completed work is
   declined because the operator's intent changed or grew, leave the Task Done
   and do not absorb that new commitment: create follow-up work only with
   approval.
7. When the pull request is green, reviewed, and finalized, resolve its URL and
   run `gh pr view <number-or-URL> --web` from the operator's graphical
   session. A successful command proves browser dispatch, not visibility:
   report the URL and use `uat-signoff` when the page itself must be observed.
   Never treat printing the URL as opening the page. If dispatch fails, report
   the failure and URL. Never merge the pull request. Watch its state for up to
   three minutes; if it remains open, report the URL and current Checks, then
   stop.
8. If the operator merges during that window or later resumes the work, fetch
   and verify the pull request's landed state, then report its merge evidence.
   Do not alter the completed Task or open a Task-finalization Change. If the
   operator closes or rejects it, report that disposition and apply step 6.
