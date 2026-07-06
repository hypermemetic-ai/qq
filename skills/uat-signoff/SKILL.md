---
name: uat-signoff
description: Human acceptance sign-off that walks the owner through one observable test at a time to confirm a change is what they actually wanted and feels right, inferring severity for any gaps from their own words. Use after verification-before-completion evidence exists and the change touches user-facing behavior or UI, is irreversible or high-blast-radius (migrations, deletes, money, outbound sends), has acceptance criteria the agent cannot self-certify, or the owner asks for a review.
---

# UAT Sign-off

## Overview

Autonomous verification answers *"did the code do what the agent claims?"* This skill answers the other half: *"is what was built what the owner actually wanted, and does it feel right?"*

The two form a pipeline, not a rivalry. `verification-before-completion` runs first and proves the change works; this skill puts the working change in front of the human for acceptance. It is the human layer on top of the machine gate.

**Core principle:** the owner performs the action and observes; Claude renders each checkpoint and records the reply. The owner's sign-off — not the agent — is what closes the task. Keep the owner's job to typing "yes" or a one-line plain-English gripe.

## When this fires

Fire selectively — never on trivial or internal-only work. Trigger on any one of:

- **User-facing behavior or UI** changed.
- **Irreversible or high-blast-radius** changes: migrations, deletions, money movement, outbound sends (email, notifications, webhooks).
- **Ambiguous acceptance criteria** the agent cannot self-certify — "make it feel snappier", "clean up the dashboard".
- **Explicit owner request** for a review or sign-off.

On a trigger-hit, run the sign-off below before any completion claim: the owner's observation is what hands the work back — not a status report, not a to-do list of what you'd harden or fix next.

On a trigger-miss (refactor, docs, internal plumbing), the autonomous gate alone closes the task. Say so and stop.

## Precondition

`verification-before-completion` evidence must already exist: the real command was run and its output read. Never ask the human to test something the agent has not confirmed even runs.

Seed the `expected` column of every test **from that evidence** — the observed output becomes the predicted observable behavior. This is the clean seam between the two skills.

## Deriving the test list

Build tests from **this change only**: the diff, the change description, and the claims the autonomous gate already verified.

List only **user-observable outcomes**. A useful filter: *could the owner notice this by using the product?* If not, it belongs to the machine gate, not here.

- **Include:** new/changed screens, flows, messages, outputs, side effects the owner can perceive.
- **Skip:** refactors, type changes, renamed internals, performance work with no felt difference — users cannot observe them.

Order tests so the most irreversible or highest-risk outcome comes first.

## Running the checkpoint

Present **one test at a time**. Show the expected behavior, then ask whether reality matches. Plain text — no Pass/Fail buttons, no severity menu.

```
Test 2 of 5
  expected: Clicking "Export" downloads a CSV of the currently filtered rows.
Does it?
```

Wait for the reply, classify it, then move to the next test. Claude never performs the action or guesses the result — only the owner's observation counts.

Classify the reply:

| Reply | Meaning |
|-------|---------|
| yes / y / ok / pass / next / approved / ✓ / (empty) | **pass** |
| skip / can't test / n/a | **skip** |
| anything else | **issue** — capture it |

## When the reply is an issue

**Infer severity from the owner's own words. Never ask "how severe is this?"** — the words already carry it.

| Words in the reply | Severity |
|--------------------|----------|
| crash, error, exception, fails | **blocker** |
| doesn't work, wrong, missing, can't | **major** |
| slow, weird, off, minor, small | **minor** |
| color, font, spacing, alignment, visual | **cosmetic** |
| unclear / none of the above | **major** (default) |

Log each issue as a gap with a stable id:

- **id** — `G-<feature-or-date>-<N>` (e.g. `G-export-1`), stable so the fix loop can reference it.
- **truth** — the `expected` behavior for that test.
- **reason** — the owner's words, **verbatim**, in quotes.
- **severity** — the value inferred above.

```
G-export-1  major  truth: Export downloads a CSV of the filtered rows.
            reason: "the file downloads but it's completely empty"
```

Then continue to the next test.

## Closing out

After the last test, print the summary:

| Test | Status |
|------|--------|
| 1. Login redirects to dashboard | Passed |
| 2. Export downloads filtered CSV | Issue (major) |
| 3. Bulk delete confirmation | Skipped |

Then the tally: **Passed N · Issues N · Skipped N**, followed by the gap list if any exist.

If any gaps exist, **the work is not complete.** Hand the gaps to the fix loop. When fixes land, re-run **only the failed tests**, re-collect the owner's observation, and reconcile each resolved gap (mark it `status: resolved`). Sign-off is reached only when every non-skipped test is Passed.

## Composition

- **Autonomous verify runs unconditionally** and produces the evidence that seeds this skill's `expected` column.
- **This skill fires only on the triggers above** — the selective human layer on top.
- **They layer, never conflict:** one proves the code runs, the other confirms it is what the owner wanted. Neither re-does the other's job.
- **The owner's action stays as small as possible** — type "yes" or one plain-English gripe, and severity is inferred rather than interrogated. That honors minimize-operator-effort.
