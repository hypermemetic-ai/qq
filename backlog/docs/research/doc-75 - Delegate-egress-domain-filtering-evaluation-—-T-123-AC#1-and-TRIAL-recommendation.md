# Delegate egress domain filtering — T-123 evaluation (doc-75)

2026-07-21 · confined researcher delegate (eval/t123-egress), owner-verified envelope · status: AC#1 delivered, TRIAL recommendation pending operator decision

## Question

Can delegates' network egress be constrained to a declared domain set by a
maintained, standalone mechanism qq can adopt without owning proxy
machinery? (Decision-8 currently accepts open egress under Landstrip
0.17.31.)

## Verdict per candidate (all probed fresh 2026-07-21)

| Candidate | Disposition | Evidence summary |
|---|---|---|
| Upstream Landstrip standalone domain lists | **DROP** | 0.17.31 (latest, 2026-07-20) has no domain fields; a probe with `allowedDomains` in the policy returned HTTP 200 for an off-list domain — the boundary does not exist. |
| Tinyproxy + Landstrip `httpProxyPort` | **TRIAL** (not adopt) | 1.11.3 built from verified checksum; composed with Landstrip `httpProxyPort`, on-list returned 200 and off-list returned 403/exit 56; a numeric direct bypass was denied (NETWORK_DENIED). pi's `EnvHttpProxyAgent` honored the same boundary. qq would own only launch/config/lifecycle glue at the qq-dispatch chokepoint. |
| Squid | **DROP** | Capable, but operational weight (daemon, cache, users) dominated by the leaner probed candidate. |
| Stripe Smokescreen | **DROP** | Source alive but no current release artifacts (newest tag 2022); qq would own packaging/build surface. |
| Vendor pi-landstrip proxy mode | **DROP** | No standalone proxy binary exists; the enforcing path is a non-exported closure inside the Pi integration. |

## TRIAL recommendation (pending operator decision)

Tinyproxy 1.11.3, pinned and unmodified, launched per-dispatch on loopback
with a per-run rendered allowlist and random BasicAuth, wired through
Landstrip `httpProxyPort`; failure/orphan behavior exercised natively before
any adoption. **Not yet trialed:** native qq-dispatch integration, the real
model/OAuth endpoint allowlist, packaging, and a live delegate model request.
The full composition was demonstrated in an ephemeral Docker container with
the outer seccomp profile disabled; a native rerun is required.

Known residual risk if adopted: Tinyproxy filters by request hostname then
resolves it — no Smokescreen-style post-DNS public-route check, so a
not-fully-trusted allowed hostname leaves DNS-rebinding exposure.

## Open questions for the operator (before AC#2 work)

1. Exact model, OAuth, telemetry, and package-registry hostnames each role
   must reach; wildcards acceptable?
2. Is a pinned OS-level Tinyproxy dependency plus per-session glue
   "integration" or qq-owned proxy machinery, by qq's doctrine?
3. Linux-only initially — acceptable?
4. Should the trial require post-DNS public/private-address rejection?

## Disposition

- T-123 AC#1: satisfied by this evaluation (hands-on evidence per candidate,
  fresh off-list probes).
- T-123 AC#2: unstarted; conditional on the operator's TRIAL decision above.
  Current delegates retain decision-8's accepted open egress
  (bin/lib/qq-render-landstrip-policy.mjs emits `allowNetwork: true`).
- Full envelope with exact probe commands: this session's wave-1 researcher
  run (completion envelope, 2026-07-21).
