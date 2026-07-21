---
id: T-136
title: >-
  T-127 follow-on: close three observation-path races (startup signal, store
  TOCTOU)
status: Done
assignee: []
created_date: '2026-07-21 07:41'
updated_date: '2026-07-21 10:46'
labels: []
dependencies: []
type: bug
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the T-127 ticket-1 confined re-review (2026-07-21, verdict changes-requested on ad77a4a); the operator dispositioned these as accepted residual risk to land ticket 1 for the approved pi-code-tool A/B trial, with this follow-up to close them.

1. bin/qq-dispatch (~316-335): a signal after traps are installed but before dispatch_pid is assigned sets termination_signal without forwarding; no pending-signal replay after ~line 331. Probe: delayed-clone handoff + SIGTERM in the window → child ran to the configured timeout. Fix direction: replay a pending termination signal immediately after PID assignment (or arm forwarding before any wait point). Regression test must signal inside the startup window, not after descendant readiness (tests/test-qq-dispatch.sh:849-878 currently waits, so it cannot cover it).
2. bin/qq-observe (~98-103, 167-186): the checked store directory is reopened by absolute pathname; replacing the checked dir with a symlink between validation and open is followed outside the state root (O_NOFOLLOW covers only the final component; fstat then accepts). Fix direction: open directory-relative (dirfd walk) or re-verify the resolved path at open time. Probe: delayed-open ancestor-symlink replacement.
3. bin/qq-observe (~169-185): lstat-then-open gap with no O_NONBLOCK; replacing the leaf with a FIFO between lstat and open blocks inside os.open. Fix direction: O_NONBLOCK on the probe open, then fstat-verify regular file before writing.

Reviewer also invoked REVIEW.md's same-fix-smaller loop: the fix delta grew counters (+67 production LOC, +16 decision points); the follow-up should seek the simplest form of each fix.

Trust boundary (owner-declared 2026-07-21, review round 2): the defended adversary is the Landstrip-confined delegate child plus pre-planted static path objects. A confined child's write grants cover its worktree, its pi-subagent session dirs, and temp — never the operator's XDG state root — so it cannot rename or replace store-path components. Concurrent mutation of the store path by an unconfined operator-UID process is outside the defended model: such a process already holds everything the store boundary could protect. This restates the operator's 2026-07-21 disposition of this finding class (accepted residual risk, microsecond-window local-adversary cases) as the standing boundary for review.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered 2026-07-21 via wave-2 delegate batch: ab596e5 (startup-window termination replay), 472923a (span-store writes bound to the checked directory via dirfd + resolved-target verification), dac00de (nonblocking special-file probe). Counter deltas +5 production LOC / +2 decision points total, honoring the same-fix-smaller loop. Regression tests proven fail-at-main/pass-at-HEAD by the owner; full native suite + ratchet green. Two confined review rounds: round 1 (changes-requested) isolated the deep-ancestor rename window and the missing trust boundary; owner declared the boundary on the record (23fd92d — defended adversary is the confined delegate child, whose Landstrip write grants verifiably exclude the operator state root); round 2 verified the declaration against the emitted policy and APPROVED. The residual unconfined-same-UID rename window is accepted and out of scope.
<!-- SECTION:FINAL_SUMMARY:END -->
