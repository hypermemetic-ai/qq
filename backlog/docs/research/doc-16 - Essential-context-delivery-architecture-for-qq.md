---
id: doc-16
title: Essential context delivery architecture for qq
type: other
created_date: '2026-07-12 03:03'
updated_date: '2026-07-12 03:05'
tags:
  - research
  - architecture
  - context-engineering
---
# Essential context delivery architecture for qq

_Owning Task: TASK-2 · Research date: 2026-07-11 · Overall confidence: **HIGH** on the architecture and **MEDIUM** on runtime-specific behavior surviving upgrades._

This report settles the logical architecture for delivering essential context. It does **not** choose which methodology rules survive, their wording, exact token budgets, or implementation details.

## Decision

Adopt a **portable content plane with disposable native control-plane adapters**.

The portable plane is plain, versioned repository content with one authored home per fact or rule. The runtime adapter decides how to expose that content through the runtime's native instruction, Skill, agent, hook, MCP, compaction, and caching mechanisms. Runtime files may link to or load canonical content, but they must not become another semantic source of truth.

The working model is:

```text
canonical content plane
  ├─ bootstrap kernel       always loaded; small map + invariants
  ├─ Skills                conditional procedures; progressively disclosed
  ├─ knowledge             facts/evidence; retrieved from the owning source
  └─ Task/checkpoint state current objective, decisions, Checks, next step
              │
              ▼
disposable runtime adapter
  ├─ native instruction file / message role
  ├─ native Skill discovery
  ├─ context capsule → specialist agent
  └─ optional hooks, MCP, compaction, memory, and caching
              │
              ▼
model-visible context
  bootstrap + current task + selected procedure + bounded evidence
```

**[HIGH, architecture inference]** The stable interfaces are the content categories and the context-capsule contract. `AGENTS.md`, `CLAUDE.md`, agent-profile formats, hook schemas, plugin packages, and model-specific cache/compaction fields are replaceable adapters.

## Controlling GPT-5.6 Sol requirements

OpenAI's current guidance is authoritative for the model in use.

- **[HIGH] Lean, one-copy context is a model requirement.** GPT-5.6 Sol guidance says to keep the outcome, success and stopping criteria, safety/evidence/permission boundaries, necessary routing, output contract, and validation requirements; it says to remove repeated rules, obsolete scaffolding, irrelevant examples, and unrelated tools. OpenAI reports directional internal coding-agent results in which leaner system prompts improved scores by about 10–15% while reducing tokens by 41–66% and cost by 33–67%. Changes still require representative evals. [Prompting guidance for GPT-5.6 Sol](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6), [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- **[HIGH] Capacity is not a target.** GPT-5.6 Sol exposes a 1,050,000-token window, but requests above 272K input tokens change pricing for the whole request. The architecture should therefore optimize minimum sufficient context, not fill the nominal window. [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- **[HIGH] Always-on project guidance has lifecycle and size constraints.** Codex constructs its global-plus-root-to-CWD `AGENTS.md` chain once per run/session, concatenates layers, and stops at 32 KiB by default. This is a bootstrap surface, not a live knowledge store. [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- **[HIGH] Skills provide native progressive disclosure.** Codex initially exposes Skill names, descriptions, and paths; the catalog is limited to 2% of context, or 8,000 characters when the window is unknown. Full `SKILL.md` content loads only after activation, with deeper resources read as needed. Essential invariants cannot depend on implicit Skill activation, but conditional procedures should. [Build skills](https://learn.chatgpt.com/docs/build-skills)
- **[HIGH] Tools are context too.** Tool and MCP schemas consume input tokens. OpenAI recommends exposing only task-relevant tools and deferring large tool sets through tool search. The same progressive-disclosure rule applies to capabilities as to documents. [Function calling token usage](https://developers.openai.com/api/docs/guides/function-calling#token-usage), [Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search)
- **[HIGH] Specialist agents are bounded optimizations.** Subagents isolate noisy exploration, testing, triage, and summarization, but each performs its own model and tool work and therefore increases token use. Parallel write-heavy work also adds coordination risk. [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- **[HIGH] Hooks cannot carry essential context.** Codex hooks can inject developer context at lifecycle events, but command hooks require trust, matching hooks run concurrently, some interception is incomplete, and unsupported handlers are skipped. [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- **[HIGH] Memory, persisted reasoning, compaction, and prompt caching are optimizations, not authority.** Compaction is opaque state; stale persisted reasoning can anchor later work; caching changes cost and latency but not semantic attention. Static prefixes should remain stable and task-specific context should arrive later. [Compaction](https://developers.openai.com/api/docs/guides/compaction), [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- **[HIGH] Change one variable at a time.** OpenAI's migration guidance requires a preserved baseline and controlled comparisons across task success, evidence, tool behavior, tokens, cache writes, latency, and cost. [Upgrading to GPT-5.6 Sol](https://developers.openai.com/api/docs/guides/upgrading-to-gpt-5p6-sol)

OpenAI's own Codex harness case study reached the same structural conclusion: a monolithic instruction manual crowded out task context, rotted, and resisted verification, so the team made a roughly 100-line `AGENTS.md` a table of contents into structured, versioned repository knowledge. That is a first-party engineering case report rather than a controlled model eval, but it directly supports the map-not-manual architecture. [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)

## Independent state of the art

- **[HIGH, observed] Long-context capacity does not imply uniform use.** _Lost in the Middle_ found strong position effects, with information at the beginning or end used more reliably than information in the middle. [TACL 2024](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/Lost-in-the-Middle-How-Language-Models-Use-Long)
- **[HIGH, observed] Length can hurt even with perfect retrieval.** Across math, QA, and coding, a 2025 Findings paper measured 13.9–85% degradation as context grew, even with relevant evidence already retrieved and adjacent to the question. [Context Length Alone Hurts LLM Performance Despite Perfect Retrieval](https://aclanthology.org/2025.findings-emnlp.1264/)
- **[MEDIUM-HIGH, observed] Current coding agents over-collect.** ContextBench's 1,136 tasks found that agents favored recall over precision, explored context they did not use, and gained only marginal retrieval improvements from more elaborate scaffolding. It is a recent, not-yet-replicated preprint, so it informs evaluation rather than setting universal thresholds. [ContextBench](https://arxiv.org/abs/2602.05892)
- **[MEDIUM, first-party engineering evidence] A hybrid beats either extreme.** Anthropic recommends a small amount of front-loaded context plus just-in-time retrieval and progressive disclosure. It also warns that pure runtime exploration adds latency and can wander, while compaction can discard details that become important later. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **[HIGH, portable format] Agent Skills are the strongest existing cross-runtime seam.** The open specification separates about 100 tokens of discovery metadata, an activated instruction body, and deeper resources loaded on demand. OpenAI, Claude, and GitHub all support this basic shape, though discovery paths and provider extensions differ. [Agent Skills specification](https://agentskills.io/specification), [GitHub agent Skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- **[HIGH, cross-runtime convergence] The delivery mechanisms have different jobs.** GitHub's current customization guidance independently classifies custom instructions as automatic broad guidance, Skills as on-demand procedures, subagents as isolated work, and hooks as deterministic lifecycle commands. [Copilot customization comparison](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features)
- **[HIGH, protocol fact] MCP standardizes discovery and exchange, not guaranteed inclusion.** MCP resources may expose identifiers, size, priority, and last-modified metadata, but host applications choose whether and how to place them in context; subscriptions and change notifications are optional. [MCP resources, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)

## Placement contract

| Mechanism | Content it may own | Delivery | Principal risk | Architectural status |
|---|---|---|---|---|
| **Bootstrap / always-on instructions** | Only universal invariants, authority/routing map, and the minimum contract needed before retrieval | Pushed once per session or request by the native runtime | Recurring token cost, duplication, contradiction, stale session | Required; aggressively bounded |
| **Skill** | A conditional procedure, its trigger, inputs/outputs, and nearby references/scripts | Metadata first; body on activation; resources on demand | Missed or wrong activation; catalog truncation; provider extensions | Primary portable procedure interface |
| **Knowledge item** | Current description, vocabulary, Task state, research evidence, or structural data in its owning surface | Retrieved by path, Backlog ID, graph query, MCP URI, or tool | Staleness, wrong source, over-retrieval, provider outage | Required external knowledge plane; never all-loaded |
| **Task/checkpoint state** | Current objective, scope, decisions, artifacts, Checks, unresolved risks, and next step | Appended as a task capsule; persisted outside transcript at milestones | Summary loss, competing status records | Required for long work; storage choice deferred |
| **Specialist agent** | No canonical methodology. It receives a bounded role and task capsule, performs isolated work, and returns evidence | Native subagent/custom-agent facility | Token multiplication, inherited excess context, summary laundering, write conflicts | Optional context-isolation boundary |
| **Hook** | No semantic truth. It may trigger, measure, validate, or inject a short pointer/receipt | Native lifecycle command | Trust gating, fail-open behavior, incomplete interception, schema drift | Optional disposable adapter |
| **MCP / tool search** | Live external data or actions, plus discovery metadata | Deferred tool/resource discovery | Outage mistaken for absence, schema-token cost, authorization risk | Optional adapter where live data repays cost |
| **Memory / compaction / cache** | No authority; only disposable recall, continuity, or cost state | Runtime-native | Stale anchoring, irreversible omission, false confidence | Optimization only |

This contract yields a simple placement test:

1. Must it be present before every task and would omission be unacceptable? Candidate for the bootstrap.
2. Does it apply to a recognizable kind of work? Candidate for a Skill.
3. Is it a fact, state description, or evidence? Keep it in the owning knowledge surface and retrieve it.
4. Does it require isolated context, tools, permissions, or independent judgment? Deliver a context capsule to a specialist agent.
5. Must a deterministic action occur at a lifecycle boundary? A native hook may call a versioned Check or inject a short pointer, but the hook does not own the rule.

The exact answers for individual qq rules are the later methodology decisions.

## Recommended components

### 1. Bootstrap kernel

**[HIGH, architecture inference]** Keep one authored, stable bootstrap. Its permitted categories are:

- the authority and side-effect boundary needed before any action;
- universal invariants whose omission cannot safely wait for Skill activation;
- a compact question-to-source and work-type-to-Skill routing map;
- the minimum success/validation contract needed to know when work is complete.

It should state each rule once and point outward. It should not reproduce Backlog procedures, Skill bodies, tool manuals, OpenWiki content, examples, or runtime setup. The current post-TASK-1 `AGENTS.md` is 8,858 bytes and 204 lines; this report deliberately does not decide which lines remain.

### 2. Portable capability layer

**[HIGH]** Keep reusable procedures in standard `SKILL.md` packages. Canonical shared content should use the open core: `name`, precise `description`, Markdown instructions, references, scripts, assets, and compatibility metadata. Runtime-only invocation flags, agent spawning controls, hooks, or tool preapprovals belong in an adapter or a clearly isolated compatibility section.

A Skill may reference knowledge, but it must not copy the knowledge or bootstrap. Descriptions are routing code: they need mutually intelligible triggers and boundaries because only metadata is guaranteed to be initially visible.

### 3. Typed knowledge plane

**[HIGH, architecture inference]** Keep each Knowledge item with its existing owner and give retrieval enough metadata to judge it:

- source locator or stable ID;
- authority class and owning question;
- repository revision or external version when applicable;
- raw versus derived status;
- freshness or `as_of` information;
- why it was selected for the current task.

Retrieve bounded excerpts and preserve a pointer to the complete artifact. Use lexical search for identifiers, paths, messages, and configuration; use structural/semantic retrieval for relationships; rerank only when representative evals show that the extra machinery improves usable precision. Do not build a qq MCP service merely to restate files already reachable through native filesystem and CLI tools.

### 4. Context capsule

**[HIGH, architecture inference]** The stable agent-to-agent and session-to-session interface is a small capsule, not a copied transcript or provider-specific agent manifest. It contains:

- exact objective and current work layer (research, design, implementation, review, or coordination);
- scope, authority, and explicit non-goals;
- relevant source locators and an orientation receipt describing what the parent already resolved;
- acceptance criteria or completion evidence required;
- tool/permission boundary;
- expected output shape, citations/evidence, confidence, and failure condition.

The parent performs general orientation and supplies the relevant result. A specialist independently judges or investigates the assigned question and reports a missing capsule dependency instead of rerunning repository-wide orientation. Fresh-context independence means independent judgment, not repeated discovery of settled intent.

This addresses a live qq observation: a supposedly fresh general reviewer with parent turns removed still received the full system/developer stack, duplicated repository methodology, the complete Skill/tool catalog, and a long review brief. The current spawn interface has no context allowlist or way to suppress repository `AGENTS.md`. A thinner bootstrap and a narrow capsule reduce the unavoidable load; native role profiles can further limit tools and permissions when available.

### 5. Disposable runtime adapters

**[HIGH]** Each runtime adapter maps the portable components onto native surfaces and is cheap to replace:

- instruction discovery or developer-message replay for the bootstrap;
- native Skill locations and explicit invocation syntax;
- native read-only specialist profiles and tool filtering;
- optional hook events for short context receipts, Check invocation, or telemetry;
- native compaction, caching, and memory;
- optional MCP only for live external context/actions.

Adapters must not silently degrade. Missing bootstrap, a required Skill, or an authoritative source is reported explicitly. Hook or MCP failure must distinguish provider unavailability from a legitimate empty result. Optional memory, caching, or specialist availability may degrade to the direct path with disclosure because no canonical truth lives there.

### 6. Compaction-safe checkpoint and observability

**[HIGH, architecture inference]** At meaningful milestones—and before compaction, handoff, or session replacement—persist a small structured checkpoint outside the transcript. It references the objective, decisions, changed artifacts and revision, Checks and results, unresolved risks, and next action. Native compaction remains the model-specific mechanism; the checkpoint supplies recoverability if the compacted state omits something important.

Measure context by source: bootstrap, task capsule, selected Skills, retrieved evidence, tool schemas/results, history, and specialist handoffs. Preserve full logs/artifacts outside model-visible context and deliver bounded observations with locators.

## Options considered

1. **Monolithic always-on methodology — reject.** It maximizes initial delivery probability but violates controlling GPT-5.6 guidance, repeats conditional procedures, increases contradiction and staleness, and makes every specialist pay the full recurring cost.
2. **Pure just-in-time retrieval — reject.** It minimizes the bootstrap but can miss prerequisites, wander, and spend more turns discovering where to look. Some invariants and routing must arrive before tools are used.
3. **Thin bootstrap + progressive disclosure + native adapters — adopt.** It retains a small reliable push path and moves conditional procedure, knowledge, tool definitions, and noisy work behind explicit triggers.
4. **Compiled universal context platform — defer.** Generating instruction files, path rules, hook configs, agent profiles, and plugins from an intermediate schema would maximize native optimization but commit qq to a compatibility product across non-isomorphic runtime semantics. Reconsider only after repeated adapter maintenance demonstrates that generation pays for itself.

## Failure behavior

- **Contradictory instructions:** one authored home; adapters link or replay rather than restate. Detect duplicate projections where practical.
- **Skill not selected:** required bootstrap routing makes the dependency explicit; missing discovery is a surfaced failure, not silent improvisation.
- **Knowledge unavailable:** distinguish no match, stale/insufficient evidence, index unavailable, and source unavailable. Fall back to the source/CLI where one exists.
- **Hook skipped or failed:** the semantic workflow remains available through bootstrap + Skill + source retrieval; only the optional automation is lost.
- **Specialist unavailable or contaminated:** run serially in the parent or use a native narrow profile; never lose canonical state because an agent thread disappeared.
- **Compaction loss:** rebuild from the persisted Task/checkpoint and source locators, then revalidate current repository state.
- **Adapter drift:** run four conformance Checks after runtime upgrades: bootstrap discovery, Skill discovery/invocation, specialist capsule/isolation, and hook failure behavior.
- **Prompt or memory injection:** fetched/generated content is evidence, not instructions. Authority and trust metadata accompany retrieval; hard security belongs in sandboxing, permissions, and deterministic Checks rather than prose alone.

## Evaluation plan

Follow GPT-5.6 guidance: preserve the current model, reasoning, tools, and task corpus; change one context group at a time.

### Representative work corpus

- an obvious mechanical change that should not trigger broad orientation;
- an ambiguous architecture request requiring alignment;
- a non-obvious bug diagnosis;
- a non-trivial implementation plus fresh review;
- multi-source research;
- a user-facing change requiring acceptance;
- a long task spanning compaction or a fresh session.

### Controlled comparisons

- current always-loaded methodology versus a candidate thin bootstrap;
- unconditional procedures versus Skill-routed procedures;
- whole-document loading versus bounded source retrieval;
- all tools versus filtered/deferred tools;
- general subagent versus narrow capsule/native role profile;
- native compaction alone versus native compaction plus checkpoint;
- hook present, failed, and absent.

### Measures

- task and acceptance-criteria success, evidence completeness, and unauthorized or premature actions;
- instruction conflicts, redundant orientation, unnecessary questions, and wrong Skill/source routing;
- retrieval recall, precision, explored-versus-used context, and source freshness;
- tokens by context category, duplicated semantic rules, tool-schema/result volume, cache reads/writes, latency, and cost;
- specialist token/coordination overhead and write conflicts;
- survival of exact paths, decisions, artifact state, Check results, risks, and next action across compaction/handoff.

Adversarial cases should include middle-position evidence, related distractors, stale conflicting documents, changed source after indexing, too many Skills, missing hooks/MCP, a failed provider returning an empty-looking response, and a specialist tempted to redo general orientation.

No universal budget, retrieval `top-k`, chunk size, compaction threshold, or Skill count is research-settled. Set them only from these representative evals.

## Methodology decisions explicitly deferred

- the exact bootstrap rules and wording;
- which current `AGENTS.md` sections move, merge, or disappear;
- the Skill catalog, trigger policy, and whether any Skill becomes explicit-only;
- the exact authority order, freshness requirements, and fail/continue policy for each knowledge class;
- which specialist roles exist and when delegation is required;
- whether qq uses any hooks or MCP adapter at all;
- the checkpoint's owning surface and schema;
- hard context/token budgets and eval thresholds;
- implementation sequencing and migration of linked repositories.

## Sources that shaped the conclusion

### OpenAI — controlling current-model/runtime guidance

- [Prompting guidance for GPT-5.6 Sol](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)
- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Codex `AGENTS.md` discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Harness engineering](https://openai.com/index/harness-engineering/)

### Primary research and authoritative portability evidence

- [Lost in the Middle, TACL 2024](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/Lost-in-the-Middle-How-Language-Models-Use-Long)
- [Context Length Alone Hurts LLM Performance Despite Perfect Retrieval, Findings 2025](https://aclanthology.org/2025.findings-emnlp.1264/)
- [ContextBench, 2026 preprint](https://arxiv.org/abs/2602.05892)
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Agent Skills specification](https://agentskills.io/specification)
- [GitHub Copilot customization comparison](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features)
- [MCP resources specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)

## Gaps

- Runtime discovery, hooks, agents, memory, and cache semantics are moving targets; exact behavior requires adapter conformance Checks after upgrades.
- Public Codex documentation does not establish a true context allowlist for spawned agents or a way to suppress inherited repository guidance in the current collaboration interface.
- Research establishes no universal context budget or retrieval/compaction threshold for mutable coding work on GPT-5.6 Sol.
- No mature cross-runtime benchmark follows one coding Change through repository mutation, source re-indexing, several compactions, specialist handoffs, and final Checks.
- Provenance establishes origin and freshness, not correctness; source and fresh Checks remain final evidence.
