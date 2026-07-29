---
id: decision-27
title: Delete delegate confinement machinery
date: '2026-07-29 18:55'
status: accepted
---
## Context

doc-124 decision 6 records the operator's 2026-07-29 disposition that Git owns delegate isolation; read-only roles are bounded by their brief plus owner verification, not a syscall cage. T-184 and PR #281 removed the Landstrip layer. Task T-186.5 removes the remaining confinement-era enforcement tests and split mutation authority.

## Decision

Delete delegate confinement machinery. Git worktrees own isolation, while role briefs and owner verification define and verify read-only conduct.

## Consequences

- The remaining confinement-era enforcement tests and pi-subagents adapter surfaces are removed by Task T-186.5.
- Native and shell mutation authority are no longer split, settling `confinement-splits-native-and-shell-mutation-authority`.
- No syscall cage is represented as the enforcement boundary for read-only delegate roles.
