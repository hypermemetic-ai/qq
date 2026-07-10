---
id: doc-11
title: 'Proven development lifecycle for qq: use GitHub Flow, not an agent framework'
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 20:56'
tags:
  - research
---
# Proven development lifecycle for qq: use GitHub Flow, not an agent framework

_2026-07-09 · Overall confidence: **HIGH** on fit and lifecycle shape;
**MEDIUM** on comparative effectiveness because no candidate publishes a
controlled independent head-to-head evaluation. This settles what qq should
adopt wholesale and how its existing skills fit._

## Verdict

**Adopt GitHub Flow wholesale as qq's delivery lifecycle. Do not adopt a
mandatory agent-development framework.** **[HIGH]**

```text
Backlog task -> short-lived branch -> changes and commits -> pull request
-> required CI checks -> review where warranted -> human merge -> branch deletion
```

GitHub defines GitHub Flow as a lightweight branch-based workflow and documents
this branch/commit/push/PR/review/merge/delete path. GitHub also says it uses the
flow for its own site policy, documentation, and roadmap. [GitHub
Flow](https://docs.github.com/en/get-started/using-github/github-flow) **[HIGH]**

Its enforcement is already part of the hosting system: protected branches can
require pull requests, successful status checks, resolved conversations, linear
history, and other merge conditions. These block the merge instead of asking an
LLM to remember policy. [Protected
branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
**[HIGH]**

GitHub Flow deliberately does not prescribe how to clarify an idea, how large a
plan must be, or whether a task needs subagents. That omission is a strength for
qq: Backlog.md already owns intent and status, while qq's skills contain
task-shaped judgment. The delivery system should not duplicate them. **[HIGH,
inference]**

## Candidate comparison

| Candidate | What it supplies | Ceremony / duplication | Verdict |
|---|---|---|---|
| **GitHub Flow** | Complete delivery spine with native PR/check enforcement | Low; leaves task method open | **Adopt** **[HIGH]** |
| **obra/superpowers** | Coherent spec/plan/TDD/subagent/review/finish path; native Codex plugin | Mandatory design and review machinery, even for small changes | Keep selected skills; reject lifecycle **[HIGH]** |
| **Every Compound Engineering** | Brainstorm/plan/work/simplify/review/compound plus autonomous PR path | 29 skills and a large automation surface | Keep qq's slim `compound`; reject plugin as base **[HIGH]** |
| **GitHub Spec Kit** | Strong spec-driven workflow and broad agent integration | Creates a second spec/task system and still needs a finishing lifecycle | Not the base **[HIGH]** |
| **OpenSpec** | Lighter proposal/spec/design/tasks workflow | Still duplicates Backlog and does not own PR/review finish | Not the base **[HIGH]** |
| **GSD Core** | Discuss/plan/waves/verify/ship with durable context state | Recreates phases, state, fresh workers, waves, and a shipping coordinator | Reject **[HIGH]** |
| **BMAD Method** | Full virtual agile organization with a smaller Quick Flow | 34+ workflows and 12+ specialist roles | Reject **[HIGH]** |

### Superpowers is the nearest match -- and still fails the ceremony test

Superpowers is coherent, maintained, cross-harness, and has behavioral tests.
It is also explicitly compulsory. Its current brainstorming skill says every
behavior or configuration change must pass nine checklist items, a committed
design document, and user review. [Current brainstorming
skill](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)
**[HIGH]** Its implementation workflow uses a fresh implementer and task review
per task, followed by a whole-branch review. [Subagent-driven
development](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md)
**[HIGH]**

Adopting that lifecycle wholesale would replace qq's constitution with another
constitution. qq already vendors the strongest task-level pieces -- planning,
execution, verification, review reception, and branch finishing -- from
Superpowers. Keep those capabilities without its global bootstrap.

### Compound Engineering is a useful idea, not the lifecycle to install

Every's core insight is strong: plan, work, review, compound, then repeat. Every
reports developing it across five products, mainly with single-person engineering
teams. [How Every codes with
agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
**[MEDIUM]**

The current plugin's normal loop has six stages, it ships 29 skills, and its
optional autonomous path plans, implements, simplifies, reviews and fixes,
browser-tests, commits, pushes, opens a PR, watches CI, and repairs failures.
[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
**[HIGH]** qq's slim `compound` preserves the valuable idea without installing
that workflow platform.

### The other frameworks duplicate state qq already owns

Spec Kit's production path is constitution -> specify -> clarify -> plan ->
checklist -> tasks -> analyze -> implement -> converge; even its lean path emits
specification, plan, and task artifacts. [Spec Kit quick
start](https://github.github.com/spec-kit/quickstart.html) **[HIGH]** OpenSpec is
lighter but still gives every change proposal/spec/design/task files and does not
own branch disposition. [OpenSpec](https://github.com/Fission-AI/OpenSpec)
**[HIGH]** Both compete with Backlog.md.

GSD explicitly uses a discuss/plan/parallel-wave/verify/ship phase loop with
durable state and fresh-context subagents. [GSD
Core](https://github.com/open-gsd/gsd-core) **[HIGH]** BMAD installs a broad
multi-role product-development organization. [BMAD workflow
map](https://docs.bmad-method.org/workflow-map-diagram.html) **[HIGH]** Both
recreate the machinery qq is removing.

## Skill graft onto GitHub Flow

The lifecycle stays fixed; skills are invoked when their trigger fits. They are
not mandatory phase transitions.

| Need | Skill / surface | Routing |
|---|---|---|
| Intent and status | **Backlog.md** | Canonical task record; ordinary project content, not scheduler state |
| Ambiguous design | `grilling` | Only for real open decisions or an explicit grill request |
| Multi-step work | `writing-plans` | Only when the task genuinely benefits from a written plan |
| Execute a plan | `executing-plans` | Only when a plan exists and separate execution helps |
| Broken or slow behavior | `diagnosing-bugs` | Bug-shaped work only |
| External reading | `research` | Current facts requiring cited sources |
| Completion evidence | `verification-before-completion` | Before completion claims and PR handoff; CI repeats deterministic checks |
| Deep review | `code-review` | Explicit request or meaningful risk, not every commit |
| Human acceptance | `uat-signoff` | User-facing, irreversible, high-risk, or otherwise non-self-certifiable work |
| Review feedback | `receiving-code-review` | Only when feedback exists |
| Branch disposition | `finishing-a-development-branch` | Restore ordinary GitHub Flow choices; remove gate references |
| Durable learning | `compound` | After a verified non-trivial solve; never a merge condition |
| Context transfer | `handoff` | Only when a fresh session is actually needed |
| Skill maintenance | `writing-skills` | Only while creating or changing a skill |

Delete the lifecycle glue:

- `orchestrate` exists to run qq's custom conductor/worker state machine.
- `qq-land` exists solely to drive qq's gate.
- `idea` exists to coordinate capture, research, and phase state; replace it
  with one plain ideas file.
- `git-guardrails` should not compensate for missing host-side branch
  protection.

OpenWiki, codebase-memory MCP, and compound remain orthogonal knowledge
capabilities. None is a required stop in the delivery path.

## Adoption boundary

GitHub Flow means qq does **not** own a gate, candidate freezer, review farm,
repair transaction, phase-state file, viewer, task scheduler, wave dispatcher,
agent migration, or second spec registry. A typo follows branch -> edit ->
verify -> PR/check -> merge. A difficult feature uses more skills because the
work warrants them, not because a constitution forces every task through every
stage. **[HIGH]**

## Gaps

- No controlled independent study compares these frameworks on correctness,
  operator time, and token cost. Relative effectiveness is **MEDIUM** confidence.
- Popularity and current releases support maintenance confidence, not workflow
  effectiveness.
- The existing qq skills were mapped by purpose and trigger, not re-evaluated
  individually. Retention decisions should use their existing eval discipline.

## Sources

- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Superpowers](https://github.com/obra/superpowers)
- [Superpowers brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)
- [Superpowers subagent-driven development](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md)
- [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
- [How Every codes with agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)
- [Spec Kit](https://github.github.com/spec-kit/)
- [OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [GSD Core](https://github.com/open-gsd/gsd-core)
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD)
