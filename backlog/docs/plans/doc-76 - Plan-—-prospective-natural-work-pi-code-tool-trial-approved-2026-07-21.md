---
id: doc-76
title: Plan — prospective natural-work pi-code-tool trial (approved 2026-07-21)
type: other
created_date: '2026-07-21 07:27'
updated_date: '2026-07-21 07:32'
tags:
  - plans
  - experiment
  - performance
---
# Plan — prospective natural-work pi-code-tool trial

**Owning Task:** T-135. **Dependency:** T-127 observation instrumentation active. **Approved:** operator, explicit asked-and-answered approvals in the accountable session, 2026-07-21 ("approved." for the original protocol; "approved" for the pre-treatment enrollment correction).

## Intended outcome

Measure the deployment effect of neutrally exposing `pi-code-tool` during ordinary qq work. The sample is prospective and content-blind: it tests whether the tool helps the work qq actually receives, including the possibility that the model ignores or misuses it.

## Population and assignment

- Begin only after T-127 observation instrumentation is active.
- Enroll every idle, non-command operator input before treatment, whether or not the resulting turn later uses tools. Enroll the next 40 inputs in arrival order. Continue past 40 only until at least 10 distinct Changes are represented.
- Slash commands, user shell commands, extension-injected messages, mid-stream steering, and queued follow-ups are not new work items. This rule is determined entirely before treatment.
- Pair consecutive included inputs. The fixed seed is `T-135/pi-code-tool/2026-07-21/v1`. For pair `n`, hash `seed:n` with SHA-256; an odd first hexadecimal nibble assigns treatment first and an even nibble assigns control first. Each pair therefore contains one treatment and one control, producing exactly 20 per arm after 40 inputs.
- Analyze by assigned arm whether or not the model invokes `code`. Do not prune failures, non-use, no-tool turns, or unfavorable task shapes. Do not stop early for performance results.

## Treatment and control

Treatment loads one pinned `pi-code-tool` version under a trial wrapper. Availability is neutral: work orders and prompts do not encourage use. Configure `toolStore: false`, `noBuiltins: true`, `mountWorkspace: true`, `bridgePiTools: true`, `typeCheck: true`, `autoApprove: false`, five-second execution, and 64 MiB memory. `noBuiltins` removes `http_get` and saved-tool helpers; ordinary Pi read, grep, find, and ls remain callable. Code-mode mutation attempts remain approval-gated and are denied in headless runs; normal mutations use ordinary Pi tools.

Control uses the same model, reasoning, prompt, instrumentation, and qq lifecycle with no `code` tool.

## Measures and quality gate

Primary performance measures: active wall time and uncached input tokens. Secondary measures: model turns, direct tool calls, code-tool calls, code-tool inner calls, failures, and retries. Quality measures: terminal completion, applicable Checks, review findings, incomplete evidence, rework, and operator interruptions.

Report raw arm summaries, input-level records, treatment uptake, median and distributional differences, and uncertainty. Post-hoc task-shape and actual-tool-use labels may explain heterogeneity but never change enrollment or the intention-to-treat result.

Adopt only if treatment reduces median active wall time by at least 10% or uncached input tokens by at least 15%, with no worse completion, Check, review, retry, evidence, or operator-interruption outcomes. Otherwise narrow, hold, or reject. A safety incident may stop the trial immediately and remains in the result.

## Boundary and non-goals

The Change may add the smallest deterministic assignment, treatment-loading, runtime-ledger, and analysis surfaces needed for this trial. Trial data remains append-only under the T-127 runtime store and is never tracked. Synthetic benchmarks, curated favorable tasks, post-treatment enrollment based on tool use, replay-only evidence, prompting the model to use code mode, permanent installation, changed approval boundaries, and lifecycle changes are out.

Permanent adoption requires a separate operator disposition. Unless that disposition is approved, the final trial Change removes transient loading machinery while preserving the analyzer and durable evidence where they remain useful.

## Success evidence

- Deterministic schedule Check proves one treatment and one control per pair and 20 per arm.
- Treatment configuration Check proves storage, HTTP helpers, and auto-approval are disabled.
- Trial ledger accounts for every enrolled input, assignment, and terminal outcome.
- Reproducible analyzer emits the fixed intention-to-treat measures over the complete sample.
- A T-135 research report, also attached to T-127, records the resulting adopt, narrow, hold, or reject recommendation.

## Execution learning

For a reviewed correction that crosses otherwise independent concerns, split work at stable contract and file boundaries, keep one writer per side, and leave integration and shared Checks with the accountable owner. This setup correction separated evidence/analyzer work (`lib/` and operator documentation) from Pi runtime lifecycle work (the project extension); both sides shared the predeclared ledger schema, while the accountable session retained the focused test and disposition. Promote this pattern into the general methodology only after the landed Change verifies that the split reduced elapsed time without hiding integration failures.
