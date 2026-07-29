---
id: doc-124
title: 'Plan — qq simplification, second wave (base-batch successor)'
type: specification
created_date: '2026-07-29 15:19'
updated_date: '2026-07-29 15:21'
---
# Plan — qq simplification, second wave (base-batch successor)

_Captured 2026-07-29. Supersedes nothing; succeeds doc-51's base batch. Anchored
at `main` adac7db (post-PR #281). Re-verify anchors before acting on any item._

**Driver (operator, verbatim):** "It's preemptive at this point. I saw how bad
it got and I now wanna prevent the same kind of debt accumulation."

**Thesis.** doc-51 named the disease — precision maximalism: every incident
became a rule, every rule became prose or a parser. The machinery built since
2026-07-17 re-accreted in the same pattern: `bin/` grew 6 files/1,652 lines to
25/14,761 (qq-observe alone 210→5,919 in eleven days), extensions 0→11 files
(2,433 lines), backlog docs 54→128. This wave pays down the new debt and
extends the anti-accumulation machinery to the surfaces that grew uncovered.

**Evidence base.** Five read-only audit reports (2026-07-28,
`/tmp/qq-simplification-audit-2026-07-28/results/`, transient) against
doc-12/doc-50/doc-51 doctrine; owner-verified load-bearing citations.
Metrics retained from doc-51: **cognitive size** (mandatory-read words),
**state size** (independent mutable lifecycle state), **authority rule** (one
correctness owner per invariant). Ratchets snapshot before deletion, lock
downward after.

## Settled decisions (operator, this alignment)

| # | Decision | Record |
|---|---|---|
| 1 | Driver preemptive; prevent re-accumulation | this exchange |
| 2 | Scope: all of qq; mode: base-batch umbrella; PR-278 simplification-shaped findings fold in | this exchange |
| 3 | Delegate runtime rebuilt ground-up as the minimum. Needs: role separation (prompt/tools/model/context), parallel batch, completion-as-artifact, observation-as-records. Everything else pi-subagents does is noise. **Reverses T-154.2** (vendor runtime) — record mints in E3 | this exchange |
| 4 | Dispatch is **blocking** — no async lifecycle, no wake, no inbox | this exchange |
| 5 | Operator channel during runs: **fork-and-chat** (qq-split-fork retained, slimmed) | this exchange |
| 6 | **Confinement deleted** — Git owns isolation; read-only roles are brief + owner verification, not syscall cage. Record mints in E3 | this exchange |
| 7 | Observer at ground-up depth: ledger materialized on read; intake registry dissolved (coverage = backlog search over recurrence keys + Observer-dispositions doc); span core deleted after consumer verification; dual-run machinery expires after five dual runs | this exchange |
| 8 | Observer dispositions doc lives in the **external** backlog store (ruling 5 of #9) | this exchange |
| 9 | **Backlog state migrates** to one operator-level private git store at `~/.local/state/qq/store/`, one subdir per project; code repos keep only a `backlog` symlink. Whole-store move; sync = git-autosync timer (no daemon, no GitHub Flow for state); mount-don't-mirror; doc-48 born-in-worktree convention **retired** (record mints in M3); atomic-PR property explicitly repriced — versioning was valued only for cross-machine access | fork-settled, delivered verbatim |
| 10 | Merge authority, verbatim: "I would rather really allow you to merge everything." Bot-merge authorized for all Changes in this batch plus the capture PR, given green CI + fresh review + verified envelope; operator may merge remotely at will. Batch-scoped opt-out, recorded per the verbatim rule | this exchange |
| 11 | Orchestration runs in a **fresh accountable session** (context space), sequential delivery, no parallel Changes | this exchange |

## The ten Changes (sequential; dependencies are genuine prerequisites)

**Warmup** — proves the loop at trivial risk:

1. **W1 — Ratchet grep-scope fix.** Scope occurrence greps to tracked files;
   regression test. Ratchet is red on the operator machine today
   (`runtime_specific_flags measured=2 budget=0` from gitignored
   `skills/.system/`); CI sees tracked files only. One measurement authority.
2. **W2 — Delete `qq-derive` + its test** (207+155 lines). Zero consumers;
   t-121 RETIRED 2026-07-24 ("no derivation store is built"). Verified.

**Track E — minimal delegate runtime:**

3. **E1 — `qq-delegate` engine + tests.** Manifest→argv (system prompt, tools,
   model/effort read directly from the Repository execution-profile policy —
   mount, don't mirror; Q6 mirror boundary defaults to no-boundary), run dir
   (`brief.md` in, `ENVELOPE.md` out, transcript pointers), parallel batch,
   **blocking** wait bounded by manifest `timeoutMs`. No confinement wrap, no
   receipts, no async machinery. Settles folded finding
   `async-terminal-wake-not-durably-consumed` by construction.
4. **E2 — Migrate roles + skills.** Four manifests to the engine; skills'
   triplicated dispatch recipe (code-review/delegate-batch/research) replaced
   by the one engine call. **Work-order preflight sentence** lands in
   `skills/delegate-batch/SKILL.md:17-19`: owner executes every literal Check
   as written from the target worktree before dispatch. Settles folded finding
   `work-order-literal-checks-not-preflighted`. (deps: E1)
5. **E3 — Remove pi-subagents + confinement machinery.** qq-subagent-env,
   Landstrip wrap in qq-dispatch, `delegation/policies/roles.json`,
   `bin/qq-render-landstrip-policy.mjs`, enforcement tests, receipt dance.
   Propose T-166.2/T-166.3 for retirement. Mint decision records: T-154.2
   reversal, confinement deletion. Settles folded finding
   `confinement-splits-native-and-shell-mutation-authority`. (deps: E2)

**Track M — Backlog state migration:**

6. **M1 — External store + symlink.** Create `~/.local/state/qq/store/`
   (private git), `git mv` backlog content into a `qq/` subdir (code-repo
   history retains all), code repo keeps only the `backlog` symlink, autosync
   systemd timer (pull --rebase / add -A / commit / push). Mint the store
   decision record in the store; this PR cites its id. Risks owned (fork
   record): CLI git side effects vs external data; single-store sync conflicts
   pause all projects (rare, loud); conventional store path dependency;
   atomic-PR property gone for real.
7. **M2 — qq-board collapse.** Worktree aggregation → single-home reads.
   Most of 796 lines + 548 test lines go; fetch-coupling dies. (deps: M1)
8. **M3 — Reaper retarget + born-in-worktree retirement.** qq-reap doc scan →
   store repo (branch/worktree scans stay in code repos); tooling with
   `git add backlog/…` semantics adjusted; doc-48 born-in-worktree prose
   retired; mint the convention-retirement record. (deps: M1)

**Track O — Observer ground-up:**

9. **O1 — Materialize the ledger + delete span core.** Ledger/digest/architect
   context become scans over run analyses; ledger store, high-water, locking,
   crash recovery deleted (~1,140 lines + ~1,183 test lines); span core deleted
   after a consumer-verification pass; package derivatives computed lazily.
   (deps: E1 — consumption moves to qq run dirs)
10. **O2 — Dissolve the intake registry.** Batches/handoffs/attempts/results/
    task-mappings/resolve-task → backlog-search coverage + Observer-dispositions
    doc (in the external store; appended via `backlog doc update --content`).
    qq-handoff.py intake −~600 lines; dual-run machinery expires mechanically;
    observer tests collapse ~60%. **Managed-doc complete-body sentence** lands
    in `CONCEPTS.md` ("generate the complete body and pass it once to
    `backlog doc update --content`"). Settles folded finding
    `managed-doc-body-trim-drops-first-line`. (deps: O1, M1)

## Parked (ruled out of this batch; re-assessed after it lands)

A2 shape pins (operator pin-set ruling) · A3 reaper cadence install · B3
extension slimming (footer quota, pr-watch wake) · B4 reap parser → explicit
IDs · B5 wording-test sweep · B7 cockpit dead state · C1/C3 remaining prose
single-sourcing · C5/Q4 review gate ("non-trivial" vs risk-trigger) · Q6
mirror boundary (E1 assumes none) · Q8 reopenings (T-88 board trash,
`qq-herdr-pull --workspace`) · fork-and-settle as a documented convention.
Several may dissolve on contact with the landed Changes.

The fifth PR-278 finding (`dynamic-tool-callable-but-not-in-visible-inventory`)
is upstream-pi substrate; it stays on the architect track, not this umbrella.

## Non-goals

Herdr itself (shared infra); pi-subagents upstream internals (qq replaces its
own usage, doesn't fork behavior); the Observer/Architect *flow* (proven:
T-176/184/185) — only its registry machinery; cockpit operator-facing function;
doc-51's "Not to cut" list except where a named item above carries an explicit
operator ruling; no merge-queue/daemon/state-store construction (doc-12).

## Success evidence

- Ratchet green on operator machine AND CI with identical answers.
- Every trusted-role delegate run terminalizes truthfully (no more
  completed-but-failed); observer rounds stop showing the four folded
  recurrence keys.
- `backlog` is a symlink; store autosync heartbeats visible; every worktree
  sees identical backlog state.
- qq-observe ≤ ~2,500 lines; qq-handoff.py −~600; observer tests ≤ ~40% of
  current; qq-board ≤ ~200 lines.
- Each PR: green CI + fresh-context review + envelope verified against tree,
  bot-merged under the batch authorization (#10).

## Orchestration rules (binding on the delivering session)

- Sequential only: one Change at a time, one writer per worktree; land each
  before branching the next from updated main.
- Per Change: plan → implement → fresh Checks → fresh-context code review →
  fix deltas → PR → bot-merge when CI green (per #10) → land + retire.
- Delegated implementation uses the current trusted-role path until E1 lands;
  expect the receipt defect to false-fail children at collection — salvage
  structured outputs from the run dir (proven 2026-07-28) and judge the work,
  not the terminal label.
- Any new consequential decision or approved-boundary crossing: stop, record
  it in the umbrella Task, notify the operator (herdr), and hold that Change.
- Operator visibility: one herdr notification per landed Change; a final
  summary when the batch completes or stalls.
- Context pressure: hand off to a fresh accountable session with this plan and
  the umbrella Task; never thin the plan to fit a window.
