# Orchestrate rework: Codex workers as first-class herdr panes

_2026-07-08 · design for backlog **task-8** (idea #9). Decided 07-08: Codex is
about to become the main driver, so Codex workers stop being second-class —
they get their own herdr pane, like Claude workers, so there is **one worker
model**. Mechanics smoke-tested 07-08 (scratch workspace): `herdr agent start …
-- codex` is auto-detected as agent `codex` with live idle/working/done state;
`herdr agent send cx-<branch>` + `herdr pane send-keys <pane> Enter` delivers
prompts after a brief read/settle before Enter; `herdr agent wait
cx-<branch> --status idle` unblocks when Codex surfaces `done` at turn end;
herdr captures the codex session id. This doc is slice 0 of the gated TASK-8
slicing pilot; the later slices land as their own gated runs, serially._

## Goal

Replace orchestrate's headless `codex exec` Build handoffs with a named,
pane-resident Codex worker driven over herdr primitives — visible in the
sidebar, addressable via send/read/wait, isolated per worktree.

## Design

**Pane topology — tab-per-task (operator-approved 07-08).** Each orchestrate
run lives in one herdr tab: the conductor pane comes first, and delegation
spawns worker panes *into the same tab*, so the operator reads one tab as one
task. The conductor finds its own tab with `herdr pane current` → `tab_id`,
then passes `--tab <tab_id> --split right` on `agent start` — extra panes are
**right splits**, side-by-side, never `down` (operator decision 07-08). (herdr 0.7.2
fixed `pane split --current` to resolve to the calling pane, so split-from-self
is reliable.) Cap **~3 panes per tab** — beyond that, readability dies; a run
that genuinely needs more workers fans the extras into a fresh tab. Worktree
affinity is **per-pane**: `--cwd` pins each worker to its tree — one writer per
tree, per the methodology's parallel rules.

**The orchestrator→worker relation is carried by convention, not by herdr.**
Verified against `herdr api schema --json` (0.7.3): there is **no first-class
parent/child agent relation** — no `parent`, `child`, `group`, or `hierarchy`
field exists; an agent record carries `agent_session`
(`source`/`agent`/`kind`/`value`) plus placement (`workspace_id`, `tab_id`,
`pane_id`, `label`), and the only containment tree is workspace→tab→pane. So
the grouping **is** the tab, and the durable join key is a **`task-<id>`
label** on both the tab and its panes:

- the conductor renames its run's tab (`herdr tab rename <tab_id> task-<id>`)
  and its own pane (`herdr agent rename <target> task-<id>`);
- worker panes are named `cx-<branch>` with branches named `task-<id>-<slug>`,
  so every pane in the group carries the task id in its name.

Consumers (TASK-11's lifecycle view) **join on `task-<id>`**, not on tab
containment — the relation then survives a pane being moved to another tab.
Containment is the fast path; the label is the source of truth.

_Upstream feature request (flagged for the operator, 2026-07-08):_ a
first-class parent ref on `herdr agent start` (e.g. `--parent <terminal-id>`,
surfaced as a `parent` field on the agent record) would make this relation
structural instead of conventional, and let the sidebar render workers as
nodes under their orchestrator — the "list of nodes under a parent" the
operator asked for. Operator's call whether to file it upstream.

**Observation — herdr 0.7.3 socket primitives.** `herdr terminal session
observe <target>` streams a pane read-only (NDJSON ANSI) — the conductor or
operator tooling watches a Codex worker live *without stealing input*.
`herdr terminal session control <target> [--takeover]` exists for input
bridges; orchestrate does not use it — the conductor drives workers only via
`agent send`, read/settle, then `pane send-keys`. Snapshot/layout events
(`session.snapshot`, `layout.updated`) ride the same socket; discover the full
surface with `herdr api schema --json`. Observation is debug/watch only —
never the report of record (that stays file-based, below).

**Worker lifecycle (per orchestrate run):**
1. Start: `herdr agent start cx-<branch> --cwd <tree> --tab <conductor-tab>
   --split right --no-focus -- codex`
   (same workspace as the run's tree; `herdr worktree create` first when
   fanning out). One worker per working tree, honoring tree ownership.
2. Startup prompts: after start, `herdr agent read cx-<branch> --source visible`;
   if a prompt is showing, answer with `herdr pane send-keys`: directory trust →
   `Enter` (option 1 preselected); update offer → skip it (don't change the tool
   mid-run). Long-term: pre-trust project roots in `~/.codex/config.toml`.
3. Handoff: write the brief to `.qq/handoffs/<n>-brief.md` (multi-line text
   must not ride `herdr agent send` — a newline submits early). Then
   `herdr agent send cx-<branch> "Execute .qq/handoffs/<n>-brief.md; when done
   write .qq/handoffs/<n>-report.md (what changed, files touched, how to
   verify)."`. Wait a couple seconds or read
   `herdr agent read cx-<branch> --source visible` until the text is in the
   pane, then `herdr pane send-keys <pane> Enter`.
4. Wait: `herdr agent wait cx-<branch> --status idle --timeout <generous>`;
   Codex surfaces `done` at turn end, and the wait unblocks on that transition —
   don't poll for a literal `idle`. If the status flickers mid-turn, wait twice a
   few seconds apart before trusting it. On timeout, `herdr agent read
   cx-<branch>` for signs of life before declaring it stuck. A worker parked on
   an approval prompt surfaces as blocked → read the pane, answer or escalate to
   the owner.
5. Report-back is **file-based**: the conductor reads
   `.qq/handoffs/<n>-report.md`. Scrollback
   (`herdr agent read cx-<branch>`) and the live stream (`herdr terminal session
   observe cx-<branch>`) are debug/fallback only — never parse them as the result
   of record.
6. Repair loop: the pane session is alive — send the failing evidence as the
   next handoff in the same pane, using the next `<n>`. `codex exec resume
   --last` semantics (and its cross-worktree bleed hazard, audit Part 2.3) are
   deleted, not scoped. If a pane dies, herdr holds the codex session id
   (`herdr agent get cx-<branch>` → `agent_session.value`); restart with
   `herdr agent start cx-<branch> … -- codex resume <session-id>` (flag
   confirmed 07-08: `codex resume [SESSION_ID]`; bare `--last` is banned in
   parallel operation).
7. Teardown: on run completion the worker pane stays for the operator to
   inspect; `qq-phase done` marks the run. Closing panes is the operator's
   call (or `herdr pane close` when the workspace was created by the run).

**What this deletes:** the `< /dev/null` stdin-hang rule (ideas/03) — panes
are interactive; there is no headless path left in orchestrate.

**Comms:** this is the first real consumer of the herdr agent-comms
primitives (idea #8, methodology § Sessions) — conductor↔worker messaging
uses them unmodified; still no protocol beyond the handoff-file convention.

## Slices (pilot: parent + dependency-linked tracer bullets)

This task is the **slicing pilot** (operator decision 2026-07-08): planned by
hand as parent `task-8` plus dependency-linked slice sub-tasks, each slice
landing through the gate as its own small unattended run, serially on its own
branch after the previous slice reaches `main`. `writing-plans` /
`executing-plans` get reworked only from this pilot's lessons (captured in slice
3).

- **Slice 0 — plan (parent branch, this doc).** Fold the approved substrate
  (tab topology, 0.7.3 observe primitives, resume-by-id) into this design doc;
  mint the slice sub-tasks. *Accept:* slices exist in `backlog/` with dep
  links; this doc carries the decided design.
- **Slice 1 — `task-8.1` skill rewrite.** Rewrite
  `skills/orchestrate/SKILL.md` § Who-does-what + § 3 Build to the worker-pane
  lifecycle above (absorbs the old Tasks 1+2): update § 4 Verify's repair
  handoff (same pane, no resume); drop the stdin-hang section; add the
  `.qq/handoffs/` convention (gitignored via `.qq/`, naming stated once);
  align step 0 wording with the all-gated routing. *Accept:* no `codex exec`
  invocation remains in the skill; lifecycle steps 1–7 each present and
  unambiguous; brief/report naming (`<n>-brief.md` / `<n>-report.md`) stated
  once, referenced everywhere else.
- **Slice 2 — `task-8.2` records retirement, run as the live e2e exercise.**
  Retire ideas/03 (stdin hang) and close the audit's Part 2.3 resume item —
  and implement it **through the new Build path itself**: the conductor starts
  a `cx-` worker pane, drives two handoffs (one clean, one deliberately
  red→repair via brief scoping), reads file reports back. The old Tasks 3+4
  merged: the records change *is* the e2e verification workload. *Accept:*
  records point here; no live doc still teaches `resume --last` as an
  orchestrate handoff (ideas/01's *background side-quest* `codex exec` model
  is out of scope — orchestrate is the surface AC #3 names); evidence bundle
  (commands + reports) in the slice task file.
- **Slice 3 — `task-8.3` close-out.** Pilot lessons (what the slicing shape
  taught, feeding the writing-plans/executing-plans rework), evidence
  summary, parent AC check-offs, task-8 → Done. *Accept:* lessons recorded;
  `verification-before-completion` green; task-8 ACs checked in `backlog/`.

## Risks / open

- `herdr agent send` newline handling: long briefs must go via file (designed in).
- Non-focused pane rendering: worked in the smoke test; re-verify under a
  real multi-hour build.
- `herdr agent wait cx-<branch> --status idle` fidelity during codex sub-shell
  activity: if idle flickers mid-turn, add a settle re-check (wait idle twice,
  N s apart).
- ~~Codex resume-by-id flag name for dead panes~~ — confirmed 07-08:
  `codex resume [SESSION_ID]` / `codex exec resume [SESSION_ID]`.
- ~~Stacked slice branches self-correct at merge~~ — **wrong, and it was the
  pilot's real trap.** Each gate run is main-relative and does not update
  successor branches, so a hand-built stack is not a stack. Slices land
  **serially**: one green PR at a time, merge `origin/main` into the next slice
  branch after its predecessor merges, then re-drive that run. See
  `ideas/06-slicing-pilot-lessons.md` friction #1.
