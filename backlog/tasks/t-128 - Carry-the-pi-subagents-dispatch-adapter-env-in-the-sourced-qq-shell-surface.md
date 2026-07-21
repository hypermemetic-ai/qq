---
id: T-128
title: Carry the pi-subagents dispatch adapter env in the sourced qq shell surface
status: To Do
assignee: []
created_date: '2026-07-21 04:21'
labels: []
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-07-21: the accountable project-home session found PI_SUBAGENT_PI_BINARY and PI_SUBAGENT_EXTRA_AGENT_DIRS unset (and absent from ~/.bashrc), blocking all confined dispatch. Operator ruling (asked-and-answered alignment exchange, same session): make the env durable in the sourced qq shell surface (cockpit/shell/file-navigation.bash) instead of relying on per-session manual exports.

Scope: export both vars from cockpit/shell/file-navigation.bash, derived from QQ_HOME (primary main paths per README), scoped to shells born inside the checkout so pi sessions for other repositories keep the vanilla dispatcher; README Install prose updated to match.

Decision ledger:
- Durable-in-shell-surface placement, QQ_HOME derivation, cwd-at-source-time scoping, README prose update — operator ruling, asked-and-answered exchange 2026-07-21 ("Make it durable first").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Interactive shells born inside the qq checkout carry PI_SUBAGENT_PI_BINARY and PI_SUBAGENT_EXTRA_AGENT_DIRS pointing at primary-main paths; shells born outside do not
- [ ] #2 README Install section documents the by-construction env and the manual fallback for non-shell launch environments
- [ ] #3 Shell test suite green
<!-- AC:END -->
