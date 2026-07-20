---
id: T-95
title: >-
  Migrate delegation to pi-subagents + Landstrip; retire codex-profiles, shrink
  qq-dispatch
status: To Do
assignee: []
created_date: '2026-07-19 16:41'
updated_date: '2026-07-20 18:00'
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
PARKED 2026-07-19 (operator-visible): T-94 returned HOLD (operator-accepted); this migration stays parked pending reproduction outside codex confinement or a Landstrip fix plus a full 9-check rerun. Do not dispatch while parked.

After the T-94 pilot returns adopt: move role definitions into pi-subagents agent manifests plus Landstrip policies; retire codex-profiles/; shrink bin/qq-dispatch to the thin adapter doc-56 names (role-to-policy selection, worktree/git-dir discovery, fail-closed sandbox start, process-group timeout and descendant cleanup, artifact compatibility); rewrite delegate-batch/code-review/research dispatch mechanics on pi-subagents strict schemas while preserving their judgment content (work orders, completion envelope semantics, fresh-context requirements, owner verification). Remove the herdr stage machinery rather than bridging it: delete qq-status's herdr report/notify paths; pi-subagents native artifacts/widgets are the delegate-visibility story.

Decision ledger:
- Migration target and named residuals: doc-56 (verified findings), ticketed per operator instruction in the T-93 follow-up session.
- Profile symlink verification may disappear only when replacement policy loading is equally fail-closed: doc-56.
- Herdr stage machinery removed, not bridged — no qq-status business-stage bridge rides the migration; accepted loss of out-of-transcript blocked-delegate notification: operator decision, asked-and-answered alignment exchange, 2026-07-19 alignment session ('kill the herdr machinery. I'm confident.'). Cockpit, topology scripts, and messaging out of scope.
- 2026-07-19: decision-3 broadened — the detail-file protocol is deleted too (T-116, delete-now); the earlier 'detail-file protocol stays as the ambient record' line is superseded and removed above. Delegate visibility until this migration: transcripts + pi-intercom.
- 2026-07-19: parked by T-94's operator-accepted HOLD; unblock conditions in the park note above.
- 2026-07-19 (operator, project-home session): delegates stay on GPT-5.6 under the migration — pi-hosted, not codex — and do NOT inherit the project-home kimi-coding/k3 default (README settings). Recorded consequences: (1) every role manifest must pin the model explicitly — the T-94 pilot manifests set no model field, so children would silently resolve k3; (2) Pi child processes need an OpenAI-route credential — Pi private auth today holds only the pi-qq Kimi credential (T-91), while GPT-5.6 delegates currently authenticate through codex's ChatGPT login; (3) model identity must be verified by a fresh check in the unblocked T-94 rerun and carried into this ticket's acceptance criteria — the pilot's mock child never exercised model selection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex-profiles/ removed and qq-dispatch reduced to the adapter; tests updated and green
- [ ] #2 delegate-batch, code-review, and research skills dispatch through pi-subagents with strict JSON-Schema envelopes; judgment sections unchanged
- [ ] #3 Reviewer/researcher read-only and implementer worktree-write confinement demonstrated fresh under the new substrate
- [ ] #4 qq-status's herdr report/notify paths removed; tests updated and green (detail-file surface already deleted under T-116)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Migration requirement + declined lesson (operator, 2026-07-19): (1) Delegate liveness visibility must be first-class for ALL roles in the migration — today a codex REVIEWER dispatch is invisible until exit (qq-dispatch passes --json only for implementer; reviewer stdout buffers), so the doc-43 10-minute no-thread wedge rule never fires for reviewers and a wedged reviewer is indistinguishable from a slow one until the 3600s timeout. Operator, verbatim: reviewers 'get stuck invisibly ALL the time' — the subagents migration is expected to fix this. (2) Declined without a ticket: codex exec resume drops the profile layer (no --profile flag; a resume without explicit -c sandbox_mode=workspace-write / skills-off runs at the base config's danger-full-access) — operator: not worth fixing because the codex substrate is being ditched; recorded here so it is not rediscovered while codex delegates still run.
<!-- SECTION:NOTES:END -->
