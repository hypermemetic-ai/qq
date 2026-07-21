---
id: T-76
title: >-
  grilling and deliver-change: alignment brief, no-approval-transfer, and the
  step-1 decision ledger
status: Done
assignee: []
created_date: '2026-07-17 04:12'
updated_date: '2026-07-17 05:11'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-flagged alignment failure, 2026-07-16: T-75 was bound and implemented without grilling although it embedded consequential decisions the operator had never dispositioned (reviewers dispatched MCP-less — a review-quality tradeoff carried over from T-63's implementer-only approval). Four failure modes to close:

(A) Approval transfer — an approval given for one decision on one surface silently treated as covering a sibling decision elsewhere. (B) "Fix it" read as "fix it this way" — authorization to solve a problem taken as alignment on the solution's shape. (C) Self-certified skip — grilling's trigger is judged by the interested agent in the moment, unrecorded; every standing pressure (autonomy guidance, operator-effort minimization, momentum) pushes toward skip. (D) Context-free extraction — interview questions that assume investigator context the operator does not have, observed live in this Task's own first interview round.

Confirmed shape (operator interview, 2026-07-16): (1) grilling gains the no-transfer rule, the fix-is-not-shape rule, and a brief-first default — every new work item starts with a plain-language alignment brief (intended work, each embedded judgment call, what settled it or a recommendation, one-click approval); full interviews reserved for genuinely open questions; both forms carry the conduct standard: all context that bears on the decision and none that does not, in plain language, BEFORE options are presented; every question answerable from the briefing alone; a recommendation attached. (2) deliver-change step 1 gains a hard gate: binding a Change requires the Task record to carry a decision ledger — each embedded consequential decision with what settled it (operator words, a cited approved Task, or asked-and-answered) or an explicit "none"; any open entry returns to alignment. (3) CONCEPTS.md defines alignment brief and decision ledger and states disposition non-transfer. (4) Conformance tests trip on regression of any of the above.

Sequencing: implement after T-75 merges (same conformance-test file; avoids conflict).

Decision ledger for this Task:
- Brief-first middle default — operator selected (interview, 2026-07-16).
- Hard step-1 gate, all Changes (not advisory, not skill-only) — operator selected.
- Conduct standard wording — operator instructed directly ("all the context I need without drowning in useless detail BEFORE I look over the options").
- Context-first rule treated as settled from the operator's critique — announced during the interview, not contradicted.
- Glossary + conformance tests included — mechanical house pattern (T-70/T-73/T-75 precedent), no meaningful choice.
- Sequenced after T-75 — mechanical, shared test file.
- Ledger's exact location/format inside the Task record — open at implementation; will be settled in T-76's own alignment brief.
- Type bug / priority high — owner's call, contestable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 grilling/SKILL.md carries the no-approval-transfer rule, the fix-is-not-shape rule, the alignment-brief default with one-click approval, and the conduct standard (context before options, questions answerable from the briefing alone, recommendation attached)
- [x] #2 deliver-change step 1 refuses to bind a Change whose Task record lacks a decision ledger (each embedded consequential decision cited to what settled it, or an explicit none; open entries return to alignment)
- [x] #3 CONCEPTS.md defines alignment brief and decision ledger and states that dispositions do not transfer across decisions or surfaces
- [x] #4 Conformance tests fail if any of the above wording regresses
- [x] #5 T-76 itself is delivered with its decision ledger in this Task record
- [x] #6 backlog/decisions/decision-2 records the delegate MCP posture (implementers MCP-less; reviewers and researchers retain MCP) as the worked example the no-transfer rule cites
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ledger-format decision settled (asked and answered, 2026-07-16): ledger lives as a citation-only block in the CLI-managed Description; dispositions with reach beyond one Change get native backlog decision records; decision-2 (delegate MCP posture) rides this PR as the worked example. Operator surfaced the native decision type; design reconciled around it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
grilling now bounds every alignment judgment with the no-transfer and authorization-is-not-alignment rules, defaults every new work item to a context-first alignment brief with one-click approval (self-certified skip clause removed; operator opt-out is itself a verbatim-recorded disposition), and mints cross-Change dispositions as native Backlog decision records inside the encoding Change, the ledger switching to the record id before Task finalization. deliver-change step 1 refuses to bind a Change whose Task lacks a decision ledger. CONCEPTS.md defines both terms; decision-2 records the delegate MCP posture as the citable worked example; conformance tripwires fail the suite on regression. Three review findings (record path, opt-out deadlock, citation transition) confirmed by lifecycle tracing and fixed; final delta review clean. Delivered under its own rule: this Task's ledger is in its Description.
<!-- SECTION:FINAL_SUMMARY:END -->
