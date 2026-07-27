---
id: doc-115
title: Plan — privileged operator-alignment core
type: other
created_date: '2026-07-26 17:52'
updated_date: '2026-07-27 06:13'
---
# Plan — privileged operator-alignment core

**Task:** T-165.1
**Status:** approved
**Research:** doc-113 (superseded delegated topology), doc-114 (current topology)
**Role decision:** decision-18 (Observer audits preserved traces; Architect synthesizes findings)

## Outcome

New accountable project-home Pi sessions expose one privileged aligner as the operator's operational interface. The aligner uses an exact replacement prompt and a small typed tool set. One session-long trusted internal orchestrator owns qq execution and delegates existing work roles at depth 2. The operator sees alignment material and complete inspectable evidence, not direct work-Actor conversation. Observer directly audits preserved alignment/work traces. The Architect remains a separate, operator-invoked synthesis and selective-routing profile over cited Observer findings.

T-165.1 lands the permanent text/visual/provenance/runtime foundation and Observer audit seam. T-165.2 attaches transcription and speech to these contracts. T-165.3 applies operator-approved calibration proposals synthesized by the Architect from cited Observer findings without exposing calibration state to the aligner.

## Approved architecture

```
operator ↔ aligner root
              ↕ qq alignment broker
       internal orchestrator
              ↕ pi-subagents fanout
 implementer / reviewer / researcher / observer

sealed trace → observer audit → architect synthesis/routing ↔ operator
```

- Root aligner: replacement prompt; no inherited coding prompt, Repository context, Skills, templates, or default tools.
- Aligner tools only: typed orchestrator exchange; capability-granted evidence/trace open; explanatory artifact creation; operator presentation/disposition capture.
- Internal orchestrator: trusted exact manifest, normal qq project methodology, execution tools, child-safe pi-subagents fanout, no operator-facing presentation authority.
- Broker: typed transport, correlation, evidence capabilities, journal, lifecycle lease, and trace sealing only. It never chooses workflow, workers, priorities, or dispositions.
- Landstrip: orchestrator outer policy admits the qq Change-worktree root, Git common state, and private runtime needed by descendants; primary main remains non-writable; existing worker policies remain narrower.
- Observer/Architect: Observer directly audits sealed work/alignment packages; the separate immutable Architect root synthesizes and selectively routes or sets aside cited Observer findings and never switches the aligner session into architect mode.
- Conversation length: ordinary lifecycle timeout/crash safety only; no exchange-count or anti-chatter control before evidence warrants one.

## Implementation sequence

### 1. Establish exact root profiles

- Add durable aligner and architect root prompt sources outside child-agent discovery.
- Extend the verified `bin/pi` launch path so a non-child project-home root defaults to `aligner`; child dispatch remains unchanged and an explicit architect launcher selects `architect`.
- Launch each root with `--no-extensions`, exact required extensions, `--no-skills`, `--no-prompt-templates`, `--no-context-files`, and `--no-tools` before the role extension activates its exact tool set.
- On session start and every model turn, fail closed unless the role marker, prompt source, loaded extensions, and active tools match the immutable profile.
- Keep Pi transcript, compaction, resume, model interaction, and TUI behavior intact.

Primary seams: `bin/pi`, `bin/qq-pi-runtime` only if argument/profile resolution needs a tested helper, new root manifests beneath `delegation/manifests/roots/`, new `extensions/qq-aligner.ts`, and focused runtime/profile tests.

### 2. Add closed alignment and transport contracts

- Add strict versioned schemas with `additionalProperties:false` for:
  - alignment episode packet and operator presentation
  - aligner→orchestrator intent/clarification/status/evidence/analysis/disposition
  - orchestrator→aligner status/evidence/analysis/decision/completion/failure projection
  - evidence capability and trace reference
  - exact operator disposition receipt
  - sealed alignment package
- Require Change/exchange/trace correlation and immutable verbatim operator text.
- Omit every scheduling/execution field from aligner-facing requests.
- Refuse stale ids, unknown fields, fabricated dispositions, and malformed provenance.

Primary seams: new schemas under `delegation/manifests/` and schema fixture Checks.

### 3. Build the narrow qq alignment broker

- Add one private broker module behind the aligner extension.
- Mechanically start exactly one trusted orchestrator through pi-subagents v1 async RPC from a supported lifecycle callback; do not expose generic `subagent` to the aligner.
- Use a private, mode-restricted runtime channel with atomic schema-validated request/response files or equivalent supported qq-owned IPC; do not import pi-subagents internals or use unconstrained intercom prose.
- Correlate every exchange, surface unsolicited orchestrator decision/completion packets to the aligner, detect crash/exit, and terminate or hand off the child cleanly on session replacement.
- Keep workflow choice and work state inside the orchestrator.

Primary seams: `extensions/lib/qq-alignment-broker.ts`, `extensions/qq-aligner.ts`, a child-only channel extension beneath `delegation/extensions/`, pi-subagents RPC event integration, and lifecycle tests.

### 4. Add the trusted internal orchestrator

- Add an exact `orchestrator` child manifest and trusted-path mapping.
- Give it the qq project/methodology context needed to replace today's accountable orchestration capability, plus explicit `subagent`/wait/channel tools; do not give it aligner presentation/disposition tools.
- Add dispatch observation identity and maximum depth 2.
- Extend the Landstrip role declaration/renderer with an explicit orchestrator scope over the Change-worktree root, Git common state, and private runtime, while keeping primary main non-writable.
- Prove a nested implementer can write and commit only its assigned linked worktree and read-only descendants cannot write.

Primary seams: `delegation/manifests/agents/orchestrator.md`, `.pi/extensions/qq-subagent-env.ts`, `delegation/policies/roles.json`, `bin/qq-dispatch`, `bin/lib/qq-render-landstrip-policy.mjs`, and dispatch/policy integration tests.

### 5. Add brokered evidence, presentation, and trace sealing

- Register exact evidence/trace objects as opaque capability ids with canonical target, allowed range, media type, immutable digest, source exchange, and retention state.
- Allow exact operator-supplied objects but no neighboring-path authority.
- Refuse paths, directories, globs, search, traversal, symlink swaps, digest drift, foreign/expired ids, and out-of-range reads from aligner tools.
- Permit Markdown, diagrams, and script-free static explanatory pages only beneath a private temporary presentation root; never write Repository/Task/delivery state or open/focus a surface automatically.
- Journal verbatim operator input, labeled aligner translation, unmodified orchestrator packets, exact dispositions, evidence receipts, nested run ids, and qq trace/span ids in mode-restricted XDG state.
- Seal the journal at Change finalization and package it as bounded, integrity-checked Observer evidence. The Architect receives cited Observer findings through the landed digest/intake contract, never raw package authority. Do not include calibration state.

Primary seams: broker state module, aligner tools/renderers, observer package reference seam, and capability/provenance/cleanup tests.

### 6. Preserve direct Observer audit and independent Architect synthesis

- Package the sealed alignment package and journal as bounded, integrity-checked Observer evidence using the landed Repository-qualified Observer contract.
- Load the landed Architect digest/intake behavior only in the immutable Architect root profile; do not add a raw sealed-package opener.
- In the aligner profile, `/architect` launches or identifies a separate Architect Pi only after explicit operator invocation, using background/no-focus creation and no focus-restoration command.
- Preserve Observer findings as cited proposals, Architect synthesis/selective routing, and operator disposition as the authority. Calibration application remains T-165.3.
- Update handoff/session-replacement behavior so a fresh aligner receives current alignment state and the old internal orchestrator is proven stopped or the replacement fails closed without an orphan or focus manipulation.

Primary seams: Observer packaging/validation, `extensions/qq-architect.ts`, the root-profile launcher/extension, a narrow no-focus Architect launcher if required, lifecycle state, and focused Observer/Architect tests.

### 7. Land policy, vocabulary, and verification

- Add `aligner` to canonical role vocabulary and update accountable-session methodology to distinguish visible alignment, internal orchestration, direct Observer audit, and independent Architect synthesis/routing.
- Document the broker and permission boundary in source-owned Repository guidance. Do not edit OpenWiki in this source Change; its dedicated maintainer owns derived refresh.
- Preserve Completion Envelopes unchanged as internal work evidence.
- Run proactive diagnostics, exact focused suites, full relevant Repository Checks, fresh-context review over the implementation and every fix delta, then operator-facing UAT across all three alignment episodes.

Primary seams: `AGENTS.md`, `CONCEPTS.md`, `README.md`, relevant Skills/policies, extension mount tests, and existing documentation validation.

## Required Checks

1. **Root identity:** fresh start, resume, compaction, imported session, tool registry drift, prompt injection, and attempted architect switching cannot change aligner prompt or activate a non-allowlisted tool.
2. **Contracts:** valid fixtures round-trip; scheduling fields, stale correlation, fabricated dispositions, malformed provenance, and unknown fields refuse.
3. **Nested authority:** exactly one orchestrator; depth-2 trusted roles work; depth 3 and untrusted manifests refuse; nested implementer writes/commits only its linked worktree; primary main and read-only roles remain non-writable.
4. **Evidence broker:** exact registered ranges open; arbitrary path/sibling/search/traversal/symlink/digest/binary/expiry/range attacks refuse.
5. **Lifecycle:** multiple exchanges use the same orchestrator session; ordinary long exchanges are not capped; crash, completion, shutdown, resume, and handoff correlate without orphaning or focus changes.
6. **Trace:** one intent, decision request, exact disposition, evidence open, worker run, and completion resolve through shared ids into the sealed package; Observer audits it directly and the Architect receives cited findings through the landed digest/intake flow; aligner cannot access calibration state.
7. **Presentation:** spoken and visual fields are complementary fixtures; detailed trace remains inspectable; derived artifacts preserve provenance, cannot mutate source state, and are cleaned according to session lifecycle.
8. **Regression:** existing runtime, dispatch, policy renderer, extension mount, observer, architect, handoff, and documentation suites remain green.
9. **Review/UAT:** fresh review and fix-delta review pass; operator confirms initial alignment, criteria-triggered realignment, and acceptance behavior through the actual root interface.

## Explicit exclusions

- Speech recognition, TTS, voice identity/direction, barge-in, and concurrent-session speech attention (T-165.2).
- Persistent calibration state, Architect synthesis of calibration proposals, correction/decay, and cross-project tuning (T-165.3).
- Panel/popup alternate interface, direct work-Actor conversation, generic workflow engine, second completion contract, speculative loop caps, or OpenWiki refresh.

## Delivery

One implementation work order in the isolated `feat/operator-alignment-core` Change checkout, followed by owner verification, fresh review and fix-delta review, operator UAT, one green PR, and verified disposition. No Herdr focus, pull, move, snap, or focus-restoration commands are permitted.

## Approved convergence amendment — 2026-07-27

Fresh review doc-117 exposed three enforcement-layer mismatches. The operator approved the following long-term-owner interpretation:

- The orchestrator remains trusted but fallible. Channel records are untrusted proposals, not authoritative state. The root broker performs the complete mechanical evidence validation and promotes accepted metadata into root-only private state; aligner reads use only that promoted state. Do not add an authorization subsystem unless the broker gains a real policy choice beyond validation.
- Exact-run process terminal state is mandatory before journal sealing or channel cleanup. Consume the pinned pi-subagents structured completion event and its installed status response contract; fail closed into recoverable, unsealed state when terminal proof is unavailable.
- The outer sandbox admits the declared canonical Change-worktree root, required Git state, and private runtime only. It does not derive write authority from arbitrary registered linked worktrees.
- Primary-main path guards are defense-in-depth for trusted Actors. T-165.1 does not claim hostile-process Git isolation while descendants share Git common state.

Checks must reproduce a direct channel-write attempt without authoritative promotion, the installed RPC terminal-status shape, and an external registered-worktree refusal.

## Approved role-boundary amendment — 2026-07-27

The operator confirmed decision-18 after reconciling T-165.1 with the landed T-159 contract: Observer directly audits preserved work/alignment traces. The Architect does not receive a raw sealed-package tool; it synthesizes and selectively routes or sets aside cited Observer findings through the existing digest/intake surface. This removes duplicate audit responsibility and narrows the Change.

The approved convergence delta is therefore limited to durable aligner/orchestrator replacement state, exact terminal proof, complete broker trace references, bounded Observer packaging of the sealed trace, and the immutable Architect wrapper over the landed findings interface. Voice, calibration application, new Architect UX, broader Observer redesign, OpenWiki, and focus manipulation remain excluded.
