---
id: TASK-18
title: Operationalize codebase-memory (knowledge layer 1)
status: To Do
assignee: []
created_date: '2026-07-08 22:37'
labels:
  - parallel-ok
dependencies: []
priority: medium
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Marked adopted in ideas/05 Part 4 but never operationalized: ~/.cache/codebase-memory-mcp holds NO index for the qq main tree — while the globally-wired MCP has auto-indexed 13 ephemeral no-mistakes gate worktrees and 2 scratchpad temp dirs (every gate Codex session indexes its throwaway cwd via ~/.codex/config.toml). The server also disconnected mid-session 2026-07-08. Scope: index the main qq tree and verify a real relational query works; curb ephemeral-path auto-indexing (exclude ~/.no-mistakes/worktrees/** and scratchpads, or drop the MCP from the gate's codex profile); run/record the multi-worktree smoke test ideas/05 gated adoption on (per-path DBs suggest isolation-by-construction — confirm); diagnose the disconnect.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 search_graph/trace_path answer a real qq structure question from the main tree
- [ ] #2 Gate worktrees no longer mint new index DBs (or an explicit accept decision is recorded)
- [ ] #3 Multi-worktree behavior verified and noted; disconnect root-caused or dismissed with evidence
<!-- AC:END -->
