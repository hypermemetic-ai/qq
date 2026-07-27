---
id: doc-113
title: Delegated aligner runtime composition — superseded evidence
type: other
created_date: '2026-07-26 17:04'
updated_date: '2026-07-26 17:26'
---
> **Status: superseded design evidence.** The operator rejected this report's delegated-aligner recommendation after clarifying that the visible accountable Pi must itself be the privileged aligner and orchestration must be fully internal. The source findings about qq-dispatch, trusted roles, RPC, schemas, observation, and tool allowlists remain evidence; the runtime recommendation does not settle T-165.1. A replacement investigation owns the privileged-root topology.

# T-165.1 operator-alignment core runtime composition

**Owning Task:** T-165.1
**Overall confidence:** HIGH
**Settles:** Use one trusted, fresh-context `aligner` child behind the existing pi-subagents → `qq-dispatch` path; do not build a direct nested-model or second lifecycle runtime.

## Findings

- **[HIGH — observed] The current governance supports a delegated alignment specialist without transferring accountability.** The accountable owner alone aligns new work; bounded Actors return new consequential decisions and scope gaps rather than approaching the operator or expanding scope (`skills/grilling/SKILL.md:10-31`). qq already separates complete role-specific work orders from child execution and keeps judgment, verification, and delivery with the accountable owner (`CONCEPTS.md:71-85`; `skills/delegate-batch/SKILL.md:12-67`).

- **[HIGH — observed] qq already owns the trusted delegated-runtime boundary needed by the aligner.** Canonical child manifests replace the system prompt, disable inherited project context and Skills, use fresh context, and expose only declared tools (`delegation/manifests/agents/{reviewer,researcher,implementer,observer}.md`). Trusted manifest paths are fixed by `.pi/extensions/qq-subagent-env.ts:35-64`; role access and policy identities are centralized in `delegation/policies/roles.json`.

- **[HIGH — observed] `qq-dispatch` is the source-enforced role and confinement seam.** It rejects missing or unsupported roles, resolves the exact assigned Git worktree, selects role policy, constrains structured-output capture, creates run-local Pi/session roots, and launches the pinned qq Pi wrapper under Landstrip, timeout, and descendant supervision (`bin/qq-dispatch:20-105,120-230,245-400`). `tests/test-qq-dispatch.sh` already exercises trusted roles, policy identity, structured capture, linked worktrees, timeout, and signal cleanup.

- **[HIGH — observed] pi-subagents exposes the stable extension boundary instead of requiring internal imports or output scraping.** Its v1 event-bus RPC supports async `spawn`, returns `asyncId`/`asyncDir`, and advertises exact `subagent:async-complete` correlation (`pi-subagents/README.md:263-278,1614-1715`; `src/extension/rpc.ts:173-221,300-402`; `src/runs/background/result-watcher.ts:184-283`). Spawn uses normal discovery, validation, caps, lifecycle artifacts, and structured output.

- **[HIGH — observed] A direct nested model call would duplicate settled infrastructure and weaken role identity.** The Pi `complete()` API could reduce process-start latency, but qq would then need new model/profile resolution, child-context construction, schema capture/repair, cancellation, transcript/artifact lifecycle, and recovery. It would bypass the exact trusted-manifest → role → `qq-dispatch` policy chain. This is an inference from the owned responsibilities above, not a benchmark claim.

- **[HIGH — observed] The no-work boundary must use a positive tool allowlist, not a blank `tools` field.** pi-subagents only emits Pi's `--tools` restriction when at least one declared tool is present; an absent/empty list leaves Pi's normal tools active (`pi-subagents/src/runs/shared/pi-args.ts:112-173`). The permanent aligner should therefore receive one named child-only presentation tool plus the automatically admitted `structured_output` tool. It must receive no `read`, `bash`, search, edit, write, Skills, project context, or unrelated extensions. Landstrip read-only policy prevents mutation but is not by itself a no-investigation boundary.

- **[HIGH — observed] `alignment` is already a valid observation phase.** `bin/qq-observe:2935` includes `alignment` in its closed phase set. Adding the aligner dispatch case can use the truthful existing phase without extending observer vocabulary.

- **[HIGH — observed] Existing Completion Envelopes should remain unchanged and become one input material type.** Their closed schema reports work status, summary, commits, files, Checks, contestable decisions, questions, risks, branch, and worktree (`delegation/manifests/completion-envelope.schema.json`). An aligner result is presentation and disposition material, not another work-completion claim.

- **[HIGH — recommendation] Add separate closed aligner input and result contracts.** Input should identify the episode, objective, supplied materials with unique provenance ids, criteria/realignment trigger where applicable, and prior dispositions. Result should be exactly `needs-data` or `ready`; carry complementary spoken and visual fields, one operator prompt, provenance references, and status-dependent missing-data requests. Paths alone are insufficient because the aligner must not gain repository-reading tools.

- **[HIGH — recommendation] Integrate through one mounted qq Pi extension.** The extension should validate the packet, request the trusted aligner through pi-subagents RPC, correlate exact completion without polling, validate its strict result, render transcript-visible operator material, collect the operator's exact disposition, and return that disposition to the accountable model. Existing Pi APIs support custom tools, custom message/tool rendering, `ctx.ui` interaction, event-bus composition, session entries, and temporary files (`Pi docs/extensions.md`, especially ExtensionAPI, Custom Tools, Custom UI, and Message Rendering; `Pi docs/tui.md`). `extensions/index.ts` and `tests/test-qq-extension-mount.sh` own qq extension composition.

- **[MEDIUM — recommendation] Use one fresh aligner child for each complete supplied packet and resupply prior dispositions.** This keeps hidden child history from becoming undeclared persistent calibration before T-165.3. Resume remains infrastructure recovery, not product memory. No latency measurement was authorized, so the cost of fresh child startup remains unquantified.

## Recommended implementation boundary

1. Add the canonical `aligner` manifest and trusted path.
2. Add `aligner` to the read-only Landstrip role policy and `qq-dispatch` with observation phase `alignment`.
3. Add separate closed input/result schemas; preserve the Completion Envelope schema.
4. Add one child-only presentation tool extension and assert the resolved child tool/extension set.
5. Add one operator-alignment Pi extension that owns RPC invocation, exact completion correlation, rendering, context-gap return, and operator-disposition capture.
6. Add the high-level operator-facing policy and Skill trigger without a generic workflow engine or parallel truth store.
7. Extend focused dispatch, trusted-seat, schema, extension-mount, presentation, context-gap, provenance, cancellation, and session-reload Checks.

## Sources

- qq methodology and contracts: `AGENTS.md`, `CONCEPTS.md`, `skills/grilling/SKILL.md`, `skills/delegate-batch/SKILL.md`
- qq runtime: `bin/qq-dispatch`, `bin/qq-observe`, `.pi/extensions/qq-subagent-env.ts`, `delegation/policies/roles.json`, `delegation/manifests/`, `tests/test-qq-dispatch.sh`, `tests/test-qq-subagent-env.sh`
- qq Pi composition: `extensions/index.ts`, `extensions/qq-architect.ts`, `tests/test-qq-extension-mount.sh`
- installed Pi docs: `bundle/docs/extensions.md`, `bundle/docs/tui.md`
- installed pi-subagents: `README.md`, `src/extension/rpc.ts`, `src/runs/background/result-watcher.ts`, `src/runs/shared/pi-args.ts`
- role-history evidence: Backlog Tasks T-152, T-153, and T-154 read through the Backlog CLI

## Gaps

- The permanent aligner text model/profile and acceptable interactive latency/cost are not settled.
- Invocation policy still needs one operator disposition: automatic accountable-model tool invocation, operator command, or both.
- Episode-specific disposition vocabulary and the role of free text are not settled.
- Explanatory-artifact retention and cleanup semantics are not settled.
- Semantic complementarity and factual faithfulness cannot be proven by JSON Schema alone; prompt policy, provenance validation, fixtures, fresh review, and UAT must carry that evidence.
