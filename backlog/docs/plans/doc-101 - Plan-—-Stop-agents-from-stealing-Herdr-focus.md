---
id: doc-101
title: Plan — Stop agents from stealing Herdr focus
type: specification
created_date: '2026-07-25 18:05'
updated_date: '2026-07-26 16:55'
---
# T-163 — Stop agents from stealing Herdr focus

Approved initially by the operator on 2026-07-25; realigned in the same operator-facing session after the drift-net review convergence breaker.

## Intended outcome

Canonical orchestrator and architect roots may publish Herdr status and request notifications, but they do not initiate changes to the operator's active Herdr workspace, tab, or pane.

## Ownership boundary

qq owns its Pi extension, situational Skills, and operator-stage behavior. Herdr itself, delegated child roles, non-focus topology operations, and explicitly operator-driven navigation and accountable handoff remain outside this Change.

## Non-goals

- No standing `AGENTS.md` rule or prompt tax for unrelated Actors.
- No policy against moving, closing, or removing Herdr surfaces merely because of the operation category.
- No consent-navigation tool or permission system.
- No upstream Herdr modification.
- No removal of manual navigation bindings.
- No unrelated UAT or Architect redesign.

## Decisions and dispositions

- The scope is the canonical orchestrator and architect root roles; delegated implementer, reviewer, researcher, and observer children are excluded. Approved in the asked-and-answered realignment exchange on 2026-07-25.
- Roots never initiate Herdr focus. Direct focus verbs, explicit `--focus`, focus-purpose qq helpers, and focus-capable creation without explicit `--no-focus` are refused from Pi `bash`. Refusal explains the no-focus plus notification alternative. Approved in the same exchange.
- The drift-net handles ordinary direct commands, including Herdr global options before the subcommand. It is methodology defense-in-depth, not a shell parser or security boundary. Approved in the same exchange.
- The rule concerns focus outcome, not topology verbs: non-focus move/close/remove operations are not prohibited as categories. Approved after the operator corrected the over-broad framing in the same exchange.
- Do not add the rule to `AGENTS.md`. Keep guidance only at the situational UAT/operator-input seams and in just-in-time refusal text, avoiding standing context cost. Approved in the same exchange.
- No consent tool. Operator keybindings, manual navigation, and explicit accountable handoff remain available. Approved in the same exchange.

## Implementation

1. Keep `AGENTS.md` unchanged and amend only the relevant UAT/operator-input procedures.
2. Make `operator_stage` split its live caller with `--current --no-focus` and issue a Herdr request notification.
3. Scope the Pi `tool_call` drift-net to non-child roots. Refuse direct focus verbs, explicit `--focus`, focus-purpose qq helpers, and focus-capable creation without `--no-focus`; normalize ordinary global-option syntax without banning non-focus operation categories.
4. Add focused regressions for stale restoration, global-option variants, role scope, allowed read/non-focus/no-focus commands, and operator-stage behavior.
5. Run focused tests, all Repository Checks, diagnostics, fresh review, base reconciliation, and GitHub Flow delivery.

## Success evidence

- The exact `herdr tab focus wM:t4D` reproducer and `herdr --session … tab focus …` are refused before execution in orchestrator/architect roots.
- The same hook does not apply to asserted delegated children.
- Read-only inspection, notifications, explicit no-focus operations, and representative non-focus operations remain admitted.
- `operator_stage` is proven to use `pane split --current --no-focus` and send a request notification.
- `AGENTS.md` is unchanged from the reconciled base.
- All Repository Checks and fresh review pass.
