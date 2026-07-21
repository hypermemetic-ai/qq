---
id: T-123
title: Evaluate a maintained standalone domain-filtering path for delegates
status: Done
assignee: []
created_date: '2026-07-20 23:59'
updated_date: '2026-07-21 22:48'
labels: []
dependencies:
  - T-95
priority: low
type: task
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Revisit trigger from decision-8 (operator-accepted open delegate egress under
Landstrip 0.17.x): find and evaluate a maintained way to restore a domain
boundary for delegates without qq owning proxy machinery.

Known landscape at filing (owner-verified 2026-07-20): Landstrip 0.17.31's
binary schema has no domain lists (real fields: `httpProxyPort`,
`socksProxyPort`); domain enforcement exists only inside pi-landstrip's
extension-hosted proxy, which qq's binary-only adapter cannot run;
extracting it ports vendor lifecycle code into qq (declined in decision-8's
exchange).

Candidate shapes: upstream Landstrip gaining standalone domain filtering
(watch releases past 0.17.x); a separately maintained enforcing proxy the
adapter could launch per session (httpProxyPort enforcement by the binary
is real); a vendor-sanctioned standalone proxy mode. Ends in adopt/trial/drop
with evidence; if adopted, decision-8's posture narrows accordingly.

Decision ledger:
- Filed as decision-8's named revisit trigger: operator-approved alignment
  exchange, 2026-07-20 project-home session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Per-candidate disposition recorded with hands-on evidence, including whether the domain boundary holds under a fresh off-list connection probe
- [x] #2 If adopted, delegation policies enforce the delegate domain set fresh, and decision-8's accepted posture is amended by a new decision record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1 delivered 2026-07-21 by the confined researcher delegate (eval/t123-egress); disposition minted as research doc-75. Verdict: no adoption; Tinyproxy 1.11.3 + Landstrip httpProxyPort is the single TRIAL recommendation (boundary probed fresh: off-list 403, numeric bypass NETWORK_DENIED, pi EnvHttpProxyAgent honored it). AC#2 awaits the operator's TRIAL decision — four open questions recorded in doc-75. Current delegates retain decision-8's accepted open egress.

Closure 2026-07-21: operator decided no-adoption (asked-and-answered exchange). The Tinyproxy + Landstrip httpProxyPort TRIAL candidate is declined; delegates retain decision-8's accepted open egress and no amendment is minted. doc-75 retains the evidence and its four open questions should egress posture ever be revisited. AC#2's condition (adoption) did not trigger.
<!-- SECTION:NOTES:END -->
