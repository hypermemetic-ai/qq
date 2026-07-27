---
id: doc-108
title: Plan — update operator disposition gate
type: other
created_date: '2026-07-27 05:02'
updated_date: '2026-07-27 05:02'
tags:
  - plan
  - update
  - governance
  - operator-alignment
---
# Plan — `/update` operator disposition gate

**Owning Task:** T-156.1

**Status:** Approved by the operator in the 2026-07-27 asked-and-answered exchange.

## Outcome

Make `/update` an operator-owned decision workflow. It may gather and preserve decision-grade evidence under decision-13, but it cannot convert that evidence into operator dispositions, an approved plan, a Done Task, or a ready-for-merge handoff without the required explicit conversation.

For every inventoried component, the operator sees an understandable benefit/cost presentation. Every meaningful-delta candidate is then reviewed one at a time. Before asking for that candidate's disposition, `/update` provides:

1. installed identity, source, constraint, and owner;
2. candidate identity and channel;
3. the concrete capability, security, reliability, or simplification gain for qq;
4. code, configuration, dependencies, adapters, or process the change could delete;
5. compatibility, migration, security/privacy, credential, supply-chain, and operating costs;
6. evidence confidence, disagreements, and unknowns;
7. the smallest safe test and rollback;
8. one evidence-backed recommendation; and
9. an explicit operator disposition recorded from the answer.

## Boundary and non-goals

- Preserve the complete source-derived/live inventory, primary-source verification, confidence/gap handling, recommendation vocabulary, smallest-resulting-system analysis, and non-mutation/never-merge boundaries already in `.pi/prompts/update.md`.
- Do not disposition or implement any ecosystem candidate in this Change.
- Do not alter T-166 or PR #254's assessment evidence.
- Do not redesign general grilling, research, review, or delivery methodology.
- Do not add a package update engine, automatic mutation, browser/provider/auth flow, or merge automation.
- Long-running inventory, research, verification, and review go to appropriate fresh delegated actors. The accountable operator-facing owner retains synthesis, questions, dispositions, plan approval, acceptance, and merge.

## Implementation

1. Refactor `.pi/prompts/update.md` so evidence gathering leads into an explicit operator decision phase before durable finalization.
2. Require the component benefit/cost presentation and complete nine-field candidate card.
3. Require exactly one candidate disposition question at a time. A clarification, challenge, punctuation, silence, request for more evidence, or ambiguous response is not a disposition. Answer it and remain on that candidate. Advance only after an explicit allowed disposition or explicit deferral.
4. After all candidates, present the complete disposition ledger and obtain explicit operator approval before describing a plan as approved, marking the Task Done, or presenting the pull request as ready for merge.
5. Add `tests/test-update-prompt.sh` to enforce the required card fields, sequential gate, ambiguous-answer refusal, delegation ownership, ordering, and retained inventory/evidence/non-mutation invariants.

## Checks

- `bash tests/test-update-prompt.sh`
- every `tests/test-*.sh`
- `backlog doctor`
- `git diff --check`
- targeted diagnostics where applicable
- fresh-context review over the complete staged/unstaged/untracked Change, followed by affected Checks and fix-delta review for any confirmed finding
- final GitHub CI on the handed-off pull request

## Success evidence

- The focused test demonstrates that `/update` cannot ask for a disposition before the card, cannot batch candidates, cannot infer an ambiguous answer, and cannot finalize before explicit approvals.
- Existing inventory, evidence, recommendation, rollback, mutation, and merge safeguards remain represented and tested.
- The full Repository suite and independent review are green.
- One clean, green pull request is handed to the operator without merge.
