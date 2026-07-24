---
id: doc-87
title: T-152 role-based model routing — approved research plan
type: specification
created_date: '2026-07-24 05:26'
updated_date: '2026-07-24 05:26'
---
# T-152 role-based model routing — approved research plan

**Owning Task:** T-152
**Status:** Approved by the operator in the project-home accountable session on 2026-07-24.
**Change boundary:** Research and recommendation only; no routing implementation or machine-setting mutation.

## Intended system

Every model execution in this qq-owned Pi installation occupies exactly one immutable workflow seat:

| Role | Seat |
|---|---|
| `orchestrator` | Any non-child root Pi session except the architect tab |
| `architect` | The root Pi session occupying the dedicated architect tab |
| `implementer` | Explicitly assigned delegated implementation run |
| `reviewer` | Explicitly assigned fresh, independent Change-review run |
| `researcher` | Explicitly assigned independent evidence-gathering run |
| `observer` | Explicitly assigned post-hoc session-analysis run |

A new role is admitted only when substituting another role—even with the same model, tools, and capabilities—would violate a recurring invariant concerning authority, independence, evidence, or lifecycle. Agent names, skills, and capabilities do not define roles.

## Routing contract

One install-wide, operator-owned configuration defines all six complete profiles. Each profile has only three typed fields: exact provider/model, supported effort level or an explicit default sentinel, and supported service class or an explicit default sentinel.

Repository settings and agent manifests cannot override routing. No occupancy override, provider-options escape hatch, automatic fallback, clamping, omission, or stale-config continuation exists. Invalid or unsupported profiles block the next request with a precise error. Routing never changes access, tools, network policy, authority, independence, or lifecycle.

The whole profile resolves atomically before each logical agent request and stays pinned through that prompt's complete tool-use loop. A valid shared-config edit can change every field, including model, for the next prompt across every running session of that role. In-flight work is never interrupted or handed to another model.

Existing Pi footer and pi-subagents displays remain the visibility surfaces. A new UI is out of scope unless the investigation proves a material service-class visibility gap.

## Investigation

1. Verify the current installed Pi extension/model APIs, configuration reload behavior, model and effort switching, request lifecycle, footer behavior, and provider service-tier transport from primary documentation and source.
2. Verify pi-subagents' current agent discovery, model/thinking precedence, child launch environment, and display surfaces, including how role identity can be carried without deriving it from an agent name.
3. Search the current Pi package ecosystem and upstream implementations for an adoptable role/preset/model router. Inspect candidate source before judging fit.
4. Use safe local probes where documentation or source is insufficient. Do not make live paid model requests or mutate operator settings.
5. Compare four dispositions—adopt, adapt, build a small qq extension, or upstream a missing Pi capability—against every approved requirement and the smallest-resulting-system rule.
6. Deliver one cited, confidence-tagged research report with observed facts separated from inference and gaps, plus a bounded implementation brief for the recommended disposition.

## Success evidence

- Every load-bearing requirement has primary-source evidence or an explicit unresolved gap.
- Service-class control is traced end to end, including request payload and usage/cost accounting implications.
- Root-session and delegated-child role resolution are both covered.
- Hot changes are evaluated at the whole-agent-request boundary, not between tool continuations.
- The recommendation names what can be adopted unchanged, what requires adaptation, and what qq must own.
- Applicable repository Checks and fresh-context review pass before the research pull request is handed off.

## Non-goals

No routing implementation, user-setting change, live paid API probe, access-policy change, role expansion, new UI, automatic fallback, project-specific profile, or support for other harnesses/Pi installations belongs to this Change.
