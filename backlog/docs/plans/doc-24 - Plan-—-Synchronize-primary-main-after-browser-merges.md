---
id: doc-24
title: Plan — Synchronize primary main after browser merges
type: other
created_date: '2026-07-12 23:47'
updated_date: '2026-07-12 23:49'
tags:
  - plan
  - git
  - delivery
  - backlog
---
# Plan — Synchronize primary main after browser merges

## Intent

After the operator merges a Change in GitHub, make the accountable `deliver-change` agent safely fast-forward the single local `main` checkout so Backlog files and the standing Herdr board reflect landed state. Refuse dirty, absent, branch-mismatched, or non-fast-forward states without mutation.

## Diagram

![BPMN plan](assets/doc-24/plan.png)

## Artifacts

- Plan spec: `assets/doc-24/plan-spec.json`
- Semantic BPMN: `assets/doc-24/plan.bpmn`
- Published render: `assets/doc-24/plan.png`

The diagram is the execution contract. Post-landing execution will be recorded through the bundled conformance pipeline.
