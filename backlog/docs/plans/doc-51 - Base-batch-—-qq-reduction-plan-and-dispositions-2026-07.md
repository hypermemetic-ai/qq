---
id: doc-51
title: Base batch — qq reduction plan and dispositions (2026-07)
type: specification
created_date: '2026-07-17 17:17'
updated_date: '2026-07-17 17:17'
tags:
  - plan
  - base-batch
  - complexity
---
# Base batch — qq reduction plan and dispositions (2026-07)

Relocated into the Repository 2026-07-17 from the operator's loose planning
doc, which it supersedes entirely; the loose copies are deleted. Anchored at
`main` after PR #128. Re-verify anchors before acting. The work items below
are minted as `base-batch`-labeled Tasks on the board; this doc carries the
rationale the Tasks do not restate.

**Thesis.** qq's residual weight is not neglect — it is precision maximalism:
every incident became a rule, every rule became prose or a parser. The fixes
below are qq's own doctrine applied to the places it has not reached: *mount,
don't mirror* / *engine, not glass* / *vendor-native access control* (doc-40,
doc-41, doc-42, doc-49, T-38). The target metric is not lines: track
**cognitive size** (mandatory text read per work item) and **state size**
(independent mutable lifecycle state) ahead of physical size.

**Authority rule.** Every invariant has exactly one correctness owner —
GitHub ruleset owns merge, Git owns isolation, Backlog owns Task state, the
runtime owns subprocess lifecycle, Herdr presents but never gates. Fix
failures at the owner; a local layer may add fast feedback, never a second
implementation of the invariant.

**Horizon.** After the base batch lands, the harness migrates to pi (single
phased session, cold review, no MCP/subagents) — operator direction,
2026-07-17. Investment rule: effort goes to what survives the runtime swap
(GitHub ruleset, CI gates, ratchets, `bin/` engines, the review contract);
skill prose gets the interim minimum.

## Dispositions, 2026-07-17

Settled by operator alignment exchanges this date unless cited otherwise.
Each future Change's ledger cites the specific disposition; open items say so.

- **Review contract and measurement design** — settled and captured as
  doc-50 (smallest resulting system; pre-authorized in-boundary
  simplification; fence-or-shrink by boundary citation; per-fix-commit
  parallel counters with one mechanical "same fix, smaller" regeneration;
  blocking only at shape ratchets; gauges separate from gates). Cited, not
  restated.
- **Decision ledger stays universal.** Fully-cited alignment briefs still
  block on operator approval — what they await is approval, not an answer;
  the brief exists for operator understanding, not decision transfer.
- **Review cadence** — deferred: revisit only after the doc-50 contract
  changes land and the fix-net gauge has data.
- **Prose budget** — one total only-down word budget over the mandatory-read
  set (`AGENTS.md`, `CONCEPTS.md`, `REVIEW.md`, `skills/*/SKILL.md`,
  doc-48), snapshotted at the current count, enforced in qq CI. It is the
  compiled form of the "a new permanent protocol retires at least as much
  protocol as it adds" fitness check: new mandatory prose finds its offset.
  Raising the budget is an operator-approved commit, never an agent move.
  Grep tripwires snapshot at current counts and lock downward: `codex exec`
  occurrences in `skills/`, runtime-specific flags in skill prose,
  shell-parser idioms in policy code.
- **Reaper (`qq-reap`)** — two scans: backlog docs referencing repo paths
  that no longer exist, and merged-but-undeleted branches plus leftover
  worktrees. Strictly two-step: a run only nominates, with exact commands; a
  second explicit run applies after operator veto. Stale docs are **deleted**
  (operator reversal of the earlier tag-only disposition, 2026-07-17; git
  history retains everything). Weekly, with heartbeat visibility: every run
  emits a dated report even when empty, so a missing report — not silence —
  is the failure signal. Expiry-date conventions for debt notes were
  considered and dropped: two existing notes do not justify a convention.
- **AGENTS.md managed block** — accepted as-is until the pi migration. No
  vendor toggle exists (config surface verified 2026-07-17: `auto_index`,
  `auto_index_limit`, `auto_watch`, `ui-lang`), and stripping buys a
  reconciler against `install`/`update` replanting. The pi migration must
  rewrite the block anyway (pi has no MCP; the tool's CLI mode is the
  pi-era access path), so the decision lands there. Upstream install flag
  remains the clean fix if wanted sooner.
- **Ceremony calibration (old plan item 7)** — dissolved; every sub-decision
  above is settled. No Task.
- **Hybrid Task-truth convention (old plan item 6)** — **open.** Its Task
  routes through a dedicated alignment brief before any enactment.

## Work items

### Baseline capability probes (before deleting anything)

Agent credentials cannot merge or push main (probe); required CI green-gates
main; structured edits to managed Backlog markdown get local feedback;
parallel writers get separate worktrees; PR handoff always yields a usable
URL; delivery completes with Herdr absent. Capture external contracts only —
no new internal-state tests.

### Ratchet baselines (also before deleting anything)

`ratchet.sh` + budgets snapshotted at today's counts per the prose-budget
disposition above, wired into qq CI, so every later item locks in
mechanically as it lands. Ratchets set after cleanup protect nothing —
budgets snapshot the mess first.

### Replace `qq-claude-guard` with vendor-native permissions

**Now:** 933 lines of hand-rolled bash-lexer approximation (heredocs,
substitutions, fd prefixes, per-wrapper option tables) + 513-line test —
~30% of operational code — defending idioms outside its own declared threat
model. The test suite is the fossil record of the ratchet; this is doc-39's
sustained-same-class-findings pattern happening to our own tool.

**Change:** merge mandate → Claude Code native `permissions.deny` rules
(`Bash(gh pr merge*)` + variants; native matching is deny-first, splits
compound commands, strips common wrappers — the vendor maintains the lexing
we hand-rolled). Same guarantee class as today (best-effort drift-net); the
GitHub ruleset + `qqp-bot` identity remains the boundary (T-36/T-37).
Backlog mandate → native `Edit(backlog/**)`-style denies or a ~80-line
path-only hook; no shell parsing survives in any form.

**Verify before landing:** (a) native Edit denies also cover recognized file
commands in Bash — confirm the hybrid convention's task-record `mv` is NOT
caught (moot if the convention retires first); (b) probe agent-credential
merge rejection after removal. **Target:** 933→0–80; test 513→~80–120.

### Extract the engines; adopt Codex profiles

**Now:** skills encode deterministic protocols in prose a stochastic
interpreter re-derives per work item; the codex dispatch block is
triplicated across three skills; T-75 records the drift cost.

**Change — new engines in `bin/`, ridden by the skills:**

| engine | absorbs |
|---|---|
| `qq-dispatch <role>` | the 3× codex exec blocks: `timeout -k 10` containment + `codex exec --profile qq-<role>` + fixed prompt pointer. Roles: implementer (workspace-write, skills off, MCP off), reviewer/researcher (read-only, MCP on) |
| Codex profile files | sandbox/skills/mcp flags, vendor-native via `--profile`; symlinked from the checkout (mount, don't mirror). Verify the current Codex version honors `skills.*` / `mcp_servers` in profiles |
| `qq-status <event>` | the status-surface protocol: file derivation, atomic write, seq state, herdr calls. Degradation lives here, not in prose: herdr absent → no-op with note, continue |
| `qq-pr-watch <pr>` | the step-9 inline until-loop: poll 30–60s, exit on MERGED/CLOSED, one notification |
| `qq-change land <pr>` | verify merged + ancestry, ff-only sync of the sole main checkout, preconditions as code. Idempotent |
| `qq-change retire <ws>` | the retirement rails, refuse-don't-force, `branch -d` never `-D`. Idempotent |

**Interface contract:** one verb per invariant-preserving transition; fixed
exit vocabulary — 0 done, 2 rail refusal (report printed state and stop), 1
error; JSON to stdout; `--dry-run`/`inspect` mirror; refusal messages carry
the relocated prose so guidance is paid on the failure path; **no new state
store** — engines re-read git/GitHub/herdr each run and hold nothing. A
stateless engine that re-derives cannot drift; a conductor that remembers is
the phase machine doc-12 forbids.

**Rejected alternatives:** an MCP server wrapping the protocol (implementers
are deliberately MCP-less per doc-45; CLI-on-PATH is the already-mounted
cross-runtime interface). Temporal/DBOS/Dagger/n8n-class engines (daemon +
state store + conductor; doc-12's merge-queue rule: escalation if pain
appears, not a component to anticipate).

### Slim the protocol skills to judgment

Skills call engines with unconditional prose; degradation is the engines'
job. Cockpit never blocks delivery (best-effort attach-and-continue). Drop
browser-persistence verification; durable artifact = PR URL + notification.
Keep the disposition watch but make it non-load-bearing: it triggers
idempotent `qq-change land`, so a dead session loses nothing. Steps 10–12
collapse to ~8 lines of engine calls. **Target:** deliver-change 196→~100;
delegate-batch 243→~120; code-review 147→~110; research 80→~60.
Conformance/wording tests dissolve into contract tests of engine behavior.

### Encode the doc-50 contract

REVIEW.md and the skills adopt: findings state failures with the
fence-or-shrink boundary citation; smallest-resulting-system language;
envelope carries the two deltas; the per-fix-commit growth trigger spends
one mechanical regeneration. This Change mints the formal decision records
and any glossary entries ("smallest resulting system", "fence-or-shrink")
per convention.

### `qq-openwiki`: git is the snapshot store

The ~120-line durable-snapshot protocol duplicates git under the script's
own preconditions (`--update` already requires the dedicated branch, HEAD ==
`origin/main`, clean tree — pre-run state *is* HEAD). Replace with
`git restore --staged --worktree` + a ~10-line startup deviation check; add
the missing clean-tree precondition for `--init`. **Keep:** flock
single-writer, provider pin, branch/freshness guards, both temporary-debt
notes. **Target:** 266→~130.

### `qq-herdr-home`: take the board grep off the critical path

Drop the Backlog-board assertion from `inspect` (keep discovery only in
operator-invoked `focus-board`). Removes the N+1 pane argv-grep — fragile
against the board's own staleness (doc-46) — from every Change's required
path. Script −~55 lines.

### Retire the hybrid Task-truth convention — OPEN

Needs its own alignment brief; do not enact from this doc. Evidence for
reopening: two exception-patches in the convention's first two weeks (T-73's
step-11 special case; T-72's foreign untracked file blocking three
sessions' syncs) — sustained same-class findings measure a design property.
**Recommended model:** the Task record is born in the Change worktree and
never moves; the board becomes a read model aggregating active worktrees.
Deletes the step-11 untracked-file exception entirely; aligns with doc-46.
**Considered and rejected:** a Task store fully separate from code delivery
— un-prices the atomic-PR property; the state machine reappears in a
retention-policy costume.

### `qq-reap`

Per the reaper disposition above. Rides the retire rails once the engines
exist.

## Sequencing

Probes and ratchet baselines first, then guard replacement (lowest risk,
highest return; probe merge rejection after), then engines (`qq-dispatch`
first — kills the T-75 drift class), then skill slimming and the doc-50
encoding, then openwiki and herdr-home (independent), then the hybrid
convention behind its brief, then the reaper. Each item is one Task with its
own decision ledger.

## Fitness checks (recurrence tripwires)

Compiled into CI by the ratchet-baselines item: no `codex exec` outside
`bin/`; no runtime-specific flags in skill prose; no shell parser for policy
enforcement; the prose budget itself. Remaining as reviewer rules in
REVIEW.md (honestly not compilable): a new permanent protocol names the
user-visible failure it prevents and retires at least as much protocol as it
adds; provider command construction exists in exactly one adapter; core
workflow tests pass with herdr and openwiki absent; deliver-change never
*requires* herdr, a browser, or a polling loop to reach a green handoff; no
Task-record relocation as a lifecycle transition (post convention
retirement); no universal review/UAT gate without an explicit risk trigger
(ledger exempt).

## Expected net

| surface | now | after |
|---|---|---|
| qq-claude-guard + test | 1,446 | ~160–200 |
| deliver-change + delegate-batch | 439 | ~220–230 |
| code-review + research | 227 | ~170 |
| qq-openwiki | 266 | ~130 |
| qq-herdr-home | 155 | ~100 |
| new engines + their tests | 0 | ~+400 |
| **operational total** | **~4,750** | **~3,100–3,300** |

The larger gains are unpriced in lines: cognitive size (per-Change mandatory
prose roughly halves), state size (prose-maintained sequence/TTL state and
the openwiki snapshot store cease to exist), and testability (rails and
status protocol become deterministic, CI-tested code for the first time).

## Not to cut

Root docs (AGENTS/CONCEPTS/REVIEW — the actual product). GitHub ruleset +
`qqp-bot` identity. Worktree isolation for concurrent writers. Work orders,
completion envelopes, verify-against-the-tree. The five gates. The small
judgment skills. openwiki flock/branch/freshness guards and both
temporary-debt notes. Herdr cockpit scripts and keybindings (operator UX).
