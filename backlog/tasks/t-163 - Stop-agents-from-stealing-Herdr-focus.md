---
id: T-163
title: Stop agents from stealing Herdr focus
status: Done
assignee: []
created_date: '2026-07-25 18:04'
updated_date: '2026-07-26 17:30'
labels: []
dependencies: []
documentation:
  - doc-101
priority: high
type: bug
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The operator reports that background Pi roots randomly pull the active Herdr tab into another session. Fresh evidence from 2026-07-25 identifies a direct cause: the background `observer-routing` root closed its disposable UAT tab and then ran `herdr tab focus wM:t4D`, restoring stale focus over the operator's current tab. Earlier calls in the same session also focused the disposable UAT tab directly. Stop direct focus-command use from the canonical orchestrator and architect root roles while retaining Herdr status, request notifications, and non-focus operations.

Ownership boundary: qq owns its Pi extension, situational Skills, and cockpit-facing operator-stage behavior. Herdr itself, delegated child roles, non-focus topology operations, and explicitly operator-driven navigation/handoff remain outside this Change.

Decision ledger:
- `doc-101` and the asked-and-answered operator approval on 2026-07-25 — orchestrator and architect roots never initiate Herdr focus; asynchronous surfaces use explicit no-focus behavior plus notification.
- `doc-101` and the same approval — direct Herdr focus commands through Pi `bash` are refused with a just-in-time explanation; this is a methodology drift-net for ordinary commands, not a shell security boundary or a policy against moving, closing, or removing surfaces.
- `doc-101` and the same approval — no standing `AGENTS.md` rule or consent tool; guidance lives only at the relevant UAT/operator-input seams so unrelated Actors pay no prompt cost.
- `doc-101` and the same approval — delegated children are excluded; operator keybindings, manual commands, and explicit accountable handoff remain available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canonical orchestrator and architect roots cannot execute direct Herdr focus verbs, explicit --focus, or focus-purpose qq helpers through Pi bash; delegated child roles are excluded and refusals explain the no-focus/notification alternative.
- [x] #2 operator_stage resolves its live caller with pane split --current, creates with explicit --no-focus, and emits a Herdr request notification containing the owned pane location.
- [x] #3 The drift-net admits read-only Herdr inspection, notifications, explicit no-focus operations, and non-focus operations; it does not establish a separate policy against moving, closing, or removing surfaces, and operator keybindings/manual commands remain outside the tool path.
- [x] #4 No standing AGENTS.md focus rule or consent tool is added; no-focus guidance is limited to the relevant UAT/operator-input seams.
- [x] #5 The exact stale-focus reproducer and global-option variants fail before execution; focused regressions, all Repository Checks, diagnostics, base reconciliation, and fresh-context review are green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the no-focus guidance out of `AGENTS.md`; amend only the situational UAT/operator-input procedures.
2. Make `operator_stage` target its live caller with `--current --no-focus` and issue a Herdr request notification instead of grabbing focus.
3. Add a root-scoped Pi `tool_call` drift-net that refuses direct focus verbs, explicit `--focus`, focus-purpose qq helpers, and focus-capable creation without `--no-focus`; normalize ordinary Herdr global-option forms and explain the no-focus alternative. Do not turn move/close/remove into prohibited categories.
4. Add focused regressions for the stale-focus reproducer, global-option syntax, root-versus-child scope, allowed read/non-focus/no-focus forms, and operator-stage behavior.
5. Run focused tests, all Repository Checks, diagnostics, fresh review, base reconciliation, and GitHub Flow delivery.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered implementation in PR #250 (merge commit `89c4b6ac5ea69eb50f7eae5cdf0c707dc989c346`). Canonical orchestrator and architect roots now refuse direct Herdr focus verbs, explicit `--focus`, focus-purpose qq helpers, and focus-capable create/open commands without `--no-focus` through Pi `bash`; asserted delegated children and non-focus commands remain outside the guard. `operator_stage` now splits its live caller with `--current --no-focus` and sends a request notification containing the owned pane ID. No standing `AGENTS.md` rule or consent tool was added.

Evidence: the exact stale-focus and global-option/path variants are covered; all top-level Repository tests passed before and after base reconciliation; focused extension/mount tests, both Skill validators, ratchet at 7969, ShellCheck, diff checks, and TypeScript LSP passed; final fresh review `f5b613dd-23e2-4c53-9ccb-774f63b9401a` returned APPROVE with no residual risks. Mechanical counters: +58 production LOC / +17 decision points; retained same-fix-smaller pass removed 8 production LOC and 2 decision points. This record-only finalization follows separately because the accountable owner mistakenly handed off PR #250 before completing delivery step 6; the operator explicitly approved the repair.
<!-- SECTION:FINAL_SUMMARY:END -->
