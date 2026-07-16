---
id: T-45
title: Wire the delegate status surface into delegate-batch
status: Done
assignee: []
created_date: '2026-07-15 23:16'
updated_date: '2026-07-16 04:32'
labels: []
dependencies: []
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement doc-43 (as amended 2026-07-15, round 2) in the delegate-batch skill and cockpit config. Doc-43 is the design authority; this ticket is bounded implementation only. Scope: per-repo per-work-session status file with atomic rewrite at each dispatcher-owned stage boundary; herdr pane report-agent / release-agent presence and state-color calls on ticket work-session placeholder panes (board-driven mode); herdr workspace report-metadata --token stage= calls with --seq and --ttl-ms at every boundary (both modes); pane report-metadata --token stage= on the accountable pane in migrated single-Change mode; idempotent no-focus open of the watch status pane (right split, accountable keeps ~70 percent); stderr capture and the sanctioned --json amendment to the codex exec line; popup accessor keybinding rendering the status files. The sidebar $stage token rows already landed with T-42 round 2 and are inert until reported. Sequence values derive from a monotonic per-call value (epoch seconds), never a restarting counter, and both tokens are cleared at terminal disposition, per doc-43's token write contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A real delegated batch renders stage one-liners end to end: status pane table, Space-row $stage token, and report-agent presence/color, each observed live
- [x] #2 Degradation paths behave per doc-43: herdr outage, status-file write failure, retired pane, missing placeholder, silent delegate death
- [x] #3 The automation contract is demonstrably unchanged: envelope file present, single completion wake, same sandbox flags, no free text on the delegate command line
- [x] #4 Blocked/failed escalation raises a notification under the honest-fallback rule
- [x] #5 Migrated single-Change mode observed live: the accountable session's pane and work-session $stage tokens render and clear, and the popup accessor renders the status file
- [x] #6 Token lifecycle verified live: --clear-token removes the stage row at terminal disposition; an orphaned token expires via a shortened --ttl-ms after simulated owner death; --seq uses epoch seconds so a restarted owner's reports are not ignored
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live verification evidence (dispatcher-side, 2026-07-15/16, this batch): Space-row $stage tokens and report-agent presence/color observed live on w42-w48 and via workspace get / agent list; status table observed live in a right-split pane before the operator's round-3 ruling removed panes from the design; popup accessor content path verified from main checkout, linked worktree, foreign repo, and non-repo cwd (repo derivation via git-common-dir); degradation: failed calls against nonexistent workspace/pane degrade cleanly without gating dispatch, operator-retired pane mid-batch left the file intact, and a real silent delegate death (provider capacity error) exercised wake-reconciliation; contract: envelope files, one wake per delegate, byte-identical sandbox flags, fixed prompt only; escalation probe returned shown:false reason:disabled and was reported under the honest-fallback rule; token lifecycle: TTL expiry after simulated owner death, clear-token at disposition, epoch-seconds seq with the strictly-increasing finding (same-second calls silently dropped) now codified in the skill.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired doc-43-as-amended (rounds 2-3) into delegate-batch: --json capture with events/stderr artifacts, per-repo-per-session detail status file (atomic rewrites), per-ticket workspace $stage tokens and placeholder-pane report-agent presence, blocked/failed-outranking rollups, clear-token at terminal disposition, strictly-increasing seq contract, resume-cwd steering caveat, and the prefix+d popup accessor as the sole owned renderer (operator round 3 removed all persistent panes). Fresh-context review: approve, zero findings. Residuals, stated plainly: the herdr-server-outage degradation row was reasoned but not executed (killing the operator's live cockpit is destructive); the popup frame itself needs one operator keypress (prefix+d) after merge and herdr server reload-config - flagged for uat-signoff. AC #1's 'status pane table' clause was observed live before the operator's round-3 ruling removed the pane from the design; doc-43 round 3 records the supersession.
<!-- SECTION:FINAL_SUMMARY:END -->
