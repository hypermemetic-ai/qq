# Orchestrate progress state (`qq-phase` → `.orchestrate/state.json`)

**Status:** _built but unmerged._ Salvaged from the deleted local branch
`qq-ac/orchestrate-progress` (single commit `a62c128`, 2026-07-06) so nothing was
lost when the branch was pruned. Full re-appliable patch sits beside this note:
[`02-orchestrate-phase-state.patch`](02-orchestrate-phase-state.patch). This is a
real, working feature parked — not a throwaway thought — pending a decision to
promote (`writing-plans`) or drop.

## What it is
A cheap, token-free progress source for the `orchestrate` loop that a status
widget can read, so the loop's phase and the gate's pipeline position show as one.

- **`bin/qq-phase`** (103-line bash, the single writer) — stamps the current loop
  phase to `.orchestrate/state.json` via an atomic temp-file replace. Never makes
  an LLM call; only reads the local gate daemon for a run id on demand.
  - `qq-phase <Phase> [--detail T] [--task T] [--status S] [--gate]` — advance
  - `qq-phase gate` — attach the active gate run id (no phase change)
  - `qq-phase status` — print current state JSON (the widget read API)
  - `qq-phase done` — mark the loop complete
  - `qq-phase clear` — remove state (loop idle)
  - Phases: Align(1) Plan(2) Build(3) Verify(4) Sign-off(5) Review(6) Compound(7);
    Triage(0) is pre-loop. Unknown names stamp verbatim with a null index.
- **`skills/orchestrate/SKILL.md`** — a "stamp progress at every phase boundary"
  block wiring the conductor to call `qq-phase` as it enters each numbered phase.
- **`AGENTS.md`** — a short "Progress is stamped" note at the loop level.
- **`.gitignore`** — ignores the transient `.orchestrate/` state dir.
- **`.no-mistakes.yaml`** — adds `bin/qq-phase` to the shellcheck lint.

## Why it was parked
It shipped on its own branch and never merged; the branch was cleaned up during
the `qq-ac → qq` rename. The idea is worth keeping — a live, near-free loop-status
readout — but it hadn't been decided on or verified end-to-end.

## How to resurrect
From the repo root:

```
git am ideas/02-orchestrate-phase-state.patch     # recreates the commit + message
# or, to just drop the changes into the worktree:
git apply ideas/02-orchestrate-phase-state.patch
```

Heads-up: the patch predates two later changes to `main`, so expect small
conflicts in `AGENTS.md`, `.no-mistakes.yaml`, and `skills/orchestrate/SKILL.md`:
1. the `qq-ac → qq` rename (the patch still says `qqac-activate.sh`, `qq-ac:` in
   its commit title, etc. — re-apply the rename after applying);
2. the gate now runs `agent: codex` on gpt-5.5 (the patch's `.no-mistakes.yaml`
   context shows the older `agent: claude`).

Backup path: the original commit `a62c128` also lives in the reflog for ~90 days.
