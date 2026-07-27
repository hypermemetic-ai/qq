---
id: doc-110
title: Plan — Restore canonical delegate timeout policy precedence
type: specification
created_date: '2026-07-27 07:45'
updated_date: '2026-07-27 08:20'
---
# T-134.1 — Restore canonical delegate timeout policy precedence

Approved by the operator in the 2026-07-27 handoff after review of the diagnosis and proposed correction (“Alright, let's go ahead and do that to hand it off.”). Realigned after fresh review exposed qq-dispatch's independent 30-minute wrapper; the operator selected “Derive from manifest” in the same accountable session.

## Intended outcome

Restore the already-approved canonical delegate timeout policy from T-134 / PR #186: implementer, reviewer, researcher, and observer each own 45 minutes (2700000ms) in their role manifest. Remove later canonical Skill call-site drift and the independent qq-dispatch cap that bypass those manifests. This is a regression correction, not a new timeout-policy decision.

## Ownership boundary

qq owns the canonical role manifests, `delegate-batch`, `code-review`, and `research` Skills, `bin/qq-dispatch`, and focused bridge/dispatch contract tests that enforce their composition. The installed pi-subagents vendor runtime and dependency source remain unchanged.

## Non-goals

- No pi-subagents runtime feature or dependency fork.
- No unrelated Observer-surfacing fix.
- No coupling to the focus-independent intake prerequisite or T-164.
- No new tools, persistent state, gates, or confinement grants.
- No change to operator approval or merge authority.

## Decisions and dispositions

- Keep the canonical role duration at 45 minutes (2700000ms). Settled by T-134 / PR #186 and reaffirmed for all four current canonical roles by the approved 2026-07-27 handoff.
- Initial reviewer and implementer top-level single calls omit timeout overrides so role manifests own the duration. Approved in the same handoff.
- Research uses a normal top-level single launch, not an unnecessary one-step chain, and omits a timeout override so researcher-manifest injection applies. Approved in the same handoff.
- Recovery/resume reuses the source run's recorded timeout rather than introducing a second numeric policy literal. Approved in the same handoff.
- Tests enforce absence of hard-coded role timeout values in canonical Skills and retain 2700000ms in implementer, reviewer, researcher, and observer manifests. Approved in the same handoff.
- `qq-dispatch` derives its canonical delegate containment timeout from the exact trusted role manifest instead of retaining an independent 30-minute default. The operator selected “Derive from manifest” in the asked-and-answered 2026-07-27 review realignment after the live 45-minute run was observed to contain a 30-minute adapter process.

## Implementation

1. Reproduce the precedence failure in source and focused bridge tests, correlate it with lifecycle status from the active dispatch runtime root, and verify the independent qq-dispatch 30-minute wrapper without embedding machine-local temporary paths.
2. Remove initial implementer and reviewer call-site timeout overrides.
3. Convert research's one-step chain to a top-level single launch and remove its timeout override.
4. Change implementer/reviewer/researcher recovery instructions to reuse the source run's recorded timeout.
5. Derive qq-dispatch's containment timeout from the exact trusted canonical role manifest; refuse missing, duplicate, malformed, or nonpositive timeout declarations instead of falling back to another duration.
6. Update focused tests to prohibit canonical Skill timeout literals, require all four role manifests to remain 2700000ms, and exercise the adapter derivation/refusal contract.
7. Run Skill validation, affected checks, diagnostics, diff checks, and fresh-context review; address only confirmed in-scope findings.
8. Finalize T-134.1 and open one unmerged GitHub Flow pull request for operator handoff.

## Success evidence

- A pre-fix focused Check demonstrates the shorter Skill literals/chain and independent adapter default bypass manifest-owned timeout injection.
- Canonical Skills no longer contain numeric role timeout policy literals.
- All four role manifests still declare `timeoutMs: 2700000`.
- Research is a top-level single launch and recoveries inherit the source run's recorded timeout.
- qq-dispatch uses the exact trusted role manifest's timeout and fails closed on an absent, duplicate, malformed, or nonpositive declaration; no separate duration default remains.
- Skill validators, affected repository Checks, diagnostics, fresh-context review, and final GitHub Checks are green.
- The pull request remains unmerged for operator review and merge.
