---
id: doc-41
title: Vendor-native orchestration and cross-harness visibility (July 2026)
type: other
created_date: '2026-07-14 21:16'
updated_date: '2026-07-14 21:16'
tags:
  - research
---
# TASK-35 — Engine/glass split research findings

Owning task: [TASK-35](</home/qqp/projects/qq/backlog/tasks/task-35 - Phase-4-—-Engine-glass-split-harness-native-delegation.md>)  
Overall confidence: **HIGH** for Claude Code and Codex capabilities; **MEDIUM** for the market-wide interoperability conclusion.

As of July 14, 2026, the research supports [doc-38’s](</home/qqp/projects/qq/backlog/docs/plans/doc-38 - Plan-—-Own-the-gates-qq-kernel-convergence.md>) proposed split. Claude Code and Codex now provide substantial native execution engines: delegation, concurrency, sandboxing, persistence, and vendor-specific operator surfaces. Claude’s new Agent view comes closest to also supplying local session glass; Codex supplies a richer programmatic control plane through app-server. Neither exposes all native teams, subagents, and live sessions through a common cross-vendor protocol. qq should therefore rent each harness’s engine, use its supported observation/control interface, and retain herdr as a thin cross-runtime glass, messaging, and notification layer—not rebuild vendor orchestration.

## Q1 — Claude Code native primitives

### Observed facts

- **HIGH — Subagents are shipped.** The `Agent` tool runs delegated work in separate contexts, foreground or background. `SendMessage` can resume a stopped subagent by ID. This is lead-to-worker control; general peer messaging belongs to agent teams. [Claude tools reference](https://code.claude.com/docs/en/tools-reference)

- **HIGH — Agent teams are shipped experimentally, not stable.** Introduced in Claude Code 2.1.32 on February 5, 2026, teams provide independent Claude sessions, a shared task list, and direct inter-teammate messages. They remain disabled by default behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. Current limitations include one team per session, no nested teams, imperfect task-state propagation, and no automatic worktree isolation. Anthropic explicitly recommends them for independent work and advises a single agent or subagents for sequential or same-file work. [Agent teams documentation](https://code.claude.com/docs/en/agent-teams), [2.1.32 release](https://github.com/anthropics/claude-code/releases/tag/v2.1.32)

- **HIGH — Worktree isolation is shipped.** Version 2.1.49 added `claude --worktree`, declarative subagent `isolation: worktree`, and background-agent support. Agent view background sessions are automatically isolated before editing. Agent teams themselves still require the operator to arrange isolation. [Worktree documentation](https://code.claude.com/docs/en/worktrees), [Claude changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

- **HIGH — Background-session mission control is shipped as a research preview.** Agent view, introduced in 2.1.139 on May 11, 2026, supplies `claude agents`, status such as working/waiting/completed, conversation inspection, reply, attach, stop, respawn, and removal. `claude agents --json` makes background sessions externally enumerable, and logs/full conversations remain readable. Fresh local checks against Claude Code 2.1.209 confirmed `agents --json`, `--bg`, `--worktree`, and Remote Control commands. [Agent view documentation](https://code.claude.com/docs/en/agent-view), [2.1.139 release](https://github.com/anthropics/claude-code/releases/tag/v2.1.139), [current 2.1.209 release](https://github.com/anthropics/claude-code/releases/tag/v2.1.209)

- **HIGH — Web, desktop, IDE, and remote surfaces are operational.** Cloud sessions persist in a sidebar and support steering and review; Desktop provides parallel worktree sessions and notifications; IDE integrations expose history and cloud-session continuation. Remote Control synchronizes a local process with web/mobile clients, while server mode can host multiple sessions and create worktree-backed sessions. [Claude on the web](https://code.claude.com/docs/en/claude-code-on-the-web), [Desktop](https://code.claude.com/docs/en/desktop), [IDE integrations](https://code.claude.com/docs/en/ide-integrations), [Remote Control](https://code.claude.com/docs/en/remote-control)

- **HIGH — Two scheduling models exist.** Local `/loop` and cron tools run only while the current process remains alive and recurring entries expire after seven days. Cloud Routines, currently a research preview, start a fresh autonomous cloud session for schedule, API, or GitHub triggers and do not require the laptop to remain online. [Local scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks), [Cloud Routines](https://code.claude.com/docs/en/routines)

- **HIGH — Notifications are externally bridgeable.** Hooks cover notifications, subagent start/stop, teammate idle, task completion, worktree lifecycle, and other events. Payloads include session and transcript identifiers. Desktop/web surfaces add operator notifications. [Hooks documentation](https://code.claude.com/docs/en/hooks)

- **MEDIUM-HIGH — External visibility has a defined boundary.** An outside process can enumerate and read Agent view background sessions through supported commands. It cannot use a documented global API to enumerate every in-process subagent or team member across arbitrary foreground sessions. Team mailbox files exist locally, but Anthropic warns against editing them; they should be treated as implementation detail, not a messaging API.

No rumored features were counted. Agent teams, Agent view, and cloud Routines are real, documented releases, but their experimental/research-preview maturity matters.

### Inference

Claude-only operation can now rely heavily on Agent view and native web/desktop surfaces. qq should use Claude’s native delegation, team messaging, worktrees, and lifecycle hooks. A Claude adapter for herdr should map supported session IDs, status, logs, attach/reply, and notifications; it should not parse or mutate raw team mailboxes.

Claude still does not eliminate herdr’s cross-runtime purpose. `SendMessage` is a Claude execution primitive, while Agent view is a Claude-specific cockpit.

## Q2 — Codex CLI and cloud primitives

### Observed facts

- **HIGH — `codex exec` is a strong batch interface.** It supports read-only, workspace-write, and full-access sandboxes; ephemeral operation; JSONL event output; final-output files; structured output schemas; and continuation by session ID or `--last`. `exec resume` continues a persisted thread, but is not documented as a live mid-turn steering channel. [Non-interactive mode](https://developers.openai.com/codex/noninteractive), [CLI reference](https://developers.openai.com/codex/cli/reference)

- **HIGH — Native multiagent work is shipped and default-enabled in current releases.** The CLI exposes `/agent`; app, CLI, and IDE surfaces show subagent activity. Current guidance recommends parallelizing independent, read-heavy work and warns that write-heavy agents sharing a workspace can conflict. Experimental CSV fanout exists for row-oriented workloads. [Codex subagents](https://developers.openai.com/codex/concepts/subagents)

- **MEDIUM-HIGH — CLI subagents lack a documented per-agent worktree primitive.** Dedicated Git worktrees are documented for desktop parent tasks, and cloud tasks receive isolated environments. CLI subagents inherit the parent execution environment and sandbox, so qq must pre-create separate worktrees when independent writers need filesystem isolation. [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [Codex cloud](https://developers.openai.com/codex/cloud)

- **HIGH — App-server is the supported programmable control plane.** Its JSON-RPC interface provides thread list/read/resume, loaded-thread status, lifecycle notifications, interruption, and `turn/steer` for an active turn. The stable API is exposed by default, with individually gated experimental fields; WebSocket transport remains experimental. [App-server documentation](https://developers.openai.com/codex/app-server), [current app-server protocol README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

- **HIGH — The observation boundary depends on how Codex was launched.** A parent process can consume `codex exec --json`. App-server can list/read persisted threads and observe or steer work it hosts or loads. There is no documented `codex agents --json` equivalent that attaches to and steers every independently running `codex exec` process. Thus an app-server thread and an arbitrary live CLI process should not be treated as the same control domain.

- **HIGH — Cloud and Remote provide vendor-native glass.** Cloud tasks execute in isolated environments and expose task history, review, diffs, follow-up prompts, and PR workflows. Codex Remote reached GA on June 25, 2026, enabling phone-based continuation of a connected desktop host. [Codex cloud](https://developers.openai.com/codex/cloud), [Codex changelog](https://developers.openai.com/codex/changelog)

- **HIGH — Notifications are bridgeable.** Command hooks expose lifecycle events including subagent start/stop and permission requests. The `notify` command emits turn-completion JSON to an external process, while the TUI has configurable notification methods. [Hooks](https://learn.chatgpt.com/docs/hooks), [Configuration reference](https://developers.openai.com/codex/config-reference)

- **HIGH — Current-version check.** Local inspection found Codex CLI 0.144.4, matching the July 14, 2026 release. [Codex 0.144.4](https://github.com/openai/codex/releases/tag/rust-v0.144.4)

- **MEDIUM — Symphony is evidence of direction, not a replacement product.** OpenAI’s April 2026 engineering preview uses an issue tracker as control plane, creates one dedicated workspace per issue, applies dependency-aware bounded concurrency, and continuously reconciles agent state. It is Codex/Linear-oriented and explicitly remains an engineering preview. [Symphony announcement](https://openai.com/index/open-source-codex-orchestration-symphony/), [Symphony specification](https://github.com/openai/symphony/blob/main/SPEC.md)

### Inference

For unattended batch work, qq can invoke `codex exec` and retain its JSONL and final output. For live Codex supervision, app-server is the correct integration point; PTY scraping would discard richer supported state.

Codex therefore supplies both engine and vendor-scoped glass, but not a runtime-neutral cockpit. herdr remains useful for aggregating Codex and Claude sessions, normalizing notifications, and coordinating work that crosses their control domains.

## Q3 — Cross-vendor standards and cockpits

### Observed facts

| Surface | Current status | What it provides | Material omission |
|---|---|---|---|
| A2A | Version 1.0 released March 2026 | Agent discovery, messages, durable tasks, list/get/cancel/subscribe, streaming, push notifications | No verified native Claude Code or Codex exposure of internal subagents/teams as A2A agents |
| MCP | Widely shipped; Tasks extension experimental | Tools/resources and optional durable task state | Does not standardize native harness topology, attach, or teammate messaging |
| ACP + Zed | Shipped client-agent protocol and registry | Cross-vendor independent sessions, history/status, worktree-backed parallel threads | Adapter-dependent feature parity; no native peer/team semantics |
| Terminal cockpits | Shipped community tools | Multiple Claude/Codex/etc. PTYs, worktrees, status, attach/reprompt | Mostly process-level wrappers; limited visibility into native internal agents |

- **HIGH — A2A is the appropriate protocol category for independent agents.** A2A 1.0 defines Agent Cards and task/message operations between opaque agents. Its own guidance distinguishes this from MCP’s agent-to-tool relationship. [A2A 1.0 announcement](https://a2a-protocol.org/dev/announcing-1.0/), [A2A specification](https://a2a-protocol.org/dev/specification/), [A2A and MCP](https://a2a-protocol.org/dev/topics/a2a-and-mcp/)

- **HIGH — MCP alone is not a mission-control standard.** MCP’s November 2025 Tasks utility introduces an experimental durable state machine with list/get/cancel, but tasks remain optional and do not describe the native session/team structures of Claude or Codex. [MCP Tasks specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

- **MEDIUM-HIGH — ACP is the closest shipped cross-vendor glass layer.** ACP v1 supports session creation and, where implemented, list/load/delete and metadata updates. Zed’s registry includes adapters for Claude Code, Codex CLI, Gemini, and others; Zed can show multiple independent threads and isolate parallel work in worktrees. Its Claude adapter wraps an SDK and explicitly does not guarantee complete CLI parity. [ACP overview](https://agentclientprotocol.com/protocol/v1/overview), [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list), [Zed ACP registry](https://zed.dev/blog/acp-registry), [Zed parallel agents](https://zed.dev/docs/ai/parallel-agents), [Claude Code via ACP](https://zed.dev/blog/claude-code-via-acp)

- **MEDIUM — Community cockpits solve the process layer.** Claude Squad uses tmux and Git worktrees across Claude, Codex, and other agents; Agent Deck adds session status, hooks, terminal control, and worktree management. They are useful operational precedents, but cannot recover semantic subagent/team state that a harness does not expose. [Claude Squad](https://github.com/smtg-ai/claude-squad), [Agent Deck](https://github.com/asheshgoplani/agent-deck)

- **MEDIUM — No reviewed product satisfies the full requirement.** None of the primary standards or representative shipped cockpits simultaneously provides native Claude team visibility, Codex thread visibility, durable enumerate/read/attach, and semantic cross-harness agent-to-agent messaging. This is a market-scan conclusion, not proof that no private or newly released product exists.

### Inference

The practical architecture is capability-negotiated adapters:

1. Use each harness’s native engine and supported observation API.
2. Normalize only portable concepts: runtime, session, parent, status, worktree, transcript reference, attention requirement, and capabilities.
3. Keep richer native operations behind capabilities rather than forcing a lossy common model.
4. Treat ACP as a promising operator-client integration and A2A as a future external-agent boundary.
5. Keep MCP focused on tool/resource access.
6. Retain herdr until a standard can actually expose both vendors’ live internal state and control semantics.

## Q4 — Sequential ticket batches versus fanout

### Observed facts

- Claude’s team guidance favors independent tasks and warns against same-file or sequentially dependent team work. Codex’s subagent guidance similarly recommends parallel read-heavy work and cautions against conflicting writers. [Claude agent teams](https://code.claude.com/docs/en/agent-teams), [Codex subagents](https://developers.openai.com/codex/concepts/subagents)

- Claude documents that context compaction can lose early detail and recommends persisting stable instructions outside the conversation. [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)

- OpenAI’s own harness work treats the repository, plans, and documentation as the durable system of record rather than relying on transcript memory. Symphony models dependencies as a DAG and gives each issue a dedicated workspace; OpenAI reports that human attention becomes strained beyond roughly three to five concurrent sessions. [Harness engineering](https://openai.com/index/harness-engineering/), [Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)

- Practitioner reports converge on fresh sessions for separate tasks, intentional compaction, and durable research/plan artifacts. These are operational experience rather than controlled comparative studies. [HumanLayer context engineering](https://www.humanlayer.dev/blog/advanced-context-engineering), [One session per task](https://willness.dev/blog/one-session-per-task)

### Inference and recommended operating model

| Work shape | Recommended mode |
|---|---|
| Same files, shared invariant, or tightly coupled acceptance criterion | Sequential work in one ticket/session/worktree |
| Independent investigation, review, or read-only checks | Native fanout |
| Independent write tickets with disjoint ownership | Fanout into separate branches/worktrees |
| Dependency chain | Run only the currently unblocked DAG frontier |
| Large unrelated backlog | One fresh session per ticket through a bounded worker pool |

Mitigations supported by the evidence:

- Make the ticket—not the conversation—the durable unit of intent. Persist acceptance criteria, assumptions, decisions, checks, and completion evidence.

- Give each writing ticket one branch and one worktree. Do not allow independent agents to write concurrently in the same checkout.

- Serialize integration even when implementation is parallel. Conflicting ownership or heavily shared files are signals to reduce fanout.

- Bound operator-facing concurrency to roughly three to five active tickets, even if the harness supports more threads. Review and decision bandwidth, not model capacity, is usually the limiting resource.

- Use fresh sessions for unrelated tickets. Use subagents inside a ticket for noisy exploration or bounded review so their context does not pollute the implementing session.

- Checkpoint before compaction or handoff: current state, relevant files, decisions, remaining work, exact checks, and blockers. Treat transcript-only knowledge as disposable.

- Namespace non-Git resources per worktree: ports, databases, caches, containers, generated artifacts, and temporary directories. A Git worktree alone does not isolate these.

- Require a completion envelope from every worker: changed files, checks run and results, unresolved risks, and the branch/worktree or commit containing the work.

Confidence in these recommendations is **MEDIUM-HIGH**: vendor guidance and multiple practitioner reports agree, but the best concurrency level and context-reset cadence remain repository-dependent.

## Gaps and limits

- Agent teams, Agent view, cloud Routines, Codex app-server fields, and ACP adapters are evolving quickly. This report reflects documentation and releases available on July 14, 2026.

- No paid-cloud end-to-end interoperability test was performed. Local CLI surfaces were checked, while cloud behavior was assessed from current primary documentation.

- Raw transcript, mailbox, and state-database schemas were not treated as supported APIs.

- The negative cross-vendor conclusion is necessarily non-exhaustive. Representative open-source cockpits and the relevant standards were reviewed, but private products may exist.

- There is no controlled benchmark establishing one universally optimal sequential/fanout strategy. TASK-35 should validate the proposed bounded-concurrency model through fresh Checks on qq’s actual ticket mix.

## Sources

All web sources above were opened during the research; living documentation reflects its July 14, 2026 state. The conclusions were primarily shaped by:

- Anthropic’s Agent teams, Agent view, worktrees, tools, hooks, scheduling, Remote Control, web/desktop/IDE documentation, changelog, and current release.

- OpenAI’s `codex exec`, subagents, app-server, cloud, worktree, hooks/configuration, changelog, Symphony, harness-engineering, and current-release materials.

- The A2A 1.0 specification, MCP Tasks specification, ACP v1 specification, Zed ACP/parallel-agent documentation, and the Claude Squad and Agent Deck repositories.

- The HumanLayer and Will Ness practitioner reports, used only for clearly labeled field-practice findings.
