---
name: deliver-change
description: Owns judgment and one-PR GitHub Flow delivery for authorized Repository changes through Task completion, green handoff, verified disposition, and engine-driven retirement. Use only in the operator-facing accountable agent, never for delegated work inside another Actor's Change.
---

# Deliver a Change

Retain scope, judgment, decisions, evidence, and delivery state. Give bounded
plans; leave cheap equivalent in-boundary details to implementers. Realign only
for consequential scope/capability/contract/lifecycle/commitment. Present diff
inline; GitHub UI owns Checks and merge. Call qq engines unconditionally for
rails, containment, and degradation. Answer status from record—not a steer—before
recovery; stop steers end investigation. Before merge-ready/done claims, map each
criterion to fresh evidence and perform every available outcome, live
compatibility, and behavior observation before merge. At land, resolve foreign
drift with one preserve-or-restore question, never an operator-input deadlock.

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
5. **Finalize, then PR.** Verify every criterion, summarize, store-commit—not
   branch-commit—Task edits, and push green. Keep Task Active/old-compatible
   until PR merge; normal delivery never completes it first. Open
   one PR with Task intent and Check evidence. Pass final Checks; `gh pr checks`
   and `gh pr view --json mergeStateStatus,reviewDecision` are authoritative.
   Open/report URL and Herdr-notify; UI never blocks. Arm
   `qq_pr_watch`; yield, never poll. Never merge—the operator merges. A Change is
   **created locally** until finalized, then **mergeable now** only when green;
   never say bare "mergeable" or claim an earlier window. An unmet criterion
   keeps the same Task and Change Active; if unavailable, align branch
   disposition. Closed/rejected Changes follow that rule; later intent
   needs approval.
6. **Land, complete, and retire.** After operator merge or any
   wake/resume/message, call idempotent `qq-change land <pr> --repo <checkout>`;
   it verifies merge/ancestry and fast-forwards sole primary `main`. Merge
   normally completes the Task after verification through Backlog's CLI;
   store-commit and push that store edit: target `backlog task complete
   <Task-ID>` moves Active outside the active collection; old stores use their
   compatible terminal/complete sequence. Only an explicitly required
   observation technically impossible before merge keeps the Task Active under
   the same Change Owner until resolution. Routine post-merge Observer learning
   and local cleanup remain owner duties, not completion gates. While the
   worktree lives, assemble/finalize its guided observer package through
   `delegate-batch` with procedure/package paths and `qq-observe recurrence-keys`;
   then call `qq-change retire`. Engines own ancestry, package-finalization,
   lifecycle-ownership, checkout, branch, workspace-absence, topology,
   cleanliness, focus, and bound-run-dir rails.
   On refusal/error, report and preserve every session, checkout, pane, and
   branch; never force-delete, stash, clean, reset, switch, or repair state.
   Keep the five accountable-owner gates: intent alignment, plan approval,
   review verdict, acceptance, and merge.
