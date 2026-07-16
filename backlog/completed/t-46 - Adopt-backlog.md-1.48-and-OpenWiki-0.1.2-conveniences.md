---
id: T-46
title: Adopt backlog.md 1.48 and OpenWiki 0.1.2 conveniences
status: Done
assignee: []
created_date: '2026-07-15 23:24'
updated_date: '2026-07-16 19:51'
labels: []
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator directed the toolchain upgrade and adoption of its conveniences (2026-07-15): backlog.md 1.47.1 → 1.48.0 and openwiki 0.1.0 → 0.1.2 are installed; see each project's release notes (backlog.md 1.48.0; openwiki 0.1.1 and 0.1.2) for the fix inventory. Already incorporated with the upgrade: the first backlog doctor audit ran clean against the board, and openwiki/INSTRUCTIONS.md — the standing operator-owned brief that OpenWiki reads on maintainer runs as control metadata — landed alongside this Task.

What remains is convention-shaped and captured in the acceptance criteria: where backlog doctor runs recurringly, whether Tasks adopt the now-active type and priority vocabularies, and handing board deep links to the delegate status surface work.

Observation recorded during the upgrade (mechanism not inspected): backlog task create in the main checkout minted T-46 while an uncommitted task-45 file existed only in a sibling worktree, so allocation skipped the in-flight ID in this instance. Do not generalize this into a safety guarantee: treat concurrent Task minting across sessions as unsafe between audits — backlog doctor diagnoses duplicate IDs only after they exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The board hygiene convention records where backlog doctor runs (at minimum: during the Done-sweep chore; decide whether board-touching merges also run it) and the next sweep follows it
- [x] #2 Task-type vocabulary is settled: keep or trim the 1.48 defaults (bug, feature, enhancement, task, chore, docs, spike), decide whether a design type is added for design rounds, and record whether new Tasks set a type
- [x] #3 A priorities disposition is recorded: adopt High/Medium/Low for batch triage or explicitly leave unused
- [x] #4 Board deep links (/tasks/:id on the browser board, port 6420) are recorded as an input to the delegate status surface implementation so status lines or sidebar metadata can carry ticket URLs
- [x] #5 The next OpenWiki maintainer run conforms to the brief: authored content stays under openwiki/, landed-main-only scope is respected, and openwiki/INSTRUCTIONS.md is left unmodified by the run; any nonconformity is treated as a brief defect and an amendment is proposed by pull request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Conventions recorded in doc-48: doctor runs in every Done-sweep chore AND inside board-touching Changes before finalization (this Change ran it: clean). Types: 1.48 defaults kept, no design type, new Tasks set a type (first live use T-56..61). Priorities: High/Medium/Low adopted for batch triage (drove the 2026-07-16 dispatch order). Deep links: status-surface detail blocks carry /tasks/:id URLs (adopted live; honest caveat in doc-48 — links resolve only while 'backlog browser' runs). AC#5 pending: on-demand maintainer run assigned 2026-07-16 and in flight; verification recorded when its run completes. Also in this Change: openwiki/INSTRUCTIONS.md Diagrams amendment proposed (the section directed runs to the BPMN extension T-55 deleted — found by T-60 research; grep confirms bin/qq-openwiki carries no BPMN).

AC#5 evidence to date (final verification pending the maintainer's PR): on-demand run assigned 2026-07-16; generated refresh stayed under openwiki/, INSTRUCTIONS.md untouched, landed-main-only base; the brief's BPMN defect amendment is proposed in this Change. The maintainer lane lost its completion wake twice (claude-subagent lane residual of the T-58 class); its delivery is being re-driven. T-46 remains In Progress until that run's conformant PR exists.

AC#5 verified against GitHub, not the envelope: PR #114 (OPEN, shell-tests green) touches exactly six files, all under openwiki/; INSTRUCTIONS.md absent from the diff; generated at landed origin/main c5fa552 under the amended prose-only brief; the run reported no unfollowable directives. Its two-round fresh-context review corrected stale source citations; the maintainer's contestable decisions (direct citation fixes instead of an LLM correction round-trip; closing review after applying the reviewer's own prescribed range) are recorded in the PR conversation trail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
backlog.md 1.48 and OpenWiki 0.1.2 conveniences adopted: doctor cadence, type/priority vocabulary, and board deep-link conventions recorded in doc-48 and exercised live by the 2026-07-16 batch; board deep links feed the delegate status surface; the next maintainer run (PR #114) conformed to the operator brief with the BPMN brief defect amended by pull request beforehand.
<!-- SECTION:FINAL_SUMMARY:END -->
