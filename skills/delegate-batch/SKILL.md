---
name: delegate-batch
description: Composes complete work orders and dispatches aligned bounded tickets through isolated worktrees and stateless qq engines while the accountable session retains judgment, gates, and delivery. Use for an approved batch or an operator to-do request.
---

# Delegate a bounded ticket batch

Start after intent and plan bounds settle. The accountable session remains in
project home, owning judgment and delivery; each writing ticket gets a
worktree.

## Work orders

Write a complete temporary brief per ticket: ticket and acceptance criteria,
context, exact orientation paths and verified facts, constraints, commit protocol,
exact Checks, and completion envelope. Require every temporary file, redirected log,
generated helper, cache (including npm), and runnable-test scratch beneath
confinement-provided `$TMPDIR`; never literal `/tmp` or worktree-local scratch.
Writers never push, open pull requests, or edit `backlog/`.
Durable intent stays in the checkout's Task. The `subagent` task is the brief
path.

- Couple shared files or invariants; work sequentially.
- Fan out independent reads; give writers disjoint branches, worktrees, and
  non-Git resources.
- Run only the dependency-derived ready frontier. Frontier membership alone
  never authorizes overlap: check accountable ownership and conflicts first.
  Child suffixes are non-ordinal, and no durable `parallel_with` relation exists.
- Cap writers at 3–5; serialize integration.

## Dispatch and status

Dispatch environment and config: README Install.

Use primary-`main`; never Change copies. `cwd` selects same-Repository
worktrees.

```ts
const completionEnvelopeSchema=JSON.parse(readFileSync("<absolute-worktree>/delegation/manifests/completion-envelope.schema.json","utf8"))
subagent({agent:"implementer",task:"Read-and-perform:<absolute-brief-path>",outputSchema:completionEnvelopeSchema,acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-worktree>",context:"fresh",async:true})
```

Use absolute brief/worktree paths. Pi-subagents owns roles, lifecycle, and
artifacts; the adapter owns containment. Add knowledge when required;
use harness-native subagents only beyond plan-bound tools or judgment.

Keep id/`details.asyncDir`. Inspect only at boundaries: fleet,
`status.json`, `events.jsonl`, output, and subagent log. No start after ten
minutes blocks with `no thread after 10m`; terminal nonzero or invalid/missing
structured output fails. After infrastructure failure, resume with the
source run's recorded `timeoutMs` and no contract override. Reconstruct from Tasks,
artifacts, transcripts, and worktrees.

After the first recognized `/dev/fd` process-substitution or
nested-confinement failure, record the Check once as
`inconclusive-under-substrate` and do not rerun it in the child. The owner's
native rerun plus CI is binding green.

## Verify and close

The envelope reports status, commits, files, Check results, decisions,
questions, risks, branch, worktree, and separate production-LOC and
decision-point deltas per fix commit. Read complete Check output; exit status
alone is not the result. Resolve a warning naming an in-scope corrective action
or list it in unresolved risks; never report it only as `pass`. Verify every
claim against the tree before publishing `envelope-verified`.

Growth in either counter spends one mechanical `same fix, smaller`
regeneration: checks pass and strictly smaller takes it; otherwise the original
stands.

The owner may steer rework but never transfers lifecycle, alignment, review, or
delivery. New decisions and scope gaps return to the assigner. Retain the five
gates—intent alignment, plan approval, review verdict, acceptance, merge—and
route every Change through `code-review` and `deliver-change`.
