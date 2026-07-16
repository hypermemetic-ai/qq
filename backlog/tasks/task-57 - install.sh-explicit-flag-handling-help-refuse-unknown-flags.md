---
id: TASK-57
title: 'install.sh: explicit flag handling (--help, refuse unknown flags)'
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 16:56'
labels: []
dependencies: []
priority: low
type: enhancement
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-12 15:05): add explicit flag handling to bin/install.sh. Today the script ignores all arguments and always installs.

--help (and -h) must print usage and exit 0 without installing anything; any unsupported argument must be refused with an error and usage on stderr, non-zero exit, and no installation side effects (refuse, do not sanitise). Cover with a shell test alongside tests/test-install-cleanup.sh; CI runs bash tests/test-*.sh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 install.sh --help and -h print usage and exit 0 with no filesystem side effects
- [x] #2 Any unsupported argument exits non-zero with usage on stderr and performs no installation
- [x] #3 A shell test covers both paths and the no-argument install path still works
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Argument scan added ahead of every filesystem mutation; refuse-don't-sanitise for unknown args (error + usage on stderr, exit 1). Delegate decision, owner-accepted: all args scanned before honoring help, so mixed help+unknown input is refused. New tests/test-install-flags.sh sandboxes HOME/XDG and proves non-mutation plus the intact zero-argument install path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bin/install.sh now handles flags explicitly: -h/--help prints usage and exits 0 with no side effects; any unsupported argument is refused with usage on stderr and exit 1 before any mutation. Covered by a sandboxed shell test; full suite green; fresh-context review verdict: pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
