---
id: T-173
title: Make accountable intake independent of Herdr focus
status: In Progress
assignee: []
created_date: '2026-07-27 06:54'
updated_date: '2026-07-27 06:55'
labels: []
dependencies: []
documentation:
  - doc-109
priority: high
type: bug
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the accountable handoff/Architect intake transaction so transient Herdr global focus is never treated as authority, inspected as a precondition, restored, or used as a success/error gate. The live root Pi identity and Repository project-home topology remain authoritative; Architect intake additionally requires qq's dedicated `architect` tab. Fresh recipients remain no-focus tabs in the same project home.

This is the separate prerequisite requested after confirmed batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4` / handoff `handoff-861f1e8f2428e0025ff75a8ae27d5fc4` failed while the operator focused another Repository. That settled handoff remains immutable and pending. This Task does not alter or retry it, and it does not bundle work into T-164.

Ownership boundary: qq owns `qq-handoff`, its deterministic tests, and current README guidance. Herdr itself, pending Architect state, historical plans/records, T-164, and unrelated handoff or lifecycle behavior are outside this Change.

## Decision ledger

- Asked-and-answered operator alignment exchange on 2026-07-27 (`Approve as written`) — authority derives from live root Pi identity plus Repository project-home topology; Architect intake also requires the dedicated `architect` tab, never global focus.
- Same approval — remove focus equality, focus restoration, focus-based receipts/gates, and consumption of current focus state from ordinary accountable handoff and Architect intake; keep recipient creation explicitly `tab create --no-focus` and use non-focus resource listings for accounting.
- Same approval — preserve Repository/project-home topology, dedicated Architect-tab, duplicate-recipient ownership, immutable handoff, bounded cleanup/preservation, startup/prompt, final agent reinspection, and receipt rails.
- Same approval — reconcile only current README wording; leave historical Tasks/plans/records unchanged and add no Herdr substrate change, durable state, pending-batch retry/mutation, T-164 work, or broader refactor.
- Same approval — regression evidence must cover intake while a different workspace/tab/pane is focused and prove success, error, and proven-cleanup paths emit no focus command or focus-state read, followed by focused and Repository Checks plus fresh-context review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Architect intake succeeds from the valid live root Pi in qq's dedicated architect tab while another workspace/tab/pane is globally focused; ordinary handoff authority likewise does not depend on focus.
- [ ] #2 Recipients are created with tab create --no-focus in the project home, and success, error, and proven-cleanup paths issue no focus command and consume no current-focus state.
- [ ] #3 Repository topology, dedicated Architect-tab, duplicate owner, immutable handoff, bounded cleanup/preservation, startup/prompt, final agent reinspection, and receipt rails remain enforced.
- [ ] #4 Current README wording matches focus-independent behavior; historical records, Herdr substrate, pending batch/handoff, T-164, and unrelated lifecycle surfaces are unchanged.
- [ ] #5 The focused regression fails on the unfixed behavior and passes after the fix; focused harnesses, all top-level Repository Checks, diagnostics, diff checks, and fresh-context review are green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the current focus-mismatch refusal in the deterministic handoff harness.
2. Change runtime/resource discovery to validate live root Pi and project-home/dedicated-tab identity without reading global focus; retain explicit `--no-focus` recipient creation.
3. Remove focus restoration state and every focus-dependent branch or receipt claim while preserving transaction cleanup, startup/prompt, reinspection, and immutable handoff rails.
4. Update deterministic tests for another-Repository focus and no-focus-command/no-focus-read behavior across success, error, and cleanup; reconcile current README wording only.
5. Run focused harnesses, all top-level Repository Checks, diagnostics, diff hygiene, fresh-context review, acceptance finalization, and one-PR GitHub Flow delivery.
<!-- SECTION:PLAN:END -->
