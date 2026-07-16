---
id: doc-44
title: Design — Retire merged Changes at source (deliver-change step 12)
type: specification
created_date: '2026-07-16 03:38'
updated_date: '2026-07-16 04:29'
tags:
  - design
  - delivery
---
# Design — Retire merged Changes at source

Owning Task: TASK-49. This decision amends `deliver-change` step 12.

## Decision

After steps 10–11 verify that the pull request merged and synchronize the primary `main` checkout, the same Actor retires the Change at source. When its work session still exists, a migrated Actor returns only its own accountable pane to the project home before removing the workspace and checkout; board-driven dispatch already runs from home. When the operator has already closed the work session, the Actor removes the checkout directly. In both shapes it deletes the merged local branch.

This is the moment of maximal knowledge: the Actor has just proved both the merged disposition and the synchronized destination. The one-time manual sweep recorded on 2026-07-15 established the operational dance; step 12 makes it the rail-guarded default.

A scheduled or board-driven sweep is rejected. It would add standing machinery and its own failure surface, act far from the context that knows the Change state, and recreate the operator-attention problem it is meant to remove.

## TASK-48 reconciliation

TASK-48 remains authoritative for non-merged terminal dispositions: leave the accountable pane, work session, checkout, and branch intact, with the disposition-watch completion notification as the only end-of-Change signal. TASK-49 supersedes its leave-intact rule only for a verified merged disposition and absorbs its no-focus rule as a hard constraint. The `qq-herdr-home focus-board` closing move is absent from both retirement and rail-trip fallback, and ending a Change never changes operator focus.

Moving the accountable pane owned by the executing session home with `herdr pane move ... --no-focus` is the sole deliberate exception to the no-pane-move rule. It applies only in migrated posture, moves no operator-created pane, and does not focus the destination; board-driven dispatch skips it.

## Safety rails and fallback

Retirement proceeds only when observable evidence proves, in order, that the Change checkout is a linked worktree distinct from the primary `main` checkout, its complete status is clean, and its branch tip is an ancestor of freshly fetched `origin/main` with the checkout’s `HEAD` attached to that same branch (mergedness is proven for the branch, not for whatever the checkout may have been switched to). Branch deletion later uses `git branch -d`, never `-D`, as an independent mergedness backstop.

When the work session exists, workspace-scoped Herdr evidence must show no live agent other than the executing migrated session, or no live agent at all under board-driven dispatch. It must also show exactly one tab and only Change-created panes: the root placeholder and/or accountable pane. Anything unexplained is treated as operator-created. The work session must also not hold operator focus at retirement time: closing a focused workspace would move operator focus, which ending a Change never does.

Work sessions remain the convention for every Change. One can nevertheless be legitimately absent because the operator may close it mid-flight while its checkout remains. In that shape the workspace census has no subject; instead, evidence must show that the executing session owns the Change delegate lifecycle, its completion wake has fired, and no other Actor was given the checkout. Retirement then uses unforced `git worktree remove <checkout-path>` instead of `herdr worktree remove`.

If any rail trips or evidence cannot be resolved, the Actor reports the observed state and does nothing else: any work session, every pane and tab, the checkout, and the branch remain intact, with operator focus untouched. Operator-created panes and tabs are never closed. Forced worktree removal and forced branch deletion are never permitted.

With every rail green, the Actor performs the applicable no-focus pane move, removes the checkout through the existing-work-session or absent-work-session command, and deletes the branch with `git branch -d`. A removal refusal is reported and is never retried with force.

## Relationship to doc-43

doc-43 AC #4 still keeps both migrated and board-driven postures, and its mid-turn-steering and delegate-lifetime collapse triggers remain unchanged. This note supersedes exactly one accepted cost recorded there: “the accountable pane stays in the retired work session until the operator retires it.” The amended step 12 instead returns a migrated pane home when its work session exists and retires the merged Change at source.

## Live evidence

TASK-49 AC #2 is dispatcher-owned. Its required live observation completes on the first real merged Change after this amendment lands; it is deliberately not performed by this implementation Change.
