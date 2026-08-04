---
name: deliver-change
description: Owns judgment and one-PR GitHub Flow delivery for authorized Repository changes through Task completion, green handoff, verified disposition, and engine-driven retirement. Use only in the operator-facing accountable agent, never for delegated work inside another Actor's Change.
---

# Deliver a Change

Retain scope, judgment, decisions, evidence, and delivery state. Give
implementers bounded plans; leave cheap equivalent in-boundary details to them.
Realign only when gaps add consequential scope, capability, contract, lifecycle,
or commitment. Present diff inline; GitHub UI owns Checks and merge. Call qq
engines unconditionally; they own containment, degradation, and rails. Answer
status from the record, never a steer; give first authoritative status before
recovery tooling; stop steers are terminal, with no new investigation. Before
merge-ready/done claims, perform available live compatibility and
observable-behavior proof and map every acceptance criterion to fresh evidence.
At land, resolve foreign drift through exactly one preserve-or-restore question,
never an operator-input deadlock.

1. **Align.** Require the owning Task's decision ledger to cite what settled
   each consequential decision, or `none`. Dispositions do not transfer;
   uncited decisions realign, and broader reach needs a decision record. For a
   settled decision beyond one Change, mint its Backlog decision record in the
   first encoding Change checkout and pull request—never primary `main`.
   Cite the asked-and-answered exchange until then; switch ledger to record id
   before Task finalization. Ground the plan in the real outcome and important
   uncertainty; choose proportionate, decision-useful evidence before designing
   around consequential assumptions. Confirm branch and worktree isolation.
2. **Born.** Call `qq-herdr-home inspect --repo <root>`. Create the Change as a
   plain linked worktree from the agreed base, with no Herdr workspace.
   Backlog's CLI creates the Change's Task record in decision-28's
   by-construction operator-store; lifecycle edits stay there (commit+push),
   off-branch. Capture the approved plan as a Backlog `plans` document through
   Backlog's CLI and attach it to the Task (`--doc` replaces the list); never
   capture `.pi/plans/` scratch. Cite the plan's doc id in the ledger.
   Dispatch from project home, work in the checkout, and never let cockpit
   attachment block. Transfer an existing aligned Change with
   `/handoff <Task-ID>`; the receiver continues this Skill, and handoff is not
   delegation.
3. **Implement.** The full cycle—one complete work order through
   `delegate-batch`, its run-dir `ENVELOPE.md` verified against the
   tree—applies to every non-trivial Change. A trivial Change the owner
   implements directly, skipping or à-la-carte-ing ceremony pieces as makes
   sense; the bar for trivial is high, and over-firing the full cycle is
   preferred over rationalizing a Change down to it. Use `research` for
   decision-grade evidence. Run Checks that observe changed behavior. Commit
   only green units. In-boundary state-space shrinkage or preservation is
   pre-authorized and reported in the envelope; boundary changes align.
4. **Review.** After local verification, run fresh-context `code-review` for
   every non-trivial Change; skip only a purely mechanical Change—a deletion
   or docs/prose edit, grep/CI-verifiable, with no trust boundary, no operator
   state, and no external side effect. Verify reviewer findings before
   delegating fixes; reject speculative correctness. Fix only confirmed in-scope
   failures, rerun affected Checks, and review every fix delta.
5. **Finalize, then PR.** First verify every acceptance criterion in the
   checkout, summarize the Change, mark its Task Done through Backlog's CLI,
   store-commit—not branch-commit—the status edit, and push the green finalization.
   Then open the one pull request carrying
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
   <checkout>`; it verifies merge and ancestry and fast-forwards the sole
   primary `main`. Assemble and finalize this Change's guided observer package
   while the worktree lives—dispatch the observer through the `delegate-batch`
   contract with the procedure/package paths and the `qq-observe
   recurrence-keys` inventory—then call `qq-change retire`. The engines own
   the refusal semantics: land ancestry, package presence and finalized state,
   lifecycle ownership, checkout, branch, workspace-absence, topology,
   cleanliness, focus, and bound delegate run dirs. On refusal or error,
   report and preserve every session, checkout, pane, and branch; never
   force-delete, stash, clean, reset, switch, or repair delivery state. Keep
   the five accountable-owner gates: intent alignment, plan approval, review
   verdict, acceptance, and merge.
