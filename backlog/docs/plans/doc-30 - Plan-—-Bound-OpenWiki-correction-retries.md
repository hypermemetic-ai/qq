---
id: doc-30
title: Plan — Bound OpenWiki correction retries
type: other
created_date: '2026-07-13 16:16'
updated_date: '2026-07-13 17:00'
---
T-21 plan for replacing OpenWiki's unbounded whole-generation correction loop with proportional diagram-bundle rejection and a one-retry ceiling. Internal generator semantic authorship, single-writer locking, and reset-on-new-main behavior remain unchanged.

![Plan — Bound OpenWiki correction retries](assets/doc-30/plan.png)

The deterministic source specification is `assets/doc-30/plan-spec.json`; the semantic BPMN is `assets/doc-30/plan.bpmn`.

## Conformance

# BPMN conformance report

Plan: /home/qqp/.herdr/worktrees/qq/fix-openwiki-bounded-retries/backlog/docs/plans/assets/doc-30/plan.bpmn

## Summary

- Flow nodes: 16
- Accounted: 16
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| intent_aligned | Bounded repair approved | StartEvent | done | Evidence: T-21 comment #1 and doc-30<br>Note: The operator approved the rendered BPMN plan before implementation. |
| rewrite_maintainer_policy | Bound maintainer recovery | ServiceTask | done | Evidence: skills/openwiki-maintainer/SKILL.md<br>Note: Recovery now separates optional diagram rejection, bounded correction, evidence preservation, and bounded upstream retry. |
| revise_generator_guidance | Ground diagram acceptance | ServiceTask | done | Evidence: bin/qq-openwiki<br>Note: The internal prompt now requires semantic edge tracing, actual embed/full-resolution readability, standalone links, and narrative independence. |
| update_focused_checks | Update focused checks | ServiceTask | done | Evidence: tests/test-qq-openwiki.sh<br>Note: Focused assertions observe every added generator-guidance invariant. |
| run_local_checks | Run local checks | ServiceTask | done | Evidence: T-21 implementation notes and PR #58 body<br>Note: Wrapper and BPMN tests, syntax, shellcheck, Skill validation, deterministic plan generation, pipeline tests, and diff checks passed. |
| local_checks_green | Local checks green? | ExclusiveGateway | done | Evidence: T-21 implementation notes and PR #58 body<br>Note: All applicable local Checks passed on the final reviewed implementation. |
| fix_local_failures | Fix in-scope failures | ServiceTask | skipped | Note: No implementation failure occurred; the unavailable python alias was immediately rerun with the installed python3 interpreter. |
| fresh_context_review | Independent review | UserTask | done | Evidence: T-21 implementation notes<br>Note: A fresh read-only reviewer inspected the exact staged Change and each post-fix delta. |
| confirmed_findings | Confirmed findings? | ExclusiveGateway | done | Evidence: T-21 implementation notes<br>Note: Two initial findings and one exact-delta preservation finding were confirmed; the final exact-delta review returned no material findings. |
| fix_review_findings | Fix confirmed findings | ServiceTask | done | Evidence: skills/openwiki-maintainer/SKILL.md and backlog/docs/plans/assets/doc-30/plan-spec.json<br>Note: Verification moved ahead of deletion, plan evidence was corrected, and bundle rejection became transactionally reversible. |
| commit_green_change | Commit green change | ServiceTask | done | Evidence: git commit f0efe31<br>Note: The reviewed green implementation and approved plan were committed as one coherent unit. |
| open_pull_request | Push and open PR | ServiceTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/58<br>Note: The branch was pushed and one pull request was opened against main. |
| run_github_checks | Run GitHub checks | ServiceTask | done | Evidence: gh pr view/checks for PR #58 on 2026-07-13<br>Note: GitHub reported no configured status checks. |
| pull_request_green | Pull request green? | ExclusiveGateway | done | Evidence: PR #58 state OPEN, mergeable MERGEABLE, mergeStateStatus CLEAN, statusCheckRollup empty<br>Note: The pull request reached the plan's green handoff boundary. |
| fix_pr_failures | Fix PR failures | ServiceTask | skipped | Note: No GitHub-side Check or mergeability failure was reported. |
| green_handoff | Green PR ready | EndEvent | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/58<br>Note: PR #58 is open, unmerged, mergeable, CLEAN, and ready for Task finalization and operator handoff. |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
