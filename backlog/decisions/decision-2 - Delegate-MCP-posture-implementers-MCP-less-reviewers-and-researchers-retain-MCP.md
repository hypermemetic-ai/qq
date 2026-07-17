---
id: decision-2
title: >-
  Delegate MCP posture: implementers dispatch MCP-less; reviewers and
  researchers retain MCP
date: '2026-07-16 23:45'
status: accepted
---
## Context

doc-45 identified per-spawn MCP server startup (a network npx fetch) as the
dominant contributor to the codex exec startup wedge. T-63 dispositioned
implementer delegates: dispatch MCP-less by default (`mcp_servers={}`), with
a deliberate, work-order-stated omission when a ticket genuinely needs a
server. T-75 initially carried that override to reviewers as if the T-63
approval covered them — the silent transfer the operator flagged as an
alignment failure, owned by T-76.

## Decision

Implementer dispatches (delegate-batch) stay MCP-less by default. Reviewer
dispatches (code-review) and researcher dispatches (research) deliberately
retain their MCP servers: the knowledge surfaces serve review quality,
Context7 is core to the research method, and the timeout wrapper bounds the
residual spawn risk. This decision covers exactly these three dispatch
surfaces.

## Consequences

- The tripwire in tests/test-qq-herdr-home.sh fails the suite if any
  `mcp_servers` spelling reappears in the reviewer or researcher commands.
- Operator environment: context7 stays version-pinned in
  ~/.codex/config.toml, never `@latest`.
- This record is the worked example cited by the no-transfer rule
  (grilling, CONCEPTS.md): its reach is these three surfaces; any future
  dispatch surface needs its own disposition.
