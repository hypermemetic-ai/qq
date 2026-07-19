---
id: T-97
title: Trial upstream OpenWiki CI docs-PR workflow against qq safeguards
status: Done
assignee: []
created_date: '2026-07-19 16:42'
updated_date: '2026-07-19 20:23'
labels: []
dependencies: []
documentation:
  - doc-58
priority: medium
type: task
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Evidence: doc-58. Upstream OpenWiki now supports CI-generated documentation PRs. Run a disposable-repository trial to prove qq's safeguards before retiring any of bin/qq-openwiki or the openwiki-maintainer skill: fresh main as generation base; upstream fully owns its marked AGENTS.md/CLAUDE.md sections (verified in 0.2.0 source: writes confined to the marked region or append-if-absent, outside-marker content byte-identical, AGENTS.md a regular file — no symlinked shared instruction source in the trial repo); output otherwise confined to openwiki/; provider and telemetry policy acceptable; operator review and merge mandatory. The wrapper's shadow/restore machinery and qq's hand-authored section content are dropped — upstream handles its section exactly as codebase-memory owns its own. CLAUDE.md is upstream's managed file only: qq does not support Claude Code, and nothing qq-owned reads, maintains, or depends on CLAUDE.md.

Verified during alignment (2026-07-19, upstream README + 0.2.0 package source): provider set includes an OpenAI-compatible provider (OPENAI_COMPATIBLE_API_KEY / OPENAI_COMPATIBLE_BASE_URL / OPENWIKI_MODEL_ID) — the operator's Kimi key via Moonshot's endpoint is the trial provider. CI telemetry is a single anonymous openwiki_run event, inspectable via --telemetry-file and disabled via OPENWIKI_TELEMETRY_DISABLED=1; LangSmith tracing stays off. The example workflow's add-paths includes AGENTS.md and CLAUDE.md; the trial accepts those paths and verifies section-scoping.

Decision ledger:
- Trial-then-retire sequencing: doc-58 recommendation, ticketed per operator instruction in the T-93 follow-up session.
- Kimi key as trial provider via the OpenAI-compatible endpoint: operator instruction, asked-and-answered alignment exchange, 2026-07-19 alignment session.
- Drop the openwiki AGENTS.md/CLAUDE.md machinery entirely — shadow/restore, hand-authored section content, all of it; upstream owns its marked sections like codebase-memory owns its own: operator instruction ('drop the openwiki agents/claude machinery then, let upstream handle it'), asked-and-answered alignment exchange, 2026-07-19 alignment session.
- qq does not support Claude Code; no CLAUDE.md surface anywhere in qq: operator instruction, asked-and-answered alignment exchange, 2026-07-19 alignment session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Disposable-repo trial exercises all safeguards with fresh evidence attached: fresh-main generation base, section-scoped AGENTS.md/CLAUDE.md writes (outside-marker content byte-identical, regular-file precondition), openwiki/-confined output otherwise, provider/telemetry policy, mandatory operator review and merge
- [x] #2 Verdict recorded: retire/shrink qq-openwiki (including the shadow/restore machinery) and openwiki-maintainer, or keep with the failing safeguard named
- [x] #3 Telemetry payload inspected once via --telemetry-file before the disable/keep call
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TRIAL EVIDENCE + VERDICT (owner-run, 2026-07-19, disposable repo /tmp/qq-t97-trial/repo, upstream openwiki@0.2.0):

Safeguard results (AC #1, all PASS, fresh):
1. Fresh-main base: openwiki/update branched from main tip b9040d5; generation ran there (init + steady-state update).
2. Section-scoping byte-exact: AGENTS.md (markers pre-existing) outside-marker content sha256-identical after init AND after update (2f186d06...); CLAUDE.md (no markers) original content is a strict byte-prefix, appended bytes exactly '\n<!-- OPENWIKI:START -->...<!-- OPENWIKI:END -->'.
3. Regular-file precondition: both root files are regular files (no symlinked shared instruction source in the trial repo).
4. Confinement: touched paths = openwiki/, AGENTS.md, CLAUDE.md, .github/workflows/openwiki-update.yml — exactly the upstream CI add-paths; steady-state update concluded 'wiki is already current' (idempotent).
5. Provider: OpenAI-compatible endpoint with the operator's Kimi key. SUBSTITUTION RECORDED: key authenticates to https://api.kimi.com/coding/v1 (HTTP 200, OpenAI-shaped /models + chat completions); api.moonshot.ai/v1 rejects it (401 probe). Model kimi-for-coding. Key self-served from local pi auth per operator instruction.
6. Telemetry (AC #3): --telemetry-file inspected — single anonymous openwiki_run event to PostHog: properties {command, outcome, mode, provider=openai-compatible, production, ci}, random distinctId, $process_person_profile=false; no content/prompts/paths. Disable path proven: OPENWIKI_TELEMETRY_DISABLED=1 -> {disabled: true, sent: false}.
7. Mandatory review+merge: upstream CI creates a docs PR via create-pull-request (v7, pinned SHA 22a90890); no direct-to-main path. Template ships LangSmith tracing ON by default (LANGCHAIN_TRACING_V2=true) — any adoption strips those env lines (ticket: LangSmith stays off).

VERDICT (AC #2): no failing safeguard. Safe to retire/shrink qq-openwiki's shadow/restore machinery and hand-authored AGENTS.md/CLAUDE.md section content — upstream owns its marked sections surgically, exactly as codebase-memory owns its own. qq-openwiki's remaining value after the drop: provider pinning, single-writer lock, fresh-main enforcement; the retirement Change's scope is a later alignment, gated on operator acceptance of this verdict.

OPERATOR ACCEPTANCE (2026-07-19, dispatch session): verdict accepted, including the api.kimi.com/coding/v1 endpoint substitution (Moonshot platform rejects this key, 401 probe-verified) and the LangSmith-strip requirement for any adoption. Record finalization rides the batch wrap-up board Change (agreed).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Disposable-repo trial (/tmp/qq-t97-trial/repo) against upstream openwiki@0.2.0: every safeguard passed with fresh byte-exact evidence (section-scoping, confinement to CI add-paths, regular files, fresh-main base, PR-gated flow). Provider: OpenAI-compatible endpoint api.kimi.com/coding/v1 with the operator's Kimi key (endpoint substitution accepted — Moonshot platform rejects this key). Telemetry inspected once via --telemetry-file (single anonymous openwiki_run event) and disable path proven. VERDICT (operator-accepted 2026-07-19): no failing safeguard — safe to retire/shrink qq-openwiki's shadow/restore machinery and hand-authored section content; LangSmith env lines must be stripped in any adoption.
<!-- SECTION:FINAL_SUMMARY:END -->
