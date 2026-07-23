---
id: T-148
title: >-
  Mount qq's pi extension set: extensions/index.ts + global symlink, retire
  settings.json extension paths
status: To Do
assignee: []
created_date: '2026-07-23 15:31'
labels: []
dependencies: []
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator ruling (asked-and-answered exchange, accountable project-home session 2026-07-23): pi is qq scope — qq runs on pi, so a pi change is a methodology change; qq OWNS the pi surface (config, extensions, agent integration). Herdr is shared multi-harness infrastructure (operator uses codex one-offs in it); qq owns only its herdr TENANCY (cockpit/, bin/qq-herdr-*, the workspace), not herdr itself. Consequence: documented pi activation steps are agent-performed, never delegated to the operator.

Origin: the qq-operator-stage activation edit (settings.json extensions array) was first handed back to the operator as "operator-owned state"; the operator corrected the framing and then asked for the mount, not a mirror: the settings.json extensions array is mirrored state (hand-reconciled per machine); the extension set should be referenced such that a change inside qq is live by construction.

Design (approved in the same exchange, verified against pi's loader source dist/core/extensions/loader.js — symlinked dirs in the global extensions dir are auto-discovered via entry.isSymbolicLink()): (1) extensions/index.ts in-repo imports and registers every qq extension (qq-pr-watch, qq-continue, qq-split-fork, qq-operator-stage, and cockpit/pi/qq-backlog-guard via relative import); adding/removing an extension becomes a repo-only change (file + one import line), live next restart and hot-/reload-able. (2) One machine symlink, once: ~/.pi/agent/extensions/qq -> /home/qqp/projects/qq/extensions (global auto-discovery loads qq/index.ts in every pi session — desired: qq is the operator's harness across Repositories). (3) settings.json: REMOVE the five absolute extension paths (cockpit/pi/qq-backlog-guard.ts, extensions/qq-pr-watch.ts, extensions/qq-continue.ts, extensions/qq-split-fork.ts, extensions/qq-operator-stage.ts) — the loader dedupes lexically (path.resolve, no realpath), so settings paths plus the symlink would double-load and double-register tools; all other settings keys untouched. (4) A repo test loads extensions/index.ts in the node harness and asserts every extensions/*.ts sibling registers — mount completeness by construction (CI fails on a file added without its import line). (5) README install section shrinks to the one symlink; the doctrine paragraph (pi is qq scope; herdr tenancy boundary; activation steps agent-performed) lands in AGENTS.md or CONCEPTS.md within the prose-ratchet budget (net-zero or an explicit approved raise recorded).

Decision ledger: pi-is-qq-scope ruling and the herdr tenancy boundary — operator ruling, asked-and-answered exchange 2026-07-23; mount-over-mirror direction (link, no sync command) — operator answer in the same exchange ("Can't we use some kind of link"); the index.ts + symlink + settings-removal + completeness-test design — operator approval in the same exchange ("yes, but mint it and have a fresh session deliver it"); delivery by a fresh session (new tab or /new) — operator instruction, same exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 extensions/index.ts imports and registers all five qq extensions; a repo test asserts every extensions/*.ts sibling registers (mount completeness), native suite green
- [ ] #2 ~/.pi/agent/extensions/qq symlink created; verified that pi auto-discovers and loads the set through the symlink exactly once (no double registration with settings paths removed)
- [ ] #3 settings.json extension paths removed (all other keys preserved, backup kept); README install section now documents the symlink instead of the absolute paths
- [ ] #4 Doctrine paragraph (pi is qq scope; herdr tenancy boundary; documented pi activation steps are agent-performed) landed in AGENTS.md or CONCEPTS.md with the prose ratchet green (net-zero or explicit approved raise recorded)
<!-- AC:END -->
<!-- SECTION:DESCRIPTION:END -->
