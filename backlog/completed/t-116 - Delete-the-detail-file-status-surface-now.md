---
id: T-116
title: Delete the detail-file status surface now
status: Done
assignee: []
created_date: '2026-07-19 22:00'
updated_date: '2026-07-19 22:31'
labels: []
dependencies: []
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator disposition 2026-07-19 (T-115 retarget exchange, recorded in decision-3): the delegation status logic is retired entirely — the plain detail-file protocol included — and the detail-file surface is deleted NOW rather than waiting for T-95. NOTE: T-115 landed whole in PR #155 (21:48Z, minutes before the disposition), so this Change also reverts #155's status-file build-out: delegate-batch's per-batch namespacing text, bin/qq-status's --batch-label flag, doc-43's namespacing amendment, and tests/test-qq-status.sh's detail-file pins. Scope: (1) remove skills/delegate-batch/SKILL.md's 'Report the batch on the status surface' section and its detail-file references; (2) remove bin/qq-status's detail-file write path incl. --batch-label — herdr report/notify paths STAY (their removal is T-95's parked scope); (3) remove the prefix+d popup binding from cockpit/herdr/config.toml; (4) replace doc-43's status-surface design with a retirement note citing decision-3; (5) re-pin tests/test-qq-herdr-home.sh (the anti-observability-pane tripwire stays with re-justified rationale) and prune tests/test-qq-status.sh of detail-file pins; tighten tools/ratchet-baselines.conf; (6) flag openwiki operations/workflows drift to the wiki maintainer in the PR handoff. Decision ledger: decision-3 broadened 2026-07-19, operator verbatim 'yes, proceed. delete now.' Out of scope: herdr paths (T-95), transcripts, pi-intercom.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 delegate-batch carries no status-surface reporting or detail-file protocol; dispatch writes nothing under /tmp/qq-delegates
- [x] #2 bin/qq-status publishes to herdr only; no detail-file code path; inspect/degradation text updated
- [x] #3 prefix+d popup binding removed from cockpit/herdr/config.toml
- [x] #4 doc-43 bears a retirement note citing decision-3
- [x] #5 Shell suite green with re-pinned guards and tightened ratchet baselines
- [x] #6 openwiki drift flagged in the PR handoff
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered as PR #156 (three commits: delegate deletion, owner records/docs, review fix). AC #1: delegate-batch's status section is now 'Report the batch on the Herdr glass' with the detail-file protocol fully removed — verified by diff and grep (only retirement pointers remain). AC #2: bin/qq-status publishes to Herdr only; detail-file path, guards, and --batch-label removed; live probes confirm the new inspect message and --batch-label as unknown-argument error; set -u safety verified. AC #3: prefix+d popup binding deleted from cockpit/herdr/config.toml. AC #4: doc-43 carries a retirement banner citing decision-3 and keeping the Herdr contract operative until T-95. AC #5: full shell suite 14/14 PASS owner-rerun on the head; ratchet baselines lowered 11498 to 11184 (measured, only-down); shellcheck clean. AC #6: openwiki drift flagged in the PR body for the wiki maintainer. Review: fresh-context reviewer round 1 returned one P2 (orphaned runtime/steering publication) — verified with a constructed failing probe and fixed in-scope; delta review Pass with no findings. Note: T-115 landed whole as PR #155 minutes before the delete-now disposition, so this Change also reverted #155's status-file build-out (namespacing, --batch-label, doc-43 amendment, test pins).
<!-- SECTION:FINAL_SUMMARY:END -->
