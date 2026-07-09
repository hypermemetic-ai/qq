---
id: TASK-22
title: Gate agent is a single point of failure
status: To Do
assignee: []
created_date: '2026-07-09 14:06'
labels:
  - gate
  - parallel-ok
  - hitl
dependencies: []
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-07-09: codex hit its ChatGPT-subscription usage limit. .no-mistakes.yaml on main sets 'agent: codex', and EVERY pipeline stage (review, test, document, lint) spawns that agent, so no landing could complete for ~10 hours. No fallback exists: 'agent' is read from the DEFAULT BRANCH (verified empirically — a probe branch declaring 'agent: claude' still spawned codex), so it cannot be overridden per-run, per-branch, or by env var; 'no-mistakes axi run' has no --agent flag; and codex here is subscription-auth only (no OPENAI_API_KEY), so there is no billing fallback. The global ~/.no-mistakes/config.yaml agent key is overridden by the repo key. Decide the posture: (a) accept the outage risk and document the manual main-commit switch procedure; (b) set 'agent: auto' so it falls through to an available agent; (c) keep codex pinned but pre-stage a tested one-command switch. Note the property the pin buys is speed (gpt-5.5 on the priority tier), and the operator's position is that review independence comes from the reviewer's FRESH CONTEXT, not from a different vendor.
<!-- SECTION:DESCRIPTION:END -->
