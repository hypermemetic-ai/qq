---
id: doc-18
title: 'Business-process modeling standard for the living model: BPMN 2.0 via bpmn-io'
type: other
created_date: '2026-07-12 06:22'
updated_date: '2026-07-12 06:23'
tags:
  - research
---
# Business-process modeling standard for the living model: BPMN 2.0 via bpmn-io

**Owning task:** T-6 — Living architecture model + rendered diagrams in OpenWiki
**Date:** 2026-07-12 · **Overall confidence:** MEDIUM-HIGH (toolchain facts HIGH; visual-quality fitness untestable from documents — gated on smoke test)
**What this settles:** which business-process modeling standard + toolchain completes the living-model pipeline alongside Structurizr/C4, per the operator's requirement of a "proper" solution before committing. Also surfaces a **correction to the architecture leg**: `structurizr-cli export -format d2` is broken on current CLI releases (exporter removed 2025-09-30); the docs page listing d2 is stale. Method: one background researcher over OMG specs, bpmn-io repos/issues, Context7, and tool sources; owning agent spot-checked both load-bearing claims at the source (bpmn-auto-layout README limitations verbatim; `D2_FORMAT` commented out in structurizr-cli master `ExportCommand.java`).

## Decision summary

1. **Primary: BPMN 2.0 (OMG formal 2.0.2 / ISO-IEC 19510), constrained to an auto-layoutable single-process subset, via the bpmn-io toolchain** — deterministic codegen of semantic `.bpmn` XML → `bpmnlint` in CI (recommended rules + a custom plugin enforcing the subset) → `bpmn-auto-layout` (adds BPMNDI) → `bpmn-to-image` (SVG/PNG). Evidence rides in normative `bpmn:documentation` / `extensionElements` on every element (model-side, invisible in the render).
2. **Subset constraint (the load-bearing caveat):** no collaborations/pools, no message flows, lanes unproven — bpmn-auto-layout lays out only the first participant's process; Groups/Text annotations/Associations/Message flows are not laid out at all (verified verbatim in README). Human actors are modeled via task types (`userTask`/`manualTask`) + naming, not lanes, until lane layout is proven.
3. **Commitment is gated on a one-afternoon smoke test** (spec below) — matches the operator's requirement that quality be obviously demonstrable or obviously failed.
4. **Fallback: PlantUML activity (new syntax)** — reliably decent built-in auto-layout incl. swimlanes, one self-contained JAR, but bespoke file format, syntax-only validation, and evidence notes clutter the render.
5. **Architecture-leg correction:** the previously assumed `structurizr-cli -format d2` path needs one of three repairs (below) — decide during the smoke test.

## Findings

### BPMN 2.0 + bpmn-io toolchain (primary)

1. (HIGH) BPMN 2.0.2 is an OMG formal spec (Jan 2014) with normative machine-readable XSDs. https://www.omg.org/spec/BPMN/2.0.2/ · ISO/IEC 19510:2013 adopts BPMN 2.0.1 verbatim (MEDIUM — ISO catalog page 403'd; rests on the standard's quoted foreword).
2. (HIGH) Evidence annotation is **normative on every element**: `tBaseElement` carries `documentation` (0..*) and `extensionElements` (foreign-namespace XML), verified in the normative Semantic.xsd. Metadata is model-side — it never appears in the rendered SVG. https://www.omg.org/spec/BPMN/20100501/Semantic.xsd
3. (HIGH — spot-checked verbatim by owning agent) **bpmn-auto-layout limitations**, from the README: "Given a collaboration only the first participant's process will be laid out. Sub-processes will be laid out as collapsed sub-processes. The following elements are not laid out: Groups, Text annotations, Associations, Message flows." Lanes: unmentioned anywhere (README/CHANGELOG) — presumed unsupported, smoke-test. Boundary events supported (since 0.4.0, fixes in 1.1.0) but with quality bugs (issue #126: timer boundary event edge crosses whole diagram). README says collapsed sub-processes; CHANGELOG 1.2.0 says "created as expanded" — contradiction, smoke-test. v1.3.0 (Mar 2026) added ad-hoc subprocess + transaction. Library only (`layoutProcess(xml)`), needs a ~5-line node CLI wrapper. Open layout-quality issues: crossing/overlapping edges (#93/#98/#99), self-loops (#88), colors stripped (#116). https://github.com/bpmn-io/bpmn-auto-layout
4. (HIGH) **bpmn-to-image** v0.10.0 (Dec 2025): CLI on bpmn-js ^18.9.1 + Puppeteer ^25; PNG/SVG/PDF; `--min-dimensions`, `--scale`, `--title`, `--no-footer`. Renders via the bpmn-js viewer, so it requires DI (i.e. requires the auto-layout step first). https://github.com/bpmn-io/bpmn-to-image
5. (HIGH) **Watermark is a license condition, not a bug**: the bpmn.io license requires the small bpmn.io mark to remain visible and unmodified. Expect it on outputs. https://bpmn.io/license/
6. (HIGH) **bpmnlint** v11.12.1 (Apr 2026): headless CLI, severities, `.bpmnlintrc` (recommended/all/correctness), custom plugins (`npm init bpmnlint-plugin`), `moddleExtensions` for custom namespaces. INFERENCE (design synthesis): encode the auto-layoutable subset as a custom bpmnlint plugin so CI rejects unrenderable models before layout. https://github.com/bpmn-io/bpmnlint
7. (MEDIUM) Codegen path: bpmn-moddle v10 (Jan 2026) for deterministic object-model↔XML, or plain templating validated against the OMG XSD with xmllint. Whether `extensionElements` survive `layoutProcess` round-trip is expected (bpmn-moddle-based) but unverified — smoke-test item.
8. (MEDIUM) Alternative layouters are weaker: process-analytics/bpmn-layout-generators is explicitly experimental (v0.2.0, Aug 2024); the `bpmn-auto-layout-feat-ivan-tulaev` fork claims full collaboration + message-flow layout but is a low-adoption one-person fork (8 stars) — an option if pools become necessary later, not a foundation.

### DMN (companion, deferred)

9. (HIGH) DMN 1.5 is OMG-formal (Aug 2024); dmn-js active (v17.8.0, Apr 2026). (MEDIUM) No official headless DMN→image CLI exists; decision tables are HTML widgets. Pragmatic wiki render: generate Markdown tables from DMN XML. Adopt later only if decision logic outgrows BPMN gateways. https://www.omg.org/spec/DMN/

### PlantUML activity (fallback)

10. (HIGH) PlantUML v1.2026.6 (Jun 2026) is active. Activity-beta syntax covers if/elseif/switch, while/repeat, fork/join, partitions, **swimlanes**, notes, connectors, detach — and does **not** require Graphviz (internal layout engine; Graphviz needed only for legacy diagram types). One self-contained JAR renders headlessly (`--svg/--png`); syntax check via `--check-syntax`/`--stop-on-error`. https://plantuml.com/activity-diagram-beta · https://plantuml.com/graphviz-dot · https://plantuml.com/command-line
11. (MEDIUM/INFERENCE) PlantUML costs vs BPMN: validation is syntax-only (no semantic lint), the `.puml` format is bespoke-but-ubiquitous (only the notation approximates OMG UML), and evidence notes either render (visual clutter) or live in comments (invisible to validation). Swimlanes give it the human-actor story BPMN's layouter can't currently render.

### Rejected candidates

12. (HIGH) **Mermaid flowchart/state**: no external standard, parse-only validation, comment-only metadata — baseline only. mermaid-cli v11.16.0 active.
13. (HIGH) **Kroki BPMN companion**: bpmn-js viewer + Puppeteer with **no auto-layout dependency** — renders pre-laid-out files only (requires BPMNDI; inferred from worker source + bpmn-js behavior, not exercised). Redundant with bpmn-to-image, adds a service. https://github.com/yuzutech/kroki
14. (HIGH) **Structurizr dynamic views** cannot cover the workflow subset: based on UML communication diagrams; Simon Brown: "dynamic view support is deliberately simple — no instances, no guard conditions, no loops, no activations, no lifelines" (structurizr/java discussion #442, Sep 2025). No branching, no decisions, no human-actor semantics. https://c4model.com/diagrams/dynamic
15. (HIGH) **CMMN** is dead for this purpose: cmmn-js archived read-only Feb 2024. (LOW) EPC / ISO 5807: no maintained headless OSS toolchain surfaced (not exhaustively searched; low prior).

### Architecture-leg correction (composability alert)

16. (HIGH — spot-checked by owning agent) **`structurizr-cli export -format d2` is broken on current releases.** Commit 2025-09-30: "Temporarily remove D2 exporter — it has clashing dependencies"; on master, `D2_FORMAT` and its EXPORTERS registration are commented out in `ExportCommand.java` (verified directly); official structurizr-export has no d2 package. Last release with d2: **v2025.05.28**. The docs page still listing d2 (https://docs.structurizr.com/cli/export) is stale — the earlier T-6 verification relied on it and is hereby corrected. Repair options:
    - (a) **Pin structurizr-cli v2025.05.28** (keeps d2; foregoes newer CLI fixes);
    - (b) **`export -format fqcn` + third-party jar** io.github.goto1134:structurizr-d2-exporter 1.6.0 (Mar 2025; cannot export dynamic views — irrelevant, we don't use them);
    - (c) **Switch the C4 leg to PlantUML export** (actively supported, light/dark variants) — unifies architecture + process rendering on one PlantUML JAR if the PlantUML fallback also wins the process leg, at some cost in visual polish vs d2.
    Decide during the smoke test by rendering the same C4 view through (a)/(b) and (c) and comparing.

## Criteria matrix

| Candidate | 1 Standard | 2 Text+codegen | 3 Validation | 4 Headless layout+render | 5 Evidence | 6 Composability |
|---|---|---|---|---|---|---|
| **BPMN 2.0 + bpmn-io** | pass (OMG+ISO) | pass (XML, XSD, bpmn-moddle) | pass (bpmnlint+plugins+xmllint) | **partial** — single-process subset only; quality bugs to smoke-test | pass (normative, model-side) | pass (node CLIs in CI) |
| PlantUML activity | partial (UML notation, bespoke format) | pass | partial (syntax only) | pass (one JAR, swimlanes) | partial (clutter or dead comments) | pass (JVM already present) |
| Mermaid | fail | pass | partial | pass | fail/weak | pass |
| Kroki BPMN | pass | pass | n/a | fail (needs pre-existing DI) | pass | partial (extra service) |
| Structurizr dynamic views | partial | pass | pass | fail (d2 gone; semantics too limited) | partial | pass |
| CMMN | pass on paper | pass | fail | fail (archived) | — | fail |
| DMN (companion) | pass | pass | partial | fail/partial (tables→Markdown) | pass | partial |

## Smoke test (commitment gate — one afternoon)

a. Codegen two real processes through the full chain: one agent workflow from code; one operator procedure from a `skills/*/SKILL.md` (e.g. the research pipeline).
b. Judge SVG polish: edge crossings, boundary-event routing, label placement — the operator's obviously-good/obviously-bad call.
c. Test lanes and expanded-sub-process behavior (both undocumented/contradicted).
d. Confirm `documentation`/`extensionElements` survive `layoutProcess` round-trip.
e. Confirm watermark placement is acceptable (license requires keeping it).
f. In parallel, settle the C4 leg: render one C4 view via pinned-CLI d2, fqcn+goto1134 jar, and PlantUML export; compare.
Pass → commit T-6 design as BPMN + Structurizr. Fail on visuals → PlantUML activity fallback (and consider option (c) to unify renderers).

## Sources (all opened 2026-07-12)

- https://github.com/bpmn-io/bpmn-auto-layout (+ raw README/CHANGELOG + issues) — limitations (spot-checked verbatim), v1.3.0, quality bugs
- https://github.com/bpmn-io/bpmn-to-image (+ package.json/index.js + issues) — CLI, Puppeteer 25, bpmn-js 18, output knobs
- https://github.com/bpmn-io/bpmnlint — rules/plugins/CI, v11.12.1
- https://bpmn.io/license/ — watermark condition
- https://www.omg.org/spec/BPMN/2.0.2/ + https://www.omg.org/spec/BPMN/20100501/Semantic.xsd — spec status; documentation/extensionElements normative
- https://www.omg.org/spec/DMN/ — DMN 1.5 formal
- https://github.com/bpmn-io/cmmn-js — archived Feb 2024
- https://plantuml.com/activity-diagram-beta + /graphviz-dot + /command-line — activity-beta constructs, no-Graphviz, syntax check, v1.2026.6
- https://github.com/mermaid-js/mermaid-cli — v11.16.0
- https://github.com/yuzutech/kroki (bpmn worker source) — viewer-only, no layout
- https://c4model.com/diagrams/dynamic + https://docs.structurizr.com/dsl/cookbook/dynamic-view-parallel/ + structurizr/java discussion #442 — dynamic-view limits
- structurizr/cli master `ExportCommand.java` (spot-checked: D2_FORMAT commented out) + commits/releases via GitHub API — d2 removal 2025-09-30, last-d2 release v2025.05.28, `fqcn` hook; https://github.com/goto1134/structurizr-d2-exporter (1.6.0)
- https://github.com/process-analytics/bpmn-layout-generators — experimental alternative
- Context7 + GitHub/npm APIs — bpmn-auto-layout fork (ivan-tulaev), bpmn-moddle v10, dmn-js v17.8.0

## Gaps

- Lane layout in bpmn-auto-layout undocumented either way — decisive for actor-visible human procedures; smoke-test.
- README-vs-CHANGELOG contradiction on sub-process rendering (collapsed vs expanded) — smoke-test.
- Visual quality on *our* graphs unverifiable from documents — the crossing-edge issues are real but severity unknown until rendered; this is what the smoke test settles.
- `extensionElements` surviving `layoutProcess` — expected, unverified.
- Whether exported SVG carries the watermark and exactly what `--no-footer` removes — license says keep it; behavior unverified.
- ISO 19510 status rests on the standard's quoted foreword (catalog page 403'd) — MEDIUM.
- Kroki requires-DI inferred from source, not exercised.
- EPC / ISO 5807 not exhaustively searched (low prior).
