# Observer v0 procedure

The observer is a read-only harness analyst. It audits only the assigned run
package, proposes harness improvements, and never applies a proposal.
Deterministic signals are the audit skeptic, not the analyst's agenda.

Named reading threshold:

```text
FULL_READ_MAX_BYTES = 400000
```

## Division of labor

| Part | Owner | Contract |
| --- | --- | --- |
| Count turns, tokens, tool calls, durations, retries, reasoning volume, and other global transcript facts | Deterministic code | Emit facts for the complete session; the observer never recomputes an analytic number from chunks. |
| Detect conservative structural signals | Deterministic code | Emit signals with 1-based physical transcript entry citations; do not infer intent, assumptions, or meaning. |
| Read the run, walk the operator↔agent seam, classify episodes, find root causes, and propose remedies | Observer LLM | Form candidates from reading before consulting signals and make judgments only when anchored to cited package evidence. |
| Validate citations, facts-grounded costs, and schema; enforce the five-episode cap; and rank | Deterministic code | Reject a broken analysis whole; rank valid episodes by the declared rule. |

## Input package

A new guided package uses `qq-observer.package` v2, carries both its canonical
local `repo` root and explicit GitHub `repository` (`owner/name`), and lives at
`runs/by-repository/<owner>/<repo>/pr-<N>/`. Legacy v1 flat packages are
read-only evidence: inspect them in place, label them legacy, and never infer a
GitHub Repository or rewrite/copy them. A guided package declares `variant:
"guided"` in `package.json` and contains the session transcripts (the
accountable member bounded to the Change's first dispatch plus its originating
operator brief; delegate sessions whole), the qq tool and skill inventory, and
the merge commit. Per-session facts and signals are **derived by the analyst**
from the packaged transcripts (`qq-observe facts|signals <session>` into the
analysis scratch); the live instruction corpus (AGENTS.md, CONCEPTS.md, skills,
and manifests) is read at the merge commit
(`git -C <repo> show <merge_commit>:<path>`, guided by the inventory).

Paths in the analysis must name sessions in that package. The observer writes
canonical absolute paths; validation canonicalizes all package and analysis
paths defensively before identity comparisons. The analyst captures JSON only
to its temporary child/runtime input. `qq-observe finalize --analysis` validates
that input and is the sole writer of the run's `analysis.json`. Facts are the
numeric authority; transcripts supply cited context. Signals are an audit input
only after reading has produced candidates. Pass each derived facts file to
validation as `--facts SESSION_PATH=FACTS_PATH`.

## Procedure

### Phase 0 — Package integrity and reading mode

The package is assembled by the owner before dispatch (`qq-observe assemble
--pr <N> --repo <root>`). Derive one facts file and one signals file per
packaged session into your analysis scratch (`qq-observe facts|signals
<run>/sessions/<label>.jsonl`); a session whose derivation fails is not
analyzable.

Load every package member and verify its schema and session membership. Require
`package.variant` to be exactly `guided`. Verify every pre-pass citation in the
derived signals resolves to a 1-based physical transcript entry. Integrity
validation may inspect signal shape and citations
mechanically, but do not use signal kinds or windows to form candidates yet.

Select one reading mode from the total byte length of all packaged session
transcripts:

- At or below `FULL_READ_MAX_BYTES`, use **full-read** mode and read every
  session in full.
- Above it, use **faceted** mode. For every session read the head and tail, every
  operator↔agent exchange required by the seam walk, every region that its
  complete-session facts mark as an outlier, and—after initial candidates
  exist—every available signal window. Read every derived facts file in either mode;
  facts retain the global counts, so transcript chunking never becomes a source
  of statistics.

The analysis `limitations` names the selected mode. If any required file,
schema, session, variant rule, derivation, or citation is invalid, emit only:

```json
{"schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed","reason":"specific reason"}
```

Stop. A broken package never produces a salvaged finding.

### Phase 1 — Reading-first open coding and seam walk

Read according to the selected mode and form specifically named episode
candidates from that reading, anchored to transcript entries. Do this before
consulting the deterministic signal list. Never call a candidate merely
"inefficient." Each evidence object cites exactly one transcript entry; use
separate evidence objects for separate entries. Its `quote` must be verbatim
from that entry; whitespace may differ only by collapsed runs. Reasoning can
explain how the
agent understood a problem; it cannot establish that an external action
succeeded or failed.

During the reading, perform one bounded, exhaustive **seam walk**. Classify every
user-role entry and every operator-directed request tool call in the run tree as
clean or as one of the `operator-seam.*` classes. Examine enough surrounding
entries to classify the exchange, but do not infer operator intent from code or
from a deterministic signal. Retain supported failures as candidates.
Unclassifiable exchanges go in `limitations`, one line per exchange with a
session and entry citation. Clean exchanges need no emitted episode.

Only after the initial candidate set exists, reconcile it against the available
deterministic signals:

- absorb every matching signal into a candidate; or
- dismiss it in `dropped_signals` with its kind, entries, and a one-line reason.

Every guided signal must resolve through one of those two paths. Mark every
retained episode with no matching signal as `no_signal: true`, so later digests
can identify recall gaps. Signals may challenge the reading, but never define
its candidate agenda.

Treat `reasoning_volume` and `reasoning_contortion` as prompts to inspect whether
a harness rule forced disproportionate or contorted work. The seam signals are
structural prompts only: the analyst decides whether an exchange was clean and,
if not, which seam class the cited context supports.

### Phase 2 — Axial coding

Merge candidates that share one underlying episode. Split candidates that
conflate separate causes. Drop candidates whose citations do not support them.
Record merges, splits, and candidate drops briefly in `limitations`; reserve
`dropped_signals` for reconciled deterministic signals. Do not impose a
within-run recurrence threshold: cross-run recurrence belongs to the later
digest.

### Phase 3 — Root cause

Navigate from symptom to the smallest supported harness cause:

| Symptom | Inspect first |
| --- | --- |
| Operator-seam failure | The request/direction, its acknowledgment boundary, stale-world evidence, completion gate, and any cross-session handoff |
| Delegate friction | Work-order ambiguity, skill gap, missing tool, or conflicting instruction |
| Accountable-session friction | Alignment churn, ticket split, or harness procedure |
| Error text paired with success | Tool contract and silent-failure path |
| Re-reading or re-derivation | Missing orientation, unsurfaced capability, or non-durable context |
| Hesitation or backtracking | Competing live instructions |
| Disproportionate reasoning contortion | The harness rule or system design that created the tight spot |

Cross-reference the inventories. If an existing tool or skill would have
collapsed the work, classify `tool-gap.capability-unknown`; if none exists,
classify `tool-gap.tool-missing`. For an instruction conflict, name both live
instructions with file and line. For a design question, name the responsible
harness rule and use `harness-design` when that is the supported root-cause
location. Do not classify a structural seam signal by its name alone.

### Phase 4 — Remedies

Propose one smallest-resulting-system remedy per episode. `remedy.type` is open
text. Common guidance is `new-tool`, `surface-tool`, `edit-instruction`,
`edit-skill`, `process`, or `harness-redesign`; these examples are not an enum.
Every remedy includes `smallest_change`. A design-question proposal may reach
any harness level, but remains cited, smallest-remedy-framed, ranked, and for
operator disposition. Nothing auto-applies.

### Phase 5 — Emit

Emit only JSON conforming to `observer-analysis.schema.json`: package identity,
zero to five episodes, reconciled one-line signal dismissals, and honest
limitations. Cost is fixed from the episode's `sessions`:

- `turns` is the sum of every `turns_by_role` value in those sessions' facts;
- `tokens` is the sum of `token_usage.input` and `token_usage.output`, treating
  null fields as zero and excluding sessions with zero usage records; when no
  episode session has usage records, only the token field is unverifiable and
  left unchecked;
- `duration_ms` is exactly the sum of `wall_clock.duration_ms`; and
- `source` is exactly `facts:<sessions[0]>`.

The validator's sane-session bound rejects `turns`, `tokens`, or `duration_ms`
values above 10^15 before arithmetic. Duplicate episode sessions are invalid
rather than deduplicated. An evidence object with zero or multiple entries is
invalid; use separate evidence objects for separate entries.

After emission, `qq-observe validate-analysis` resolves verbatim citations,
grounds costs using the supplied facts, rejects invalid output, and ranks valid
episodes. Findings remain proposals for the operator.

## Taxonomy v1

- **tool-gap.capability-unknown** — an existing qq tool or skill would collapse
  manual work but was not surfaced.
- **tool-gap.tool-missing** — repeated manual multi-step work has no collapsing
  capability in the inventory.
- **instruction-conflict** — two live instructions pull against each other near
  waste or visible hesitation.
- **instruction-deficiency** — an ambiguous or missing instruction causes
  misrouting or rework.
- **tool-misuse** — the wrong tool or parameters were used when a better
  available path existed.
- **friction** — operator correction, restatement, direction change, or
  frustration as felt in-session.
- **waste** — retry loops, re-derivation, scope creep, or incomplete-then-redo
  work.
- **failure** — the run failed its own assigned goal.
- **substrate** — an infrastructure episode, distinguished from agent behavior.
- **design-question** — the harness's own system design forced contorted or
  disproportionate work. Cite the reasoning contortion or volume signal, cite
  outcome evidence where an outcome is claimed, name the responsible harness
  rule, and analyze it as a harness architect.
- **operator-seam.unconfirmed-assumption** — the agent proceeded on an
  operator-owned choice or fact without supported confirmation.
- **operator-seam.unseen-request** — an operator direction or request was not
  noticed or incorporated.
- **operator-seam.misread-direction** — the agent noticed a direction but acted
  on a materially different reading.
- **operator-seam.misleading-claim** — an agent claim overstated completion,
  verification, or readiness at an operator gate.
- **operator-seam.stale-world** — the exchange relied on world state that cited
  external-change evidence had invalidated.
- **operator-seam.cross-session** — operator context, authority, or direction
  was lost or distorted across a session boundary.
- **operator-seam.abandonment** — an operator-directed exchange was left without
  supported resolution when the run moved on or ended.

## Seven hard rules

1. Never recompute an analytic number by hand; cite the deterministic
   complete-session facts derived from the packaged transcripts.
   Mechanical byte totals select reading mode only.
2. Every emitted episode has at least one resolving evidence citation whose
   quote is verbatim from its cited entries. Drop an uncited candidate before
   emission; the validator rejects, rather than salvages, an analysis containing
   an unresolved or non-verbatim citation.
3. Emit no more than five episodes. Keep `dropped_signals` for deterministic
   signal reconciliation, not overflow candidates.
4. Reasoning informs root cause but is not outcome evidence; outcomes come from
   tool results.
5. On any package, schema, variant, or validation failure, emit
   `analysis_failed` and never salvage findings.
6. Findings are proposals only; apply nothing.
7. Represent uncertainty honestly. Label weak evidence low-confidence or
   tentative and never rank it up by assertion.
