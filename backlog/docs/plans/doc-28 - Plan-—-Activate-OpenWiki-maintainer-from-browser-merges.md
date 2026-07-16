---
id: doc-28
title: Plan — Activate OpenWiki maintainer from browser merges
type: other
created_date: '2026-07-13 03:45'
updated_date: '2026-07-13 04:33'
tags:
  - bpmn
  - plan
---
# Plan — Activate OpenWiki maintainer from browser merges

**Owning Task:** T-19 — Activate the OpenWiki maintainer from operator merges

## Intent

Deliver a local, event-driven bridge from the operator confirming a pull-request merge on GitHub to the dedicated OpenWiki maintainer Codex session for any qq-linked Repository. A generic Tampermonkey userscript reports only the canonical PR URL through the local `qq-openwiki://` scheme; the handler discovers and validates the Repository, independently verifies GitHub state, suppresses OpenWiki recursion and duplicate merge commits, and launches or wakes the maintainer through Herdr.

![T-19 activation plan](assets/doc-28/plan.png)

## Ownership boundary

This Change owns the generic GitHub userscript, local protocol handler, safe desktop registration, focused checks, and delivery to a green pull request. It does not maintain a Repository registry, poll GitHub, run a daemon or local server, install a self-hosted runner, change OpenWiki generation, or author wiki BPMN diagrams. T-6 remains the follow-on that teaches and acceptance-tests helpful BPMN generation.

The BPMN process ends at the activation pull request being green for handoff. Strict conformance and Task finalization are same-PR closeout metadata outside the diagram; operator merge, canonical installation, and the later T-6 live acceptance remain delivery or follow-on activity.

## Artifacts

- Plan specification: `assets/doc-28/plan-spec.json`
- Evidence-stamped BPMN: `assets/doc-28/plan.bpmn`
- Rendered approval diagram: `assets/doc-28/plan.png`

## Conformance

# BPMN conformance report

Plan: `backlog/docs/plans/assets/doc-28/plan.bpmn`

## Summary

- Flow nodes: 15
- Accounted: 15
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| activation_approved | Local activation approved | StartEvent | done | Evidence: backlog/tasks/task-19 - Activate-the-OpenWiki-maintainer-from-operator-merges.md |
| build_userscript | Build generic merge userscript | ServiceTask | done | Evidence: browser/openwiki-merge-activator.user.js |
| build_local_handler | Build validating local handler | ServiceTask | done | Evidence: bin/qq-openwiki-activate |
| extend_installer | Register local protocol safely | ServiceTask | done | Evidence: bin/install.sh |
| verification_entry | Verification entry | ExclusiveGateway | done | Evidence: tests/test-qq-openwiki-activate.sh |
| run_checks | Run focused bridge checks | ServiceTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55 |
| checks_green | Checks green? | ExclusiveGateway | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55 |
| fix_check_failures | Fix check failures | ServiceTask | skipped | Evidence: https://github.com/hypermemetic-ai/qq/pull/55<br>Note: The initial focused suite and every post-review rerun passed, so no failing-Check correction branch was taken. |
| fresh_context_review | Run fresh-context review | UserTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55 |
| confirmed_findings | Confirmed findings? | ExclusiveGateway | done | Evidence: bin/qq-openwiki-activate<br>Note: The accountable agent reproduced the GUI PATH, global agent-name collision, dispatch claim, XDG data-home, workspace-validation, marker durability, and agent-identity failure paths before correction. |
| fix_review_findings | Fix confirmed findings | ServiceTask | done | Evidence: tests/test-qq-openwiki-activate.sh |
| open_activation_pr | Open activation PR | ServiceTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55 |
| pr_green | PR green? | ExclusiveGateway | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55<br>Note: GitHub reported mergeable MERGEABLE and mergeStateStatus CLEAN with no applicable status checks. |
| fix_pr_failures | Fix PR failures | ServiceTask | skipped | Evidence: https://github.com/hypermemetic-ai/qq/pull/55<br>Note: No GitHub-side check or mergeability failure occurred. |
| green_handoff | Activation PR green | EndEvent | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/55 |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
