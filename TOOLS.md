# Legacy tool dispositions

This is an inventory, not an import plan. Nothing here restores legacy QQ by
default. Kept items return only through deliberate, minimal extraction.

## Keep

### Small agent-facing tools

- `qq-continue` — send “continue” when an idle agent is stopped.
- `qq-split-fork` — fork a Pi session into another Herdr/tmux pane.
- `qq-pr-watch` — inspect or watch a GitHub pull request for disposition.
- `qq-session-scrub` — mark a sensitive session transcript for deletion on
  `/new`.
- `qq-dictation-private` — mark the current session's dictation private and
  local-only.
- `qq-backlog-guard` — block direct agent edits to Backlog.md-managed files.
- `operator_stage` — stage, but do not execute, an operator-only command.

### Larger capabilities

- Event Plane agent messaging (`qq-actor-messaging` for now) — keep the concept
  and implementation tentatively; rename and review it next. Agents should know
  how to communicate with each other through the Event Plane.
- `qq-observe` — keep, then identify and remove unnecessary coupling.
- `qq-telemetry` and `qq-telemetry-cookies` — keep.
- OpenWiki runtime, merge, daily finish, and schedule tooling — keep. QQ runs
  OpenWiki as its documentation mechanism.
- Communication doctrine and its `operator_ask` hook — keep for a short later
  review.
- Cockpit and Herdr convenience configuration — keep as operator configuration.

## Delete

- `qq-footer`.
- `qq-patch-apply`.
- Role personas and role prompt machinery.
- Elaborate lifecycle orchestration unless independently retained above.

- Shared-store concurrency machinery — keep the capability because concurrent
  writers are a known concrete need. The legacy `qq-store-txn`, `qq-backlog`,
  task identity, task-store, and Product implementation remains subject to
  review; preserve the idea rather than assuming its A/B design is correct.
- Session lineage — keep the small root-to-delegate session relationship so
  Observe can attribute delegated records to their parent session.

## Deferred clarification

- `qq-check-receipt` — verifies that a textual test receipt names the exact
  pushed commit and Git tree. Decide later whether that proof is still useful.
- Tab-role machinery — durable Herdr workspace/tab role labels used by the old
  role-bound Pi launcher and board classification. Review separately.
