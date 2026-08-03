# Observer v1 procedure — four required learning lenses

The Observer is a read-only harness analyst. It audits one assigned
`qq-observer.package`, proposes the smallest resulting-system remedies, and
never applies a proposal. Deterministic facts and signals are the audit skeptic,
not the analyst's agenda.

New successful output uses `qq-observer.analysis` **v2**. Finalized v1 analyses
and v2 Change packages are immutable historical evidence and remain readable;
they are never rewritten into the new contract.

Named limits:

```text
FULL_READ_MAX_BYTES = 400000
ACCOUNTABLE_SESSION_MAX_BYTES = 16777216
```

## Audit units and lifecycle

A v3 guided package has exactly one `audit_unit`:

- `delivered_change` binds Repository, PR, branch, merge commit, merge time, and
  Change-bounded accountable plus whole delegate transcript copies. Its run is
  `runs/by-repository/<owner>/<repo>/pr-<N>/`.
- `accountable_session` binds one retired Architect or Coordinator Pi v3
  transcript by canonical source path, byte count, entry count, and SHA-256.
  The original is the authority; the package contains **no transcript copy**.
  The unit is the whole session from its header because no authoritative
  activation marker exists. No caller-selected start/end flag or range is
  accepted. Its Repository-qualified run name is deterministic and distinct
  from PR runs.

`qq-observe retire-session` is the one retirement-facing seam. It accepts only
a verified retirement receipt: role identity agrees, succession is ready,
zero or one compaction is present, the session is frozen whole, and pane
closure is declared independent. The first compaction starts replacement and a
second is forbidden; retirement may also occur at an earlier eligible
boundary. The role boundary is explicit: an Architect has drained only its
current alignment transaction; a Coordinator completed the atomic swap after
continuing coordination (admission paused only for that swap). It packages
first and uses `qq-delegate start --role observer`, returning as soon as the
headless dispatch is accepted. Replacement availability and pane closure are
external succession responsibilities and never wait on Observer analysis.
The command is idempotent for an identical trigger and rejects a conflicting
duplicate. Missing, malformed, linked, oversized, contradictory, prematurely
closed, range-selecting, or multiply compacted input records a canonical
`analysis_failed.json` rather than leaving a plausible pending run. Dispatch
setup failure does the same.

No Task or Change is required for an accountable-session package. Thus a
no-Task/no-Change Architect or Coordinator session remains analyzable.

Lifecycle is a projection, never another event store:

- a valid `package.json` without a terminal record projects `started`;
- a valid `analysis.json` projects `completed`; and
- a canonical `analysis_failed.json`, invalid binding, or contradictory terminal
  records project `failed`.

`qq-observe session-status` and `architect-context` expose that projection.
A semantic failure is a Trustworthiness health fact: it makes all four semantic
lenses unavailable, but does not discard the immutable package identity or
independently reproducible transcript facts.

## Division of labor

- **Deterministic `qq-observe facts`** owns complete-session turns, tokens, tool
  calls, durations, reasoning, compactions, `/bro`, communication-phase
  triggers, and `operator_ask` fires. Its `skill_evidence` lists alignment,
  realignment, operator-facing trigger/fire entries, repair entries, and
  compactions without judging whether firing was required.
- **Deterministic `qq-observe signals`** emits conservative structural signals
  with 1-based physical transcript citations and does not infer intent.
- **Observer LLM** reads first, walks the seam and four lenses, finds root
  causes, and proposes remedies grounded in cited package evidence and facts.
- **Deterministic validator/finalizer** checks schema, identity, binding,
  citations, cost, four lenses, Fidelity walks, and taxonomy exceptions. It
  rejects a broken analysis whole and is the sole writer of terminal Observer
  records.

## Phase 0 — integrity, facts, and reading mode

Load every package member. Require `variant: guided`. For an external-bound
session, recheck canonical path, regular-file identity, byte count, entry count,
and SHA-256 before analysis and again at finalization. Derive one facts and one
signals file per packaged session into analysis scratch. Pass every facts file
to `validate-analysis` as `--facts SESSION=FACTS`. Do not persist facts or
signals in a second store.

At or below `FULL_READ_MAX_BYTES`, full-read every transcript. Above it, use
faceted reading: every head and tail, every operator exchange needed by the
walks below, complete-session fact outliers, and—only after candidates
exist—every signal window. Name the mode in `limitations`. The accountable
session's 16 MiB binding cap is a hard refusal, not a reason to select a
favorable range.

If a required member, receipt, source binding, schema, derivation, or citation
is missing, contradictory, malformed, oversized, or mutated, finalize only a
specific `analysis_failed` record. Never salvage semantic findings from a
broken package.

## Phase 1 — reading first, seam walk, and skill evidence

Form specifically named candidates from reading before consulting signals.
Each evidence object cites exactly one physical transcript entry and a
non-empty whitespace-normalized verbatim quote of at most 200 characters.
Reasoning may explain an understanding; only outcome evidence establishes an
external result.

Classify every user entry and operator-directed request tool call as clean or
as an existing `operator-seam.*` class. Unclassifiable exchanges go in
`limitations` with session and entry. Reconcile every signal after the initial
candidate set: absorb it into a candidate or record one `dropped_signals`
reason. Set `no_signal: true` on retained findings with no matching signal.

Read `facts.skill_evidence` for **every** packaged transcript and judge, under
Fidelity and in this exact order:

1. alignment;
2. realignment; and
3. operator-facing asks or proof/judgment delivery.

A phase's mechanical trigger or absence of an `operator_ask` fire is evidence,
not a verdict. Decide whether the communication contract required a fire,
whether a fire occurred in the wrong phase, and whether `/bro` was an explicit
repair. A required no-fire or wrong-phase fire is primarily Fidelity. Do not
add a recorder or read a separate communication-moment log.

## Phase 2 — exactly four required lenses

Emit these top-level lens rows in exactly this order:

1. **Simplicity** — is this the smallest resulting system, with unique
   functions and the fewest owned entities and lifecycle obligations?
2. **Fidelity** — did the unit honor the operator-aligned outcome, decisions,
   boundaries, role contract, realignments, and promised proof?
3. **Trustworthiness** — are evidence, durable truth, reliability, recovery,
   safety, authority, and boundary behavior honest and dependable?
4. **Efficiency** — what waiting, rework, context, tool, compute, storage, or
   operator-attention cost can be removed without weakening the first three?

Each status is exactly `clear`, `finding`, or `unverifiable`. `finding` means
one or more retained episodes name that lens as `primary_lens`; the validator
requires exact agreement in both directions. `unverifiable` requires a
specific `unverifiable_reason` and may cite the contradiction; absent evidence
is never converted to a plausible pass. The statuses are not scores and are
never weighted or collapsed.

Every retained episode has exactly one `primary_lens`, selected by the failed
operator-owned objective. Secondary effects stay in reasoning; do not duplicate
the episode under another lens. Existing v1 `kind`, open-text root cause,
root-cause location, open-text smallest remedy, confidence, cost, and recurrence
key remain.

### Simplicity: entity/function/authority/state/lifecycle first

Before proposing a remedy, inventory every role, record, state, status, queue,
schema, projection, service, process, tool, view, authority, and lifecycle
introduced or retained. For every `entity_audit` row name its function, sole
authority, state, lifecycle cost, evidence, and assessment: `necessary`,
`duplicate`, or `unverifiable`. Ask whether an existing owner already performs
the function, whether it can be lazily derived, whether it duplicates truth or
reconciliation, and what creation/migration/retention/recovery/deletion cost it
imposes. A `duplicate` requires a primary Simplicity finding.

### Delivered-Change Fidelity: ordered alignment-integrity walk

Walk these rows in order, each with citations:

1. `alignment`: Task outcome, acceptance criteria, Definition of Done, approved
   plan, and decision ledger;
2. `realignments`: every recorded reopening and operator disposition;
3. `execution`: work orders, execution choices, and delegate envelopes;
4. `review`: findings and in-scope fixes;
5. `merged_outcome`: the delivered tree and behavior; and
6. `promised_proof`: the exact promised Checks/evidence.

Classify each row/material difference as
`legitimate_agent_owned_detail`, `genuine_realignment`,
`silent_stakes_drift`, `foreseeable_stakes_drift`, or `unverifiable`.
Legitimate detail is inside the settled boundary among cheap/equivalent
options. Genuine realignment stopped mutation, obtained operator disposition,
and durably resumed the same Change. Silent drift changed outcome, proof,
foundation, undo cost, or operator commitment without disposition. Foreseeable
drift left a visible Alignment stake for execution to settle silently. Honest
realignment is Fidelity, not failure. Missing binding evidence is
`unverifiable`; plausibility is not evidence.

### Accountable-session role Fidelity

For an Architect, walk in this exact order:

- stakes clarity;
- ask comprehensibility;
- timing and truth of Alignment (including premature or false Alignment);
- operator decisions and omissions;
- scope control/creep; and
- correction after non-alignment or misunderstanding.

For a Coordinator, walk in this exact order:

- admission;
- authority;
- overlap;
- recovery;
- handoff;
- pipeline; and
- retirement.

Each row is `conformant`, `violation`, or `unverifiable`, with cited reasoning.
The audit covers the whole accountable session, including one that produced no
Task or Change.

### Trustworthiness and Efficiency

Trustworthiness checks source/result agreement, silent failure, authority
contradictions, append-only/rebuild guarantees, review independence, recovery,
stale state, safety boundaries, and honest claims. Efficiency measures the
complete applicable flow: waiting, blocked/paused time, repeated work, context
pressure, calls, compute, storage, and operator attention. It cannot recommend
a faster route that weakens Simplicity, Fidelity, or Trustworthiness.

## Phase 3 — axial coding, cause, remedy, and cost

Merge candidates sharing one episode; split conflated causes; drop candidates
whose citations do not support them. Record those operations briefly in
`limitations`. Find the smallest supported harness cause. Reuse a recurrence
key only when root machinery matches the dispatch inventory. Propose one
smallest-resulting-system remedy and apply nothing.

Episode cost remains grounded in complete-session facts:

- turns = sum of all `turns_by_role` values for episode sessions;
- tokens = sum of input + output where usage records exist (unchecked only if
  none of those sessions has any usage record);
- duration = exact sum of `wall_clock.duration_ms`; and
- source = exactly `facts:<episodes.sessions[0]>`.

Duplicate sessions and values above 10^15 are refused. Emit at most five
classified episodes.

## Narrow taxonomy-repair exception

The four lenses are exhaustive by default. At most one top-level
`taxonomy_exception` may be emitted **outside** findings/lens statuses only
when all of these are cited and validated:

1. a named operator-owned objective from a Task or decision;
2. material effect on the resulting system;
3. four ordered, non-empty explanations for why Simplicity, Fidelity,
   Trustworthiness, and Efficiency each do not fit; and
4. a stable lowercase recurrence key, evidence, root cause, and smallest remedy.

It has no `primary_lens`, is not a finding, is not `other`, taste, a broad v1
kind escape, or a fifth lens. Its key may not duplicate a classified finding.
If the key already exists in the Observer corpus, finalization refuses another
exception: recurrence reopens the four-lens contract for operator alignment.

## Finalization

Emit only schema-conforming JSON. `qq-observe validate-analysis` canonicalizes
paths, resolves every citation, grounds episode costs, requires facts coverage
for skill conformity, enforces the ordered lens and walk contracts, and ranks
classified episodes by confidence, token cost, then title. `qq-observe
finalize` additionally checks package identity and whole-session binding and is
the sole append-only terminal writer.

On any semantic failure, finalize `analysis_failed` with a specific reason.
Mechanical facts remain reproducible from the bound transcript even when the
four semantic lenses are unavailable. Findings and taxonomy repair are
proposals only; apply nothing.
