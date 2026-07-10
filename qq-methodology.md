# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, useful skills, and project knowledge.

## Start every work item

1. Read `CONCEPTS.md`. Use its vocabulary consistently in reasoning,
   conversation, code, Tasks, and documentation.
2. Invoke `grilling` for every new work item. Its skill defines the narrow
   impact-free exception, explicit opt-out, and approved-continuation behavior.
3. Invoke every other skill whose trigger matches the work.

## Behavioral floor

These guidelines favor caution over speed. Scale their application to the work
without weakening them.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them rather than silently choosing
  one.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name the confusion and resolve it.

### 2. Simplicity First

Write the minimum code that solves the agreed problem. Nothing speculative.

- Add no features beyond what was requested.
- Add no abstractions for single-use code.
- Add no flexibility or configurability that was not requested.
- Add no error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

Ask whether a senior engineer would call the result overcomplicated. If so,
simplify it.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing work:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match the existing style even when you would choose another.
- Mention unrelated dead code instead of deleting it.

When your changes create orphans:

- Remove imports, variables, functions, and files made unused by your change.
- Leave pre-existing dead code alone unless the operator includes it in scope.

Every changed line should trace directly to the operator's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- “Add validation” becomes tests for invalid inputs that pass.
- “Fix the bug” becomes a failing reproduction that the fix makes pass.
- “Refactor X” becomes proof that the relevant behavior survives unchanged.

For multi-step work, state a brief plan:

    1. [Step] → verify: [check]
    2. [Step] → verify: [check]
    3. [Step] → verify: [check]

Strong success criteria let the agent loop independently. Weak criteria require
clarification.

The guidelines are working when diffs contain less unrelated change, solutions
arrive without unnecessary machinery, and questions surface before mistakes.

## Tasks and Changes

Backlog.md is the registry for durable intent, acceptance criteria, dependencies,
and work status. Keep the owning Task aligned with the operator's decisions and
mark it Done after its acceptance criteria are verified and its Change has
landed.

GitHub Flow is the delivery path:

1. Create a branch for the Change.
2. Implement and verify coherent units of work.
3. Run an independent `code-review` for every non-trivial Change, resolve its
   confirmed findings, and rerun affected Checks.
4. Commit only green work and push after each green commit.
5. Open a pull request.
6. Pass the Repository's final GitHub Checks.
7. The operator merges the pull request.
8. GitHub deletes the merged branch.

## Verification and review

Before claiming completion, run fresh Checks that directly observe the changed
behavior or artifact. Read their complete output and confirm that they answered
the intended question.

Every non-trivial Change receives an independent `code-review` with
fresh-context independence after implementation and before commit, push, pull
request creation, and the final GitHub-side Checks. Resolve confirmed findings
and rerun affected Checks before presenting the candidate for merge.

## Agent collaboration

Agents are invited to communicate directly through herdr whenever coordination
helps. Use `herdr agent list`, `herdr agent get`, `herdr agent read`, and
`herdr agent wait` to find, inspect, and wait for one another. `herdr agent send`
delivers literal text without Enter; use `herdr pane run` with the pane id when
the message should be submitted as a turn. No additional protocol is required.

## Knowledge

`CONCEPTS.md` is the system's shared language. Use its terms consistently and
keep it aligned through `compound`.

Use codebase-memory whenever its structural view makes sense for the question.

OpenWiki describes the current system.

`idea`, `research`, and `compound` own their respective Knowledge items under
`docs/`. Follow those skills for their formats and behavior.

## Runtime neutrality

Agent runtimes are replaceable; expose this methodology, its skills, and its
tools through each runtime's native discovery mechanisms.
