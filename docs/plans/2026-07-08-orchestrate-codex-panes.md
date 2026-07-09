# Orchestrate rework: Codex workers as first-class herdr panes

_2026-07-08 · design for backlog **task-8** (idea #9). Decided 07-08: Codex is
about to become the main driver, so Codex workers stop being second-class —
they get their own herdr pane, like Claude workers, so there is **one worker
model**. Mechanics smoke-tested 07-08 (scratch workspace): `herdr agent start …
-- codex` is auto-detected as agent `codex` with live idle/working state;
`herdr agent send cx-<branch>` + `herdr pane send-keys <pane> Enter` delivers
prompts; `herdr agent wait cx-<branch> --status idle` blocks until the turn
ends; herdr captures the codex session id. This plan lands as its own gated
branch **after** `feat/document-stack` merges._

## Goal

Replace orchestrate's headless `codex exec` Build handoffs with a named,
pane-resident Codex worker driven over herdr primitives — visible in the
sidebar, addressable via send/read/wait, isolated per worktree.

## Design

**Pane topology (07-08 update):** one tab per task. The orchestrator pane is
first; delegated worker panes open in the same tab via herdr 0.7.2+ tab/split
primitives. Keep roughly three panes per tab; overflow to a second tab or the
sidebar/session navigator. Worktree affinity stays per pane (`--cwd`), so a
task's conductor and worker pair share that task's worktree while Codex holds
the tree and the conductor reads only.

**Herdr 0.7.2+ API substrate:** `herdr terminal session observe` gives the
conductor a read-only NDJSON ANSI stream for watching a worker without stealing
input; `herdr terminal session control` is the explicit input/resize/takeover
surface. `session.snapshot` bootstraps socket state, `layout.updated` tracks pane
mutations, and `herdr api schema --json` is the reference before wiring against
the socket API.

**Worker lifecycle (per orchestrate run):**
1. Start: `herdr agent start cx-<branch> --cwd <tree> --no-focus -- codex`
   inside the task tab, adding the appropriate tab/split flag once the exact
   cockpit binding lands (same workspace as the run's tree; `herdr worktree
   create` first when fanning out). One worker per working tree, honoring tree
   ownership.
2. Trust prompt: after start, `herdr agent read cx-<branch> --source visible`;
   if the directory trust prompt is showing, `herdr pane send-keys <pane> Enter`
   (option 1 is preselected). Long-term: pre-trust project roots in
   `~/.codex/config.toml`.
3. Handoff: write the brief to `.qq/handoffs/<n>-brief.md` (multi-line text
   must not ride `herdr agent send` — a newline submits early). Then
   `herdr agent send cx-<branch> "Execute .qq/handoffs/<n>-brief.md; when done
   write .qq/handoffs/<n>-report.md (what changed, files touched, how to
   verify)."` followed by `herdr pane send-keys <pane> Enter`.
4. Wait: `herdr agent wait cx-<branch> --status idle --timeout <generous>`;
   on timeout, `herdr agent read cx-<branch>` for signs of life before declaring
   it stuck. A worker parked on an approval prompt surfaces as blocked → read
   the pane, answer or escalate to the owner.
5. Report-back is **file-based**: the conductor reads
   `.qq/handoffs/<n>-report.md`. Scrollback
   (`herdr agent read cx-<branch>`) is debug/fallback only — never parse it as
   the result of record.
6. Repair loop: the pane session is alive — send the failing evidence as a
   follow-up message in the same pane. `codex exec resume --last` semantics
   (and its cross-worktree bleed hazard, audit Part 2.3) are deleted, not
   scoped. If a pane dies, herdr holds the codex session id
   (`herdr agent get cx-<branch>` → `agent_session.value`) for an explicit
   resume.
7. Teardown: on run completion the worker pane stays for the operator to
   inspect; `qq-phase done` marks the run. Closing panes is the operator's
   call (or `herdr pane close` when the workspace was created by the run).

**What this deletes:** the `< /dev/null` stdin-hang rule (ideas/03) — panes
are interactive; there is no headless path left in orchestrate.

**Comms:** this is the first real consumer of the herdr agent-comms
primitives (idea #8, methodology § Sessions) — conductor↔worker messaging
uses them unmodified; still no protocol beyond the handoff-file convention.

## Tasks

1. **Rewrite `skills/orchestrate/SKILL.md` § Who-does-what + § 3 Build** to the
   worker-pane lifecycle above; update § 4 Verify's repair handoff (same pane,
   no resume); drop the stdin-hang section; align step 0 wording with the
   all-gated routing (batch on branch — never straight to `main`).
   *Accept:* no `codex exec` invocation remains in the skill; the lifecycle
   steps 1–7 are each present and unambiguous.
2. **Add `.qq/handoffs/` convention** to the skill (gitignored via `.qq/`).
   *Accept:* brief + report naming (`<n>-brief.md` / `<n>-report.md`) stated
   once, referenced everywhere else.
3. **Retire ideas/03** (stdin hang) — mark superseded by this branch in
   `ideas/README.md`; update task-3's codex-resume item in `backlog/`.
   *Accept:* records point here; no live doc still teaches `resume --last`.
4. **End-to-end verification** — run a real (small) orchestrate task through
   the new Build path in a worktree: start worker, two handoffs (one clean,
   one deliberate red→repair), file reports read back, land through the gate.
   *Accept:* evidence bundle in the run transcript; `verification-before-
   completion` green; task-8 ACs checked off in `backlog/`.

## Risks / open

- `herdr agent send` newline handling: long briefs must go via file (designed in).
- Non-focused pane rendering: worked in the smoke test; re-verify under a
  real multi-hour build.
- `herdr agent wait cx-<branch> --status idle` fidelity during codex sub-shell
  activity: if idle flickers mid-turn, add a settle re-check (wait idle twice,
  N s apart).
- Codex resume-by-id flag name for dead panes: confirm during build.
