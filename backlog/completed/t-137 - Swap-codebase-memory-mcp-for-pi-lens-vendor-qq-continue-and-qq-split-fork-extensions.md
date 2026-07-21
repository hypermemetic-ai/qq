---
id: T-137
title: >-
  Swap codebase-memory-mcp for pi-lens; vendor qq-continue and qq-split-fork
  extensions
status: Done
assignee: []
created_date: '2026-07-21 15:52'
updated_date: '2026-07-21 17:46'
labels: []
dependencies: []
priority: medium
type: task
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator directive in the accountable session 2026-07-21 (asked-and-answered exchange, verbatim): 'take pi-lens and kill codebase mem, we write split-fork for herdr/tmux, grab pine-of-glass and keep only the meantime bit, grab continue, grab agent browser native because I've already seen browser interactive failure, and grab pi-prompt template model'. Delegation to GPT engines confirmed verbatim the same session ('you are delegating to gpt, that is clear right?' — confirmed: implementer/reviewer run openai-codex per delegation/manifests).

Environment (operator machine, already applied by the accountable session, no repo surface): installed npm:pi-lens, npm:pi-agent-browser-native, npm:pi-prompt-template-model; vendored tmustier/pine-of-glass at ~/.pi/agent/vendor/pine-of-glass registering only extensions/pi-meantime with ~/.pi/agent/pi-meantime.json enabled:true; ~/.pi-lens/config.json sets contextInjection.enabled:false; removed ~/.local/bin/codebase-memory-mcp and the 1.5G ~/.cache/codebase-memory-mcp.

Repository scope of this Task: (a) remove codebase-memory references from AGENTS.md (managed block), README.md, openwiki/*.md — removal only, no pi-lens wiki content (openwiki refresh belongs to the maintainer actor); (b) add extensions/qq-continue.ts (vendored from mitsuhiko/agent-stuff continue.ts, Apache-2.0); (c) add extensions/qq-split-fork.ts (herdr/tmux port of mitsuhiko split-fork.ts, Apache-2.0); (d) node-import tests for both extensions mirroring tests/test-qq-pr-watch-extension.sh; (e) run tools/ratchet.sh update to lower the prose_words baseline after the AGENTS.md removal; (f) FOLD-IN (scope growth, operator-approved asked-and-answered 2026-07-21, chose 'Fold durable fix into T-137 first'): .pi/extensions/qq-subagent-env.ts carries QQ_DISPATCH_RUNTIME_ROOT absent-wins — the durable fix for the adapter fail-closed structured-output capture rail documented in T-129 (T-128 shipped without it); tests/test-qq-subagent-env.sh coverage + README Install prose updated; temporary user-level bootstrap ~/.pi/agent/extensions/qq-dispatch-runtime-root-bootstrap.ts rides the current session until merge and is deleted at delivery.

Decision ledger: operator verbatim directive 2026-07-21 (cited above) settles tool choices and scope; fold-in settled by operator choice in the same session; no decision record minted — reach is this Change plus already-applied local environment state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md, README.md, openwiki/*.md contain no codebase-memory references
- [ ] #2 extensions/qq-continue.ts sends literal 'continue' only when idle, via shift+alt+enter, plain-JS .ts house style
- [ ] #3 extensions/qq-split-fork.ts forks the session file and opens it in a herdr right split (tmux fallback), with Apache-2.0 attribution
- [ ] #4 tests/test-qq-continue-extension.sh and tests/test-qq-split-fork-extension.sh pass, full tests/test-*.sh suite green natively
- [ ] #5 tools/ratchet.sh check passes with a lowered committed baseline
- [ ] #6 .pi/extensions/qq-subagent-env.ts carries QQ_DISPATCH_RUNTIME_ROOT absent-wins with tests/test-qq-subagent-env.sh coverage and README prose
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DEVIATION (one-time, operator-approved 2026-07-21, 'Waive capture once, fix in T-137'): the finish-up implementer dispatch runs WITHOUT outputSchema — Landstrip confinement intact, strict adapter capture waived for this run only. Cause: bin/lib/qq-render-landstrip-policy.mjs grants structuredOutputCapture only to read-only roles (else-if), so workspace-write children die at envelope write with EACCES (run 9fb729f5, after 4 good commits). Fix + regression coverage land in this Change; the envelope returns as the child's final message and the owner validates it against delegation/manifests/completion-envelope.schema.json. Strict adapter envelopes resume at merge. First-attempt rail failure (runtime root) recorded in description fold-in.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered via PR #194. codebase-memory references removed from AGENTS.md/README/openwiki (tool retired machine-side; pi-lens installed). qq-continue and qq-split-fork vendored from mitsuhiko/agent-stuff (Apache-2.0) with node-import suites; split-fork targets herdr pane split with tmux fallback and refuses '- '/@'-prefixed prompts (pi CLI cannot escape them). Fold-ins: qq-subagent-env carries QQ_DISPATCH_RUNTIME_ROOT absent-wins; qq-render-landstrip-policy grants the structured-output capture to workspace-write roles, with regression coverage — strict-envelope async dispatch works end-to-end post-merge. Fresh-context review: 2+2 findings, all fixed and verified; round 2 pass. Full native suite green (pre-existing test-qq-code-trial env failure also red on main). Deviations (implementer envelope waiver, bootstrap extension until merge) recorded in notes; bootstrap deletion and settings registration of the two extensions are post-merge owner steps.
<!-- SECTION:FINAL_SUMMARY:END -->
