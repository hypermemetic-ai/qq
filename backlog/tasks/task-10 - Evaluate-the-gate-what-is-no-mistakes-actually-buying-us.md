---
id: TASK-10
title: 'Evaluate the gate: what is no-mistakes actually buying us'
status: Done
assignee: []
created_date: '2026-07-08 15:53'
updated_date: '2026-07-08 18:02'
labels: []
dependencies: []
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator (07-08): 'first we figure out what no-mistakes is doing for us.' Inventory real runs — what the pipeline catches vs what it costs. DECISION (operator, grilled 2026-07-08): KEEP + RETUNE — recorded in task-13 and landed on main. Per-run evidence: RUN A (document-stack, v1.31.2, big branch): ~69 min wall-clock; review 35.1 min over 6 rounds, 8 findings — 7 real (incl. a genuine self-bypass hole in our registry check), 1 refuted; ci 21.9 min watching nonexistent CI; parked silently on auto_fix.review:0, operator babysat. RUN B (consent-model batch, v1.34.0, small 2-commit branch): 43.5 min; review 20.7 min incl. three fix-and-reverify rounds; 3 substantive findings, all real, 0 refuted (axi-respond docs gap auto-fixed; untruthful Done on task-13; frontier predicate hole in task-4 that would have handed background agents completed work); test 5.0 min; document 4.8 min; ci 12.6 min confirmed-useless polling (gh pr checks exit 1 loop). Parked time: under a minute per gate — the landing agent responded; operator touchpoints were one relayed read + the merge click. Totals: 10/11 substantive findings real across both runs, several catching defects in the very policies being landed. Cost side answered by retune, not replacement: agent-owns-run consent (auto_fix.review 3 + ask-user relay), ignore openwiki/**, --skip ci until real CI exists, v1.34, and the frontier/slice model (task-4 substrate, task-8 pilot) to shrink review-driving diffs. Residual cost work: task-11 (visibility surface).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A written keep/trim/replace decision with per-run evidence (findings caught, false rate, wall-clock, parked time)
<!-- AC:END -->
