# Ideas

Informal backlog — dump thoughts here as they come, no ceremony. One line is
fine; a rough paragraph is fine. Nothing here is a commitment or a plan — it's a
holding pen. Groom it whenever: promote an idea to a plan (`writing-plans`), fold
it into `AGENTS.md`, or just delete it.

Quick thoughts go as bullets under **Backlog**. When an idea outgrows a line, give
it its own `NN-slug.md` file in this folder and leave a one-line pointer here.

## Backlog

> **Session 2026-07-07 worked this folder; statuses below are current. #5 is now
> built (writer + status-line reader) and landing via the gate — remaining build
> order: #2 (`compound`) → #1 (`/idea`). Design is locked — no more design
> questions, just build.**

- **#1 · The `/idea` capture skill** → [`01-btw-ideas-skill.md`](01-btw-ideas-skill.md).
  _Design locked (07-07)._ Renamed off `/btw` — that's a **built-in Claude Code command**
  (ephemeral, read-only side-question) — to **`/idea`**. A thin durable-capture skill:
  capture verbatim in-turn → detached researcher writes `ideas/NN-slug.md` → completion
  shows as **ambient status on #5's surface, never a reply in the transcript**. Rides #5;
  build last. _(2026-07-06 → 07)_
- **#2 · Auto-compound + rename to `compound`** _(decided 07-07)._ Drop the `ce` prefix —
  we own it, call it **`compound`** (rename `skills/ce-compound/` + all refs + the
  `~/.claude/skills` link). And stop asking: it **auto-fires when appropriate**, with the
  appropriateness judgment living *inside* the skill, not a yes/no prompt. _(2026-07-06 → 07)_
- **#5 · Background-status substrate** → [`02-orchestrate-phase-state.md`](02-orchestrate-phase-state.md).
  ✅ **Built + verified (07-07), landing via the gate** (branch `feat/status-substrate`).
  Resurrected the salvaged patch and widened it per the note: single writer **`bin/qq-phase`**
  stamps the current phase to **`.qq/state.json`** (neutral home, not `.orchestrate/`), and the
  reader is folded into the same script as **`qq-phase render`** — wired into the **Claude Code
  status line** via `qq-activate.sh`, merging the live gate step from `no-mistakes axi status`.
  Any producer can stamp a free-form phase (`capturing → researching → done`), so **#1 rides it
  for free**. Salvaged patch + note (`02-*.md/.patch`) safe to retire once merged. _(2026-07-06 → 07)_
- **#3 · `codex exec` stdin-hang** → [`03-codex-exec-stdin-hang.md`](03-codex-exec-stdin-hang.md).
  ✅ **Done (07-07).** Wired `< /dev/null` + a rule bullet into
  `skills/orchestrate/SKILL.md`'s Build handoffs. Note kept for rationale; safe to delete. _(2026-07-06 → 07)_
- **#4 · Gate "stall" after a rename** → [`04-gate-stale-path-after-rename.md`](04-gate-stale-path-after-rename.md).
  ✅ **Root-caused (07-07).** (1) stale-path → `no-mistakes init` repairs it. (2) the
  "post-review freeze" was **not** a deadlock — the run parked in `awaiting_approval`
  (review had auto-fix findings, `auto_fix.review:0`); `no-mistakes attach` to approve. A
  14h-orphaned run still sits parked (its work is already on main — safe to dismiss). _(2026-07-06 → 07)_
- **Agents should self-wrap-up on context pressure** _(new, 07-07)._ Make agents
  context-aware: as they approach ~200–250k tokens they should proactively start wrapping
  up / handing off on their own, rather than *beginning* fresh work deep in a window ("you
  shouldn't start here"). Relates to `handoff` (the transfer) and the Stop-hook WIP snapshot
  — this is the *trigger* that should fire the wrap-up. Could grow its own `NN-slug.md`. _(2026-07-07)_
