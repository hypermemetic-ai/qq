---
type: Repository quickstart
title: qq OpenWiki quickstart
description: Short practical map of qq's daily DSH host, project and Home sessions, optional plugins, legacy Pi delegation path, and narrow change validation.
tags: [quickstart, architecture, navigation]
---

# qq OpenWiki quickstart

qq is an operator-controlled coding environment with two paths: the daily DSH host (`bin/qq`) and a legacy Pi/Herdr delegation system. The DSH host composes optional UI, workflows, tasks, models, relay, and dictation plugins. Pi/Herdr still owns Backlog-based admission and isolated QA/landing.

## Read by intent

- [System topology](architecture/overview.md): ownership and plugin composition.
- [Daily DSH host and console](runtime/dsh-console.md): launch, project and Home sessions, bounded files, browser, HMR, and dictation.
- [DSH workflows and task pile](workflow/dsh-workflows.md): architect, iterate, workflow registry, and markdown tasks.
- [Model connectors](runtime/model-connectors.md): Grok/Codex OAuth, Qwen, adapters, and retries.
- [Relay boundaries](event-plane/service.md): DSH in-process mailbox versus installed Pi relay.
- [Delegation and review](workflow/delegation-and-review.md): Backlog admission, runner packet routing, QA, and landing.
- [Profiles and activation](runtime/profiles-and-activation.md): legacy Pi roles and repository activation.
- [Agent messaging](event-plane/agent-messaging.md): legacy durable Pi cross-session messages.
- [Herdr workflows](herdr/operator-workflows.md), [safety extensions](extensions/safety-and-context.md), [OpenWiki automation](operations/openwiki-automation.md), [skills](runtime/skills.md), and [validation](testing/validation.md).
- [DSH migration boundary](runtime/dsh-compatibility.md): current pins and removed pi2dsh harness.

## Task routing

| Change area or intent | Wiki page | Exact source entry points | Important symbols/types | Focused tests | Minimal validation |
|---|---|---|---|---|---|
| Host launch, pins, sibling discovery, HMR | [Daily host](runtime/dsh-console.md) | `bin/qq`; `qq/host.patch.yml`; `dsh/pins.json` | profile `qq`, `ctx.effect` | `test-qq-host.mjs`, host boot/live | `node tests/test-qq-host.mjs .` |
| Project grouping or bounded file browser | [Daily host](runtime/dsh-console.md#projects-and-files) | `qq/host.patch.yml`; `qq/src/files.mjs`; `qq/src/session.mjs`; `qq-ui/src/render.mjs` | `listProjectCatalog`, `createProjectFileService` | projects, host/browser proof | `node tests/test-qq-projects.mjs` |
| Home sessions or scratch cleanup | [Daily host](runtime/dsh-console.md#home-session-core) | `qq/src/session.mjs`; `scratch.mjs`; `session-scope.mjs` | `createHome`, `createScratchManager`, `createSessionScopeStore` | Home, scratch, scope | `node tests/test-qq-home.mjs` |
| Conversation projection, steering, pending queue | [Daily host](runtime/dsh-console.md#conversation-lifecycle) | `qq/src/conversation.mjs`; `qq/src/session.mjs`; `qq-ui/src/render.mjs` | `projectConversation`, `deriveToolEventViews`, `editPending`, `removePending` | conversation, transcript scroll | `node tests/test-qq-conversation.mjs .` |
| HTTP/SSE/PWA/mobile drawer | [Daily host](runtime/dsh-console.md#ui-security-and-reload) | `qq-ui/src/http-app.mjs`; `render.mjs`; `assets/browser-v8.js` | `createConsoleHandler`, `drawerView` | host, browser proof, UI fiber | `node tests/test-qq-host.mjs .` |
| Session aliases | [Daily host](runtime/dsh-console.md#projects-and-files) | `qq/src/alias.mjs`; `qq/src/session.mjs` | `createAliasBook`, `createQqService` | alias, relay consumer | `node tests/test-qq-alias.mjs .` |
| Workflow registration, context, leave, or transition | [DSH workflows](workflow/dsh-workflows.md) | `qq-workflows/src/plugin.mjs`; `context.mjs`; `transition.mjs` | `workflows.register`, `createWorkflowSessionApi`, `acceptedContexts` | plugin, workflow context | `node tests/test-qq-workflows-context.mjs` |
| Architect, iterate, or find behavior | [DSH workflows](workflow/dsh-workflows.md) | `qq-workflows/src/architect.mjs`; `iterate.mjs`; `plugin.mjs` | `createArchitect`, `createIterate` | workflow plugin/boot | `node tests/test-qq-workflows-plugin.mjs .` |
| Task pile or spoken task IDs | [Task pile](workflow/dsh-workflows.md#task-pile) | `qq-tasks/src/store.mjs`; `service.mjs`; `names.mjs` | `createTaskStore`, `createTasksService`, `dealId` | task unit/boot | `node tests/test-qq-tasks.mjs .` |
| Model login, Grok transport/cache/retry | [Model connectors](runtime/model-connectors.md) | `qq-models/src/plugin.mjs`; `grok.mjs`; `oauth.mjs`; `grok-auto-continue.mjs` | `createGrokAdapter`, `createLoginService` | qq-models, Grok auto-continue | `node tests/test-qq-models.mjs` |
| Model-visible skill tool | [Skills](runtime/skills.md) | `qq/src/skill-tool.mjs`; `qq/src/plugin.mjs` | `attachSkillToolVisibility` | skill-tool, live host | `node tests/test-qq-skill-tool.mjs` |
| DSH session messaging or labels | [Relay boundaries](event-plane/service.md#dsh-in-process-relay) | `qq-relay/src/relay.mjs`; `tools.mjs`; `plugin.mjs` | `createRelayService`, `createLabelBoard` | relay plugin, alias | `node tests/test-qq-relay-plugin.mjs .` |
| Dictation | [Daily host](runtime/dsh-console.md#dictation) | `qq-dictation/src/service.mjs`; `recognizer.mjs`; `http.mjs` | `createDictationService`, `createHandyRecognizer` | qq-dictation | `node tests/test-qq-dictation.mjs` |
| Pi admission, route stamp, QA, landing | [Delegation](workflow/delegation-and-review.md) | `extensions/board.ts`; `extensions/review-flow.ts`; `bin/lib/review.mjs` | `prepareDone`, `routePacket`, `conductReview`, `landHandoff` | delegation/review inside relay suite | `tests/test-qq-relay.sh` |
| Pi read/guards/Grok recovery | [Safety](extensions/safety-and-context.md) | `extensions/read.ts`; `grok-*.ts`; `session-scrub.ts` | extension registration functions | matching extension suite | Run matching `test-*.mjs` |
| Choose broad validation | [Validation](testing/validation.md) | `package.json` | `scripts.test` | applicable suites | `npm test` only with live prerequisites |

## Invariants

1. DSH owns agent status, transcript, and persistence; `qq-ui` is presentation only.
2. Optional siblings must be removable without preventing the core host from booting.
3. Plugins communicate through Cordis services and must fully reverse runtime effects on disposal.
4. DSH relay is live and in-process; Pi relay is an external durable installed product.
5. Legacy runner, QA, and landing authorities remain separate, except the explicit route-stamped trivial-change fast path.
6. Backlog and generated `openwiki/` data are automation-owned; do not hand-edit managed source data.

## Backlog

- **External sibling internals:** image-finder, media-box, Herdr, dashboard, and the installed Pi qq-relay are owned in linked repositories; this wiki documents only qq's adapter contract.
- **Hosted automation evidence:** local OpenWiki tests do not prove provider quality, GitHub secret wiring, or PR creation; see [validation gaps](testing/validation.md).