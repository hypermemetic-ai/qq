---
id: doc-88
title: 'Role-based model routing for qq Pi — adopt, adapt, build, or upstream'
type: other
created_date: '2026-07-24 05:49'
tags:
  - research
---
# Role-based model routing for qq Pi — adopt, adapt, build, or upstream

**Owning Task:** T-152
**Research date:** 2026-07-24
**Overall confidence:** **HIGH** for the installed Pi 0.81.1 and pi-subagents 0.35.1 runtime; **MEDIUM-HIGH** for the point-in-time package inventory.
**Settles:** qq should **upstream the missing Pi execution-profile seam first, then build a thin qq-owned role resolver**. No surveyed package is adoptable unchanged; adapting one would retain conflicting authorities or amount to a rewrite; a qq-only workaround on current public hooks cannot meet the approved fail-closed, request-local contract.

Method: a fresh read-only researcher inspected the current Repository, installed Pi/pi-ai/pi-agent-core/pi-subagents source, Pi documentation, and current candidate-package tarballs. The accountable owner spot-checked the load-bearing Pi persistence, clamping, extension-error, tool-loop, auxiliary-execution, pi-subagents discovery/precedence/override/fallback, child-launch, and service-tier accounting claims against source. No package was installed, no settings were changed, and no paid provider request was made. Context7 was unavailable; version-specific library claims therefore use installed source plus published package records.

## Recommendation

**UPSTREAM-FIRST, then BUILD the qq authority.** [HIGH, inference from the verified facts below]

The smallest complete system has two ownership layers:

1. **Pi owns execution atomicity.** Add one typed, request-local execution profile—exact provider/model, exact effort or explicit default, and exact service class or explicit default—that is validated before network activity, frozen for a complete logical request, applied to normal agent turns and auxiliary model calls, and exposed as selected/acknowledged telemetry. Resolver failure must reject the execution rather than become a non-blocking extension diagnostic.
2. **qq owns role and configuration policy.** A thin install-wide resolver reads one operator-only six-role map before each logical request, validates the entire document, resolves trusted immutable workflow-seat occupancy, and hands only the three compute fields to Pi. Delegated occupancy is authorized from the trusted canonical role source—not from the selected agent name—and a same-name Repository agent cannot claim the seat. The resolver does not change tools, access, prompts, network policy, authority, independence, or lifecycle.

This is not a proposal to generalize qq roles into Pi. Pi needs only the provider-agnostic execution seam; the six roles and their occupancy rules remain qq policy.

## Decision matrix

| Disposition | Evidence | Verdict |
|---|---|---|
| **ADOPT** an existing package unchanged | `pi-roles` 0.2.3, `pi-model-profiles` 0.4.0, `pi-profile` 0.2.0, `@richardgill/pi-preset` 0.0.8, and `@d3ara1n/pi-model-roles` 1.1.0 provide subsets of role/session/profile behavior, but none combines trusted qq occupancy, exactly one install-only six-role authority, all three typed fields, exact validation, request pinning, and fail-closed execution. Service-tier packages are separate mutable controls. [S10] | **Reject** [HIGH on fit; MEDIUM-HIGH on catalog completeness]. |
| **ADAPT/COMBINE** packages | The profile packages retain commands, flags, project/user scopes, mutable selections, prompts/tools, or incomplete fields. `pi-service-tier` 0.3.0 and `pi-provider-service-tier` 0.1.7 inject provider payload fields and deliberately include toggles, local scopes, support maps, probing/warnings, or fail-open unknown behavior; neither repairs model/effort atomicity or Pi's request boundary. `pi-openai-service-tier` demonstrates a cost-aware provider-wrapper pattern, but targets an older package namespace, fixed models, mutable global/project configuration, and fail-open unsupported tiers. [S10][S11][S12] | **Reject as the system**. Borrow tested patterns only; removing the conflicting semantics and adding the missing Pi seam is a rewrite. [HIGH] |
| **BUILD only in qq** on current public Pi hooks | `setModel()` persists session and global defaults; `setThinkingLevel()` clamps and persists; `before_agent_start` errors are caught and execution continues; Pi refreshes model/thinking state between tool turns; compaction and branch summaries execute outside the ordinary agent-start path. Payload mutation occurs too late to choose model/effort atomically and can miss cost accounting. [S5][S6][S7] | **Reject**. A provider wrapper or private monkey patch would be larger, brittle, upgrade-sensitive, and still hard to prove complete. [HIGH] |
| **UPSTREAM** a Pi seam, then add a thin qq resolver | Execution atomicity, capability validation, provider options, auxiliary calls, and telemetry belong at Pi's provider-execution boundary; role occupancy and the single operator map belong in qq. This cleanly preserves the compute-only boundary. [S1][S5][S6][S7] | **Recommend**. This is the smallest resulting system that satisfies the whole approved contract. [HIGH] |

## Findings against the approved contract

### 1. Pi has useful mechanisms, but not the required atomic primitive

- **[HIGH, observed]** Pi can resolve exact models and extensions can call `pi.setModel()` and `pi.setThinkingLevel()`. However, `AgentSession.setModel()` authenticates, mutates agent state, appends a session model change, writes the model to global settings, and reclamps thinking. `setThinkingLevel()` clamps unsupported values and writes session/settings state (`agent-session.js` 1190–1205 and 1270–1293). That is session-persistent behavior, not an exact request-local profile. [S5]
- **[HIGH, observed]** `before_agent_start` is not fail-fast: the extension runner catches handler exceptions, emits an extension error, and continues (`runner.js` 823–875). A strict resolver cannot establish “bad profile means zero provider calls” by throwing from this hook. [S6]
- **[HIGH, observed]** Pi snapshots model/thinking into the agent loop, then `AgentSession` refreshes them from mutable session state after each turn (`agent.js` 265–286; `agent-loop.js` 78–149; `agent-session.js` 261–280). A naïve hot-reload setter can therefore change a tool continuation mid-request, contrary to the approved pinning boundary. [S6]
- **[HIGH, observed]** auxiliary executions use separate paths. Manual compaction resolves auth before `session_before_compact` and calls the compactor with the session model/thinking (`agent-session.js` 1367–1429). Branch summarization separately reads `this.model` and calls `generateBranchSummary` (`agent-session.js` 2330–2381). An ordinary agent-start extension does not cover every Pi model execution. [S5]
- **[HIGH, inference]** A designated core resolver must run before auth/provider execution and return a frozen profile consumed by all these paths. Pi already has precedent for propagating extension errors at a blocking boundary in its tool-call hook, but no equivalent profile hook exists. [S5][S6]

### 2. Service class must travel through provider options, not payload mutation alone

- **[HIGH, observed]** pi-ai's OpenAI Codex transport accepts `options.serviceTier`, maps it to request `service_tier`, and uses the same option plus response metadata to apply flex/priority cost multipliers (`openai-codex-responses.js` 350–405 and 427–432). [S7]
- **[HIGH, observed]** current `extensions/qq-codex-fast.ts` injects only the already-built payload in `before_provider_request`. Its own source documents that a backend which honors priority without returning the tier can leave displayed cost understated. [S9]
- **[HIGH, observed]** `pi-service-tier` likewise documents that payload injection cannot set Pi's internal option and may omit priority/flex multipliers; `pi-provider-service-tier` makes the same limitation explicit. `pi-openai-service-tier` avoids it by replacing OpenAI stream providers and passing `serviceTier`, proving a useful mechanism but not the role/configuration contract. [S10][S11][S12]
- **[HIGH, inference]** Pi should expose a provider-capability-aware service-class field in the frozen profile and translate it through provider options. Provider acknowledgement should be recorded separately because a provider may accept a request without proving that it honored it.

### 3. pi-subagents is currently a competing routing authority

- **[HIGH, observed]** pi-subagents accepts user and project `defaultModel`, per-agent model/thinking/fallback overrides, explicit invocation models, and fuzzy model resolution (`agents.ts` 750–829; `model-fallback.ts` 200–267). Its retry classifier treats rate-limit, auth, billing, unavailable-model, network, timeout, and related failures as model-fallback candidates (`model-fallback.ts` 270–327). [S8]
- **[HIGH, inference]** canonical qq roles cannot leave this machinery authoritative. Locked role launches must resolve to one candidate, reject invocation/manifest model and thinking overrides, and perform zero model substitution on failure.
- **[HIGH, observed]** pi-subagents defaults agent discovery to scope `both`. Extra qq manifests load as user-source agents, then a same-name Repository project agent overwrites them. The resolved `agent.name` alone becomes `PI_SUBAGENT_CHILD_AGENT` (`agent-scope.ts` 3–5; `agent-selection.ts` 3–22; `agents.ts` 1421–1485; `execution.ts` 224–230; `pi-args.ts` 256–260). [S8]
- **[HIGH, observed]** `bin/qq-dispatch` accepts that name as implementer/reviewer/researcher/observer, creates an isolated `PI_CODING_AGENT_DIR`, and explicitly loads only `qq-codex-fast` (`bin/qq-dispatch` 89–101, 164–182, 225–232, and 360–378). A same-name `.pi/agents/reviewer.md` can therefore currently claim the reviewer seat, and a root-only extension install cannot cover the resulting child. [S2][S8]
- **[HIGH, inference]** a renamed environment variable is not sufficient. pi-subagents (or a bounded qq adapter at its selection boundary) must reserve canonical role occupancy to definitions from the trusted qq manifest source, carry a dedicated role assertion derived from that verified source rather than `agent.name`, and make `bin/qq-dispatch` reject missing, unknown, conflicting, or untrusted-source assertions. Repository/project agents may still exist, but cannot occupy a canonical qq seat.

### 4. Root occupancy needs one stronger architect assertion

- **[HIGH, observed]** every unasserted non-child root can safely default to orchestrator under the approved rule. The architect exception is not yet trustworthy: `bin/qq-herdr-home` discovers the architect tab from mutable label `architect`, then verifies the resulting tab ID/workspace/focus (`bin/qq-herdr-home` 137–165). [S3]
- **[HIGH, inference]** the trusted launcher should record/assert the actual dedicated architect tab ID into the process environment. The resolver should compare an immutable launcher assertion, not infer authority from a human label. Occupancy stays fixed for that tab's lifetime.

### 5. The existing displays need extension, not a new UI

- **[HIGH, observed]** `qq-footer` reports provider/model and thinking level but no service class (`extensions/qq-footer.ts` 323–337). pi-subagents progress/results initialize model and effort from launcher arguments and expose no actual service-class field. [S8][S9]
- **[HIGH, inference]** research therefore proves the plan's material visibility gap. Extend the existing footer and pi-subagents run/status surfaces with effective provider/model, effort, requested service class, and acknowledged service class. Do not create another UI.

## Bounded implementation brief

### Upstream Pi change

1. Define a provider-agnostic `ExecutionProfile` with exact model identity, effort-or-default, and service-class-or-default; expose authoritative capability validation for every field.
2. Add one fail-fast resolver boundary invoked before auth/network work for a normal prompt, compaction, branch summary, and any other Pi-owned model execution.
3. Freeze the resolved profile for the complete logical request, including all tool-continuation turns. A config edit affects only the next logical request.
4. Keep the profile request-local: do not append model/thinking changes to the session and do not write Pi defaults.
5. Pass service class through typed provider options and request payloads; emit selected and provider-acknowledged profile telemetry for existing displays and cost accounting.
6. Reject resolver errors, unavailable credentials, unsupported effort/service class, and post-resolution conflicting mutation before a provider call. Do not clamp, omit, probe, fall back, or continue from stale state.
7. Add fake-provider conformance tests for zero-call failures, hot reload, tool-loop pinning, auxiliary calls, accounting, and acknowledgement discrepancies.

### qq integration after the upstream release is pinned

1. Add one operator-only, install-wide, atomically replaced profile document containing exactly `orchestrator`, `architect`, `implementer`, `reviewer`, `researcher`, and `observer`, each with all three typed fields. Do not merge Repository, manifest, command, environment compute overrides, or a last-known-good cache.
2. Resolve immutable occupancy from a dedicated child-role assertion that pi-subagents emits only after verifying the selected definition is the trusted canonical qq manifest source; a launcher-bound architect-tab-ID assertion; otherwise orchestrator. Reserve canonical role names/source metadata against project precedence, and reject missing, unknown, conflicting, or untrusted-source assertions.
3. Load the resolver through `extensions/index.ts` for roots and explicitly through `bin/qq-dispatch` for isolated children.
4. Remove model/thinking pins from the four canonical delegate manifests. Lock pi-subagents so canonical roles reject same-name project definitions, explicit/model/default/fallback compute selection, and launch exactly the qq-resolved candidate.
5. Retire `qq-codex-fast` only after equivalent service-class transport and cost accounting are verified.
6. Extend `qq-footer` and pi-subagents' existing status/result metadata with the effective and acknowledged profile; change no role tools, Landstrip access, authority, network policy, independence, or lifecycle.

### Acceptance checks

- Occupancy matrix: all four delegated seats, dedicated architect tab, ordinary Herdr roots, and non-Herdr roots; a same-name project agent and a forged/untrusted-source role assertion cannot occupy any canonical seat.
- Schema negatives: malformed document; missing/extra role or field; fuzzy/unknown model; unavailable auth; unsupported effort or service class; invalid default sentinel.
- Authority negatives: Repository settings and same-name project agents, manifests, invocation parameters, model/thinking commands, and tier commands cannot change an execution profile or role occupancy.
- Zero-call failures: every resolution/capability/auth error names role, field, and bad value and causes zero fake-provider calls.
- Hot reload/pinning: valid→valid applies next request; valid→invalid blocks; invalid→valid recovers; mid-request edit does not affect tool continuations; no stale valid copy is used.
- Coverage: normal prompt, foreground/background/resumed delegate, compaction, branch summary, observer path, and provider retry/error paths.
- Transport/accounting: explicit/default service class reaches typed options and payload correctly; requested and acknowledged values are visible; cost uses the effective class.
- Policy regression: tools, Landstrip policy, role instructions, reviewer independence, authority, network policy, and lifecycle are unchanged.

## Migration and rollback

**Migration:** land and pin the upstream Pi release; create all six profiles initially from one operator-approved baseline; validate without paid calls and deploy by atomic rename; reserve canonical delegated seats to trusted qq manifest-source metadata and add the derived role assertion plus trusted architect assertion; load the qq resolver in root and child surfaces; remove manifest compute pins and pi-subagents fallback/override paths; then retire `qq-codex-fast` after fake-provider/accounting/visibility checks pass.

**Rollback:** disable the qq resolver at root and child load points; restore manifest model/thinking pins and `qq-codex-fast`; pin Pi back to the preceding release if necessary; leave the install-wide document inert for diagnosis. Because the upstream profile is request-local, rollback requires no session/default-setting cleanup.

## Gaps and residual risks

- **[HIGH]** The required fail-fast, request-local Pi primitive does not exist in installed Pi 0.81.1. qq routing must not be called compliant before it lands.
- **[HIGH]** Architect occupancy remains ambiguous until the launcher provides a trusted tab-ID assertion.
- **[MEDIUM]** Provider/model metadata may not yet describe every effort and service-class combination authoritatively. Upstream capability metadata must replace paid probing or inference.
- **[MEDIUM]** A provider can silently downgrade a requested service class. Local telemetry can expose missing/conflicting acknowledgement but cannot prevent provider-side behavior.
- **[HIGH]** pi-subagents needs an upstream or bounded qq-maintained trusted-source role assertion plus locked-profile path. Otherwise same-name project agents can claim canonical occupancy, and overrides, retries, or displayed launch values can contradict the actual profile.
- **[MEDIUM]** Another extension may attempt to change model/thinking/payload after resolution. The core profile must remain authoritative and reject conflicts.
- **[LOW-MEDIUM]** Installed internal paths and behavior are version-specific and need re-audit on Pi/pi-subagents upgrades.
- **[LOW-MEDIUM]** Candidate versions are a point-in-time registry sample, not a permanent proof that no later package fits.
- **[MEDIUM]** Context7 was unavailable and external provider documentation was not revalidated. Service-tier conclusions are deliberately scoped to inspected Pi transport behavior and candidate-package claims.

## Sources

- **S1 — Approved contract:** [doc-87](../plans/doc-87%20-%20T-152-role-based-model-routing-—-approved-research-plan.md) and [T-152](../../tasks/t-152%20-%20Evaluate-role-based-model-routing-for-qq-Pi.md).
- **S2 — qq child launch:** `bin/qq-dispatch`, `.pi/extensions/qq-subagent-env.ts`, and `extensions/index.ts` in this Repository.
- **S3 — architect launcher:** `bin/qq-herdr-home` in this Repository; inspected installed Herdr 0.7.5 tab metadata.
- **S4 — existing role compute/policy:** `delegation/manifests/agents/{implementer,reviewer,researcher,observer}.md` and `delegation/policies/roles.json`.
- **S5 — installed Pi 0.81.1 runtime:** `@earendil-works/pi-coding-agent/dist/core/{agent-session,model-registry,model-runtime,sdk}.js`; [published package](https://www.npmjs.com/package/@earendil-works/pi-coding-agent/v/0.81.1).
- **S6 — installed execution/extension loop:** `@earendil-works/pi-coding-agent/dist/core/extensions/runner.js` and bundled `@earendil-works/pi-agent-core/dist/{agent,agent-loop}.js`.
- **S7 — service-tier transport/accounting:** bundled `@earendil-works/pi-ai/dist/api/{openai-codex-responses,openai-responses-shared}.js`; [published pi-ai package](https://www.npmjs.com/package/@earendil-works/pi-ai).
- **S8 — installed pi-subagents 0.35.1:** `src/agents/{agent-scope,agent-selection,agents}.ts`, `src/runs/shared/{model-fallback,pi-args}.ts`, `src/runs/foreground/execution.ts`, and `src/tui/render.ts`; [published package](https://www.npmjs.com/package/pi-subagents/v/0.35.1).
- **S9 — current visibility/injection:** `extensions/qq-footer.ts` and `extensions/qq-codex-fast.ts`.
- **S10 — inspected candidate metadata and tarballs:** [pi-roles](https://www.npmjs.com/package/pi-roles), [pi-model-profiles](https://www.npmjs.com/package/pi-model-profiles), [pi-profile](https://www.npmjs.com/package/pi-profile), [@richardgill/pi-preset](https://www.npmjs.com/package/@richardgill/pi-preset), [@d3ara1n/pi-model-roles](https://www.npmjs.com/package/@d3ara1n/pi-model-roles), [pi-provider-service-tier](https://www.npmjs.com/package/pi-provider-service-tier), and [pi-service-tier](https://www.npmjs.com/package/pi-service-tier).
- **S11 — pi-service-tier source:** [repository and README](https://github.com/mavam/pi-service-tier), [Pi package record](https://pi.dev/packages/pi-service-tier), and [`service-tier.ts`](https://raw.githubusercontent.com/mavam/pi-service-tier/main/service-tier.ts).
- **S12 — service-tier alternatives:** [pi-provider-service-tier](https://github.com/luxmargos/pi-provider-service-tier) and [pi-openai-service-tier source](https://github.com/anirudhmehra/pi-openai-service-tier/blob/main/index.ts).
