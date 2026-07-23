# Observer v0 procedure

The observer is a read-only harness analyst. It analyzes only the assigned run
package, proposes harness improvements, and never applies a proposal.

## Division of labor

| Part | Owner | Contract |
| --- | --- | --- |
| Count turns, tokens, tool calls, durations, retries, and reasoning volume | Deterministic code | Emit facts; the observer never recomputes a number. |
| Detect candidate signals | Deterministic code | Emit signals with 1-based transcript entry citations. |
| Read context, classify episodes, find root causes, and propose remedies | Observer LLM | Make judgments only when anchored to cited package evidence. |
| Validate citations, facts-grounded costs, and schema; enforce the five-episode cap; and rank | Deterministic code | Reject a broken analysis whole; rank valid episodes by the declared rule. |

## Input package

A package contains `facts.json` and `signals.json` for every session, the
corresponding session transcripts, the qq tool and skill inventory, and the live
instruction corpus (including AGENTS.md, CONCEPTS.md, skills, and manifests).
Paths in the analysis must name sessions in that package. The observer writes
canonical absolute paths; validation canonicalizes all package and analysis paths
defensively before identity comparisons. Facts and signals are the numeric and
candidate-discovery authority; transcripts supply cited context. Pass each facts
file to validation as `--facts SESSION_PATH=FACTS_PATH`.

## Procedure

### Phase 0 — Package integrity

Load every package member. Verify the facts and signals schema versions, session
membership, and that every pre-pass citation resolves to a 1-based physical
transcript entry. If any file, schema, session, or citation is missing or
invalid, emit only:

```json
{"schema":"qq-observer.analysis","schema_version":1,"status":"analysis_failed","reason":"specific reason"}
```

Stop. A broken package never produces a salvaged finding.

### Phase 1 — Signal triage and open coding

Walk every deterministic signal. Read its surrounding transcript window,
including persisted reasoning. Either create a specifically named candidate or
add a one-line dismissal to `dropped_signals`; never call something merely
"inefficient." Make one bounded skim for judgment-only tool-gap candidates and
hesitation or backtracking, but retain a candidate only when package citations
anchor it. Each evidence `quote` must be verbatim from its cited entries;
whitespace may differ only by collapsed runs.

Treat `reasoning_volume` and `reasoning_contortion` as prompts to inspect whether
a harness rule forced disproportionate or contorted work. Reasoning can explain
how the agent understood a problem; it cannot establish that an external action
succeeded or failed.

### Phase 2 — Axial coding

Merge candidates that share one underlying episode. Split candidates that
conflate separate causes. Drop candidates whose citations do not support them,
and record in one line what was merged, split, or dropped and why. Do not impose
a within-run recurrence threshold: cross-run recurrence belongs to the later
digest.

### Phase 3 — Root cause

Navigate from symptom to the smallest supported harness cause:

| Symptom | Inspect first |
| --- | --- |
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
location.

### Phase 4 — Remedies

Propose one smallest-resulting-system remedy per episode. `remedy.type` is open
text. Common guidance is `new-tool`, `surface-tool`, `edit-instruction`,
`edit-skill`, `process`, or `harness-redesign`; these examples are not an enum.
Every remedy includes `smallest_change`. A design-question proposal may reach
any harness level, but remains cited, smallest-remedy-framed, ranked, and for
operator disposition. Nothing auto-applies.

### Phase 5 — Emit

Emit only JSON conforming to `observer-analysis.schema.json`: package identity,
zero to five episodes, one-line dropped signals, and honest limitations. Cost is
fixed from the episode's `sessions`:

- `turns` is the sum of every `turns_by_role` value in those sessions' facts;
- `tokens` is the sum of `token_usage.input` and `token_usage.output`, treating
  null fields as zero and excluding sessions with zero usage records; when no
  episode session has usage records, only the token field is unverifiable and
  left unchecked;
- `duration_ms` is exactly the sum of `wall_clock.duration_ms`; and
- `source` is exactly `facts:<sessions[0]>`.

The validator's sane-session bound rejects `turns`, `tokens`, or `duration_ms`
values above 10^15 before arithmetic. Duplicate episode sessions and
duplicate entries within one citation are invalid rather than deduplicated.

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
  frustration.
- **waste** — retry loops, re-derivation, scope creep, or incomplete-then-redo
  work.
- **failure** — the run failed its own assigned goal.
- **substrate** — an infrastructure episode, distinguished from agent behavior.
- **design-question** — the harness's own system design forced contorted or
  disproportionate work. Cite the reasoning contortion or volume signal, cite
  outcome evidence where an outcome is claimed, name the harness rule
  responsible, and analyze it as a harness architect.

## Seven hard rules

1. Never compute a number; cite `facts.json`.
2. Every emitted episode has at least one resolving evidence citation whose
   quote is verbatim from the cited entries. Drop an uncited candidate before
   emission; the validator rejects, rather than salvages, an analysis containing
   an unresolved or non-verbatim citation.
3. Emit no more than five episodes; put omitted candidates in
   `dropped_signals`.
4. Reasoning informs root cause but is not outcome evidence; outcomes come from
   tool results.
5. On any package, schema, or validation failure, emit `analysis_failed` and
   never salvage findings.
6. Findings are proposals only; apply nothing.
7. Represent uncertainty honestly. Label weak evidence low-confidence or
   tentative and never rank it up by assertion.
