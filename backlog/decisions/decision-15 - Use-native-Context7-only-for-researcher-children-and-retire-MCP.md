---
id: decision-15
title: Use native Context7 only for researcher children and retire MCP
date: '2026-07-25 01:25'
status: accepted
---
## Context

Decision-2 preserved MCP for reviewers and researchers when qq still dispatched through older Codex CLI surfaces. That substrate is no longer current: T-106 retired Claude Code and Codex CLI support; canonical Pi reviewer/researcher manifests select no MCP tools; pi-subagents only loads direct MCP tools when an agent explicitly requests them; and no current qq script reads the root `.mcp.json`. The retained `pilot/mcp-driver.sh` is a self-contained historical codebase-index pilot and does not read project MCP configuration. Machine Codex configuration contains only the OpenAI documentation server, while Codex CLI itself is unsupported. Backlog references to `.mcp.json` are historical evidence or superseded plans, not live consumers.

The remaining root file launches `npx -y @upstash/context7-mcp@latest`, an unpinned fetched executable that current canonical children do not receive. T-154.3/doc-94 proved that official `@upstash/context7-pi@0.1.1` registers only native `resolve-library-id` and `query-docs`, needs no key for public documentation, and can be scoped through pi-subagents' `subagentOnlyExtensions`. The operator chose “Canary then adopt” for researchers only and approved the sequential lifecycle in doc-98.

Decision-8 still declares delegated network egress open beneath Landstrip; this integration is not a confidentiality boundary. Decision-10 still makes persisted Pi session JSONL the sole agent-content observation seam.

## Decision

Supersede decision-2 only for current qq dispatch surfaces:

- canonical researcher children receive exactly native `resolve-library-id` and `query-docs` from exact `@upstash/context7-pi@0.1.1` through `subagentOnlyExtensions`;
- accountable parents, reviewers, implementers, and observers receive neither Context7 tool by default;
- reviewers needing external-library research delegate an explicit researcher work order rather than gaining Context7 themselves;
- Context7 uses no MCP server, API key, global Pi package registration, copied vendor source, copied vendor Skill, or `/c7-docs` prompt; `qq-dispatch` refuses researcher launch when it inherits a nonempty `CONTEXT7_API_KEY` rather than clearing or using it;
- the Research Skill forbids credentials, personal/private data, and proprietary code in Context7 queries and continues to treat returned content as untrusted evidence;
- remove the unowned root `.mcp.json` after the isolated actual-qq canary proves exact integrity, peer resolution, child-only scope, public no-key resolve/query, resume, confinement, cleanup, and observation.

Production selects the home-relative extension path `~/.pi/agent/npm/node_modules/@upstash/context7-pi/extensions/context7.ts`. The operator-owned Pi npm prefix records `@upstash/context7-pi` as the exact dependency `0.1.1`; it is not added to Pi's package settings.

## Consequences

- Research gets the current documentation tools its method already requires without MCP startup/fetch drift or reviewer/parent tool expansion.
- The Context7 service receives researcher-authored public-library queries over the already-open delegate network. The privacy rule reduces disclosure mistakes but makes no network containment claim.
- The vendor package's prompt and Skill assets remain undiscovered because qq passes only the extension file to child Pi.
- Package upgrades require a new exact integrity/delta review and the same scope/leak/real-provider gates; no floating range or alias is authorized.
- Rollback removes the researcher `subagentOnlyExtensions`/tool entries and the exact npm dependency. It does not restore MCP automatically; `.mcp.json` returns only by a new explicit operator choice.
- Decision-2 remains historical authority for the old surfaces it described; it no longer governs current canonical qq children.
