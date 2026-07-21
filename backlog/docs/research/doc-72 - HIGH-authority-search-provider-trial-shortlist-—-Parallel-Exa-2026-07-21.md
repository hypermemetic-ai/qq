---
id: doc-72
title: HIGH-authority search-provider trial shortlist — Parallel + Exa (2026-07-21)
type: other
created_date: '2026-07-21 02:31'
updated_date: '2026-07-21 02:37'
---
# HIGH-authority search-provider trial shortlist — Parallel + Exa

**Owning Task:** T-125

**Researched:** 2026-07-21

**Overall confidence:** **MEDIUM** on the two-key recommendation; **HIGH** on official limits and on Tavily/Brave/Parallel/Perplexity trial terms; **MEDIUM** on Exa free-credit amounts because two official surfaces conflict; **MEDIUM** on the negative finding that no independent general-purpose comparison exists (timeboxed search).

**What this settles:** Key **Parallel** and **Exa** for qq's quality-and-speed trial. This is a trial-cost/coverage choice with a useful but interested-party prior, **not** a quality winner declaration. qq's frozen, equal-budget corpus remains the authority. If the operator declines Parallel's card requirement, substitute **Tavily**.

## Findings

### 1. No independent apples-to-apples authority exists

- **MEDIUM / gap / decision-critical:** I found no 2025–2026 academic paper, independent engineering evaluation, or framework-owned benchmark that compares the candidates' current raw search APIs on both answer quality and latency. The qualifying comparisons located are owned by Parallel, Exa, Tavily, Perplexity, or another search vendor. Their disclosed methods are useful trial priors, but each owner wins its own main evaluation. Framework integration is adoption evidence only and cannot resolve quality.
- **HIGH / inference:** Therefore qq should not choose a standing provider from reputation or a vendor leaderboard. It should choose two inexpensive, sufficiently different contenders, reproduce the public slices below, then decide from qq's own workload.

### 2. Freshest broad vendor claim puts Parallel and Exa on the quality/latency frontier

- **MEDIUM / observed interested-party claim:** Parallel's July 10–12, 2026 benchmark uses four public corpora plus one proprietary coding set, a GPT-5.4 agent with up to 20 tool calls, GPT-5.4 grading, and client-wall-clock p50 from `us-central`; it explicitly reports the **best across multiple runs**. Its published fast-mode results are:

| Corpus | Parallel Turbo | Exa Instant | Brave | Tavily Ultra Fast |
|---|---:|---:|---:|---:|
| BrowseComp (1,266) | **51.0% / 216 ms** | 33.7% / 361 ms | 38.3% / 430 ms | 19.3% / 357 ms |
| HLE | **52.7% / 220 ms** | 49.3% / 358 ms | 47.7% / 563 ms | 42.0% / 243 ms |
| WebWalkerQA | **75.7% / 217 ms** | 65.0% / 336 ms | 65.7% / 503 ms | 63.7% / 240 ms |
| SimpleQA (4,326) | **91.0% / 240 ms** | 89.3% / 335 ms | 87.0% / 475 ms | 72.0% / **150 ms** |
| Coding (proprietary) | **79.7% / 216 ms** | 76.7% / 341 ms | 64.3% / 514 ms | 71.9% / **208 ms** |

  Source and method: [Parallel Quality Benchmarks](https://parallel.ai/benchmarks). Public corpora are reproducible; the coding set is not. Exact reproduction is still blocked by unpublished run artifacts/provider harness details, unequal fetch capability (Parallel/Exa/Tavily get `web_fetch`; Brave does not), owner-selected best runs, and different provider modes. Treat the ranking as a hypothesis.
- **MEDIUM / inference:** Even after discounting owner bias, **Parallel + Exa** is the strongest two-provider trial prior: Parallel leads all five owner-reported accuracy rows at roughly 216–240 ms; Exa is within 1.7–3.4 points on HLE, SimpleQA, and coding and gives a different retrieval system to challenge it. Tavily is occasionally faster but materially lower in the same disclosed runs; Brave is slower in every row.

### 3. Exa's open coding corpus directly matches qq—and partially contradicts Parallel

- **MEDIUM / observed interested-party claim:** Exa's public WebCode RAG track contains **307 JSONL coding/documentation queries** and runs five results through the same GPT-5-mini synthesis and GPT-5.4 grader. Exa reports groundedness **79.4**, Brave **76.3**, Parallel **75.3**, Perplexity **64.6**, and Tavily **61.1**. Brave, not Exa, leads citation precision (**0.328** vs Exa **0.259**, Perplexity **0.220**, Parallel **0.168**, Tavily **0.159**) ([repo README at `4e4dfc8`](https://github.com/exa-labs/benchmarks/blob/4e4dfc86d44f02911397661c936474052da4a940/README.md#webcode-results), [RAG runner](https://github.com/exa-labs/benchmarks/blob/4e4dfc86d44f02911397661c936474052da4a940/webcode-benchmark/evals/rag.py), [query corpus](https://github.com/exa-labs/benchmarks/blob/4e4dfc86d44f02911397661c936474052da4a940/webcode-benchmark/data/rag/code_rag.jsonl)).
- **HIGH / observed replicability:** qq can directly rerun or sample this track: the questions, gold answers, citation excerpts, provider adapters, model names, result count, and grader are published. It includes W3C specs, GNU manuals, Python/Spring/Rust docs, IETF material, and other sources close to qq's research work. Residual reproducibility gap: published aggregate rows have no signed/raw run artifacts, and the owner chose Exa `fast` with forced live crawl, Brave `llm_context`, Parallel `base`, Tavily `advanced`, and Perplexity `sonar`—not equivalent cost/latency modes.

### 4. Tavily's reproducible vendor benchmark reverses the ranking

- **MEDIUM / observed interested-party claim:** Tavily's evaluation repo claims SimpleQA accuracy of **93.3% Tavily**, **85.92% Perplexity Search**, **82.15% Serper**, **76.05% Brave**, and **71.24% Exa**; its dynamic document-relevance claim is **83.02% Tavily**, **71.2% Perplexity Search**, **58.11% Serper**, **56.2% Brave**, and **51.33% Exa** ([README at `99feb7d`](https://github.com/tavily-ai/tavily-search-evals/blob/99feb7decc9be67edb49a63d3985cf6094c873f2/README.md), [frozen config](https://github.com/tavily-ai/tavily-search-evals/blob/99feb7decc9be67edb49a63d3985cf6094c873f2/configs/config.json)). The full 4,326-question SimpleQA file, 1,000-query dynamic dataset, code, and parameters are present, so qq can replicate a slice.
- **HIGH / inference:** The reversal versus Parallel (Tavily 93.3/Exa 71.24 there, versus Parallel's Tavily 72/Exa 89.3) is itself the most useful finding. Different modes, content budgets, model generations, dates, and vendor-controlled reporting dominate the apparent ranking. Tavily publishes no raw result directory for its headline run. No vendor score should settle T-125.

### 5. A serious entrant exists, but it answers a narrower question

- **MEDIUM / observed interested-party claim:** NewsCatcher's **CatchAll** Q1 2026 benchmark publishes 32 time-bounded event-enumeration queries and precision/recall/F1 methodology. CatchAll Base reports F1 **0.705** versus Exa Websets **0.317**; in its cheaper tier CatchAll Lite reports **0.512** versus Parallel **0.406**. It candidly limits recall to the union found by all systems, uses different provider sets by tier, and offers raw data/query list only on request ([Q1 2026 benchmark](https://www.newscatcherapi.com/blog-posts/web-search-api-benchmark-q1-2026)). This is credible evidence for exhaustive event monitoring, not for low-latency general search: Base averaged about **$27.80/query**, Lite **$1/query**, and Tavily/Brave/ordinary Exa Search were absent. Do not spend one of qq's two keys on it for this trial.

## Current trial economics and signup friction (official pages only)

| Provider | Free quota / trial value | Card and signup friction | Default trial rate limit | Trial implication |
|---|---|---|---|---|
| **Parallel** | Current monthly credit is **$5**, enough for up to **5,000 Turbo** searches at $1/1K, or **1,000 basic/advanced** searches at $5/1K; unused monthly credit expires. | Account signup says no card, but **activating the monthly $5 credit requires a card**, one eligible organization per card. | **600 RPM** Search. | Largest current free fast-search corpus; card is the one material friction. ([free-credit announcement, 2026-07-15](https://parallel.ai/blog/free-tier-parallel), [pricing](https://docs.parallel.ai/getting-started/pricing), [limits](https://docs.parallel.ai/getting-started/rate-limits)) |
| **Exa** | Live pricing shows **$20 on signup + $10/month** (Search $7/1K), but the official billing page modified 2026-05-24 still says **$10 after onboarding + $7/month**. | Onboarding credit is stated for new accounts without a payment-method condition; **monthly credit requires a payment method on file**. Exact current amounts must be confirmed in the dashboard because the official pages conflict. | `/search` **10 QPS**. | Even the older $10 onboarding grant is ample for the trial; do not budget from the higher figure until signup. ([pricing](https://exa.ai/pricing), [billing](https://exa.ai/docs/reference/billing), [limits, modified 2026-07-20](https://exa.ai/docs/reference/rate-limits)) |
| **Tavily** | **1,000 credits/month**: 1,000 basic or 500 advanced searches. | **No credit card required.** | Development key **100 RPM**; production 1,000 RPM requires paid/PAYGO. | Lowest-friction fallback if Parallel's card is declined. ([credits/pricing](https://docs.tavily.com/documentation/api-credits), [limits](https://docs.tavily.com/documentation/rate-limits)) |
| **Brave Search API** | **$5/month**, and Search costs $5/1K = 1,000 searches/month. | **Card required** as anti-fraud identity check; official page says it is not charged for the free plan. | Search **50 QPS**. | Cheap and independent-index baseline, but current disclosed latency prior is weaker. ([official API plans/FAQ](https://brave.com/search/api/)) |
| **Perplexity Sonar** | No recurring free-credit amount is documented. Sonar low-context request fee is **$5/1K plus $1/M input and output tokens**. | API-group setup requires a **credit card** and uses prepaid credits. | New Tier 0 `sonar`: **50 RPM**. | **HIGH decision impact:** official quickstart now labels Sonar “in maintenance mode” and tells new projects to prefer Agent API; Sonar bundles retrieval and synthesis, so it is not a clean raw-search contestant. Exclude it. ([pricing](https://docs.perplexity.ai/docs/getting-started/pricing), [billing](https://docs.perplexity.ai/docs/getting-started/api-groups), [limits](https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers), [quickstart](https://docs.perplexity.ai/docs/getting-started/quickstart)) |

## Recommendation

**Sign up for Parallel and Exa (MEDIUM confidence).** This is the best cheap trial pair, not an adoption verdict:

1. **Parallel Turbo** supplies up to 5,000 free monthly calls after card verification and is the only candidate on the disclosed 2026 quality/latency frontier across several public corpora.
2. **Exa Instant/Fast** supplies at least a documented onboarding credit (the official amount conflicts), is the closest challenger in that same comparison, and publishes the only directly qq-like coding/documentation RAG corpus.
3. Freeze provider mode, result count, content budget, region, concurrency, and date. Run a speed lane (`parallel: turbo`, `exa: instant`) and a quality lane at equal dollar/content budgets; otherwise mode choice will masquerade as provider quality.
4. Include a frozen sample of Exa WebCode plus qq's real recent research prompts. Record p50/p95 wall time, successful responses, inspected precision@5, authoritative-source recall, citation validity, content completeness, and cost. The public benchmark slice is a calibration check; **qq's paired real-workload result decides**.

**Fallback:** if card entry is out of scope, use **Tavily + Exa**. Tavily is the only top candidate with an explicit no-card key and 1,000 monthly credits, but current vendor evidence does not justify replacing Parallel on quality/speed grounds.

## Sources that shaped the conclusion

1. Parallel Quality Benchmarks (tests 2026-07-10–12), current pricing/rate-limit docs, and 2026-07-15 free-credit announcement.
2. Exa `exa-labs/benchmarks` at `4e4dfc86d44f02911397661c936474052da4a940`; current Exa pricing, billing, and rate-limit docs.
3. Tavily `tavily-search-evals` at `99feb7decc9be67edb49a63d3985cf6094c873f2`; current Tavily credit and rate-limit docs.
4. Brave's official Search API plans/FAQ.
5. Perplexity's official pricing, billing, rate-limit, and quickstart pages.
6. NewsCatcher's 2026-04-08 Q1 benchmark for the specialized CatchAll entrant.

## Gaps and residual risks

- No independent, current, general-purpose provider comparison was located; this negative finding is timeboxed, not proof that none exists anywhere.
- Parallel's public-corpus rows lack the exact harness/raw traces and select best runs; its coding corpus is proprietary.
- Exa's official pricing and billing pages disagree on both signup ($20 vs $10) and monthly ($10 vs $7) credits; the billing page conditions monthly credits on a payment method. Verify the dashboard during signup and record the actual grant.
- Vendor benchmarks use materially different endpoint modes and output budgets; leaderboard deltas may measure configuration and bundled extraction, not index/ranking quality.
- Public static corpora can be contaminated or cached; qq's recent package/repository questions and date-sensitive prompts must dominate the final decision.
- Latency is region-, load-, mode-, and concurrency-dependent. None of the cited numbers predicts qq's p95 from this machine.
- Firecrawl/Jina are primarily fetch/extraction complements; Serper wraps Google; Linkup/You.com had no stronger qualifying general comparison in this timebox. They were not ruled out permanently.
