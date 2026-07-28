---
name: deliver-change
description: Internal one-PR GitHub Flow execution; the aligner retains operator judgment and dispositions.
---

# Deliver a Change

Retain scope, decisions, evidence, and delivery state; delegate only bounded
work. Project findings to the aligner through the typed broker, never directly
to the operator. GitHub owns Checks and merge; qq engines own workflow rails.

1. Before mutation, require the owning Task Description's **decision ledger**
   to cite what settled every consequential decision—a Backlog decision record,
   approved Task, asked-and-answered exchange, or verbatim opt-out—or say
   `none`. Dispositions do not transfer; uncited decisions return to alignment.
   Cite a decision record for broader reach. Confirm branch/worktree isolation.
2. Call `qq-herdr-home inspect --repo <root>`. The Change is born as a plain
   linked worktree from the agreed base; no Herdr workspace is created. The
   Task record lives here: new work is born through Backlog's CLI; legacy
   tracked records are edited on this branch, never primary `main`. Capture
   the approved plan per `grilling`, citing its doc id in the ledger. Dispatch
   from project home; work in checkout. Cockpit attachment never blocks.
3. Implement through one complete work order and `delegate-batch`; verify its
   envelope against the tree. Use `research` for decision-grade evidence. Run
   Checks observing changed behavior. In-boundary state-space shrinkage or
   preservation needs no realignment but appears in the envelope; boundary
   changes align.
4. Run fresh-context `code-review` after local verification for every
   non-trivial Change. Its brief declares trust boundaries beside the threat
   model. Verify findings, fix only confirmed in-scope failures, rerun affected
   Checks, review each fix delta, then present the diff inline.
5. Commit/push only green units. Open one PR with Task intent and Check
   evidence; pass final GitHub Checks.
6. In its checkout, verify criteria, summarize, mark Done through Backlog's CLI,
   push finalization, rerun affected Checks, then hand off.
7. An unmet criterion reactivates the same Task/Change. If unavailable, align
   branch disposition without replacing the Task. Later intent requires
   approval.
8. Confirm the open pull request is reviewed, finalized, and green; the gh
   CLI (`gh pr checks`, `gh pr view --json mergeStateStatus,reviewDecision`)
   is the authoritative terminal surface (T-112). Open its resolved URL in the
   operator's browser, send a Herdr notification containing it, and report it.
   Browser and cockpit behavior never block handoff.
9. Never merge; the operator merges. Arm `qq_pr_watch`. Its wake is
   non-load-bearing: after a wake, resume, or operator message, call idempotent
   `qq-change land <pr> --repo <checkout>`.
10. When this Change came from an Observer accountable-intake handoff, record
    its verified merge after normal land with `qq-observe resolve-task --batch
    <origin-batch-dir> --task <Task-ID> --repo <qq-root>`. A v1 compatibility
    handoff instead uses `--run <origin-run-dir>`. This append-only receipt
    affects Observer resolution only; `OPEN` or closed-unmerged evidence refuses
    and never changes discussion or delivery state.
11. The land engine verifies merge and ancestry and safely fast-forwards the
    sole primary `main` checkout. Exit 2 reports a rail refusal; exit 1 reports
    an error. Stop and retain the Change; repeating the call is safe. A closed
    or rejected Change follows step 7 without altering the completed Task.
12. Before retiring, run `qq-observe assemble` while worktree lives; dispatch
    `observer` async with procedure/package paths, analysis schema, no acceptance;
    continue. On wake run `qq-observe validate-analysis`, then
    `qq-observe finalize --analysis` with trace; failures use
    `qq-observe finalize --failed`. Headless:
    no veto/UAT exception. `qq-observe verify-delivery` reports analyzed, failed,
    uncovered Changes; unhealthy output is advisory, never a merge, land, or
    retirement gate.
13. After landing succeeds, leave focus untouched. When the executing owner
    verifiably owns the Change delegate lifecycle (the default posture; Changes
    carry no work session), call `qq-change retire <change-id> --repo <checkout>
    --branch <branch> --checkout <path> --workspace-absent-owned`. The
    `--placeholder-pane <root-placeholder-pane-id>` form remains for retiring
    legacy work sessions created before this posture. Its idempotent rails own
    clean checkout, merged branch, ownership, topology, and focus; it never
    forces removal. On refusal or error, report state and leave every session,
    checkout, pane, and branch intact. Never force-delete, stash, clean, reset,
    switch, or repair delivery state.
14. Orchestrator owns execution/evidence, the aligner owns operator conversation
    and dispositions, and the operator owns merge. Keep the five gates: intent,
    plan, review, acceptance, and merge.
