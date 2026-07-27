---
id: doc-109
title: Plan — Focus-independent accountable handoff and Architect intake
type: specification
created_date: '2026-07-27 06:54'
updated_date: '2026-07-27 06:55'
---
# T-173 — Focus-independent accountable handoff and Architect intake

Approved by the operator in the accountable-owner alignment exchange on 2026-07-27 (`Approve as written`).

## Intended outcome

Accountable handoff and Architect intake succeed independently of transient Herdr global focus. Authority comes from the live root Pi identity and Repository project-home topology; Architect intake additionally requires qq's dedicated `architect` tab. The recipient is created as a fresh `--no-focus` tab in the same project home.

The confirmed batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4` / handoff `handoff-861f1e8f2428e0025ff75a8ae27d5fc4` remains immutable and pending. This Change is its separate prerequisite and neither alters nor retries it.

## Ownership boundary

qq owns `bin/lib/qq-handoff.py`, its wrapper/extension contract, deterministic handoff tests, and current README guidance. Herdr owns its substrate. The pending Architect batch, historical Tasks/plans/records, T-164, and unrelated handoff/lifecycle behavior remain outside this Change.

## Non-goals

- No pending Architect batch or handoff mutation, re-proposal, result mapping, or retry.
- No T-164 work or coupling to its Change.
- No Herdr substrate change, new durable state, generic authority framework, or broader lifecycle refactor.
- No weakening of Repository/project-home topology, dedicated Architect-tab, duplicate-owner, immutable-handoff, cleanup/preservation, startup/prompt, final-reinspection, or receipt rails.
- No rewrite of historical plans, Tasks, records, or receipts.

## Decisions and dispositions

- Authority derives from the live root Pi identity and Repository project-home topology; Architect intake additionally requires the dedicated `architect` tab, never global focus. Approved in the asked-and-answered operator alignment exchange on 2026-07-27.
- Remove focus equality, focus restoration, focus-based success/error gates and receipt claims, and consumption of current operator-focus state from ordinary accountable handoff and Architect intake. Use non-focus tab/pane listings for resource accounting. Approved in the same exchange.
- Keep recipient creation explicitly `tab create --no-focus` in the project home. Approved in the same exchange.
- Preserve all named non-focus authority, handoff, startup, prompt, cleanup, reinspection, and receipt rails. Approved in the same exchange.
- Reconcile current README wording only; leave historical records unchanged and exclude Herdr, new state, pending-batch work, T-164, and broader refactoring. Approved in the same exchange.
- Require a before/after regression for another-Repository focus and prove success, error, and proven-cleanup paths issue no focus command or focus-state read, followed by focused and Repository Checks plus fresh-context review. Approved in the same exchange.

## Implementation

1. Reproduce the current focus-mismatch refusal in the deterministic handoff harness before changing production code.
2. Replace focus-bearing runtime/resource discovery with live root Pi, project-home, dedicated-tab, and non-focus tab/pane list evidence.
3. Remove focus restoration state, commands, receipt language, and every focus-dependent result branch while preserving transaction semantics.
4. Update deterministic success, error, cleanup, and Architect-intake coverage; keep `tab create --no-focus`; update only current README wording.
5. Run `tests/test-qq-handoff.sh`, `tests/test-qq-handoff-extension.sh`, the full top-level `tests/test-*.sh` suite, Python/LSP diagnostics, `git diff --check`, fresh-context review, and GitHub Flow delivery.

## Success evidence

- The unfixed deterministic fixture refuses valid Architect intake when another workspace/tab/pane is focused; the fixed fixture succeeds.
- Ordinary handoff and Architect intake preflight consume no global-focus fields.
- Success, uncertain-error, and proven-cleanup call logs contain no `herdr agent focus`; recipient creation remains exact `tab create ... --no-focus`.
- Existing topology, dedicated-tab, duplicate-owner, immutable-handoff, cleanup/preservation, startup/prompt, final-reinspection, and receipt refusals continue to pass.
- Current README guidance states focus-independent behavior; historical records and excluded surfaces are unchanged.
- Focused and Repository Checks, diagnostics, diff hygiene, and fresh-context review are green.
