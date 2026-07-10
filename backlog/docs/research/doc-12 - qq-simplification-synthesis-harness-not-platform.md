---
id: doc-12
title: 'qq simplification synthesis: harness, not platform'
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 21:02'
tags:
  - research
---
# qq simplification synthesis: harness, not platform

_2026-07-09 · Overall confidence: **HIGH**. This reconciles the landing-system
and lifecycle research with the operator's retained surfaces._

## Settled architecture

qq is a thin harness containing operating guidance, useful skills, knowledge
access, and human-facing cockpit preferences. It does not own source control,
merge enforcement, workflow scheduling, model processes, or agent-runtime
configuration. **[HIGH]**

| Concern | Adopt / retain | qq must not build |
|---|---|---|
| Intent and status | **Backlog.md** | A second registry, transactional Done flips, or branch-name locking protocol |
| Delivery lifecycle | **GitHub Flow**: task -> branch -> PR/checks -> human merge -> delete branch | A phase machine, conductor, or mandatory skill chain |
| Merge enforcement | **GitHub repository ruleset + strict required Actions check** | A gate coordinator, evidence database, repair loop, or CI poller |
| Judgment | Existing skills, invoked by trigger and risk | Universal review/UAT/planning passes |
| Knowledge | **OpenWiki, codebase-memory MCP, compound** | A multi-maintainer document-stack protocol |
| Ideas | One plain ideas file | Background research, locks, numbering claims, phase state, or install wrappers |
| Agent runtime | Whatever harness the operator launches | A Claude-to-Codex migration, compatibility layer, or global-config editor |

GitHub documents its flow as a lightweight branch-based workflow and its
rulesets as a native way to require PRs and status checks and block force pushes
and deletions. [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow),
[ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
**[HIGH]**

## Landing decision

Adopt GitHub's native refusal point wholesale:

```text
local verification -> branch push -> pull request -> required GitHub Actions
-> optional code-review/UAT -> human merge -> automatic branch deletion
```

The ruleset targets the default branch and requires a PR, conversation
resolution, a strict deterministic CI check from GitHub Actions, and no deletion
or non-fast-forward update. It grants no routine bypass and keeps manual merge.
No merge queue is enabled initially. [Landing-system
research](<./doc-13 - Wholesale-landing-system-for-qq-adopt-GitHubs-native-gate.md>) **[HIGH]**

GitHub and Mergify both position queues around busy or concurrently merged
branches; Mergify's own guide says to skip one at low PR volume when concurrent
green changes are not breaking `main`. [Mergify queue
guide](https://mergify.com/learn/merge-queue) **[MEDIUM]** If real merge skew
appears later, GitHub's native queue is the escalation. It is not a component to
anticipate.

AI review stays outside the mechanical gate. `code-review` can be invoked for a
risky branch, while deterministic CI is the only required machine check. This
keeps model/provider availability and prompt behavior from blocking every merge.
**[HIGH, design inference]**

## Lifecycle decision

Do not adopt Superpowers, Compound Engineering, GSD, Spec Kit, OpenSpec, or BMAD
as a global lifecycle. Their useful skills and ideas remain donors, but their
complete workflows recreate mandatory artifacts, hard gates, phase state,
subagent orchestration, or virtual-team machinery. [Lifecycle
research](<./doc-11 - Proven-development-lifecycle-for-qq-use-GitHub-Flow-not-an-agent-framework.md>) **[HIGH]**

GitHub Flow is the lifecycle. Skills scale the ceremony:

- ambiguous work may use `grilling` and `writing-plans`;
- bugs use `diagnosing-bugs`;
- current external facts use `research`;
- completion claims use `verification-before-completion`;
- meaningful risk may use `code-review` and `uat-signoff`;
- review feedback uses `receiving-code-review`;
- notable verified solves use `compound`;
- context pressure uses `handoff`.

A typo does not pretend to be a seven-stage project. A difficult feature can use
every relevant skill without changing the delivery path. **[HIGH]**

## Keep, delete, restore

### Keep

- Backlog.md and its task files.
- The substantive skill library: grilling, planning/execution, debugging,
  verification, review/review reception, UAT, research, handoff, writing-skills,
  and compound.
- OpenWiki, codebase-memory MCP, Backlog `solutions` documents, and `CONCEPTS.md`.
- Cockpit components that are directly useful to the operator.
- The small WIP snapshot if it continues to earn its keep.

### Delete

- The custom gate, launcher, schemas, tests, config, viewer, control bundle,
  status integration, and `qq-land`.
- The external no-mistakes integration and every live rule written around it.
- `orchestrate` and the phase-state machinery it coordinates.
- The custom Git shell-language analyzer, its proof harness, and the operator
  ceremony caused by treating it as a security boundary.
- The Codex TOML/configuration manager and broad activation script.
- The current `idea` skill and background researcher; replace with one file.
- The concept of a Codex migration task.

### Restore instead of rewrite

Any donor skill bent around qq's gate should return to its upstream-neutral
purpose. In particular, `finishing-a-development-branch` should present ordinary
GitHub Flow outcomes, and planning/review skills should not know about gate state,
phase viewers, task transactions, or a particular agent harness. **[HIGH]**

## Harness-neutrality rule

Changing the executable that drives qq must not cause a repository migration.
Rules and skills are content; Git and GitHub are the delivery substrate; the
agent program is a replaceable reader and actor. Use each harness's native skill
discovery/install surface outside the methodology. Do not answer runtime
differences with a qq abstraction layer -- that would start the same cycle
again. **[HIGH]**

## Gaps

- The existing skills remain presumptively valuable, but this research did not
  re-run their behavioral evals individually.
- `qq-frontier` and `qq-wave` should be judged separately by observed operator
  value. Backlog.md's retention does not imply that branch-as-lock scheduling or
  automatic wave dispatch survives.
- GitHub's required status check must run once before it can be selected in a
  ruleset, so adoption has a simple two-step bootstrap: land/run CI, then enable
  the rule.
