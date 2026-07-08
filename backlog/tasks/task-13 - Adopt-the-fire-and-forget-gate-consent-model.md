---
id: TASK-13
title: Adopt the fire-and-forget gate consent model
status: Done
assignee: []
created_date: '2026-07-08 17:12'
updated_date: '2026-07-08 18:01'
labels: []
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator decision 2026-07-08 (grilled end-to-end): the gate experience must be materially faster AND fire-and-forget before the operator lands anything again. Adopted: (1) agent owns the run — landings driven by 'no-mistakes axi run --intent "<task + AC>"'; ask-user findings park and the landing agent relays, never the operator; (2) auto_fix.review: 3 + ignore_patterns openwiki/** in .no-mistakes.yaml; (3) binary updated v1.31.2 → v1.34.0; (4) re-measure the empty-CI 22-min watch on v1.34 — if it persists, bake skip=ci into the landing procedure until qq has real CI; (5) author-side code-review keeps both axes (complementary to gate review, audited for duplication); (6) frontier/slice model adopted as destination: task-level frontier lands via task-4, task-8 is the one-feature slicing pilot. Methodology + finishing-a-development-branch updated. AC#3 EVIDENCE (run 01KX1BHNCS8ZVVG3KQP7SPN02N, v1.34.0): ci step 758,821 ms (~12.6 min) polling a repo with zero CI — log loops 'warning: could not check CI: gh pr checks: exit status 1'; ended early only because the operator merged mid-watch. v1.34 does NOT fix the empty-CI wait → decision (4) activates: --skip ci baked into finishing-a-development-branch until qq has real CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Landing procedure in methodology + finishing skill names axi run --intent and the relay protocol (evidence: qq-methodology.md "The landing agent owns the run" and skills/finishing-a-development-branch/SKILL.md Option 1 in this branch diff)
- [x] #2 auto_fix.review and ignore_patterns effective on this landing's own gate run (evidence: .no-mistakes.yaml config applied here; NM-001 entered the auto-fix loop and was fixed without parking)
- [x] #3 ci-step duration on v1.34 measured and recorded on this task
<!-- AC:END -->
