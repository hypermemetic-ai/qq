---
type: Development guide
title: Testing and Change Guide
description: Practical task routing, focused validation, environment preconditions, and safe change recipes for QQ profiles, extensions, Event Plane, delegation, Herdr, dashboard, OpenWiki, and Pi skills.
tags: [development, testing, operations, qq]
---

# Testing and Change Guide

Source and tests are authoritative. Start with the narrowest check that owns the changed behavior; preserve complete failure output. For system design and lifecycle details, use the canonical pages linked below rather than this change checklist.

## Task routing

| Change | Primary source | Narrow check | Canonical page |
|---|---|---|---|
| Methodology activation | `bin/qq-methodology`, `bin/lib/roles.mjs` | `tests/test-methodology.sh` | [Profiles and extensions](../runtime/profiles-and-extensions.md) |
| Execution profile or role behavior | `bin/lib/execution-profiles.mjs`, `bin/qq-profile`, `extensions/execution-profiles.ts`, `prompts/roles/` | `node --experimental-strip-types tests/test-execution-profiles.mjs .` | [Profiles and extensions](../runtime/profiles-and-extensions.md) |
| Pi extension or tool | owning `extensions/*.ts`, registration in `extensions/index.ts` | matching `tests/test-*.mjs` | [Profiles and extensions](../runtime/profiles-and-extensions.md) |
| Agent messages | `extensions/agent-messages.ts`, both Event Plane clients | isolated test, then live harness if needed | [Profiles and extensions](../runtime/profiles-and-extensions.md), [Event Plane](../services/event-plane.md) |
| Event Plane protocol, state, or client | `bin/lib/event_plane_service.py`, `event_plane_client.py`, `event-plane-client.ts`, launchers | `tests/test-event-plane.sh` | [Event Plane](../services/event-plane.md) |
| Delegation, handoff, QA, outcomes, or landing | `extensions/{board,review-flow,qa-result}.ts`, `bin/lib/{admission,run,review,run-events}.mjs`, workers, brief-gate plugin | delegation, brief-gate, and review-flow tests | [Delegation and review](../runtime/delegation-and-review.md) |
| Herdr, q mode, dictation, or pane policy | `herdr/downstream/upstream.env`, `herdr/config.toml`, `plugins/q-mode/`, `bin/qq-herdr-*`, `bin/qq-q-mode-uat` | q mode and downstream contracts; smoke/live only when prepared | [Herdr and dashboard](../operations/herdr-and-dashboard.md) |
| Dashboard package boundary | `package.json`, `package-lock.json`, `bin/qq-dashboard*`, `dashboard/README.md` | launcher help and profile JSON contract | [Herdr and dashboard](../operations/herdr-and-dashboard.md) |
| OpenWiki publication or registry | `bin/qq-openwiki-*`, `config/openwiki-repositories`, user timer/service | refresh, legacy, and dispatch tests | [OpenWiki automation](../operations/openwiki-automation.md) |
| Pi skill | canonical `skills/<name>/SKILL.md` | metadata inspection plus a fresh matching-task session | [Profiles and extensions](../runtime/profiles-and-extensions.md) |

## Focused checks

Run commands from the repository root.

```bash
# Local, isolated checks
node --experimental-strip-types tests/test-execution-profiles.mjs .
node --experimental-strip-types tests/test-agent-messages.mjs .
node --experimental-strip-types tests/test-operator-stage.mjs .
node --experimental-strip-types tests/test-continue.mjs .
node --experimental-strip-types tests/test-session-scrub.mjs .
node --experimental-strip-types tests/test-backlog-guard.mjs .
node --experimental-strip-types tests/test-grok-paraphrase-guard.mjs .
node --experimental-strip-types tests/test-delegation.mjs .
node tests/test-brief-gate.mjs .
node --experimental-strip-types tests/test-review-flow.mjs .
tests/test-q-mode.sh
tests/test-methodology.sh
tests/test-event-plane.sh
tests/test-openwiki-refresh.sh
tests/test-openwiki-refresh-legacy.sh
tests/test-openwiki-dispatch.sh
```

`tests/test-event-plane.sh` starts disposable services and puts scratch state under a private directory in `$HOME`; it does not require the installed service. The OpenWiki tests create disposable Git repositories and fake generators. Delegation and review tests inject command runners, so they exercise failure paths without operating a real Herdr workspace.

### Conditional checks

- `tests/test-agent-messages-live.sh` starts a real local Event Plane Unix-socket service in temporary state. It needs Python 3, Node with type stripping, Unix sockets, and writable `$HOME`; it does not need external network access.
- `tests/test-q-mode.sh` and `tests/test-herdr-downstream.sh` use configured local landed repositories when available, otherwise fetch owner branch refs. They need Git and may need network/SSH access; each required capability commit must be an ancestor of the branch tip.
- `tests/test-herdr-live.sh` needs an installed executable at `~/.local/lib/qq/herdr/bin/herdr`, or `QQ_HERDR_TEST_BINARY`. Its smoke run starts disposable server/client processes and needs `python3`, `script`, `timeout`, PTY support, and Unix sockets.
- `bin/qq-q-mode-uat preflight|post-activate`, `bin/qq-herdr-activate`, and service operations are operator-visible checks requiring installed Herdr/Handy artifacts and live process state. Product builds run in their owner repositories; QQ has no build or upgrade wrapper.
- `bin/qq-profile context inspect` and `context install` invoke `pi --list-models` (or `$PI_BIN`) and require the configured model registry. `context install` writes the private Pi model configuration.
- Dashboard checks require the private dependency to be installed from its immutable Git commit. Dependency installation may require GitHub credentials and network access.

`npm test` runs the package's authoritative order: methodology, Event Plane, profiles, agent messages, live agent messages, the remaining extensions, delegation, brief gate, review flow, q mode, Herdr downstream, Herdr live, and all OpenWiki tests. It is not an offline suite: do not use it as the first check when network access or the installed Herdr binary is unavailable.

## State and permission checklist

Before a stateful or live check:

- Use disposable `HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, and service state where the harness supports them.
- Keep profile policy and generated model configuration account-owned, regular, non-symlink files without group/world write permission; writers create mode `0600` files in private directories.
- Keep Event Plane and delegation state directories account-owned and mode `0700`. Do not edit the Event Plane SQLite database directly; the service owns its only connection.
- Do not hand-edit `qq.run-handoff/v1` files during a run. Preserve atomic private JSON writes and validate the current status before transitions.
- Do not run activation, landing, dashboard state migration, OpenWiki publication, or service restart merely to validate parsing or unit behavior.
- Before landing or legacy OpenWiki merge paths, keep the main checkout and delegated/generated worktree clean. Do not weaken clean-tree, ancestry, branch, ownership, or symlink checks.
- Preserve `~/.local/state/qq/telemetry/` across dashboard installs and upgrades.

## Safe change recipes

### Add or change an execution profile

1. Edit the external `qq.execution-profiles/v1` policy at `${XDG_CONFIG_HOME:-~/.config}/qq/execution-profiles.json`; do not hardcode a local profile into the extension. Its top level must contain exactly `schema`, `contextWindowCeiling`, `roles`, `scribe`, and `qa`; roles are exactly `runner` and `architect`.
2. Keep profile names and provider/model bindings within the validators in `bin/lib/execution-profiles.mjs`. Use `xai-auth`, not disabled provider `xai`; the Grok ceiling remains 200,000.
3. Run the focused execution-profile test and `bin/qq-profile list --json` against an isolated config home.
4. If model bindings changed, run `bin/qq-profile context inspect`; only then opt into `context install` if an `xai-auth` override is required.
5. Use Pi `/profile` for a pane-local selection. Use `bin/qq-profile default <role> <profile>` only when intentionally changing the durable default. Verify in a fresh or reloaded Pi session.

### Add or change a Pi extension or tool

1. Put ownership in one `extensions/*.ts` module and expose test seams through injected dependencies rather than live processes.
2. Register normal session extensions in `extensions/index.ts`. Keep restricted worker-only tools such as `qa-result.ts` explicitly loaded by their worker launch arguments instead of globally registering them.
3. Match the nearest test harness and cover registration, valid behavior, refusals, cleanup, and malformed external responses. For Event Plane integration, run the isolated messaging test before its live socket harness.
4. Check startup/stop cleanup and whether the behavior must be gated on QQ repository activation or an explicit worker role.

### Add an Event Plane operation

1. Define strict request fields, bounds, authorization/guard semantics, and an object result in `event_plane_service.py`; add the dispatch entry without exposing SQL.
2. Add the operation to both bounded clients: `event_plane_client.py` and `event-plane-client.ts`. Keep the Python admin operation choices and any convenience method in sync.
3. Preserve `qq-event-plane/v1`, four-byte big-endian framing, strict finite JSON, frame/payload limits, idempotency, and service-owned SQLite transitions. A schema change also requires the exact schema contract and version/migration handling.
4. Extend `tests/event_plane_test.py` with success, malformed body, authorization or stale-guard, retry/restart, and cross-client cases as applicable.
5. Run `tests/test-event-plane.sh`; if agent messaging consumes the operation, also run both agent-message checks.

### Change delegation state or transitions

1. Treat `qq.run-handoff/v1` in `bin/lib/run.mjs` as a cross-worker contract. Update creation, validation, readers, worker prompts, review/landing predicates, and cleanup together.
2. Preserve atomic mode-`0600` writes under the private runs root, isolated worktrees, base ancestry, clean trees, the two-look limit, QA verdict checks, and landing rollback to `blocked` on failure.
3. Exercise the transition from every allowed and refused predecessor in `test-delegation.mjs` and `test-review-flow.mjs`; run `test-brief-gate.mjs` when operator-gate state or Herdr plugin interaction changes.
4. Use injected runners for normal development. Reserve a real workspace trial for an operator-approved end-to-end change.

### Change Herdr or q mode integration

1. Build and install Herdr in its owner repository. `HERDR_OPERATOR_INPUT_COMMIT` is a capability floor that must remain an ancestor of the landed `master` tip, not a product release pin.
2. Update `herdr/downstream/upstream.env` only when the owner URL/ref, landed checkout, or capability floor changes. Do not restore product commit pins or QQ build/upgrade wrappers.
3. For dictation controls, update `plugins/q-mode/` and its analogous qq-dictation capability floor together. Preserve readiness PID/state/executable checks, bounded forwarding, exact pane IDs, targetless idempotent cancel, and the retained Left-Control bridge.
4. Run `tests/test-q-mode.sh`, `tests/test-herdr-downstream.sh`, and `bin/qq-herdr-smoke` against the installed artifact.
5. For a live cutover, run `bin/qq-q-mode-uat preflight`, `bin/qq-herdr-activate`, reconnect, then `bin/qq-q-mode-uat post-activate` and its manual checklist.

### Pin a dashboard release

1. Validate a tagged release in the private dashboard repository and select its exact commit.
2. Change the Git commit in `package.json` and regenerate `package-lock.json`; do not point launchers at a sibling checkout or `PATH`.
3. Install dependencies, then run `bin/qq-dashboard --help`, `bin/qq-dashboard-cookies --help`, and `bin/qq-profile list --json` from a checkout without a sibling dashboard repository.
4. Confirm `bin/qq-dashboard` still exports the repository's exact `QQ_PROFILE_BIN`. Do not infer or document private implementation internals unavailable in this checkout, and do not delete telemetry/cookie state.

### Add or remove an OpenWiki repository

1. Edit `config/openwiki-repositories`: one lowercase key per line resolves below `${QQ_OPENWIKI_PROJECTS_ROOT:-$HOME/projects}`; an absolute Git repository path is also accepted. Comments and blank lines are allowed.
2. Keep keys within `[a-z0-9][a-z0-9-]{0,62}` and ensure each target resolves to a Git toplevel. The key selected by `QQ_OPENWIKI_PUBLISHED_REPO_KEY` uses the orphan publisher; all others use the legacy refresh path.
3. Extend `tests/test-openwiki-dispatch.sh` expectations and run all three OpenWiki tests.
4. Do not test by dispatching the live registry. Initial orphan publication is explicit (`QQ_OPENWIKI_ACTION=init`), and refreshes may push or merge. Preserve per-repository locking, bounded concurrency, exact generated-tree publication, allowlists, clean-main checks, and aggregated failures.

### Add or change a Pi skill

1. Use the canonical directory form `skills/<name>/SKILL.md` with leading YAML `name` and `description`. The description must state when the skill applies because Pi uses it for discovery.
2. Put relative helper references under the skill directory. Pi resolves them against the directory containing `SKILL.md`.
3. Verify the skill appears only when the session has the `read` tool and `disableModelInvocation` is not set. Test with a fresh or reloaded matching-task session; profile prompt composition, not an extension registry, exposes skills.
4. Do not edit the drift-prone legacy `skills/write-connector.md`; `skills/write-connector/SKILL.md` is canonical.

## Specialized work routing

These tasks have mandatory canonical instructions. Read the skill before editing:

- **OpenWiki connector creation:** read `skills/write-connector/SKILL.md`. Implement in the OpenWiki OSS connector source and tests, use deterministic ingestion, keep secrets only in `~/.openwiki/.env`, and never substitute the legacy `skills/write-connector.md` copy.
- **OKF migration:** read `skills/migrate-wiki-to-okf/SKILL.md`. Inventory every wiki directory, process each directory under its prescribed isolated assignment, change only front matter, and never edit generated `index.md` files.
- **Mermaid creation or repair:** read `skills/mermaid-diagrams/SKILL.md`. Use diagrams for runtime flows, lifecycles, data models, and non-trivial control flow; ground every node and transition in source, add a caption, and treat parser-degraded fences as failures to repair.

For connector and OKF work, validation belongs to the OpenWiki repository and generator that own those formats, not this QQ package suite. For Mermaid, successful OpenWiki fence validation is the final boundary in addition to source review.
oundary in addition to source review.
s the final boundary in addition to source review.
iew.
