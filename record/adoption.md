# The System Must Pay Rent

## A Design for Solo Engineering with Frontier Language Models

*A working design for a single operator - July 2026, Markdown adoption record with rented operator surface trial*

This file is the frozen adoption record. The living specification is the set of
operating files in this repo; subsequent rationale accrues in the loss ledger,
not here. Markdown is the source form because the distribution is the repo, not
a rendered document.

## Abstract

A design for one senior engineer performing serious software engineering at
scale with frontier language models, on the commodity agent harnesses of 2026.
One test governs it: a mechanism means the difference it makes against a stock
harness driven with plain discipline, and a difference that cannot be traced
within a month of ordinary use is grounds for deletion. Six primitives; nine
infrastructure rentals, each argued and each with an exit; every owned
mechanism ships with a falsifiable claim, a one-month test, and a kill
criterion. The central hardening is simple: the operator writes intent and
acceptance, and the worker is not allowed to weaken the gate that clears its
own work. A measurement protocol runs the whole system against its own absence,
with the burden of proof resting permanently on the system. Setup: twenty
hours. System maintenance tax: 1.6 hours per month. The design is forecast to
shrink. The distribution is one git repo: living operating files plus this
frozen Markdown record. No PDF is authoritative.

> "What difference would it practically make to any one if this notion rather
> than that notion were true? If no practical difference whatever can be traced
> ... all dispute is idle."
>
> -- William James, *Pragmatism*, 1907

## 1. The Wager

Everything here is a bet that states its odds. The mission: more shipped
software, more solved problems, more decisions made well - in your real
projects, which are not the system - with frontier models on the commodity
harnesses of 2026, at maintenance as close to zero as the physics allows.
James's test governs all of it: a mechanism means the difference it makes
against a stock harness driven with plain discipline, and if no difference can
be traced within a month of ordinary use, the mechanism goes - whatever it cost
to build. Elegance is not a survival trait here; neither is the feeling of
rigor.

Two facts about you rank as design inputs. Your tooling historically becomes
its own workload, and the displacement feels like diligence from the inside -
so nothing here may depend on your restraint. And you are drawn to guarantees,
even where they armor a wall nobody was attacking - so rigor is a budget, spent
where losses occur, not where proofs are prettiest.

## 2. Six Primitives

Six concepts, each forced by the mission or a constraint it implies. Nothing
else earned a place.

**The unit of work.** A written intent plus machine-checkable acceptance, one
plain-text file per unit, in the target repo. Intent and acceptance are
operator-authored; once the unit leaves `queued`, they are frozen. Unattended
hours need a definition of done that needs no human, and the builder must not
write the test that clears its own work. After-the-fact audit needs the why to
be durable; one file per unit lets concurrent lines converge by ordinary git
merge.

**The verifier ladder.** Ranked by decorrelation: execution against reality
(builds, tests, staging probes); authorless inputs (property-based tests,
fuzzing, deterministic simulation for concurrency); adversarial review by a
different model family, given only intent and diff, never the transcript;
same-family review, worth nothing for correctness, permitted for style. Sampled
human audit sits outside the ladder and verifies the verifiers. The ordering
rests on a plain fact: model families share corpora, benchmarks, and tuning
fashions, so a second family is a weaker witness than a passing test.

**Autonomy by default, with a hard floor.** The machine proceeds on everything
internal and reversible - git revert exists. It stops only at the floor:
spending, publication, obligations, hard-to-reverse actions, or any case where
the machine catches itself arguing that none of those apply. Floor items land
as cards in the rented operator work surface when that trial is active,
or in `operator-queue.md` when no rented surface is active - never as a demand
to read GitHub's shape of the work. The floor encodes values, not
capability; it is the one piece expected never to die. Autonomous merge to
`main` is the default for solo internal work, but only while `main` is itself
internal: if the merge deploys, bills, notifies, migrates, publishes, or
otherwise leaves the project, the autonomous target is an integration branch.

**Two ledgers.** A loss ledger - what happened, estimated cost, which layer
failed - and an autonomy ledger of every escalation outcome and every audited
autonomous decision. The sampled audit also records whether you could explain
the change and its likely failure mode cold. These ledgers are the system's
only memory about itself, and the only legal grounds for changing it.

**One project memory file per repo, with a candidate surface.** Human-curated,
capped near two hundred lines, edited in place: the memory file is the truth,
git history the archive, so superseded knowledge is simply absent. The machine
may propose memory candidates, but candidates are not loaded as truth until the
operator promotes them. Vendor memory may be used as disposable cache; it does
not become source of truth until it is repo-resident, diffable, reviewable,
clearable, and injected by a relevance rule the operator can inspect.
Transcripts are disposable.

**The change gate and the shrink review.** No system change without a cited
loss-ledger entry; one change in flight at a time; a do-nothing ideas file
absorbs the urge to tinker. Quarterly, one hour: delete first, check what
became rentable, read the ledgers, adjust policy. Policy edits pass the gate
too - legitimate only when they retire more attention than they add; the
ledgers are data and may grow, the mechanism set may not. One admission, made
plainly: no gate a solo operator builds can bind him, so the gate's job is
evidence, not prevention - bypasses are logged and first on the quarterly
agenda.

## 3. The Rented Inventory

Rent everything the market maintains - and name each rental, its job, the case
for renting, and the observation that ends the lease, because a rental without
an exit is ownership with worse terms. Nine rentals, then three refusals.

### 3.1 Frontier models, from at least two vendors

**Job.** All generation, review, and repair - the capability layer everything
else routes.

**Why rent.** Capability depreciates fastest: vendors amortize training across
millions of users, and no owned scaffold competes with next quarter's model.

**Switch.** Price shock or instability at the primary; the twice-yearly
portability test keeps the second vendor a day away.

### 3.2 The harness execution sandbox

**Job.** Makes autonomy-by-default survivable: a wrong action is contained, not
committed.

**Why rent.** A security boundary is adversarial software needing continuous
patching; one person maintaining their own ships a sandbox, not software. The
floor covers what a sandbox cannot: actions permitted but never silent.

**Switch.** A documented escape, or weakened isolation, demotes that vendor.

### 3.3 Isolated worktrees with automatic cleanup

**Job.** Concurrent lines that cannot corrupt each other's working state.

**Why rent.** Harness-native; the hard part is the janitorial edge cases -
crashes, orphans, cleanup - exactly the code that rots unmaintained.

**Switch.** None foreseen; table stakes across vendors.

### 3.4 Subagents, fan-out, scheduling, recurring runs

**Job.** Parallelism and unattended batches - the Monday fan-out of Section 6.

**Why rent.** Vendors compete on this, so it improves while you sleep; anything
you write here depreciates at the market's pace. The design keeps a one-line
alias only as a temporary adapter.

**Switch.** The alias dies the day invocation is one native command or the
harness can consume a directory of unit files without glue.

### 3.5 The cloud execution tier, returning pull requests

**Job.** Hours-long unattended runs off your machine, converging as pull
requests.

**Why rent.** Queueing, retries, and artifact plumbing are undifferentiated
heavy lifting - and the pull request is the interoperability layer, plugging
into git, CI, and reconstruction with zero adaptation.

**Switch.** Cost per merged unit exceeding local execution for your actual mix.

### 3.6 Git hosting and hosted CI

**Job.** The load-bearing rental: git is the shared record and the concurrency
control - lines converge by merge; hosted CI runs every unit's acceptance with
no human present; together, the durable audit substrate.

**Why rent.** Merge is the most battle-tested convergence protocol in
existence; the owned alternative is a worse database. Also the most
vendor-neutral piece in the stack - portability lives here, not in anything a
harness vendor controls.

**Switch.** Effectively never: plain files in repos migrate in an afternoon,
which is itself the argument.

### 3.7 Rented operator work surface: Linear + Warp/Oz + GitHub

**Job.** One visible work lifecycle: planned, running, blocked, and done work;
pending floor decisions; live or completed agent runs; PR and CI state; and
the project documents needed to operate or resume. Linear owns the work card
during the trial; Warp/Oz starts cloud agent sessions and exposes jump links;
GitHub holds branches, pull requests, diffs, and CI.

**Why rent.** The work-surface and cloud-agent layer is depreciating as fast as
the models. Owning it would recreate the custom-window tax from earlier
systems. The useful primitive is not terminal rendering; it is start work, see
that it is running, jump to it, and see where it landed. The market can now
supply enough of that loop to test before building.

**Authority.** Trial lean: tracker-primary for lifecycle, repo/GitHub-primary
for durable engineering facts. Linear may hold `ready`, `running`, `blocked`,
`done`, and pending decision cards. GitHub holds branches, PRs, diffs, and CI.
Repo files hold policy, acceptance, memory, ledgers, and this record. Resolved
decisions must land in a unit, memory file, or ledger before the card closes.
Warp/Oz session links are handles only.

**Switch.** Demote to GitHub Projects/Agent HQ or to the repo-first queue if
session links are unreliable, decisions disappear into vendor chat,
Linear/GitHub/repo state diverges in ordinary use, export or API access is
insufficient for reconstruction, or upkeep exceeds the attention saved. Build
only after two rented surfaces fail the same measured loss.

### 3.8 Skills packaging

**Job.** Carries the conventions - policy, templates, routing - into any
session on any vendor without pasting.

**Why rent.** The format is community-maintained across harnesses, and the
payload is plain markdown, so a vendor without skills support degrades to
paste.

**Switch.** Format fragmentation: fall back to markdown and lose only
convenience.

### 3.9 Verification tooling

**Job.** Property-based testing, deterministic simulation, proof toolchains -
the ladder's upper rungs.

**Why rent.** All mature, cheap, and collapsing in labor cost; building them
solo is rigor as artifact instead of rigor as spend.

**Switch.** Each rung carries a kill criterion in Section 5: no unique catches
in a quarter and it leaves the routing table, rented or not.

### 3.10 Three refusals, for cause

**Autonomous multi-agent orchestrators.** Immature and unstable - a maintenance
tax in the one currency this design lacks - and a second, flakier coordination
layer atop git and CI, which already converge. Revisit when one has been stable
for a year and inspectable through files.

**Owned orchestration dashboards and bespoke interface runtimes.** The
interface lesson from earlier systems was real, so a rented operator surface is
now admitted. What remains refused is owning the cockpit: a TUI, daemon,
database, or dashboard that becomes a second source of truth. A page is fine;
hidden authority is not. Nothing may require synchronous watching, and this is
still the most attractive tinkering object in the catalog.

**Vendor memory as source of truth.** Rented hidden state is still hidden. Use
vendor memory only as a disposable cache unless it competes honestly with the
project memory file: plain, diffable, reviewable, clearable, and injected by an
inspectable relevance rule. The first acceptable form is not "the model decides
what to remember"; it is a whitelist of candidate lines the operator promotes
or cuts.

The watch runs both directions, quarterly: delete what the market now
maintains; flag what has turned unstable or expensive. Every rental above has
its exit - that is what distinguishes renting from dependence.

## 4. The Owned Remainder: Two Thin Layers

Everything not in Section 3 is one of two layers, both plain text, both in git.
No owned orchestrator, no custom dashboard, no daemon, no database, no memory
service - on the arguments just given. The earlier interface idea survives as a
rented operator work surface plus a portable decision fallback, not as owned
runtime code.

**Files.** Per project repo: a `units/` directory - one file per unit, holding
an intent of at most fifteen lines, acceptance as commands that must pass, a
blast-radius flag of `internal` or `floor`, and a verifier class - plus the
operator-queue fallback, the memory file, a memory-candidates file, a
measurement CSV during trial months, and standard CI. In one small
system repo: the policy file, the two ledgers, the ideas file, the quarterly
checklist, the unit template, the tiny tools, and `record/adoption.md` as the
frozen rationale.

**Glue.** Under three hundred lines total: the change-gate hook, the unit guard,
the audit sampler, and a fan-out alias. The line count is checked at each
review; growth is a loss.

**The operator work surface.** The interface was a genuinely good idea at the
level of taste and ergonomics: one place shaped for work and decisions, not a
forced tour through GitHub, terminals, and chat transcripts. The wrong
inheritance is the custom window. The first trial rents the surface from
Linear + Warp/Oz + GitHub: Linear shows work cards and pending decisions,
Warp/Oz starts and exposes cloud agent sessions, and GitHub remains the code,
PR, diff, and CI substrate. The surface should show work, session/run handles,
branch/PR/CI state, decision cards, and project documents, with one primary
action from each item. It need not render terminals; conversational work may
stay in the terminal. `operator-queue.md` is the portable fallback/export shape
for unresolved decisions, not a shadow queue. Resolved decisions are captured in
the unit, memory file, or ledger before the card closes; vendor chat is never
the only archive.

**One living home per fact.** The spec and the argument split. Spec facts live
in the operating files above - loaded into every session and executed daily, so
they cannot drift from practice - and each rule carries a one-line reason,
because a rule with its reason generalizes while an argument in an agent's
context costs tokens and invites reinterpretation of the rule it defends.
Rationale facts live in two places that need no maintenance:
`record/adoption.md`, frozen at adoption as the decision record, and the loss
ledger, which accrues the why of every change from day one. Rented lifecycle
state is allowed only when named as such and covered by an exit; durable
engineering facts still land in repo files, git, CI, or ledgers.
Provenance can be cited as a footnote but not depended on at runtime. Nothing
about the system is stated twice in living form, and one test assigns every
fact its home: read to operate, it is spec; read only to build, resume, or justify, it is record.

**The life of a unit.** You write intent and acceptance in a unit file, or in
a Linear issue that creates the unit file before dispatch; while status is
`queued`, you may refine either. Dispatch from the surface moves the work out
of `queued`, locks intent, acceptance, blast radius, and verifier class, and
starts the chosen local or cloud agent. A Warp/Oz run, or another rented agent
run, implements in an isolated worktree; acceptance executes there as a fast
check, then CI runs the same operator-authored acceptance and routed
verification on the merged candidate tree. CI-green work merges to `main`
autonomously when `main` is internal and reversible. If `main` has external
side effects, the green result lands on an integration branch and promotion
waits at the floor. The sampler may later pick the work for audit. Failures
park as blocked; floor conditions land as rented-surface cards or, without the
trial, in `operator-queue.md`; nothing pages. A month of neglect corrupts
nothing and spends nothing - safe to ignore, in the strict sense.

**Reconstruction.** For any outcome: intent, diff, CI and verification logs,
and the escalation record if one exists - the complete why, readable cold,
never in real time. Audit is sampled, so throughput is never capped by your
reading speed. The audit also asks whether you can explain the change and its
likely failure mode without rereading the transcript; if not, the defect is in
expertise preservation, not merely in code quality.

**Where rigor is spent.** The losses that matter are plausible-but-wrong work
passing friendly checks, so the strongest verifiers attach to units with weak
acceptance, not to layers where proofs are satisfying. Formal verification
enters only through a loss entry naming a loss it would have caught:
concurrency and crash losses buy deterministic simulation; invariant losses buy
property-based tests; full proof is reserved for small, specifiable kernels
whose failure is expensive.

**Abandonment and return.** After months away: the memory file, the unit
states, the escalation queue - under thirty minutes per project. Total
abandonment degrades cleanly to the stock harness; nothing in ordinary work
depends on the system repo.

## 5. Every Mechanism, with Its Death Written In

A mechanism that cannot state its own kill criterion is a belief, not a tool.
Every claim is relative to the stock 2026 harness driven with plain discipline;
every test fits inside a month of normal use.

### 5.1 Unit files: intent plus machine-checkable acceptance

**Claim.** Fewer mid-run interventions and fewer thirty-day defect flags than
ad-hoc prompting.

**Test.** The trial month of Section 7: interventions and defect flags, system
arm against stock arm.

**Kill.** Differences within noise: drop the format and prompt ad hoc.

### 5.2 Acceptance lock and unit guard

**Claim.** Operator-authored acceptance prevents the worker from weakening the
gate that clears its own work, without reintroducing routine review.

**Test.** Red-team a stock agent under time pressure and log attempted edits to
Intent, Acceptance, blast radius, or verifier class after dispatch. Count CI
unit-guard failures during the trial month.

**Kill.** If agents never attempt protected edits for two quarters, the guard
may become a CI warning; if protected edits ever land silently, the guard
becomes non-negotiable and the class is promoted.

### 5.3 Merged-tree acceptance

**Claim.** Green-in-fence and green-on-merged-tree diverge often enough to make
merged-tree CI mandatory.

**Test.** Count failures that passed inside a worker fence but failed on the
merged candidate tree.

**Kill.** Never delete globally while autonomous merge exists; narrow only for
spec-only units with no executable side effects.

### 5.4 Acceptance-gated autonomous merge

**Claim.** Removes the human from the merge path with no rise in regressions.

**Test.** Regressions traced to autonomous merges versus reviewed ones,
separating internal `main`, integration branch, and externally-triggering
`main`.

**Kill.** Regression cost exceeds attention saved: reinstate review for that
class or branch target only.

### 5.5 Verifier ladder and routing

**Claim.** The upper rungs catch defects that plain execution passed.

**Test.** Log every catch by rung for a month.

**Kill.** Any rung with zero unique catches in a quarter leaves the routing
table.

### 5.6 Escalation floor and queue

**Claim.** Zero silent commitments of external resources; near-zero ceremony
elsewhere.

**Test.** Floor breaches, which must be zero; escalations per week, which
should fall.

**Kill.** The floor is never deleted; escalation classes are demoted as the
autonomy ledger directs.

### 5.7 Autonomy ledger with sampled audit, starting at ten percent

**Claim.** Identifies, empirically, the judgment classes where your involvement
changes outcomes.

**Test.** Rate of changing escalated decisions; regret rate in audited
autonomous ones; rate of `could_explain_cold=no` on audited work.

**Kill.** Two consecutive quarters with no policy change: keep the floor,
delete the ledger except for the sampled audit fields still feeding the trial.

### 5.8 Project memory file and candidate whitelist

**Claim.** Human-curated memory reduces incidents of an agent re-deriving or
contradicting settled decisions, while a candidate surface captures useful
machine discoveries without making hidden state normative.

**Test.** Count such incidents with and without the file. For candidates,
measure promotion rate and later usefulness; candidates that never promote are
noise.

**Kill.** Incident rate unchanged: delete project memory. Candidate promotion
rate near zero for a month: delete `memory-candidates.md`. Past two hundred
lines: prune before anything else.

### 5.9 Loss ledger and change gate

**Claim.** Meta-work happens only in response to demonstrated losses; system
maintenance tax stays under budget.

**Test.** Hours per month in the system repo; count of gate bypasses.

**Kill.** Routine bypassing or junk entries mean the gate failed: freeze the
system outside a quarterly window.

### 5.10 Quarterly shrink review

**Claim.** The system gets thinner by intent, not hope.

**Test.** Mechanism count and glue line count, trending flat or down.

**Kill.** Two consecutive reviews deleting nothing while the system grew:
freeze, rebuild from stock.

### 5.11 Rented operator work surface

**Claim.** Linear + Warp/Oz + GitHub preserves the genuine usability win of an
operator-shaped interface - visible lifecycle, one-click session jump, PR/CI
and document links, and decision cards - without owning the cockpit.

**Test.** During the trial month, track time from deciding to start work to a
visible run, time from opening the surface to jumping into the relevant
session, lost or stale sessions, decisions handled outside the surface,
Linear/GitHub/repo status divergences, and maintenance minutes spent on the
surface. Review at the quarterly shrink review.

**Kill.** If the surface duplicates files, hides decisions in vendor chat,
creates state divergence, fails to make session jumps reliable, or does not
save attention against the repo queue or stock harness, demote it. Build only
after two rented surfaces fail the same measured loss.

### 5.12 Split context: lean policy for the machine, a frozen record for the human

**Claim.** Agents perform no worse on one-line-reason policy files than with
rationale prose in context, at lower token cost; the human resumes faster from
the frozen record plus the ledger than from the spec alone.

**Test.** One month, both context styles across comparable units:
interventions, defect flags, tokens per merged unit; at the next real resume,
note which artifact you actually reach for.

**Kill.** If judgment-heavy classes demonstrably need the why, promote those
reasons into the policy file as explicit one-liners, never essays; if the
frozen record goes unread at resume, retire it and let the ledger stand alone.

## 6. A Normal Week

| When | What |
|---|---|
| Mon 09:00-10:00 | Direction hour. Write or refine three to six units with acceptance criteria; set priorities in the operator surface; start the selected agent runs. Replaces prompt-writing you would do anyway. |
| Continuously | Unattended: runs appear and disappear in the surface; lines implement in isolated worktrees; acceptance and routed verification run; green units merge or land on the integration branch; blocked units and floor items queue silently. |
| Daily, one batch, 15 minutes or less | Handle the operator surface: floor items plus ledger-promoted classes. `operator-queue.md` is used only as fallback/export. Deferrable without cost. |
| Tue-Thu | Your actual work - the hard problems, interactive, in the stock harness or terminal agent session. The surface manages lifecycle; it does not need to intermediate conversation. This is where the week's hours go, by design. |
| Fri 16:00-16:30 | Sampled audit: roughly a tenth of the week's landed units, reconstructed from intent, diff, and logs; verdicts to the autonomy ledger, losses to the loss ledger; mark whether you could explain the change cold. |
| Fri 16:30-16:45 | Grooming: unblock or kill parked units; promote or cut memory candidates; reconcile surface, GitHub, and repo state; clear resolved cards; queue next week. |

Operating cadence: two to two and a half hours a week, mostly replacing review,
prompting, and session hunting you would do anyway. System maintenance tax:
edits to the system repo, rentability review, and loss-driven fixes; budgeted separately in Section
9. What escalates: floor conditions and ledger-promoted classes,
asynchronously, nothing else.

## 7. Measuring the System Against Its Own Absence

Systems like this are almost never measured against their own absence. This one
starts there, during a normal month of work, by one person. Stratify the
month's tasks by class - feature, bugfix, refactor, research - and within each
class assign alternately to the system arm or the stock arm by creation-order
parity: deterministic, no cherry-picking. Stock means the bare harness with
plain discipline: a good prompt, your own review.

One CSV row per task at merge, five minutes at most. Required columns:
`unit_id`, `class`, `arm`, `operator_minutes`, `calendar_hours`,
`agent_minutes_or_cost`, `interventions`, `merged`,
`thirty_day_defect`, `rework_minutes`, `value_note`, and
`could_explain_cold`.

The extra fields exist to prevent false wins. Operator minutes saved are not
value shipped; calendar time can improve while rework worsens; concurrent
agents make raw speed hard to interpret; and a task that merged but left you
unable to debug the code cold may have borrowed from future judgment.

Analysis: per-class medians, task-level notes, and a pre-registered
keep/shrink decision. Use a sign test only if there are enough comparable
classes or enough tasks per class; otherwise treat the evidence as descriptive,
with ambiguity defaulting to shrinkage. The decision rule is asymmetric: the
system stays only if it clearly wins on operator minutes, defect rate, or value
preserved in a majority of classes without losing badly in any; otherwise the
weakest mechanisms die by their Section 5 criteria and the trial reruns next
quarter. The burden of proof sits on the system, permanently. The sample is
small and tasks are not identical - which is why thresholds are coarse and
ambiguity defaults to shrinkage. And the apparatus is itself meta-work in a lab
coat: month one, then annually, otherwise only when a ledger loss triggers it.

## 8. The Obsolescence Forecast

Deletion is graduation; the first agenda item of every quarterly review is
what to delete.

**Within twelve months.** The fan-out alias is on death watch from adoption: it
survives only until the chosen harness or rented operator surface can consume a
directory of unit files or a task list without glue. Cross-family review glue
also disappears when a vendor exposes inspectable, exportable review state with the transcript kept
out of view. Unit templates shrink if harnesses learn to treat operator
acceptance as a first-class artifact rather than prompt text.

**Twelve to twenty-four months.** Verifier routing shrinks once two consecutive
quarters show upper rungs catching nothing execution missed. The audit sampler
shrinks if vendor audit surfaces become inspectable and exportable. The rented
operator surface shrinks or swaps if GitHub, an agent vendor, or the terminal
market offers the same work/session/decision/document loop with less state
drift. The operator queue remains only as an exit format unless no rented
surface pays rent. The memory candidate file dies if a vendor or harness offers
the same whitelist workflow as plain repo state with operator-controlled
clearing and relevance injection.

**Expected to persist.** The floor, because values are not capability; the
loss ledger and change gate, because they govern the operator, not the model;
the project memory file, unless the market offers the same thing as plain
repo-resident state; a rented work surface only if it keeps paying rent; the
measurement protocol. End state at twenty-four months: one policy file, two
ledgers if still paying rent, one memory file per project, a rented review
surface or an exit file only if still useful, glue near zero.

## 9. Budgets, Stated So They Can Be Wrong

Setup: twenty hours, two and a half working days. Policy file and floor list,
two hours; unit template, operator-queue fallback, unit guard, and one repo's
acceptance CI, five; gate hook and sampler, two; skill packaging with a
second-vendor smoke test, four; rented operator-surface trial - Linear project,
GitHub integration, Warp/Oz environment, issue templates, document links, and
one fallback agent smoke test - five; trial scaffolding, one; slack, one. Wrong
if setup passes three working days: stop there, run stock, and record the
overrun as the design's first loss-ledger entry.

System maintenance tax: about 1.6 hours a month. Quarterly review amortized
to a third of an hour; loss-driven fixes, half; policy edits, a quarter;
rented-surface drift and integration upkeep, half; the rentability watch lives
inside the review, and the decision record costs nothing, because it is
frozen. Wrong if it exceeds two hours a month for two
consecutive months: recorded as a loss against the design itself, and the
options are freeze - stock harness plus the floor, nothing else - or rebuild.
"Try harder" is not on the list.

Operating cadence is not the maintenance tax. Direction, escalations, sampled
audit, and grooming may total two to two and a half hours a week, but they are
charged against the prompting and review they replace. If they stop replacing
real work and become additional ceremony, the loss ledger gets the entry.

## 10. Eight Open Decisions

Tensions the evidence does not yet settle, each with a lean and the observation
that flips it. They are yours.

**Audit sampling rate.** Too low misses drift; too high rebuilds the
synchronous governor. Lean: ten percent, halved after two consecutive clean
months; any audited regret resets it.

**Cross-family review.** A second family is a weak witness, and the review is
not free. Lean: off by default, on for units whose acceptance cannot be
machine-checked; flips if the trial month shows that rung making unique
catches.

**Cross-project memory.** Relearning is a cost; hidden shared state is a worse
one. Lean: per-project files only; flips when one loss recurs three or more
times across two or more projects - a ledger entry funding one small shared
file, and nothing more.

**Vendor memory whitelist.** The first acceptable foray is a candidate list,
not automatic hidden retention. Lean: vendor memory may propose candidate lines
only; flips when the workflow is repo-resident or exportable, diffable,
clearable, and demonstrably lowers re-derivation losses without adding
maintenance.

**Second vendor: warm or tested.** Keeping two vendors warm is standing
meta-work. Lean: the twice-yearly portability smoke test is enough; flips on
primary-vendor instability or a pricing shock.

**How much measurement.** Measuring can feel like diligence from the inside.
Lean: month one, then annual, otherwise loss-triggered; flips if a quarter
arrives in which the ledgers cannot say whether the system is paying rent.

**Rented operator surface authority.** The old interface was a real usability
idea: one operator-shaped surface beats scattered GitHub, CLI, terminal
sessions, and chat review. Lean: Linear + Warp/Oz + GitHub for the first trial.
Linear owns work lifecycle and pending cards; GitHub owns code, PRs, diffs, and
CI; repo files own policy, acceptance, memory, ledgers, and this record; Warp/Oz
links are session handles only. Flips to GitHub Projects/Agent HQ, another
rented surface, or the repo-first queue if links are unreliable, state diverges,
decisions hide in vendor chat, or the surface fails to save attention. Build
only after two rented attempts fail the same measured loss.

**Autonomous merge to main.** The risk is merged internal regressions; the
alternative is a governor. Lean: CI-green merges land autonomously on internal
`main`, because internal main is cheaply reversible; flips per class, not
globally - any class whose audited regression cost exceeds the attention cost
of reviewing it gets a review gate, alone. If `main` has external side effects,
this is not the decision: promotion is already at the floor.

## On Names

There are none. Unit file, verifier ladder, floor, ledgers, memory file,
change gate, shrink review - the descriptions are the names, and vocabulary
hardens structure before the structure has earned it. If a part ever seems to
deserve a proper noun, it has grown enough to be questioned at the next review.
