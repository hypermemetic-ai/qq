---
name: finishing-a-development-branch
description: Use when implementation is complete, verification is green, and you need to decide whether to land, keep, or discard the branch through qq's all-gated workflow.
---

# Finishing a Development Branch

## Overview

Complete development work without inventing a second landing path. qq is
all-gated: finished work lands through the gate with `no-mistakes axi run
--intent "<backlog task + acceptance criteria>"`; add `--skip ci` only after
confirming the current repo has no configured CI. The gate opens the PR.

**Core principle:** Verify evidence → confirm branch state → present the finish
decision → push to the gate or preserve the work.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Green Evidence

Before presenting options, confirm `verification-before-completion` has already
run the real check commands and read the full output.

If that evidence is missing or stale, run verification now. If verification is
red, stop and fix the work before finishing.

### Step 2: Confirm Branch State

Run:

```bash
git status --short --branch
git branch --show-current
```

If you are on `main` or `master`, stop and create a branch before continuing.
For task-backed work, use `task-<id>-<slug>` (or `task-<id>.<n>-<slug>` for a
slice). Agents never land changes directly on `main`.

If there are unrelated uncommitted changes, preserve them. Commit only the
verified work that belongs to this task.

If the branch must absorb changes from the gate or from a moved `main`, merge
those heads instead of rebasing. The gate may have rebased onto its own head and
appended review-fix commits; non-fast-forward pushes are refused and force is
blocked, so preserving the gate's files is the only landing path.

### Step 3: Confirm Registry Touch

If this repo has adopted `backlog/`, make sure the landing includes a Backlog.md
task create, claim, update, or close. Task work claims by creating the
`task-<id>-<slug>` branch, setting the task `assignee` to that branch, and
committing the claim immediately; that branch name is the cross-tree claim
signal used by `bin/qq-frontier`. Until TASK-16 automates Done flips, only close
or mark a task Done at gate handoff: verification green, task changes committed,
and Option 1 about to start. If the gate fails or landing is abandoned, revert
the Done flip first. The gate's mechanical check only proves the diff touches
`backlog/`; the PR review is where truthfulness is checked.

### Step 4: Present Options

Present exactly these options:

```text
Implementation is verified on branch <branch>. What would you like to do?

1. Land through the gate (`no-mistakes axi run --intent "…"`, adding `--skip ci` only when this repo has no CI)
2. Keep the branch as-is
3. Discard this work

Which option?
```

Do not offer a local merge or direct `origin` push.

### Step 5: Execute Choice

#### Option 1: Land Through The Gate

If the landing is being driven from a herdr pane, keep `qq-gate-view` visible
instead of relying on bare `no-mistakes attach`. A branch-local pane can run the
viewer in its own split or spawn one with
`qq-gate-view --spawn <pane-id> --cwd "$PWD"`; a conductor pane on `main` uses
`qq-gate-view --repo` to follow the repo's active run. The viewer waits before a
run exists and re-attaches across fix-round runs.

Run with the intent taken from the backlog task and acceptance criteria this
landing advances or closes. Use the CI-preserving command by default:

```bash
no-mistakes axi run --intent "<task title + acceptance criteria>"
```

If you have confirmed the current repo has no CI configured, use the no-CI
variant:

```bash
no-mistakes axi run --skip ci --intent "<task title + acceptance criteria>"
```

Use `--skip ci` only after confirming the current repo has no CI configured. qq
itself currently needs the flag: the ci step otherwise burns 13–22 minutes
polling a checkless PR (`gh pr checks` exit-status-1 loop, measured on v1.31
and v1.34; task-13 AC#3). Remove the flag once real CI exists.

Do not use `git push no-mistakes <branch>` when a skip flag is required: the
push trigger cannot pass `--skip ci`. It is only the fallback when no skip flags
are needed and no explicit intent is available; the gate then infers intent from
transcripts.

**You own this run — the operator never babysits it.** Objective review
findings auto-fix (`auto_fix.review`). If the run parks with `ask-user`
findings, relay each finding's ID, file, and full description to the owner,
then answer with `no-mistakes axi respond --action approve`,
`no-mistakes axi respond --action skip`, or
`no-mistakes axi respond --action fix --findings <ids> --instructions "<owner guidance>"`.
Report the PR or gate status when the run completes.

#### Option 2: Keep As-Is

Report: "Keeping branch <branch> at <path>."

Do not clean up the worktree or delete the branch.

#### Option 3: Discard

Confirm first:

```text
This will discard the verified branch/worktree for <branch>.

Type 'discard' to confirm.
```

Wait for exact confirmation. If confirmed, use the repo's normal non-destructive
cleanup path. Do not force-delete branches or remove worktrees unless the owner
explicitly asked for that exact cleanup and the workspace is known to be yours.

## Red Flags

**Never:**
- Merge locally to `main`
- Push directly to `origin` as the landing path
- Proceed with red or missing verification
- Delete work without typed confirmation
- Clean up a worktree you do not own

**Always:**
- Verify before finishing
- Work from a task branch for task-backed work, never `main`/`master`
- Preserve unrelated changes
- Land through the gate with `no-mistakes axi run --intent`; add `--skip ci` only after confirming no CI exists
