---
id: TASK-8.2
title: Live e2e proof for worker-pane Build path
status: Done
assignee:
  - task-8.2-records-e2e
created_date: '2026-07-09 00:07'
updated_date: '2026-07-09 00:21'
labels:
  - slice
dependencies:
  - TASK-8.1
parent_task_id: TASK-8
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Slice 2 of TASK-8 (pilot). Two jobs in one: (a) retire the resume --last / stdin-hang records — mark ideas/03 superseded (rationale survives for background side-quest use, ideas/01), close ideas/05 Part 2 item 3 (resolved by TASK-8: session id captured by herdr, resume by id, --last deleted from orchestrate), update ideas/README.md pointers; (b) implement it THROUGH the new Build path as the live e2e exercise of slice 1's lifecycle: conductor starts a cx- worker pane in its own tab, drives two handoffs (one clean, one deliberately red-then-repair via brief scoping), reads .qq/handoffs/<n>-report.md files back, captures evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ideas/03 marked superseded; ideas/README.md updated; ideas/05 Part 2 item 3 marked resolved
- [x] #2 No live doc teaches resume --last as an orchestrate handoff (rg proof)
- [x] #3 Edits implemented by a Codex pane worker via brief/report handoff files, not by the conductor
- [x] #4 Evidence bundle (worker start cmd, wait, red->repair round, reports) recorded in this task file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
E2E evidence (2026-07-08, conductor pane w7:pK, tab w7:t7):
- start: herdr agent start cx-task-8.2-records-e2e --cwd <this tree> --tab w7:t7 --split down --no-focus -- codex -> pane w7:pQ, same tab (tab-per-task, 2/3 panes).
- codex update prompt skipped (Down+Enter); no directory trust prompt (pre-trusted).
- handoff 1: .qq/handoffs/1-brief.md via agent send, then ~2s settle before pane send-keys Enter (first immediate Enter landed before the text; resent).
- session id captured at first handoff: 019f443a-f6d9-7a82-8b70-79e47af9b16f (agent get -> agent_session.value) — resume-by-id evidence, --last never used.
- wait: herdr agent wait --status idle unblocked on turn end; codex surfaces agent_status=done at turn end (lesson for skill wording).
- report of record: .qq/handoffs/1-report.md read from file; conductor reviewed the real git diff, no scrollback parsing.
- deliberate red: slice rg check failed on ideas/README.md (excluded from brief 1 by design). Repair handoff 2 with failing evidence in the SAME pane, session id unchanged -> re-verify green (stale-language rg empty; all remaining resume --last mentions historical/superseded).
- worker never committed; conductor commits on green (this commit).
<!-- SECTION:NOTES:END -->
