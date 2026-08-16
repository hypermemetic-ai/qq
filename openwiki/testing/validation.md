---
type: Validation guide
title: Practical validation routing
description: Short routing guide for qq's focused local suites, linked-product semantic contracts, installed-artifact boundaries, live prerequisites, and aggregate npm test chain.
tags: [testing, validation, operations]
---

# Practical validation routing

Run the narrowest owner while iterating. Use `npm test` only for cross-cutting or pre-landing validation: it is a fail-fast sequential chain and includes networked linked-product checks plus an installed Herdr smoke test.

## Focused routes

| Area | Command | Boundary |
|---|---|---|
| Activation and Backlog linkage | `tests/test-methodology.sh` | Hermetic Git and temporary state |
| qq-relay adapter and consumers | `tests/test-qq-relay.sh` | Fetches qq-relay branch tip, installs privately, deletes source, then tests launcher/client, messaging, delegation, and review |
| Dashboard adapter and profile contract | `tests/test-dashboard.sh` | Fetches dashboard branch tip, installs privately, deletes source, and runs wrappers without touching operator state |
| Execution profiles | `node --experimental-strip-types tests/test-execution-profiles.mjs .` | Hermetic mocks and temporary files |
| Safety/context extension | `node --experimental-strip-types tests/test-<extension>.mjs .` | Choose `read`, `continue`, `session-scrub`, `backlog-guard`, or `grok-paraphrase-guard` |
| Operator stage and brief gate | `node --experimental-strip-types tests/test-operator-stage.mjs .`; `node tests/test-brief-gate.mjs .` | Mocked Herdr contract |
| q mode | `tests/test-q-mode.sh` | Fetches configured qq-dictation branch tip when landed source is unavailable; checks semantic parser/test evidence and local adapter behavior |
| Herdr checked-in integration | `tests/test-herdr-downstream.sh` | Fetches configured Herdr branch tip when needed; checks semantic source/test evidence plus qq adapters |
| Herdr installed runtime | `tests/test-herdr-live.sh` | Requires installed Herdr or `QQ_HERDR_TEST_BINARY` |
| OpenWiki automation | Run the owning `tests/test-openwiki-{refresh,refresh-legacy,dispatch,service}.sh` suite | Temporary repositories and fake generator; no hosted model |

Canonical behavior belongs on [profiles and activation](../runtime/profiles-and-activation.md), [qq-relay integration](../event-plane/service.md), [agent messaging](../event-plane/agent-messaging.md), [delegation and review](../workflow/delegation-and-review.md), [operator workflows](../herdr/operator-workflows.md), [safety and context](../extensions/safety-and-context.md), and [OpenWiki automation](../operations/openwiki-automation.md).

## Installed versus source correctness

qq-relay and dashboard are linked products, not vendored code or npm dependencies. Their `upstream.env` files identify a branch and landed repository without commit floors. Their contract suites intentionally validate two boundaries:

1. **Current product semantics:** fetch the configured branch tip and inspect or exercise required public behavior.
2. **Shipped consumer surface:** install to a private temporary absolute root, remove the source checkout, and run qq's wrappers/imports against only that artifact.

A source check alone does not prove qq can consume the installation. Conversely, wrapper dispatch alone does not prove the current upstream branch still supplies the expected protocol or command contract. These suites may require network access and do not manage the operator's installation, user service, or telemetry.

Herdr and qq-dictation now use the same semantic branch-tip approach instead of ancestry against recorded capability commits. Product-owned provenance markers are informational and are not readiness inputs.

## Aggregate order and prerequisites

`npm test` currently runs methodology, qq-relay, dashboard, execution profiles, safety/context extensions, operator stage, brief gate, q mode, Herdr downstream/live, and four OpenWiki suites. Delegation, review-flow, and agent-messaging checks run inside `tests/test-qq-relay.sh` because importing those consumers requires the installed relay client.

Baseline requirements are Bash, Node.js with `--experimental-strip-types`, Python 3, Git, standard Unix tools, writable `$HOME`, and network access for linked-product branch-tip fetches. `test-herdr-live.sh` additionally needs `$HOME/.local/lib/qq/herdr/bin/herdr` or `QQ_HERDR_TEST_BINARY`.

When a prerequisite is unavailable, run the unaffected focused suites and report the omitted boundary; do not describe that as a passing `npm test`. For an unclear shell assertion, rerun only that suite with `bash -x`.

## Known gaps

- Linked-product contract suites are consumer integration evidence, not complete qq-relay, dashboard, Herdr, or qq-dictation product test suites.
- OpenWiki tests use a fake generator and do not validate provider quality, secrets, GitHub PR creation, Mermaid rendering in the installed package, or OKF retrieval quality.
- Most Pi extension checks use mocks. The relay suite includes live local messaging against a privately installed relay, but it does not cover every interactive Pi lifecycle.
- Repository skill prose has no focused local suite; see [model-visible skills](../runtime/skills.md).
