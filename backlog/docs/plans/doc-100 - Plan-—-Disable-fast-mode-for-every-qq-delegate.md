---
id: doc-100
title: Plan — Disable fast mode for every qq delegate
type: specification
created_date: '2026-07-25 17:30'
---

# Plan — Disable fast mode for every qq delegate

**Owning Task:** T-161

**Status:** Approved by the operator in the accountable session on 2026-07-25.

## Intended outcome

Every future qq delegate uses OpenAI's standard/default service tier. No qq
delegation path automatically requests `priority` or fast mode.

## Ownership boundary

One qq Repository Change will:

1. Remove `qq-dispatch`'s mandatory loading of
   `extensions/qq-codex-fast.ts`.
2. Retire the now-unused fast-mode extension rather than preserve an opt-in
   bypass.
3. Update dispatcher and extension-mount regressions so canonical implementer,
   reviewer, researcher, and observer launches prove no fast extension is
   injected.
4. Update README/runtime documentation to state delegates retain
   `openai-codex/gpt-5.6-sol:xhigh` but use the provider's standard/default
   service tier.
5. Record the broader operator decision so future execution-profile policy
   cannot silently restore priority.

## Non-goals

- Do not change delegate model or reasoning effort.
- Do not remove the patched Pi runtime's generic service-class transport and
  accounting capability.
- Do not change native Codex CLI configuration or ordinary accountable Pi
  routing.
- Do not redesign pi-subagents, Landstrip, role manifests, or completion
  contracts.

## Live-process handling

An already-running priority delegate cannot be changed in place. Its owning qq
session is notified to interrupt it and relaunch without the fast extension if
work must continue.

## Success evidence

- `qq-dispatch` launches all canonical roles without
  `--extension .../qq-codex-fast.ts`.
- The fast extension is absent and no current production, test, or operating
  documentation surface claims automatic priority delegation.
- Targeted dispatch and extension-mount checks pass, followed by applicable
  Repository checks.
- Fresh-context code review reports no material defect, or confirmed findings
  are fixed and re-reviewed.

## Decision ledger

- Standard/default service class for every canonical delegate, with model and
  xhigh effort unchanged — decision-16 and the operator's direction on
  2026-07-25: “Let's stop using fast mode for all of the delegates.”
- Complete extension retirement rather than an opt-in bypass — operator
  approval of this plan on 2026-07-25.
- Preserve generic patched-Pi service-class support — the approved non-goal in
  this plan; T-153 remains authoritative for the transport seam.
