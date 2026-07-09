---
name: orchestrate
description: Conducts a non-trivial engineering task through qq's full loop as a two-model split — Claude conducts and judges in the main session while Codex does the implementation — so interactive work and noisy reads never pollute the conductor's context and the reviewer is never the author. Use to take a real build task from intent to a landed, verified change end-to-end; not for questions, lookups, or trivial one-liners, which use the small-change shortcut.
---

# Orchestrate

Conduct; don't play every instrument. You hold the baton in the main session —
intent, judgment, the human gates — and route the work that would otherwise bury
this context to where it belongs: implementation to **Codex**, noisy reads to
**Claude sub-agents** that hand back only their artifact. The separation is the
point, not a cost: Claude never writes the code it later verifies and reviews, so
the verdict is worth something.

**Announce at start:** "I'm using the orchestrate skill to run this through the loop."

## Who does what

- **Claude, main session (you)** — triage, Align, approve the plan, consent gates,
  UAT sign-off, the final report. Everything interactive or judgment-bearing.
- **Claude sub-agents** — plan drafting, verification, code-review, compounding.
  Each returns only its artifact; the reads that produced it stay out of this context.
- **Codex worker** (`cx-<branch>`, a named herdr pane) — implementation and its own
  repair. Nothing else. One worker per working tree, spawned into the conductor's
  tab, visible in the sidebar with live idle/working/blocked state, driven over the
  herdr comms primitives (send / read / wait). Model, reasoning effort, sandbox, and
  approvals come from `~/.codex/config.toml` (`gpt-5.5` / `xhigh` / `priority` tier /
  full-access / no-prompt here); pass `-c` overrides only if you must.

Two rules make the separation real:

- **Once a task enters the loop, you never implement — Codex does.** Not "to save a
  round-trip," not "it's a one-liner inside a bigger task." The moment Claude writes
  shipped code, the later review and verification are grading their own author. The
  only code you write yourself is triage's small-change shortcut (step 0), which
  never enters the loop.
- **`verification-before-completion` is never skipped** — on the conducted path or
  the small-change shortcut. This is the AGENTS.md invariant; it holds here too.

## The run

**Stamp progress at every phase boundary.** As you enter each numbered phase
below, run `qq-phase <PhaseName>` (`Align`→`Plan`→`Build`→`Verify`→`Sign-off`→
`Review`→`Compound`). This writes `.qq/state.json` — the cheap, token-free source
of truth a status widget reads (merged with the gate's own `no-mistakes axi
status` steps). It is the loop's only self-report; without it the widget shows
`idle`. Orchestrate uses the default `main` producer slot; background skills that
share the surface must pass `--producer <id>` on every stamp and on `done`/`clear`.
Refinements: on a Build hand-off add `--detail "handoff k/n"`; on Verify set
`--status green` or `--status red`; when you push to the gate add `--gate`
(attaches the run id). Run `qq-phase done` after Compound, or whenever you stop
conducting. The small-change shortcut (step 0) does not stamp — it never enters
the loop.

### 0 — Triage first
Trivial + local + reversible (typo, rename, one-liner)? Do it here, run
`verification-before-completion`, commit on green to the current working branch —
small changes batch on a branch and land as one gated push per AGENTS.md § Git;
nothing commits straight to `main`. No Codex, no phases — the command must not
turn a rename into a ceremony. Everything else conducts the loop below.

### 1 — Align (main)
`grilling` / `grill-me` with the owner: pin intent and resolve the open decision
branches. Dispatch nothing until intent is settled.

### 2 — Plan (sub-agent drafts → you approve)
Dispatch a Claude sub-agent to draft the plan via `writing-plans`; it returns the
plan doc, not the reading behind it. Review it in the main session with the owner
and approve or edit. The approved plan is Codex's brief.

### 3 — Build (Codex implements, in its own pane)
Codex runs as a **named herdr agent** — a pane the operator can see and you can
drive — never a headless subprocess. Hand work over **adaptively**: batch
independent, low-risk tasks into one handoff; isolate risky or coupled ones.
Handoffs are sequential — the worker holds the working tree, you wait, then
verify; don't edit the tree while the worker has it.

Handoffs ride **`.qq/handoffs/`** (gitignored with the rest of `.qq/`): brief in
`<n>-brief.md`, report back in `<n>-report.md`, `<n>` = 1, 2, … per run. Stated
here once; every step below refers to it.

**Worker lifecycle:**

1. **Start** — one worker per working tree, spawned into your own tab
   (tab-per-task: one tab reads as one task; cap ~3 panes per tab). Find your
   tab with `herdr pane current` → `tab_id`, then:
   `herdr agent start cx-<branch> --cwd <tree> --tab <tab_id> --split down
   --no-focus -- codex`. Fanning out? `herdr worktree create --branch <name>`
   first — worktree affinity is per-pane via `--cwd`.
2. **Trust prompt** — `herdr agent read cx-<branch> --source visible`; if the
   directory-trust prompt is showing, `herdr pane send-keys <pane> Enter`
   (option 1 is preselected). Long-term: pre-trust project roots in
   `~/.codex/config.toml`.
3. **Handoff** — write the plan task(s) + the acceptance check to
   `.qq/handoffs/<n>-brief.md` (multi-line text must not ride `agent send` — a
   newline submits early). Then:
   `herdr agent send cx-<branch> "Execute .qq/handoffs/<n>-brief.md; when done
   write .qq/handoffs/<n>-report.md (what changed, files touched, how to
   verify)."` followed by `herdr pane send-keys <pane> Enter`. The worker edits
   the tree in place (trusted + full-access) and inherits `AGENTS.md` as its own
   instructions, so the behavioral floor already binds it — point it at the plan
   task, don't re-explain the standards.
4. **Wait** — `herdr agent wait cx-<branch> --status idle --timeout <generous,
   ms>`. If idle flickers mid-turn, wait for idle twice a few seconds apart
   before trusting it. On timeout, `herdr agent read cx-<branch>` for signs of
   life before declaring it stuck. A worker parked on an approval prompt shows
   **blocked** in the sidebar → read the pane, answer or escalate to the owner.
5. **Report** — read `.qq/handoffs/<n>-report.md`; the file is the result of
   record. Scrollback (`herdr agent read`) and the live stream (`herdr terminal
   session observe cx-<branch>`, read-only NDJSON — watch without stealing
   input) are debug only; never parse them as the result.
6. **Repair** — the pane session is alive: send failing evidence as a follow-up
   handoff in the same pane (step 3 mechanics, next `<n>`). If the pane died,
   recover the session id (`herdr agent get cx-<branch>` →
   `agent_session.value`) and restart with `herdr agent start cx-<branch> …
   -- codex resume <session-id>`. `--last` is banned: it is not
   worktree-scoped, so parallel runs can silently cross-resume each other's
   sessions.
7. **Teardown** — on run completion the worker pane stays for the operator to
   inspect; closing it is the operator's call (or `herdr pane close` when the
   run created the workspace).

### 4 — Verify (sub-agent)
After each handoff, dispatch a Claude sub-agent to run `verification-before-completion`
against the real commands; it returns the evidence bundle (command + full output),
not the churn.

- **Green** → commit the verified work and push the branch for durability; then the
  next handoff, or step 5 once the plan is done. The completed branch lands through
  the gate per AGENTS.md § Git.
- **Red** → hand the failing evidence back to the worker as a follow-up handoff in
  the **same pane** (Build step 6), then re-verify. After **2** failed Codex rounds
  on the same failure, stop and bring it to the owner in the main session — don't
  grind.

### 5 — Sign-off (main, gated)
User-facing, irreversible, or ambiguous change? → `uat-signoff` with the owner,
seeded by step 4's evidence. Otherwise skip.

### 6 — Review (sub-agents)
Dispatch `code-review` (Standards + Intent) as sub-agents; they return the two reports.
Codex wrote the code and Claude reviews it, so this is a genuine second pair of eyes.
Weigh the feedback with `receiving-code-review` — don't rubber-stamp it.

### 7 — Compound (sub-agent)
After verified work, dispatch `compound`; it decides whether the solve earned a
capture. If it writes, it returns the `docs/solutions/` + `CONCEPTS.md` files for
a glance; if not, it exits quietly.

## Done means
Report to the owner only when the plan's tasks are implemented by Codex,
verification is green with evidence, any required sign-off is granted, review is
in hand, and the branch has been pushed through the gate. Name what Codex built,
paste the verifying evidence, link the review. A
"done" without the green evidence bundle is not done.

## When NOT to use
- A trivial, local, reversible change — that's the small-change shortcut in step 0,
  not a reason to spin up the loop.
- A question, a lookup, a read — answer it; orchestration is for landing a change.
- A pure investigation with no build — use `research`.
- Work already mid-loop — resume the phase you're in; don't restart the conductor.

## Integration
Conducts these skills, each in its designed locus: `grilling`, `writing-plans`,
`verification-before-completion`, `uat-signoff`, `code-review`,
`receiving-code-review`, `compound`. Implementation is delegated to the Codex
worker pane (`cx-<branch>`, § 3 Build), never run here. `AGENTS.md` holds the
phase definitions and the
routing this skill obeys — it is the source of truth; this skill is its invocable form.
