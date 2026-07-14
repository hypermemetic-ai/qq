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

Read `CONCEPTS.md` before working and use its vocabulary.

Start with the assignment and context already provided. Resolve only what is
missing, using the surfaces present in the Repository:

- Tasks record durable intent and work status.
- Backlog documents and decisions preserve evidence, lessons, and settled choices.
- `openwiki/` describes the landed system.
- codebase-memory answers structural questions such as architecture,
  dependencies, call paths, or impact.

Use source files and fresh Checks to verify material conclusions. When a
derived surface conflicts with them, trust source and Checks and report the
conflict.

## Delivery

Changes land through GitHub Flow after their Checks pass and the operator
merges.

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the
codebase. It is one of several discovery tools: use the graph for structural
questions such as callers and impact, and text search for literals or unknown
shapes. Choose whichever answers the question fastest, then verify material
conclusions in source.

## Tool inventory

1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When text search fits

- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- Exploring an unknown shape before choosing a structural query

## Examples

- Find a handler: `search_graph(name_pattern=".*OrderHandler.*")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`
<!-- codebase-memory-mcp:end -->

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links.

OpenWiki is a derived orientation surface. Verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
