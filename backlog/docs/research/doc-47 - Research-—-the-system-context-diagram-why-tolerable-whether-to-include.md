---
id: doc-47
title: 'Research — the system context diagram: why tolerable, whether to include'
type: other
created_date: '2026-07-16 17:08'
updated_date: '2026-07-16 17:22'
---
# Research — Why the system context diagram was the only tolerable one, and whether it earns a place

Owning Task: TASK-60. Researcher: fresh read-only claude delegate, 2026-07-16.
Confidence tags per the researcher; owner spot-verified the load-bearing paths.

## What diagrams existed (evidence)

The operator's note refers to the TASK-6 smoke-test judging session on
2026-07-12 (Ideas note 11:09, one hour after the smoke-test `c4/` scratchpad
registered at 10:07 local — codebase-memory cache evidence). The judging
artifact survives (claude.ai artifact 61863981, cited in completed task-6) and
contains nine real renders. Confirmed inventory:

- 4 BPMN process renders (scratchpad only) — BPMN leg judged EXCELLENT.
- Container view in 4 render routes (C4PlantUML, PlantUML/Structurizr, d2
  default, d2 styled) — all rejected on visuals.
- System context view (C4PlantUML) — "the only tolerable one"; rejected with
  the C4 leg, never committed.
- 14 BPMN plan bundles (doc-19, doc-23–35 assets) — era 2026-07-12→13, made
  opt-in by Phase 3 (task-34), deleted by TASK-55 (commit 3a5149a, PR #105).
- 1 wiki BPMN (openwiki_guarded_merge) — added 7687946, removed 0df4d3f;
  lived ~29 hours, outliving its deleted subject by about a day.

No system context diagram was ever committed. Recovered content: system `qq`
with 4 externals (Operator, Backlog.md CLI, OpenWiki generator, Agent
runtimes) and 6 edges.

## Why it was tolerable (confirmed unless tagged)

1. **Size/layout load** — 5 boxes, 6 edges, 1490×547: one screen. Container
   views: 11 boxes at up to 3420×1082 with recorded defects (gray edge
   labels, boundary fill drowning inner labels). The context figure is the
   only C4 render with no defect noted in the judging captions.
2. **Abstraction stability** — every context-level fact from 2026-07-12 is
   still true after the most destructive four days in repo history
   (single-writer flock, openwiki/update branch, provider, roles); the
   container-level facts from the same day were already wrong (bin/ 3→6
   commands, skills churn within the window).
3. **Churn** — every committed process diagram was a liability: plan bundles
   dead within 36 hours; the wiki BPMN's subject was itself deleted.
4. **Review burden/fidelity** — BPMN needed per-element evidence stamps and
   conformance ledgers (task-8/15) and still produced material semantic edge
   errors (task-21 saga; doc-17: hallucinated edges are the dominant LLM
   diagram failure mode). A 5-node context diagram verifies in one glance.
5. *Plausible (interpretive):* "only tolerable one" is scoped to the rejected
   C4 leg — BPMN was judged EXCELLENT the same day, so the comparison set was
   the five C4 renders.

## Recommendation (decision is the operator's)

**Include, as a hand-maintained Mermaid flowchart in `README.md`** (beside the
Model/Repository-surfaces sections) — NOT in openwiki/ (regenerated surface;
would need a preservation clause in the standing brief). Plain `flowchart`,
not Mermaid's experimental C4 grammar (doc-17 reliability ranking). ~6–8
nodes: Operator, Backlog.md, OpenWiki generator, agent runtimes, Git/GitHub,
herdr, codebase-memory. Maintained by whoever lands a Change that adopts or
retires an upstream surface, through the ordinary PR. Standing cost: one-time
authoring; edits at the observed external-surface change rate (~2–3 over the
repo's life). Zero mechanical infrastructure.

Omission is fully defensible: README prose, openwiki/quickstart.md, and
architecture.md already carry the orientation value in text.

## Re-evaluation criteria

- Include → omit: corrections needed more than ~monthly; a materially wrong
  edge found; >~9 nodes; nobody looks at it.
- Omit → include: new collaborators/runtimes need first-hour orientation;
  external surfaces outgrow prose lists.
- Never (on current evidence): generated/rendered diagram pipelines — every
  one built here died within days (plan BPMN, wiki BPMN, C4 toolchain).

## Side finding (defect, corrected)

At research time, `openwiki/INSTRUCTIONS.md`'s "Diagrams" section still
directed OpenWiki runs to the BPMN authoring extension TASK-55 had deleted —
the last live BPMN reference in the Repository. The amendment (a prose-only
Diagrams rule) lands in the same board-keeping Change that records this
document, proposed by pull request per the operator-brief convention.

Parked render evidence: nine SVGs under the session scratchpad (imgs/),
including 08_System_context_C4PlantUML_.svg, for operator re-judging.
