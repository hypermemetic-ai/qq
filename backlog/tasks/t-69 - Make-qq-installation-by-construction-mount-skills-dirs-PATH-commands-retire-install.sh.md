---
id: T-69
title: >-
  Make qq installation by-construction: mount skills dirs, PATH commands, retire
  install.sh
status: In Progress
assignee: []
created_date: '2026-07-17 01:32'
updated_date: '2026-07-17 01:32'
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
- [ ] #1 bin/install.sh is deleted; tests/test-install-flags.sh and tests/test-install-cleanup.sh are retired with it; tests/test-qq-herdr-home.sh no longer asserts installer contents; every remaining tests/test-*.sh passes locally
- [ ] #2 cockpit/shell/file-navigation.bash prepends $QQ_HOME/bin to PATH idempotently: sourcing it twice leaves exactly one $QQ_HOME/bin entry, and command -v qq-herdr-home resolves under $QQ_HOME/bin ahead of ~/.local/bin
- [ ] #3 README's Install section documents the day-0 bootstrap (two skills-dir symlinks, one .bashrc source line, cockpit config links) and states that skill/command membership changes need no further action; cockpit/README.md no longer references install.sh
- [ ] #4 Machine state verified: ~/.claude/skills and ~/.codex/skills resolve to the checkout's skills/ and a fresh shell lists the qq commands from $QQ_HOME/bin
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
