---
id: doc-115
title: Plan — privileged operator-alignment core
type: other
created_date: '2026-07-26 17:52'
updated_date: '2026-07-27 22:32'
---
# Plan — privileged operator-alignment core, native-session state

**Task:** T-165.1
**Status:** approved by operator scope realignment, 2026-07-27
**Research:** doc-113 (superseded delegated topology), doc-114 (privileged-root topology)
**Role decision:** decision-18 (Observer audits; Architect synthesizes findings)

## Outcome

The permanent first alignment-core Change remains ambitious: the visible project-home Pi is an immutable privileged aligner, one session-long trusted internal orchestrator owns execution and depth-2 work-role fanout, and the complete text/visual/presentation foundation lands now. The operator remains in one coherent conversation while internal Actors provide facts, implications, evidence excerpts, recommendations, and decision material.

The scope is narrowed at three seams only:

1. **Supplied material, not raw evidence capabilities.** Orchestrator projections carry bounded inline material with exact source references and provenance. The aligner may inspect and explain only that supplied material. If it is insufficient, the aligner returns `needs-data`; it receives no path-opening or capability-minting tool.
2. **Native Pi sessions, not a parallel content journal.** Root and child Pi session JSONL files remain the sole content/observation seam. Closed packets, tool-result details, and qq custom session entries preserve correlation, current control state, exact dispositions, lifecycle receipts, and replacement continuity. No second append-only content journal, hash/seal protocol, or sealed alignment package is created.
3. **Existing Observer/Architect system, not T-165.1 runtime expansion.** T-165.1 leaves current Observer package assembly, Architect launch/profile behavior, digest/intake, and Skills unchanged. Native correlated session files remain available to the existing post-hoc observation system. The broader decision-18 role split remains settled, but this Change does not implement a new Architect root or alignment-specific Observer package.

Voice remains T-165.2. Persistent calibration remains T-165.3.

## Architecture

```
operator ↔ immutable aligner root
                 ↕ closed qq exchange packets
        session-long internal orchestrator
                 ↕ pi-subagents depth-2 fanout
 implementer / reviewer / researcher / observer

root + child Pi session JSONL → existing post-hoc Observer/Architect surfaces
```

### Root aligner

- Replacement prompt, no inherited coding prompt, Repository context, Skills, templates, or default tools.
- Exact active tools for typed exchange, presentation/artifact creation, and exact operator-disposition capture.
- No shell, Repository investigation, work dispatch, mutation, delivery control, calibration inspection, or authority to act for the operator.
- Complementary spoken/visual fields and provenance-bearing Markdown, diagrams, and script-free temporary pages remain in scope.

### Internal orchestrator and lifecycle

- One trusted orchestrator child for the aligner session, with ordinary qq methodology and child-safe depth-2 fanout.
- Exact trusted manifest, canonical execution profile, and orchestrator Landstrip outer boundary over the declared Change-worktree root, required Git state, and private runtime; primary main remains non-writable and worker policies remain narrower.
- Multiple exchanges reuse the same orchestrator session. Crash, completion, shutdown, reload, `/new`, `/resume`, fork, and clone must stop or transfer without overlap. Exact-run terminal proof remains mandatory before replacement cleanup; inability to prove terminal state fails closed and retains recoverable lifecycle state.
- Replacement continuity is reconstructed from qq custom entries/tool-result state in native Pi sessions, using Pi's `previousSessionFile` and current branch semantics. Operational snapshots may contain ids, correlations, open decisions, exact disposition receipts, and lifecycle state, but may not duplicate an independent content transcript or sealed package.

### Closed exchange contracts

- Aligner requests: intent, clarification, status, evidence/analysis request, and exact disposition.
- Orchestrator projections: acknowledgement, status, decision, completion, failure, facts, inferences, recommendation, uncertainties, bounded supplied material, source references, and worker run ids.
- Every packet carries Change, exchange, request, reply, trace, and verbatim-operator correlation as applicable; unknown fields, stale ids, duplicate direct responses, fabricated dispositions, and malformed provenance refuse.
- Supplied material has explicit size/count limits and contains the explanatory excerpt/value plus source identity. It grants no path, URI, range, traversal, directory, search, or neighboring-object access.

## Implementation sequence

1. Preserve and reconcile the exact aligner root profile, orchestrator role/profile, `bin/pi` root selection, trusted dispatch, nested fanout, execution-profile routing, and Landstrip boundary already implemented.
2. Replace the current capability/trace/sealed-package schemas with the smaller bounded supplied-material packet shape. Remove the evidence-opening tool and all capability authority/storage code.
3. Replace the broker's parallel journal, sealing, and journal replay with native Pi custom entries/tool-result state. Keep exchange serialization, exact correlation, disposition ownership, orchestrator start/stop, terminal proof, notification handling, and session replacement continuity.
4. Remove T-165.1-owned Architect root/launcher/runtime changes and alignment-specific Observer package/procedure changes. Preserve decision-18 and current landed Observer/Architect behavior unchanged.
5. Keep presentation and temporary explanatory artifacts, but bind their provenance only to supplied material/source references recorded in native session entries.
6. Update methodology prose and focused tests to describe and prove this resulting system; delete tests that exist only for capability files, sealed packages, or new Architect/Observer runtime integration.

## Required Checks

1. **Root identity:** fresh start, resume, compaction, imported session, resource drift, and attempted role switching cannot change the aligner prompt or activate a non-allowlisted tool.
2. **Contracts:** valid packets round-trip; unknown fields, scheduling/execution fields, stale correlation, duplicate direct responses, fabricated dispositions, oversized supplied material, and malformed provenance refuse.
3. **Nested authority:** one orchestrator; depth-2 trusted roles work; depth 3 and untrusted manifests refuse; writable descendants remain within declared Change roots; primary main and read-only descendants remain non-writable.
4. **Lifecycle:** multiple exchanges reuse one child; crash/completion/shutdown/reload/new/resume/fork/clone preserve native-session control state, require exact terminal proof, and never overlap orchestrators or manipulate focus.
5. **Native trace/state:** requests, projections, supplied material, source references, exact operator text/dispositions, worker ids, and lifecycle receipts are recoverable from root/child Pi session files and qq custom entries; no parallel content journal or sealed package is written.
6. **Presentation:** spoken/visual output is complementary; derived artifacts retain supplied-material provenance, cannot mutate Repository state, and clean up with the session.
7. **Regression:** dispatch, runtime, execution-profile, extension mount, Landstrip, Skills, and existing Observer/Architect suites remain green without broadening T-165.1 ownership.
8. **Review/UAT:** fresh review passes and the operator validates initial alignment, criteria-triggered realignment, needs-data return, disposition capture, acceptance, and session replacement through the actual root interface.

## Explicit exclusions

- Raw evidence paths, opaque evidence capabilities, capability registration/promotion/opening, or neighboring-object access.
- A second content journal, journal hash/seal protocol, sealed alignment package, or alignment-specific Observer ingestion.
- A new Architect root, launcher, raw-package opener, digest behavior, or intake behavior in this Change.
- Speech recognition/TTS/barge-in/multi-session voice attention (T-165.2).
- Calibration state or proposal application (T-165.3).
- Panel/popup alternatives, direct work-Actor conversation, generic workflow engine, speculative exchange caps, OpenWiki edits, or focus manipulation.

## Delivery

Continue the existing isolated `feat/operator-alignment-core` Change and PR #270. Apply the scope reduction as one delegated implementation delta, verify against current `origin/main`, run one complete fresh review and focused fix-delta review only for confirmed blockers, perform operator UAT, then update the same unmerged PR. Do not merge.

## Scope realignment — 2026-07-27

The operator rejected criticisms that the permanent first increment, session-long internal-orchestrator lifecycle, and moving-main integration were themselves invalid scope. The operator explicitly accepted the other three scope criticisms and directed T-165.1 to scale down the raw evidence-capability protocol, parallel authoritative journal/sealed-package system, and T-165.1-owned Architect/Observer runtime integration. Exact operator disposition: “1, 2 and 6 -- don't seem like valid criticism to me. The rest of your points though, absolutely. So I say we scale down on all of those.”

## Convergence realignment — 2026-07-27

Two invariant classes survived two fix rounds: runtime trust remained below an administrative `bin/pi` branch, and continuity validity remained fragmented across pending/accepted/replay/start/stop paths. The operator accepted the convergence signal, rejected a third local patch, and approved the fresh structural recommendation: “Approve minimal reducer (Recommended).”

The final implementation direction is therefore settled:

1. **One unconditional launcher chokepoint.** A single finite `verify_landed_inputs` boundary validates `bin/pi`, executable `bin/qq-pi-runtime`, the pinned Pi manifest, and its referenced patch against landed qq `HEAD` before every `bin/pi` execution edge, including administrative commands. Aligner-only project, prompt, extension, and vendor checks remain after the administrative branch. Child dispatch and the existing Architect adapter continue invoking the pinned runtime directly.
2. **One transactional native-state reducer.** Live capture and replay use the same pure reducer. It derives and validates a complete candidate `ProtocolState`, derives and budgets the child-continuity projection, appends the native custom entry, and only then installs the candidate state. Caller- and phase-specific continuity checks are deleted rather than supplemented.
3. **Minimal fresh-child continuity.** Because the installed pi-subagents RPC exposes no safe cross-root `resume`, replacement continues to start a fresh orchestrator after exact predecessor terminal proof. The child receives only operational continuity: version/Change identity, open decisions, pending exact responses, and compact exact accepted dispositions. Full packets, source references, worker ids, timestamps, and receipt metadata remain in root native-session history for audit/provenance and are not copied into the child prompt.
4. **Bounded exact continuity.** Per-response and aggregate serialized continuity limits are enforced at the single admission boundary before append, mutation, quiescence, or predecessor stop. Unlimited cumulative exact decision text is not required in T-165.1; a future cross-root vendor-resume capability would require its own authorized Change.
5. **No migration burden for the unlanded experiment.** Pre-merge experimental session state receives no compatibility guarantee. Malformed or oversized old state fails closed; it is not silently sanitized, rewritten, or supported through extra migration machinery.
6. **Strict state-space shrinkage.** One writer round must reduce both production LOC and lexical decision points relative to the current tree while preserving the settled topology and required Checks. If it cannot, implementation stops rather than adding another guard or fix loop.

The installed vendor pin remains unchanged. No raw evidence capability, path opener, journal/replay package, seal, authorization service, database/daemon, Architect/Observer runtime integration, voice, calibration, focus behavior, or generic workflow engine returns.

## Root-interface UAT proof realignment — 2026-07-27

Actual no-focus root-interface UAT found that the pinned pi-subagents RPC prefixes an empty status with its spawn-budget summary. The reviewed broker expected the impossible unprefixed test-double string and therefore refused every real fresh aligner root before orchestrator spawn. Two bounded parser attempts then repeated the same fail-closed envelope class (first accepting arbitrary budget text, then accepting coercible non-string text), so the convergence breaker stopped further mutation.

The operator explicitly selected “Approve parser (Recommended).” This authorizes one final broker-boundary correction only: pass the RPC result through the existing exact-object validator, require primitive-string `text`, and accept only the pinned vendor's exact unlimited-or-finite budget-summary grammar followed by the exact session-owned empty-run line. Active, missing, extra, non-string, CR-hidden, malformed, or foreign status remains ambiguous and spawns nothing. Tests cover the valid unlimited/finite forms and those refusal classes. The vendor pin, session scoping, pre-spawn proof, topology, and all exclusions remain unchanged. The correction must add zero net production LOC and zero lexical decision points against the pre-UAT-fix broker; another supported finding in this class stops the Change.
