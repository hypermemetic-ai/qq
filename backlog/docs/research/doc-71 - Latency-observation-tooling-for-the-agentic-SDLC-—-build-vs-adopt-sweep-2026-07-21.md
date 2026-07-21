---
id: doc-71
title: 'Latency observation tooling for the agentic SDLC — build-vs-adopt sweep (2026-07-21)'
type: other
created_date: '2026-07-21 02:30'
updated_date: '2026-07-21 02:30'
tags:
  - research
---

# Latency-observation tooling for the agentic SDLC — build vs adopt vs hybrid

**Owning Task:** T-121 (reframed: observation-first latency toolkit for the agentic SDLC).
**Research date:** 2026-07-21 (fresh read-only researcher; web via curl — no dedicated web_search/fetch tools in the substrate).
**Overall confidence:** HIGH on the deciding facts (cross-session stitching, local-first constraint); MEDIUM on candidate-by-candidate details not verified against running installs.
**Settles:** Nothing on the market measures cross-session, multi-agent *SDLC-phase* latency the way qq needs while staying local-first and lean. The strongest harness-native instrument (`@braintrust/pi-extension`) is SaaS-backed. Recommendation: **hybrid leaning build** — qq-owned thin observation core emitting OpenTelemetry-shaped spans, with a disposable local backend (Jaeger all-in-one, optionally Phoenix) mounted only during analysis sprints. Architecture borrowed from Claude Code's trace propagation and the MIT-licensed Braintrust pi extension's span shape.

## The deciding facts

1. **[HIGH] Cross-process, cross-session stitching is a solved *mechanism* but no product ships it for qq's topology.** The mechanism is W3C trace-context propagation: a root span ID injected at the accountable session, inherited by delegates and bash engines as environment context. Claude Code implements exactly this (outbound `TRACEPARENT` to subprocesses; inbound `TRACEPARENT` honored in `-p`/Agent SDK sessions; subagent spans nest under the parent's tool span). qq's `bin/qq-dispatch` chokepoints are the natural injection seam. [Claude Code monitoring docs](https://code.claude.com/docs/en/monitoring-usage)
2. **[HIGH] pi 0.80.10 has no native telemetry export** (no OTel/telemetry/tracing page in the docs index; no catalog observability package other than the Braintrust extension), **but pi already writes the raw local data**: per-entry-timestamped session JSONL at `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl` (verified on this machine — `session`, `model_change`, `message` entries all carry ISO timestamps). A shell/python analyzer over these files plus engine-side timing is a viable owned observation core. [pi session-format docs](https://pi.dev/docs/latest/session-format)
3. **[HIGH] Local-first eliminates every full observability platform except Phoenix and Jaeger.** Langfuse self-host = web + worker + Postgres + ClickHouse + Redis + S3; Helicone self-host adds Kafka/Zookeeper + multiple workers; LangSmith self-host = Kubernetes (ClickHouse/Postgres/Redis); Braintrust self-host = cloud data plane with Braintrust-managed control plane (still an account); Weave = W&B account. [Langfuse self-hosting](https://langfuse.com/self-hosting) · [Helicone docker-compose](https://github.com/Helicone/helicone/blob/main/docker/docker-compose.yml) · [LangSmith self-hosted](https://docs.langchain.com/langsmith/self-hosted) · [Braintrust self-hosting](https://www.braintrust.dev/docs/admin/self-hosting) · [Weave docs](https://weave-docs.wandb.ai/)

## Findings per candidate

### Harness-native (deciding category)

- **Claude Code OTel export (metrics + events + traces-beta)** — [HIGH] Span model: `claude_code.interaction` root per prompt → `claude_code.llm_request` (duration_ms, ttft_ms, token/cache counts) → `claude_code.tool` (permission-wait and execution child spans) → subagent spans nested under the parent's tool span. Exports OTLP to any collector (`localhost:4317`). Traces off by default; require `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`. **Cross-session multi-agent: YES within Claude Code** (TRACEPARENT propagation in both directions; interactive sessions deliberately ignore inbound TRACEPARENT). **qq fit: none as a product** (Claude-only) — but this is the **reference architecture to borrow**: env-var trace-context injection at spawn points, span-per-phase vocabulary, latency attributes on LLM spans. [docs](https://code.claude.com/docs/en/monitoring-usage)
- **`@braintrust/pi-extension@0.10.0`** — [HIGH on capability] pi-native extension; traces Session (root) → Turn → LLM (tokens, cache, TTFT, est. cost) → Tool spans, plus Compaction and `/tree` branch-summary spans. **Cross-session stitching seam exists**: `PI_PARENT_SPAN_ID` / `PI_ROOT_SPAN_ID` env vars parent a session's trace under an external root — precisely what an accountable session would set before `bin/qq-dispatch`. Compatibility: last five pi minor versions, CI-tested (0.65.0+; 0.80.x inside window). MIT license; actively maintained (pushed 2026-07-20); tiny adoption (7 stars). **FATAL constraint failure: data leaves the machine** — exports to Braintrust cloud (`api.braintrust.dev`); self-host Braintrust is a cloud-account data-plane deployment, not offline local-first. **Verdict: borrow-architecture (read the MIT source for span shape + extension-API hooks); reject as adoption** unless the operator relaxes local-first. [README](https://github.com/braintrustdata/braintrust-pi-extension) · [pi catalog](https://pi.dev/packages)
- **pi native session JSONL** — [HIGH] Every pi session already persists timestamped entries (messages, tool calls/results, model changes, compaction) locally with a documented format and a documented SessionManager API. **Cross-session multi-agent: NO by itself** (per-session files; no cross-file correlation ID) — qq would inject its own correlation IDs into work orders/envelopes (qq already controls both texts). **Verdict: adopt as the data seam of an owned toolkit** — zero new machinery, offline by construction, terminal-queryable. [docs](https://pi.dev/docs/latest/session-format)
- **OpenAI Codex / opencode** — [MEDIUM-HIGH] No documented user-facing telemetry/OTel export (codex docs tree contains no otel/telemetry reference; opencode docs nav has no observability/telemetry page; opencode config page mentions none). Recorded for completeness; qq's engines run on pi + bash anyway.

### LLM observability platforms

- **Arize Phoenix** — [HIGH] OTel-native (ingests OTLP), **runs truly locally**: `pip install arize-phoenix && phoenix serve`, single process, Docker image available; ELv2 license; very active (release v19.3.0 dated 2026-07-20; 10.6k stars). OpenInference semconv includes `session.id` for session grouping. **Cross-session multi-agent: YES as backend** — any emitter that parents spans under one trace ID produces a unified multi-process waterfall; `session.id` groups traces. Analysis: trace waterfalls, span attribute search, evals; **not SDLC-phase-aware** (no orientation/plan/review vocabulary — qq supplies that via span names). No intervention features relevant to qq. **Verdict: trial as the disposable visualization/analysis backend** (heaviest acceptable weight: one pip process, on-demand not always-on). [README](https://github.com/Arize-ai/phoenix) · [OpenInference semconv](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md)
- **Jaeger all-in-one** — [HIGH] Single container (`docker run -p 16686:16686 -p 4317:4317 cr.jaegertracing.io/jaegertracing/jaeger:2.13.0`), in-memory storage, OTLP ingest, latency-focused waterfall UI. Zero GenAI awareness (no token/session analysis). **Cross-session multi-agent: YES as dumb-but-honest trace store.** **Verdict: trial alongside Phoenix; lighter and license-clean (Apache-2.0), weaker analysis.** [docs](https://www.jaegertracing.io/docs/2.13/getting-started/)
- **Langfuse** — [HIGH] Trace/session model fits (Sessions group multi-trace interactions; "Trace IDs & Distributed Tracing" supports externally-set IDs), but self-host weight (2 app containers + Postgres + ClickHouse + Redis + S3) fails qq's lean doctrine; SDK-centric instrumentation is not pi/bash-native. **Verdict: reject adoption; borrow the Sessions/Trace-ID grouping vocabulary.** [self-hosting](https://langfuse.com/self-hosting) · [sessions](https://langfuse.com/docs/tracing-features/sessions)
- **OpenLIT / OpenLLMetry** — [MEDIUM-HIGH] Apache-2.0 OTel-native instrumentation SDKs (Python/TS/Go) tracking the OTel GenAI semconv; optional UI platform. Value to qq is the **semconv-aligned attribute vocabulary**, not the platform (auto-instrumentation targets LLM client libraries, not bash engines or pi extensions). **Verdict: borrow (semconv); reject platform.** [README](https://github.com/openlit/openlit)
- **Helicone** — [HIGH] Gateway/proxy model: observes LLM HTTP calls, not SDLC phases; self-host is Kafka+ClickHouse+Postgres+Redis+MinIO+workers — heaviest in class. **Cross-session SDLC latency: NO. Verdict: reject.** [docker-compose](https://github.com/Helicone/helicone/blob/main/docker/docker-compose.yml)
- **LangSmith** — [MEDIUM-HIGH] SaaS-first; self-host = Kubernetes install (ClickHouse/Postgres/Redis), enterprise-gated. Account wall + weight both fail. **Verdict: reject.** [docs](https://docs.langchain.com/langsmith/self-hosted)
- **Braintrust (platform)** — [MEDIUM-HIGH] SaaS; self-host = your-cloud data plane (Postgres/Redis/Brainstore) with Braintrust-managed UI/control plane — data-residency option, not offline. **Verdict: reject platform; the pi extension (above) is the valuable artifact.** [docs](https://www.braintrust.dev/docs/admin/self-hosting)
- **W&B Weave** — [MEDIUM] W&B-account-backed tracing; self-managed via W&B platform. Account wall fails. **Verdict: reject.** [docs](https://weave-docs.wandb.ai/)

### Standards

- **OpenTelemetry GenAI semantic conventions** — [HIGH] Now live in their own repo (`open-telemetry/semantic-conventions-genai`). Agent spans exist: `create_agent`, `invoke_agent`, **`invoke_workflow`** (explicitly "a coordinated process composed of multiple agents"), `plan`, `execute_tool`; attributes `gen_ai.agent.id/name`, `gen_ai.conversation.id` (session/thread correlation). All status **Development** (unstable). **Cross-session multi-agent: YES as vocabulary** — qq's phases map naturally (session = workflow, Change = workflow, delegate = invoke_agent, engine run = execute_tool). **Verdict: adopt the vocabulary at qq's own span layer; pin names loosely given Development status.** [agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)

### Terminal-native / benchmarks

- **hyperfine-class CLI benchmarking** — [HIGH] 28.5k stars, Apache-2.0, single binary; measures wall-time of `bin/qq-*` engine invocations with statistics. Complements tracing; cannot attribute inside a run. **Verdict: adopt for engine-level before/after probe evidence** (matches T-121's existing probe doctrine).
- **SWE-bench-style harnesses** — [LOW, gap] Record per-instance wall-time but are benchmark rigs, not observation tools; vocabulary source only. Not deep-dived this run.

### Agentic-SDLC platforms (Cursor, Devin, Factory)

- [MEDIUM, per brief recorded as constraint failures without deep dives] Closed SaaS products with built-in telemetry for *their* loops; no pi/bash harness embedding, account-walled, non-exportable. Vocabulary harvest only (e.g., Factory's "droid" phase naming). **Verdict: reject.**

## Analysis axis note

[INFERENCE, MEDIUM] No candidate does qq's real analysis asks out of the box — phase attribution of an SDLC loop, recurrence/reuse detection (would a cache hit?), critical-path ranking. Trace UIs show waterfalls; the "what do I optimize first" ranking must be qq-owned regardless of backend. This weakens the case for adopting any heavy platform: the analysis core is build work either way, and it can run over plain span files (JSONL/SQLite) without a server.

## Verdicts summary — cross-session multi-agent latency, explicit per candidate

| Candidate | Cross-session multi-agent latency? | Local-first? | Verdict (confidence) |
|---|---|---|---|
| Claude Code OTel traces | YES (Claude topology only) | YES (OTLP to local collector) | borrow-architecture (HIGH) |
| `@braintrust/pi-extension` | YES for pi (PI_PARENT/ROOT_SPAN_ID seam) | **NO** (SaaS export) | borrow-architecture; reject adoption (HIGH) |
| pi session JSONL (native) | NO alone; yes with qq correlation IDs | YES by construction | adopt as data seam (HIGH) |
| Arize Phoenix | YES (OTLP + session.id) | YES (`phoenix serve`) | trial as disposable backend (HIGH) |
| Jaeger all-in-one | YES (dumb store) | YES (one container) | trial as disposable backend (HIGH) |
| Langfuse self-host | YES (sessions + external trace IDs) | Weight fails | reject; borrow vocabulary (HIGH) |
| OpenLIT/OpenLLMetry | Partial (library instrumentation) | UI optional | borrow semconv (MEDIUM-HIGH) |
| Helicone | NO (LLM-call proxy only) | Weight fails | reject (HIGH) |
| LangSmith | YES (within LangChain tracing) | Account wall | reject (MEDIUM-HIGH) |
| Braintrust platform | YES | Account wall | reject (MEDIUM-HIGH) |
| W&B Weave | YES | Account wall | reject (MEDIUM) |
| OTel GenAI semconv | YES as vocabulary | n/a | adopt vocabulary, loosely (HIGH) |
| hyperfine | NO (point measurement) | YES | adopt for probes (HIGH) |

## Build-vs-adopt-vs-hybrid recommendation

**HYBRID, leaning build.** (a) **Build** the observation core qq-owned: timestamped span records (start/end/phase/actor/correlation-ID) emitted by ~a few hundred lines around the `bin/qq-*` chokepoints and by reading pi session JSONL post-hoc; correlation IDs injected into work orders and envelopes (qq controls both texts — propagation by construction). Span names follow OTel GenAI `invoke_workflow`/`invoke_agent`/`execute_tool` vocabulary so any OTel backend can consume them later. (b) **Mount** (don't mirror) a disposable backend — Jaeger all-in-one or Phoenix — only during analysis sprints; both accept OTLP and can be deleted without state loss. (c) **Adopt nothing as a platform.** The deciding fact: the only pi-native instrument (Braintrust extension) ships data to a SaaS; the only local-first platforms require qq to write all its own instrumentation anyway, which *is* the toolkit. Borrow freely from MIT/Apache sources: Claude Code's TRACEPARENT propagation design, the Braintrust pi extension's span shape and pi extension-API hook points, OTel GenAI span names, OpenInference `session.id`.

## Sources (only those that shaped conclusions)

- Claude Code monitoring/OTel docs — https://code.claude.com/docs/en/monitoring-usage (span hierarchy, TRACEPARENT propagation, latency attributes)
- `@braintrust/pi-extension` README + repo metadata — https://github.com/braintrustdata/braintrust-pi-extension (MIT, span shape, PI_PARENT_SPAN_ID seam, compat window)
- pi docs — https://pi.dev/docs/latest/session-format, https://pi.dev/docs/latest/usage, https://pi.dev/packages (no native telemetry; JSONL seam; catalog check)
- pi session files on this machine — `~/.pi/agent/sessions/**/*.jsonl` (verified per-entry timestamps)
- OTel GenAI semconv — https://github.com/open-telemetry/semantic-conventions-genai (agent/workflow spans, conversation.id, Development status)
- Phoenix — https://github.com/Arize-ai/phoenix (local serve, ELv2, OTLP), https://github.com/Arize-ai/openinference (session.id)
- Jaeger — https://www.jaegertracing.io/docs/2.13/getting-started/ (all-in-one, OTLP ports)
- Langfuse — https://langfuse.com/self-hosting, https://langfuse.com/docs/tracing-features/sessions (stack weight; sessions model)
- Helicone — https://github.com/Helicone/helicone/blob/main/docker/docker-compose.yml (stack weight)
- LangSmith — https://docs.langchain.com/langsmith/self-hosted (K8s/enterprise)
- Braintrust — https://www.braintrust.dev/docs/admin/self-hosting (data-plane self-host, managed control plane)
- Weave — https://weave-docs.wandb.ai/ (account-backed)
- OpenLIT — https://github.com/openlit/openlit (Apache-2.0, semconv alignment)
- hyperfine — https://github.com/sharkdp/hyperfine (stars/license/activity)
- Local doctrine: doc-16 (cache as optimization never authority), doc-60/doc-63 (prior sweeps, empty-adoption precedent)

## Gaps

- No candidate was installed or run; all fit claims are from docs/repos, not runtime Checks.
- Grafana Tempo, SigNoz, LangWatch, Opik not verified this run (same class as Jaeger/Phoenix; Tempo is the most likely additional trial).
- `raindrop-ai/pi-agent` and `remnic/plugin-pi` catalog entries could not be fetched (404 on default branch) — possible additional pi-native observability leads; unverified.
- SWE-bench-style harness wall-time recording not deep-dived (LOW).
- Agentic-SDLC platforms (Cursor/Devin/Factory) recorded as constraint failures without doc dives, per brief.
- Braintrust pi extension's exact pi extension-API hook points (event names) not yet read in source — first step if the build path proceeds.
- Whether pi-subagents background runs inherit parent env vars (for correlation-ID propagation) unverified — qq-side experiment needed.
