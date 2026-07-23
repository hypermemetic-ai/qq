---
id: T-149
title: >-
  qq-footer extension — trimmed usage line, status blocklist, subscription quota
  bars
status: Done
assignee: []
created_date: '2026-07-23 17:00'
updated_date: '2026-07-23 18:14'
labels: []
dependencies: []
documentation:
  - doc-84
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator directive 2026-07-23 (accountable project-home session): replace pi's built-in footer with a qq-owned extension (extensions/qq-footer.ts) rendering exactly: line 1 = cwd (branch) • session-name; line 2 = context%/window • $cost • quota bars … (provider) model • thinking right-aligned; token/cache stat segments dropped.

Quota: active provider only; one bar per window, fill = fraction used. Kimi (5h + weekly via api.kimi.com/coding/v1/usages) and Codex (windows via chatgpt.com/backend-api/wham/usage) both live-verified against operator credentials 2026-07-23. Anthropic wired via /api/oauth/usage, hidden until auth is configured. Unsupported or unconfigured provider renders nothing. Fetch on session start + 5-min interval, cached; render never blocks on network; /qq-footer-refresh forces refetch.

Extension statuses rendered minus blocklist {pi-lens-lsp, hunk, merge-ready}. extensions/pi-footer.json deleted (dead config; the pi-footer package was removed 2026-07-23). Extension registered in ~/.pi/agent/settings.json.

Decision ledger:
1. qq-owned all-in-one footer over third-party assembly — asked-and-answered, 2026-07-23 session.
2. Quota display: active provider only — asked-and-answered, same session.
3. Quota rendering: per-window bars, fill = fraction used — asked-and-answered, same session.
4. pi-footer package removed; built-in-style two-line layout as the base — asked-and-answered, same session.
5. Status blocklist {pi-lens-lsp, hunk, merge-ready} — T-133, T-138.
6. pi configuration changes are qq scope — asked-and-answered, 2026-07-23.
7. Poll cadence (5 min), endpoint shapes from live probes, command naming — owner calls stated in the approved brief.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 extensions/qq-footer.ts replaces the built-in footer: line 1 cwd (branch) • session-name; line 2 context%/window • $cost • quota bars with model • thinking right-aligned; no token/cache segments
- [ ] #2 Quota bars for kimi-coding (5h + weekly) and openai-codex (returned windows) from the live endpoints; anthropic path wired but hidden without auth; unsupported/unconfigured providers render nothing; fetch on start + 5-min cache with non-blocking render; /qq-footer-refresh forces a refetch
- [ ] #3 Extension statuses rendered minus blocklist pi-lens-lsp, hunk, merge-ready
- [ ] #4 extensions/pi-footer.json removed; ~/.pi/agent/settings.json registers qq-footer
- [ ] #5 tests/test-qq-footer-extension.sh green (quota parsing for both live shapes, blocklist filtering, render output) and the full native suite green
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered PR #222: extensions/qq-footer.ts (built-in footer replaced: line 1 cwd (branch) • session • statuses minus {pi-lens-lsp, hunk, merge-ready}; line 2 context%/window • $cost • quota bars, model • thinking right-aligned). Quota bars for kimi-coding (5h+weekly) and openai-codex (returned windows) from live-verified endpoints; anthropic wired, hidden until auth; fetch on start + 5-min cache, non-blocking render, /qq-footer-refresh. extensions/pi-footer.json deleted. Fresh-context review found 3 material failures (HTTP/401 stale cache, code-point width, huge-width RangeError); all reproduced pre-fix, fixed, re-verified post-fix; fix-delta review ACCEPT. Native suite 25/25 green. Registration is by construction via the T-148 mount (one import+invocation in extensions/index.ts; the ~/.pi/agent/extensions/qq symlink is already live) — the brief's settings.json step was superseded mid-flight by T-148's landed convention. Residual: fresh-session visual verification post-land; anthropic shape unverified (no auth configured); footer test flaked twice under parallel load, 6+ clean loops since.
<!-- SECTION:FINAL_SUMMARY:END -->
