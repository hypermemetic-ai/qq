---
id: T-144
title: >-
  Stage operator-only commands in a guarded herdr pane — qq-operator-stage
  extension + operator-input amendment
status: To Do
assignee: []
created_date: '2026-07-23 00:01'
labels: []
dependencies: []
type: feature
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator rule (2026-07-22, accountable project-home session): never dictate copy-paste commands for operator-only steps. Stage the command in a focused right-hand herdr pane (herdr pane split/send-text); the agent never sends Enter; the guard matches danger (low: staged unexecuted, one Enter runs it; high: confirm-read wrapper, two presses); pane auto-closes on success, stays open on failure/abort; the agent reads the pane back to validate the outcome. Machinery lands as a pi extension (extensions/qq-operator-stage.ts, following the qq-split-fork.ts precedent); the doctrine amendment lands in operator-input SKILL.md and must keep the prose ratchet green (fit the budget or carry an explicit operator-approved raise).

Decision ledger: the staged-pane rule and the extension-over-skill shape — operator directive + asked-and-answered exchange, accountable project-home session 2026-07-22 ('as a rule, update operator input... maybe it should be an extension, right?', confirmed 'mint the task'). Pattern demonstrated manually in the same session: the primary-clean command staged in pane wM:p4Q with a confirm guard; operator completed it in two presses, unblocking lands #205/#206.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 extensions/qq-operator-stage.ts registers an operator_stage tool (command, description, danger) driving herdr pane split/send-text/focus; agent never sends Enter; high-danger wraps the confirm-read; auto-close on success, stays open on failure/abort; pane-read-back validates the outcome
- [ ] #2 operator-input SKILL.md amended to prescribe staging over dictation; prose ratchet green (fits budget or explicit approved raise recorded)
- [ ] #3 Native test suite green including new coverage for guard behavior and teardown discipline
<!-- AC:END -->
