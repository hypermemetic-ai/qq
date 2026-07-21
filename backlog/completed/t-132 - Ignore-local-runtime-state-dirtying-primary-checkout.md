---
id: T-132
title: Ignore local runtime state dirtying primary checkout
status: Done
assignee: []
created_date: '2026-07-21 06:24'
updated_date: '2026-07-21 06:25'
labels: []
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Landing PR #181 is rail-blocked: primary main checkout must be completely clean, and three local paths dirty it: M cockpit/herdr/config.toml (operator's kanagawa theme), untracked .pi/ (live plan-loop state) and skills/.system/ (machine-managed codex system skills).

Decision ledger: operator verbatim instruction — 'gitignore the config file. idk on the others, clear them yourself.' Mechanism: untrack cockpit/herdr/config.toml (git cannot ignore a tracked file) + ignore; ignore /.pi/ and /skills/.system/ — non-destructive, all local content stays on disk, matching existing .gitignore convention for local runtime state (.ntm/, .qq/, .pi-subagents/). Consequence operator ratifies at merge: Repository no longer ships a herdr config.toml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 git status in primary main checkout is completely clean with all local content preserved on disk
- [ ] #2 Change lands as one PR; operator merges; qq-change land 181 subsequently succeeds
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Untracked cockpit/herdr/config.toml (kanagawa theme preserved on disk), added gitignore entries for /cockpit/herdr/config.toml, /.pi/, /skills/.system/ per operator instruction. PR #182 opened; once merged, primary main checkout is clean and qq-change land 181 can proceed.
<!-- SECTION:FINAL_SUMMARY:END -->
