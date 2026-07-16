---
id: T-38
title: Adopt codex-native access control for delegated reviewers and researchers
status: Done
assignee: []
created_date: '2026-07-14 18:44'
updated_date: '2026-07-14 20:11'
labels: []
dependencies: []
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A spawned rim-migration reviewer re-entered the code-review skill and tried to delegate again: it pattern-matched the review task to the skill, and the brief line forbidding unrelated Skills and further delegation did not bite because the reviewer judged code-review related. The prose guard failed; the read-only sandbox (mechanical) is what stopped the recursion.

Replace the pane-based temporary-delegate procedure for review and research delegates with codex-native access control, owned entirely by the vendor: codex exec with skills.include_instructions=false and skills.bundled.enabled=false (skills never enter the delegate context, fails closed for future skills), --sandbox read-only (OS-enforced), and -o so the CLI itself writes the final report deterministically. No owned launcher, profiles, panes, or auth plumbing; process exit is delegate retirement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 skills/code-review/SKILL.md launches its reviewer via the canonical codex exec command (skills excluded, read-only sandbox, CLI-written report file) with no agent-messaging pane lifecycle
- [x] #2 skills/research/SKILL.md launches its researcher through the same canonical mechanism
- [x] #3 A delegate launched by the canonical command reports no Skills in its context (probe returns NONE)
- [x] #4 An end-to-end canonical review of a seeded-bug scratch repository returns the material finding in the -o report file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both skills now launch their delegate through the canonical codex exec command: skills excluded from the delegate context via skills.include_instructions=false and skills.bundled.enabled=false (fails closed for future skills), OS-enforced --sandbox read-only, -o report file written by the CLI, static prompt with the brief in a file (only bracketed paths are substituted; free text never reaches the command line), process exit as retirement. Drift-net in tests/test-qq-herdr-home.sh repinned from the retired pane-procedure prose to the fail-closed flags in both skills.

Evidence: AC3 probe — control run listed 18 skills (including code-review, the recursion path); canonical delegate answered exactly NONE. AC4 — canonical review of a seeded-bug scratch repo returned the seeded inverted-comparison finding in the -o report file, exit 0. All seven tests/test-*.sh pass. Fresh-context review returned two confirmed findings (inline question text opened a shell command-substitution channel in the owning shell; prose overclaimed that the runner mechanically prevents delegation) — both fixed minimally and delta-reviewed clean, plus a follow-up wording fix so substituting bracketed paths is the documented compliant invocation. Delivered via PR https://github.com/hypermemetic-ai/qq/pull/82.
<!-- SECTION:NOTES:END -->
