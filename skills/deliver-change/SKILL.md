---
name: deliver-change
description: Owns one-PR GitHub Flow delivery for every authorized Repository modification intended to land, from an aligned assignment through Task completion, a green pull-request handoff, and verification of the operator's disposition. Use only in the operator-facing accountable agent after alignment; do not use for read-only work, explicitly local experiments, or delegated research, implementation, or review within a Change another agent owns.
---

# Deliver a Change

Retain responsibility for scope, decisions, evidence, and delivery state. Give
delegated agents bounded assignments; do not hand them this lifecycle.

1. Bind the Change to the agreed outcome and current Repository state. Follow
   Backlog's task-execution instructions for Task operations, and confirm that
   the branch or worktree isolates this Change from unrelated work. When a new
   checkout is needed, resolve the Repository root and an explicitly agreed,
   freshly fetched base, then run
   `herdr worktree create --cwd <root> --branch <branch> --base <base> --no-focus --json`;
   never omit `--base` and inherit an incidental `HEAD`. When the checkout
   already exists, attach it with
   `herdr worktree open --cwd <root> --path <absolute-path> --no-focus --json`.
   Treat the returned workspace as the Change's home for its panes and agents.
   Return to alignment before acting on any new consequential decision.
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
7. When the pull request is green, reviewed, and finalized, inspect it with
   `gh pr view <number-or-URL> --json state,mergedAt,mergeable,mergeStateStatus,statusCheckRollup,url`.
   Do not guess JSON field names; correct any rejected query before handoff.
   Confirm it is still open and unmerged with applicable Checks green, and set
   `url` to the returned `.url` value.
8. Open the resolved URL in the operator's graphical browser through a process
   that survives the tool call. In a Linux tool shell that reaps ordinary
   descendants, first confirm the graphical environment and available commands,
   then use `setsid -f xdg-open "$url" >/dev/null 2>&1`; otherwise use the
   runtime's durable native opener. Confirm that the PR-specific page remains
   visible after the launching call has returned, using later window observation
   and `uat-signoff` when operator confirmation is required. Dispatch, a printed
   URL, or momentary appearance is not visibility. If persistent visibility is
   not confirmed, retry once through a durable opener, report the URL, and stop.
9. Never merge the pull request. After browser visibility is established, watch
   its state for up to three minutes. If it remains open, report the URL and
   current Checks, then stop.
10. If the operator merges during that window or later resumes the work, fetch
   and verify the pull request's landed state, then report its merge evidence.
   Do not alter the completed Task or open a Task-finalization Change. If the
   operator closes or rejects it, report that disposition and apply step 6.
   After a terminal disposition leaves no further work in this Change, remove
   an ephemeral checkout only when its worktree is clean, using
   `herdr worktree remove --workspace <workspace-id> --json`; never force
   removal by default. Checkout removal does not own branch deletion, and
   explicitly dedicated long-lived worktrees remain in place until their owner
   retires them.
