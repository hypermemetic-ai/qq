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
   Retain the response's workspace id and checkout path. Immediately run
   `qq-herdr-pull --workspace <workspace-id>` from the accountable agent pane;
   it safely no-ops when that pane is already there and otherwise refuses any
   target except the workspace's sole idle shell placeholder. Stop before
   Repository mutation if adoption fails. Moving a live terminal does not
   change the agent process's working directory, so run every subsequent tool
   in `<checkout-path>` (or use `git -C <checkout-path>`) and verify that path's
   top level before editing. Treat the returned workspace and checkout as the
   Change's home. Return to alignment before acting on any new consequential
   decision.
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
9. Never merge the pull request. After browser visibility is established, start
   a three-minute monitoring window and poll its state at reasonable intervals
   until it is merged or closed, or the full three minutes elapse. A still-open
   poll is not a stopping condition. If it remains open when the full window
   elapses, report the URL and current Checks, then stop.
10. If the operator merges during that window or later resumes the work, fetch
   and reinspect the pull request with step 7's fields. Verify its landed state,
   including that `.mergeCommit.oid` is reachable from freshly fetched
   `origin/main` using
   `git merge-base --is-ancestor <merge-commit> origin/main`. Do not alter the
   completed Task or open a Task-finalization Change. If the operator closes or
   rejects it, report that disposition and apply step 6.
11. After a merged disposition is verified, synchronize the local checkout that
   `git worktree list --porcelain` registers for `refs/heads/main`; fetch alone
   does not update its working tree or a standing Backlog board. Require exactly
   one such checkout, its symbolic `HEAD` still on `refs/heads/main`, and an
   empty `git status --porcelain --untracked-files=all`. Establish exclusive use
   of that checkout for the checks and integration; if another Actor may change
   its branch or working tree, refuse synchronization. If discovery or an
   initial gate fails, report the observed registrations, checkout path when
   available, branch, status, `.mergeCommit.oid`, local `HEAD` when available,
   and `origin/main`, then stop without creating a checkout, repairing its
   registration, or fetching from it. Only after the initial gates pass, run
   `git -C <main-checkout> fetch origin main`, repeat the branch and cleanliness
   checks, and capture `git -C <main-checkout> rev-parse origin/main` as an
   immutable `<target-main>`. Before mutation, require both
   `git -C <main-checkout> merge-base --is-ancestor HEAD <target-main>` and
   the merge commit ancestry check against `<target-main>` to pass:
   `git -C <main-checkout> merge-base --is-ancestor <merge-commit> <target-main>`.
   If any condition fails, report the same evidence plus `<target-main>` and the
   merge-base when ancestry fails, without switching branches, stashing,
   cleaning, resetting, pulling, or otherwise changing its local branch or
   working tree. Otherwise integrate only the validated object with
   `git -C <main-checkout> merge --ff-only <target-main>`; do not merge the
   mutable `origin/main` ref or use `pull`. Repeat the branch and cleanliness
   checks, require its `HEAD` to equal `<target-main>` exactly, and require
   `git -C <main-checkout> merge-base --is-ancestor <merge-commit> HEAD` to pass
   before reporting the final SHAs. Do not claim post-merge synchronization
   complete on any failed final check. A refused or failed synchronization is
   remaining work: retain the Change checkout and resume after the blocking
   primary-checkout state is resolved.
12. After a terminal disposition leaves no further work in this Change, remove
   an ephemeral checkout only when its worktree is clean. If the accountable
   pane still occupies that workspace, require it to be the workspace's only
   pane, then leave a disposable keeper behind with `herdr pane split
   <current-pane> --direction right --cwd <change-checkout> --no-focus`; verify
   the returned pane is an idle shell in the Change workspace. Move the
   accountable pane into a new tab of the validated primary workspace with
   `herdr pane move <current-pane> --new-tab --workspace
   <primary-workspace-id> --focus`; require `.result.move_result.changed` to be
   true, the returned pane to belong to the primary workspace, and the Change
   workspace to remain open around the keeper. Anchor later tools in the
   primary checkout before continuing. Then run
   `herdr worktree remove --workspace <change-workspace-id> --json`; never force
   removal by default or remove the workspace containing the reporting agent.
   Checkout removal does not own branch deletion, and explicitly dedicated
   long-lived worktrees remain in place until their owner retires them.
