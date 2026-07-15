---
id: TASK-1
title: Canonicalize shared AGENTS and retire WIP
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 02:14'
updated_date: '2026-07-12 17:45'
labels: []
dependencies: []
modified_files:
  - AGENTS.md
  - CLAUDE.md
  - README.md
  - bin/install.sh
  - bin/qq-openwiki
  - bin/qq-wip
  - bin/qq-wip-snapshot.sh
  - cockpit/herdr/config.toml
  - qq-methodology.md
  - tests/test-qq-openwiki.sh
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make qq/AGENTS.md the single shared instruction source without yet shortening the methodology, retire qq's WIP hook/recovery commands, retire the active clideck installation and integrations, make the herdr cockpit invoke its installed helper through PATH, and keep OpenWiki from changing root agent-instruction state. This Change is limited to qq; linked Repository migration follows after landing. Existing refs/wip recovery data remain untouched. No generated openwiki/ page is edited.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md contains the existing shared methodology and qq-methodology.md and CLAUDE.md are absent
- [x] #2 The installer no longer owns a global Codex AGENTS link or WIP hook/recovery commands
- [x] #3 Owned live global-instruction and WIP hook/command links and only the exact qq WIP Stop-hook entry are removed while other hooks and refs/wip data remain
- [x] #4 Herdr pane-pull bindings invoke the installed qq-herdr-pull command without an absolute checkout path
- [x] #5 Relevant shell, isolated installer, Markdown-reference, and diff checks pass and the Change receives independent review
- [x] #6 The clideck executable/package, ~/.clideck data, and active Codex notify, hook, and command-rule integrations are absent while unrelated Codex configuration and hooks remain
- [x] #7 qq-openwiki restores the exact pre-run AGENTS.md and CLAUDE.md state, including absence and symlinks, after successful and failed runs while retaining its single-writer and generated-workflow cleanup guards
- [x] #8 Authored documentation matches the retained surfaces and no generated openwiki/ file changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Consolidate existing shared instructions into AGENTS.md and update authored references; verify no stale qq-methodology/CLAUDE references remain.
2. Remove WIP scripts and installer integration, then clean only qq-owned live links/hook entry while preserving refs/wip; verify unrelated hooks and refs remain.
3. Remove the active clideck package, data, notify setting, hooks, and command rules.
4. Route herdr bindings through the installed command and verify resolution.
5. Make qq-openwiki preserve root agent-instruction state exactly and test absent, regular, symlink, success, and failure cases without editing generated wiki pages.
6. Run focused checks, independent review, and rerun affected checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
During clideck cleanup, 96 Codex rollout files containing the clideck string were mistakenly deleted after misreading the operator's reference to transcripts. Five removed history entries were restored. The operator stopped recovery work and directed continuation on the main Change; no further transcript/history deletion will occur.

Consolidated the unchanged methodology into AGENTS.md, preserved the OpenWiki marker block unchanged, removed the redundant instruction/WIP files and installer responsibilities, routed herdr through PATH, and retired active clideck integration. Focused checks passed: shell syntax; tests/test-qq-openwiki.sh; first/repeat installer runs in a temporary HOME including stale qq-wip pruning and absence of global AGENTS/hooks; TOML/JSON parsing; live-link/hook/package/data assertions; no openwiki/ diff; git diff --check.

Hardened qq-openwiki to acquire its per-Repository lock before preflight, snapshot AGENTS.md and CLAUDE.md, shadow symlinks locally so OpenWiki cannot mutate shared targets, and restore exact caller-owned state on success or failure. The focused test covers absent, regular, and symlink states plus failure and concurrency. Fresh focused verification also passed installer idempotence/stale-command pruning, shell/TOML/JSON checks, live cleanup assertions, herdr config reload, exact preservation of the existing methodology and OpenWiki marker block, no generated openwiki/ delta, and git diff --check.

Independent post-fix review found no in-scope material issues. It reported that a synthetic HOME seeded from the former installer would retain the retired global AGENTS and WIP hook state. The failure path was reproduced, but the operator confirmed qq has only one user, the owned live state is already cleaned, and permanent legacy-migration machinery is explicitly unwanted; no installer compatibility code was added.

Final pre-commit verification passed: bash -n; shellcheck; tests/test-qq-openwiki.sh; isolated first/repeat installer with stale-command pruning; TOML/JSON and Markdown-link checks; byte-exact methodology/OpenWiki-block preservation; active live-state and clideck-absence assertions; refs/wip preservation; herdr config reload with no diagnostics; no generated openwiki/ delta; git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made AGENTS.md the unchanged shared instruction source, retired redundant CLAUDE/methodology/WIP and clideck surfaces, simplified installer ownership, routed herdr through PATH, and made qq-openwiki restore caller-owned root instruction state exactly. Verified with focused shell, installer, configuration, link, live-state, OpenWiki success/failure/concurrency, and diff checks plus independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
