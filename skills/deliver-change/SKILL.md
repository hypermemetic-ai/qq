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
   response. Select an agent-chosen, operator-renameable `<change-label>` as a
   recognizable UI handle matching `[A-Za-z0-9-]{1,15}`, unique among work
   sessions under this home. Labels are independent of branch and Task
   cardinality; use a Task id only when it genuinely identifies the Change,
   never from an inferred one-to-one mapping. Inspect the home's sibling work
   sessions and reject a duplicate label for any other checkout. Attach an
   existing Change checkout by default, including harness-created worktrees,
   with `herdr worktree open --workspace <home-workspace-id> --path
   <absolute-path> --label "<change-label>" --no-focus --json`. Only when no
   checkout exists, use creation as the fallback: resolve an explicitly agreed,
   freshly fetched base and run `herdr worktree create --workspace
   <home-workspace-id> --branch <branch> --base <base> --label "<change-label>"
   --no-focus --json`; never omit `--base` and inherit an incidental `HEAD`.
   Require the returned workspace to be a linked worktree for the same
   Repository with `.label` equal to `<change-label>`, and retain its workspace
   id and checkout path. Immediately run
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
2. Implement and verify coherent units, with execution codex-first: within
   plan bounds, compose one work-order brief for this Change's bounded
   implementation and dispatch it per delegate-batch's "Dispatch codex-first"
   section, pointing the runner at this Change's checkout, then verify the
   completion envelope against the tree before treating any claim as evidence.
   Use a Claude subagent instead only when the assignment needs harness-native
   tools or judgment beyond the plan's bounds; composing plans, briefs, and
   verdicts stays with the accountable session. When a decision needs durable,
   multi-source evidence, delegate that question through `research` and retain
   the judgment. Keep the Task aligned through the Backlog CLI in the primary
   `main` checkout, where the record lives until finalization under the
   hybrid Task-truth convention (doc-48) so the board renders in-flight
   truth, and run the local Checks that observe the changed behavior.
3. After implementation and local verification, run `code-review` for every
   non-trivial Change before committing or publishing it. Verify its findings,
   resolve only confirmed in-scope issues, and rerun affected Checks.
4. Commit only green units, push each green commit, and open a pull request
   that carries the Task intent and Check evidence. Pass the Repository's final
   GitHub Checks.
5. Before the final merge handoff, first move the Task record from the
   primary checkout's working tree into this Change's checkout — the hybrid
   convention's single move (doc-48) — then follow Backlog's
   task-finalization instructions inside this Change: verify the acceptance
   criteria, record the final summary, mark the Task Done, and push that
   finalization through the same pull request. Rerun Checks affected by the final commit. Done records
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
9. Never merge the pull request. After browser visibility is established, run
   `herdr notification show "Pull request ready" --body "$url" --sound request`
   (or the runtime's equivalent) and verify that its result confirms it was
   shown. If the command fails or reports notifications disabled or not shown,
   plainly report the browser-only fallback and do not claim a notification was
   sent. Report the URL either way. After reporting it, arm a harness-native
   background disposition watch using no owned machinery: a single-notification
   `until` loop that uses the GitHub CLI to poll the pull request state every 5
   seconds, exits on either `MERGED` or `CLOSED`, and emits exactly one
   completion notification to wake the agent for these post-merge steps and any
   follow-on dispatch. Cover both terminal states; silence is not success. The
   watch replaces waiting for an operator message. Then stop.
10. On a disposition-watch wake, later resume, or operator message, reinspect
   the pull request with step 7's fields. Proceed only after verifying its
   merged state and that
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
12. After a terminal disposition leaves no further work in this Change,
   leave operator focus untouched. The disposition watch's completion
   notification is the only end-of-Change
   signal; changing operator focus is never part of ending a Change. Retire the
   Change at source only after steps 10–11 have verified a merged disposition
   and synchronized the primary `main` checkout. For any other terminal
   disposition, report it and leave the accountable pane, every other pane and
   tab, the work session, checkout, and branch intact for inspection. Do not
   focus, move, or close any tab or pane, do not run `qq-herdr-home
   focus-board`, and do not invoke `herdr worktree remove` or `git worktree
   remove`; the operator explicitly retires that work session and checkout.

   Before retiring a verified merged Change, check these rails in order against
   observable evidence:
   1. Run `git worktree list --porcelain` for this Repository. Require the
      Change checkout to be a registered linked worktree, and require its
      canonical path identity to differ from the step-11 `<main-checkout>`.
   2. Require `git -C <checkout> status --porcelain
      --untracked-files=all` to be empty.
   3. Freshly fetch `origin/main`, resolve the Change's `<branch>` and branch
      tip, and require `git merge-base --is-ancestor <branch-tip>
      origin/main` to succeed. Require the checkout's `HEAD` to be attached
      to that same `<branch>`: `git -C <checkout> symbolic-ref -q HEAD` must
      return `refs/heads/<branch>`; a detached or re-switched checkout trips
      the rail, because mergedness was proven for the branch, not for what
      the checkout now holds. Delete the branch later only with `git branch
      -d`, never `-D`, so Git independently re-enforces mergedness.
   4. If a Herdr work session exists for the Change, scope `herdr api snapshot`
      and `herdr pane list --workspace <work-session-id>` to it. Require no live
      agent there other than this executing session in migrated posture; in
      board-driven dispatch, where the dispatcher pane is already in the
      project home, require no live agent there at all. Require the snapshot's
      focused workspace to differ from `<work-session-id>`: retiring a work
      session the operator is looking at would move operator focus, which
      ending a Change never does.
   5. For an existing work session, require exactly one tab and a pane census
      containing only what this Change created: the root placeholder pane
      and/or the accountable pane. Treat every
      unexplained pane or tab as operator-created and trip the rail; never close
      operator-created panes or tabs. If no work session exists, rails 4–5 have
      no subject; instead require evidence that this executing session owns the
      Change's delegate lifecycle, its completion wake has fired, and no other
      Actor was given the checkout.

   If any rail trips or its evidence cannot be resolved, report the observed
   state and do nothing else. Leave any work session, all panes and tabs, the
   checkout, and the branch intact. Do not focus, move, or close any tab or
   pane, do not run `qq-herdr-home focus-board`, and do not invoke `herdr
   worktree remove` or `git worktree remove`.

   Only with every rail green, retire in this order:
   a. In migrated posture, if this executing session's own accountable pane is
      inside the work session, first run `herdr pane move <own-pane-id> --tab
      <home-board-or-general-tab-id> --split right --no-focus`. Resolve the
      destination tab from the step-1 `qq-herdr-home inspect` result retained
      for this Change, then re-resolve the calling terminal's live pane, tab,
      and workspace ids and require them to prove the move into the project
      home without changing operator focus. This is the sole deliberate
      exception to the no-pane-move ending rule: it moves only the executing
      session's own pane and uses `--no-focus`. In board-driven dispatch the
      pane is already home; when the work session is absent there is no pane to
      move from it; skip this move in either case.
   b. If the work session exists, run `herdr worktree remove --workspace
      <work-session-id>` without `--force`. If it is absent, run `git worktree
      remove <checkout-path>` without `--force`. If either command refuses,
      report the observed state and stop; never retry with force.
   c. Run `git -C <main-checkout> branch -d <branch>`; never use `-D`.
      Do not perform a closing focus move.
