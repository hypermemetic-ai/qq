---
id: TASK-35
title: Phase 4 — Engine/glass split (harness-native delegation)
status: To Do
assignee: []
created_date: '2026-07-14 05:10'
updated_date: '2026-07-14 17:04'
labels: []
dependencies:
  - TASK-34
documentation:
  - doc-38
  - doc-39
  - doc-40
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-38 Phase 4: code-review and research delegate via harness-native subagents (fresh context by isolation), keeping only brief-composition and verification protocol; agent-messaging narrows to cross-runtime coordination and operator notifications; herdr retained as cockpit tooling only.

Folded review-governance rules (settled 2026-07-14, doc-39 and doc-40): review briefs must carry the Change's threat model with finding classes declared out of scope, and the loop must enforce a convergence circuit-breaker — sustained same-class findings across rounds stop the fix loop and escalate a design decision to the operator, instead of feeding a patch queue. Owned rules ride vendor injection surfaces (REVIEW.md for harness reviews; AGENTS.md review guidelines for codex reviewers). Graft candidates from the cited surveys, in rough priority: falsification gate (a finding needs a constructed failing scenario or is discarded), numeric confidence threshold with a versioned exclusion taxonomy, codex-rubric proportionality rule, K-of-N stability scoring for contested findings, fresh-session systemic audit after loop convergence, review-fed compound capture, periodic reviewer calibration against seeded-defect corpora. Benchmark the owned skill against the native /code-review on the same diffs to notice when the vendor laps it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 code-review and research run on harness-native subagents with no herdr pane lifecycle management
- [ ] #2 agent-messaging covers only cross-runtime coordination and operator-visible notification
- [ ] #3 Review briefs declare the Change's threat model and out-of-scope finding classes, and reviewer instructions ride the harness injection surfaces
- [ ] #4 The review loop enforces the convergence circuit-breaker: sustained same-class findings across rounds halt fixes and escalate a design decision to the operator
<!-- AC:END -->
