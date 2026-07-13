---
id: TASK-7
title: BPMN as planning and execution substrate for agent work
status: To Do
assignee: []
created_date: '2026-07-12 15:58'
updated_date: '2026-07-13 02:01'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OPERATOR IDEA (2026-07-12, verbatim): 'the bpmn visuals look so good I want to incorporate bpmn deeply into my process. now thinking we might even want planning to generate bpmn before work gets done, and the work is EXECUTED as bpmn. would this be stupid? maybe langgraph does this better and agent-natively?'

CONTEXT: TASK-6's smoke test proved the full BPMN pipeline on this repo's real workflows — deterministic bpmn-moddle codegen, bpmnlint gating, auto-layout, rendering, and lossless per-element evidence stamps (qq:evidence extensionElements). That makes BPMN viable not just as documentation but as a machine-checkable plan format. Operator has deep Flowable experience, so BPMN-engine semantics are an auditable known quantity for them.

THE DECISION TO MAKE — three candidate shapes, in ascending order of commitment:
1. PLAN-ARTIFACT ONLY: planning emits evidence-stamped BPMN as the reviewable plan artifact (rendered for judgment via the TASK-6 pipeline); agents execute normally; a post-hoc conformance check verifies each task/gateway was honored. Cheapest; fits qq's thin-harness philosophy (no new runtime); plan and diagram cannot drift because they are the same file.
2. ENGINE-EXECUTED: a real BPMN engine (Flowable; alternatives Camunda 7/8, Zeebe) runs process instances; agent steps as external-task workers, operator steps as userTasks; timers/boundary events/audit/resume for free. Maximum rigor, but heavy infra inside a repo whose explicit architectural intent is thin-harness composition (openwiki/architecture.md:5), and static process instances fight mid-flight replanning — the core dynamic of agent work. Ad-hoc subprocess support is the escape hatch to evaluate.
3. AGENT-NATIVE GRAPH RUNTIME (LangGraph or similar): graphs-as-code with checkpointing and human-in-the-loop interrupts, built for exactly this dynamism — but bespoke code rather than an operator-auditable external standard (the criterion that drove TASK-6's choices), and the diagram is derived from code, not the source of truth.

KEY TENSIONS TO RESOLVE: (a) static plan vs dynamic replanning — what happens in each option when the agent discovers the plan is wrong mid-execution; (b) auditability-by-standard vs agent-native ergonomics; (c) infra weight vs thin-harness intent; (d) whether the same BPMN file can serve wiki documentation AND execution without forking dialects.

SUGGESTED NEXT STEP: /research round (decision-grade, backlog-linked) comparing the three shapes on those tensions, including what Flowable ad-hoc subprocesses and LangGraph interrupts actually support today. Not committed — this ticket records the idea and the open question.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A decision-grade comparison of the three shapes (plan-artifact-only, engine-executed, agent-native runtime) exists as a backlog research doc with confidence tags and sources
- [ ] #2 Operator has made and recorded an explicit go/no-go/shape decision; if go, follow-up implementation tasks exist
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-12 16:02
---
Operator decision 2026-07-12: shape 1 (plan-artifact-only) adopted now — implementation is TASK-8. This task's research question narrows to: does an execution substrate (BPMN engine per shape 2, or agent-native graph runtime per shape 3) earn its infrastructure BEYOND shape 1? Research round launched.
---

created: 2026-07-12 16:03
---
Correction to #1: research round NOT launched — operator deferred it (2026-07-12, 'let it be'). Task stays open until deliberately picked up.
---

author: operator
created: 2026-07-13 02:01
---
Retired by operator on 2026-07-12: execution-substrate research is no longer wanted. Shape 1 remains delivered by TASK-8; no engine or agent-native runtime investigation will be pursued.
---
<!-- COMMENTS:END -->
