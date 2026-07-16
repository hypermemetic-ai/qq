---
id: TASK-46
title: Adopt backlog.md 1.48 and OpenWiki 0.1.2 conveniences
status: To Do
assignee: []
created_date: '2026-07-15 23:24'
updated_date: '2026-07-16 03:07'
labels: []
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator directed the toolchain upgrade and adoption of its conveniences (2026-07-15): backlog.md 1.47.1 → 1.48.0 and openwiki 0.1.0 → 0.1.2 are installed; see each project's release notes (backlog.md 1.48.0; openwiki 0.1.1 and 0.1.2) for the fix inventory. Already incorporated with the upgrade: the first backlog doctor audit ran clean against the board, and openwiki/INSTRUCTIONS.md — the standing operator-owned brief that OpenWiki reads on maintainer runs as control metadata — landed alongside this Task.

What remains is convention-shaped and captured in the acceptance criteria: where backlog doctor runs recurringly, whether Tasks adopt the now-active type and priority vocabularies, and handing board deep links to the delegate status surface work.

Observation recorded during the upgrade (mechanism not inspected): backlog task create in the main checkout minted TASK-46 while an uncommitted task-45 file existed only in a sibling worktree, so allocation skipped the in-flight ID in this instance. Do not generalize this into a safety guarantee: treat concurrent Task minting across sessions as unsafe between audits — backlog doctor diagnoses duplicate IDs only after they exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The board hygiene convention records where backlog doctor runs (at minimum: during the Done-sweep chore; decide whether board-touching merges also run it) and the next sweep follows it
- [ ] #2 Task-type vocabulary is settled: keep or trim the 1.48 defaults (bug, feature, enhancement, task, chore, docs, spike), decide whether a design type is added for design rounds, and record whether new Tasks set a type
- [ ] #3 A priorities disposition is recorded: adopt High/Medium/Low for batch triage or explicitly leave unused
- [ ] #4 Board deep links (/tasks/:id on the browser board, port 6420) are recorded as an input to the delegate status surface implementation so status lines or sidebar metadata can carry ticket URLs
- [ ] #5 The next OpenWiki maintainer run conforms to the brief: authored content stays under openwiki/, landed-main-only scope is respected, and openwiki/INSTRUCTIONS.md is left unmodified by the run; any nonconformity is treated as a brief defect and an amendment is proposed by pull request
<!-- AC:END -->
