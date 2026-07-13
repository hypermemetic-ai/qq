---
id: TASK-19
title: Activate the OpenWiki maintainer from operator merges
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-13 03:21'
updated_date: '2026-07-13 15:17'
labels: []
dependencies: []
documentation:
  - doc-28
modified_files:
  - browser/openwiki-merge-activator.user.js
  - bin/qq-openwiki-activate
  - bin/install.sh
  - tests/test-qq-openwiki-activate.sh
  - README.md
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the operator confirms a pull-request merge on GitHub, a generic Tampermonkey userscript opens a local qq-openwiki activation URL carrying only the canonical PR URL. The local handler discovers the corresponding checkout under configurable project roots, verifies that it is linked to qq through the canonical root AGENTS.md symlink, independently verifies the merge through gh, ignores non-main and openwiki/update merges, deduplicates the merge commit, and launches or wakes the dedicated OpenWiki maintainer Codex session through Herdr in that Repository's long-lived worktree. No registry, polling, daemon, local server, custom browser extension, or remotely executable self-hosted runner is used. Teaching OpenWiki's generation agent to author helpful BPMN diagrams remains the separate TASK-6 follow-on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A generic Tampermonkey userscript reacts only to the final merge-confirmation action on any GitHub pull-request page and invokes the local qq-openwiki scheme with the canonical PR URL
- [ ] #2 The local handler refuses malformed input, discovers the corresponding checkout under configurable roots, matches its GitHub origin, and requires the Repository to be linked to qq through the canonical root AGENTS.md symlink
- [x] #3 The handler independently verifies through gh that the PR was merged into main by the authenticated operator
- [x] #4 Merges from openwiki/update are ignored and each merge commit is dispatched at most once per Repository
- [x] #5 Activation launches a missing dedicated maintainer session or wakes the existing session through Herdr in that Repository's openwiki/update worktree
- [x] #6 Installation registers the local qq-openwiki protocol without replacing unrelated desktop or MIME state and documents the userscript's one-time installation path
- [x] #7 Focused automated checks cover generic repository discovery, linked and unlinked repositories, malformed input, wrong base or operator, OpenWiki recursion, deduplication, launch, wake, userscript behavior, and installer preservation
- [x] #8 The local bridge is independently reviewed and handed off as a green pull request; TASK-6 BPMN generation remains separate follow-on work
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build the generic GitHub merge-confirmation userscript and validating local protocol handler. 2. Add qq-linked Repository discovery, GitHub verification, recursion protection, per-Repository deduplication, and singleton launch/wake behavior. 3. Register the local protocol through the existing installer while preserving unrelated desktop and MIME state, and document the one-time Tampermonkey setup. 4. Run focused handler, userscript, and installer checks, then fresh-context review and correction loops. 5. Deliver one green PR; after landing, install from canonical main so a subsequent merge provides the first live activation acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation passed: shellcheck; Bash syntax checks; Python compilation; Node syntax check; test-qq-herdr-pull, test-qq-openwiki, and test-qq-openwiki-activate; git diff check; strict BPMN conformance; isolated real xdg-mime registration with custom XDG_DATA_HOME. Fresh-context review and exact post-fix review found no remaining actionable findings. GitHub PR #55 is CLEAN and mergeable with no applicable status checks. Live Zen/Tampermonkey activation is intentionally the post-land acceptance check.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-07-13 15:17
---
First live activation after PR #56 merged exposed an unmet discovery case: QQ_PROJECT_ROOTS names search containers, but repository detection was applied to the container itself. An empty /home/qqp/projects/.git marker hid the valid descendant /home/qqp/projects/qq, so the browser bridge fired without dispatching the maintainer. Operator approved the narrow correction: only descendant candidates, with existing exact-origin and linkage checks preserved, plus focused regression coverage.
---
<!-- COMMENTS:END -->
