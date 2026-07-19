# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, skills, and project knowledge.

## Invariants

These rules apply to every work item.

**Stay within the agreement.** The operator owns intent, scope, and
consequential decisions. Act within what was agreed; stop and realign when the
work requires a new commitment or side effect.

**Make uncertainty visible.** State material assumptions, ambiguities, and
tradeoffs before they shape the work. When alternatives matter, recommend one;
when the choice belongs to the operator, ask.

**Solve the agreed problem—no more, no less.** Choose the simplest change that
achieves the agreed outcome. Do not add speculative capability, unrelated
refactors, or out-of-scope cleanup.

**Use evidence to decide and report.** Define observable success before acting.
Inspect the evidence behind material conclusions, and claim completion only
when fresh Checks demonstrate the intended outcome.

## Context

Read `CONCEPTS.md` before working and use its vocabulary. Where present,
`CONCEPTS.local.md` appends the Repository's own vocabulary to that
glossary.

Start with the assignment and context already provided. Resolve only what is
missing, using the surfaces present in the Repository:

- Where present, Tasks record durable intent and work status.
- Where present, Backlog documents and decisions preserve evidence, lessons,
  and settled choices.
- Where present, `openwiki/` describes the landed system.
- Where present, codebase-memory answers structural questions such as architecture,
  dependencies, call paths, or impact.

Use source files and fresh Checks to verify material conclusions. When a
derived surface conflicts with them, trust source and Checks and report the
conflict.

## Delivery

Changes land through GitHub Flow after their Checks pass and the operator
merges.

## Review guidelines

When reviewing a Change in a Repository with a root `REVIEW.md`, read it fully
before inspecting the diff and apply its reviewer rules. The review brief
supplies the Change's intent, boundary, and threat model; where the brief
declares scope, the brief wins.

The tool-managed sections below describe optional per-Repository surfaces.
Each applies only where its named surface exists in the Repository being
worked on.

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

codebase-memory-mcp maintains a graph. Use the graph for structural questions:
callers, dependencies, and impact; use text search for literals, non-code files,
or unknown shapes. Verify conclusions in source.

In Pi, additive `fffind`, `ffgrep`, and `fff-multi-grep` tools are available alongside built-in `find`/`grep`; monitor `agent chooses built-ins over fff` in session logs.

## Runtime routes

When the runtime exposes native MCP tools, use these names:

1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

Pi has no MCP server. Run `codebase-memory-mcp cli list_projects`, then use the
`name` whose `root_path` matches the checkout:

- `codebase-memory-mcp cli search_graph --project <name> --name-pattern '.*OrderHandler.*'`
- `codebase-memory-mcp cli trace_path --project <name> --function-name OrderHandler --direction inbound`

Choose the available route; tool intent is identical.
<!-- codebase-memory-mcp:end -->

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links.

OpenWiki is a derived orientation surface. Verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
