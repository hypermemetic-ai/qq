---
id: T-175
title: Make Observer failures visible and corpus complete
status: In Progress
assignee: []
created_date: '2026-07-27 07:47'
updated_date: '2026-07-27 07:48'
labels: []
dependencies: []
documentation:
  - doc-110
modified_files:
  - bin/qq-observe
  - extensions/qq-architect.ts
  - skills/architect/SKILL.md
  - skills/deliver-change/SKILL.md
  - tests/test-qq-observe-assemble.sh
  - tests/test-qq-observe-verify-delivery.sh
  - tests/test-qq-observe-routing.sh
  - tests/test-qq-architect-extension.sh
priority: high
type: bug
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one separate high-priority Observer-reliability Change so decision-relevant operational regressions present in packaged evidence can be investigated, while failed or incomplete observation is visible instead of being reported as successful coverage.

Reproduced incident: T-134 / PR #186 established canonical 2700000ms delegate timeouts, later Skill snippets overrode them with 900000ms and 1800000ms, runtime artifacts recorded exact kills, and the Architect context omitted the regression. Current source and fresh evidence show the package corpus omitted nested role manifests, failed analyses were grouped into covered delivery, and /architect had no round-health surface.

## Decision ledger
- The outcome, bounded remedy, ownership boundary, delivery-health compatibility, Architect context v3 health shape, 20-round bound, context freshness, safe reason/coordinate policy, reproduce-before-fix evidence, and listed non-goals — operator-approved asked-and-answered alignment exchange in accountable session 1a0b3b55-6699-47d4-a50a-acede348c64a.
- Approved implementation plan and enactment sequence — doc-110, capturing that same operator-approved alignment.
- Post-hoc immutable session evidence remains the sole observation seam — decision-10.
- Observation optimizes the harness, never the model — decision-11.
- Repository qualification, occurrence identity, pending intake semantics, and operator disposition authority remain unchanged — T-159.
- JSON remains canonical and /architect retains deterministic TOON only at its owned model-ingress boundary — decision-17 and T-169.
- Canonical 2700000ms role policy is incident evidence only; correcting shorter Skill literals is a separate Change — T-134 and the approved non-goal.

## Boundary
Change only guided corpus assembly, delivery-health classification, bounded Architect health ingress, the two directly affected Skills, and focused tests. Do not implement T-134.1 or T-164; retry or mutate batch-861f1e8f2428e0025ff75a8ae27d5fc4; rewrite live Observer artifacts; change ranking or finding caps; fabricate findings; auto-route, auto-retry, auto-remediate, or create a delivery veto.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Guided packages copy every tracked Markdown instruction manifest under delegation/manifests recursively from the exact merged Change snapshot, including agents/*.md.
- [ ] #2 A deterministic fixture co-presents a shorter Skill timeout, exact timeout evidence, and the authoritative 2700000ms role manifest without requiring a particular LLM finding.
- [ ] #3 verify-delivery distinguishes successfully covered, analysis_failed, and uncovered repository-qualified Changes; failed analysis is never covered and produces explicit unhealthy status.
- [ ] #4 /architect context v3 exposes a bounded informational health surface for failed and pending repository-qualified guided rounds with safe reasons and coordinates, while health rows cannot enter dispositions or masquerade as findings.
- [ ] #5 Repository qualification, immutable evidence, context byte/finding bounds, TOON ingress, occurrence identity, pending intake, and operator disposition authority remain intact.
- [ ] #6 Focused regressions are reproduced before the fix; applicable Skill, shell, LSP, ratchet, diff, fresh-context review, and GitHub Checks pass in one unmerged PR.
<!-- AC:END -->
