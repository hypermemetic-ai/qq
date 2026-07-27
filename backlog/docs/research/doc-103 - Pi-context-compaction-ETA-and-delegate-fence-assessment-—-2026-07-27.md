---
id: doc-103
title: 'Pi context, compaction, ETA, and delegate fence assessment — 2026-07-27'
type: other
created_date: '2026-07-27 04:16'
updated_date: '2026-07-27 04:35'
tags:
  - research
  - pi
  - compaction
  - eta
  - sandboxing
---
# Pi context, compaction, ETA, and delegate fence assessment — 2026-07-27

**Owning Task:** T-167

**Overall confidence:** MEDIUM-HIGH

**Settles:** which candidates merit adoption, an isolated trial, a hold, or rejection; the operator-wait ETA event rule; and the smallest evidence needed before any later runtime or confinement Change.

**Boundary:** source and metadata audit only. No candidate was installed, no VM was started, no live Pi session was compacted, and no host or delegate policy was changed.

## Executive decision

| Surface | Disposition | Confidence | Decision |
|---|---|---:|---|
| `pi-context-view` 0.3.0 | **ISOLATED TRIAL** | MEDIUM-HIGH | Trial only in the visible operator-facing root/Aligner, after one real turn. Its normal path is passive, but its pre-first-turn fallback creates a synthetic aborted turn and persists identities despite the README's absolute no-message claim. |
| `pi-blackhole` 0.4.1 | **REJECT as qq default** | HIGH | It replaces visible active context with lossy deterministic extraction plus model-generated memory and opt-in recall. Persisted raw history can be recoverable without being present, noticed, or correct in active context. |
| Automatic replacement for Pi compaction | **HOLD** | MEDIUM-HIGH | No audited option demonstrates qq-critical retention fidelity. Keep Pi native compaction plus durable Repository artifacts until a blind representative-session benchmark proves improvement. |
| `pi-eta` 0.1.0 | **HOLD** | HIGH | It requires agent-visible instructions and three tools, measures self-declared task timers, requires Pi >=0.82.1, and does not match qq's operator-turn topology. Reuse only its statistical ideas in a future event-native, operator-only implementation. |
| Current Landstrip delegate fence | **RETAIN baseline** | HIGH | It remains the lowest-integration-cost fit for qq's declared accident/drift-containment posture. Do not relabel it hostile-agent isolation; open delegate egress and readable staged authentication remain explicit. |
| ZeroBoot | **REJECT for delegates** | HIGH | It is a prototype code-snippet executor with no guest network, mounted worktree protocol, or qq completion lifecycle. |
| Gondolin 0.12.0 | **HOLD** | MEDIUM-HIGH | Its adversarial-guest design is strong, but its Pi example confines built-in tools rather than the whole delegate. Whole-delegate use requires a custom image, QEMU/Node changes, Git/worktree integration, and credential design. |
| Microsandbox 0.6.7 | **ISOLATED TRIAL** | MEDIUM-HIGH | Best VM candidate for a later whole-delegate trial: OCI images, mounts, resource bounds, and policy networking fit qq better. It is beta, has no qq adapter, and allowed-endpoint response reflection can reveal a substituted secret to the guest. |

None of these dispositions authorizes installation or migration. Each trial is a separately aligned Change.

## 1. Operator-only context inspection

### `pi-context-view`: useful after a real turn, not absolutely passive before one

**[HIGH — observed]** `pi-context-view` registers `/context` TUI commands rather than an agent-facing tool. It captures prompt/tool/message composition and renders usage and injection views. Its ordinary real-turn hooks do not add instructions or an ordinary provider-bound message ([source](https://github.com/dimk90/pi-context-view/blob/7857b5e0d293833b4c66b3a1b62315d7d494a980/src/index.ts)). Token decomposition is estimated rather than provider-tokenizer accounting.

**[HIGH — observed]** Before any real capture, `resolveInitialCapture()` calls `pi.sendUserMessage("")` ([source](https://github.com/dimk90/pi-context-view/blob/7857b5e0d293833b4c66b3a1b62315d7d494a980/src/command.ts)). The extension aborts that run at `turn_start`, sanitizes the aborted assistant result, records exact role/timestamp identities in a custom session entry, and filters those messages from later model contexts ([source](https://github.com/dimk90/pi-context-view/blob/7857b5e0d293833b4c66b3a1b62315d7d494a980/src/capture.ts); [lifecycle wiring](https://github.com/dimk90/pi-context-view/blob/7857b5e0d293833b4c66b3a1b62315d7d494a980/src/index.ts)). This qualifies the README statement that it “does not add any instructions or messages to the model context” ([README](https://github.com/dimk90/pi-context-view/blob/7857b5e0d293833b4c66b3a1b62315d7d494a980/README.md)). Future provider context is filtered, but the session and observer-visible history were still changed.

**[MEDIUM — gap]** The code aborts at `turn_start`, but this static audit did not trace every provider transport. It therefore does not prove that the fallback can never begin an outbound request.

**[MEDIUM-HIGH — inference]** The value is real only where the operator can see and interpret it. Under T-165.1's planned topology, install surface should be the visible Aligner only—not the internal Orchestrator or delegates. Context inspection of one process must not be presented as a view of the other process's active context.

**Recommendation: ISOLATED TRIAL**, with these gates:

1. Pin 0.3.0 and use a disposable/copied session on qq's pinned Pi; its npm peers are wildcards rather than a compatibility guarantee ([npm](https://www.npmjs.com/package/pi-context-view/v/0.3.0)).
2. Invoke `/context` only after one ordinary real turn, so the synthetic probe path is not exercised.
3. Compare session JSONL and provider-request payloads before and after opening both views; require no new entry and no provider-context delta.
4. Verify attribution for qq prompt additions, tools, Skills, and large context files.
5. Treat category/token values as estimates and hidden prompt previews as operator-sensitive material.
6. Roll back by removing the extension. A session in which the fallback already ran retains its synthetic records.

## 2. Compaction and “effectively infinite” conversations

### Baseline: active context, persisted history, and recoverability are different properties

**[HIGH — observed]** Pi 0.81.1 native compaction selects a boundary, asks a model for a structured summary, retains a recent tail verbatim, and persists the summary in the session. Extensions may override it through `session_before_compact` ([Pi compaction documentation](https://github.com/earendil-works/pi/blob/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/docs/compaction.md); [implementation](https://github.com/earendil-works/pi/tree/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/src/core/compaction)). Native compaction is lossy, but it is supported, minimal, and leaves one inspectable canonical summary.

This assessment uses three separate tests:

- **Active fidelity:** critical facts available without another lookup.
- **Recoverability:** omitted facts that can be retrieved only if the model recognizes the omission and searches.
- **Correctness:** retained or retrieved facts are accurate, current, and provenance-bearing.

A persisted JSONL record can satisfy recoverability while failing active fidelity. Neither property makes the model's usable active context infinite.

### `pi-blackhole`

**[HIGH — observed]** `pi-blackhole` 0.4.1 combines pi-vcc-derived deterministic extraction, observational-memory observer/reflector/dropper agents, a rendered compact brief, and a `recall` tool ([compaction hook](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/src/hooks/before-compact.ts); [recall tool](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/src/tools/recall.ts)). It is compatible by declaration with Pi >=0.81.1 and <1.0.0 ([npm](https://www.npmjs.com/package/pi-blackhole/v/0.4.1)).

**[HIGH — observed]** Its active brief deliberately truncates user and assistant text, compresses commands/tool calls, and caps memory records ([brief compiler](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/src/core/brief.ts); [record serialization](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/src/om/serialize.ts)). `recall` can reopen raw session entries, but only after the model decides to call it with an effective query.

**[HIGH — inference]** “Endless” therefore means retained records plus conditional retrieval—not faithful active context. Omission can fail silently because the model may not know a missing fact exists. Observer/reflection LLMs can omit, merge, or invent facts; repeated compaction can drift; recall adds latency and does not repair a missed-recall decision. A second memory store also competes with qq's operator-legible Tasks, decisions, plans, source, Checks, and handoffs.

**[HIGH — observed]** Memory is enabled by default and Blackhole's observer, reflector, and dropper make separate background LLM calls over conversation-derived chunks. Auto mode persists invisible memory markers in the session; manual mode accumulates per-session pending buffers on disk ([README](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/README.md); [observer](https://github.com/k0valik/pi-blackhole/blob/fcce8f63fa5595fd5417ee695ea795734f401e79/src/om/agents/observer/agent.ts)). This adds provider disclosure and retention/lifecycle surfaces beyond native compaction.

**Recommendation: REJECT as qq's default.** This is a semantic mismatch, not a claim that the package is nonfunctional.

### Landscape: no automatic replacement is ready for qq

| Approach | Audited benefit | Controlling limitation | Disposition |
|---|---|---|---|
| Pi native 0.81.1 | Supported; recent tail remains verbatim; one visible summary | Model summary is lossy | **RETAIN** |
| `pi-vcc` 0.5.0 | Deterministic extraction; no summarization model; raw JSONL recall | The active brief is bounded and selectively lossy; recall remains conditional. Its own benchmark reports limited absolute recall on very large sessions ([README](https://github.com/sting8k/pi-vcc/blob/90f578f267f630ac50af6ce259b05d1b49c11dff/README.md); [benchmark](https://github.com/sting8k/pi-vcc/blob/90f578f267f630ac50af6ce259b05d1b49c11dff/benchmarks/README.md)) | **HOLD** |
| `pi-smart-compact` 7.22.0 | Deterministic extraction followed by exploration, synthesis, verification, and repair | More calls, latency, state, and failure modes; final working context is still selected/synthesized ([README](https://github.com/alpertarhan/pi-smart-compact/blob/fe11865175e72b01120d0fdd4d559bc424b24de4/README.md)) | **HOLD** |
| `pi-better-compaction` 0.2.1 | Uses OpenAI Responses `/responses/compact` where available; otherwise delegates to native compaction | Provider/API-specific opaque replay with no qq cross-provider fidelity evidence ([README](https://github.com/lll9p/pi-better-compaction/blob/64e333847b76b88badbf346da9a75d0fed02c406/README.md)) | **HOLD** |
| `pi-observational-memory` 3.0.3 | Precomputes observations/reflections and supports evidence recall | The memories remain model-generated selection; format migration and hidden-state lifecycle add operational risk ([README](https://github.com/elpapi42/pi-observational-memory/blob/27a5195eaf90e4e2ca1302e3a31d4bb14df982a5/README.md)) | **HOLD** |
| `context-mode` 1.0.169 | Keeps large tool outputs outside context and retrieves indexed material | Changes tool/routing behavior and injects a mandatory working paradigm; it is not a fidelity-preserving Pi compactor ([README](https://github.com/mksglu/context-mode/blob/589d8214d56740a28b5f7bf63167743d586b0b40/README.md)) | **HOLD / separate problem** |

The table records source-supported designs, not independent validation of maintainer benchmarks.

**[HIGH — observed] Privacy/lifecycle comparison:** native Pi makes one summary-model call and stores its compaction entry in the canonical session. `pi-vcc` avoids an additional model call and searches the existing session JSONL. Blackhole/observational-memory add background model calls plus ledgers, markers, and/or pending buffers. `pi-smart-compact` may add exploration/synthesis/repair calls and persists pre-compaction backups, extraction caches, project state, and metrics; its pending summary is a process-local five-minute TTL slot, not another disk copy. Secret scrubbing is on by default, while optional PII scrubbing is off ([privacy/configuration](https://github.com/alpertarhan/pi-smart-compact/blob/fe11865175e72b01120d0fdd4d559bc424b24de4/README.md)). `pi-better-compaction` sends the effective context to a provider compact endpoint on supported APIs and can write debug artifacts when enabled. `context-mode` intentionally creates a separate SQLite/FTS retrieval store. These are materially different disclosure, deletion, resume/fork, and corruption surfaces even when active-context fidelity were equal.

**Recommendation: HOLD every automatic replacement.** Continue Pi native compaction, write durable intent/decisions/results into Repository artifacts before context pressure, compact at operator-legible boundaries where practical, and reopen source plus fresh Checks after compaction.

**Smallest reconsideration check:** use scrubbed copies of representative qq sessions and score native versus candidate outputs blind. Predeclare critical facts: scope, safety invariants, acceptance criteria, decisions and rationale, file paths, failures, pending Checks, and next action. Test repeated compaction, resume/fork, no-recall first, then recall. Measure critical-fact retention, inventions, false completion, contradictions, missed-recall rate, latency, cost, extra provider disclosures, persisted copies/retention/deletion, secret/PII handling, and corrupt-store recovery. Require 100% retention of scope/safety/acceptance invariants, zero invented completed Checks, and an operator-accepted privacy/lifecycle policy before any default trial.

## 3. ETA without changing agent behavior

### Why `pi-eta` does not fit

**[HIGH — observed]** `pi-eta` 0.1.0 requires Pi >=0.82.1, while qq currently runs 0.81.1 ([package](https://github.com/alasano/house-of-pi/blob/b235d512be5fd6ad3cfa1e2749c52bb687c39ed5/packages/pi-eta/package.json); [npm](https://www.npmjs.com/package/pi-eta/v/0.1.0)). More importantly, it appends mandatory system-prompt instructions on every turn and registers `eta_start`, `eta_check`, and `eta_finish` tools ([extension](https://github.com/alasano/house-of-pi/blob/b235d512be5fd6ad3cfa1e2749c52bb687c39ed5/packages/pi-eta/extensions/index.ts)).

**[HIGH — observed]** Its measured interval is wall time between an agent's `eta_start` and `eta_finish` calls. One timer is open per session; completion outcomes other than `completed` are excluded from calibration. This is neither delegate critical-path timing nor time until the next expected operator interaction.

**[HIGH — inference]** Prompting the work-performing model to estimate and maintain its own timer cannot be behavior-neutral. It exposes the raw estimate and timer lifecycle, adds tool turns/context, and can anchor planning, pacing, task partitioning, or padding. Hidden calibration multipliers reduce direct gaming but do not remove the intervention.

**Recommendation: HOLD.** Do not install `pi-eta` in the Aligner, Orchestrator, or delegates. Its robust log-ratio median, MAD spread, partial pooling, and gated Theil–Sen size correction are useful reference mathematics ([calibration](https://github.com/alasano/house-of-pi/blob/b235d512be5fd6ad3cfa1e2749c52bb687c39ed5/packages/pi-eta/CALIBRATION.md); [implementation](https://github.com/alasano/house-of-pi/blob/b235d512be5fd6ad3cfa1e2749c52bb687c39ed5/packages/pi-eta/extensions/stats.ts)), but qq should feed trusted orchestration/alignment events into an operator-only store and renderer. No calibration state or ETA tool should enter model context.

### The exact qq event rule

T-165.1's approved topology makes the visible Aligner the sole ordinary operator surface and the Orchestrator internal. Its current, unlanded implementation emits **`alignment:operator-turn-opened`** from the Aligner after an accepted assistant presentation reaches `message_end` (`T-165.1` `backlog/docs/plans/t-165-1-operator-alignment-core/doc-103` and concurrent Change `extensions/qq-aligner.ts:181-188`, inspected 2026-07-27). That event—not worker completion, orchestrator response arrival, PR creation, or provider completion—is the close boundary. Production calibration must wait until T-165.1 proves the event is post-render and input is enabled.

Record two related intervals:

#### Operator actionable wait (OAW) — the ETA shown to the operator

```text
u0 = operator-turn-committed
     emitted after the operator input is accepted and the prior turn closes

u1 = alignment:operator-turn-opened
     emitted only after the next expected actionable Aligner presentation
     is fully rendered and operator input is enabled

OAW = u1 - u0
```

**[MEDIUM-HIGH — recommendation]** OAW is the correct displayed quantity because it includes scheduling/alignment delay before the first dispatch. An operator waiting after submitting input experiences that delay too.

#### Actionable async latency (AAL) — the critical-path diagnostic

```text
t0 = first asynchronous dispatch declared awaited_for_next_alignment=true
     on the predeclared dependency path after u0

u1 = the same alignment:operator-turn-opened close event

AAL = u1 - t0
scheduling delay = t0 - u0
```

**[HIGH — recommendation]** “Critical path” must come from the declared dependency graph, not retrospective selection of the slowest branch. No qualifying dispatch means no AAL sample. The earlier working hypothesis—first critical-path dispatch to next operator interaction—becomes AAL rather than the complete operator ETA.

A timing episode should carry at least:

```text
episode_id, operator_turn_id, change_id, trace_id
expected_turn_kind, work_kind, topology/profile
operator_turn_committed_at, first_awaited_dispatch_at
alignment_operator_turn_opened_at
outcome, interrupt_or_realign_reason
```

The first implementation should estimate from empirical historical ranges by work kind/topology. It should not require a work agent to manufacture a raw estimate. If an estimate already exists for another legitimate planning reason, store it as optional evidence rather than adding a prompt or tool obligation.

### Episode examples

- **Decision-gating research before implementation:** input commit opens an OAW episode; the awaited research dispatch starts AAL; the rendered approval/realignment question closes both. Operator approval starts a new implementation episode.
- **Research inside an already approved Change:** research, implementation, review, fixes, Checks, and PR are one episode when none requires operator disposition. Close when the Aligner renders the green actionable PR handoff.
- **Implementer → reviewer → fix → Checks → PR:** internal handoffs do not close the episode. Retry remains in the same episode while no operator choice is needed.
- **Standalone research or review:** close at the rendered recommendation or review disposition. Pure background work with no expected operator turn has no ETA episode.
- **Parallel delegates:** AAL opens on the earliest dispatch declared awaited for the next alignment. Close only after every predeclared dependency needed for that next presentation settles; non-awaited observer/background branches cannot delay it.
- **Criteria-triggered realignment:** close normally when the Aligner renders the actionable choice. Work after the operator's disposition is a new episode.
- **Unsolicited scope replacement or interruption:** mark the old episode superseded/censored when the new operator turn is accepted; do not train successful calibration from it. That same accepted input immediately opens the replacement OAW episode. Its next expected actionable presentation may be a clarification/realignment choice or the eventual execution handoff; any later operator disposition starts the following episode in the normal way.
- **Passive status:** a status projection that does not require operator action does not emit `alignment:operator-turn-opened` and does not close the episode.
- **Post-merge observation/Architect work:** does not extend the delivery episode. A later finding intentionally requesting operator disposition is a separate episode.
- **Crash or render failure:** retain diagnostically as failed/censored; never treat it as a successful calibration sample.

**Current-system proxy:** before T-165.1 lands, retrospective analysis may approximate AAL from the earliest relevant `invoke_agent` span and the final assistant session entry before the next user message. It cannot prove post-render timing, awaited dependency identity, or actionable-versus-passive status. Use it only as a descriptive baseline, not production training data.

## 4. Delegate confinement

### Baseline threat model

**[HIGH — observed]** qq pins Landstrip 0.17.31 and grants role-specific read-only or workspace-write filesystem access. Its renderer deliberately sets `allowNetwork: true`. Decision-8 records the settled posture: delegates are semi-trusted workers; the fence contains accidents and drift, not a hostile agent. Staged Pi authentication is readable inside a child, and fresh review, owner verification, auditable artifacts, and operator merge remain compensating gates (`backlog/decisions/decision-8 - Delegate-network-egress-accepted-as-open-under-Landstrip-0.17.x-T-95.md`; `delegation/policies/roles.json`; `bin/lib/qq-render-landstrip-policy.mjs`).

A VM can materially improve host-kernel, host-memory, ambient-filesystem, local-service, and sibling-process isolation. It does **not** by itself prevent:

- upload of mounted Repository data to an allowed public destination;
- source transmission to the configured model provider;
- malicious behavior in trusted host adapters/plugins;
- VMM/hypervisor escape or guest-image supply-chain compromise;
- denial of service beyond configured caps;
- an allowed endpoint reflecting a substituted credential back to the guest.

Research roles needing arbitrary internet therefore retain a fundamental confidentiality/utility tradeoff.

### Side-by-side

| Axis | Current Landstrip 0.17.31 | ZeroBoot | Gondolin 0.12.x | Microsandbox 0.6.7 |
|---|---|---|---|---|
| Isolation boundary | Same-kernel Landlock/seccomp process tree | Firecracker/KVM fork | QEMU VM; experimental krun | libkrun/KVM microVM |
| qq integration | Production `qq-dispatch` path | None | Pi tool-override example | SDK/CLI; no Pi/qq adapter |
| Whole delegate? | Yes, outer process wrapper | No delegate process protocol | Example: no; custom image could | Possible, unproven |
| Worktree/filesystem | Exact host paths and Git/worktree policy | Code string over serial; no mount protocol | Programmable VFS/host providers | OCI root, bind/virtio-fs mounts, volumes |
| Network | qq explicitly unrestricted | No guest network | Host-mediated HTTP/1/TLS; optional constrained SSH/mapped TCP | Public egress by default; configurable domain/IP/CIDR/port/protocol policy |
| Credentials | Readable staged `auth.json` | Host API key; no guest network | Host placeholder substitution, with documented response/body limits | Host placeholder substitution, but response-reflection and OAuth caveats |
| Toolchain fit | Exact host toolchain/caches | Prebuilt Python/Node templates | Minimal Alpine; custom image required | Arbitrary OCI image |
| Host prerequisites | Already met | Linux/KVM | Node >=23.6, QEMU/assets; current host lacks QEMU and runs Node 22 | Linux/KVM and Node 22 supported; current host fits |
| Maturity | Integrated 0.17 line | Explicit working prototype | Young, substantial tests/security docs | Explicit beta, broad project/test surface |

### ZeroBoot

**[HIGH — observed]** ZeroBoot describes itself as a working, non-production-hardened prototype; accepts Python/Node code snippets; has no networking inside forks; and communicates through serial I/O ([README](https://github.com/zerobootdev/zeroboot/blob/87ca9c018a9c2a343ece768eec508e16497753f9/README.md)). The API handler logs submitted code in full to `/var/log/zeroboot/requests.jsonl` and permits anonymous access when no API keys are configured ([handler](https://github.com/zerobootdev/zeroboot/blob/87ca9c018a9c2a343ece768eec508e16497753f9/src/api/handlers.rs)).

**Recommendation: REJECT for qq delegates.** It solves disposable code execution, not a mounted, networked, persistent Pi delegate with Git and Completion Envelope transport.

### Gondolin

**[HIGH — observed]** Gondolin's current release is 0.12.0; current main source through `29fa74d` was also inspected. Gondolin explicitly treats the guest as adversarial, mediates network and filesystem I/O in trusted host code, and documents QEMU's VM boundary ([security design](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/security.md)). Its Pi example leaves Pi, model requests, extensions, and callbacks on the host while replacing built-in `read`, `write`, `edit`, and `bash` operations with VM-backed implementations ([Pi example](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/host/examples/pi-gondolin.ts)). That is a narrower “trusted host Pi, untrusted tool execution” boundary, not Landstrip's outer whole-delegate boundary.

**[HIGH — observed]** Whole-delegate qq use would need a custom image, runtime packaging, worktree/Git-common mounts, Completion Envelope transport, and credential design. Current limitations include Alpine-only image building, no HTTP/2/3 or QUIC, and no full memory snapshots ([limitations](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/limitations.md)). Secret substitution does not rewrite request bodies or response content, and allowed hosts remain trusted egress ([secrets](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/secrets.md)).

**Recommendation: HOLD.** Reconsider only if qq deliberately chooses the narrower tool-execution boundary or a whole-delegate Microsandbox trial fails.

### Microsandbox

**[HIGH — observed]** Microsandbox 0.6.7 uses a separate guest kernel and libkrun/KVM boundary; supports OCI images, mounts/volumes, resource/lifetime limits, and configurable network policy ([isolation](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/docs/security/isolation.mdx); [network](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/docs/security/network.mdx)). Linux with KVM and Node 22 is supported. The current host is Linux x86_64 with accessible `/dev/kvm`; the runtime is not installed. Upstream labels the product beta ([README](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/README.md)).

**[HIGH — observed]** Its documentation says a captured guest sees only placeholders and is “worthless for the secret” ([secret model](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/docs/security/secrets.mdx)). The network implementation substitutes only guest→server traffic and explicitly forwards server→guest bytes without substitution/redaction ([plain relay](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/crates/network/lib/proxy.rs); [TLS relay](https://github.com/superradcompany/microsandbox/blob/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/crates/network/lib/tls/proxy.rs)). An allowed endpoint that reflects an injected token—or an OAuth refresh response carrying a new token—can therefore reveal a real credential to the guest. Public egress also still permits source exfiltration.

**Recommendation: ISOLATED TRIAL while retaining Landstrip.** Only a whole-delegate design can claim to replace qq's current boundary; a host-Pi/guest-tools design must be labeled narrower.

Trial gates for a separate Change:

1. Pin 0.6.7 and an OCI image digest; use a disposable host or quarantined runtime home.
2. Use only synthetic tokens and a fake local HTTPS provider; test allowed-host reflection and OAuth-style response credentials explicitly.
3. Compare host-Pi/guest-tools and whole-Pi-in-guest architectures, but evaluate replacement only for the latter.
4. Reproduce reviewer/researcher/observer read-only and implementer worktree-write roles; mount Git common/worktree metadata without broadening primary-main writes.
5. Use non-root plus the restricted profile, deny-by-default egress, and explicit provider/package hosts. Do not equate “public only” with confidentiality.
6. Exercise traversal, symlink/hardlink/magic-link, `/proc`, out-of-worktree writes, private/metadata access, DNS rebinding, forged SNI, public upload, completion creation, timeout/signal/crash cleanup, orphaning, and parallel pressure.
7. Import sandbox lifecycle, denial, resource, and completion events into qq observation.
8. Keep rollback as one dispatch selector returning to the existing Landstrip path; migrate no durable state.

Promotion requires fresh role-policy parity, no undeclared mount access, explicit credential/network semantics without marketing overclaim, no silent host fallback, correct teardown/completion, acceptable parallel overhead, and reproducible pinned images.

### Landstrip status: no new proxy trial

**[HIGH — observed]** Landstrip 0.17.38 documents direct network denial by default and can admit caller-supplied loopback HTTP/SOCKS proxy ports; `allowNetwork: true` still disables that enforcement ([0.17.38 README](https://github.com/landstrip/landstrip/blob/e53975d9fb9eda796ccc79edf9c11c197b0b2757/README.md)). qq's current rendered policy explicitly chooses the latter.

**[HIGH — observed]** T-123/doc-75 already evaluated maintained standalone domain-filtering paths and freshly proved Tinyproxy plus Landstrip `httpProxyPort` as the sole trial candidate. The operator then declined that trial and retained Decision-8's open-egress posture (`backlog/completed/t-123 - Evaluate-a-maintained-standalone-domain-filtering-path-for-delegates.md`; `backlog/docs/research/doc-75 - Delegate-egress-domain-filtering-evaluation-—-T-123-AC#1-and-TRIAL-recommendation.md`). The 0.17.38 source inspected here does not expose changed evidence that supersedes that disposition.

**Disposition: no new proxy assessment or trial.** Retain Decision-8. Revisit only if the operator explicitly reopens the settled tradeoff or upstream supplies a materially different maintained standalone boundary.

## Dependencies and smallest next decisions

1. **No runtime change from this report.** The operator may separately authorize the `pi-context-view` trial and/or Microsandbox trial.
2. **T-165.1 dependency:** ETA instrumentation waits for the Aligner/Orchestrator topology and a proven `alignment:operator-turn-opened` close event.
3. **ETA implementation boundary:** persistent calibration and operator-only rendering belong in a separately aligned Change coordinated with T-165.3; the Aligner model must not receive calibration state or timer tools.
4. **Compaction reconsideration:** requires the blind fidelity corpus above; marketing claims or raw-history retention alone are insufficient.
5. **Fence reconsideration:** compare a whole delegate, not only its shell tools, and retain the current Landstrip selector for rollback.

## Gaps

- No live trace proved whether `pi-context-view`'s already-aborted fallback avoids every provider request.
- No representative qq compaction corpus was executed; landscape recommendations are source/design judgments, not measured fidelity rankings.
- No ETA event stream exists in landed qq; T-165.1 sources inspected here are concurrent and unlanded.
- No Gondolin or Microsandbox VM was booted, and no whole-delegate authentication/OAuth flow was tested.
- Upstream performance and maturity claims were not treated as independent Checks.
- Candidate state is point-in-time as of 2026-07-27 and is moving quickly.

## Sources

Primary sources that controlled the conclusions:

- Pi 0.81.1 [compaction documentation and implementation](https://github.com/earendil-works/pi/tree/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/src/core/compaction)
- `pi-context-view` 0.3.0 [source](https://github.com/dimk90/pi-context-view/tree/7857b5e0d293833b4c66b3a1b62315d7d494a980)
- `pi-blackhole` 0.4.1 [source](https://github.com/k0valik/pi-blackhole/tree/fcce8f63fa5595fd5417ee695ea795734f401e79)
- `pi-vcc` 0.5.0 [source](https://github.com/sting8k/pi-vcc/tree/90f578f267f630ac50af6ce259b05d1b49c11dff), `pi-smart-compact` 7.22.0 [source](https://github.com/alpertarhan/pi-smart-compact/tree/fe11865175e72b01120d0fdd4d559bc424b24de4), `pi-better-compaction` [source](https://github.com/lll9p/pi-better-compaction/tree/64e333847b76b88badbf346da9a75d0fed02c406), `pi-observational-memory` [source](https://github.com/elpapi42/pi-observational-memory/tree/27a5195eaf90e4e2ca1302e3a31d4bb14df982a5), and `context-mode` [source](https://github.com/mksglu/context-mode/tree/589d8214d56740a28b5f7bf63167743d586b0b40)
- `pi-eta` 0.1.0 [source](https://github.com/alasano/house-of-pi/tree/b235d512be5fd6ad3cfa1e2749c52bb687c39ed5/packages/pi-eta)
- ZeroBoot [source](https://github.com/zerobootdev/zeroboot/tree/87ca9c018a9c2a343ece768eec508e16497753f9)
- Gondolin [security model](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/security.md), [Pi example](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/host/examples/pi-gondolin.ts), and [limitations](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/limitations.md)
- Microsandbox 0.6.7 [security documentation](https://github.com/superradcompany/microsandbox/tree/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/docs/security) and [network implementation](https://github.com/superradcompany/microsandbox/tree/0c54fd12acf7740f68d5bcd38e58a9fe82d51a45/crates/network/lib)
- Landstrip 0.17.38 [source](https://github.com/landstrip/landstrip/tree/e53975d9fb9eda796ccc79edf9c11c197b0b2757)
- qq source: T-123 and doc-75's settled proxy-trial disposition; Decision-8; `delegation/policies/roles.json`; `bin/qq-dispatch`; `bin/lib/qq-render-landstrip-policy.mjs`; T-165.1 and its approved doc-103/current concurrent implementation.

The delegated source audit completed after one infrastructure-timeout recovery with explicit live-test gaps. The accountable owner reopened and checked the recommendation-controlling sources above before writing this report.
