---
id: TASK-28
title: Make install.sh manage Claude Code skills like Codex
status: Done
assignee: []
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:34'
labels: []
dependencies:
  - TASK-27
modified_files:
  - README.md
  - >-
    backlog/tasks/task-28 -
    Make-install.sh-manage-Claude-Code-skills-like-Codex.md
  - bin/install.sh
  - tests/test-qq-openwiki-activate.sh
priority: medium
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-07-13 architecture review: install.sh live-links skills only into ~/.codex/skills while ~/.claude/skills is hand-maintained and has drifted (missing bpmn-plans, deliver-change, openwiki-maintainer).
Operator-settled decision: the installer manages both runtimes symmetrically with identical link/prune/refuse semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 install.sh links every qq skill into ~/.claude/skills and prunes dead qq-owned links there, same semantics as ~/.codex/skills
- [x] #2 Non-qq entries in ~/.claude/skills are never touched or replaced
- [x] #3 Running bin/install.sh heals the current three-skill drift
- [x] #4 README.md installer description covers both runtimes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Generalized the existing skill synchronizer to accept a destination and invoked that same routine for Codex and Claude Code, leaving the relocated tools/bpmn-pipeline npm install unchanged. The isolated installer harness reproduced the missing Claude pruning behavior before the fix, then passed repeat linking, dead qq-link pruning, unrelated-entry preservation, unmanaged-collision refusal, all eight shell harnesses, Bash syntax, ShellCheck, the 18-test BPMN pipeline suite, and diff hygiene. Fresh read-only review found no material findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
install.sh now manages qq Skills symmetrically in Codex and Claude Code with shared link, prune, and refusal semantics; isolated regression coverage verifies drift healing and preservation of non-qq entries, and README.md documents both runtimes.
<!-- SECTION:FINAL_SUMMARY:END -->
