---
id: T-83
title: Extract the engines; adopt Codex profiles
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-18 16:43'
labels:
  - base-batch
dependencies:
  - T-80
  - T-81
priority: high
type: task
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build qq-dispatch, qq-status, qq-pr-watch, qq-change land, qq-change retire in bin/ per the doc-51 engine table and interface contract (stateless, fixed exit vocabulary, refusal messages carry the relocated prose). Adopt codex profile files symlinked from the checkout.

Decision ledger:
- Engine set, interface contract, and rejected alternatives (MCP wrapper; workflow engines) — doc-51 (operator-approved plan, 2026-07-17).
- Verify current Codex version honors skills.*/mcp_servers keys in profiles before adoption — doc-51.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Engines exist with contract tests for exit classification, timeout reaping, and degradation; the triplicated codex exec block has a single home
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Four stateless bin/ engines built and ridden by the skills: qq-dispatch (timeout containment + codex exec --profile + fixed prompt; implementer MCP-off with --mcp opt-in, reviewer/researcher MCP-on), qq-status (status-file derivation, atomic write, sequence, herdr calls, herdr-absent degradation), qq-pr-watch (poll, terminal exit, one notification), qq-change land/retire (idempotent, refuse-don't-force rails). bin/lib/qq-engine.sh shared helpers. Codex profiles under codex-profiles/, mounted via $CODEX_HOME symlinks at landing; qq-dispatch exits 2 with guidance if absent. Interface contract: 0/2/1 exit vocabulary, JSON stdout, dry-run/inspect mirrors, no state store. Triplicated codex exec dispatch block replaced by qq-dispatch in code-review/research/delegate-batch (single home); full slimming deferred to T-84. Contract tests: exit classification, timeout reaping, degradation, land/retire idempotency. Verified: suite 12/12, shellcheck clean, ratchet codex_exec 9->6 / runtime_flags 14->1 / prose 11658->11513 (disjoint from T-82). Code-review 3 rounds, all findings fixed (stage-token rollup deferred to T-84). Delivered on PR #139.
<!-- SECTION:FINAL_SUMMARY:END -->
