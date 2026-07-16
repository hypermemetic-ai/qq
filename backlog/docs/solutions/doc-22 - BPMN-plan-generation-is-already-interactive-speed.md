---
id: doc-22
title: BPMN plan generation is already interactive-speed
type: guide
created_date: '2026-07-12 21:24'
updated_date: '2026-07-12 21:24'
tags:
  - solution
  - bpmn
  - performance
  - planning
---
# BPMN plan generation is already interactive-speed

## Symptom

BPMN plan generation was suspected of being too slow for an operator and agent to iterate on diagrams during alignment.

## Root cause

The suspected latency problem was not present in the local generation pipeline. On a representative 15-flow-node plan, semantic generation was a small fraction of the runtime and Puppeteer/Chrome rendering dominated, but the complete pipeline still finished in about one and a half seconds. Reusing one Chrome session could reduce repeated render cost further, but the measured wait does not justify a persistent renderer, cache, or separate preview mode.

## Resolution

Keep the current deterministic generation path and its lint, layout, evidence round-trip, SVG, and PNG checks. Do not add performance complexity unless a fresh operator-visible symptom appears or the benchmark materially regresses.

When reevaluating, measure the local pipeline and the larger operator-visible loop separately. The pipeline benchmark excludes agent reasoning, Backlog document operations, and presentation through the client.

## Verification

Measured on 2026-07-12 with Node.js 22.22.3 using the real T-8 plan spec and five independent process runs:

- build median: 0.21 seconds; observed range 0.19–0.25 seconds
- render median: 1.42 seconds; observed range 1.31–1.78 seconds
- complete all command median: 1.47 seconds; observed range 1.41–1.54 seconds
- five SVG-and-PNG conversions sharing one Chrome session: 2.11 seconds total

The operator reviewed these measurements and accepted the current latency as fully adequate.
