---
id: T-95
title: >-
  Migrate delegation to pi-subagents + Landstrip; retire codex-profiles, shrink
  qq-dispatch
status: Done
assignee: []
created_date: '2026-07-19 16:41'
updated_date: '2026-07-20 23:53'
labels: []
dependencies:
  - T-94
documentation:
  - doc-56
priority: high
type: task
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
UNPARKED 2026-07-20: T-120 reran the full 9-check matrix outside codex confinement — all nine PASS, ADOPT verdict (PR #160); pilot/evidence/findings.md recommends removing the park note. Model-identity verification stays open as this ticket's own acceptance criterion (the rerun used a deterministic mock child and never exercised model selection).

Move role definitions into pi-subagents agent manifests plus Landstrip policies; retire codex-profiles/; shrink bin/qq-dispatch to the thin adapter doc-56 names (role-to-policy selection, worktree/git-dir discovery, fail-closed sandbox start, process-group timeout and descendant cleanup, artifact compatibility); rewrite delegate-batch/code-review/research dispatch mechanics on pi-subagents strict schemas while preserving their judgment content (work orders, completion envelope semantics, fresh-context requirements, owner verification). Remove the herdr stage machinery rather than bridging it: delete qq-status's herdr report/notify paths; pi-subagents native artifacts/widgets are the delegate-visibility story.

Decision ledger:
- Migration target and named residuals: doc-56 (verified findings), ticketed per operator instruction in the T-93 follow-up session.
- Profile symlink verification may disappear only when replacement policy loading is equally fail-closed: doc-56.
- Herdr stage machinery removed, not bridged — no qq-status business-stage bridge rides the migration; accepted loss of out-of-transcript blocked-delegate notification: operator decision, asked-and-answered alignment exchange, 2026-07-19 alignment session ('kill the herdr machinery. I'm confident.'). Cockpit, topology scripts, and messaging out of scope.
- 2026-07-19: decision-3 broadened — the detail-file protocol is deleted too (T-116, delete-now); the earlier 'detail-file protocol stays as the ambient record' line is superseded and removed above. Delegate visibility until this migration: transcripts + pi-intercom.
- 2026-07-20: unparked — T-120 (ADOPT, PR #160) met the park note's release condition: full 9-check rerun outside codex confinement, all PASS (pilot/evidence/findings.md).
- 2026-07-20: delegate network egress accepted as open under Landstrip 0.17.x with declared threat model; inert domain-list fields removed from policies; revisit trigger ticketed as T-123: decision-8 (operator-approved alignment exchange, this session). The pilot's network-route approval semantics are retired as unimplementable under Landstrip 0.17.x.
- 2026-07-19 (operator, project-home session): delegates stay on GPT-5.6 under the migration — pi-hosted, not codex — and do NOT inherit the project-home kimi-coding/k3 default (README settings). Recorded consequences: (1) every role manifest must pin the model explicitly — the T-94 pilot manifests set no model field, so children would silently resolve k3; (2) Pi child processes need an OpenAI-route credential — Pi private auth today holds only the pi-qq Kimi credential (T-91), while GPT-5.6 delegates currently authenticate through codex's ChatGPT login; (3) model identity must be verified by a fresh check in the unblocked T-94 rerun and carried into this ticket's acceptance criteria — the pilot's mock child never exercised model selection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 codex-profiles/ removed and qq-dispatch reduced to the adapter; tests updated and green
- [x] #2 delegate-batch, code-review, and research skills dispatch through pi-subagents with strict JSON-Schema envelopes; judgment sections unchanged
- [x] #3 Reviewer/researcher read-only and implementer worktree-write confinement demonstrated fresh under the new substrate
- [x] #4 qq-status's herdr report/notify paths removed; tests updated and green (detail-file surface already deleted under T-116)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Close-out summary (2026-07-20): migration landed through eight bounded tickets on one branch. AC#1: codex-profiles/ deleted; bin/qq-dispatch is the fail-closed pi-subagents/Landstrip adapter (role→policy selection, worktree/git-dir discovery, canonical cross-worktree invocation, staged auth, process-tree supervisor). AC#2: the three skills dispatch via one-step chains with `outputSchema` loaded from delegation/manifests/completion-envelope.schema.json; judgment sections byte-identical (SHA-256 verified by ticket 2b). AC#3 demonstrated live by the owner: reviewer and researcher writes → OS Permission denied; implementer in-worktree write allowed, $HOME escape denied; children resolved openai-codex/gpt-5.6-sol in run metadata; native gate committed as tests/test-qq-delegate-enforcement.sh and wired into CI. AC#4: bin/qq-status deleted with its test; herdr stage machinery removed, not bridged. Review loop: full-Change FAIL (6 findings) → ticket 8 + decision-8 → re-review 4 RESOLVED + 2 PARTIAL whose residues (decision-8 ledger citation, T-123 filing, binary-only bootstrap docs) landed in this finalization. pi-landstrip extension must NOT be registered (it sandboxes the accountable session); binary-only install documented in README.
<!-- SECTION:NOTES:END -->
Migration requirement + declined lesson (operator, 2026-07-19): (1) Delegate liveness visibility must be first-class for ALL roles in the migration — today a codex REVIEWER dispatch is invisible until exit (qq-dispatch passes --json only for implementer; reviewer stdout buffers), so the doc-43 10-minute no-thread wedge rule never fires for reviewers and a wedged reviewer is indistinguishable from a slow one until the 3600s timeout. Operator, verbatim: reviewers 'get stuck invisibly ALL the time' — the subagents migration is expected to fix this. (2) Declined without a ticket: codex exec resume drops the profile layer (no --profile flag; a resume without explicit -c sandbox_mode=workspace-write / skills-off runs at the base config's danger-full-access) — operator: not worth fixing because the codex substrate is being ditched; recorded here so it is not rediscovered while codex delegates still run.
<!-- SECTION:NOTES:END -->
