---
id: T-69
title: >-
  Make qq installation by-construction: mount skills dirs, PATH commands, retire
  install.sh
status: Done
assignee: []
created_date: '2026-07-17 01:32'
updated_date: '2026-07-17 02:28'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
install.sh is a reconciler, and reconcilers exist only where set membership is mirrored (one symlink per skill, one per command). Mirroring caused today's drift: skills/operator-input landed (T-64) and no runtime saw it because nothing re-ran the installer. Mount the set roots instead: ~/.claude/skills and ~/.codex/skills become single symlinks to the checkout's skills/, commands resolve via PATH from $QQ_HOME/bin, and the shell fragment is sourced live from the checkout. After day-0 bootstrap, adding/removing/editing skills or commands requires no action anywhere, by construction. Operator direction 2026-07-16: the five non-qq skills previously in the runtime dirs (no-mistakes, typeset-pdf, codebase-memory, hypercore-greenfield, i3-config) do not move into qq; they were retired (codebase-memory is shipped and managed by codebase-memory-mcp itself, which triple-covers the guidance via its SessionStart hook and AGENTS.md managed section). Environment migration (mounts, .bashrc source line) was performed by the accountable session; this Change owns the repository side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bin/install.sh is deleted; tests/test-install-flags.sh and tests/test-install-cleanup.sh are retired with it; tests/test-qq-herdr-home.sh no longer asserts installer contents; every remaining tests/test-*.sh passes locally
- [x] #2 cockpit/shell/file-navigation.bash prepends $QQ_HOME/bin to PATH idempotently: sourcing it twice leaves exactly one $QQ_HOME/bin entry, and command -v qq-herdr-home resolves under $QQ_HOME/bin ahead of ~/.local/bin
- [x] #3 README's Install section documents the day-0 bootstrap (two skills-dir symlinks, one .bashrc source line, cockpit config links) and states that skill/command membership changes need no further action; cockpit/README.md no longer references install.sh
- [x] #4 Machine state verified: ~/.claude/skills and ~/.codex/skills resolve to the checkout's skills/ and a fresh shell lists the qq commands from $QQ_HOME/bin
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git rm bin/install.sh tests/test-install-flags.sh tests/test-install-cleanup.sh (bin/lib/qq-bin.sh and tests/test-bin-resolution.sh stay: the resolver serves the four surviving commands).
2. tests/test-qq-herdr-home.sh: remove the assertion that install.sh links the command (line ~157); the command's availability is now a PATH property, not installer content.
3. cockpit/shell/file-navigation.bash: idempotent PATH prepend of $QQ_HOME/bin (guard against duplicate entries on re-source).
4. README.md: replace the Install section with day-0 bootstrap (two skills-dir mounts, one .bashrc source line, cockpit config links) and the by-construction property; drop 'run it again after adding or removing a Skill'.
5. cockpit/README.md line 4: linked once at bootstrap instead of via install.sh.
6. Checks: bash tests/test-*.sh all pass; double-source fragment yields one PATH entry; command -v resolves under $QQ_HOME/bin.
7. code-review skill on the diff; commit green; PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification evidence: 6/6 tests/test-*.sh pass post-retirement (AC1). Fragment battery, all green in clean env shells (AC2): double-source yields exactly one $QQ_HOME/bin entry and it is PATH-first; PATH starting ~/.local/bin:$QQ_HOME/bin:... reorders checkout-first and command -v qq-herdr-home resolves from the checkout; adjacent duplicates collapse; trailing/interior empty entries preserved; set -u and set -e sourcing succeed; caller positionals and readonly caller variables untouched. README/cockpit README rewritten, zero live install.sh references by grep over README.md cockpit/ tests/ bin/ (AC3). Machine state (AC4): both runtime skills dirs readlink to /home/qqp/projects/qq/skills; sourcing the Change's fragment in a clean shell resolves all four qq commands from /home/qqp/projects/qq/bin, PATH-first. Review: fresh codex review + delta rounds fixed PATH shadowing, empty-entry loss, and caller-variable pollution (terminal fix: positional-only scratch in a transient function). Declined finding, operator may contest: collision on the transient function name itself (readonly -f qq_mount_bin) — out of threat model, fragment already reserves qq-prefixed global names (y, br) by design. Convergence circuit-breaker honored: fix loop halted at green after same-class recurrence. Post-merge follow-up tracked outside the repo: remove legacy ~/.local/bin/qq-* links once main carries the PATH mount.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retired bin/install.sh and its two tests; installation is now by-construction: runtimes mount skills/ whole-directory (machine migration performed and verified — a headless session discovered all 12 skills through the mount including never-linked operator-input), commands mount via an idempotent shadow-proof $QQ_HOME/bin PATH block in cockpit/shell/file-navigation.bash, README documents the one-time day-0 bootstrap (ln -sT mounts + one .bashrc source line + cockpit config links). Verified with the full test suite (6/6), a clean-env fragment battery (ordering, idempotence, empty-entry preservation, set -u/-e, namespace hygiene), machine-state readlinks and command resolution, and backlog doctor. Delivered as PR #119.
<!-- SECTION:FINAL_SUMMARY:END -->
