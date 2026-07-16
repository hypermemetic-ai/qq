---
id: T-30
title: Unify bin tool resolution and shared test helpers
status: Done
assignee:
  - '@codex'
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 04:17'
labels: []
dependencies:
  - T-26
modified_files:
  - README.md
  - backlog/tasks/task-30 - Unify-bin-tool-resolution-and-shared-test-helpers.md
  - bin/lib/qq-bin.sh
  - bin/qq-herdr-home
  - bin/qq-herdr-pull
  - bin/qq-openwiki
  - bin/qq-openwiki-activate
  - bin/qq-openwiki-bpmn
  - tests/helpers.sh
  - tests/test-bin-resolution.sh
  - tests/test-bpmn-plans.sh
  - tests/test-grilling.sh
  - tests/test-openwiki-maintainer.sh
  - tests/test-qq-herdr-home.sh
  - tests/test-qq-herdr-pull.sh
  - tests/test-qq-openwiki-activate.sh
  - tests/test-qq-openwiki-bpmn.sh
  - tests/test-qq-openwiki.sh
priority: medium
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-07-13 architecture review: two env override conventions for the same binaries (HERDR_BIN_PATH in bash scripts vs QQ_HERDR_BIN in Python), the linuxbrew fallback path hardcoded in three places, and per-test-file duplicated fail/assert helpers.
Operator-settled decision: one QQ_<TOOL>_BIN convention everywhere with all setters updated (tests, cockpit config/keybindings if any), a single shared resolution helper for bash scripts, and a shared test helper library.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All bin scripts honor the QQ_<TOOL>_BIN convention; HERDR_BIN_PATH is gone from the repository including all setters
- [x] #2 One shared helper owns PATH/homebrew fallback resolution; no duplicated hardcoded linuxbrew blocks remain in bin/
- [x] #3 Test scripts source one shared helper library for fail/assert utilities
- [x] #4 All tests/ suites pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory every bin-script binary resolver and every HERDR_BIN_PATH/QQ_*_BIN setter across bin, cockpit, and tests.
2. Add one shared bin resolution helper that honors QQ_<TOOL>_BIN, PATH, and the existing Homebrew fallback, then migrate all bin consumers including qq-openwiki-activate.
3. Add one shared shell-test helper library and migrate every tests/ harness to source it for fail/assert utilities.
4. Add or adjust focused regression coverage for override, PATH, and fallback behavior and remove all HERDR_BIN_PATH setters.
5. Run all tests/ suites and applicable Bash syntax, ShellCheck, and diff checks; resolve independent code-review findings before one-PR delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one shared resolver for QQ_<TOOL>_BIN overrides, PATH lookup, and Homebrew fallback across Bash utilities and the Python activator; migrated OpenWiki/Node/Herdr setters and extracted shared shell-test fail/assert helpers. Cockpit Herdr config and keybindings contained no override setter.

Fresh Checks passed all nine tests/ harnesses, 18/18 BPMN pipeline tests with rendering, Bash syntax, ShellCheck, Python compilation, and diff hygiene. Independent read-only review raised empty explicit overrides falling through; verification against origin/main showed the same empty-as-unset behavior in every prior Python and Bash resolver, so it was not a Change-introduced finding and no code change was made.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Unified configurable binary discovery behind one shared `QQ_<TOOL>_BIN` resolver used by Bash utilities and the Python OpenWiki activator, removed active legacy override setters, and centralized shell-test fail/assert helpers. All nine shell harnesses, 18 BPMN tests, Bash syntax, ShellCheck, Python compilation, focused convention checks, and diff hygiene passed. Independent review left no confirmed Change-introduced material findings; PR #73 is open, mergeable, and CLEAN with no configured GitHub checks.
<!-- SECTION:FINAL_SUMMARY:END -->
