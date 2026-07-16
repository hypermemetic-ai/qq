---
id: T-22
title: Automate OpenWiki merge and make plan approval readable
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 19:10'
updated_date: '2026-07-13 20:09'
labels:
  - openwiki
  - bpmn
  - methodology
  - ux
dependencies: []
references:
  - 'https://github.com/hypermemetic-ai/qq/pull/61'
documentation:
  - doc-31
modified_files:
  - >-
    backlog/tasks/task-22 -
    Automate-OpenWiki-merge-and-make-plan-approval-readable.md
  - >-
    backlog/docs/plans/doc-31 -
    Plan-—-Automate-OpenWiki-merge-and-make-plan-approval-readable.md
  - backlog/docs/plans/assets/doc-31/plan-spec.json
  - backlog/docs/plans/assets/doc-31/plan.bpmn
  - backlog/docs/plans/assets/doc-31/plan.png
  - backlog/docs/plans/assets/doc-31/completions.json
  - backlog/docs/plans/assets/doc-31/conformance.md
  - skills/bpmn-plans/SKILL.md
  - skills/bpmn-plans/pipeline/README.md
  - skills/bpmn-plans/pipeline/lib/generate.mjs
  - skills/bpmn-plans/pipeline/lib/layout.mjs
  - skills/bpmn-plans/pipeline/lib/pipeline.mjs
  - skills/bpmn-plans/pipeline/lib/wiki.mjs
  - skills/bpmn-plans/pipeline/package-lock.json
  - skills/bpmn-plans/pipeline/package.json
  - skills/bpmn-plans/pipeline/test/pipeline.test.mjs
  - skills/openwiki-maintainer/SKILL.md
  - tests/test-bpmn-plans.sh
  - tests/test-openwiki-maintainer.sh
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove two operator-friction failures while preserving qq safeguards. The OpenWiki maintainer autonomously merges only its own green documentation-only Change after verifying review, checks, scope, and a still-current generation target. BPMN plan presentation happens exactly once only when the agent is ready with the approval question. Plan diagrams retain every work-specific action and decision, use plan-only balanced wrapping, and collapse inherited qq delivery mechanics into one call activity immediately before Green PR ready. Ordinary Changes still require operator merge; OpenWiki generation and correction behavior and OpenWiki diagram layout remain unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OpenWiki maintainer merges its own green documentation-only pull request without operator review, approval, or merge action, but only after final scope, review, checks, and target-freshness validation; stale or defective results regenerate or stop instead of merging.
- [x] #2 Ordinary Change delivery remains operator-merged; the autonomous-merge exception is confined to OpenWiki update Changes.
- [x] #3 The BPMN plan viewer opens exactly once per final plan version, only after generation, storage, linking, and verification are complete and alongside the approval prompt; intermediate and regenerated candidates do not open windows.
- [x] #4 Plan diagrams retain all task-specific steps, decisions, failure paths, and acceptance checks, while inherited qq delivery mechanics appear as one collapsed Complete qq Change delivery call activity immediately before Green PR ready.
- [x] #5 Plan-mode layout produces a balanced, readable render with traceable flow and readable labels without changing OpenWiki diagram publishing or layout, evidence, lint, conformance, or determinism.
- [x] #6 Focused automated checks cover autonomous OpenWiki merge policy and guards, exactly-once presentation, call-activity schema and rendering, plan-only wrapping, and OpenWiki layout isolation; operator UAT accepts one final approval presentation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Persist and obtain approval for the task-specific BPMN execution plan.
2. Confine autonomous merging to fresh, green, documentation-only OpenWiki maintainer pull requests.
3. Move plan presentation to the final approval boundary and enforce one open per final version.
4. Add a collapsed qq delivery call activity and balanced plan-only layout while preserving OpenWiki layout.
5. Verify policy, pipeline, determinism, isolation, and the visible approval experience; then complete normal Change delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a guarded, documentation-only OpenWiki self-merge using a verified two-parent commit and one ordinary non-force main update, so a concurrent main winner is rejected. Moved BPMN viewer launch to the verified approval boundary, added reusable callActivity generation, and introduced deterministic ELK wrapping only for plan mode while preserving the existing OpenWiki layout path. Independent review findings were fixed and exact deltas re-reviewed cleanly. Operator UAT accepted the single final plan presentation.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-07-13 19:18
---
BPMN plan doc-31 is stored and linked for approval. Pre-presentation verification passed with zero lint findings, lossless evidence round-trip, a 1158x707 balanced render, and byte-identical repeated semantic BPMN and PNG output. The final artifact has not yet been opened.
---

author: @operator
created: 2026-07-13 19:29
---
Operator approved doc-31 and authorized execution.
---

author: @codex
created: 2026-07-13 19:39
---
Operator UAT accepted the approval presentation: the final 1158x707 doc-31 plan opened once only after storage, linking, and verification, remained visible in xviewer beside the approval question, and the operator replied proceed. The implemented production plan path subsequently reproduced the approved semantic BPMN and PNG byte-for-byte; the unchanged plan was not reopened.
---

author: @codex
created: 2026-07-13 20:06
---
Fresh independent code review covered the complete implementation and exact post-fix deltas. Review caught and drove fixes for atomic stale-target publication, wide boundary-label overlap, and outgoing edges crossing labels; the final re-review reported no material findings. Fresh verification passes all 18 pipeline tests (including Chrome rendering), the six workflow wrapper tests, bash syntax, shellcheck, git diff --check, and byte-identical doc-31 reproduction at SHA-256 7258ce33f5f3f78966378d497f1bcdb95ca8d3faed0b6ff7c50b04f63b177ec7.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
OpenWiki maintainer PRs can now merge autonomously after exact head, scope, checks, and target-freshness guards; ordinary Changes remain operator-merged. BPMN plans retain work-specific detail, collapse generic qq delivery into Complete qq Change delivery, open once at approval, and render in a balanced plan-only layout with readable boundary labels and flows. PR #61 is open, mergeable, and clean; strict BPMN conformance accounts for all 20 nodes with no divergence.
<!-- SECTION:FINAL_SUMMARY:END -->
