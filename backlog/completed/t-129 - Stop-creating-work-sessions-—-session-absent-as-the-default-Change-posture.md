---
id: T-129
title: Stop creating work sessions — session-absent as the default Change posture
status: Done
assignee: []
created_date: '2026-07-21 05:55'
updated_date: '2026-07-21 06:52'
labels: []
dependencies: []
documentation:
  - >-
    backlog/docs/plans/doc-74 -
    Plan-—-Session-absent-as-the-default-Change-posture-stop-creating-work-sessions.md
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-directed retirement of the per-Change Herdr work-session workspace (2026-07-21 alignment exchange, project-home session). Changes are born as plain linked worktrees; the already-implemented session-absent retire path (bin/qq-change --checkout <path> --workspace-absent-owned) becomes the default posture. Empty placeholder panes under the qq space cease to exist by construction; no keybinding or herdr-side changes.

Decision ledger:
- D1 (direction): operator choice, asked-and-answered structured card 2026-07-21 ('Direction' -> 'Stop creating work sessions'). Supersedes the work-session-creation half of the T-70 convention; T-70's dispatch-from-project-home posture stands unchanged.
- D2 (migration abandoned): operator verbatim 2026-07-21: 'I abandon the movement idea. it doesn't work in practice, like with multiple subagents, each in a different worktree (this should be how it works), can't move to multiple worktrees.' Multi-worktree delegate fan-out affirmed as correct; untouched.
- D3 (no navigation work): no alt+up/down rebind, no herdr-native skip request — moot by construction under D1 (skip-rule card answered '-').
- D4 (engines byte-identical): qq-change keeps both retire modes; placeholder mode remains for legacy work sessions (T-122's parked w71) until none remain; qq-reap already tolerates absent placeholder evidence. Owner recommendation from source evidence within D1's scope.
- D5 (accepted costs, named in the selected option card): qqcd focused-worktree jumps die by absence (QQ_HOME fallback by construction); CONCEPTS 'work session' entry shrinks away; in-flight visibility rests on the Backlog board (T-88 aggregation).
- D6 (decision record): mint decision-9 in this Change checkout, riding this PR — reach exceeds one Change (retires a glossary-level convention cited across doc-42/43/44 and T-70/T-88-era records). Ledger cites this exchange until the record lands.
- Approval disposition: plan approved by the operator in chat 2026-07-21 ('looks good', card 'Chat approval stands') after the plan-loop ceremony was set aside for its UX failure (ticketed as t-130). Plan captured as a Backlog plans doc attached to this Task.

This Change is itself born session-absent: no work session was created for it; its retirement uses --checkout --workspace-absent-owned — the first live use of that path as the default posture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep -rn 'work session' over skills/, CONCEPTS.md, cockpit/, README.md returns only intentional legacy/retirement pointers (or none)
- [ ] #2 deliver-change step 2 creates no work session and step 11's canonical retire invocation is the session-absent form
- [ ] #3 bin/ engines byte-identical: qq-change, qq-reap, qq-herdr-pull, qq-herdr-home, qq-herdr-snap
- [ ] #4 full Repository test suite green including the updated ratchet exact prose baseline
- [ ] #5 decision-9 record minted in this checkout and riding this PR
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DEVIATION (one-time, operator-approved 2026-07-21, unblock-route card 'Waive envelope once'): the fresh-context code review for this Change is dispatched WITHOUT outputSchema — adapter confinement intact, strict completion envelope waived for this review only. Cause: pi-subagents places the structured-output capture file under /tmp/pi-subagents-uid-<uid>/... while qq-dispatch's runtime root defaults to /tmp/qq-delegate-runtime; the fail-closed guard (bin/qq-dispatch:128-151) correctly refuses the mismatch (reviewer runs bd7ae303, 6d128bec died at start). Diagnosis: researcher run 622ddb35 (cited findings: guard correct, topology mismatch; implementer 13b192b0 had bypassed the adapter entirely because PI_SUBAGENT_PI_BINARY was not yet active in this session). Durable fix owned by t-128 (QQ_DISPATCH_RUNTIME_ROOT carried in the sourced shell/extension surface). Not a precedent: strict envelopes resume for all dispatches once the runtime-root env is carried.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered session-absent as the default Change posture. AC#1: only two intentional 'work session' pointers remain (deliver-change step 11 default-absence + legacy-retirement note). AC#2: step 2 births a plain linked worktree; step 11's canonical retire is --checkout --workspace-absent-owned, probed live (exit-2 rail refusal on unclean checkout, path resolves). AC#3: bin/ byte-identical (verified empty diff). AC#4: native suite 16/16 + ratchet 7516 exact; reviewer independently re-verified all three pins. AC#5: decision-9 minted in this checkout. Fresh-context review: Approve, no findings (dispatched under a one-time, operator-approved envelope waiver recorded above; adapter confinement intact). This Change was itself born session-absent and retires via --workspace-absent-owned. Plan doc-74, decision-9, and t-130 (plan-loop UX finding) ride the same PR.
<!-- SECTION:FINAL_SUMMARY:END -->
