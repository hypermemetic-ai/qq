---
id: doc-17
title: Best model and toolchain for accurate diagram-as-code generation
type: other
created_date: '2026-07-12 05:28'
updated_date: '2026-07-12 05:29'
tags:
  - research
---
# Best model and toolchain for accurate diagram-as-code generation

**Owning task:** T-6 — Build diagram-generation skill: model + toolchain selection
**Date:** 2026-07-12 · **Overall confidence:** MEDIUM-HIGH
**What this settles:** (1) which model the future diagram skill should use to generate diagram code from file sources and conversation context; (2) whether an external provider API call beats in-session Claude; (3) which diagram language/renderer toolchain to standardize on. Method: one background researcher over primary docs, arXiv benchmarks, Context7, and credible community evals; owning agent spot-checked the load-bearing citations (R2ABench claims verified against the paper; Excalidraw claim partially verified — see Findings 13/23; Anthropic pricing verified against the current Claude API reference).

## Decision summary

1. **Use in-session Claude — no external provider call.** No non-Anthropic model shows a decisive, benchmark-backed advantage on diagram-as-code accuracy, while every published eval that includes Claude puts it at or near the top. The dominant failure mode across all frontier models is *relational* (wrong/hallucinated edges), which is mitigated by grounding in source files and a render→validate→repair loop — both of which favor in-session Claude (full repo + conversation context already loaded, zero setup, zero marginal billing) over any external API where context must be re-marshaled into a prompt.
2. **Target Mermaid as the primary diagram language**, rendered via `@mermaid-js/mermaid-cli` (or Kroki as a zero-install fallback). Graphviz/DOT as secondary for pure dependency/graph topology. Do not target Excalidraw JSON or raw SVG directly.
3. **Native image-generation models are unfit** for accuracy-critical technical diagrams — decorative renders only.

## Findings

### SQ1 — Current model lineup (July 2026)

1. **Anthropic** (HIGH — primary docs + cross-checked against current Claude API reference): Claude Fable 5 (`claude-fable-5`, $10/$50 per MTok, 1M ctx); Claude Opus 4.8 (`claude-opus-4-8`, $5/$25, 1M ctx); Claude Sonnet 5 (`claude-sonnet-5`, $3/$15, intro $2/$10 through 2026-08-31); Claude Haiku 4.5 ($1/$5, 200K ctx). https://platform.claude.com/docs/en/docs/about-claude/models/overview
2. **OpenAI** (HIGH — primary docs): GPT-5.6 family — Sol (flagship), Terra (mid), Luna (cheap); image model GPT Image 2. https://developers.openai.com/api/docs/models
3. **Google** (HIGH — primary docs): Gemini 3.5 Flash (stable flagship), Gemini 3.1 Pro (preview); native image gen: Nano Banana 2 / Nano Banana Pro. https://ai.google.dev/gemini-api/docs/models
4. **DeepSeek** (HIGH — primary docs): V4 preview (Apr 2026): `deepseek-v4-pro` and `deepseek-v4-flash`, 1M ctx, open weights, ~20× cheaper than western frontier APIs. https://api-docs.deepseek.com/news/news260424/
5. **Qwen** (MEDIUM — secondary: CNBC, deeplearning.ai): Qwen3.5-397B-A17B open weights (Feb 2026); Qwen 3.7 Max closed (May 2026).
6. **Meta** (MEDIUM — secondary: VentureBeat): Llama stagnant since Llama 4 (Apr 2025); pivot to proprietary Muse Spark — not a candidate.
7. **Mistral** (MEDIUM — secondary): Mistral Large 3 (Dec 2025) still flagship — no diagram evidence.

### SQ2 — Diagram-code accuracy evidence

8. **R2ABench** (arXiv 2604.06683v2, 2026-07-07; HIGH — all five load-bearing claims verified against the paper by the owning agent): requirement→PlantUML architecture views; Claude Sonnet 4.6, GPT-5, DeepSeek V3.2, Qwen3-Coder 480B. Syntactic validity: closed models 0.90–0.94 vs open 0.65–0.68. Claude Sonnet 4.6 Direct best node coverage (0.849); GPT-5 Direct strongest on semantic-judge metrics (completeness/faithfulness/traceability). Edge F1 never exceeds 0.176; edge hallucination is the dominant structural failure mode (39.1% of errors). https://arxiv.org/html/2604.06683v2
9. **DiagramEval** (arXiv 2510.25761, Oct 2025; MEDIUM — models one generation stale): LLMs generating diagrams as SVG; Claude 3.7 Sonnet best on 4/6 metrics vs Gemini 2.5 Pro and Llama 4 Maverick; all models' node-alignment F1 only ~0.33–0.35 — raw-SVG structural fidelity is poor across the board. https://arxiv.org/html/2510.25761v1
10. **SVGenius** (arXiv 2506.03139, Jun 2025; MEDIUM — stale models, 22-model breadth): Claude 3.7 Sonnet #1 on text-to-SVG and image-to-SVG; proprietary ≫ open-source; reasoning-enhanced training beats pure scaling. https://arxiv.org/html/2506.03139v1
11. **MermaidSeqBench** (arXiv 2511.14967v2, Apr 2026; MEDIUM — only tests 1–8B open models): even 7–8B models reach ~86–92% Mermaid syntax correctness. INFERENCE: frontier models are near-ceiling on Mermaid syntax. https://arxiv.org/html/2511.14967
12. **MindStudio 2026 head-to-head** (Mar 2026; MEDIUM-LOW — single origin, own methodology): "Claude Opus 4.6 handled technical diagrams and flowcharts best — clean connector paths, correct arrowhead placement, properly labeled nodes"; GPT-5.4 better at artistic visuals; Gemini lagged on SVG. https://www.mindstudio.ai/blog/gpt-54-vs-claude-opus-46-vs-gemini-31-pro-benchmarks
13. **Product choices** (MEDIUM): Eraser DiagramGPT runs on OpenAI models, publishes no accuracy evals. Excalidraw org maintains an official `mermaid-to-excalidraw` conversion library (verified: https://github.com/excalidraw/mermaid-to-excalidraw); the stronger claim that Excalidraw's AI text-to-diagram feature has the LLM emit Mermaid and converts is MEDIUM (not stated in the repo README; rests on secondary knowledge). Either way, the official Mermaid→Excalidraw path exists, so Excalidraw output never requires targeting its JSON directly.

### SQ3 — External API vs in-session Claude

14. **No external model's advantage is decisive** (MEDIUM-HIGH, convergent). The only frontier-vs-frontier split is R2ABench: GPT-5 modestly better on semantic-judge metrics, Claude better on structure/coverage, both ≥0.90 syntax. Everything else favors Claude on technical-diagram accuracy. Since the binding failure mode is wrong edges — fixed by context grounding + validate/repair loops, not model swaps — the in-session path (context already present, $0 marginal, no key, no billing) dominates. An external call would add setup, cost, latency, and context-remarshaling loss for an unproven gain.
15. Caveat (LOW-MEDIUM): no diagram benchmark yet covers the July-2026 flagships (Fable 5, Opus 4.8, GPT-5.6, Gemini 3.5 Flash); the ranking extrapolates from consistent prior-generation results.

### SQ4 — Per-provider setup + billing (5–50K in / ~3K out per call, published prices)

| Provider / model | $/MTok in→out | Est. per call | Setup |
|---|---|---|---|
| **In-session Claude** (this environment) | n/a | $0 marginal | none |
| Anthropic API — Opus 4.8 | 5 → 25 | $0.10–0.33 | key + billing |
| Anthropic API — Sonnet 5 (intro) | 2 → 10 | $0.04–0.13 | key + billing |
| OpenAI — GPT-5.6 Sol | 5 → 30 | $0.12–0.34 | key + prepaid credits |
| OpenAI — GPT-5.6 Terra | 2.5 → 15 | $0.06–0.17 | key + prepaid credits |
| Google — Gemini 3.5 Flash | 1.5 → 9 | $0.03–0.10 (free tier exists; trains on data) | AI Studio key |
| DeepSeek — V4-Pro / V4-Flash | 0.435→0.87 / 0.14→0.28 | <$0.03 | key; cheapest ~20× |

All prices HIGH (opened primary pricing pages; Anthropic cross-checked against the current Claude API reference).

### SQ5 — Diagram language reliability + renderer maturity

| Rank | Language | LLM emission reliability | Renderer | Verdict |
|---|---|---|---|---|
| 1 | **Mermaid** | Highest — default LLM output; 86–92% syntax even at 7–8B; most token-efficient (~50 tok/sequence diagram vs PlantUML ~80, Excalidraw JSON ~500) | `@mermaid-js/mermaid-cli` (npm; needs Chromium/Puppeteer) or Kroki; GitHub/GitLab/Notion/Obsidian render natively | **Primary target** |
| 2 | Graphviz/DOT | High (INFERENCE from decades of training data; GPT-4-era studies "generally correct") | Best install story: `apt install graphviz` | Secondary, for pure graph topology |
| 3 | PlantUML | 0.90–0.94 measured frontier syntax validity (the only measured frontier number) | Heaviest: Java jar + Graphviz dep; no GitHub rendering | Only if UML rigor demanded |
| 4 | D2 | Unmeasured; presumed lower (newest, sparse training data) — INFERENCE | Best CLI: single binary, `d2 validate`, `d2 fmt` | Attractive tooling, risky emission — test before adopting |
| 5 | Raw SVG | Compiles trivially but structural fidelity measured poor (node F1 ~0.35) | none needed | Custom visuals only, with review loop |
| 6 | Excalidraw JSON | Worst — ~10× Mermaid's tokens; official Mermaid→Excalidraw converter exists | via mermaid-to-excalidraw or Kroki companion | Never target directly; derive from Mermaid |

16. **Kroki** (HIGH): kroki.io free HTTPS API + self-host Docker renders PlantUML/Mermaid/Graphviz/D2/Excalidraw through one interface — a single fallback renderer with zero local toolchain. (Context7 /websites/kroki_io_kroki)

### SQ6 — Native image generation (refuted)

17. **Unfit for accuracy-critical diagrams** (HIGH, convergent): GenExam (arXiv 2509.14232): best image model (GPT-Image-1) scored 12.1% strict on exam-style discipline diagrams; most models ~0%. Google's own guidance concedes Nano Banana Pro "may misinterpret information or produce factually incorrect results" on infographics/diagram annotation; community testing reports duplicated axis values and mislabeled elements (MEDIUM). Text rendering has improved; topology/label correctness has not been demonstrated. Fit: decorative/presentation renders only, never the source of truth.

## Model ranking (by strength of diagram-accuracy evidence)

| Rank | Model family | For | Against | Confidence |
|---|---|---|---|---|
| 1 | Claude (Sonnet 4.6 → Opus 4.8 / Fable 5) | #1 DiagramEval, #1 SVGenius, best node coverage + ≥0.90 syntax R2ABench, best technical diagrams (MindStudio) | GPT-5 better on R2ABench semantic-judge metrics; extraneous-node tendency | MEDIUM-HIGH (4 convergent sources) |
| 2 | OpenAI GPT-5.x/5.6 | Best semantic config in R2ABench; Eraser chose OpenAI | Loses structure metrics to Claude | MEDIUM |
| 3 | Gemini 3.x | Strong general boards, illustrative SVG | Mid-pack in every diagram-specific eval | MEDIUM-LOW |
| 4 | DeepSeek V4 / Qwen 3.5+ | ~20× cheaper | Open-model syntax validity 0.65–0.68 (V3.2-era) | LOW-MEDIUM |
| 5 | Llama / Mistral | — | Stagnant / no diagram evidence | LOW |

## Implications for the skill design (owning-agent judgment)

- The skill needs **no provider integration at all**: it is a pure Claude Code skill — gather context (files, conversation, codebase-memory graph), emit Mermaid (DOT for dependency graphs), render locally with mermaid-cli/graphviz (Kroki fallback), and run a **render→validate→repair loop** (the highest-leverage accuracy mechanism given the edge-hallucination finding).
- A second high-leverage mechanism: have the generator **enumerate nodes/edges from source evidence first** (e.g. from `search_graph`/`trace_path` output) before emitting diagram code, since edge hallucination — not syntax — is the failure mode.
- Optional cheap follow-up: a ~20-case in-repo smoke eval (render + human compare) to close the frontier-models-untested gap.

## Sources

- https://platform.claude.com/docs/en/docs/about-claude/models/overview — Anthropic lineup/pricing (2026-07-12)
- https://developers.openai.com/api/docs/models + /pricing — GPT-5.6 lineup/prices (2026-07-12)
- https://ai.google.dev/gemini-api/docs/models + /pricing + /image-generation — Gemini/Nano Banana (2026-07-12)
- https://api-docs.deepseek.com/news/news260424/ + /quick_start/pricing — DeepSeek V4 (2026-07-12)
- https://arxiv.org/html/2604.06683v2 — R2ABench (verified by owning agent 2026-07-12)
- https://arxiv.org/html/2510.25761v1 — DiagramEval (Oct 2025)
- https://arxiv.org/html/2506.03139v1 — SVGenius (Jun 2025)
- https://arxiv.org/html/2511.14967 — MermaidSeqBench (Apr 2026)
- arXiv 2509.14232 — GenExam (Sep 2025; abstract-level)
- https://www.mindstudio.ai/blog/gpt-54-vs-claude-opus-46-vs-gemini-31-pro-benchmarks (Mar 2026)
- https://www.eraser.io/diagramgpt — DiagramGPT provider choice
- https://github.com/excalidraw/mermaid-to-excalidraw — verified by owning agent 2026-07-12
- Context7: /mermaid-js/mermaid-cli, /terrastruct/d2-docs, /websites/kroki_io_kroki, /websites/plantuml — renderer facts
- https://graphviz.org/download/ — graphviz stable install
- https://dev.to/levi_liu/mermaid-vs-plantuml-in-2026-which-to-pick-for-engineering-docs-59dm (Jun 2026); https://dev.to/akari_iku/analyzing-the-best-diagramming-tools-for-the-llm-age-based-on-token-efficiency-5891 (Oct 2025)
- Secondary, search-snippet-only (MEDIUM at best): CNBC/deeplearning.ai (Qwen3.5), VentureBeat (Muse Spark), mistral.ai/news/mistral-3, imini.com + humai.blog (Nano Banana Pro flaws)

## Gaps

- No benchmark tests the July-2026 flagships (Fable 5, Opus 4.8, GPT-5.6, Gemini 3.5 Flash) on diagram generation; ranking extrapolates from consistent prior-generation results. A ~20-case in-skill smoke eval would close this cheaply.
- D2 LLM-emission reliability is unmeasured anywhere; its rank is training-prevalence inference — test before adopting D2.
- Frontier Mermaid syntax-validity numbers don't exist (MermaidSeqBench covers ≤8B only); "near-ceiling" is inference.
- The claim that Excalidraw's AI feature emits Mermaid internally is not stated in the repo README (MEDIUM); the decision-relevant fact — an official Mermaid→Excalidraw conversion path exists — is verified.
- Qwen/Mistral/Llama lineup facts are from credible secondary coverage, not opened primary announcements; none is a candidate on current evidence.
