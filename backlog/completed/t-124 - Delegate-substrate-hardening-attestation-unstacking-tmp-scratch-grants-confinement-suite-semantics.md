---
id: T-124
title: 'Delegate substrate hardening: attestation unstacking, /tmp scratch grants, confinement-suite semantics'
status: Done
assignee: []
created_date: '2026-07-20 19:40'
labels: []
dependencies:
  - T-95
priority: high
type: task
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Production hardening for the T-95 substrate, from owner-verified findings in its first two production dispatches (T-121 ticket 1 and the AC#3 probes):

1. **Stacked attestation fails every run.** pi-subagents' inferred acceptance contract (writer-shaped "Acceptance Contract" prompt + final-message fenced acceptance-report) conflicts with qq's strict completion-envelope schema: children emit the envelope via structured_output, never a final fenced report, so runs end "rejected"/nonzero despite complete, verified work. Fix: manifests declare `acceptance: {level: none, reason}` — qq acceptance is the envelope schema + owner verification against the tree + fresh-context review.
2. **Scratch-space premise corrected on live evidence.** Engine tests `git init` under mktemp dirs. The adapter already exports a run-local `TMPDIR` inside the granted run dir, so confined children have scratch space by construction — no policy change needed. The initially-briefed fix (`allowWrite /tmp` + recursive runtime-root `denyWrite`) was implemented and then owner-proven broken: Landstrip denies win globally, the root deny killed the child's own run-dir writes, and child auth staging failed (`No API key found`). It was reverted; regression guards now assert no `/tmp` glob and no runtime-root deny in any role policy, and a live probe proves TMPDIR-scoped confined `git init` works.
3. **/dev/fd process substitution cannot pass Landlock** (owner probe: unfixable at policy level). Engine scripts/tests using `< <(...)` fail inside confined children. Fix is semantic, not policy: delegate-batch documents that a child's confined suite run is best-effort (children report `inconclusive-under-substrate`); the binding green is the owner's native rerun + CI, which the workflow already requires.

Decision ledger:
- Findings and remedies 1 and 3: owner-verified live evidence, 2026-07-20 (policies rendered and probed natively; run 90f9c79e artifacts; /dev/fd policy-grant probes).
- Remedy 2 reframe: owner probe of failed run 9b9ccf4c (deny-wins-globally evidence) + adapter TMPDIR scoping read at bin/qq-dispatch:264 + native scoped-scratch landstrip probe, 2026-07-20.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A production dispatch ends without the spurious attestation rejection, envelope intact
- [x] #2 Regression guards assert no /tmp glob and no runtime-root deny in role policies; live probe proves confined TMPDIR-scoped scratch; sibling writes stay denied
- [x] #3 Skills state the confinement-suite semantics (best-effort child run; owner native rerun + CI bind)
<!-- AC:END -->
