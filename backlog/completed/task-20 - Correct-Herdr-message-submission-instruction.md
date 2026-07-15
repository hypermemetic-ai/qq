---
id: TASK-20
title: Correct Herdr message submission instruction
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 03:29'
updated_date: '2026-07-13 03:47'
labels: []
dependencies: []
modified_files:
  - skills/agent-messaging/SKILL.md
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The agent-messaging Skill tells agents to follow herdr agent send with an incomplete herdr pane run invocation. Correct the instruction so a typed prompt is submitted as a Codex turn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Skill directs submitted prompts through Herdr's atomic text-plus-Enter command and distinguishes that path from unsubmitted agent send.
- [x] #2 Every inter-agent message identifies its sender by stable terminal ID, and replies are resolved and routed back through Herdr rather than left only in the receiver's transcript.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace the ineffective two-request submission sequence with atomic pane-run messaging; add the minimal terminal-ID sender envelope and reply-routing rule; validate the Skill; exercise active-turn submission and reply routing; obtain fresh-context review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Changed the submission step from the invalid/incomplete pane-run invocation to herdr pane send-keys <pane-id> Enter. Herdr 0.7.3 help confirms that syntax; skill-creator quick_validate and git diff --check pass.

Post-merge live Check invalidated the two-request correction: during an active Codex turn, agent send followed by pane send-keys Enter left the prompt pending until the operator pressed Enter. A disposable Codex reproducer showed the same failure, while pane run submitted the pending text atomically and Codex processed it at the next tool boundary. Reopening for the causal correction.

Forward test: two disposable Codex panes were assigned distinct terminal IDs. Only the receiver loaded the revised Skill. It verified the source with herdr agent get, read its own current terminal ID, and atomically routed AGENT from=<receiver-terminal>: ROUTED-REPLY into the source pane. The source transcript contained the submitted reply. The disposable workspace was then closed.

Fresh-context review of the exact working-tree delta reported no material findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the ineffective split send/Enter procedure with Herdr's atomic pane-run submission and added a minimal terminal-ID envelope with explicit reply routing. Active-turn and two-agent forward Checks, Skill validation, diff checks, and fresh-context review pass.
<!-- SECTION:FINAL_SUMMARY:END -->
