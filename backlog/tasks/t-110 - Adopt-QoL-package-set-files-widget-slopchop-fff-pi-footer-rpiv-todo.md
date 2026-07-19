---
id: T-110
title: 'Adopt QoL package set: files-widget, slopchop, fff, pi-footer, rpiv-todo'
status: Done
assignee: []
created_date: '2026-07-19 19:57'
updated_date: '2026-07-19 21:10'
labels: []
dependencies: []
documentation:
  - doc-64
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per T-107 final ledger (2026-07-19). Install into user settings (~/.pi/agent/settings.json): npm:@tmustier/pi-files-widget, npm:pi-slopchop, npm:@ff-labs/pi-fff (additive default mode — do NOT set override; drift-to-builtins is the monitored signal), npm:pi-footer (operator-tuned preset, text/minimalist icons), npm:@juicesharp/rpiv-todo. All five load-verified together on pi 0.80.10 (T-107 trial notes). bat/git-delta already on the machine for files-widget. Update AGENTS.md/skills where tool routing references change (fff tools available alongside built-ins; rpiv-todo subordinate to Backlog Tasks; slopchop = the diff-review surface, GitHub web demoted to checks+merge).

Decision ledger:
- Adopt the five-package QoL set (files-widget, slopchop, fff additive, pi-footer, rpiv-todo): T-107 final ledger (operator, 2026-07-19) — files-widget ADOPT, slopchop ADOPT, fff ADOPT additive, pi-footer ADOPT, rpiv-todo ADOPT.
- fff additive default with drift-to-builtins as the monitored signal; no override mode: same T-107 ledger.
- pi-footer built-in pi-footer preset with iconMode text (narumitw rejected on emoji aesthetics): same T-107 ledger + doc-64.
- Delivery split (delegate repo-side; orchestrator applies user settings and runs the combined smoke): doc-64 sandbox constraint, operator-settled batch constraints 2026-07-19.
- prose_words_budget increase 11370 to 11417 for the reference lines: operator-approved via doc-64 + this Task AC #2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 All five packages in user settings; one combined session smoke passes (footer renders, todo widget live, /readfiles + /slopchop open, fff tools answer)
- [x] #2 #2 No two overlapping packages (one todo, one review surface); ratchet baselines updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FINAL SUMMARY (2026-07-19, dispatch orchestrator): All five packages in user settings alongside pi-intercom. AC#1 combined smoke PASS (single pi 0.80.10 session: pi-footer text-mode render, /todos overlay live, /readfiles + /slopchop open, fffind answered). AC#2: exactly one todo surface (rpiv-todo) and one review surface (slopchop); prose_words_budget raised 11370 → 11417 (measured +47, approval: doc-64 + AC#2). Repo-side references: AGENTS.md fff line (additive, drift signal named), deliver-change slopchop + rpiv-todo sentences. Search-tool audit: no skill hard-selects a code-search tool. Review round 1 pass. Drift monitor first data point: unprompted *.md query chose built-in find — watched signal per doc-64. pi-footer.json = pi-footer preset + iconMode text. PR #154.
<!-- SECTION:NOTES:END -->
