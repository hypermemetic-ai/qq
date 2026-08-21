---
type: Validation guide
title: Practical validation routing
description: Narrow commands for the daily DSH host and plugins, legacy Pi orchestration, linked products, and conditional live checks.
tags: [testing, validation, operations]
openwiki:
  roles: [testing, repository]
  source_paths: [package.json]
  validation_commands: [npm test]
---

# Practical validation routing

Run the narrowest owner while iterating. `npm test` is a long fail-fast chain containing live, networked, linked-product, and installed-runtime checks; reserve it for cross-cutting or pre-landing validation with all prerequisites available.

## Daily DSH host

| Area | Minimal check | Conditional boundary |
|---|---|---|
| Core host, HTTP/SSE, security, PWA | `node tests/test-qq-host.mjs .` (includes real-browser PWA proof) | Requires Chrome for gestures/installed start; `tests/test-qq-host-live.sh` for exact pinned DSH |
| UI fiber/reload | `node tests/test-qq-ui-fiber.mjs .` | `tests/test-qq-host-boot.sh` when composition/absence changes |
| Projects, grouped folders, bounded files | `node tests/test-qq-projects.mjs` | `node tests/test-qq-host.mjs .` when routes/rendering change |
| Home session service lifecycle | `node tests/test-qq-home.mjs` | Add scratch and scope suites when ownership, cleanup, persistence, or reconciliation changes |
| Scratch ownership and scope sidecar | `node tests/test-qq-scratch.mjs`; `node tests/test-qq-session-scope.mjs` | Add Home suite when service lifecycle changes |
| Conversation projection, steering, pending queue | `node tests/test-qq-conversation.mjs .` | `node tests/test-qq-ui-transcript-scroll.mjs` for streaming scroll behavior |
| Session prompt routing | `node tests/test-session-prompt.mjs` | — |
| Session aliases | `node tests/test-qq-alias.mjs .` | Also relay test when alias consumption changes |
| DSH relay | `node tests/test-qq-relay-plugin.mjs .` | — |
| Workflows | `node tests/test-qq-workflows-plugin.mjs .` | Add `node tests/test-qq-workflows-context.mjs` for accepted contexts, leave, transition, or rollback; boot suite for bundle/service wiring |
| Skill-tool visibility | `node tests/test-qq-skill-tool.mjs` | `tests/test-qq-host-live.sh` only for exact pinned DSH schema exposure |
| Task pile | `node tests/test-qq-tasks.mjs .` | `tests/test-qq-tasks-boot.sh` for bundle wiring |
| Model connectors | `node tests/test-qq-models.mjs` | `tests/test-qq-host-real.sh` for credential/provider transport |
| Dictation | `node tests/test-qq-dictation.mjs` | Physical microphone/browser evidence only when UI capture changes |
| Frontend design loop | `node --experimental-strip-types tests/test-frontend-design-loop.mjs .` | External image-finder/media-box suites when their contract changes |

## Legacy Pi/Herdr and repository automation

| Area | Minimal check | Broader boundary |
|---|---|---|
| Activation/profiles | `tests/test-methodology.sh`; `node --experimental-strip-types tests/test-execution-profiles.mjs .` | — |
| Installed Pi relay, messaging, delegation, review | `tests/test-qq-relay.sh` | Networked private install; includes consumers requiring installed `client.mjs` |
| Native verdict helper | `node tests/test-native-qa-proof.mjs .` | Does not prove removed pi2dsh harness |
| Safety/context | matching `node --experimental-strip-types tests/test-<extension>.mjs .` | Choose read, continue, scrub, Backlog guard, Grok guards |
| Brief gate/operator stage | `node tests/test-brief-gate.mjs .`; `node --experimental-strip-types tests/test-operator-stage.mjs .` | — |
| Dashboard/Herdr/q-mode | owning shell suite | Linked branch or installed binary may require network/runtime |
| OpenWiki | owning `tests/test-openwiki-{refresh,refresh-legacy,dispatch,service}.sh` | Fake generation does not prove provider or GitHub PR behavior |

## Shipped-surface rule

A defining module test proves internal correctness, not host availability. For a new Cordis plugin or public service, verify its package `dsh.bundle`/entrypoint, `bin/qq` discovery, host registration, consumer lookup, disposer, unit test, and boot test when absence or loading changed. For the legacy external relay/dashboard boundaries, the contract suite must install privately, delete source, and exercise the real consumer import/exec path.

Do not run removed commands such as `test-dsh-console*` or `test-pi2dsh-compat.mjs`. Baseline aggregate requirements include Linux, Bash, Node 22.19+, npm, Git, Python, writable private state, network for linked products, and installed Herdr for `test-herdr-live.sh`. If one is unavailable, report the omitted boundary rather than claiming `npm test` passed.