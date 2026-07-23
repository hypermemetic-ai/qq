---
id: T-145
title: >-
  Two-class subagent recovery rule — resume on infrastructure failure, fresh
  dispatch on conclusion states
status: Done
assignee: []
created_date: '2026-07-23 00:42'
updated_date: '2026-07-23 03:27'
labels: []
dependencies: []
type: enhancement
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code-review skill's step 10 ('Dispatch error, nonzero result, missing/invalid structured output, or context gap is not review. Dispatch the unchanged or minimally completed brief fresh.') and the research skill's sibling line ('Relaunch unchanged briefs after dispatch failure') conflate infrastructure failure with conclusion contamination. Fresh dispatch exists to protect fresh-context independence; a substrate crash (sandbox kill, API error, timeout with intact session) taints no conclusions, so resuming preserves both independence and the child's work — demonstrated twice on 2026-07-22 (researcher timeout resume, implementer crash resume; both completed). Operator called the blanket rule out as wrong (2026-07-22).

Rule shape (approved by the operator in the same exchange): infrastructure failure (sandbox kill, API error, timeout with intact session) → resume the same child with the minimally completed brief; terminal conclusion states (nonzero result with findings already formed, invalid structured output, context-gap report) → dispatch fresh, because the context now carries partial conclusions and independence is what is being protected. Amend both skills; the amendment must keep the prose ratchet green (replace text, do not grow — the budget sits exactly at measured).

Decision ledger: the two-class recovery rule and its application to both skills — operator directive + asked-and-answered alignment exchange, accountable project-home session 2026-07-22 ('that's a stupid bit in the skill if it asks you to dispatch fresh for any error'; proposed two-class shape approved: 'just mint the task').
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 code-review skill step 10 amended to the two-class recovery rule
- [ ] #2 research skill relaunch line amended to the two-class recovery rule
- [ ] #3 Prose ratchet green (amendment replaces text without growing budgets, or carries an explicit operator-approved raise)
- [ ] #4 Native test suite green
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered: two-class recovery rule landed in code-review step 10 and the research relaunch line (PR #214). Infrastructure failure (sandbox kill, API error, intact-session timeout) resumes the same child; conclusion states (formed findings, invalid structured output, context-gap report) dispatch fresh. Ratchet-net-zero in both skills; native suite green; fresh-context review confirmed one blocker (ambiguous 'nonzero result' example) fixed in-review to the 'formed findings' criterion.
<!-- SECTION:FINAL_SUMMARY:END -->
