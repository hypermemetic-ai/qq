---
name: deliver-change
description: Owns judgment and one-PR GitHub Flow delivery for authorized Repository changes through Task completion, green handoff, verified disposition, and engine-driven retirement. Use only in the operator-facing accountable agent, never for delegated work inside another Actor's Change.
---

# Deliver a Change

Retain scope, decisions, evidence, and delivery state; delegate only bounded
work. Diff review is presented inline; GitHub's UI owns Checks and merge. Call
qq engines unconditionally: they own containment, degradation, and rails.
Answer status questions from the record, never with a steer; give the first
authoritative status before any recovery tooling, and treat a stop steer as
terminal with no new investigation. Before any merge-ready word, map every
acceptance criterion to fresh evidence. At land, resolve foreign drift through
exactly one preserve-or-restore question, never an operator-input deadlock.

1. **Align.** Require the owning Task's decision ledger to cite what settled
   every consequential decision per `align`—or say `none`. Dispositions do not
   transfer; an uncited decision returns to alignment, and broader reach needs
   a decision record. Confirm branch and worktree isolation.
2. **Born.** Call `qq-herdr-home inspect --repo <root>`. Create the Change as a
   plain linked worktree from the agreed base, with no Herdr workspace. Create
   its Task record there through Backlog's CLI, never on primary `main`; edit
   any legacy tracked record only on this branch. Capture the approved plan per
   `align` and cite its doc id in the ledger. Dispatch from project home, work
   in the checkout, and never let cockpit attachment block. Transfer an
   existing aligned Change with `/handoff <Task-ID>`; the receiver continues
   this Skill, and handoff is not delegation.
3. **Implement.** Send one complete work order through `delegate-batch` and
   verify its run-dir `ENVELOPE.md` against the tree. Use `research` for
   decision-grade evidence. Run Checks that observe changed behavior. Commit
   only green units. In-boundary state-space shrinkage or preservation is
   pre-authorized and reported in the envelope; boundary changes align.
4. **Review.** After local verification, run fresh-context `code-review` for
   every non-trivial Change with trust boundaries beside the threat model.
   Verify findings, fix only confirmed in-scope failures, rerun affected Checks,
   review every fix delta, and present the diff inline.
5. **Finalize, then PR.** First verify every acceptance criterion in the
   checkout, summarize the Change, mark its Task Done through Backlog's CLI,
   and push the green finalization. Then open the one pull request carrying
   Task intent and Check evidence, pass final GitHub Checks, and use `gh pr
   checks` plus `gh pr view --json mergeStateStatus,reviewDecision` as the
   authoritative terminal surface. Open the resolved URL in the operator's
   browser, send a Herdr notification containing it, and report it; browser and
   cockpit behavior never block handoff. Arm `qq_pr_watch`; while Checks are
   pending, yield to the watch instead of polling. Never merge—the operator
   merges. A Change is **created locally** until finalized and is **mergeable
   now** only when finalized and green; never use bare "mergeable". There is no
   pre-finalization mergeable window. An unmet criterion reactivates the same
   Task and Change; if the Change is unavailable, align its branch disposition
   without replacing the Task. A closed or rejected Change follows the same
   rule, while later intent is new work requiring approval.
6. **Land and retire.** On the operator's merge, and after any watch wake,
   resume, or operator message, call idempotent `qq-change land <pr> --repo
   <checkout>`. Its engine verifies merge and ancestry and safely
   fast-forwards the sole primary `main`; exit 2 is a rail refusal and exit 1
   an error. Stop and preserve the Change; repeating the call is safe. When an
   Observer accountable-intake handoff originated the Change, record the
   verified merge with `qq-observe resolve-task --batch <origin-batch-dir>
   --task <Task-ID> --repo <qq-root>`; v1 compatibility uses `--run
   <origin-run-dir>`. Before retirement, run `qq-observe assemble` while the
   worktree lives, then dispatch
   `<worktree>/bin/qq-delegate run --role observer --cwd <absolute-worktree>
   --brief <absolute-run-dir>/BRIEF.md` with procedure and package paths in its
   brief. The call blocks; validate and finalize its analysis on return; use
   `qq-observe finalize --failed` on analysis failure. `qq-observe
   verify-delivery` remains advisory. Assemble and finalize this guided package
   before calling `qq-change retire`, which refuses while the package is
   absent. Retire only with the executing owner's verified lifecycle ownership
   and the engine's checkout, branch, workspace-absence, topology, cleanliness,
   and focus rails; use the legacy placeholder-pane form only for legacy work
   sessions. On refusal or error, report and preserve every session, checkout,
   pane, and branch; never force-delete, stash, clean, reset, switch, or repair
   delivery state. Keep the five accountable-owner gates: intent alignment,
   plan approval, review verdict, acceptance, and merge.
