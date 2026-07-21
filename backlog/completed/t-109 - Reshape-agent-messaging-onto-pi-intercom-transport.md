---
id: T-109
title: Reshape agent-messaging onto pi-intercom transport
status: Done
assignee: []
created_date: '2026-07-19 19:57'
updated_date: '2026-07-19 20:49'
labels: []
dependencies: []
documentation:
  - doc-64
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per T-107 final ledger (2026-07-19), amended same-day by operator: NO legacy transport — the herdr keystroke-injection inter-agent path dies with this Change, including for codex delegates ('legacy stuff needs to go; this isn't a museum'). Rewrite skills/agent-messaging to: qq envelope (AGENT from=<id>, literal-send, source verification, unrouteable handling) + pi-intercom mechanics (send/ask/reply/list, busy-queueing) + herdr notification show for operator pings (unchanged — that is the operator path, not legacy). Codex delegates remaining before T-95 coordinate through delegate-batch's own machinery (work orders, envelopes, detail files, resume-steering), which never depended on this skill; the skill does not document a herdr-send inter-agent path at all. Intercom verified on pi 0.80.10 (npm 0.6.0 and git main). Alt+M overlay and inboundTrigger default ('always' auto-trigger on receipt) are the desired delegate wake semantics; document the policy.

Decision ledger:
- Adopt pi-intercom as qq's inter-agent transport and reshape agent-messaging onto it: T-107 final ledger (operator, 2026-07-19, recorded on completed T-107), disposition "pi-intercom ADOPT", delivery via this messaging-reshape Change.
- NO legacy herdr-send inter-agent path (dies with this Change, including for codex delegates): operator amendment 2026-07-19, recorded verbatim on this Task and doc-64 ("legacy stuff needs to go; this isn't a museum").
- Operator notifications remain on herdr notification show (operator path, unchanged): same T-107 ledger + amendment.
- inboundTrigger kept at default always as the delegate-wake policy: T-107 trial disposition, doc-64 orchestrator notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 agent-messaging rewritten onto intercom with the qq overlay preserved
- [x] #2 #3 Ratchet baselines updated
- [x] #3 #2 Two-live-session correlated ask/reply smoke passes (pi-to-pi); the shipped skill contains no herdr-send inter-agent path (grep-verified)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FINAL SUMMARY (2026-07-19, dispatch orchestrator): Skill rewritten intercom-only with qq overlay preserved (AGENT from=<id>, literal send, source verification, unrouteable); legacy herdr inter-agent path fully removed per same-day operator amendment — codex delegates coordinate via delegate-batch machinery. AC#2: pi-to-pi correlated ask/reply smoke PASS (trial sandbox, pi 0.80.10, npm pi-intercom 0.6.0; ask → inboundTrigger wake → correlated reply 1282d1e8); shipped skill grep-verified free of herdr-send inter-agent paths, guarded durably by re-pinned tests/test-qq-herdr-home.sh (whitespace-normalized absence guard). AC#3: prose ratchet baseline lowered 11496 → 11370; ratchet/test-ratchet/test-qq-herdr-home all PASS. Review round 1: one finding (guard evasion via line-wrap) fixed and verified. npm:pi-intercom installed into user settings at delivery. PR #152.
<!-- SECTION:NOTES:END -->
