---
id: T-128
title: >-
  Set the pi-subagents dispatch adapter env by construction via a project-local
  pi extension
status: Done
assignee: []
created_date: '2026-07-21 04:21'
updated_date: '2026-07-21 07:56'
labels: []
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-07-21: the accountable project-home session found PI_SUBAGENT_PI_BINARY and PI_SUBAGENT_EXTRA_AGENT_DIRS unset (and absent from ~/.bashrc), blocking all confined dispatch. Operator ruling (asked-and-answered alignment exchange, same session): make the env durable instead of relying on per-session manual exports.

Mechanism (pivoted 2026-07-21, see ledger): the project-local pi extension .pi/extensions/qq-subagent-env.ts sets both variables in-process for any pi session in this repository (and its worktrees), resolved from the checkout via the extension file's own location. pi-subagents reads process.env at dispatch time, so in-process coverage is exact; sessions in other projects never load the extension and keep the vanilla dispatcher. Explicitly-set variables always win. The earlier shell-export design (cockpit/shell/file-navigation.bash) was reverted on this branch: its only consumer is pi-subagents in-process, and it depended on the operator's launch path sourcing the shell surface — the 2026-07-21 relaunch demonstrated that dependence is not guaranteed.

Scope: add .pi/extensions/qq-subagent-env.ts; README Install prose updated to match; structural + functional test coverage (tests/test-qq-subagent-env.sh); pivot tripwire keeping the shell surface free of PI_SUBAGENT_* exports; the adapter pre-creates the pi-subagents session root ($TMPDIR/pi-subagent-sessions, mode 700) so the Landstrip policy always grants it, and README documents defaultSessionDir in the dispatcher-side pi-subagents config (first live dispatch 2026-07-21 showed pi-subagents otherwise nests child sessions in the parent session tree, which the policy deliberately does not grant). A user-level bootstrap copy at ~/.pi/agent/extensions/qq-subagent-env.ts covers confined dispatch until this Change merges; the owner deletes it at delivery.

Decision ledger:
- Durable placement, QQ_HOME/checkout derivation, other-projects-keep-vanilla scoping, README prose update — operator ruling, asked-and-answered exchange 2026-07-21 ("Make it durable first").
- Session-root contract from confined review (two rounds): dispatcher-side config defaultSessionDir is REQUIRED (pi-subagents silently falls back to the ungranted parent session tree without it); the adapter enforces it fail-closed (direct pi-subagent-* child of launcher temp, no symlink, operator-owned, mode 700); the extension pre-creates/tightens the root at session start so pi-subagents' umask-based mkdir cannot deadlock a fresh install — confined reviewer findings 2026-07-21, verified against pi-subagents source.
- Mechanism pivot from shell exports to a project-local in-process pi extension; user-level bootstrap copy until merge, deleted at delivery — operator direction 2026-07-21 ("either give me specific commands or figure this out on your own"), after the relaunch showed the shell surface is not on the operator's pi launch path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pi sessions in the qq checkout (and its worktrees) carry PI_SUBAGENT_PI_BINARY and PI_SUBAGENT_EXTRA_AGENT_DIRS in-process, resolved from the checkout; explicit operator-set values win; sessions in other projects keep the vanilla dispatcher
- [ ] #2 README Install section documents the extension as the by-construction env mechanism, including project-trust and /reload notes
- [ ] #3 Shell test suite green, including the extension's structural and functional coverage
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered via PR #183 (2026-07-21). Mechanism pivoted on-branch to a project-local pi extension (.pi/extensions/qq-subagent-env.ts) that sets the adapter env in-process — the shell-export design depended on the operator's launch path sourcing the shell surface, which the 2026-07-21 relaunch disproved. The extension also establishes the pi-subagents session root (mode 700) at session start; bin/qq-dispatch enforces the defaultSessionDir contract fail-closed at dispatch; skills point at README Install. Three confined review rounds (10 findings total, incl. the .pi/ git-exclude that hid the extension from HEAD and the fresh-install session-root deadlock); all fixed. Machine-side steps completed: dispatcher config defaultSessionDir set, /tmp/pi-subagent-sessions (700) created, bootstrap extension copy deleted, .git/info/exclude .pi/ line removed. Suite green natively at merge.
<!-- SECTION:FINAL_SUMMARY:END -->
