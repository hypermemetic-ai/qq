---
id: TASK-21
title: Bound OpenWiki correction retries and reject defective diagram bundles
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-13 16:15'
updated_date: '2026-07-13 17:39'
labels:
  - openwiki
  - methodology
  - bug
dependencies: []
documentation:
  - doc-30
modified_files:
  - bin/qq-openwiki
  - skills/openwiki-maintainer/SKILL.md
  - tests/test-qq-openwiki.sh
  - tests/test-openwiki-maintainer.sh
priority: high
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator finding from the first live BPMN-bearing OpenWiki refresh: a complete generation produced independently verified narrative pages plus optional diagrams with material semantic edge errors. The maintainer contract converted those local diagram failures into an unbounded whole-wiki discard/regenerate loop, while subjective panoramic guidance also encouraged cosmetic rejection. Preserve internal-generator semantic authorship and the single-writer/main-supersede design, but make verification failures proportional and bounded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A materially defective optional diagram is rejected as one complete JSON/BPMN/PNG/Markdown-link bundle without discarding independently verified narrative output; the outer maintainer never rewrites diagram semantics.
- [ ] #2 For a complete generated result with material findings, the maintainer gives the internal generator one consolidated correction brief against the current generated set, verifies the correction, and uses another round only when evidence identifies a remaining material defect with a clear remedy; it stops and preserves evidence when corrections cease to converge.
- [ ] #3 Incomplete or failed generation and a newer landed main still reset and regenerate from current origin/main, preserving the single-writer and supersede-in-place decisions.
- [ ] #4 Diagram acceptance is based on material semantic correctness, source evidence, and actual readability at the embed plus linked full resolution; aspect ratio alone is not a rejection condition.
- [ ] #5 Focused methodology Checks plus fresh-context code review pass before the follow-up Change is committed or published.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the complete-result whole-generation retry rule with consolidated in-place correction by the internal generator. 2. Make another correction round conditional on a verified material defect, a clear remedy, and continued convergence; exclude polish-driven rounds. 3. Add focused policy assertions and run Skill and Repository Checks. 4. Obtain fresh-context review, deliver the follow-up through one pull request, and re-finalize TASK-21.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The live maintainer's final corrected result was preserved without delivery after two confirmed P1 defects. That observed state exercises the new precedence: because a narrative defect remained after the allowed correction, the complete result—including its bad diagram—must stay intact as evidence rather than being reset, rerun, or partially deleted.

A fresh-context read-only forward test of the revised Skill covered three realistic states with no supplied expected answer: diagram-only failure, a corrected result with mixed narrative and diagram defects, and two consecutive upstream failures. It deterministically selected bundle rejection and continued verification for the first, complete evidence preservation and operator stop for the second, and clean stop without a third generator call for the third; it reported no ambiguity.

Fresh-context review found two confirmed issues: optional bundle deletion preceded later scope/documentation/review checks and could destroy mixed-defect evidence; and the plan's principal policy node cited a stale Skill range. The recovery workflow now completes all local verification and fresh review on the intact generated set before any bundle deletion, then reviews only the exact removal delta. The plan node now cites TASK-21 acceptance criteria directly and the semantic BPMN was regenerated.

Exact-delta review found that bundle deletion was still irreversible if its own checks failed on an already-corrected result. Bundle rejection is now transactional: after full-set verification, the maintainer stages the intact scope-checked generated result as a non-deliverable index snapshot, reviews the unstaged removal against it, replaces the snapshot only after green checks/review, and otherwise restores and unstages the complete evidence before entering the bounded correction/stop branch.

A focused forward test of the removal-failure branch restored the worktree from the staged snapshot before unstaging, preserved the complete corrected result and review evidence, prohibited reset/rerun/commit/push, and reported no ambiguity. The same fresh-context reviewer then inspected the exact transactional correction and returned no material findings: the staged index preserves new and modified bundle files plus the Markdown link, git diff -- exposes the removal, and the required restore order reaches the stop branch with intact uncommitted evidence.

Final validation: tests/test-qq-openwiki.sh and tests/test-qq-openwiki-bpmn.sh passed; affected Bash syntax and shellcheck passed; quick_validate.py reported the Skill valid; BPMN pipeline passed 16/16 tests; doc-30 regenerated with zero lint errors and a lossless evidence round trip; strict conformance accounted for 16/16 flow nodes with zero divergence or unknowns; git diff checks passed; final fresh-context exact-delta review returned no material findings; PR #58 is OPEN, MERGEABLE, CLEAN, with no configured GitHub checks.

Operator clarification after PR #58: the one-correction cap was an overconstraint. Review feedback should drive consolidated correction of the current generated set, with additional rounds available only while evidence shows material convergence; the rule should not prescribe whole-result discard or invite a prolonged review loop.

Fresh-context forward testing applied the revised Skill to three correction states. It selected a second round only after a first round materially reduced verified findings and left a clear remedy; rejected a cosmetic-only round; and stopped with the staged baseline plus attempted delta intact when findings did not improve and a comparable defect appeared. Its only initial ambiguity was that exact-delta review did not explicitly name code-review or untracked files. Step 8 now requires code-review on the exact correction delta, including untracked files, against the staged baseline; the same tester confirmed the ambiguity was resolved with no new material conflict.

The installed OpenWiki agent prompt explicitly instructs update runs to account for uncommitted local changes, confirming that correction against a staged generated baseline is supported upstream; the prior clean-worktree restriction existed in qq-openwiki. Final local checks passed: the policy regression, wrapper integration, activation, BPMN wrapper, and herdr-pull suites; Bash syntax; shellcheck; Skill quick validation; and git diff checks. Fresh-context code review of the exact working-tree Change returned no material findings.

Live-run observation during the follow-up exposed the rollout race: after acknowledging the operator clarification, the abf100 maintainer still followed the landed PR #58 rule and reset/cleaned its first generated result before starting the already-running whole-set correction. That discarded set was no longer recoverable. The maintainer was instructed to finish the active generator, preserve its output, and perform no further reset, clean, or whole-set correction before the follow-up workflow lands.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-07-13 16:25
---
Operator approved the rendered doc-30 BPMN plan on 2026-07-13. Implementation may proceed within its preserved-authorship and single-writer boundary.
---

author: @codex
created: 2026-07-13 16:30
---
Explicit non-goals from alignment: do not change the platform-level progress-update cadence, OpenWiki provider/model, BPMN schema/layout/publisher, activation, single-writer locking, internal-generator semantic authorship, or supersede-on-new-main behavior.
---

author: @codex
created: 2026-07-13 17:18
---
Reopened after operator review of the landed behavior: acceptance criterion 2 encoded an arbitrary one-correction cap and whole-result discard that were not intended. The follow-up preserves bounded convergence without a numeric review-round limit.
---
<!-- COMMENTS:END -->
