---
id: T-106
title: Retire Claude Code support surfaces
status: To Do
assignee: []
created_date: '2026-07-19 17:50'
labels: []
dependencies:
  - T-95
priority: medium
type: chore
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator decision: qq no longer supports Claude Code. Remove the Claude-specific surfaces across the Repository. Sequenced after T-95 so the delegate-batch/deliver-change rewrites land first; this ticket then removes Claude paths from the already-migrated skills plus everything else, keeping one writer per file.

Seed inventory (verify fresh, complete it, then execute):
- bin/qq-claude-backlog-hook (retire wholesale)
- .claude/settings.json and .claude/settings.local.json
- bin/qq-herdr-snap claude fallback (Pi-first selection becomes Pi-only)
- README.md mount story (Pi + Codex, no Claude Code)
- cockpit/README.md and cockpit/herdr/config.toml claude references
- skills/delegate-batch and skills/deliver-change Claude-subagent escape hatch
- tests exercising Claude behavior (test-qq-herdr-snap.sh claude cases, probe scripts; dated evidence files under tests/probes/evidence/ stay as historical artifacts)
- any further references found by fresh grep outside backlog/ historical docs

Related: T-97 already treats CLAUDE.md as upstream's managed file only; agent-messaging (T-98) stays runtime-agnostic (pi + non-pi) with no Claude-specific semantics to remove.

Decision ledger:
- qq does not support Claude Code; all Claude-specific surfaces retire: operator instruction ('we won't support claude anymore so no need for claude md anywhere'), asked-and-answered alignment exchange, 2026-07-19 alignment session; ticket created on '106 approved' in the same session.
- Sequencing after T-95 (skill rewrites first; one writer per file): 2026-07-19 alignment session recommendation, approved with this ticket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seed inventory verified fresh and completed; every Claude-specific surface removed or amended; no Claude references remain outside backlog/ historical records and dated test evidence
- [ ] #2 Tests updated and green; README and skills reflect the Pi + Codex mount story
- [ ] #3 delegate-batch and deliver-change contain no Claude-subagent path once T-95 has landed
<!-- AC:END -->
