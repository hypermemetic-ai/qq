---
id: decision-8
title: Delegate network egress accepted as open under Landstrip 0.17.x (T-95)
date: '2026-07-20 23:55'
status: accepted
---
## Context

T-95's migration puts real delegates inside Landstrip. Verified fresh during
the Change's review loop: Landstrip 0.17.31's network policy is
all-or-nothing — `allowedDomains`/`deniedDomains` are not in the binary's
schema (its real fields are `httpProxyPort`/`socksProxyPort`); owner probes
showed a chatgpt.com-only policy still reaching example.com (200) and a
deny-listed domain equally reachable. Domain filtering exists only through
pi-landstrip's extension-hosted enforcing proxy, which qq's binary-only
adapter path cannot run; extracting it ports vendor lifecycle code into qq
(the accretion pattern doc-39/doc-50 warn against). Every delegate role
needs network egress for the model API regardless of role. The pilot's
network-route approval semantics held only because the pilot's mock child
needed no API.

## Decision

Accept full network egress from delegates as the declared posture and ship
T-95. Approved by the operator (asked-and-answered alignment exchange,
2026-07-20 project-home session). Declared threat model:

- Delegates are operator-dispatched semi-trusted workers; the sandbox is
  accident and drift containment, not an adversary boundary (drift-net
  semantics per CONCEPTS).
- The staged OAuth credential is readable inside the child (vendor-sanctioned:
  Landstrip provides no credential broker; auth.json stays read-only for
  children, and OAuth refresh completes in the root Pi first).
- Compensations: run artifacts and transcripts are auditable; fresh-context
  review and owner verification stand; the operator merge is the hard gate.
- Policy files must not claim a domain boundary that does not exist (the
  inert allowlist/denylist fields are removed rather than left as implied
  protection).

## Consequences

- Filesystem confinement (reviewer/researcher read-only, implementer
  worktree-write, no sibling-run writes, credential read-only) is the real
  boundary and was demonstrated fresh under the new substrate (AC#3).
- Network-route approval semantics from the T-94/T-120 pilot checks are
  retired as unimplementable under Landstrip 0.17.x; do not recite them as
  current capability.
- Revisit trigger: a maintained standalone domain-filtering path (upstream
  Landstrip feature, or a separately maintained enforcing proxy) — ticketed
  as follow-up evaluation work.
