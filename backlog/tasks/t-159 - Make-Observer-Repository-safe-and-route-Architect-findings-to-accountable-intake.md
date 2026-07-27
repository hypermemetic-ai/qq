---
id: T-159
title: >-
  Make Observer Repository-safe and route Architect findings to accountable
  intake
status: Done
assignee: []
created_date: '2026-07-25 00:14'
updated_date: '2026-07-27 03:21'
labels: []
dependencies: []
documentation:
  - doc-98
modified_files:
  - bin/qq-observe
  - extensions/qq-architect.ts
  - extensions/qq-handoff.ts
  - bin/lib/qq-handoff.py
  - skills/architect/SKILL.md
  - skills/deliver-change/SKILL.md
priority: high
type: feature
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the approved Repository-safe Observer and global Architect accountable-intake contract exposed by the qq-dictation PR #4 incident.

Observer production must resolve and pass an explicit canonical GitHub Repository identity, namespace new round and ledger identity by Repository plus PR plus variant, keep legacy flat analyses visible without rewriting append-only evidence, and expose the canonical confined Observer agent in qq-governed linked Repositories while leaving unrelated Pi projects vanilla.

`/architect` is one global, conversation-native digest entry: no round picker or fixed Accept/Reshape/Reject form. The Architect synthesizes new and still-unsettled findings across Observer evidence, drills into source rounds behind the scenes, recommends what matters, and discusses it openly. Only decisions actually settled in conversation enter a confirmed batch: a routed follow-up with agreed scope or an explicit set-aside; untouched findings remain open, and a later occurrence of a settled recurrence reopens it. One confirmed multi-source batch starts one fresh accountable Pi tab in qq's project home. That recipient owns normal grilling plus born-in-worktree Task/Change creation and returns verified Task mappings. Set-aside-only decisions need no Task. Discussion and resolution remain distinct: verified Task intake closes routed decisions as discussed; only verified merged corresponding PR evidence resolves them.

Source rounds remain immutable evidence and old round-scoped handoffs remain recoverable, but round identity is no longer an operator interaction track. The malformed legacy `~/.local/state/qq/observer/runs/pr-4` remains failed and undiscussed during this Change. A correct qq-dictation #4 retry must coexist under Repository-qualified identity.

Decision ledger:
- Desired read-only Architect role, typed handoff fields, fresh qq-tab accountable intake, verified Task return, fail-closed discussed gating, retryability, and failed-round recovery — operator handoff to the accountable qq session, 2026-07-24.
- One combined Task and one Change, implemented in dependency order — operator answer in the asked-and-answered alignment exchange, 2026-07-24.
- One recipient session owns each complete confirmed batch and grills its eventual Task decomposition — operator answer, same exchange; adapted from round batch to global selective batch by the final approved realignment below.
- A routed decision becomes discussed after verified Task intake; routed outcomes become resolved only after their corresponding pull requests merge — operator answer, same exchange.
- Older flat Observer analyses remain visible without rewriting append-only artifacts; new and retried rounds use Repository-qualified identity — operator answer, same exchange.
- Canonical Repository resolution from primary-main tracking remote, explicit gh targeting, governed-Repository-only Observer activation, reuse of qq-handoff lifecycle mechanics, append-only routing/result/resolution records, boundaries, non-goals, and Checks — approved alignment brief, operator approval, 2026-07-24.
- Earlier browser/wizard, conversation-native round disposition, and native round picker amendments record rejected UAT hypotheses in doc-98; none governs the final operator interface.
- Final governing Architect design: kill the digest/individual-entry interaction distinction. `/architect` opens one global digest conversation with no picker or fixed verdict prompt; it selectively records routed or set-aside decisions, leaves untouched findings open, reopens on a later recurrence, and sends one confirmed multi-source batch to one accountable recipient — operator-approved asked-and-answered UAT realignment, 2026-07-26.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Multi-remote assembly resolves the primary-main GitHub Repository explicitly and passes it to gh; equal PR numbers in two Repositories produce distinct correct guided/blind runs
- [x] #2 Repository identity survives package, finalize, ledger rebuild, recurrence counting, comparison, delivery verification, rounds, digest, and Architect evidence lookup without conflation
- [x] #3 Legacy flat analyses remain visible in place, are never rewritten as migration, and malformed legacy pr-4 stays failed while a correct Repository-qualified qq-dictation #4 can coexist
- [x] #4 The canonical confined Observer agent is executable in qq-governed linked Repositories and unrelated Pi projects retain vanilla behavior
- [x] #5 `/architect` opens one global digest conversation with no round picker or fixed verdict form; it may selectively route or set aside settled findings while untouched findings remain open and later recurrences reopen them
- [x] #6 Each confirmed routed multi-source batch produces one validated append-only handoff and one fresh accountable qq-home Pi tab; every routed decision maps to verified born-in-worktree Task and approved-plan evidence before discussed state, while set-aside-only decisions remain Task-free
- [x] #7 Discussed routed decisions remain unresolved until append-only receipts verify their corresponding pull requests merged; open or closed-unmerged Changes never masquerade as resolved
- [x] #8 Focused regression suites, applicable Skill validation, full repository Checks, fresh-context review/fix-delta review, bounded live Herdr/Pi evidence, and realistic operator UAT pass
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: operator
created: 2026-07-25 16:23
---
Operator UAT exposed excessive retyping in the initial Architect route: “I do not want to type all of that.” The operator approved a real extension UX pass: Repository-qualified round browser plus keyboard disposition cards, remembered selection, displayed suggested next-step reuse for Accept, prefilled Reshape editing, optional notes, and one final no-write batch review before routing.
---

author: operator
created: 2026-07-25 18:05
---
Second UAT disposition: the manual finding wizard added decisions over the model-led Architect conversation. Operator approved conversation-native disposition: the Architect proposes the settled structured batch through a narrow selected-round tool, and one exact native confirmation remains the sole write/start gate.
---

author: operator
created: 2026-07-26 16:17
---
Final UAT disposition: custom browser/cards/final confirmation overengineered the useful Architect conversation. Operator approved the simplest flow: native round picker, natural discussion, Architect summary plus “Route these?”, explicit affirmative reply, then strict evidence-bound tool execution with no duplicate UI.
---

author: operator
created: 2026-07-26 17:06
---
UAT realignment (verbatim, 2026-07-26): "I think we should just kill this entire distinction between the digest and individual entries." The representative real-round check showed that a picker plus repeated Accept/Reshape/Reject framing makes the Architect redundant and overcomplicates the interaction. Operator intent: the Architect should look across what is new or still untackled, synthesize what matters, and hold an open-ended conversation without requiring the operator to select a round. Work stopped before further UX enactment; no representative routing was confirmed.
---

author: operator
created: 2026-07-26 17:25
---
Approved final architecture realignment (2026-07-26): Global talk + route, with selective settled state and recurrence reopening. This supersedes all round-picker and fixed Accept/Reshape/Reject UAT designs. Round artifacts remain evidence and legacy recovery surfaces only; the normal Architect interface is one digest-wide open conversation.
---

author: operator
created: 2026-07-27 03:16
---
Final operator UAT passed (2026-07-26). On a disposable copy of real Observer PR #248, `/architect` selected nothing, synthesized both outstanding findings, connected their common architectural failure, prioritized them, and ended with an open design question rather than fixed verdict choices. Operator disposition: "Pass"; operator also explicitly accepted deep evidence-first initial analysis even when it takes several minutes ("Deep first is fine"). Disposable lifecycle evidence then confirmed fail-closed recovery: initial route startup was refused under deliberate cross-session focus contention and remained explicit pending; a later `/architect` showed the exact immutable pending batch separately from the untouched finding; exact retry reused that handoff, started one working accountable recipient, recorded the attempt, and restored Architect focus. Recipient/UAT tabs and temporary state were removed; no Task or live Observer evidence was created or changed.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented one Repository-safe Observer and global Architect accountable-intake Change. New Observer runs carry canonical GitHub Repository identity and live under Repository-qualified paths while legacy flat evidence remains untouched; same-number PRs, multi-remote lookup, comparison, ledger, delivery, and resolution are identity-bound. `/architect` now opens one bounded global digest conversation with no round picker or fixed verdict form, tracks only exact selectively settled occurrences, reopens later recurrences, keeps failed/uncertain routes explicit and retryable, and routes one immutable multi-source batch through the existing qq-handoff lifecycle to verified born-in-worktree Task/plan mappings and exact merged-PR resolution. Existing v1 handoffs remain low-level recovery compatibility. All top-level shell suites, focused routing/handoff/Architect suites, schema/compile/Skill checks, LSP for TypeScript, exact lowered ratchet, and diff checks passed. Fresh complete review found three lifecycle/evidence issues; all were fixed and the fix-delta plus later tool-schema delta were freshly approved. Disposable real-evidence operator UAT passed the no-picker global synthesis; operator accepted deep-first analysis latency. A disposable live route demonstrated fail-closed focus refusal, visible pending state, immutable exact retry, one working recipient, focus restoration, and complete cleanup without Tasks or live Observer mutation.
<!-- SECTION:FINAL_SUMMARY:END -->
