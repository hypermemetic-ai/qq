---
id: T-162
title: Capture Ghostty as a QQ cockpit preference
status: Done
assignee: []
created_date: '2026-07-25 18:04'
updated_date: '2026-07-25 18:09'
labels: []
dependencies: []
references:
  - 'https://github.com/hypermemetic-ai/qq/pull/249'
modified_files:
  - README.md
  - cockpit/README.md
  - cockpit/ghostty/config
  - cockpit/ghostty/shaders/column-rails.glsl
type: chore
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Capture the finalized Ghostty terminal appearance as a QQ cockpit preference and mount it into the live configuration by construction. Keep the exploratory transcript and machine-wide Cinnamon, display, and GPU settings outside QQ.

Decision ledger:
- QQ owns the finalized Ghostty config and shader under cockpit/ghostty: operator approval, asked-and-answered exchange 2026-07-25 ('If it claims this then let's go for it, man.').
- Scope stops at portable cockpit configuration; exploratory history and machine-wide settings remain local: operator approval of the preceding recommendation in the same exchange.
- Mount the live Ghostty config through the existing cockpit symlink convention: repository cockpit contract in README.md and cockpit/README.md; no open decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cockpit/ghostty contains the finalized Ghostty configuration and no-bars shader
- [x] #2 README and cockpit documentation describe Ghostty ownership and bootstrap
- [x] #3 the live Ghostty configuration mounts the QQ cockpit source without losing the current appearance
- [x] #4 focused checks validate the configuration and leave machine-wide settings out of scope
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Copy the finalized Ghostty config and shader into cockpit/ghostty. 2. Update cockpit documentation and bootstrap instructions. 3. Verify the Ghostty config and no-bars shader behavior. 4. Preserve the live originals and replace them with repository-backed links.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Captured the finalized living-room Ghostty profile and no-bars Herdr normalization shader under QQ's cockpit, documented root-directory bootstrap and external font dependencies, and mounted the live Ghostty directory directly from the Change. Preserved the prior local directory at ~/.local/state/qq/backups/ghostty-before-t162. Verified Ghostty config validation, both installed font families, repository diff hygiene, the prose ratchet, the live repository link, and a 3840x2160 pixel check showing black at both rejected rail positions and the masked session-only edge while Herdr's native sidebar separator remains #808080. After operator merge, repoint the live link from this Change worktree to the primary qq cockpit before retiring the worktree.
<!-- SECTION:FINAL_SUMMARY:END -->
