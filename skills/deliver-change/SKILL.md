---
name: deliver-change
description: Owns one-PR GitHub Flow delivery for every authorized Repository modification intended to land, from an aligned assignment through Task completion, a green pull-request handoff, and verification of the operator's disposition. Use only in the operator-facing accountable agent after alignment; do not use for read-only work, explicitly local experiments, or delegated research, implementation, or review within a Change another agent owns.
---

# Deliver a Change

Retain responsibility for scope, decisions, evidence, and delivery state. Give
delegated agents bounded assignments; do not hand them this lifecycle.

1. Bind the Change to the agreed outcome and current Repository state. Follow
   Backlog's task-execution instructions for Task operations, and confirm that
   the branch or worktree isolates this Change from unrelated work. Resolve the
   Repository root and run `qq-herdr-home inspect --repo <root>` first. Require
   its sole persistent project home to be the primary `main` checkout with one
   dedicated Backlog-board tab; retain `.home_workspace_id` and the complete
   response. Agree `<change-label>` with the operator as a recognizable UI
   handle matching `[A-Za-z0-9-]{1,15}`, unique among work sessions under this
   home. It is independent of branch and Task cardinality; a Task id may
   be chosen when it genuinely identifies the Change, but is never inferred as
   a one-to-one mapping. Before creating or opening, inspect the home's sibling
   work sessions and reject a duplicate label for any other checkout. When a
   new checkout is needed, resolve an explicitly agreed, freshly fetched base,
   then run `herdr worktree create --workspace <home-workspace-id> --branch
   <branch> --base <base> --label "<change-label>" --no-focus --json`; never
   omit `--base` and inherit an incidental `HEAD`. When the checkout already
   exists, attach it with `herdr worktree open --workspace <home-workspace-id>
   --path <absolute-path> --label "<change-label>" --no-focus --json`. Require
   the returned workspace to be a linked worktree for the same Repository with
   `.label` equal to `<change-label>`, and retain its workspace id and checkout
   path. Immediately run
   `qq-herdr-pull --workspace <workspace-id>` from the accountable agent pane;
   it safely no-ops when that pane is already there and otherwise refuses any
   target except the workspace's sole idle shell placeholder. Stop before
   Repository mutation if adoption fails. Moving a live terminal does not
   change the agent process's working directory, so run every subsequent tool
   in `<checkout-path>` (or use `git -C <checkout-path>`) and verify that path's
   top level before editing. Treat the returned workspace as the Change's work
   session: the current accountable conversation and every Change-specific tab,
   pane, and delegated agent remain there. The project home stays on `main` with
   its board and general-purpose tabs. Return to alignment before acting on any
   new consequential decision.
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
   `gh pr view <number-or-URL> --json state,mergedAt,mergeCommit,mergeable,mergeStateStatus,statusCheckRollup,url`.
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
9. Never merge the pull request. After browser visibility is established, send
   the operator a handoff notification with `herdr notification show "Pull
   request ready" --body "$url" --sound request` (or the runtime's equivalent),
   report the URL, and stop. Proceed to post-merge steps only when the
   operator's merge is observed on a later resume or message.
10. On that later resume or message, reinspect the pull request with step 7's
   fields. Proceed only after verifying its merged state and that
   `.mergeCommit.oid` is reachable from freshly fetched `origin/main` using
   `git merge-base --is-ancestor <merge-commit> origin/main`. Do not alter the
   completed Task or open a Task-finalization Change. If the operator closes or
   rejects it, report that disposition and apply step 6.
11. After a merged disposition is verified, use `git worktree list --porcelain`
   to find the local checkout registered for `refs/heads/main`. Require exactly
   one such checkout, an empty `git status --porcelain --untracked-files=all`,
   and symbolic `HEAD` on `refs/heads/main`. Establish exclusive use of that
   checkout before mutating it—coordinate through agent messaging when another
   Actor may hold it—and refuse synchronization while it is contested. With
   those preconditions satisfied,
   run `git -C <main-checkout> pull --ff-only origin main`, then verify
   `git -C <main-checkout> merge-base --is-ancestor <merge-commit> HEAD`. If
   discovery, a precondition, the pull, or final verification fails, report the
   observed state and stop; never create, switch, stash, clean, reset, or
   otherwise repair the checkout. Retain the Change checkout until the failed
   synchronization can be resumed safely.
12. After a terminal disposition leaves no further work in this Change, leave
   its accountable pane, operator-created panes and tabs, worktree workspace,
   and checkout intact for inspection. Capture the calling terminal's live pane,
   tab, and workspace ids, then run `qq-herdr-home focus-board --repo <root>`.
   Require the returned home and board ids to equal the initial inspection,
   require
   `.focused` to be true, and re-resolve the calling terminal to prove its three
   work-session ids did not change. Do not move the accountable pane into the
   project home, close a retained work pane, or invoke `herdr worktree remove`.
   The operator explicitly retires a completed work session and its checkout;
   focus returns to the synchronized home board without erasing its context.
