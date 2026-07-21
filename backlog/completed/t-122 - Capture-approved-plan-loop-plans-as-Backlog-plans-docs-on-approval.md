---
id: T-122
title: Capture approved plan-loop plans as Backlog plans docs on approval
status: Done
assignee: []
created_date: '2026-07-20 20:37'
updated_date: '2026-07-21 02:07'
labels: []
dependencies:
  - T-88
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction (2026-07-20 project-home session): "plan should probably go under Backlog docs since that's where we put all docs." Shape confirmed by operator ("proceed") in the same exchange.

Two artifacts stay distinct:
- Loop SCRATCH: .pi/plans/ with numbered round snapshots — plan-loop mechanics behind the fail-closed realpath gate; dies with the session. Unchanged.
- The APPROVED plan: a durable knowledge item captured as a Backlog plans document.

Shape:
1. On explicit plan approval, the accountable session captures the final plan as a Backlog plans doc through the Backlog CLI and attaches it to the owning Task (--doc replaces the complete list; it does not append).
2. deliver-change (and grilling's plan-loop pointer) name the capture step and cite the doc id.
3. Scratch rounds are never captured.

Hard constraint: managed Backlog markdown is edited only through the CLI; qq-backlog-guard blocks direct writes, so the plan-loop extension must NOT be repointed at backlog/docs/ — its .pi/plans containment is unchanged.

Decision ledger:
- Plan-capture shape (scratch stays .pi/plans; approved plan -> Backlog plans doc via CLI at approval; rounds never captured): operator direction, asked-and-answered alignment exchange, 2026-07-20 project-home session.
- Capture-sequencing conflict (step-2 capture vs hybrid Task-record convention; review round-1 P1: owning Task record is not checkout-local until step 6) resolved by sequencing T-122 after T-88; the step-2 encoding stands because born-in-worktree makes the record checkout-local from birth: operator decision, asked-and-answered exchange, 2026-07-20 project-home session. Aligns with decision-6's rule for Task-record-lifecycle work landing after enactment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On explicit approval, the final plan is captured as a Backlog plans doc via the CLI and attached to the owning Task; scratch rounds are never captured
- [ ] #2 deliver-change and grilling name the capture step; the plan-loop extension's .pi/plans containment is unchanged
- [ ] #3 Capture path is CLI-only; qq-backlog-guard still blocks direct backlog/ writes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Enactment notes (2026-07-20, recorded at ticketing):
1. Run the capture from the Change checkout, never primary main: attaching the doc edits the Task record and creates backlog/docs/* — primary-main allowed dirt is only untracked backlog/tasks/*, and a tracked in-place edit is what stalled T-95's land rail (decision-6 context).
2. CI prose ratchet (tests/test-ratchet.sh) governs skill word budgets; the deliver-change/grilling capture-step lines re-measure the budget in the same Change (T-119 precedent).
3. backlog doc create supports a docs-relative --path; match the existing plans/research/solutions category naming.

Park state (2026-07-20, review round 1): branch feat/t-122-plan-capture at cea1774, worktree /home/qqp/.herdr/worktrees/qq/feat-t-122-plan-capture, work session w71 (root placeholder pane w71:p1). Verified green pre-park: ratchet 7578 exact, 16/16 tests. Fresh-context review R1 = request-changes (P1 capture-sequencing, confirmed; CLI probe: 'backlog task view t-122' lowercase resolves in primary, record absent from worktree). Resume protocol once T-88 merges: rebase onto new main, confirm step-2 capture is consistent with T-88's enacted text (step-6 transfer deleted), rerun full suite + ratchet, re-review the delta if conflicted, then handoff.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Capture rule landed (PR #172): grilling captures the approved plan as a Backlog plans doc via CLI attached to the owning Task (--doc replaces; scratch never captured); deliver-change step 2 names the step with the doc id cited in the ledger, executable now that the Task record is born in the Change checkout (T-88). Evidence: ratchet 7563 exact, 17/17 suite, guard test PASS. Review: R1 sequencing conflict resolved by T-88 sequencing; R2/R3 PASS.
<!-- SECTION:FINAL_SUMMARY:END -->
