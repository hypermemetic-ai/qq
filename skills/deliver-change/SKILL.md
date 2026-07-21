---
name: deliver-change
description: Owns judgment and one-PR GitHub Flow delivery for authorized Repository changes through Task completion, green handoff, verified disposition, and engine-driven retirement. Use only in the operator-facing accountable agent, never for delegated work inside another Actor's Change.
---

# Deliver a Change

Retain scope, decisions, evidence, and delivery state; delegate only bounded
work. `pi-hunk` owns local diff review; GitHub's UI owns Checks and merge. Call
qq engines unconditionally: they own containment, degradation, and rails.

1. Before mutation, require the owning Task Description's **decision ledger**
   to cite what settled every consequential decision—a Backlog decision record,
   approved Task, asked-and-answered exchange, or verbatim operator opt-out—or
   say `none`. Dispositions do not transfer. An uncited decision returns to
   alignment. Mint and cite a decision record when its reach exceeds this
   Change. Confirm branch and worktree isolation.
2. Call `qq-herdr-home inspect --repo <root>`. The Change is born as a plain
   linked worktree from the agreed base; no Herdr workspace is created. The
   Task record lives here: new work is born through Backlog's CLI; legacy
   tracked records are edited on this branch, never primary `main`. Capture
   the approved plan per `grilling`, its doc id cited in the ledger. Dispatch
   from project home; work in checkout. Cockpit attachment never blocks.
3. Implement through one complete work order and `delegate-batch`; verify the
   completion envelope against the tree. Use `research` for decision-grade
   evidence and retain judgment. Run Checks observing the changed behavior.
   In-boundary simplification that shrinks or preserves state space is
   pre-authorized: proceed without realignment and show it in the envelope.
   Boundary changes still align.
4. Run fresh-context `code-review` after local verification for every
   non-trivial Change. Its brief declares trust boundaries beside the threat
   model. Verify findings, fix only confirmed in-scope failures, rerun affected
   Checks, review each fix delta, then present the diff through `pi-hunk`.
5. Commit and push only green units. Open one pull request carrying Task intent
   and Check evidence; pass final GitHub Checks.
6. In its checkout, verify acceptance criteria, summarize, mark Done
   through Backlog's CLI, push finalization, rerun affected Checks, then
   hand off.
7. An unmet criterion reactivates the same Task and Change. If the Change is
   unavailable, align its branch disposition without replacing the Task. A
   later intent change is new work and requires approval.
8. Confirm the open pull request is reviewed, finalized, and green; the gh
   CLI (`gh pr checks`, `gh pr view --json mergeStateStatus,reviewDecision`)
   is the authoritative terminal surface (T-112). Open its resolved URL in the
   operator's browser, send a Herdr notification containing it, and report it.
   Browser and cockpit behavior never block handoff.
9. Never merge; the operator merges. Arm `qq_pr_watch`. Its wake is
   non-load-bearing: after a wake, resume, or operator message, call idempotent
   `qq-change land <pr> --repo <checkout>`.
10. The land engine verifies merge and ancestry and safely fast-forwards the
    sole primary `main` checkout. Exit 2 reports a rail refusal; exit 1 reports
    an error. Stop and retain the Change; repeating the call is safe. A closed
    or rejected Change follows step 7 without altering the completed Task.
11. After landing succeeds, leave focus untouched. When the executing owner
    verifiably owns the Change delegate lifecycle (the default posture; Changes
    carry no work session), call `qq-change retire <change-id> --repo <checkout>
    --branch <branch> --checkout <path> --workspace-absent-owned`. The
    `--placeholder-pane <root-placeholder-pane-id>` form remains for retiring
    legacy work sessions created before this posture. Its idempotent rails own
    clean checkout, merged branch, ownership, topology, and focus; it never
    forces removal. On refusal or error, report state and leave every session,
    checkout, pane, and branch intact. Never force-delete, stash, clean, reset,
    switch, or repair delivery state.
12. Keep the five gates with the accountable owner: intent alignment, plan
    approval, review verdict, acceptance, and merge.
