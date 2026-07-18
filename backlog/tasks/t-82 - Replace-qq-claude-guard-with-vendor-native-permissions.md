---
id: T-82
title: Replace qq-claude-guard with vendor-native permissions
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-18 01:44'
labels:
  - base-batch
dependencies:
  - T-80
  - T-81
priority: high
type: task
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Merge mandate moves to Claude Code native permissions.deny rules; Backlog mandate to native Edit denies or a ~80-line path-only hook. No shell parsing survives in any form. Same drift-net guarantee class; the GitHub ruleset + qqp-bot identity remains the boundary (T-36/T-37).

Decision ledger:
- Vendor-native replacement and its verify-before-landing conditions — doc-51 (operator-approved plan, 2026-07-17). Both pre-landing verifications in doc-51 are mandatory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 qq-claude-guard bash lexing is deleted with target line counts met (doc-51) and the agent-credential merge rejection probe passes after removal
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
qq-claude-guard (933 lines) deleted. Merge mandate moved to Claude Code native permissions.deny for gh pr merge (narrowed so merge-as-argument, e.g. gh pr edit --add-label merge, is not blocked); Backlog mandate to a 52-line path-only PreToolUse hook (bin/qq-claude-backlog-hook) that never lexes shell. Test 513->88; C3 probe rewired guard->hook; shell_parser_idioms ratchet 5->0. Verified by the accountable session: full tests/test-*.sh suite 8/8; C1 agent-credential merge-rejection probe PASS (GitHub HTTP 405, boundary holds after removal); verify (a) task-record mv not blocked; ratchet clean. Code-review: one over-block finding found, fixed, and verified. Delivered on PR #138.
<!-- SECTION:FINAL_SUMMARY:END -->
