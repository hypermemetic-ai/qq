# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, skills, and project knowledge.

## Invariants

These hold for every Actor, every work item, and every runtime. They favor
caution over speed; scale their application to the work without weakening
them.

**Act within what was granted.** Scope, authority, and side effects come from
the operator, not from momentum. When the work wants more than was approved,
stop and re-align.

**Don't assume. Don't hide confusion. Surface tradeoffs.** State your
assumptions. When several interpretations exist, present them instead of
silently choosing one. When a simpler approach exists, say so — push back when
warranted. When something stays unclear, stop and name it.

**Do the minimum that solves the agreed problem. Nothing speculative.** No
features beyond the request, no abstractions for single-use code, no
flexibility nobody asked for, no handling for cases that cannot occur. If 200
lines could be 50, rewrite. If a senior engineer would call the result
overcomplicated, simplify. Context follows the same rule: load what the task
needs, not what might someday help.

**Touch only what you must. Clean up only your own mess.** Leave adjacent
code, comments, and formatting alone, and match the existing style even where
you would choose another. Remove what your change orphaned; mention
pre-existing dead code instead of deleting it. Every changed line traces to
the request.

**Re-align before committing to architecture.** Durable state or a new source
of truth, lifecycle or background behavior, a coordination or recovery
protocol, a trust boundary, a compatibility obligation, operational burden, a
responsibility moved between Actors — none of these enters the work
unapproved. Unexpected growth means alignment may have drifted; treat it as a
signal, not a violation.

**Define success criteria. Loop until verified.** Turn intent into observable
outcomes: a failing reproduction the fix makes pass, tests that reject the
invalid inputs, proof the behavior survived the refactor. For multi-step work,
say the plan first, each step paired with its check. Claim completion only on
fresh Checks that observed the changed behavior — read their full output and
make sure they answered the question you meant to ask.

**Don't rediscover what you were handed. Don't borrow conclusions.** When
work arrives with its orientation resolved — intent, decisions, locations,
results — work from it. What you conclude is different: inspect the evidence
it rests on yourself. Another Actor's conclusion can point at evidence; it can
never be your evidence. When a supplied fact is missing, stale, or
contradicted by source, resolve that one fact with its owner instead of
restarting discovery.

**Keep the methodology portable.** These rules mean the same thing in every
agent runtime. Expose Skills, knowledge, and tools through each runtime's
native discovery, and keep anything runtime-specific disposable.

## Starting work

Knowledge helps only when it arrives before planning. Each surface owns one
kind of question:

| Surface | Owns |
|---|---|
| `CONCEPTS.md` | the shared vocabulary |
| Backlog Tasks | operator intent, acceptance criteria, and work status |
| Backlog documents and decisions | authored evidence, plans, lessons, and settled decisions |
| `openwiki/` | the current landed system |
| codebase-memory | structural code questions: architecture, dependencies, call paths, impact |

Derived surfaces answer quickly; source files and fresh Checks decide. When
they disagree, trust source and report the inconsistency to the owning tool or
Actor.

For a work item that arrives without resolved orientation:

1. Read `CONCEPTS.md` and use its vocabulary.
2. Where `backlog/config.yml` exists, run `backlog instructions overview`,
   then `backlog search "<request>" --plain`, and read the matches that bear
   on the request. Backlog records change only through the `backlog` CLI, and
   never during alignment.
3. Read the OpenWiki pages and the Backlog `solutions` and `research`
   documents the request touches. Without an `openwiki/`, read the authored
   documentation and source instead.
4. Ask codebase-memory the relational questions. Confirm the Repository is
   indexed (`list_projects`, `index_status`) and reindex after material
   uncommitted or branch changes; `detect_changes` analyzes a Change's
   impact, it does not test freshness. Verify what matters in source.
5. Invoke `grilling`; its Skill owns the narrow exceptions.
6. Invoke every other Skill whose trigger matches the work.

Agents coordinate directly through herdr whenever it helps; the
`agent-messaging` Skill owns the commands.

## Tasks and Changes

Backlog.md registers durable intent. Keep the owning Task aligned with the
operator's decisions, and mark it Done only when its acceptance criteria are
verified and its Change has landed.

A Change lands through GitHub Flow: branch, implement and verify coherent
units of work, pass an independent `code-review` when the Change is
non-trivial, commit only green work and push each green commit, open the pull
request, and pass the Repository's final GitHub Checks. The operator merges.

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

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links.

OpenWiki is a derived orientation surface. Verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
