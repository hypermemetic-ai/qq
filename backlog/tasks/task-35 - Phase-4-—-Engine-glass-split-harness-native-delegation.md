---
id: TASK-35
title: Phase 4 — Engine/glass split (harness-native delegation)
status: Done
assignee: []
created_date: '2026-07-14 05:10'
updated_date: '2026-07-14 21:16'
labels: []
dependencies:
  - TASK-34
documentation:
  - doc-38
  - doc-39
  - doc-40
  - doc-41
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-38 Phase 4: code-review and research delegate via harness-native subagents (fresh context by isolation), keeping only brief-composition and verification protocol; agent-messaging narrows to cross-runtime coordination and operator notifications; herdr retained as cockpit tooling only.

Folded review-governance rules (settled 2026-07-14, doc-39 and doc-40): review briefs must carry the Change's threat model with finding classes declared out of scope, and the loop must enforce a convergence circuit-breaker — sustained same-class findings across rounds stop the fix loop and escalate a design decision to the operator, instead of feeding a patch queue. Owned rules ride vendor injection surfaces (REVIEW.md for harness reviews; AGENTS.md review guidelines for codex reviewers). Graft candidates from the cited surveys, in rough priority: falsification gate (a finding needs a constructed failing scenario or is discarded), numeric confidence threshold with a versioned exclusion taxonomy, codex-rubric proportionality rule, K-of-N stability scoring for contested findings, fresh-session systemic audit after loop convergence, review-fed compound capture, periodic reviewer calibration against seeded-defect corpora. Benchmark the owned skill against the native /code-review on the same diffs to notice when the vendor laps it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 code-review and research run on harness-native subagents with no herdr pane lifecycle management
- [x] #2 agent-messaging covers only cross-runtime coordination and operator-visible notification
- [x] #3 Review briefs declare the Change's threat model and out-of-scope finding classes, and reviewer instructions ride the harness injection surfaces
- [x] #4 The review loop enforces the convergence circuit-breaker: sustained same-class findings across rounds halt fixes and escalate a design decision to the operator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered doc-38 Phase 4 as four tickets on feat/engine-glass-split. AC1 verified pre-satisfied by TASK-38 (grep sweeps: zero herdr references in code-review and research skill paths). AC2: agent-messaging rewritten to cross-runtime coordination of live agents plus operator notifications; delegate lifecycle removed with a reintroduction guard in tests/test-qq-herdr-home.sh. AC3: new REVIEW.md injection surface plus AGENTS.md review-guidelines routing; briefs must declare the Change's threat model with out-of-scope classes owner-declined by default. AC4: convergence circuit-breaker (third same-class confirmed finding halts fixes, escalates a design decision) and falsification gate in the review loop. Verification: shell suite 7/7 PASS and BPMN pipeline 0 fail (accountable agent's fresh runs on head); independent fresh codex review of 092beee..c19ad17 under the new injection surfaces returned no findings. Deferred graft candidates recorded in task notes; CONCEPTS.md glossary alignment left as compound follow-up. Done records the agreed work is complete; operator merge disposition pending.
<!-- SECTION:NOTES:END -->
