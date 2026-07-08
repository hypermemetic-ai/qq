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
- **Codex** (`codex exec`) — implementation and its own repair. Nothing else. Model,
  reasoning effort, sandbox, and approvals come from `~/.codex/config.toml`
  (`gpt-5.5` / `xhigh` / `priority` tier / full-access / no-prompt here); pass `-c`
  overrides only if you must.

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
`idle`. Refinements: on a Build hand-off add `--detail "handoff k/n"`; on Verify
set `--status green` or `--status red`; when you push to the gate add `--gate`
(attaches the run id). Run `qq-phase done` after Compound, or whenever you stop
conducting. The small-change shortcut (step 0) does not stamp — it never enters
the loop.

### 0 — Triage first
Trivial + local + reversible (typo, rename, one-liner)? Do it here, run
`verification-before-completion`, commit on green, then land through the gate per
AGENTS.md § Git. No Codex, no phases — the command must not turn a rename into a
ceremony. Everything else conducts the loop below.

### 1 — Align (main)
`grilling` / `grill-me` with the owner: pin intent and resolve the open decision
branches. Dispatch nothing until intent is settled.

### 2 — Plan (sub-agent drafts → you approve)
Dispatch a Claude sub-agent to draft the plan via `writing-plans`; it returns the
plan doc, not the reading behind it. Review it in the main session with the owner
and approve or edit. The approved plan is Codex's brief.

### 3 — Build (Codex implements)
Hand work to Codex **adaptively**: batch independent, low-risk tasks into one
handoff; isolate risky or coupled ones. Handoffs are sequential — Codex holds the
working tree, you wait, then verify; don't edit the tree while Codex has it.

- First handoff: `codex exec "<plan task(s) + the acceptance check>" < /dev/null` from
  the repo root. Codex edits the working tree in place (this repo is trusted +
  full-access) and inherits `AGENTS.md` as its own instructions, so the behavioral
  floor already binds it — point it at the plan task, don't re-explain the standards.
- Later handoffs: `codex exec resume --last "<next task(s)>" < /dev/null` so its
  context stays warm across the plan.
- **Always close stdin (`< /dev/null`) on every `codex exec` handoff.** Run
  non-interactively, `codex exec` blocks forever on `Reading additional input from
  stdin...` unless stdin is closed — it reads as "Codex is stuck" but it's hung before
  the first token. The redirect makes it hit EOF and start immediately. For long
  briefs, prefer a prompt file: `codex exec "$(cat brief.prompt)" < /dev/null`.

### 4 — Verify (sub-agent)
After each handoff, dispatch a Claude sub-agent to run `verification-before-completion`
against the real commands; it returns the evidence bundle (command + full output),
not the churn.

- **Green** → commit the verified work and push the branch for durability; then the
  next handoff, or step 5 once the plan is done. The completed branch lands through
  the gate per AGENTS.md § Git.
- **Red** → hand the failing evidence back to Codex (`codex exec resume --last`) to
  fix, then re-verify. After **2** failed Codex rounds on the same failure, stop and
  bring it to the owner in the main session — don't grind.

### 5 — Sign-off (main, gated)
User-facing, irreversible, or ambiguous change? → `uat-signoff` with the owner,
seeded by step 4's evidence. Otherwise skip.

### 6 — Review (sub-agents)
Dispatch `code-review` (Standards + Intent) as sub-agents; they return the two reports.
Codex wrote the code and Claude reviews it, so this is a genuine second pair of eyes.
Weigh the feedback with `receiving-code-review` — don't rubber-stamp it.

### 7 — Compound (sub-agent)
Solved something worth not relearning? → dispatch `ce-compound` to capture it to
`docs/solutions/` + `CONCEPTS.md`. Returns the files for a glance.

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
`receiving-code-review`, `ce-compound`. Implementation is delegated to Codex
(`codex exec`), never run here. `AGENTS.md` holds the phase definitions and the
routing this skill obeys — it is the source of truth; this skill is its invocable form.
