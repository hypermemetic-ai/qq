---
id: TASK-2
title: Design essential-context delivery architecture
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 03:02'
updated_date: '2026-07-12 04:58'
labels:
  - research
  - architecture
  - context-engineering
dependencies:
  - TASK-1
documentation:
  - doc-16
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Research and recommend how qq should author, select, and deliver essential methodology context while minimizing model- and harness-specific investment. Treat official GPT-5.6 Sol guidance as authoritative for the current model. Compare other primary sources to identify portable seams and tradeoffs. Cover always-loaded instructions, hooks, specialist agents, skills, knowledge documents, context lifecycle, provenance/freshness, failure behavior, and evaluation. This Task produces architecture evidence only; methodology-content choices and implementation are deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exactly one cited, confidence-tagged Backlog research report is attached to this Task
- [x] #2 The report distinguishes canonical context ownership from delivery mechanisms and compares always-loaded instructions, hooks, agents, skills, and knowledge documents by timing, context cost, reliability, portability, freshness, trust, and failure behavior
- [x] #3 GPT-5.6 Sol requirements are traced to current official OpenAI guidance; other load-bearing claims use opened primary or first-party sources with facts separated from inference
- [x] #4 The report recommends a minimal runtime-neutral architecture, disposable runtime-adapter boundary, degradation behavior, and representative evaluation plan
- [x] #5 Methodology-level content decisions and implementation changes are explicitly deferred
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delegate three read-only research lanes: official OpenAI/Codex, primary context-engineering evidence, and cross-runtime delivery mechanisms. 2. Verify load-bearing sources and reconcile them into options, failure modes, and one recommended architecture. 3. Create and attach one Backlog research report, verify the managed records, and independently review the research Change. 4. Present the architecture and its later decision points without making methodology-content choices.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Three fresh read-only specialists covered official OpenAI/Codex guidance, primary context-engineering research, and cross-runtime delivery mechanisms. The owning agent spot-checked the load-bearing OpenAI, OpenAI engineering, Anthropic, GitHub, Agent Skills, MCP, TACL/ACL, Chroma, RULER, and ContextBench sources before synthesis.

Fresh validation passed: Backlog view shows exactly doc-16 attached and all five acceptance criteria checked; the CLI-generated report body matches the reviewed source byte-for-byte; no internal web references, placeholders, or trailing whitespace were found. Independent read-only review returned no material findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Produced and attached doc-16, a cited decision report recommending a portable content plane with disposable native adapters for essential-context delivery. Verified the managed Task/report records, load-bearing sources, formatting, and exact report body; independent review found no material issues. Methodology-content choices and implementation remain deferred.
<!-- SECTION:FINAL_SUMMARY:END -->
