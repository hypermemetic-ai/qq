---
id: TASK-3
title: Mechanical parallel-safety hardening
status: Done
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 21:02'
labels: []
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit ideas/05 Part 2 items 2-4: .qq/state.json producer slots (--producer keyed under producers{}), WIP-ref CAS on refs/wip/<branch>, rail argv-aware tightening (inspect actual git invocations; add push --delete, reflog expire, update-ref -d). Codex resume scoping was resolved by TASK-8.1's orchestrate worker-pane rewrite; TASK-8.2 keeps the live e2e proof. OBSERVED FALSE POSITIVE (2026-07-08): before this fix, the rail pattern-matched the entire command line including quoted argument prose — a 'no-mistakes axi respond --instructions' call was blocked because its quoted instruction text mentioned the branch force-delete pattern as words. Fix should match the actual git invocation (argv-aware or anchored to command position), not substrings anywhere in the line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two producers can stamp qq-phase concurrently without clobbering
- [x] #2 Rail no longer blocks benign commands that merely mention dangerous phrases
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed from chore/task-3-rail-notes. qq-phase: per-producer slots under producers{} (--producer, default main), flock-serialized read-modify-write, per-slot fresh-run reset and gate id, multi-slot render, legacy-shape migration. qq-wip-snapshot: update-ref is now CAS (new old) + never fails the Stop hook. Rail: rewritten argv-aware (tokenize → simple commands → inspect actual git argv, following wrappers and sh -c; conservative whole-line fallback for unparseable input); added push --delete/-d/:branch, reflog expire, update-ref -d, push +refspec; 57-case table at skills/git-guardrails-claude-code/scripts/test-block-dangerous-git.sh; installed copy at ~/.claude/hooks synced. Codex-resume scoping deliberately excluded — folded into TASK-8.
<!-- SECTION:NOTES:END -->
