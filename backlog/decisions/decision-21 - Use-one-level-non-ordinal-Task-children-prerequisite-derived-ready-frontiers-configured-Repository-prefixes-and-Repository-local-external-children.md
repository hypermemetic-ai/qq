---
id: decision-21
title: >-
  Use one-level non-ordinal Task children, prerequisite-derived ready frontiers,
  configured Repository prefixes, and Repository-local external children
date: '2026-07-27 18:30'
status: accepted
---
## Context

The operator needs one human-visible grouping level above independently
shippable Changes. Flat Tasks make a multi-Change outcome cumbersome to track,
while identifiers that imply sequence would hide legitimate parallel work.
Backlog already provides direct child Tasks and dependencies, but qq's active
board, handoff, Observer/Architect, branch, and guidance surfaces assume
integer `T-N` identities even though Backlog permits Repository-configured
prefixes and direct `N.M` children.

The operator approved a system-wide model on 2026-07-27, then explicitly chose
configuration-derived prefixes and Repository-local ownership for children
whose Changes live outside the umbrella Repository.

## Decision

qq uses exactly one direct Task-child level. A child suffix is a stable,
non-ordinal identity: parentage expresses membership and `depends_on` expresses
only a genuine prerequisite. The ready frontier consists of children whose
prerequisites are satisfied; ready children may run concurrently only after
the accountable owner checks Repository/worktree ownership, files, invariants,
external resources, and integration order. qq does not add a durable
`parallel_with` relation or support grandchildren.

Each Repository's configured Backlog `task_prefix` is authoritative. Active
Task identities are exactly `<CONFIGURED-PREFIX>-N` and one-level
`<CONFIGURED-PREFIX>-N.M`; qq does not hardcode `T` or `t` as a generic
requirement.

A Task remains in the Repository containing its Change. An external child uses
that Repository's native Task identity and the umbrella links it by qualified
`owner/repository:<Task-ID>` coordinate once it exists. Same-Repository
children use the umbrella's direct decimal identities.

## Consequences

- Decimal suffixes never encode dispatch or completion order.
- Dependencies expose candidates for parallel work without claiming that every
  unblocked pair is safe to overlap.
- Steps without an independent Change remain in a child plan or checklist.
- qq centralizes configured-prefix identity handling and updates affected
  runtime, test, and guidance surfaces; historical identifiers are not
  migrated.
- Cross-Repository grouping adds links, not mirrored Tasks, a global hierarchy,
  a scheduler, or shared workflow state.
- T-178 becomes the umbrella for the first opt-in project-agent broker pilot;
  its core child stays with the future core Repository and its later qq child
  depends on the released green core slice.
