---
id: doc-98
title: Plan — Repository-safe Observer and Architect accountable intake
type: specification
created_date: '2026-07-25 00:14'
updated_date: '2026-07-26 17:52'
tags:
  - plan
  - observer
  - architect
  - handoff
---
# Plan — Repository-safe Observer and Architect accountable intake

**Status:** APPROVED by the operator in the accountable qq project-home session, 2026-07-24.

**Owning Task:** T-159

## Outcome

One combined Change repairs the cross-Repository Observer production invariant and then builds the Architect-to-accountable-session route on the resulting stable round identity.

The Architect stays read-only and operator-disposed. Accepted or reshaped outcomes never mutate source directly. One round batch becomes an append-only typed handoff to one fresh accountable Pi tab in the qq project home; that recipient runs normal grilling and creates the ordinary born-in-worktree Task(s)/Change(s). Verified Task intake closes discussion; verified merge receipts separately close delivery as resolved.

## Settled decisions

1. One combined Task/Change, implemented in dependency order — operator answer, asked-and-answered alignment exchange 2026-07-24.
2. One fresh accountable recipient session per round batch, not per finding — operator answer, same exchange.
3. `discussed` means dispositions are complete and accepted/reshaped outcomes have verified Task intake; `resolved` means the corresponding Change merged — operator answer, same exchange.
4. Legacy flat rounds remain visible in place and are never rewritten; new/retried rounds use Repository-qualified identity — operator answer, same exchange.
5. The seven-part desired handoff contract, failed-round recovery, and the incident-repair surfaces are required — operator handoff and approved alignment brief, same session.
6. Implementation shape, boundaries, non-goals, and Checks below — approved alignment brief, same session.

## Phase 1 — Repository-qualified Observer production

### Canonical Repository identity

For `assemble --repo ROOT`, require ROOT to be the canonical Git top level. Read `branch.main.remote`; require one non-local configured tracking remote; resolve its URL with Git. Canonicalize that explicit URL through `gh repo view <url> --json nameWithOwner`, validate two safe GitHub path components, then call `gh pr view <N> --repo <owner/name>`. Cwd is never Repository authority for a GitHub lookup.

New packages use package schema v2 and retain both:

- `repo`: canonical local Repository root, for local transcript/corpus work;
- `repository`: canonical GitHub `owner/name`, for durable Change identity.

Readers accept v1 only as legacy input and v2 as Repository-qualified input. New writes never emit v1.

### Store and row identity

Write new rounds under:

```text
<observer-store>/runs/by-repository/<owner>/<repo>/pr-<N>[-blind]/
```

Top-level `runs/pr-N[-blind]` remains the untouched legacy layout. Enumeration scans exactly the legacy pattern plus the qualified pattern; it does not recursively accept arbitrary directories.

`qq-observe rounds` becomes the path authority and returns each row's absolute `run_dir`, local `repo`, optional canonical `repository`, `legacy` boolean, PR, variant, terminal/discussed status, and timestamp. Architect uses `run_dir` rather than reconstructing a path.

Package, ledger, comparison, disposition, delivery verification, digest, render, and selector identity carry `repository` for v2. Distinct-source recurrence counts use `(repository, pr)`; v1 sources remain explicitly legacy rather than being guessed into a canonical GitHub identity. Digest and Architect labels show `owner/name#N`; legacy rows are visibly labelled from their stored local Repository path.

Blind assembly derives only from the guided run in the same qualified Repository namespace. Correct qq-dictation #4 assembly therefore coexists with the malformed legacy flat `pr-4`.

### Governed-Repository Observer availability

Move the current project-local subagent environment behavior into qq's globally mounted extension set with an exact governed-Repository gate:

- qq itself and qq linked worktrees are recognized by Git common-directory identity;
- a linked Repository is recognized only when its root `AGENTS.md` resolves to qq's canonical `AGENTS.md`;
- unrelated projects leave all `PI_SUBAGENT_*` and `QQ_DISPATCH_RUNTIME_ROOT` variables untouched;
- explicit operator-set variables still win, including an explicit empty value.

For qq worktrees, select that checkout's dispatcher/manifests. For linked Repositories, select the canonical qq checkout's dispatcher/manifests. This makes `observer` executable through the confined qq runtime in governed Repositories without globalizing qq policy into unrelated Pi work.

## Phase 2 — Typed accountable intake

### Durable handoff records

The Observer run remains the owning state surface. A round may hold one immutable typed handoff plus append-only attempt/result/resolution records. Use strict schemas and content-idempotent writes; any differing retry is an append-only conflict.

The handoff contains:

- stable handoff ID and round identity (`run_dir`, local repo, canonical Repository when available, PR, variant, legacy flag);
- kind: episode batch or failed-round recovery;
- every operator disposition in the batch;
- for accepted/reshaped outcomes: non-empty operator scope plus the full cited episode evidence copied from finalized analysis;
- for rejected outcomes: explicit rejection and optional note, with no Task requirement;
- for recovery: `analysis_failed` reason and artifact/package citations plus non-empty recovery scope;
- creation timestamp and immutable source hashes.

Do not accept `skip` as completion. Cancellation writes nothing. Existing handoff intent is reused on retry rather than regenerated.

### Fresh accountable tab

Extend/factor `qq-handoff` rather than duplicating its Herdr transaction. The intake action:

1. validates the typed handoff under the Observer store;
2. verifies the caller is the focused interactive Architect Pi in qq's persistent project home;
3. refuses a live recipient already associated with the same handoff;
4. creates one no-focus tab in qq's home at qq primary `main`;
5. starts canonical Pi, submits a fixed prompt, waits for `working`, restores exact caller focus, and records the structured receipt;
6. preserves uncertain/live resources and leaves the handoff retryable under the existing cleanup doctrine.

The fixed prompt says this is genuinely new accountable intake: read qq methodology plus the typed handoff, run grilling, obtain explicit approval, create normal born-in-worktree Task(s), plan(s), and Change(s), and never treat Architect findings as pre-approved implementation. It contains no originating conversation or hidden context.

### Verified Task result and discussed gate

A completion action accepts a mapping from every accepted/reshaped recurrence key (or the recovery item) to one or more Task IDs. It verifies in current qq Git/Backlog evidence that every Task:

- resolves uniquely in a registered non-main linked worktree;
- is active, has a decision ledger, and has an attached approved plan resolving in that checkout;
- belongs to the qq Repository topology;
- is not merely present in primary main or a detached checkout.

One Task may cover multiple outcomes and one outcome may map to multiple Tasks. Every routed item must map to at least one verified Task. The result is append-only and records exact Task/plan/branch/checkout evidence.

`mark-discussed` enforces:

- rejected-only disposition: may mark immediately;
- accepted/reshaped/recovery: requires a matching valid handoff and complete verified Task result;
- failed/uncertain route or incomplete mapping: refuse, preserve, and keep the round visible;
- failed Observer round: explicit recovery route or explicit reject/no-recovery only; remove anonymous empty closure.

The first `/architect-discussed` invocation collects dispositions and starts/retries intake. A later invocation detects the verified result and asks for the explicit discussed confirmation. It never asks the same settled verdicts again.

### Resolution after merge

A resolution action records one append-only receipt per routed Task only after explicit GitHub Repository targeting proves the corresponding PR state is `MERGED` and the Task/Change identity still matches. `OPEN` or `CLOSED` without merge refuses. The receiving accountable session calls it after normal `qq-change land`; failure leaves the discussed outcome routed but unresolved.

Rounds/digest expose routed Task IDs and resolution status. A batch is resolved only when every routed Task has a verified merged receipt. Resolution never reopens or changes the operator's Architect disposition.

## Source surfaces

Expected source changes include:

- `bin/qq-observe` and Observer schemas/procedure;
- `extensions/qq-architect.ts` and its extension tests;
- `bin/qq-handoff`, `bin/lib/qq-handoff.py`, `extensions/qq-handoff.ts`, and handoff tests;
- globally mounted subagent environment extension, mount index, README/install and tests;
- `skills/architect/SKILL.md` and `skills/deliver-change/SKILL.md`;
- focused Observer assembly/ledger/delivery tests and ratchet baseline only if the approved prose necessarily raises it.

Exact file factoring is implementation judgment, but no second generic Herdr lifecycle or parallel durable state owner may be introduced.

## Threat model and boundaries

Trusted boundaries:

- operator UI inputs become data only after strict schema validation;
- XDG Observer store paths must remain beneath the resolved state root and reject symlinks/non-regular artifacts;
- Repository and Task identity come from current Git/GitHub/Backlog evidence, not labels, notes, branch-name guessing, cwd inference, or handoff prose;
- Herdr transaction identifiers must be returned by structured APIs and re-inspected before claims or cleanup.

Defended failures:

- multi-remote GitHub ambiguity;
- equal PR-number collisions;
- path traversal/symlink escape;
- malformed or stale packages, handoffs, results, and receipts;
- accepted outcomes with missing/fabricated Tasks;
- duplicate recipient startup and uncertain cleanup;
- discussion or resolution claims before their evidence exists.

Declined classes:

- malicious operator or compromised local account;
- GitHub/Herdr/Pi service compromise;
- generic scheduling, remote execution, or unrelated project policy;
- repair of historical malformed evidence.

## Non-goals

No auto-implementation, auto-Task creation, auto-approval, auto-merge, generic queue/scheduler, new Herdr infrastructure, rewrite/copy migration of legacy artifacts, digest-level verdicts, or weakening of `/handoff` and normal delivery gates. Do not mark the live malformed legacy `pr-4` discussed.

## Checks

1. Baseline/reproducer first: current fake-gh assembly accepts a cwd-only lookup; add a failing multi-remote assertion before the fix.
2. Two-Repositories/same-PR fixture proves explicit canonical Repository targeting, distinct guided/blind paths, and correct package identities.
3. Focused suites cover assembly, ledger/rebuild/digest, comparison, delivery verification, analysis validation/render, rounds, Architect extension, handoff engine/extension, global extension mount, subagent env, bin resolution, and ratchet.
4. Task-result fixtures cover unique linked worktrees, plans/ledger, complete mappings, duplicates, malformed IDs, primary/detached/foreign candidates, and idempotent conflict handling.
5. Resolution fixtures cover exact Repository targeting and MERGED versus OPEN/CLOSED behavior.
6. Validate changed Skills with the Skill validator; run `bash -n` for shell, primary LSP/static diagnostics for TypeScript/Python, `git diff --check`, then the full top-level shell suite.
7. Run fresh-context code review after local verification, reproduce/fix only confirmed in-scope failures, rerun affected Checks, and review each fix delta.
8. Perform a bounded live governed-linked-Repository Observer inventory probe and disposable Architect intake Herdr/Pi probe without touching the malformed `pr-4`; then operator UAT of the visible two-phase flow.

## Delivery

The accountable owner verifies the implementer Completion Envelope and tree, presents the final diff, commits and pushes only green state, opens one PR, passes GitHub Checks, finalizes T-159 in the Change, and never merges. After operator merge it follows normal land, Observer, and retirement procedures.

## Superseded Architect UX hypotheses

Three hands-on UAT iterations rejected a custom round browser/card wizard, a conversation-plus-final-card flow, and a native round picker with fixed Accept/Reshape/Reject disposition. They remain recorded in T-159 comments as evidence behind the final design; none governs implementation.

## Approved architecture realignment — one global digest conversation

Operator approval: asked-and-answered representative-round UAT realignment, 2026-07-26. This section supersedes every preceding Architect browser, round picker, manual card, fixed-verdict, and selected-round conversation design. Phase 1 Repository safety and the immutable-evidence/intake/merge verification threat model remain governing.

The representative real-round UAT established that asking the operator to select an individual analysis and repeatedly choose Accept, Reshape, or Reject turns the Architect into a form over conclusions the Analyst already supplied. The operator's governing direction is: “kill this entire distinction between the digest and individual entries.”

### Operator interaction

`/architect` has no selector. It loads a current machine-readable digest context and starts one open-ended Architect conversation. The Architect synthesizes what is new or still untackled, connects related findings across source rounds, recommends what matters, and reads detailed source analysis only behind the scenes when useful. Source-round identity is evidence provenance, not an operator navigation track.

The conversation has no required visible verdict vocabulary. The operator can explore tradeoffs, redirect priorities, settle a concrete follow-up, explicitly set something aside, or leave it untouched. The Architect does not force a decision after presenting a finding. When the conversation has genuinely settled a batch, the internal execution tool produces one exact natural-language summary and asks for one later affirmative confirmation; only then may durable state or routing begin.

### Selective occurrence lifecycle

A confirmed batch records only decisions explicitly settled in that conversation:

- **route** — one non-empty operator-settled follow-up scope;
- **set aside** — an explicit no-action conclusion for the evidence currently observed;
- omitted findings remain unsettled and continue to appear in Architect context.

State binds to the exact covered occurrence identities, not only a recurrence-key label. A later Observer occurrence of the same recurrence key is therefore new uncovered evidence and reopens it automatically. No old dismissal or route hides a subsequent recurrence.

One confirmed batch may cover findings from multiple source rounds. It is one append-only Architect intake transaction owned under the Observer state surface, not a second generic lifecycle. A routed batch uses the existing `qq-handoff` startup/verification/cleanup mechanics to create exactly one fresh accountable recipient. That recipient performs normal grilling and may mint one or multiple born-in-worktree Tasks/Changes. Verified result mappings bind every routed recurrence/occurrence to current Task, plan, branch, checkout, and Repository evidence. Set-aside-only batches require no Task.

A routed decision becomes discussed only after the verified intake result exists. Its Task mappings become resolved only through exact merged-PR/head-OID/Repository receipts. Failed or uncertain startup, incomplete mappings, changed evidence between proposal and confirmation, negative/unrelated confirmation, or unverified delivery all fail closed and remain retryable. A single later operator reply cannot authorize altered decisions.

### Compatibility and boundaries

Immutable Observer packages, analyses, analyst traces, and append-only ledger history remain unchanged. Repository-qualified and visibly legacy source identity remains mandatory. Existing round-scoped handoffs/results stay readable and recoverable through an explicit compatibility path, but rounds, `/architect-discussed`, and Accept/Reshape/Reject are not advertised or required by the normal Architect flow. The malformed live legacy `pr-4` is never mutated or marked discussed.

No automatic Task creation, scope approval, implementation, merge, scheduling, queue, or full dashboard is added. The Architect remains read-only and cannot apply findings. The accountable recipient still owns grilling and ordinary born-in-worktree delivery.

### Implementation and evidence

Add the smallest strict derived context needed for the Architect to identify new/uncovered occurrence-backed findings and their source evidence. Replace selected-round tool authority with current-context, multi-source selective decision authority. Store content-addressed proposal/batch evidence under the Observer state owner; extend the existing intake handoff validator/result/resolution path rather than creating another Herdr lifecycle. Retain legacy readers while deleting superseded normal-path picker/card code and tests.

Fresh Checks must prove: no picker/custom UI on `/architect`; current digest synthesis across Repositories and rounds; exact occurrence/source binding; selective route/set-aside with untouched findings remaining; recurrence reopening; multi-source batch identity and immutable evidence hashes; no write before a later clear affirmative; stale/changed/negative/replayed confirmation refusal; one recipient and complete verified Task mappings; exact merged resolution; legacy round-handoff recovery; focused/full suites, ratchet, diagnostics, fresh review and fix review, disposable live Herdr/Pi routing, and realistic operator UAT of the global conversation.
