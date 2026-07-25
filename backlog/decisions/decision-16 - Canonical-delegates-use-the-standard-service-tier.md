---
id: decision-16
title: Canonical delegates use the standard service tier
date: '2026-07-25 17:30'
status: accepted
---
## Context

Canonical qq delegates currently retain the `openai-codex/gpt-5.6-sol:xhigh`
compute profile but `bin/qq-dispatch` also loads `extensions/qq-codex-fast.ts`
into every child. That extension mutates each OpenAI Codex request to
`service_tier: "priority"`. OpenAI's current subscription accounting charges
GPT-5.6 fast mode at 2.5 times the standard credit rate. A 2026-07-25 local
usage audit attributed roughly thirty percent of observed weekly consumption
to these priority delegates.

The earlier doc-91 migration condition said to retain the extension until the
patched Pi seam provided equivalent service-class transport and accounting.
T-153 has since delivered that generic seam. After reviewing the audit, the
operator directed: “Let's stop using fast mode for all of the delegates,” and
approved complete retirement rather than an opt-in delegate bypass.

## Decision

Every canonical qq delegate uses the standard/default service tier. qq must not
automatically request `priority` or fast mode from implementer, reviewer,
researcher, or observer children. A future execution-profile resolver selects
explicit `default`, or `provider-default` only where it is equivalent and emits
no priority request.

The delegate model and effort remain `openai-codex/gpt-5.6-sol:xhigh`. The
patched Pi runtime retains its generic typed service-class transport, telemetry,
and accounting capability; this decision changes qq policy, not the generic
runtime seam. Reintroducing a priority delegated seat requires a new explicit
operator-approved decision.

## Consequences

- `qq-dispatch` no longer loads a request-mutation extension into children.
- `extensions/qq-codex-fast.ts` is retired instead of remaining as an opt-in
  bypass.
- Dispatcher and extension-mount regressions prove the retired injection cannot
  return accidentally.
- Current operating documentation states the standard/default delegate tier.
- Already-running priority children must be interrupted and relaunched to pick
  up the policy; changing Repository files cannot alter their loaded process.
