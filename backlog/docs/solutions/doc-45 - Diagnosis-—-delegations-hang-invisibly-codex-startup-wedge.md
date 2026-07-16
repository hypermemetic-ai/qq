---
id: doc-45
title: Diagnosis — delegations hang invisibly (codex startup wedge)
type: other
created_date: '2026-07-16 17:08'
updated_date: '2026-07-16 17:22'
---
# Diagnosis — delegations sometimes hang invisibly

Owning Task: TASK-58. Diagnostician: fresh read-only claude delegate,
2026-07-16. All observations read-only; evidence paths verified.

## Mode A — codex exec pre-session startup wedge (CONFIRMED; the reported hang)

`codex exec` occasionally parks forever during startup — before any session
rollout, any stdout/stderr byte, any thread.started. The process stays alive
indefinitely; since process exit is the single completion wake, no wake ever
fires and nothing in the contract can notice. Pre-session startup work is
network-touching with no client-side timeout (auth/token refresh, three MCP
servers spawned per delegate including `npx -y @upstash/context7-mcp@latest`,
model discovery); exact sub-cause unresolved.

Evidence: deciq dispatcher transcript (b9a61ce6, 2026-07-15 16:10Z) found
three codex exec groups at etime 11:42/11:03/10:21 h still "reviewing" and
pkilled them ("the three independent reviews had silently wedged overnight");
zero-byte background outputs at the wedge start times; NO session rollout for
any wedged run while interleaved dispatches minutes apart created rollouts and
finished normally (per-invocation lottery); two more instances the same
evening; and qq's own TASK-42 demo delegate — recorded in doc-43's Evidence as
"died silently at spawn" — had not died and was alive 11 h later. ≥6 instances
in the ~28 h before the operator's idea; zero since `timeout 3600` wrappers
were used in relaunches.

## Mode B — glass stuck at `dispatched` for a delegate's whole life (CONFIRMED, observed on today's live batch)

The dispatcher reads thread.started only at that delegate's own completion
wake, so `working` never renders and the steering handle publishes only after
exit. Events-file buffering is REFUTED as the driver (content flushes within
seconds; task-54's thread.started landed ~4 s after spawn while its row stayed
`dispatched` through several rewrites). A Mode-A wedge is therefore
indistinguishable from a healthy slow delegate.

## Mode C — the report predates the surface (CONFIRMED as the report's era)

TASK-45 wired the surface 23:18 Jul 15; the idea was filed 23:24, six minutes
later, hours after the operator learned of the overnight wedges. Residual gap
after TASK-45 = Modes A+B.

## Mode D — sandbox blocks shared git metadata in linked worktrees (CONFIRMED, fail-fast)

workspace-write delegates in linked worktrees cannot write the main
checkout's .git/worktrees/<branch>/ metadata, so git fetch/rebase fail
(observed: t49 envelope blocked on "Read-only file system … Cannot
autostash"). Early-stop with envelope, not a hang — recurring friction.

Refuted: approval blocking (approval_policy=never, zero approval events);
lost wakes/dead dispatchers/orphans (every envelope maps to a delivered PR;
the wedges are children that never exit, not wakes that got lost); stdin wait
(harness appends </dev/null).

## Best match to the operator's report

Mode A experienced through Mode C/B invisibility. "Sometimes" =
per-invocation lottery; "invisibly" = no exit → no wake → no glass.

## Bounded fix proposals (operator disposition; each is the smallest change)

1. Mode A containment: `timeout -k 10 <bound>` wrapping the dispatch command
   in skills/delegate-batch/SKILL.md, with exit 124 reconciled to
   `FAILED: startup/turn wedge (timeout)`. The pattern is demonstrated by the
   2026-07-15 11:11 relaunches (all completed under a timeout wrapper), but
   whether timeout/-k reliably kills the full three-process group of a truly
   wedged run is untested — settle open question 3 below before adopting.
2. Mode A probability: disable MCP servers for delegates in the dispatch
   config; pin context7 instead of @latest in ~/.codex/config.toml.
3. Mode B: at every dispatcher-owned boundary, sweep ALL non-terminal
   delegates' events files for thread.started; publish working + steering
   then; empty events N minutes after dispatch ⇒ `BLOCKED: no thread after
   Nm` + notify (this is what makes Mode A visible). Doc-43 amendment.
   (Behaviorally adopted by the dispatcher for the remainder of this batch;
   the skill-text change awaits operator approval.)
4. Mode D: keep fetch/rebase dispatcher-side; explicit "do not fetch; base is
   provided" constraint in the work-order template.
5. Align sidebar --ttl-ms (currently 24 h) to ~2× the dispatch timeout.

Open questions needing write-permitted experiments: wedge sub-cause (strace
under concurrent spawns; suspects: ~/.codex auth-lock contention, MCP npx
startup), whether timeout kills the full 3-process group or needs setsid,
whether newer codex has a built-in startup timeout.
