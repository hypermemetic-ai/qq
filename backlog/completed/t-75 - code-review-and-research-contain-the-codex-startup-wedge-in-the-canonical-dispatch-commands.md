---
id: T-75
title: >-
  code-review and research: contain the codex startup wedge in the canonical
  dispatch commands
status: Done
assignee: []
created_date: '2026-07-17 03:41'
updated_date: '2026-07-17 04:34'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The delegate-batch dispatch command carries the T-63 wedge containment (timeout -k 10 3600, MCP-less default, exit-124 reconciliation), but the other two skills that embed the same unwrapped codex exec pattern do not: code-review (SKILL.md step 4) and research (SKILL.md launch block). A reviewer or researcher that hits the doc-45 startup wedge therefore parks the owning session indefinitely — process exit is the only completion wake.

Observed recurrence: deciq task-15b review, 2026-07-16. The review brief was handed off at 21:15; the wedged first reviewer (dispatched verbatim from the code-review skill command) never produced a byte, and the relaunched review delivered its report at 22:36 — roughly 80 minutes lost. Same signature as doc-45 Mode A, previously ~6 instances in 28 h; zero instances under timeout wrappers.

Scope: mirror the T-63 timeout containment onto both commands. Wrap each in timeout -k 10 3600 (tune to the work, never below real work time; plain timeout reaps the full process group, setsid excluded per the T-63 kill-path probe). Reconcile exit 124 as a wedge, not a review/report: rerun the unchanged brief fresh. Operator disposition 2026-07-16: reviewers and researchers deliberately RETAIN their MCP servers — the MCP-less override stays implementer-only (delegate-batch); the knowledge surfaces serve review quality, Context7 is core to the research method, and the timeout bounds the residual spawn risk (context7 is pinned, not @latest, in the operator codex config). Add conformance tripwires so neither the unwrapped command shape nor an MCP-less reviewer override silently returns.

Out of scope, filed as follow-up: delegate-batch's codex exec resume prose carries no timeout wrapper.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The code-review skill's canonical dispatch command carries the timeout wrapper, with exit 124 reconciled to a wedge (rerun, not a review outcome) in the failure-handling step, and reviewers deliberately retain MCP per operator disposition 2026-07-16
- [x] #2 The research skill's canonical dispatch command carries the timeout wrapper; MCP retention for researchers is stated deliberately
- [x] #3 Conformance tests fail if either command regresses to the unwrapped shape or code-review regresses to an MCP-less reviewer override
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rounds 1-2 (codex, envelopes verified): timeout wrapper landed in both skills; MCP-less reviewer draft reverted on the operator's disposition (reviewers and researchers retain MCP; implementer-only override stays in delegate-batch). The disposition was taken without a prior grilling — an alignment failure the operator flagged; T-76 owns the systemic fix. Rounds 3-4 (codex, envelopes verified): review findings confirmed by constructed failing scenarios hardened the tripwires — POSIX whitespace classes between every token of the unwrapped-dispatch guard, any-spelling mcp_servers tripwire over both skills, positive wrapper assertion for delegate-batch. Fresh review + two delta reviews; final delta review: no material findings. Follow-up flagged: delegate-batch codex exec resume prose is unwrapped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both remaining unwrapped dispatch surfaces carry the doc-45 containment: code-review and research canonical commands run under timeout -k 10 3600 with exit 124 reconciled to a reaped wedge (rerun the unchanged brief), reviewers and researchers deliberately retain MCP per operator disposition 2026-07-16, and conformance tripwires fail the suite on any unwrapped codex exec dispatch line (any horizontal whitespace), any mcp_servers spelling in reviewer/researcher commands, or a missing wrapper in any of the three dispatching skills. Full 7-file suite green; probe matrix verified both directions.
<!-- SECTION:FINAL_SUMMARY:END -->
