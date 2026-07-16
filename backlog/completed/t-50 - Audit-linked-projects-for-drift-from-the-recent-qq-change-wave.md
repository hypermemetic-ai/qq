---
id: T-50
title: Audit linked projects for drift from the recent qq change wave
status: Done
assignee: []
created_date: '2026-07-16 03:18'
updated_date: '2026-07-16 03:58'
labels: []
dependencies: []
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
qq's operator-global surfaces serve every project on this machine: skills symlink into ~/.claude/skills, bin helpers sit on PATH, and the cockpit config symlinks into ~/.config — deciq alone had three live work sessions during the 2026-07-15 session. The recent change wave (Phase-4 engine/glass split, delegate-batch, deliver-change diet rounds, the delegate status surface config with sidebar token rows and popup bindings, direct-navigation keybindings, glossary sweeps) changed shared behavior that linked projects may silently depend on or lack required structure for: project-home and dedicated-board-tab conventions, work-session labels, and display-specific cockpit assumptions such as the popup geometry tuned against one terminal's 104x33 tiled area. Inventory the linked projects and check each qq contact point.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An inventory of linked projects (repositories with qq-managed homes, boards, or live sessions) exists with evidence
- [x] #2 Each inventoried project is checked against the recent qq changes' contact points — skills, bin helpers, cockpit config, home and board conventions — with an explicit per-project statement
- [x] #3 Regressions or gaps are fixed in place when trivial, otherwise filed as their own tickets
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Audit record — 2026-07-16

The owner verified every reported surface directly on this machine.

### Managed-surface map verdict

- **All managed surfaces OK:** all 12 skill links in `~/.claude/skills` and all 12 in `~/.codex/skills` point to the qq main checkout.
- **Cockpit surfaces current:** `yazi.toml`, the yazi keymap, smart-enter plugin, `glow.yml`, glow `tuned.json`, herdr `config.toml`, and shell `file-navigation.bash` sourced from `~/.bashrc`.
- **Commands current:** all five links in `~/.local/bin` (`qq-herdr-home`, `qq-herdr-pull`, `qq-herdr-snap`, `qq-openwiki`, and `qq-openwiki-bpmn`). The BPMN pipeline's `node_modules` are present.
- **Scope confirmation:** `qq-claude-guard` is deliberately not managed by `bin/install.sh`; it is qq's project-scoped `PreToolUse` hook, with no guard installed in other projects or global settings.

### Linked-project inventory

- **deciq — full linkage:** herdr project home `w1Y` with a board tab, a Backlog board, `AGENTS.md` and `CLAUDE.md` symlinked to qq's `AGENTS.md`, two live work sessions, and 16 registered worktrees.
- **deciq-logic — partial linkage:** `AGENTS.md` symlinked to qq, a Backlog board, no herdr project home, and one orphaned standalone clone.
- **qq — owning project:** all managed and project contact surfaces are current.
- **Not linked:** rim, rim-qq-evaluation (an inert archive), discuss, everything-box, and ytgrab.

### Per-project contact points and classified gaps

- **deciq:** skills, bin helpers, cockpit config, project home, and board convention have no gap. Shared docs do not drift because their symlinks propagate canonical changes automatically. Non-trivial contract gaps require a follow-up: the repo has no root `REVIEW.md` although shared `AGENTS.md` mandates it, and the shared codebase-memory section over-promises because deciq enables only context7 and recall-ai. Operational cleanup also requires a follow-up: 12 of 16 registered worktrees are on branches already merged to `main`, about 20 merged local branches remain, and `feat/task-22-logic-promotion` is stalled and unmerged. No live documentation carries stale pre-change-wave behavior: `no-mistakes`/`qq-gate` hits are historical archives; live `qq-check.yml` is functional and only retains gate-era naming.
- **deciq-logic:** skills, bin helpers, and cockpit config have no gap. Project-convention gaps require follow-up or an explicit decision: it has a Backlog board but no herdr home (`found 0`), no `REVIEW.md`, no `openwiki/`, and no enabled codebase-memory-mcp despite the shared mandates. It also lacks a `CLAUDE.md` symlink, part of an inconsistent cross-project convention. The orphaned standalone clone at `~/.herdr/worktrees/deciq-logic/task-22` is a real `.git` clone, clean, on `feat/task-22-publish-workflow`, and is the only copy of four commits ahead of `origin/main`: `af45e0a`, `f12d1a0`, `d8132d9`, and tip `afbcb85` (`fix: harden the release canary contract`). Origin has no such branch. This is a high-priority recovery gap: do not delete the clone before the work is pushed or explicitly declined.
- **qq:** skills, bin helpers, cockpit config, home, board, and shared project surfaces are all OK.

### Display geometry

Popup bindings are hard-tuned to 74x29 against the measured 104x33 tiled area. Every live layout showed the same area. There is no evidence of a second geometry, but history cannot prove one was never used, so the exposure is theoretical rather than a demonstrated regression.

### Applied trivial fix and judgment flags

- Removed the stale empty `~/.herdr/worktrees/meeting-reviewer/` directory in-session; this was the only trivial in-place fix.
- Recorded without action: the `CLAUDE.md` → `AGENTS.md` symlink convention is inconsistent (deciq has it; qq and deciq-logic do not).
- Recorded without action: popup file-navigation bindings `qqy`/`qqbr` always target the qq root from any project; whether that is intentional or a per-project gap remains an owner judgment.
- Recorded without action: renaming deciq's functional `qq-check.yml` workflow to `ci.yml` would be cosmetic churn.

### Filed follow-ups

- **T-52 (High):** deciq-logic: recover or retire the stranded task-22 work.
- **T-53 (Medium):** deciq: sweep merged worktrees and branches.
- **T-54 (Medium):** Make the shared AGENTS.md degrade gracefully for consumers.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the owner-verified 2026-07-16 linked-project drift audit. All qq-managed global surfaces are current; linked-project inventory, per-project contact-point statements, classified gaps, geometry exposure, judgment flags, and the in-session `meeting-reviewer` cleanup are captured. Filed T-52 for stranded deciq-logic work, T-53 for deciq worktree/branch cleanup, and T-54 for shared AGENTS.md consumer mandates. All three acceptance criteria were verified through the Backlog CLI.
<!-- SECTION:FINAL_SUMMARY:END -->
