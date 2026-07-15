---
id: doc-43
title: Design — The delegate status surface
type: specification
created_date: '2026-07-15 02:51'
updated_date: '2026-07-15 23:16'
tags:
  - design
  - delegation
---
# Design — The delegate status surface

Owning task: [TASK-42](</home/qqp/projects/qq/backlog/tasks/task-42 - Design-the-delegate-status-surface.md>)
Warm-start inputs: doc-41 (vendor research), doc-42 (engine/glass plan and its
2026-07-15 amendment withdrawing the observability pane).

Operator constraints this design is bound by (live UAT, 2026-07-14/15):
headless delegates stay hidden — no raw-tail panes, no pane-hosted codex
rendering; visibility is a designed status surface of stage-boundary
one-liners; and the delegation automation contract — envelope files,
single-notification wakes, sandbox enforcement — is non-negotiable relative
to visibility.

Operator decisions taken during this design round (2026-07-15, in-session
after a live demonstration and a four-candidate walkthrough):

1. herdr agents-sidebar reporting "is ok and should probably stay" — it is
   the ambient layer, not the primary surface.
2. The primary surface is a **status side pane in the orchestrator session**
   (chosen over board-tab docking, sidebar-only, and a dedicated tab), as a
   right split — the down-split shown in the demo was explicitly rejected.

All load-bearing claims were verified by live probes and a staged live
demonstration on 2026-07-15 against herdr (protocol 16) and Codex CLI
0.144.4; see Evidence.

Amended 2026-07-15 (round 2, herdr 0.7.4): the ambient tier, the popup
accessor, and the AC #4 posture disposition are re-settled in the Amendments
section at the end; sections not named there stand as written.

## The design in one paragraph

The dispatcher maintains one small per-repo **status file** — a
current-state table, one line per delegate — and atomically rewrites it at
each stage boundary it already owns (dispatched, working, envelope received,
envelope verified, review round N, PR open, blocked, terminal). The primary
surface renders that file in a persistent right side pane of the
orchestrator session running nothing but `watch`; the ambient layer reports
the same stages onto herdr's agents sidebar via `herdr pane report-agent`.
No owned renderer exists, nothing scrolls, no delegate output is ever
rendered, and no pane is created or destroyed per delegate. The `codex exec`
invocation gains exactly one flag (`--json`, captured to a per-delegate
events file as a passive artifact); envelope files, the process-exit
single-notification wake, and sandbox enforcement are untouched. The codex
app-server adapter is not adopted for hosting, steering, or event supply and
stays in doc-42's deferred lane with explicit revisit triggers.

## What it shows

One line per delegate in the batch, in a fixed-width current-state table:

```
DELEGATES                        updated 12:41
──────────────────────────────────────────────
T44 parser   ● working   round 2       12:37
T45 lexer    ✔ PR #93 open             12:29
T46 docs     ■ BLOCKED: schema split   12:39
T47 infra    ○ queued                      —
```

Columns: ticket id and short label; state glyph + stage one-liner; the
timestamp of the stage boundary that produced the line. The file carries a
header timestamp of its last rewrite; `watch`'s default header shows the
current time (which is why `-t/--no-title` must not be passed), so staleness
is visible by comparison without any self-updating machinery.

Stage vocabulary (the operator's requested one-liners):

| Stage | Table line | Sidebar custom_status | Reporter knows because |
|---|---|---|---|
| queued | `○ queued` | — (not yet reported) | ticket accepted, not dispatched |
| dispatched | `● dispatched` | `dispatched` | it just spawned the delegate |
| working | `● working [round/step]` | `working` | thread.started seen in the events artifact (read opportunistically; see Feeds) |
| envelope received | `● envelope received` | `envelope` | its completion wake fired |
| envelope verified | `● envelope verified` | `verified` | it verified claims against the tree |
| review round N | `● review round N` | `review N` | it is running that round |
| PR open | `✔ PR #N open` | `PR #N` | it opened the PR |
| blocked | `■ BLOCKED: <short>` | `decision` | the envelope recorded a stopped ticket |
| failed | `✖ FAILED: <short>` | `failed` (herdr state `blocked`) | the completion wake fired with no envelope, or verification refuted it |
| terminal | line removed (batch note kept in task) | released | disposition verified — including a failed ticket's redispatch or abandonment |

Sidebar strings are deliberately terse: the live demonstration showed the
sidebar truncates long values (`dispat…`, `needs…`). Full detail belongs to
the table; the sidebar carries state color and a short tag.

herdr state mapping (fixes the post-exit ambiguity): `working` only while
the delegate process is alive; `blocked` for any ticket needing attention —
stopped on a consequential decision, or failed and awaiting its disposition;
`idle` once the process has exited normally and the ticket is moving through
envelope/review/PR stages (the stage string carries the detail); released at
terminal disposition. The sidebar never claims a dead process is working.

## Where it lives

**Primary — the orchestrator status pane.** A persistent right split of the
dispatcher's pane (house geometry per task-23: right split, accountable pane
keeps roughly 70%), running:

```
watch -n 2 cat <status-file>
```

- Opened by the dispatcher **idempotently**, `--no-focus`: first attempted
  at the batch's first dispatch, and re-attempted at each later stage
  boundary until one open has succeeded (so a herdr outage at batch start
  delays the pane, never the batch). Once an open has succeeded, a later
  missing pane means the operator retired it, and the dispatcher never
  re-opens it mid-batch.
- Never closed, resized, or focused by the dispatcher; the operator retires
  it like any pane. This is one persistent fixture, not per-delegate
  lifecycle — consistent with the withdrawn-pane ruling, which rejected
  scrolling process output and per-delegate throwaway panes, not a calm
  state table.
- The pane is a dumb display: `watch` + `cat` of a file. No owned renderer,
  no TUI code, nothing to maintain.
- Works in both entry modes: the board-driven dispatcher opens it in the
  project home beside itself; a migrated accountable session running
  headless helpers opens the same pane in its Change work session. Because
  the primary surface no longer depends on any placeholder pane, **both
  modes are covered uniformly** (this resolves the single-Change-mode gap
  found in review).

**Ambient — herdr's agents sidebar.** In board-driven dispatch, each ticket
work session's root placeholder pane (already left there by
`herdr worktree create`) carries the delegate's presence via
`herdr pane report-agent`; the delegate renders in the agents sidebar
grouped under its work-session label, and a `blocked` state colors both the
agent entry and the workspace dot in the spaces list (screenshot-verified) —
attention is visible from anywhere in the cockpit. In migrated single-Change
mode there is no free pane (live-agent detection outranks external reports,
probe-verified), so sidebar reporting is skipped and the status pane alone
carries visibility. Sidebar reporting never creates a pane.

**Escalation.** On `blocked` or `failed`, the dispatcher additionally runs
`herdr notification show` under TASK-40's honesty rule: verify the result
and plainly report the fallback when notifications are disabled (as they are
in the current environment). The state always renders in the table; the
sidebar and workspace-dot escalation exist in board-driven mode only — in
migrated mode the accountable session is itself present in the work session
and reports the stopped ticket in its transcript.

## What feeds it

The dispatcher, synchronously, at stage boundaries it already occupies —
plus one passive artifact:

1. **Dispatch**: the delegate is spawned as today with two additions to the
   capture, not the contract:

   ```sh
   codex exec … --json -o <envelope-path> > <events-path> 2><stderr-path>
   ```

   `--json` and the two redirections are a **sanctioned amendment to the
   delegate-batch command shape** (the skill text changes accordingly at
   implementation). They alter what the parent captures, not what the
   delegate may do: sandbox flags, the envelope file, and
   process-exit-as-wake are byte-for-byte unchanged. Capturing stderr to a
   file is itself a lesson from the live demo, where a delegate died at
   spawn with stderr discarded and left nothing to diagnose.
2. **Stage boundaries**: at each boundary the dispatcher (a) atomically
   rewrites the status file (write temp file, rename into place) and
   (b) fires one `herdr pane report-agent … --seq N` for the sidebar, paired
   with `herdr pane report-metadata … --ttl-ms <bound>` so an orphaned claim
   expires on its own (`--ttl-ms` lives on report-metadata, not
   report-agent). Both are synchronous fire-and-forget calls; there is no
   watcher process, no tailing, and no polling loop anywhere in the design.
3. **The thread id** (steering handle) is read from `thread.started` in the
   events file **opportunistically at the dispatcher's next natural
   boundary**, not at dispatch time: the live demo showed the events file
   can be block-buffered and empty seconds after spawn. Until it appears,
   the table line stays `dispatched` and steering is simply not yet
   available. The dispatcher never waits or polls for it.
4. **Completion**: the background task's exit is the single wake, unchanged.
   On wake the dispatcher reconciles reality against the glass — envelope
   present and verified, or process dead without one (observed live in the
   demo: the glass said `dispatched` while the delegate was already dead;
   the wake is what corrects the surface, and TTL bounds the window if the
   dispatcher itself is gone).
5. **Claude-subagent delegates** (the supported fallback runtime): the same
   surface, fed identically — every stage is dispatcher-owned, so nothing
   about the table or sidebar changes. The runtime column reads `claude`;
   the steering handle is the subagent id via `SendMessage` instead of a
   Codex thread id; there is no JSONL events artifact, so the `working`
   transition keys off the harness's task-start acknowledgement instead of
   `thread.started`.

Steering stays the delegate-batch story: `codex exec resume <thread-id>`
(or `SendMessage` for Claude delegates) between turns. Mid-turn steering is
not restored — no current stage requires it.

**Status file location**: under the OS temporary directory, alongside the
work orders and envelopes the contract already keeps there, namespaced per
repository **and per orchestrator work session** (e.g.
`${TMPDIR:-/tmp}/qq-delegates/<repo-key>/<workspace-id>.status`). One
dispatcher owns one file — single-writer by construction, so concurrent
sibling sessions cannot overwrite each other's rows; each renders its own
file in its own pane, consistent with delegate-batch's per-worktree
namespacing rule. It is runtime glass, not a durable record; the Backlog
board and task notes remain the durable surface.

## How it degrades when a feed is absent

Visibility is best-effort glass and never gates the automation contract:

- **herdr server down or a report call fails**: dispatch proceeds; the
  status file is still written. An already-open `watch` pane keeps rendering
  — it does not depend on herdr's API. If the outage predates the pane's
  first successful open, the open re-attempts at later boundaries and the
  file remains directly readable meanwhile. The dispatcher logs the sidebar
  failure once.
- **Status-file write fails**: the sidebar layer still updates; stages
  remain in the dispatcher transcript and task notes.
- **Status pane closed** (operator retired it): the file is still written;
  the dispatcher re-opens the pane only at the next batch's first dispatch,
  never mid-batch against the operator's action.
- **Events file absent, empty, or unflushed**: the `working` transition is
  keyed to `thread.started`, so the line stays `dispatched` until the next
  dispatcher-owned boundary; every later stage lands normally. Also lost:
  the thread id (steering) and the usage artifact. The dispatcher records
  the gap during envelope verification.
- **Placeholder pane consumed or missing** in board-driven mode: skip
  sidebar reporting for that ticket, log once; the primary pane still covers
  it. Never create a pane to restore visibility.
- **Delegate dies silently**: the completion wake still fires on process
  exit; the dispatcher reconciles and the line becomes
  `✖ FAILED: died before envelope` (sidebar: `blocked`/`failed`). If the
  dispatcher itself died first, `--ttl-ms` expires the sidebar claim and the
  table's header timestamp goes visibly stale; recovery reconciles from the
  durable record (tickets, envelopes, worktrees), not from the glass.
- **Notifications disabled** (current environment): blocked and failed
  states still render in the table — and, in board-driven mode, in the
  sidebar and workspace dot; the honest-fallback rule applies to the
  notification attempt.

## The codex app-server decision (explicit, per AC #2)

**Not adopted — for any of the three candidate roles.**

- **Hosting**: delegates stay on `codex exec`. The exec shape carries the
  whole automation contract: OS-enforced sandbox, `-o` envelope file, and
  process exit as the single-notification wake. Re-hosting delegates as
  app-server threads would re-implement all three against a different
  lifecycle for no operator-visible gain.
- **Event supply**: `codex exec --json` already delivers the full structured
  event stream to the parent for free (probe-verified vocabulary:
  `thread.started`, `turn.started`, typed `item.*`, `turn.completed` with
  usage), and the surface needs only dispatcher-owned boundaries anyway. An
  app-server observes threads it hosts or loads; it cannot attach to an
  independent `codex exec` process (doc-41 Q2), so adopting it for events
  would force the hosting change too.
- **Steering**: `codex exec resume <thread-id>` covers between-turn steering
  with the thread id the surface records. Mid-turn `turn/steer` is the only
  unique capability foregone, and no settled workflow needs it.

**Stays deferred** (doc-42 decision 4 unchanged): the doc-41 adapter lane —
app-server hosting, `turn/steer`, and cross-harness adapter work. Revisit
when any of these becomes true:

1. a settled workflow needs mid-turn steering of a headless delegate;
2. delegates must outlive or detach from their dispatching session; or
3. Agent view and ACP leave research preview (the existing doc-42
   condition), making the adapter architecture worth building once.

## Automation-contract preservation (per AC #3)

- **Envelope files**: `-o <envelope-path>` unchanged; the envelope remains
  the delegate's final message in the OS temporary directory.
- **Single-notification wakes**: the background task's exit remains the one
  completion wake. Everything the surface adds is a synchronous call made
  at a boundary where the dispatcher is already awake; no new processes
  watch or poll the delegate. (`watch` in the status pane redraws a file for
  the operator's eyes; it observes nothing about the delegate and wakes no
  agent.)
- **Sandbox enforcement**: unchanged — same sandbox flags, same
  no-free-text-on-the-command-line rule. The only command-line delta is
  `--json` plus output redirections, which grant the delegate nothing.
  Reporting happens entirely dispatcher-side.

## Evidence (live probes and staged demonstration, 2026-07-15)

- **Codex event stream**: `codex exec --json --ephemeral -o …` on a trivial
  read-only task emitted `thread.started {thread_id}`, `turn.started`,
  typed `item.started/item.completed` (agent_message, command_execution
  with status and exit code), `turn.completed {usage}`; the `-o` file
  contained exactly the final message. Codex CLI 0.144.4.
- **herdr surface, API layer**: on an idle pane, `report-agent` with
  `--custom-status` appeared in `herdr agent list`; a `--seq 2` re-report
  updated it; `release-agent` removed it; on a pane with a live agent, live
  detection outranked the external report.
- **herdr surface, UI chrome** (staged demonstration, screenshots under
  `assets/doc-43/`): the reported delegate rendered natively in the agents
  sidebar grouped by work-session label
  ([dispatched](assets/doc-43/shot-1-dispatched.png),
  [review round 2](assets/doc-43/shot-2-review.png)); a `blocked` report
  turned both the agent entry and the workspace dot red
  ([blocked](assets/doc-43/shot-3-blocked.png)); release removed the entry
  while another session's live work kept rendering in the same shared glass
  ([released](assets/doc-43/shot-4-released.png)). Sidebar truncation of
  long one-liners is visible in shots 1 and 3.
- **Demonstrated failure modes**: the events file was empty seconds after
  spawn (buffering — basis of the opportunistic thread-id rule), and one
  demo delegate died silently at spawn with stderr discarded while the
  glass said `dispatched` (basis of the stderr-capture requirement and the
  wake-reconciliation rule).

## Follow-up (not part of TASK-42)

Wiring this into the delegate-batch skill — the status file writes, the
sidebar report/release calls, the idempotent pane-open, the stderr capture,
and the amended `codex exec` line — is a small bounded implementation
ticket, created on operator approval. This document is the design authority
for that ticket.

## Amendments

### 2026-07-15 — Round 2: herdr 0.7.4 (TASK-42 reopened)

herdr 0.7.4 was released the same afternoon this design settled (its release
and this document's final update carry the same timestamp), shipping three
primitives the original round could not consider: configurable sidebar row
layouts with custom `$name` metadata tokens on Space and Agent entries,
`herdr workspace report-metadata` / extended `herdr pane report-metadata`
CLI reporting with `--ttl-ms`/`--seq`/`--clear-token` semantics, and
session-modal popup panes for custom keybindings. The operator reopened
TASK-42 the same evening with one added question (the session-posture
disposition, AC #4). This amendment re-settles the affected sections against
0.7.4, verified by fresh live probes; everything not named here stands as
written.

**Ambient tier v2 — metadata tokens carry the stage text.** The stage
one-liner now renders through custom `$stage` token rows added to the
sidebar layouts in `cockpit/herdr/config.toml` (landed with this round;
config is now part of the surface, which round 1 did not require). At each
stage boundary the reporter fires
`herdr workspace report-metadata <work-session-id> --source qq-dispatch
--token stage="<one-liner>" --seq <epoch-seconds> --ttl-ms 86400000` for the Change work
session's Space row. This supersedes the sidebar `custom_status` string as
the stage-text channel because tokens fix round 1's two acknowledged gaps
and its display squeeze:

- **No pane dependency.** Workspace tokens attach to the workspace itself,
  so the "placeholder pane consumed or missing" degradation row disappears
  for stage text (it still applies to per-delegate presence, below).
- **Migrated single-Change mode is covered.** Live-agent detection outranks
  `report-agent` identity claims but does not touch metadata tokens
  (probe-verified on a live claude pane): the migrated accountable session
  reports the same `$stage` token onto its own pane's Agent row and its work
  session's Space row. Round 1's "sidebar reporting is skipped" ruling for
  migrated mode is withdrawn; the status pane is no longer the sole carrier.
- **Own row, less truncation.** The stage renders on its own configured row
  instead of inside the agent-name line, relieving the truncation observed
  in shots 1 and 3. One-liners stay terse: values are capped at 80
  characters and normalized by herdr.

`herdr pane report-agent` is retained exactly as designed, but scoped to
what tokens cannot do: per-delegate presence in the sidebar (one entry per
delegate under its work-session label, board-driven mode only) and semantic
state color — the `blocked` red agent entry and workspace dot
(screenshot-verified in round 1) remain the attention escalation. Tokens
carry values only, never styling, so the color channel stays on
`report-agent`. The boundary call pattern is unchanged in shape: the same
paired fire-and-forget calls, with the workspace token call added.

**Token write contract.** Each work session's `$stage` token has exactly
one writer: the session that owns its batch — the dispatcher in
board-driven mode, the migrated accountable session for its own Change.
When one work session hosts several live delegates (migrated-mode
helpers), the single token carries a batch-rollup one-liner in which a
`blocked` or `failed` state outranks every other stage; a later routine
update never overwrites a standing attention state. At the batch's
terminal disposition the owner removes the workspace and pane tokens with
`--clear-token stage`; `--ttl-ms` is the backstop for an owner that died,
never the normal removal path. `--seq` values derive from a monotonic
per-call value — epoch seconds at call time — never a restarting counter:
herdr ignores lower sequences from a `--source` for the pane or workspace
lifetime, so a redispatched or recovered owner reusing `qq-dispatch` with
a reset counter would be silently ignored.

**Primary surface unchanged; popup accessor added.** The operator-chosen
status pane (right split, `watch -n 2 cat`, idempotent open, ~70% width
retained by the accountable pane) stands as the primary surface. 0.7.4
popups add an on-demand accessor, not a replacement: a `type = "popup"`
keybinding rendering the same status file(s) over the tiled layout, for the
moments the pane was retired or a persistent split is unwanted. It ships
with the wiring ticket, which owns the status-file path scheme the binding
reads.

**AC #2 re-verified — the app-server disposition is unchanged by 0.7.4.**
None of the three revisit triggers fired, and the tokens make the
event-supply role weaker still: stage text needs no event stream at all,
only the dispatcher-owned boundaries. Not adopted for hosting, steering, or
event supply; the deferred lane and its triggers stand.

**AC #3 — contract untouched.** Round 2 adds synchronous fire-and-forget
CLI calls at boundaries where the reporter is already awake, bounded by
`--ttl-ms` self-expiry. No watcher, no polling, no delegate command-line
delta beyond round 1's sanctioned `--json` and redirections. Envelope
files, the single-notification wake, and sandbox enforcement are
byte-for-byte unchanged.

**AC #4 — session-posture disposition: keep both postures; collapse is
trigger-gated.** The reopened task asks whether dispatch-only (every Change
a batch of one, the accountable session a permanent fixture of the project
home) should retire deliver-change step-1 migration. Disposition: **keep
both postures now.** Reasons:

- The task's own enabling condition for a near-free collapse — mid-turn
  steering of headless delegates — is precisely what this design declined
  to adopt (`turn/steer` sits in the deferred app-server lane; no settled
  workflow needs it). Collapsing now would route every small operator
  iteration through a delegation boundary and add work-order ceremony with
  no floor defined for trivial edits.
- 0.7.4 removed the visibility argument for collapsing: with workspace and
  pane tokens, migrated mode now has first-class ambient status (the round-1
  gap that made it second-class is closed above). The alt+o home gap itself
  remains — `qq-herdr-snap` resolves within the focused space and exits in
  an agentless project home — but its cost falls: the home's Space panel
  now shows the migrated Change's `$stage` row, so state is visible from
  the home even though one-key snap-to-agent is not available there
  (`prefix+alt+N` and `prefix+0` still reach the migrated pane).
- The accepted cost is unchanged step-12 behavior: the accountable pane
  stays in the retired work session until the operator retires it.

The collapse trigger is deliberately the same as the app-server lane's:
when a settled workflow needs mid-turn steering (trigger 1) or delegates
must outlive their dispatching session (trigger 2), the adapter Change that
follows should also re-decide the posture, with dispatch-only as the
presumptive outcome and the deliver-change step-1/step-12 redesign in its
scope.

**Round 2 evidence (live probes, 2026-07-15, herdr 0.7.4, protocol 16).**
`herdr workspace report-metadata` on a scratch workspace stored
`stage="review round 2"` with `--ttl-ms`, and `--clear-token` degraded the
workspace's token map to null; `herdr pane report-metadata` stored a batch
rollup token on a live claude pane without disturbing agent detection
(tokens surface as `.tokens` in `pane get`, workspace tokens as
`.metadata`/token map in `workspace get`); the amended sidebar config
passes `herdr config check` on 0.7.4 (differential-tested against a
deliberately broken copy). Documented caps fit the design: 80-character
values, TTL ceiling 24 h, at most 32 distinct `--source` values per pane or
workspace lifetime (a single `qq-dispatch` source stays far under it),
`--seq` staleness protection per source. Operational note: after a Homebrew
upgrade replaces the running server's deleted binary path, live handoff
needs `herdr server live-handoff --import-exe <new-binary>`.

**Wiring-ticket deltas.** The follow-up implementation ticket gains: the
workspace `$stage` token calls at each boundary (with `--seq` and
`--ttl-ms`), the pane `$stage` token in migrated mode, the popup accessor
keybinding over the status files, and unchanged round-1 scope (status-file
writes, `report-agent`/`release-agent` presence and color calls, idempotent
pane open, stderr capture, amended `codex exec` line). The sidebar config
rows land with TASK-42 round 2 itself and are inert until reported.
