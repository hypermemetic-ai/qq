---
id: doc-40
title: Review and research methodology stays owned; vendor engines carry it
type: guide
created_date: '2026-07-14 17:02'
updated_date: '2026-07-14 17:03'
tags:
  - solution
  - review
  - research
  - ownership
  - skills
---
# Review and research methodology stays owned; vendor engines carry it

## Symptom

Pressure to outsource the hand-rolled review workflow to frontier tooling —
the harness's built-in /code-review, PR-native reviewer bots, or community
skills — on the theory that a well-defined external system would raise
accuracy and cut wall-clock at the same time.

## Root cause

A three-stream survey (vendor documentation; the product field plus classic
inspection doctrine; the agent-skills ecosystem) found the engines and the
rules live at different layers. Vendor engines ship strong mechanisms —
adversarial verification of findings, delta re-review, numeric confidence
gates with codified exclusion lists, and repo-level injection surfaces
(REVIEW.md for Claude Code reviews, AGENTS.md review guidelines for codex) —
but no tool, product, or published skill ships the governance rules the
accuracy came from: threat-model-anchored review briefs are first-class
nowhere (only freeform channels plus OWASP doctrine and one in-house
"What NOT to Flag" precedent), and a cross-round convergence circuit-breaker
exists nowhere, including the classic literature, which stops at
reinspection triggers rather than design escalation.

## Resolution

Keep the governance rules as owned portable markdown and let vendor engines
carry them through their injection surfaces; benchmark the owned skill
against the native one on the same diffs to notice when a vendor laps it.
Graft, rather than invent, the ecosystem practices that survived the survey:
falsification gates (a finding needs a constructed failing scenario or is
discarded), numeric confidence thresholds with a versioned exclusion
taxonomy, anti-groupthink instrumentation (blind scoring, degenerate-input
control runs, K-of-N stability for contested findings), a fresh-session
systemic audit after loop convergence, review-fed lessons capture, and
periodic reviewer calibration against seeded-defect corpora. The same
verdict holds for research: no published skill replaces the owned one;
port numeric source-credibility scoring and scripted citation validation
into it.

## Verification

Three delegated, cited investigations (2026-07-14): harness documentation
for /code-review and ultrareview; a field survey covering codex's shipped
rubric and AGENTS.md channel, CodeRabbit learnings, BUGBOT.md, Graphite
exclusions, Copilot instructions, Cloudflare's in-house reviewer, and the
Fagan/NASA/SEI/error-prone-module literature; and an ecosystem sweep of
anthropics plugins, superpowers, agent-review-panel, PhotoStructure,
Sentry's skills, and the compound-engineering plugin, whose explicit verdict
was that no existing skill combines the owned baseline, and that the
cluster-escalation and circuit-breaker rules exist in no surveyed source.
