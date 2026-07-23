---
id: T-139
title: 'Carry acceptance:none in research and code-review dispatch snippets'
status: Done
assignee: []
created_date: '2026-07-21 23:57'
updated_date: '2026-07-22 00:01'
labels: []
dependencies: []
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
T-124 follow-on. Root cause of the 2026-07-21 four failed dispatches: pi-subagents chain execution resolves acceptance from chain[i].acceptance only (src/runs/background/async-execution.ts: explicit: s.acceptance); top-level acceptance is silently ignored for chains and the agent manifests' acceptance field is never consulted — so omitted step acceptance infers attested, whose generated verification bash runs the suite under Landlock confinement and dies on /dev/fd process substitution, failing runs whose work and structured output were complete. delegate-batch's snippet already carries acceptance:{level:"none",reason:"per the manifests"} inside the step; research and code-review snippets omit it. Fix: add the same field to both snippets. Decision ledger: operator ruling 2026-07-21 ('please, fix it right away'); ratchet prose raise approved in the same exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 research and code-review SKILL.md dispatch snippets carry acceptance:{level:"none",reason:"per the manifests"} inside the chain step
- [x] #2 a live chain dispatch with step-level acceptance:none shows no attestation contract and completes
<!-- AC:END -->
