---
id: T-58
title: 'Diagnose: delegations sometimes hang invisibly'
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 17:09'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-15 23:24): "delegations sometimes hang invisibly."

Evidence-first diagnosis of the delegate-batch machinery (codex exec delegates, envelope files, single completion wake, status surface per doc-43). Identify the hang modes that leave no visible state: e.g. codex exec blocking on network/approval, events file buffering, dead dispatcher, wake never firing, sandbox waits. Deliverable is a verified root-cause diagnosis with evidence (artifacts under /tmp, transcripts, live probes) and a bounded fix proposal recorded on this task; a fix lands only as a follow-up bounded Change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root cause (or the set of distinct hang modes) is identified with observable evidence, not speculation
- [x] #2 A bounded fix or mitigation proposal is recorded on this task for operator disposition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis doc: doc-45. Four modes; the reported hang is a CONFIRMED codex exec pre-session startup wedge (no rollout, no output, no exit — so the exit-based completion wake structurally never fires; >=6 instances Jul 14-15 including a 'died at spawn' demo delegate that was alive 11 h later). Also confirmed: dispatcher reads thread.started only at that delegate's own wake, so rows sit at 'dispatched' for a delegate's whole life (observed on this very batch; behaviorally corrected by the dispatcher for the rest of the batch). Fix proposals 1-5 recorded in doc-45 await operator disposition — headline: wrap dispatch in timeout -k with exit-124 reconciled to FAILED, disable MCP servers for delegates, boundary events-sweep for thread.started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root causes identified with evidence (doc-45): codex startup wedge (the hang) x dispatched-forever glass + pre-T-45 invisibility (the invisible). Bounded fixes proposed for operator disposition; none applied to skill text without approval.
<!-- SECTION:FINAL_SUMMARY:END -->
