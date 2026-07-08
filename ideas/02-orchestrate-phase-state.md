# Background-status substrate (`qq-phase` -> `.qq/state.json`)

**Status:** built + verified (2026-07-07), landing via the gate on
`feat/status-substrate`. The old parked patch from `qq-ac/orchestrate-progress`
survived as [`02-orchestrate-phase-state.patch`](02-orchestrate-phase-state.patch),
but it is now an archive of the starting point, not the source of truth.

## What it is
A cheap, token-free progress source for long-running background work. Producers
stamp the current phase to `.qq/state.json`; the Claude Code status line reads it
through `qq-phase render`, so the loop phase and the gate's pipeline position show
as one ambient readout.

- **`bin/qq-phase`** — the writer and reader in one script. It stamps the current
  background-work phase to a producer slot in `.qq/state.json`, serializes
  read-modify-write with a lock, writes via an atomic temp-file replace, renders
  a one-line widget, and never makes an LLM call. It reads the local gate daemon
  only on short timeout when a run id is attached.
  - `qq-phase <Phase> [--producer P] [--detail T] [--task T] [--status S] [--gate]` — advance
  - `qq-phase gate [--producer P]` — attach the active gate run id (no phase change)
  - `qq-phase status` — print current state JSON (raw read API)
  - `qq-phase render` — print the status-line text, silently when idle
  - `qq-phase done [--producer P]` — mark the producer's work complete
  - `qq-phase clear [--producer P]` — remove one producer slot, or all state when bare
  - Phases: Align(1) Plan(2) Build(3) Verify(4) Sign-off(5) Review(6) Compound(7);
    Triage(0) is pre-loop. Unknown names stamp verbatim with a null index.
- **`skills/orchestrate/SKILL.md`** — a "stamp progress at every phase boundary"
  block wiring the conductor to call `qq-phase` as it enters each numbered phase.
- **`qq-methodology.md`** — a "Progress is stamped" note at the loop level, shared
  by every linked repo through the methodology import.
- **`bin/qq-activate.sh`** — links `qq-phase` onto PATH and wires
  `qq-phase render` into Claude Code's status line with a 3-second refresh, unless
  a non-qq status line is already present.
- **`bin/qq-link.sh repo`** — adds `.qq/` to each linked repo's `.gitignore` so
  phase stamps do not leave untracked transient state behind.
- **`.gitignore`** — ignores the transient `.qq/` state dir in this repo.
- **`.no-mistakes.yaml`** — adds `bin/qq-phase` to the shellcheck lint.

## Final shape
The resurrected feature was widened from an orchestrate-only tracker into a shared
background-work surface. Orchestrate is the first producer, but `/idea` and any
future background skill can stamp its own `--producer <id>` slot with free-form
phases such as `capturing` or `researching`, then finish with
`qq-phase done --producer <id>`.

The state home changed from the parked patch's `.orchestrate/state.json` to the
neutral `.qq/state.json`, and the reader moved into the same script as
`qq-phase render`. The renderer joins every active producer slot, keeps `main`
unprefixed for back-compat, and merges the active `no-mistakes axi status` gate
step only while that slot's attached run is still live, so stale gate markers
fall away.

## Archived patch
Do not re-apply `02-orchestrate-phase-state.patch` to current `main`; it predates
the `qq-ac -> qq` rename, the gate drift, the `.qq/` home, `qq-phase render`, and
activation wiring. Keep it only as provenance until this branch merges, then it is
safe to retire.
