---
id: decision-14
title: Retain pi-subagents as the vendor runtime behind a thin qq adapter
date: '2026-07-24 19:22'
status: accepted
---
## Context

Decision-12 selected a narrow qq-owned delegate runtime after the exact
pi-subagents bridge because the production contract appeared much smaller than
the vendor package and no maintained external runtime had been proven against
qq's combined completion, confinement, lifecycle, cleanup, role, and
observation requirements.

T-154.3 and doc-94 tested current upstream commit
`7bf165240e48cd010263034dcfbeda41bc718fa5` plus qq's existing recovery patch.
The patch remains necessary, but the package already owns the general lifecycle
machinery T-154.2 proposed to build: launch, chains and fan-out, worktrees,
detached status/wait/stop, steering, resume, append, artifacts, progress,
schedules, watchdogs, and FleetView. Native unit, integration, and real-Pi
faux-provider E2E evidence was strong. One default-concurrency timeout test
remained flaky, and exact real-provider qq composition, canonical manifest
source authority, and production promotion were not yet proven.

After reviewing the landed evidence, the operator chose “Reframe to vendor
adapter” and approved the two-Change qualification plan on 2026-07-24.

## Decision

Supersede decision-12's long-term replacement destination. Retain
pi-subagents as qq's vendor delegation runtime behind a thin qq-owned adapter,
and maintain only deliberate, reviewed deltas that upstream does not yet own.
Use an exact immutable qq-fork commit; never track a moving branch, tag, or
range.

The vendor owns general child orchestration, lifecycle/status/control,
recovery descriptors, artifacts, progress, and its optional generic feature
implementations. qq retains all policy and authority that defines correct
production delegation: canonical trusted role and model occupancy, Completion
Envelope schemas and deadlines, `bin/qq-dispatch` and Landstrip confinement,
exact pin/delta review, persisted-session observation, Herdr/operator
visibility, work-order Skills, fresh review, GitHub Flow, and operator merge.

Accept that the pinned dependency contains chains, generic fan-out, schedules,
watchdogs, generic discovery, and a TUI. Their presence does not authorize qq
workflows to use them or transfer their policy to the vendor. New workflow use
still requires its own disposition.

Promote a new pin only after the advertised suite is repeatedly green, qq's
shared black-box contract passes, canonical qq manifest sources cannot be
shadowed, and a production-shaped real-provider canary proves completion,
resume, confinement, cleanup, lifecycle/session mapping, and post-hoc observer
harvest. The current `b7c531c238469e43866a1fe6697cb44279158c1c` pin remains
the rollback baseline until then.

## Consequences

- T-154 and T-154.2 are reframed from building a replacement to qualifying and
  adapting the vendor runtime. Planned qq launcher, lifecycle store,
  status/wait/stop/resume engine, artifact manager, notifier, and TUI work is
  deleted from the destination.
- qq still carries the terminal structured-output recovery semantic until
  upstream owns it, and may carry the smallest canonical-seat source lock
  needed by T-152/doc-88. Every delta remains reviewable against an exact
  upstream base.
- Vendor upgrades are deliberate Changes with package tests, qq contract
  tests, canary evidence, rollback, fresh review, and operator merge. A future
  vendor failure may reopen build/replace, but this decision cannot be silently
  reversed.
- Decision-8's open-egress Landstrip drift-net, decision-10's persisted Pi
  session content seam, and T-152/doc-88's qq-owned role/profile authority stay
  in force.
- Context7 tool ownership and decision-2 are separate. This decision neither
  installs Context7 nor changes MCP configuration.

## Implementation note — 2026-07-24

The qualified fork commit is
`9e045ed75e09a163afa17271e55150ed1e8369df`, with sole parent exact upstream
`e2a125ee09c2e9ec61b2f6e11f9c2fa887398a39`. Its external Change landed as
[`hypermemetic-ai/pi-subagents#1`](https://github.com/hypermemetic-ai/pi-subagents/pull/1).
The previous `b7c531c238469e43866a1fe6697cb44279158c1c` pin remains the verified
one-command rollback.
