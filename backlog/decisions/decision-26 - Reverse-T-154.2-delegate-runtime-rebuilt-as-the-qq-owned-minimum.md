---
id: decision-26
title: 'Reverse T-154.2: delegate runtime rebuilt as the qq-owned minimum'
date: '2026-07-29 18:54'
status: accepted
---
## Context

doc-124 decision 3 records the operator's 2026-07-29 disposition that the delegate runtime be rebuilt ground-up around only role separation, parallel batch, completion-as-artifact, and observation-as-records; everything else from pi-subagents is noise. E1's `bin/qq-delegate` delivered that qq-owned minimum. Task T-186.5 removes the vendored-runtime adapter and activation surfaces that the new engine supersedes.

## Decision

Reverse T-154.2's selection of pi-subagents as qq's vendor delegate runtime. `bin/qq-delegate` is qq's delegate runtime authority.

## Consequences

- `bin/qq-dispatch`, `qq-subagent-env`, and execution-profile receipt machinery are removed by Task T-186.5.
- decision-22's disposition dropping the pi-subagents 0.37 Change remains in force.
- The vendor fork remains immutable history and is not an installation or runtime authority.
