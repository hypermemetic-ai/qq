---
id: T-74
title: >-
  Capture mount-don't-mirror and by-construction as canonical vocabulary with a
  solutions record
status: Done
assignee: []
created_date: '2026-07-17 03:29'
updated_date: '2026-07-17 03:41'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compound capture of the settled T-69/T-71/task-35 lesson (operator approved 2026-07-16): reconcilers exist only where set membership is mirrored; mounting a set's root (directory symlink, PATH entry, canonical-file link with a local appendix) makes consumption by-construction. Adds a solutions document and two glossary entries; both terms have live project usage (operator's original 'by construction' framing; doc-46 title; the landed install/glossary Changes and README).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A solutions document (CLI-created, tagged solution) records Symptom, Root cause, Resolution (including the residual truths: per-consumer values still need conformance Checks; writes through mounts surface in the source repo; CI-read files cannot be absolute links and get dereference-free readlink contracts), and Verification citing qq PRs #119/#121 and deciq PR #51
- [x] #2 CONCEPTS.md gains 'by construction' and 'mount, don't mirror' entries in the existing format; no other definition changes; all tests/test-*.sh pass including the exact-string CONCEPTS.md assertions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. backlog doc create in solutions with the four-section body; mv the CLI-minted doc and this task record into the Change worktree.
2. Append the two glossary entries to CONCEPTS.md beside the principles cluster (silent failure / drift-net), matching format; no other edits.
3. Checks: full tests/test-*.sh; grep the asserted exact strings.
4. Review round; PR; finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: doc-49 created and populated through the Backlog CLI only; glossary entries appended after 'reproduce before you fix' with no other CONCEPTS.md changes (diff stat: +9 lines, one file before the records); 7/7 tests pass; asserted exact strings verified present; fresh codex review across definitional consistency and evidence support returned no material findings. Live confirmation of the captured property during this very Change: the writing-for-clients skill landed in qq/skills by another session and appeared in this session's runtime instantly through the mount.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Captured the mount-don't-mirror / by-construction lesson as doc-49 (solutions) plus two canonical glossary entries, verified with the full test suite, exact-string assertion checks, and a no-findings fresh review.
<!-- SECTION:FINAL_SUMMARY:END -->
