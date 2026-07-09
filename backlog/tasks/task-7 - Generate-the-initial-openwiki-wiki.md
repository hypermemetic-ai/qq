---
id: TASK-7
title: Generate the initial openwiki/ wiki
status: Done
assignee:
  - task-7-openwiki-seed
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 00:48'
labels:
  - research
  - parallel-ok
dependencies: []
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
RESEARCH FIRST - nothing here is decided except the constraint and the format. Constraint (operator, 07-08): sub-only, no API keys; out-of-pocket API is out if frontier models are the benefit. Format kept: openwiki/-style agent-oriented markdown wiki in-repo. Everything else is HYPOTHESIS needing a fresh-session research pass (via research / deep-research skill, adversarially verified against primary sources): (1) Is headless codex exec on a ChatGPT sub - including inside gate pipeline scripts - actually permitted (ToS/rate limits), or does it risk the account? Operator: 'codex allows /login in other places so I wouldn't be surprised' - unverified. (2) Anthropic-side: confirm the OAuth-outside-Claude-Code restriction as written, not folklore. (3) Can the gate's document step really be steered by repo instructions to maintain a wiki, and what does it actually do today (read no-mistakes docs/source, not vibes)? (4) How much intelligence does maintenance-vs-generation actually need - is a lesser free/cheap engine fine for the diff-patch half? (5) Sub-compatible alternatives landscape: OpenWiki roadmap for subscription auth, other wiki tools, DeepWiki-class options. Deliverable: cited research/ report + a real engine decision. Then implementation (refresh script, install checks) follows the decision. Implementation ACs will be minted as a follow-up task once the engine decision exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cited research report in research/ answering questions 1-5 with load-bearing claims adversarially verified
- [x] #2 Engine decision made from that evidence and recorded on this task, with implementation re-planned accordingly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ENGINE DECISION (2026-07-08, from research/2026-07-08-openwiki-engine-sub-only.md — codex-delegated round, load-bearing claims adversarially verified: 7 CONFIRMED / 1 WEAKENED / 0 REFUTED; gate review findings NM-REVIEW-001/002/003 verified and folded in):

ADOPTED: bespoke codex-exec-driven refresh. bin/qq-openwiki-refresh will drive 'codex exec --sandbox workspace-write' locally on the operator machine using the ChatGPT sub (sandbox flag mandatory — non-interactive codex defaults to a read-only sandbox; same engine+auth the gate already uses via agent: codex) with OpenWiki's MIT prompt discipline vendored into the repo (preserve MIT notice). Keep openwiki/ format, .last-update.json gitHead..HEAD protocol, and all update-mode guards (--init bypasses only the missing-openwiki skip); re-key the configured-check from ~/.openwiki/.env to CODEX_HOME/keyring-aware 'codex login status' requiring ChatGPT auth, not API-key auth. commands.format stays the hook (document step verified unsteerable; format runs pre-commit in push step; failures warn -> script stays self-guarding).
FALLBACK: same script on 'claude -p' (documented sub envelope; never --bare). Reserved — Claude sub is the scarce resource (operator load directive).
REJECTED: OpenWiki CLI + API key (violates sub-only constraint; upstream has no merged sub backend — PRs #76/#181 open, #188 closed, #151 ChatGPT-login provider opened 2026-07-06 and #205 'self-managed Codex OAuth provider' opened 2026-07-08, both unmerged; #151/#205 call the Codex backend directly from a non-Codex client = ToS-gray even if merged); OpenWiki-on-Claude-OAuth shim (the exact third-party credential-routing shape Anthropic prohibits); CodeWiki (real claude-code/codex CLI providers but writes docs/, breaks the openwiki/ format); local models (documented quality failures at that size); steering the gate's document step (no config surface, verified in no-mistakes v1.34.0 source).
ToS: headless codex exec on ChatGPT sub is scoped to the local operator-machine gate, not hosted CI; this does NOT authorize putting ~/.codex/auth.json or subscription credentials into hosted CI, GitHub Actions, or fork-triggered workflows for this public repo (developers.openai.com/codex/auth/ci-cd-auth); limit exhaustion = credits/blocking, no ban guarantee.
WATCH-FOR: if refresh execution ever moves off the operator machine, re-review OpenAI auth guidance; public-repo CI and fork-triggered workflows need API-key or vendor-blessed auth, not subscription credentials.
IMPLEMENTATION RE-PLAN: 5 steps in the research doc ('Implementation re-plan' section) — vendor prompts, rewrite refresh script (workspace-write sandbox), one-time init reviewed by operator, .no-mistakes.yaml comment/lint update (commands.* live only after merge to main), TASK-9 rollout note. Follow-up implementation task must be minted from the main-tree session (worktree-minted IDs risk duplicates).
<!-- SECTION:NOTES:END -->
