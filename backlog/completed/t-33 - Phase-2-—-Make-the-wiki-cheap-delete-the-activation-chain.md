---
id: T-33
title: Phase 2 — Make the wiki cheap (delete the activation chain)
status: Done
assignee: []
created_date: '2026-07-14 05:10'
updated_date: '2026-07-14 06:20'
labels: []
dependencies:
  - T-32
documentation:
  - doc-38
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-38 Phase 2: delete the merge-triggered activation chain (userscript, qq-openwiki:// protocol and desktop handler, bin/qq-openwiki-activate.py, installer sections, tests). Wiki refresh becomes on-demand plus optional schedule, delivered as an ordinary docs PR the operator merges. Self-merge exception removed; openwiki-maintainer skill reduced to ~200 words. Guard wrapper, BPMN wiki diagrams, and --check retained.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The activation chain and self-merge machinery are deleted; installer and tests updated
- [x] #2 Wiki refresh runs on demand and delivers as an ordinary operator-merged PR
- [x] #3 openwiki-maintainer skill states the reduced procedure only
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by delegated codex agent (gpt-5.6-sol), fresh-context reviewed: 2 blocking installer findings fixed (absolute-path XDG validation, surgical mimeapps editing with no-touch guard) plus owner-fixed empty-value XDG fallback per basedir spec. New deterministic coverage in tests/test-install-cleanup.sh. Final delta verdict SHIP. All 8 shell tests + BPMN suite (16/0) pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Merge-triggered wiki activation deleted: userscript, qq-openwiki:// protocol handler, and 537-line activator removed; installer now cleans up previously installed handler state it owns (guarded, surgical, byte-preserving). openwiki-maintainer reduced to an explicitly assigned refresh delivering an ordinary docs PR the operator merges — the self-merge exception is gone and 'the operator merges' is exception-free. Guard wrapper, BPMN wiki diagrams, and --check retained.
<!-- SECTION:FINAL_SUMMARY:END -->
