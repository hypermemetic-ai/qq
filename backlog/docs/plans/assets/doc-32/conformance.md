# BPMN conformance report

Plan: /home/qqp/.herdr/worktrees/qq/fix-delegates-split-right/backlog/docs/plans/assets/doc-32/plan.bpmn

## Summary

- Flow nodes: 26
- Accounted: 26
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| start | Alignment complete | StartEvent | done | Evidence: backlog/tasks/task-23 - Align-operator-identity-and-Herdr-work-session-topology.md<br>Note: TASK-23 records the aligned identity, home, work-session, delegate, and completion-focus outcome. |
| approve_plan | Approve identity and work-session plan | UserTask | done | Evidence: backlog/docs/plans/doc-32 - Plan-—-Align-operator-identity-and-Herdr-work-session-topology.md<br>Note: The operator approved the rendered plan before implementation; later UAT naming refinements were incorporated into the same semantic plan. |
| plan_approved | Plan approved? | ExclusiveGateway | done | Evidence: backlog/docs/plans/assets/doc-32/plan.png |
| plan_rejected | Return to alignment | EndEvent | skipped | Note: The operator approved the plan. |
| configure_identity | Configure qqp-dev Git identity | ServiceTask | done | Evidence: live checks: git config --global and git var GIT_AUTHOR_IDENT returned qqp-dev with 287262891+qqp-dev@users.noreply.github.com |
| replace_identity_refs | Replace current legacy identity references | ServiceTask | done | Evidence: backlog/docs/plans/doc-2 - Plan-—-methodology-by-link-not-copy-drop-the-plugin.md; backlog/docs/plans/doc-5 - qq-ac-Reframe-Implementation-Plan.md; README.md |
| verify_identity | Verify active and tracked identity | ServiceTask | done | Evidence: fresh git grep sweeps in qq and deciq returned no former-handle match; gh api user returned qqp-dev |
| identity_correct | Identity correct? | ExclusiveGateway | done | Evidence: live identity checks passed on 2026-07-14 |
| identity_failed | Identity check failed | EndEvent | skipped | Note: No active or tracked identity check failed. |
| encode_home_model | Encode persistent project homes | ServiceTask | done | Evidence: CONCEPTS.md; skills/deliver-change/SKILL.md; cockpit/README.md |
| encode_work_sessions | Encode grouped worktree sessions | ServiceTask | done | Evidence: skills/deliver-change/SKILL.md; live workspaces w2C=herdr-homes and w27=rejoin-collapse<br>Note: Both linked-worktree workspaces are native children of their main-checkout project homes and use approved [A-Za-z0-9-]{1,15} labels. |
| encode_completion_focus | Focus home board without retiring work | ServiceTask | done | Evidence: bin/qq-herdr-home; tests/test-qq-herdr-home.sh; live focus-board result for wM:t4 |
| place_delegates | Place reviewers and researchers to the right | ServiceTask | done | Evidence: skills/code-review/SKILL.md; skills/research/SKILL.md; live reviewer pane w2C:p3 right of accountable pane w2C:p2<br>Note: The fresh reviewer used a distinct read-only Codex session, stayed in w2C:t1, and did not take global focus. |
| add_checks | Add focused lifecycle checks | ServiceTask | done | Evidence: tests/test-qq-herdr-home.sh; tests/test-qq-openwiki-activate.sh |
| checks_entry | Run or rerun checks | ExclusiveGateway | done | Evidence: all repository shell tests and affected checks were rerun after UAT and review repairs |
| run_checks | Run focused automated checks | ServiceTask | done | Evidence: 7 tests/test-*.sh scripts passed; BPMN pipeline 18/18 passed; ShellCheck and three skill validators passed |
| checks_green | Automated checks green? | ExclusiveGateway | done | Evidence: fresh local checks passed on 2026-07-14; PR #63 is MERGEABLE/CLEAN with no applicable GitHub checks |
| repair_checks | Repair in-scope check failures | ServiceTask | skipped | Note: No automated Check failed; the independently reported metadata and canonical-grammar findings were corrected and exact-delta reviewed through the delivery review loop. |
| exercise_live_topology | Exercise live home and work-session topology | ServiceTask | done | Evidence: live Herdr inspection: qq home wM, deciq home w1Y, qq work session w2C, deciq work session w27 |
| topology_safe | Live topology safe? | ExclusiveGateway | done | Evidence: live focus and workspace checks preserved w2C:p2, w2C:p3, w27:p4, both linked checkouts, and the dedicated home boards |
| topology_failed | Live topology check failed | EndEvent | skipped | Note: No final live topology check failed or disturbed an unrelated session. |
| operator_uat | Accept home and work-session behavior | UserTask | done | Evidence: operator confirmation in the owning conversation on 2026-07-14<br>Note: The operator visually accepted the final home-level board and the fully visible herdr-homes and rejoin-collapse child labels. |
| uat_accepted | Operator accepts behavior? | ExclusiveGateway | done | Evidence: operator final response: yes |
| uat_rejected | Return for experience correction | EndEvent | done | Evidence: TASK-23 comments 1 and 2<br>Note: Earlier UAT exposed branch-derived and overlong labels; the experience was corrected in the same Change and UAT was repeated to final acceptance. |
| complete_delivery | Complete qq Change delivery | CallActivity | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/63<br>Note: Independent review, local Checks, UAT, the implementation commit, push, and initial PR inspection are complete; this conformance record and Task finalization are the prescribed final same-PR commit. |
| green_pr_ready | Green PR ready | EndEvent | done | Evidence: PR #63: OPEN, MERGEABLE, mergeStateStatus CLEAN, empty applicable statusCheckRollup |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
