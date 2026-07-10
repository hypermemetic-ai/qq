# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, useful skills, and project knowledge.

## Orient, align, act

Knowledge is useful only when an agent encounters it before planning. Use each
surface for the question it owns:

| Surface | Question it answers | Use |
|---|---|---|
| `CONCEPTS.md` | What do project terms mean? | Read before every work item and use its vocabulary consistently. |
| Backlog Tasks | What does the operator intend, and where does the work stand? | Search and update Tasks through the `backlog` CLI. |
| Backlog documents and decisions | What authored evidence, ideas, lessons, plans, or settled decisions already exist? | Search the shared index and read or mutate records only through Backlog commands. |
| `openwiki/` | What is the current landed system? | Read the relevant pages before changing described behavior. |
| codebase-memory | How does the code relate structurally? | Use its graph for architecture, dependency, call-path, and impact questions. |
| Backlog `solutions` documents and `compound` | What reusable lesson was already learned? | Read relevant lessons during orientation; capture new ones only after a verified, non-obvious solve. |

Source files and fresh Checks remain the final evidence. When a derived
Knowledge item conflicts with them, rely on source and surface the inconsistency
to the owning tool or Actor.

### codebase-memory tool map

The generated block below applies to relational code discovery in step 4. Use
plain text search for literals, messages, configuration, and non-code files.

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order
1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

## Examples
- Find a handler: `search_graph(name_pattern=".*OrderHandler.*")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`
<!-- codebase-memory-mcp:end -->

Start every work item in this order:

1. Read `CONCEPTS.md`.
2. When `backlog/config.yml` exists, run `backlog instructions overview`, then
   use `backlog search "<request>" --plain` to search Tasks, documents, and
   decisions before planning. Read relevant matches through the corresponding
   Backlog commands. Do not mutate Backlog during alignment. After approval,
   use the relevant CLI commands to create or update records; never edit
   Backlog-managed Markdown by hand.
3. Read the relevant OpenWiki pages and any matching Backlog `solutions` or
   `research` documents. If a Repository has no `openwiki/` yet, inspect its
   authored documentation and source instead.
4. Use codebase-memory when the question is relational. Use `list_projects` or
   `index_status` to confirm the Repository is indexed; run `index_repository`
   when it is absent or after material uncommitted or branch changes. Use
   `detect_changes` for Change-impact analysis, not as a freshness test, and
   verify important conclusions in source.
5. Invoke `grilling`. Its skill defines the narrow impact-free exception,
   explicit opt-out, and approved-continuation behavior.
6. Invoke every other Skill whose trigger matches the work.

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

## Runtime neutrality

Agent runtimes are replaceable; expose this methodology, its skills, and its
tools through each runtime's native discovery mechanisms.
