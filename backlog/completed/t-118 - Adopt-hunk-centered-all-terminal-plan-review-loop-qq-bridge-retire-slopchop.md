---
id: T-118
title: Adopt hunk-centered all-terminal plan/review loop + qq bridge; retire slopchop
status: Done
assignee: []
created_date: '2026-07-20 03:29'
updated_date: '2026-07-20 05:20'
labels: []
dependencies: []
priority: high
type: task
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Approved alignment brief (asked-and-answered, 2026-07-19 project-home session, 'approved, yes'): land the all-terminal plan/review loop per doc-69 + its operator-verdict addendum.

User settings (orchestrator-applied, not in the PR): add pinned npm:@juicesharp/rpiv-ask-user-question@1.20.0 and npm:@roodriigoooo/pi-hunk@0.8.0; REMOVE pi-slopchop (partial T-110 reversal). hunk 0.17.3 already brew-installed and pinned (T-117).

Repo-side (this PR): (1) new qq-owned bridge extension under cockpit/pi/ implementing: plan-phase gate via pi tool_call hook (same pattern as cockpit/pi/qq-backlog-guard.ts — block write/edit + non-allowlisted bash during plan phase; fail closed); plan-round snapshots under .pi/plans/ (numbered; empty baseline for round 0); hunk presentation for plan review and round-diffs; approval handoff that joins pi-hunk's submit semantics to execution entry; (2) slopchop references in deliver-change SKILL.md / AGENTS.md / cockpit README updated to the new review surface; (3) bridge Checks following tests/ conventions; ratchet budgets adjusted only if prose trips. grilling slimming is explicitly a SEPARATE fast-follow Change, not this one.

Decision ledger:
- hunk+pi-hunk owns the review surface (plans and code); revdiff and pi-openplan NOT adopted: operator decision 2026-07-19 after agent-operated demo reel (doc-69 addendum).
- Revised architecture — rpiv-ask-user-question cards + bridge-owned phase gate + hunk review: operator approval, asked-and-answered alignment exchange, 2026-07-19 project-home session ('approved, yes').
- slopchop retired in this same Change (partial T-110 reversal): same exchange.
- rpiv cards over openplan bundle; openplan dropped, bridge owns phase gate; accepted loss of per-step execution pause gates (approval-before-execution and review-before-landing remain): same exchange.
- grilling slimming deferred to a separate fast-follow Change: same exchange.
- Plan artifacts under .pi/plans/, never under backlog/: T-101 convention + doc-54, guard-enforced (doc-69 AC#5).
- Version pins rpiv-ask-user-question@1.20.0, pi-hunk@0.8.0, hunk 0.17.3: same exchange (named in the approved brief).
- pi-plan-mode stays dropped (T-107 disposition): no action.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bridge extension under cockpit/pi/ loads on pi 0.80.10 and its Checks pass: phase gate blocks write/edit and non-allowlisted bash in plan phase, allows them in execute phase (probe test); plan-round snapshots land under .pi/plans/ (numbered, empty baseline round 0); zero writes under backlog/
- [x] #2 User settings applied by orchestrator and recorded: rpiv-ask-user-question@1.20.0 and pi-hunk@0.8.0 pinned present; pi-slopchop removed; combined smoke on pi 0.80.10 — ask_user_question tool present, /hunk commands respond, bridge loads, baseline packages (rpiv-todo, fff, files-widget, footer, intercom) unaffected
- [x] #3 slopchop references in deliver-change SKILL.md, AGENTS.md, and cockpit README updated to the new review surface; repo Checks (tests/, ratchet) green
- [x] #4 PR green with code-review findings resolved; this Task finalized inside the Change
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DONE 2026-07-19. Bridge extension cockpit/pi/qq-plan-loop.ts landed with probe coverage: fail-closed planning phase (write/edit realpath-contained to .pi/plans/, NO bash after the round-3 circuit-breaker, allowlisted extension tools), numbered plan-round snapshots with empty round-0, herdr-tab hunk review with daemon comment polling (true-timestamp capture), explicit ctx.ui.select Approve/Request-changes/Abandon with no auto-approval path. Three fresh-context review rounds resolved (incl. allowlist→no-bash layer escalation); post-review live smoke verified the full loop on pi 0.80.10 (submit→snapshots→extension-launched tab→comment capture→request-changes→round 2→approve→executing). User settings applied by orchestrator: rpiv-ask-user-question@1.20.0 + pi-hunk@0.8.0 pinned in, pi-slopchop out; baseline packages verified unaffected. deliver-change wording now names pi-hunk as the operator review checkpoint. Residuals (v1, declared): process-local phase state; final-instant comment loss pending upstream hunk export-on-quit. Bridge settings extensions entry lands post-merge. grilling slimming is the separate fast-follow Change. PR #158.
<!-- SECTION:FINAL_SUMMARY:END -->
