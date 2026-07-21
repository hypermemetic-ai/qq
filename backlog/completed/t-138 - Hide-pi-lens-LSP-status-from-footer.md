---
id: T-138
title: Hide pi-lens LSP status from footer
status: Done
assignee: []
created_date: '2026-07-21 19:17'
updated_date: '2026-07-21 19:26'
labels: []
dependencies: []
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pi-lens publishes its LSP server state to the footer extension-status row under key 'pi-lens-lsp' ('LSP Active: ...' / 'LSP Failed: typescript'). With the pi-lens belowEditor widget and the pi-footer config line, the bottom stack renders three lines; the LSP server list is noise at a glance (actionable signal already surfaces in the pi-lens widget and lsp_diagnostics).

Decision ledger: operator verbatim instruction (2026-07-21) — 'lsp failed: typescript? pi-lens probably. also don't need three lines in the footer.' Mechanism: add 'pi-lens-lsp' to extensionStatusRow.hiddenKeys in extensions/pi-footer.json (t-133 pattern); pi-lens LSP functionality, its belowEditor widget, and other extension statuses (github-pr, plan-loop) are unaffected. The underlying typescript LSP failure was fixed separately as local machine state (pi-lens managed tools had auto-installed typescript@7.0.2, which ships no lib/tsserver.js; pinned typescript@^5.9.3 in ~/.pi-lens/tools, initialize handshake verified).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 footer status row no longer renders the pi-lens-lsp status (verified headless with mock statuses)
- [x] #2 other statuses (e.g. github-pr) still render; empty row collapses so footer renders only its config line
- [ ] #3 Change lands as one PR; operator merges
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 'pi-lens-lsp' to extensionStatusRow.hiddenKeys/knownKeys in extensions/pi-footer.json (t-133 pattern). Headless verification through pi-footer's real loader/filter with mock statuses, 6/6 PASS: pi-lens-lsp filtered in idle/failed/active states (the operator's 'LSP Failed: typescript' text no longer renders), github-pr and plan-loop still render, hunk/merge-ready stay hidden, empty visible set collapses the row so the footer renders only its config line. Underlying typescript LSP failure fixed as local machine state: pi-lens managed tools had auto-installed typescript@7.0.2 (no lib/tsserver.js); pinned typescript@^5.9.3 in ~/.pi-lens/tools, initialize handshake verified. PR #195 opened, shell-tests green; operator merges.
<!-- SECTION:NOTES:END -->
