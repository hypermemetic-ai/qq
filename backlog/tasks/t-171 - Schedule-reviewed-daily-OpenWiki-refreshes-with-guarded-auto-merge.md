---
id: T-171
title: Schedule reviewed daily OpenWiki refreshes with guarded auto-merge
status: Done
assignee: []
created_date: '2026-07-27 05:20'
updated_date: '2026-07-27 06:56'
labels: []
dependencies: []
documentation:
  - doc-108
type: enhancement
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Establish the local reliability baseline for OpenWiki on the operator’s always-on machine: start one scheduled refresh every day at 03:00 in the machine’s configured local timezone, run the dedicated maintainer workflow against fresh origin/main, and make completion or failure observable. A semantic no-change is a successful daily assessment. When generation changes documentation, applicable deterministic Checks and independent fresh-context review remain mandatory, and the exact green generated-docs pull request merges automatically without routine operator action.

Use a non-persistent systemd user timer: if the machine is off at 03:00, that day’s run is skipped without catch-up and the next attempt is the following day. The local scheduled maintainer uses the existing qqp-bot GitHub identity through a repository-owned guarded merge command. The guard is a drift-net for well-meaning automation, not a security boundary around the broader bot credential. It rechecks latest main immediately before merge; a rare advance in GitHub’s final non-atomic merge interval is detected afterward and repaired by the next 03:00 assessment. Source Changes still neither trigger nor perform OpenWiki maintenance, and T-157’s unimplemented GitHub-hosted generation design remains out of scope.

Decision ledger:
- Establish a local once-daily baseline because the replacement machine will be always on — operator instruction in the 2026-07-27 project-home exchange.
- Start at 03:00 in the machine’s configured local timezone — operator selection in the 2026-07-27 alignment questionnaire.
- Preserve independent review as part of every generated OpenWiki Change and automatically merge the reviewed result without routine operator merge — operator direction in the 2026-07-27 follow-up.
- A machine-off 03:00 run is simply skipped; do not catch up at boot — operator direction in the 2026-07-27 implementation exchange.
- Use a systemd user timer, repository-owned exact-candidate merge guard, existing qqp-bot identity, journal-visible failure, and no automatic retry before the next daily run — operator approval of the T-171 alignment brief and selection of qqp-bot on 2026-07-27.
- Use immediate latest-main recheck plus post-merge detection and the next 03:00 run as repair for the rare final non-atomic GitHub race; do not add broader strict-check or merge-queue machinery — operator direction in the 2026-07-27 race clarification.
- Implementation boundary and acceptance plan — doc-108, approved by the operator on 2026-07-27.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An enabled non-persistent systemd user timer starts no more than one OpenWiki maintainer assessment at 03:00 in the machine’s configured local timezone against freshly fetched origin/main; a powered-off machine skips that run without catch-up
- [x] #2 A semantic no-change completes successfully without opening a pull request; generated documentation changes pass applicable deterministic Checks and independent fresh-context review of the exact candidate
- [x] #3 Using the existing qqp-bot identity, only the exact expected, green, generated-documentation-only pull request can merge automatically; wrong identity, branch, known-stale base, head, paths, missing review attestation, or failing/pending Checks refuse merge, while a rare final-interval base race is detected and repaired by the next daily assessment
- [x] #4 Routine success requires no operator merge action; attempted-run failures exit nonzero and remain inspectable through the systemd user service journal, with no automatic retry before the next daily schedule
- [x] #5 OpenWiki and GitHub credentials remain outside the Repository; the merge guard is documented as a drift-net rather than a security boundary, and source Changes still neither trigger nor perform OpenWiki maintenance
- [x] #6 Fresh Checks demonstrate timer semantics, single-writer behavior, semantic no-change, reviewed auto-merge, each refusal class, final-race detection, failure visibility, and no catch-up; the maintainer Skill and operator-owned guidance match the landed behavior without hand-editing generated openwiki/ pages
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-27 implementation: added the non-persistent 03:00 systemd user timer/service, scheduled headless Pi assignment, private machine-readable completion receipts, semantic no-change finisher, exact-candidate qqp-bot merge drift-net, schedule adapter, operator guidance, and focused tests. The unit supplies explicit Repository/Linuxbrew PATH and bounds attempts at six hours. Known base drift refuses; a final non-atomic GitHub race is reported after merge for repair at the next daily assessment.

Fresh review round 1 found two blockers: Pi could exit zero after an internal workflow failure without a machine-verifiable postcondition, and the systemd environment could not resolve the assigned bare qq-openwiki command. The correction added private receipts/finisher and explicit command paths. Fix review found one same-class ordering defect where a fallible status write followed receipt publication; status now writes before atomic receipt publication, with /dev/full regression coverage. The second correction review passed with no material findings.

Fresh owner Checks: npm ci; focused daily/merge tests; bash syntax and shellcheck; systemd unit verification against the exact checkout; prose ratchet lowered 7472→7470; git diff whitespace; Backlog parse; pi-lens cheap/full diagnostics; and the complete set -e shell suite all passed.

Activation is deliberately post-merge because the linked user units and fixed ExecStart must resolve from the landed primary main checkout. T-171 remains In Progress until qqp-bot is added to the existing main restriction, the long-lived openwiki/update worktree exists, the timer is linked/enabled from main, and inspect proves the next 03:00 activation.

Mechanical same-fix-smaller pass: the delegated pass identified a behavior-preserving one-line reduction in `qq-openwiki-schedule` but correctly rejected it when the child substrate could not run the ratchet. The owner reran the exact candidate natively; focused tests, syntax, shellcheck, ratchet, and diff checks passed, production scripts/units shrank 490→489 physical lines with no decision-proxy increase, so the strict smaller candidate was adopted.

2026-07-27 post-merge activation: PR #259 merged as ecd5d0d29cc0d4f197e6ba047f4a6c86f4f8d5b6 and `qq-change land` fast-forwarded primary main. The existing `qqp-bot` credential was verified without switching global auth, then the bot was added to the existing main push restriction (current allowed users: hypermemetic, qqp-bot, qqp-dev, sshmendez). A clean long-lived `openwiki/update` worktree was created at `/home/qqp/.local/share/qq/worktrees/qq/openwiki-update` exactly at fresh `origin/main`.

`bin/qq-openwiki-schedule install` linked both repository-owned units from landed primary main, reloaded the user manager, and enabled the timer without starting generation. Fresh inspection proves service ExecStart `/home/qqp/projects/qq/bin/qq-openwiki-daily`, expanded Repository/Linuxbrew PATH, inactive service with no prior invocation, active/enabled timer, no previous trigger, and next elapse Monday 2026-07-27 03:00:00 CDT. All three unit symlinks resolve to landed Repository files and `systemd-analyze calendar` agrees.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered and activated the local daily OpenWiki freshness baseline.

- PR #259 landed the 03:00 machine-local non-persistent systemd timer, bounded scheduled maintainer, private machine-readable success receipts, semantic no-change finisher, guarded qqp-bot merge path, methodology guidance, and refusal-focused tests.
- The exact candidate must be reviewed, one commit on fresh main, generated Markdown/metadata only, regular and non-executable, CI-green, thread-clean, mergeable, and unchanged through the final recheck. Known drift refuses; a rare final GitHub race is detected for repair at the next 03:00 assessment.
- Fresh review blockers for silent internal failure and missing scheduled PATH were fixed; receipt publication ordering received a second regression fix and final PASS. The full shell suite, focused tests, shellcheck, systemd verification, ratchet, Backlog parse, diff checks, and CI passed.
- Post-merge activation added qqp-bot to the existing main restriction, established the clean long-lived openwiki/update worktree, linked the units from primary main, and verified the timer active/enabled for 03:00 CDT with no immediate run or catch-up.

Task Done records the agreed implementation and activation complete. The first production assessment remains intentionally scheduled rather than manually triggered.
<!-- SECTION:FINAL_SUMMARY:END -->
