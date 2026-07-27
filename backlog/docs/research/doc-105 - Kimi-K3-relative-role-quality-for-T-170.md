---
id: doc-105
title: Kimi K3 relative role quality for T-170
type: other
created_date: '2026-07-27 04:37'
updated_date: '2026-07-27 04:38'
tags:
  - research
  - models
  - observer
---
# Kimi K3 relative role quality for T-170

**Owning Task:** T-170

**Research date:** 2026-07-27

**Overall confidence:** **MEDIUM-HIGH**
**Settles:** Of qq's four currently GPT-5.6 delegated roles, assign Kimi K3 at max effort to **Observer** and retain GPT-5.6 Sol for implementer, reviewer, and researcher. A local paired trial is useful calibration, not required before the initial assignment.

Method: a fresh read-only researcher characterized all four role contracts from current Repository source, opened current provider and independent benchmark sources, separated direct evidence from role-mapping inference, and returned a strict Completion Envelope. The accountable owner spot-checked the load-bearing Artificial Analysis analytical/rubric scores, Semgrep review precision, and Moonshot limitation claims against the opened sources. No Repository or machine settings were changed and no live model call was made.

## Findings

### 1. Observer is K3's strongest relative quality fit

- **[HIGH, observed]** On Artificial Analysis's AA-Briefcase agentic knowledge-work benchmark, K3 scored **1543 Elo** against GPT-5.6 Sol's **1501**, passed **51%** of objective rubrics against **41.8%**, and reached **1754 analytical-quality Elo**. GPT retained the presentation lead (**1660 vs 1471**) [Artificial Analysis](https://artificialanalysis.ai/articles/kimi-k3-agentic-knowledge-benchmark).
- **[MEDIUM-HIGH, inference]** AA-Briefcase is the closest opened benchmark to Observer's actual quality demand: long-horizon analysis over thousands of linked inputs, with correctness and analytical judgment weighted separately from presentation. Observer likewise synthesizes run packages into strict, evidence-referenced JSON; presentation quality is immaterial. No other qq role has a comparably large, role-congruent K3 advantage.
- **[HIGH, counterevidence]** Broad current indices still favor GPT-5.6 Sol: Artificial Analysis reports higher overall intelligence, coding, and agentic aggregates for GPT. Observer is selected because its closest sub-evaluation reverses that general ordering, not because K3 is universally stronger [direct comparison](https://artificialanalysis.ai/models/comparisons/kimi-k3-vs-gpt-5-6-sol).

### 2. Keep GPT-5.6 for implementation

- **[MEDIUM, observed]** Independent broad coding scores narrowly favor GPT; Moonshot's own table is mixed. K3 trails GPT on DeepSWE and Terminal-Bench but leads on several long-horizon tasks under differing harnesses [Kimi K3 launch](https://www.kimi.com/blog/kimi-k3) · [GPT-5.6 launch](https://openai.com/index/gpt-5-6/).
- **[MEDIUM, inference]** Mixed harness-dependent evidence does not establish a K3 quality advantage for bounded implementation. Moonshot's warning that K3 can make unexpected decisions under ambiguity directly conflicts with qq implementers' strict scope and operator-intent boundary.

### 3. Keep GPT-5.6 for research

- **[MEDIUM, observed]** K3 has strong browsing evidence, but GPT retains small leads on several knowledge/reasoning measures and a higher combined factuality/calibration score. No opened benchmark tests qq's decisive researcher requirements: opened-source citation validity, freshness, corroboration, and explicit fact/inference/gap separation.
- **[MEDIUM, inference]** The slight browsing advantage is insufficient to move a decision-grade evidence role without direct citation-discipline evidence.

### 4. Reviewer is the least suitable substitution

- **[MEDIUM-HIGH, observed]** Semgrep's controlled guided-prompt IDOR review found K3 precision/recall/F1 of **0.684/0.226/0.340**, versus GPT-5.6 Sol's **0.880/0.250/0.389**. On Semgrep's shared multimodal harness, K3 reached **0.400 F1** versus GPT's **0.617**. K3 also underperformed on the largest repository fixture, though one fixture does not prove repository size caused the gap [Semgrep](https://semgrep.dev/blog/2026/kimi-k3s-code-security-results-lack-precision).
- **[HIGH, inference]** Reviewer quality depends heavily on grounded precision and material-finding discipline; the closest controlled evidence rejects K3 for this seat.

## Compatibility and limitations

- **[HIGH, vendor fact]** Moonshot warns that K3 quality can become unstable if a harness drops preserved thinking history or switches models mid-session, and that K3 may be excessively proactive [launch limitations](https://www.kimi.com/blog/kimi-k3). Current Pi uses the native `kimi-coding/k3` Anthropic-compatible route, records thinking blocks/signatures, and starts delegates fresh. Preserving that transport is a condition of this recommendation, not yet a live-call proof.
- **[HIGH, observed]** Kimi's model configuration documents `low|high|max`; default is currently high, and `xhigh|max|ultra` map to max. T-170 must select max explicitly [Kimi Code models](https://www.kimi.com/code/docs/en/kimi-code/models).
- **[MEDIUM, inference]** Observer's explicit procedure and deterministic schema/citation/cost validation constrain but do not eliminate K3 proactiveness. It can still over-classify episodes, infer unsupported causes, or recommend overbroad remedies.

## Trial disposition

**[MEDIUM-HIGH]** A local paired Observer trial is not necessary to make an evidence-supported initial assignment. AA-Briefcase supplies a current, uncertainty-bounded, materially role-congruent K3 advantage, while all alternatives have weaker or adverse evidence. A later paired calibration should measure qq-specific schema validity, citation correctness, episode precision/recall, remedy restraint, and non-enactment before any broader K3 rollout.

## Sources

- [Moonshot — Kimi K3 launch, evaluations, methodology, and limitations](https://www.kimi.com/blog/kimi-k3)
- [Kimi Code — model configuration](https://www.kimi.com/code/docs/en/kimi-code/models)
- [OpenAI — GPT-5.6 launch and evaluations](https://openai.com/index/gpt-5-6/)
- [OpenAI — GPT-5.6 Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Artificial Analysis — K3 AA-Briefcase report](https://artificialanalysis.ai/articles/kimi-k3-agentic-knowledge-benchmark)
- [Artificial Analysis — K3 vs GPT-5.6 Sol](https://artificialanalysis.ai/models/comparisons/kimi-k3-vs-gpt-5-6-sol)
- [Semgrep — controlled K3 code-security review evaluation](https://semgrep.dev/blog/2026/kimi-k3s-code-security-results-lack-precision)

## Gaps

- No direct paired qq Observer run measures citation validity, schema acceptance, episode precision, or non-enactment.
- AA-Briefcase is private and analogous rather than identical to Observer run-package analysis.
- Benchmark snapshots drift slightly, though the current Observer-specific advantage remains consistent across the dated and live AA surfaces.
- Preserved-thinking compatibility was source-inspected but not verified with a live paid/provider request.
