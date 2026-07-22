---
id: doc-82
title: 'Observer skill draft — approved plan core, Change-2 material (2026-07-22)'
type: specification
created_date: '2026-07-22 23:25'
updated_date: '2026-07-22 23:25'
tags:
  - plan
---
# DRAFT — qq observer skill (Change 2 material, pre-approval scratch)

**Status: APPROVED as the v1 plan core, 2026-07-22. Change ② material — refined during implementation, changes stay within the approved contract.**

**Provenance:** procedure shape adapted from Datadog's MIT `agent-observability-trace-rca`
SKILL.md (signal-driven analysis, open→axial coding, symptom→root-cause navigation,
Priority/Action/Confidence/Impact); ranking/acceptance machinery from MIT `claude-improve`;
failure classes from OpenHands Critic taxonomy and MAST; guardrails from doc-80's
documented pitfalls. Every element cites its source; nothing is improvised.

## Core design principle — division of labor

The analyzer LLM is never asked to "look it over and say what to improve." The work is
split so each part is done by the thing that cannot get it wrong:

| Part | Owner | Why |
| --- | --- | --- |
| Counting (turns, tokens, tool calls, durations, retry counts) | **Deterministic pre-pass (code)** | LLM counting is unreliable — HarnessScope measured 2.8× token inflation from naive parsing. All numeric claims must cite facts-JSON fields. |
| Candidate signal detection (error-retry loops, repeated identical calls, operator corrections, compactions, tool-error bursts, cache misses) | **Deterministic pre-pass (code)** | Each signal is born with transcript citations (entry indices) by construction. |
| Reading reasoning, classifying episodes, symptom→root-cause, recognizing manual work a tool would collapse, proposing remedies | **Observer LLM** | The judgment work only an LLM can do — but always *anchored* to signals with citations, never free-hunting. |
| Ranking (recurrence, count × severity, confidence) | **Rules (code), later the digest** | LLM-proposed, rule-ranked. "Prioritized" labels without ranking recreate the flood (doc-80 pitfall #3). |
| Validation (schema, citation resolution, top-N cap) | **Code, after the LLM emits** | Self-policed prompt rules fail; the validator drops uncited episodes mechanically. On any failure: `analysis_failed`, never a salvaged finding (doc-80 pitfall #1). |

## Procedure (what the observer agent is asked to do, step by step)

**Phase 0 — Package integrity.** Load the run package: facts.json per session, signal
list with entry-index citations, transcripts, qq tool/skill inventory, instruction
corpus (AGENTS.md, CONCEPTS.md, skills, manifests). Verify schema versions and that
cited entry indices resolve. Any failure → emit `analysis_failed` with the reason and
stop. *(Guards pitfall #1 and #5: a broken analysis can never become a finding, and a
silently-skipped run is impossible — the record exists either way.)*

**Phase 1 — Signal triage + open coding.** Walk the pre-pass signal list. For each
signal, read the surrounding transcript window *including reasoning blocks* and either
dismiss it (benign, note why in one line) or propose an episode candidate with a
*specific* description — "delegate re-derived the repo layout three times because the
work order omitted the orientation paths", never "inefficiency". Additionally, one
bounded skim pass for judgment-only episodes the pre-pass cannot detect: manual
multi-step work sequences (tool-gap candidates) and hesitation/backtracking visible in
reasoning blocks. *(Open coding phase, Datadog. Specificity rule verbatim from their
Phase 2.)*

**Phase 2 — Axial coding.** Merge candidates describing the same underlying episode;
split candidates that conflate two causes; drop candidates whose citations don't
actually support them. Mechanical rules, announced in the doc: what merged, what
split, what dropped and why. *(Datadog Phase 3, minus their count thresholds — within
a single run an episode may legitimately occur once; cross-run recurrence is the
digest's job.)*

**Phase 3 — Root cause.** For each surviving episode, navigate from symptom to root
cause using the qq-adapted table:

| Symptom location | Root cause often lives in |
| --- | --- |
| Delegate session friction | the work order (ambiguous/incomplete), a skill (missing/gap), a missing tool, an instruction conflict |
| Accountable session friction | alignment churn, mis-split tickets, harness procedure |
| Tool result carrying error text under a success status | the tool's contract (silent-failure class — qq CONCEPTS vocabulary) |
| Agent re-reading/re-deriving | missing orientation, missing capability, non-durable context |
| Hesitation/backtracking in reasoning | two live instructions pulling against each other |

Cross-reference the inventories: if a tool/skill exists that would have collapsed the
work → *capability-unknown* (fix is surfacing); if none exists → *tool-missing* (fix
is a new tool). For instruction conflicts, name both instructions with file and line.
*(Datadog Phase 4 navigation + their root-cause category table; claude-improve's
config cross-reference pattern.)*

**Phase 4 — Remedies.** One smallest qq-shaped remedy per episode: new tool, surface
existing tool, edit instruction (before/after quotes), edit skill, process change.
Smallest-resulting-system doctrine; no speculative capability. *(claude-improve's
recommend-with-rationale rule; Datadog's before/after quote rule.)*

**Phase 5 — Emit.** Schema-validated analysis JSON → rendered analysis doc. The doc
carries: the facts table (from facts.json, never LLM-computed), ≤5 episodes each with
evidence citations + cost + remedy + confidence, the dropped-signal list (one line
each), and a limitations section. *(Datadog's output discipline and report format;
top-N cap is the anti-flood bound.)*

## Episode schema (validated by code)

```json
{
  "kind": "tool-gap.capability-unknown | tool-gap.tool-missing | instruction-conflict | instruction-deficiency | tool-misuse | friction | waste | failure | substrate",
  "title": "specific, concrete",
  "sessions": ["which sessions in the run tree"],
  "evidence": [{"session": "path", "entries": [12, 13], "quote": "≤200 chars"}],
  "what_happened": "…", "root_cause": "…",
  "root_cause_location": "work-order | skill | instruction | tool | agent-behavior | substrate",
  "cost": {"turns": 0, "tokens": 0, "seconds": 0, "source": "facts.json pointer"},
  "remedy": {"type": "new-tool | surface-tool | edit-instruction | edit-skill | process", "smallest_change": "…"},
  "confidence": "high | medium | low",
  "confidence_why": "evidence strength in one line",
  "recurrence_key": "stable string for cross-run matching"
}
```

## Taxonomy v1 (sources in parens)

- **tool-gap.capability-unknown** — work done manually that an existing qq tool/skill
  collapses; the agent didn't have it surfaced (operator's class; claude-improve
  cross-reference).
- **tool-gap.tool-missing** — repeated manual multi-step work; nothing in the
  inventory collapses it (operator's class; Datadog "Tool Gap").
- **instruction-conflict** — two live instructions pulling against each other,
  co-located with waste or visible hesitation (operator's class; claude-improve
  cross-skill consistency audit).
- **instruction-deficiency** — ambiguous/missing instruction causing misrouting or
  rework (Datadog "System Prompt Deficiency").
- **tool-misuse** — wrong tool or wrong parameters when a better path existed
  (Datadog; OpenHands `improper_tool_use_or_setup`).
- **friction** — operator corrections, restatements, direction changes, frustration
  (OpenHands user-follow-up classes).
- **waste** — retry loops, re-derivation, scope creep, incomplete-then-redo
  (OpenHands behavioral classes; Datadog loop detection).
- **failure** — the run failed its own goal (MAST modes; OpenHands success feature).
- **substrate** — infrastructure issues, split agent-caused vs external (OpenHands
  infrastructure classes).

## Hard rules in the skill text (enforced by the validator where possible)

1. Never compute a number; cite facts.json. *(pitfall #4)*
2. Every episode cites ≥1 evidence entry that resolves; uncited episodes are dropped
   by the validator. *(κ=0.77 control — MAST calibration fact)*
3. ≤5 episodes per run; the rest go to the dropped list. *(pitfall #3)*
4. Reasoning blocks inform root-cause but are never cited as outcome evidence —
   outcomes come from tool results. (Thinking is self-report.)
5. On any package/schema/validation failure: emit `analysis_failed`, never salvage.
   *(pitfall #1, the BLOCKER)*
6. Findings are proposals; nothing is applied. *(qq invariant: operator owns intent)*
7. Honest uncertainty: weak-evidence episodes are labeled tentative, never ranked up.
   *(Datadog operating rules: "<5 examples = tentative", "show your math")*

## Rejected alternatives for the skill's core approach (why this is the best option)

- **Freeform whole-transcript review** — produces unverifiable floods; both
  independent implementations inspected (claude-insights, /insights) failed exactly
  here. Rejected.
- **Rubric/judge scoring (eval-style)** — scores known rubrics, cannot discover
  opportunities; Weave/Langfuse rejected in the sweep for this. Rejected.
- **Critic-API probability classification (OpenHands)** — classifies failure
  probabilities, emits no remedies; borrowed as taxonomy only. Rejected as primary.
- **Self-optimizer (GEPA/Trace/TextGrad)** — requires runnable target + metric;
  optimizes prompts/models, not the harness. Wrong target per the settled decision.
- **PXI-style interactive investigation** — no automatic cadence, no cross-run
  recurrence; a mode we can add later, not the v1.
