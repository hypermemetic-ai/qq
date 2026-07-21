---
id: T-91
title: Replace the Fable orchestrator with Pi-hosted Kimi K3
status: Done
assignee:
  - '@codex'
created_date: '2026-07-19 02:08'
updated_date: '2026-07-19 03:28'
labels: []
dependencies: []
references:
  - 'https://github.com/earendil-works/pi/releases/tag/v0.80.10'
  - 'https://www.kimi.com/code/docs/en/'
documentation:
  - doc-42
  - doc-51
priority: high
type: task
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Set up Pi as the accountable project-home Actor running Kimi K3, replacing the Claude Code Fable aligner/orchestrator role without losing alignment, Task/Change ownership, bounded Codex delegation, cold review/research, Herdr visibility, acceptance, or GitHub Flow handoff. Deliver the Repository adapters and the operator-machine setup together; retain Claude as a rollback fallback until parity Checks and owner UAT pass.

Decision ledger:
- The accountable Fable role, Codex-first execution split, and unchanged five gates — doc-42, including the 2026-07-16 universal dispatcher amendment.
- Pi migration posture: one phased accountable session, cold Codex review/research, no Pi MCP or subagents — doc-51 (operator-approved direction, 2026-07-17).
- Kimi Code provider kimi-coding/k3 at max thinking; staged coexistence with Claude fallback; one credential named pi-qq stored only in Pi private auth; Repository and machine boundary stated in the alignment brief — operator-approved alignment exchange in this session, 2026-07-18 ("yes, proceed"). Live Zen inspection confirmed Vivace membership, K3 access, and up-to-1M context before approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pi 0.80.10 or newer is installed; a 0600 private auth entry selects authenticated kimi-coding/k3 at max thinking and a live tool-capable request succeeds.
- [x] #2 Pi loads the canonical AGENTS.md and the mounted qq Skill set; the Pi-era codebase-memory CLI route and no-MCP/no-subagent orchestration posture preserve the existing role boundary.
- [x] #3 A Pi-native path-only guard gives local feedback for direct write/edit attempts under managed backlog/ while ordinary Backlog CLI operations remain available.
- [x] #4 Herdr detects Pi lifecycle state, and qq-herdr-snap prefers the project-home Pi Actor while retaining Claude and sidebar-order fallbacks.
- [x] #5 Fresh capability probes cover alignment-before-mutation, engine access, delegation/review/research routes, Herdr visibility, and protected delivery boundaries; focused and full Repository Checks pass.
- [x] #6 The operator explicitly accepts the live Pi/K3 project-home experience through UAT before final pull-request handoff.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Isolate a Change worktree/session from current T-88 and T-90 work.
2. Install Pi 0.80.10 or newer, create and privately store the pi-qq Kimi Code credential, select kimi-coding/k3 at max thinking, and install the Herdr Pi integration.
3. Add the smallest Repository-owned Pi adapter, runtime-neutral codebase-memory guidance, bootstrap documentation, and Pi-first/Claude-fallback snap behavior with focused tests.
4. Run authenticated capability and parity probes, all affected repository Checks, and fresh-context code review; resolve only confirmed in-scope findings.
5. Run owner UAT in a live Herdr Pi pane, finalize the Task, and deliver one green pull request.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification before UAT (2026-07-19 UTC):
- Pi 0.80.10 is installed; private auth mode is 0600; settings select kimi-coding/k3 with max thinking. Native model discovery reports 1.0M context, thinking, and image support. An authenticated live request returned PI_K3_OK, and the live backlog write probe exercised the model tool path.
- Live parity probes passed for alignment-before-mutation, Pi-loaded AGENTS/Skills, accountable-engine role boundaries, the path-only managed-backlog guard, and Herdr project-home Pi discovery/snap.
- qq-dispatch was exercised with a bounded Codex implementer and two cold reviewers; the exact post-fix delta 93e9b42..9f0cfa8 received PASS with no material findings. Researcher inspect passed with qq-researcher, MCP on, and no writable roots.
- All 13 shell tests, ratchet, Bash/Node syntax, ShellCheck, and git diff checks passed at 9f0cfa8; the Change worktree is clean.
- Fresh protected-delivery probes passed: C2 rejected qqp-bot direct push and left main at 93e9b42; C1 made scratch PR #142 green, rejected the bot merge with HTTP 405, then closed the PR and deleted its branch/worktree.
- Remaining gate: explicit operator UAT, followed by Task finalization and green PR handoff.

Operator UAT observation: "nope, doesn’t work" when asked to press Alt+O. Reproduction found the long-lived Herdr server PATH could not resolve qq-herdr-snap (status 127): the server predates the shell PATH mount and ~/.local/bin had no compatibility link. Staged a reversible ~/.local/bin/qq-herdr-snap link to the reviewed T-91 worktree script; resolution under the exact server PATH now succeeds and dry-run selects wM:p2T (Pi). Awaiting the repeated operator check.

Repeated UAT after the compatibility-path fix: the operator reported, "it works exactly as you said. marvelous." Alt+O from the Codex tab landed on the project-home Pi tab with the expected K3 max-thinking experience. AC #6 is accepted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Installed Pi 0.80.10 with private Kimi K3/max authentication and Herdr lifecycle integration; mounted the canonical qq Skills; added the Pi managed-backlog guard, executable codebase-memory CLI guidance, and Pi-first snap behavior with Claude/sidebar fallbacks. Verified authenticated model/tool use, alignment and engine boundaries, guard feedback, Codex implementer/reviewer/researcher routes, Herdr visibility, protected GitHub delivery rails, the full shell suite, ratchet/syntax/static checks, and an exact-delta cold rereview. After a stale Herdr server PATH exposed the missing command at UAT, preserved the generated runtime assets, staged a reversible compatibility link, repeated the check, and received explicit operator acceptance of Alt+O landing on Pi/K3.
<!-- SECTION:FINAL_SUMMARY:END -->
