---
id: TASK-7
title: Generate the initial openwiki/ wiki
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 18:06'
labels:
  - research
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
RESEARCH FIRST - nothing here is decided except the constraint and the format. Constraint (operator, 07-08): sub-only, no API keys; out-of-pocket API is out if frontier models are the benefit. Format kept: openwiki/-style agent-oriented markdown wiki in-repo. Everything else is HYPOTHESIS needing a fresh-session research pass (via research / deep-research skill, adversarially verified against primary sources): (1) Is headless codex exec on a ChatGPT sub - including inside gate pipeline scripts - actually permitted (ToS/rate limits), or does it risk the account? Operator: 'codex allows /login in other places so I wouldn't be surprised' - unverified. (2) Anthropic-side: confirm the OAuth-outside-Claude-Code restriction as written, not folklore. (3) Can the gate's document step really be steered by repo instructions to maintain a wiki, and what does it actually do today (read no-mistakes docs/source, not vibes)? (4) How much intelligence does maintenance-vs-generation actually need - is a lesser free/cheap engine fine for the diff-patch half? (5) Sub-compatible alternatives landscape: OpenWiki roadmap for subscription auth, other wiki tools, DeepWiki-class options. Deliverable: cited research/ report + a real engine decision. Then implementation (refresh script, install checks) follows the decision. Implementation ACs will be minted as a follow-up task once the engine decision exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cited research report in research/ answering questions 1-5 with load-bearing claims adversarially verified
- [ ] #2 Engine decision made from that evidence and recorded on this task, with implementation re-planned accordingly
<!-- AC:END -->
