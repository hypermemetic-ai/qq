---
id: doc-80
title: >-
  Session-observer improvement analyst — existing-implementations sweep
  (2026-07-22)
type: other
created_date: '2026-07-22 22:48'
updated_date: '2026-07-22 22:48'
tags:
  - research
---
# Session-observer improvement analyst — existing-implementations sweep (2026-07-22)

**Owning Task:** T-142. **Overall confidence:** HIGH that no adoptable drop-in exists; MEDIUM on per-candidate fit inferences (no candidate was runtime-exercised against a real qq session).
**Settles:** the adopt-vs-build evidence base for a dedicated agent that reads complete sessions end-to-end (reasoning included) and emits *prioritized* improvement findings per run. Verdict: **build/adapt, borrowing validated patterns**; optional local Phoenix+PXI trial as scaffolding. Does not design the qq system.

Method note: fresh-context delegated researcher (codex gpt-5.6-sol, xhigh), Context7-first for product facts, only opened sources cited, independent corroboration for interested-party claims. Owner spot-checked four load-bearing citations post-delivery (marked ✓verified below); all matched.

## Comparison matrix — closest implementations

R+ = persisted reasoning representable; R? = only if supplied in trace fields; R− = analyzer does not consume historical reasoning.

| Candidate | Ingestion / reasoning | Analyzer | Prioritization | Verdict |
|---|---|---|---|---|
| **pi session JSONL** [HIGH] | Native post-hoc files; message tree with text, `thinking`, `toolCall`, `toolResult`: **R+** ([pi session format](https://pi.dev/docs/latest/session-format)) | none | none | **Adopt as capture seam**; reject as complete implementation |
| **Claude Code `/insights`** [HIGH facts / MEDIUM architecture] | Claude session corpus; thinking use undocumented: **R?** | per-session facets → aggregation → friction/workflow/coaching report | coaching suggestions; no inspectable scoring | **Borrow architecture** (facet→aggregate→coach). Independent failures: ~30% undercounting ([#79876](https://github.com/anthropics/claude-code/issues/79876)); analyzer token-cap failure cached as false session findings ([#78991](https://github.com/anthropics/claude-code/issues/78991) ✓verified); timezone corruption ([#70149](https://github.com/anthropics/claude-code/issues/70149)) |
| **`claude-improve`** (MIT) [HIGH ✓verified] | current conversation + 5 historical sessions, **user messages only** — assistant/tool history skipped: **R−** ([improve.md](https://raw.githubusercontent.com/TerenceBristol/claude-improve/main/improve.md)) | prompt-driven retrospective cross-referenced with real config files | strongest lightweight ranking found: 10 tiers, recurrence promotion (2+ sessions), confidence labels, acceptance learning, one-at-a-time, verify-before-apply gates | **Borrow architecture**; interactive, Claude-specific, not whole-session |
| **`yahav10/claude-insights`** (MIT) [HIGH] | parses `/insights` HTML, not sessions: **R−** ([parser](https://github.com/yahav10/claude-insights/blob/main/src/parser.ts)) | deterministic report→todos/rules/skills transform | superficial: every friction item "High", every pattern "Medium", no severity/recurrence ([analyzer.ts:79-127](https://github.com/yahav10/claude-insights/blob/main/src/analyzer.ts)) | **Reject** — recreates the unprioritized-finding flood; inherits /insights errors |
| **LangSmith Insights** [HIGH facts / MEDIUM fit] | external chat histories uploadable as traces; reasoning if stored: **R?** ([docs](https://docs.langchain.com/langsmith/insights)) | per-trace summarization → stronger-model hierarchical clustering | executive summary, percentages, categories, representative traces | **Conditional SaaS trial only** (Plus/Enterprise; self-host heavy). $1–4/1k threads, ≤1000 threads, up to 30 min. JS integration omitted all subagent internals ([#2813](https://github.com/langchain-ai/langsmith-sdk/issues/2813)) |
| **Braintrust Topics + Loop** [HIGH] | instrumented/uploaded traces; grouping needed for multi-trace units: **R?** ([Topics](https://www.braintrust.dev/docs/observe/topics)) | Topics: facet→embed→cluster; Loop: interactive trace investigation | recurrence distributions; Loop proposes scorers/prompt changes — user-driven, not automatic per-run | **Reject as observer; borrow facet→cluster→classify**. SaaS or customer-cloud; Topics daily, ≥100 summaries |
| **Phoenix + PXI + coding-harness-tracing** [HIGH facts ✓verified / MEDIUM readiness] | local OTLP; Apache-2.0 adapters for Claude, Codex, Cursor, Copilot, Gemini, Kiro, Opencode, **Oh My Pi** ([repo](https://github.com/Arize-ai/coding-harness-tracing) ✓verified); OpenInference represents visible/redacted/encrypted reasoning: **R+ where adapter emits it** | PXI: in-Phoenix engineering agent, failure-mode checklist → prioritized root-cause hypotheses, prompt edits as approval-gated diffs, evaluator authoring; runs on own Phoenix + own model key ([docs](https://arize.com/docs/phoenix/pxi) ✓verified) | per-investigation prioritization; **no** automatic every-run or cross-run ranking | **Strongest local trial**, not a drop-in. PXI beta, vendor-warns long-trace hallucination. Adapter gaps: high-fidelity/subagent gap ([#86](https://github.com/Arize-ai/coding-harness-tracing/issues/86)); fixed historical 2–3× token inflation ([#77](https://github.com/Arize-ai/coding-harness-tracing/issues/77)) and 422 span loss ([#44](https://github.com/Arize-ai/coding-harness-tracing/issues/44)). "Oh My Pi" is the pi *fork*; upstream-pi fit unverified |
| **Datadog Lapdog + agent-observability skills** [HIGH] | Lapdog launches/traces pi (sessions, tools, costs, permissions): **R?** ([docs](https://docs.datadoghq.com/llm_observability/lapdog.md)) | MIT skills: session classification + trace-tree root-cause analysis | best reusable analyst procedure: signal discovery → open coding → axial taxonomy → symptom-to-root navigation → `Priority / Action / Confidence / Impact` ([RCA skill](https://github.com/datadog-labs/agent-skills/blob/main/agent-observability/agent-observability-trace-rca/SKILL.md)) | **Borrow architecture**; analysis skills require Datadog MCP/pup. Lapdog warns pi capture lost if local agent dies |
| **Galileo AI Assistant** [HIGH facts / MEDIUM fit] | stored traces/spans/sessions + scores: **R?** ([docs](https://docs.galileo.ai/concepts/ai-assistant)) | interactive beta: cross-session pattern search, root-cause with evidence links | top failure patterns + prompt/metric recommendations, but question-driven, not automatic | **Secondary managed trial only**. Proprietary SaaS; vendor warns outputs can be incomplete/incorrect |
| **HarnessScope** (Apache-2.0) [HIGH] | local Claude transcript parser, turn/subagent/token reconstruction, graceful degradation: **R?** ([README](https://github.com/moongioh/harness-scope)) | deterministic governance rules; optional per-session LLM judge | hotspots, no LLM discovery/ranking of improvements | **Borrow transcript-correctness architecture**. Own corpus exposed 2.8× token overcount, 28% turn inflation, an 84% false-positive rule |
| **OpenHands Critic** (MIT) [HIGH] | whole OpenHands event history, not arbitrary pi files: **R?** ([critic](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/critic/impl/api/critic.py)) | classifies behavioral / user-follow-up / infrastructure failure probabilities ([taxonomy](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/critic/impl/api/taxonomy.py)) | sorts by probability; no cross-run clustering | **Borrow taxonomy/refinement gates** |

## Capture/evaluation products without improvement discovery — all reject

- **Langfuse** [HIGH]: capture + configured LLM-judge; no discovery/ranking; heavy self-host. Evaluators fire for 1–2 of 6–7 traces ([#12641](https://github.com/langfuse/langfuse/issues/12641)) or not at all ([#13202](https://github.com/langfuse/langfuse/issues/13202)); unbounded pagination degraded ClickHouse ([#13859](https://github.com/langfuse/langfuse/issues/13859)).
- **W&B Weave** [HIGH]: Apache-2.0, monitors/scorers over known rubrics; no finding discovery. Vendor documents [trace truncation](https://docs.wandb.ai/support/weave/articles/trace-data-is-truncated/) and [worker data loss](https://docs.wandb.ai/support/weave/articles/trace-data-loss-in-worker-processes/).
- **AgentOps** [MEDIUM], **HoneyHive** [MEDIUM]: sessions/traces/scores, no improvement discovery found.
- **Helicone** [HIGH]: explicitly "doesn't run evaluations for you" ([scores docs](https://docs.helicone.ai/features/advanced-usage/scores)).

## Optimization / research systems — all reject for this role; borrow components

All require a runnable instrumented target plus operator-supplied metric/reward and rollout budgets; none discovers what qq should value from arbitrary completed sessions.

- **MAST** [HIGH]: 1,600+ multi-agent traces, 14 failure modes; human agreement κ=0.88, **LLM judge κ=0.77** vs experts ([paper](https://arxiv.org/html/2503.13657)) → borrow empirical taxonomy + judge calibration.
- **DSPy GEPA** [HIGH] ([docs](https://dspy.ai/api/optimizers/GEPA/overview/)) and **MIPROv2** [HIGH] ([docs](https://dspy.ai/api/optimizers/MIPROv2/)) → borrow reflection/holdout selection.
- **Microsoft Trace** [HIGH] ([README](https://github.com/microsoft/Trace)) → borrow trainable-boundary/feedback-propagation concepts; warns whole-graph context fails above hundreds of ops.
- **Agent Lightning** [HIGH] ([README](https://github.com/microsoft/agent-lightning)) → borrow decoupled trace-store/optimizer boundary.
- **TextGrad** [HIGH] ([README](https://github.com/zou-group/textgrad)); **AutoGen AgentOptimizer** [HIGH] ([notebook](https://github.com/microsoft/autogen/blob/0.2/notebook/agentchat_agentoptimizer.ipynb); AutoGen now maintenance-mode) → borrow rollback/early-stop/held-out-test; **Reflexion** [HIGH] ([README](https://github.com/noahshinn/reflexion)) → bounded reflection; **Voyager** [HIGH] ([README](https://github.com/MineDojo/Voyager)) → validated-skill-library precedent.

## Standards — borrow vocabulary only

- **OTel GenAI** [HIGH]: `invoke_agent`/`invoke_workflow`/`execute_tool`, `gen_ai.conversation.id`; content opt-in; conventions still Development ([agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)).
- **OpenInference** [HIGH]: `message_content.type="reasoning"`, redacted-thinking signatures, encrypted content, `session.id` ([semconv](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md)).
- Neither recovers undisclosed hidden chain-of-thought; "reasoning capture" = reasoning the provider/harness actually persists.

## Prioritized documented pitfalls (must shape any build)

1. **BLOCKER** — analyzer-internal errors masquerading as workflow findings: /insights cached its own facet token-limit failure as a durable false diagnosis of healthy sessions ([#78991](https://github.com/anthropics/claude-code/issues/78991) ✓verified).
2. **HIGH** — trace completeness not implied by a visible root: LangSmith JS showed a valid-looking subagent node with no children ([#2813](https://github.com/langchain-ai/langsmith-sdk/issues/2813)); Phoenix adapter gap #86 is the same class.
3. **HIGH** — "prioritized" labels concealing an unranked flood: claude-insights marks everything High/Medium with no impact/recurrence comparison.
4. **HIGH** — naive transcript parsing → confident wrong numbers: HarnessScope measured 2.8× token inflation, 28% turn inflation, 84% false-positive rule.
5. **HIGH** — asynchronous scoring silently skipping sessions (Langfuse evaluator issues above).
6. **MEDIUM** — per-trace summarization bottleneck: anything omitted from the summary cannot affect clustering (LangSmith, documented).
7. **MEDIUM** — newest analysis agents are model-sensitive: PXI long-trace hallucination warning; Galileo incompleteness warning (vendor caveats, not independent reports).
8. **MEDIUM** — evaluation systems optimize what is measured; every optimizer required an operator-supplied metric.

## Proven architecture worth borrowing

- **/insights:** per-session facets → aggregate recurrence/friction → coaching.
- **Datadog RCA skill:** signal discovery → open coding → axial taxonomy → trace-tree root cause → Priority/Action/Confidence/Impact table.
- **claude-improve:** cross-reference findings against actual configuration, recurrence promotion, acceptance learning, one-at-a-time review, verify-before-delete/apply gates.
- **MAST:** empirical failure taxonomy + held-out human calibration of the LLM judge.
- **HarnessScope:** defensive transcript reconstruction, explicit unknown-schema handling, context-window-aware accounting, measured detector precision.
- **PXI / OpenHands:** checklist-driven trace debugging, probability/confidence outputs, approval-gated changes.
- **Optimizers:** rollback, early stop, held-out validation, separation of observed evidence vs mutable target.

## Gaps

- [HIGH] No candidate was installed or exercised against a real qq pi session; findings are from docs, source, issues, and the documented pi file format.
- [HIGH] No platform can recover reasoning the provider does not persist.
- [MEDIUM] Independent failure reports sparse for PXI, Galileo, Braintrust Topics/Loop, Datadog skills, HoneyHive, AgentOps; vendor warnings labeled separately.
- [MEDIUM] No public head-to-head measurement of recommendation precision, stability, or cost.
- [LOW] Several tiny Claude session-analysis repos surfaced; rejected as dashboards or /insights wrappers after inspection.
- [MEDIUM] Pricing/beta status/entitlements current to opened documentation only.

## Sources that shaped the conclusion

1. Arize coding-harness-tracing repo + issues #86/#77/#44; OpenInference semconv; PXI docs ✓.
2. anthropics/claude-code issues #78991 ✓, #79876, #70149.
3. TerenceBristol/claude-improve `improve.md` ✓; yahav10/claude-insights parser/analyzer source.
4. LangSmith Insights docs; langsmith-sdk #2813. Braintrust Topics docs. Galileo AI Assistant docs.
5. Langfuse issues #12641/#13202/#13859; Helicone scores docs; W&B Weave truncation/data-loss docs.
6. MAST (arXiv 2503.13657); DSPy GEPA/MIPROv2 docs; microsoft/Trace; microsoft/agent-lightning; zou-group/textgrad; AutoGen AgentOptimizer notebook; noahshinn/reflexion; MineDojo/Voyager.
7. OTel semantic-conventions-genai agent spans; pi.dev session format; moongioh/harness-scope; OpenHands software-agent-sdk critic; datadog-labs/agent-skills trace-RCA; Datadog Lapdog docs.
