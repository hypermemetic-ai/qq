---
id: TASK-23
title: Align operator identity and Herdr work-session topology
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 23:33'
updated_date: '2026-07-14 00:35'
labels:
  - methodology
  - herdr
  - identity
dependencies: []
references:
  - 'https://github.com/hypermemetic-ai/qq/pull/63'
documentation:
  - doc-32
modified_files:
  - CONCEPTS.md
  - README.md
  - >-
    backlog/docs/plans/doc-2 -
    Plan-—-methodology-by-link-not-copy-drop-the-plugin.md
  - backlog/docs/plans/doc-5 - qq-ac-Reframe-Implementation-Plan.md
  - backlog/docs/plans/assets/doc-32/plan-spec.json
  - backlog/docs/plans/assets/doc-32/plan.bpmn
  - backlog/docs/plans/assets/doc-32/plan.png
  - backlog/docs/plans/assets/doc-32/completions.json
  - backlog/docs/plans/assets/doc-32/conformance.md
  - >-
    backlog/docs/plans/doc-32 -
    Plan-—-Align-operator-identity-and-Herdr-work-session-topology.md
  - >-
    backlog/tasks/task-23 -
    Align-operator-identity-and-Herdr-work-session-topology.md
  - bin/install.sh
  - bin/qq-herdr-home
  - cockpit/README.md
  - skills/code-review/SKILL.md
  - skills/deliver-change/SKILL.md
  - skills/deliver-change/agents/openai.yaml
  - skills/research/SKILL.md
  - tests/test-qq-herdr-home.sh
  - tests/test-qq-openwiki-activate.sh
priority: high
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make qqp-dev the active operator identity and make Herdr's native project/worktree grouping the methodology's explicit execution model. Each Repository has one persistent main-checkout home containing a dedicated Backlog-board tab and any operator-created general tabs. Every Change runs in its grouped worktree workspace with the current accountable conversation moved into it; delegated reviewers and researchers appear as right splits there. Completion leaves that work session intact and focuses the home Backlog board.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: codex
created: 2026-07-14 00:06
---
UAT gap observed by the operator: both child sessions were shown as main and should use the Change name. The live qq and deciq work sessions were relabeled from their branch metadata, and the lifecycle rule and regression coverage now require that label.
---

author: codex
created: 2026-07-14 00:19
---
The operator refined the UAT naming rule: work sessions use a unique, recognizable change label of at most 15 characters, independent of branch names and Task-to-Change cardinality. Approved live labels are herdr-homes for qq and rejoin-collapse for deciq.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Aligned qqp-dev identity and Herdr execution topology: persistent main project homes retain their Backlog boards and general tabs; each Change runs in a uniquely short-labeled linked-worktree session; reviewer and researcher agents appear as read-only no-focus right splits; terminal handoff focuses the home board without moving or deleting work. Verified with the full local suite, live qq/deciq topology checks, independent review, operator UAT, and strict BPMN conformance.
<!-- SECTION:FINAL_SUMMARY:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Global Git authorship uses qqp-dev with the established GitHub noreply address, current tracked qq and deciq content contains no former operator handle, and existing Git or GitHub history is not rewritten.
- [x] #2 Exactly one persistent Herdr home per Repository is bound to the primary main checkout; its dedicated single-pane Backlog-board tab and operator-created general tabs remain at that home level.
- [x] #3 Every Change worktree opens as a native child of its Repository home with a unique operator-agreed change label matching [A-Za-z0-9-]{1,15}, independent of branch and Task cardinality; the current accountable conversation moves into it before Repository mutation and all Change work remains there.
- [x] #4 Fresh reviewers and researchers launched inside Herdr are read-only right splits in the owning work session and do not steal focus; non-Herdr runtimes retain an explicit placement fallback.
- [x] #5 After terminal Change disposition, the synchronized main home focuses its unique Backlog-board tab while the accountable pane, worktree workspace, and checkout remain intact for inspection and explicit retirement.
- [x] #6 Focused automated and live Checks verify identity, home/worktree grouping and short unique labeling, current-session adoption, delegate placement, main synchronization compatibility, and completion focus without disturbing unrelated live sessions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record and approve an evidence-stamped BPMN plan. 2. Correct the active Git identity and managed historical references without rewriting history. 3. Encode project-home and work-session vocabulary plus explicit grouped worktree entry and board-focus completion behavior. 4. Make reviewer and researcher delegation use read-only right splits inside the owning work session. 5. Add focused automated checks and exercise the live qq/deciq home topology without moving unrelated sessions. 6. Run independent review, strict plan conformance, Task finalization, and normal one-PR delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: all 7 repository shell test scripts pass; the BPMN pipeline passes 18/18 tests; ShellCheck and deliver-change, code-review, and research skill validation pass. Fresh identity sweeps found no former-handle reference in tracked qq or deciq content, and global Git/GitHub identity resolves to qqp-dev with the established noreply address. Live Herdr checks confirmed persistent main homes wM/w1Y, approved work-session labels herdr-homes/rejoin-collapse, the accountable/reviewer right split in w2C:t1, preserved worktrees and panes, and successful home-board focus. Independent review found two in-scope UAT-delta issues; both were fixed and exact repairs were re-reviewed. Operator UAT accepted. BPMN strict conformance: 26/26 accounted, 0 unaccounted, 0 diverged, PASS. PR #63 is open, mergeable, CLEAN, with no applicable GitHub checks.
<!-- SECTION:NOTES:END -->
