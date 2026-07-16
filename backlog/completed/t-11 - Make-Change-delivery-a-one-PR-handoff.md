---
id: T-11
title: Make Change delivery a one-PR handoff
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 18:30'
updated_date: '2026-07-12 20:18'
labels:
  - methodology
  - delivery
dependencies: []
documentation:
  - doc-20
modified_files:
  - skills/deliver-change/SKILL.md
  - skills/deliver-change/agents/openai.yaml
  - >-
    backlog/docs/research/doc-20 -
    GitHub-merge-coupling-for-branch-resident-Task-status.md
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Correct the end-of-Change contract exposed by PRs #32/#33 and #34/#35. Task status records whether the agreed work is complete; GitHub records whether its Change received the operator's final acceptance and merged. Finalize the Task inside its original Change, open the actual PR page for the operator, and perform post-merge verification without another repository write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Task Done means the agreed work is verified complete; GitHub Merged means the operator accepted and landed its Change
- [x] #2 Feedback showing failure against existing acceptance criteria reopens the same Task, while changed or additional intent requires operator-approved follow-up work
- [x] #3 After merge, the owning agent verifies the landed Change and reports evidence without creating a Task-finalization Change
- [x] #4 The delivery procedure explicitly opens the pull request in the operator's browser and reports the URL if browser dispatch fails or visibility is not confirmed
- [x] #5 The updated skill passes structural validation, focused consistency checks, fresh-context review, and hands-on browser UAT
- [x] #6 Authoritative methodology sources agree with the one-PR Task-to-Change lifecycle; derived OpenWiki refresh remains with its post-merge maintainer
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the observed regressions: unsupported ad hoc gh JSON field and browser visibility that vanished when the tool process exited. 2. Amend deliver-change with a minimal tested status query and a durable graphical launch whose persistence is verified before merge monitoring. 3. Validate through skill-creator, focused assertions, fresh-context review, and operator-confirmed browser UAT. 4. Finalize T-11 inside the corrective pull request before handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research confirmed that native GitHub merge cannot transform a branch-resident Task file. The operator retained the original Task/Change split and declined automation or a status-surface migration; doc-20 records the evidence.

Scope correction: openwiki/workflows.md is derived and remains owned by the separate post-merge OpenWiki maintainer. T-11 changes only the authoritative delivery Skill and its UI metadata; the stale derived passage is reported rather than edited here.

Local verification before review: skill-creator quick_validate reports 'Skill is valid'; generated openai.yaml matches the revised Skill; git diff --check passes; focused assertions observe one-PR finalization, both rejection branches, explicit gh --web dispatch, visibility honesty, no agent merge, and read-only post-merge verification. The graphical environment exposes DISPLAY=:0, gh supports --web, and Zen is the configured default browser.

A clean read-only forward-use agent derived the intended In Progress → Done → operator handoff flow and both feedback branches. It identified ambiguity for an already-closed PR and implicit changed-intent status; the Skill now explicitly keeps the same Task for unmet criteria, realigns unavailable Change disposition, and leaves a completed Task Done when changed intent requires separately approved follow-up work.

Independent fresh-context code-review inspected the exact committed-plus-working-tree Change against origin/main and returned no material findings. The owning review verified that verdict against the Skill, Task contract, authoritative Task/Change definitions, and the unchanged OpenWiki ownership boundary.

Bootstrap divergence, explicitly waived by the operator on 2026-07-12: original acceptance criterion #1 was 'The original Change carries its Task's checked acceptance criteria, final summary, and Done status before final merge handoff.' Browser visibility was itself this Change's UAT, so PR #37 had to be exposed before Task finalization; the operator merged while that UAT page was open. This self-hosting exception does not alter the ordinary flow, where implementation Checks and UAT precede final Task handoff.

Browser UAT passed after a persistent diagnostic invocation traced gh → xdg-open → gio → Zen and the operator confirmed the PR page was visible. PR #37 landed reviewed head 53a9e338ab8472ab0b7567e6516f0a4c1246c9df as merge commit aad436b093cb02463f7a97a1abbe6f8243b02e75. The first immediate gh exit had proven dispatch only and produced no observable Zen process or window, exactly the distinction the revised Skill now requires agents to report.

Regression reopened by the operator on 2026-07-12: the delivery actor guessed unsupported gh field baseRefOid, then gh pr view --web and a window-observation loop produced only transient Zen visibility because the browser remained a descendant of the short-lived tool process. A detached setsid launch remained visible across a later tool call, establishing the causal boundary and the required observable outcome.

Corrective local Checks: skill-creator quick_validate reports 'Skill is valid'; git diff --check passes; gh 2.45 accepts exactly state, mergedAt, mergeable, mergeStateStatus, statusCheckRollup, and url; command discovery finds setsid and xdg-open. A cold detached Zen launch remained present across a later tool call, and the documented setsid -f xdg-open route preserved the PR-specific window across another later observation; the surviving browser owns a distinct session rather than the short-lived tool session.

Fresh-context forward use received only the revised Skill and a generic green-PR scenario. It derived the tested gh query, durable setsid opener, later PR-specific observation, retry/stop behavior, and the rule that monitoring begins only after persistent visibility. Its one actionable clarity finding was that url binding was implicit; the Skill now explicitly binds url from the returned .url value.

Code review: the first delegated reviewer failed to return a report and was replaced without changing the brief or delta; silence was not treated as a pass. The fresh replacement reviewer returned no material findings. Owning verification confirmed the procedure uses only tested fields, makes persistence the browser success condition, preserves runtime fallback, stops before monitoring on failure, and leaves operator merge authority unchanged.

Hands-on browser UAT accepted by the operator: after the detached launch and later persistence observations, the operator explicitly reported 'I see merged #39.' This verifies the actual page remained visible rather than merely dispatching or flashing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected deliver-change after a reproduced silent browser handoff and unsupported ad hoc gh query. The Skill now uses a minimal tested PR field set, binds the returned URL, launches it through a durable graphical process when tool descendants are reaped, requires persistent PR-specific visibility before merge monitoring, and retries/stops with the URL on failure. skill-creator validation, focused gh and process checks, a clean forward-use exercise, fresh-context review with no material findings, and operator-confirmed browser UAT all passed.
<!-- SECTION:FINAL_SUMMARY:END -->
