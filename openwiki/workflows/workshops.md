---
type: Workflow architecture
title: Workshop Delegation
description: Architect-only Backlog tools and the asynchronous workflow that briefs a task, creates an isolated Git worktree, and starts a messaging-enabled runner in Herdr.
tags: [workshops, delegation, backlog, herdr]
openwiki:
  roles: [workflow, architecture]
  change_kinds: [delegation, lifecycle]
  source_paths: [extensions/workshop.ts, bin/lib/workshop.mjs]
  symbols: [registerWorkshop, makeBrief, spawnWorkshop]
  test_paths: [tests/test-workshop.mjs]
  invariants: [Only architect sessions can sketch note or delegate., Delegation accepts only To Do tasks and returns after runner startup., A failed startup removes resources created by that attempt.]
  validation_commands: [node --experimental-strip-types tests/test-workshop.mjs .]
---

# Workshop Delegation

The workshop extension turns an architect's board item into an isolated asynchronous runner. It depends on [execution profiles](../agent-runtime/execution-profiles.md) for role, compactor, and QA bindings; starts a runner that participates in [agent messaging](../agent-messaging/extension.md); and relies on the [Backlog guard](../agent-runtime/session-safety.md) to keep board Markdown CLI-managed.

## Tools

- `sketch(title, note?)` creates one Backlog task.
- `note(id, text)` appends task notes.
- `delegate(id)` requires an architect role and a task in `To Do`; it generates a compact outbound brief, starts the workshop, moves the task to `In Progress`, and returns without waiting for implementation.

## Delegation flow

```mermaid
sequenceDiagram
    participant Architect
    participant Workshop as Workshop extension
    participant Backlog
    participant Compactor
    participant Git
    participant Herdr
    Architect->>Workshop: delegate task id
    Workshop->>Backlog: view task and require To Do
    Workshop->>Compactor: summarize task conversation and file operations
    Workshop->>Git: create unique qq branch and worktree
    Workshop->>Herdr: create or split workshop pane
    Workshop->>Herdr: start runner and send brief
    Workshop->>Backlog: set In Progress
    Workshop-->>Architect: return running pane worktree and state
```

*Delegation provisions a runner and returns; merging and completion are outside this implemented flow.*

`makeBrief` serializes current conversation context and records files read versus modified, then invokes the policy's compactor with no cache retention. `spawnWorkshop` requires a named base branch and `HERDR_WORKSPACE_ID`, creates branch `qq/<task>-<nonce>`, writes private `brief.md` and `qq.workshop-handoff/v1` state, reuses or creates a no-focus `workshop` tab, and starts a Pi runner with `QQ_AGENT_ROLE=runner`, workshop identity, and architect session metadata. The runner is prompted to implement, commit, and call `done`; this repository does not yet track that completion/merge implementation.

If pane or runner setup fails, the function attempts to close its pane, force-remove its worktree, delete its branch, and remove private handoff state. If the runner starts but the board update fails, `delegate` reports a partial result rather than pretending nothing started.

## Change and validation

Changes to handoff schema must update writer, `readHandoff`, runner consumers when present, and tests. Changes to delegation must preserve To Do gating, unique branch/worktree isolation, private state, no-focus Herdr startup, asynchronous return, and scoped cleanup. Run `node --experimental-strip-types tests/test-workshop.mjs .`; also run profile or messaging tests when changing those boundaries. Full `npm test` is conditional on cross-extension wiring.