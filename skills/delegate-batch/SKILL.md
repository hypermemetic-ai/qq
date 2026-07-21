---
name: delegate-batch
description: Composes complete work orders and dispatches aligned bounded tickets through isolated worktrees and stateless qq engines while the accountable session retains judgment, gates, and delivery. Use for an approved batch or an operator request to work the to-do list.
---

# Delegate a bounded ticket batch

Start only after intent and plan bounds settle. For aligned or board-driven
work, the accountable session stays in the project home and owns judgment and
delivery; each writing ticket gets its own work session and worktree.

## Work orders and shape

Write one complete brief per ticket under the OS temporary directory. Include
the ticket and acceptance criteria, necessary batch context, exact orientation
paths and verified facts, hard constraints, commit protocol, exact Checks, and
required completion envelope. Writing delegates work locally, never push or
open pull requests, and never edit `backlog/`. Keep durable intent in the Task;
the `subagent` task is only the work-order file pointer.

- Couple shared files or invariants and work them sequentially.
- Fan out independent read-only work natively; give independent writers
  disjoint branches, worktrees, work sessions, and non-Git resources.
- Run only a dependency chain's unblocked frontier. Keep at most 3–5 writing
  tickets in flight and serialize integration.

## Dispatch and status

Pi-launch env (one-time; cockpit/Herdr config/shell-rc):

```sh
PI_SUBAGENT_PI_BINARY=<repo-primary>/bin/qq-dispatch
PI_SUBAGENT_EXTRA_AGENT_DIRS=<repo-primary>/delegation/manifests/agents
```

`~/.pi/agent/extensions/subagent/config.json`: `{"intercomBridge":{"mode":"off"}}`.

Use primary-`main`; never Change copies. `cwd` selects same-Repository
worktrees:
`<repo-primary>/delegation/manifests/agents/implementer.md`.

```ts
const completionEnvelopeSchema=JSON.parse(readFileSync("<absolute-worktree>/delegation/manifests/completion-envelope.schema.json","utf8"))
subagent({chain:[{agent:"implementer",task:"Read-and-perform:<absolute-brief-path>",outputSchema:completionEnvelopeSchema}],cwd:"<absolute-worktree>",context:"fresh",async:true,timeoutMs:1800000})
```

Use only absolute paths; the task points to the temporary work order and `cwd`
is its worktree. Pi-subagents owns fresh role configuration, lifecycle, and
artifacts; the adapter owns containment. Opt into external knowledge only when
the brief requires it; use a harness-native subagent only for tools or judgment
beyond the plan bound.

Keep the returned id and `details.asyncDir`. At natural boundaries inspect once,
never poll: status by id, fleet status, `status.json`, `events.jsonl`, live
`output-<index>.log`, and `subagent-log-<run-id>.md`. If events/status show no
started child after ten minutes, block with `no thread after 10m`. A terminal
nonzero result or missing/invalid structured output fails dispatch. Reconstruct
after dispatcher loss from Tasks, native artifacts, transcripts, and worktrees.

## Verify and close

The envelope reports per-ticket status, commits, files, Check results,
contestable decisions, open questions, risks, branch, and worktree. It always
displays parallel, never-blended net production-LOC and decision-point deltas
for every fix commit. Verify every claim against the tree before publishing
`envelope-verified`.

Growth in either counter spends one mechanical `same fix, smaller`
regeneration. Checks pass and strictly smaller takes it; otherwise the original
stands without justification prose.

The owner may steer rework but never transfers lifecycle, alignment, review, or
delivery. New decisions and scope gaps return to the assigner. Retain the five
gates—intent alignment, plan approval, review verdict, acceptance, and merge—
and route every Change through `code-review` and `deliver-change`.
