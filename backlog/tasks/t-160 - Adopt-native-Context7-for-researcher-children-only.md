---
id: T-160
title: Adopt native Context7 for researcher children only
status: In Progress
assignee: []
created_date: '2026-07-25 01:25'
updated_date: '2026-07-25 02:34'
labels: []
dependencies: []
documentation:
  - doc-94
  - doc-98
modified_files:
  - .mcp.json
  - README.md
  - >-
    backlog/decisions/decision-15 -
    Use-native-Context7-only-for-researcher-children-and-retire-MCP.md
  - >-
    backlog/docs/plans/doc-98 -
    Plan-—-vendor-pi-subagents-runtime-and-researcher-only-Context7-lifecycle.md
  - backlog/tasks/t-160 - Adopt-native-Context7-for-researcher-children-only.md
  - bin/qq-dispatch
  - delegation/manifests/agents/researcher.md
  - skills/research/SKILL.md
  - tests/test-qq-dispatch.sh
  - tests/test-researcher-context7.sh
  - tools/ratchet-baselines.conf
priority: high
type: feature
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Canary and conditionally adopt exact native `@upstash/context7-pi@0.1.1` tools for canonical researcher children only after the qualified vendor runtime landed and retired. Replace the dormant root MCP route only when its ownership audit is clear. Keep parents, reviewers, implementers, and observers Context7-free; use no API key, global Pi package registration, copied vendor Skill, `/c7-docs`, or automatic MCP fallback.

## Decision ledger

- Operator disposition on 2026-07-24 after T-154.3/doc-94: “Canary then adopt” researcher-only native Context7; approved sequential lifecycle is captured in doc-98.
- `doc-94` — exact artifact/integrity and isolated child-scope evidence; production peer layout, real-provider composition, resume, leak checks, and ownership audit remained promotion gates.
- `decision-8` — delegated network egress remains openly available beneath Landstrip; this Change adds a privacy/query rule and no confidentiality or hostile-code claim.
- `decision-10` — persisted Pi session JSONL remains the sole agent-content observation seam.
- `decision-15` (minted by this Change) — supersedes decision-2 only for current qq dispatch surfaces: researcher children receive the two native tools; all other canonical seats and accountable parents receive none; MCP and credentials retire.
- T-106 — qq no longer supports Claude Code or Codex CLI, so their conventional project `.mcp.json` consumption is not an active qq owner.

The approved package/configuration mutation is conditional: do not change the operator prefix until the isolated actual-qq canary and review gates pass. Realign if `.mcp.json` has a material current owner, the exact artifact cannot resolve without global Pi registration, tools leak outside researcher children, a key is required, or the Change needs a new security/public-workflow boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fresh ownership audit proves `.mcp.json` has no material supported consumer before deletion; decision-15 explicitly supersedes decision-2 only for current qq dispatch surfaces.
- [x] #2 Registry metadata and fetched artifact exactly match `@upstash/context7-pi@0.1.1` SHA-1/SRI, and one stable nonregistered deployment recipe resolves its existing peers without copying vendor source or globally registering a Pi package.
- [x] #3 Before operator-prefix mutation, an isolated real-provider actual-qq canary uses the canonical researcher seat through settled pi-subagents and qq-dispatch/Landstrip to perform one public no-key resolve/query and contract-preserving resume.
- [x] #4 Fresh canary and promoted-process evidence proves only researchers have `resolve-library-id` and `query-docs`; parent, reviewer, implementer, and observer do not; no MCP process, Context7 key, global package registration, prompt, or copied vendor Skill exists.
- [x] #5 Only after every promotion gate passes, the operator Pi npm prefix gains exact dependency `@upstash/context7-pi: 0.1.1`, researcher child selection and privacy policy land, `.mcp.json` retires, and rollback is verified without silent MCP fallback.
- [x] #6 Completion Envelopes, acceptance:none, assigned cwd, canonical trusted manifests, resume provenance, Landstrip policies, persisted-session observation, cleanup, and exact vendor/runtime pins remain intact.
- [ ] #7 Focused boundary/privacy/integrity/rollback Checks, all Repository Checks, ratchet, diagnostics, fresh review, and GitHub CI pass; no unrelated package upgrade or broader research-policy rewrite lands.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execute approved Change 2 in doc-98: audit ownership and integrity; prove exact nonregistered peer resolution; run an isolated real-provider canonical researcher resolve/query/resume canary plus parent/reviewer absence and cleanup checks; review; then conditionally install one exact dependency, update only researcher policy, remove the unowned MCP file, verify rollback and full Checks, fresh-review, and deliver one PR without merging.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pre-promotion gates passed without changing the operator prefix, Pi settings, or root MCP file. Fresh audit found no supported `.mcp.json` consumer: T-106 retired Claude/Codex CLI; current Pi manifests select no MCP; current pi-subagents loads MCP only by explicit selection; no qq source reader exists; the pilot driver is self-contained historical code. An ignored local Claude setting names context7 but belongs to the explicitly unsupported retired client. Registry metadata and a freshly packed tarball reproduced SHA-1 `b9842694a348f659bd0ee7ad7e6559f85f9bb962` and SRI `sha512-RVwu0alq02SoniWzn3oRbtRzQmM3g/UuVwKEGHGKj77B0twq6RHRyXuq1Gs/WF+hgtA2eI2QaSnSVq7lGjElbA==`. A clean prefix installed exact 0.1.1; an isolated simulation of the existing operator prefix added only the exact root dependency/lock entry and retained existing Pi/typebox peers. Before production mutation, real-provider canonical researcher async `7c82c577-3f20-43bf-9bd4-3c60b5f0b232` called native resolve/query successfully with public Express ID `/expressjs/express/v5.2.0`; resume `c02e4d57` preserved the same session, schema, tools, child extensions, acceptance:none, cwd, canonical manifest, and `qq-researcher-read-only-v1`. Parent active tools were only subagent/subagent_wait; no key/MCP/process/global registration appeared; descendants exited; the session was harvested post-hoc. Production settings/package/lock/MCP bytes remained unchanged.

Pre-promotion review `b6f2ded7-75dc-4057-a730-cdca7c79fa96` returned NO-GO on two Check/documentation defects; fixed-string/undefined helper misuse was repaired, and two focused follow-ups converged on a jq status-preserving README command, with final GO `bda289d2-1383-4b80-9509-7bb74c5f65e3`. Exact production install then added only root dependency/lock entry `@upstash/context7-pi: 0.1.1`, retained existing Pi/typebox peers, and left Pi settings byte-identical with zero Context7 registrations. Promoted role runs completed: reviewer `db019c18...`, implementer `3fb6a468...`, observer `923bedb9...`, researcher `078f8ad4...` plus resume `f5bcdaa4`; wrapper events preserved each canonical Landstrip policy. Session-native tool probes on resumed reviewer `82beca7a`, implementer `08e66926`, observer `68bd669f`, and researcher `887b0259` proved Context7 absent from the first three and active only for researcher, with no key. The promoted researcher used exact home-relative extension selection, called public native resolve/query successfully, preserved resume/session/schema/acceptance:none, and was harvested post-hoc. An actual rollback cycle restored baseline operator package/lock bytes, completed researcher `67402efe...` without Context7 or MCP fallback, then reinstalled exact 0.1.1 and completed final exact-manifest researcher `d379abc6...`. No prompt/Skill/global registration, copied vendor source, Context7/MCP process, key, leaked temp probe reference, descendant, package-pin drift, runtime drift, or settings drift remains. All 35 Repository shell Checks pass; the privacy rule was wording-compacted without semantic loss so the only-down prose ratchet lowered 7997→7992.

Final full review `63ee99b0...` identified two P2s: inherited `CONTEXT7_API_KEY` was not fail-closed and manifest assertions admitted scope expansion. `qq-dispatch` now refuses a nonempty inherited key for researcher at role selection with exit 66 before Pi launch; fake-harness and production-shaped direct dispatch proved exact status/message, zero child args/event/process, while no-key canonical researcher `6724a414...` remained green. The focused manifest Check now enforces exact line counts/order and rejects inline, comma, and supported YAML block-list extension expansion. First fix review `b2dc918e...` found missing block-list and exact-exit enforcement; both were corrected. Second review initially hit WebSocket 1006, then contract-preserving resume `f5de099e` returned ACCEPT. The final affected suite and all 35 Repository shell Checks, ShellCheck, ratchet, diff check, and active diagnostics pass.
<!-- SECTION:NOTES:END -->
