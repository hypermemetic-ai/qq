---
id: T-106
title: 'Retire legacy engine support surfaces (Claude Code, codex CLI)'
status: Done
assignee: []
created_date: '2026-07-19 17:50'
updated_date: '2026-07-21 15:20'
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

EXTENDED 2026-07-21 (operator direction, same realignment exchange): the codex CLI's residual support surfaces join this retirement. qq delegates run on the openai-codex MODEL PROVIDER (GPT-5.6) — that stays, and is not the CLI. The CLI surfaces to retire: README's codex Skill mount and migration prose, the stale 'and Codex' mention in the QQ_<TOOL>_BIN resolver sentence, and 'codex' fixture agent labels in herdr tests (rename to a generic non-pi label). Retirement tripwires (tests/test-qq-dispatch.sh codex-profiles absence check, ratchet codex_exec budget) STAY as drift-nets; dated test evidence stays historical. Machine-side: the ~/.codex/skills symlink is removed at delivery (owner-side enactment; delegates are confined). Implementation is delegated to a subagent per operator instruction.

Decision ledger addition:
- Codex CLI surfaces join the retirement; provider surfaces (openai-codex model pin, extensions/qq-codex-fast.ts, OAuth login) and retirement tripwires stay; implementation delegated to a subagent — operator direction, asked-and-answered exchange 2026-07-21 ('Retire CLI surfaces only', 'this should probably be combined with the claude retirement ticket', 'just make sure you delegate the implementation itself. to a subagent.').
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Seed inventory verified fresh and completed; every Claude-specific surface removed or amended; no Claude references remain outside backlog/ historical records and dated test evidence
- [x] #2 Tests updated and green; README and skills reflect the Pi + Codex mount story
- [x] #3 delegate-batch and deliver-change contain no Claude-subagent path once T-95 has landed
- [x] #4 Codex CLI surfaces retired per the 2026-07-21 extension; no codex-CLI references remain outside backlog/ historical records, dated test evidence, retirement tripwires, and the retained openai-codex provider surfaces
- [x] #5 Shell test suite green after the codex-CLI retirement
- [x] #6 Machine-side ~/.codex/skills mount removed at delivery (owner-side enactment, recorded in the final summary)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Codex-CLI half delivered 2026-07-21 via wave-2 delegate batch: 6b2628e retires the install/mount/resolver surfaces and migrates fixtures (acceptance grep 64→46, remainder classified keep-list/historical/counter-name/removal-instruction). Confined review APPROVE: keep-list byte-identical, fixture inverse-substitution reproduces parents byte-for-byte, counters 0/0. Owner native full suite + ratchet green. AC#6 (remove machine-side ~/.codex/skills) is owner delivery work at merge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered in two halves: Claude Code surfaces via PR #177 (AC#1-3); codex CLI surfaces via PR #190 (AC#4-5: install/mount/resolver prose retired, fixtures migrated to other-agent, acceptance grep 64→46 all-classified; codex PROVIDER surfaces kept per operator scope: openai-codex/gpt-5.6-sol:xhigh pins, extensions/qq-codex-fast.ts). AC#6 completed 2026-07-21: machine-side ~/.codex/skills symlink (pointing into this checkout) removed by the owner after merge. Confined review APPROVE with keep-list byte-identity and fixture inverse-substitution evidence; owner native suite + ratchet green at merge.
<!-- SECTION:FINAL_SUMMARY:END -->
