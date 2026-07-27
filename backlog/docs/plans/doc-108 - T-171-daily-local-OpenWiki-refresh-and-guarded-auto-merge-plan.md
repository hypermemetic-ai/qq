---
id: doc-108
title: T-171 daily local OpenWiki refresh and guarded auto-merge plan
type: other
created_date: '2026-07-27 05:34'
updated_date: '2026-07-27 06:39'
tags:
  - plan
  - openwiki
  - systemd
  - automation
---
# T-171 — daily local OpenWiki refresh and guarded auto-merge plan

**Owning Task:** T-171
**Status:** Approved by the operator on 2026-07-27 after the local timer, no-catch-up behavior, review gate, guarded merge, credential choice, and final merge-race posture were presented.

## Outcome

The operator’s always-on machine starts one explicitly assigned OpenWiki maintainer run each day at 03:00 machine-local time. A powered-off machine misses that day without boot catch-up. Semantic no-change completes successfully. A generated documentation candidate receives deterministic Checks and independent fresh-context review, then the existing `qqp-bot` identity merges only through a repository-owned exact-candidate guard. Routine success needs no operator merge.

The guard rechecks latest `main` immediately before merge. GitHub cannot atomically bind that query to completion of its merge endpoint, so a rare ordinary Change landing in the final interval may make the wiki briefly stale. The guard detects that state after merge and the next 03:00 assessment repairs it. The off-hour schedule makes the race uncommon; no strict-check, branch-protection, or merge-queue subsystem is added.

## Boundary and non-goals

This is local systemd-user scheduling for qq, not GitHub-hosted generation, a source-merge trigger, a persistent service, a queue, or a retry engine. It does not revive T-157, make OpenWiki authoritative, permit source Changes to maintain the wiki, enable repository-native auto-merge, or grant `qqp-bot` new general authority. A missed timer is accepted; an attempted-run failure exits nonzero and remains in the user journal until the next scheduled attempt or explicit diagnosis.

The merge guard is a drift-net against well-meaning automation mistakes. It is not a security boundary: `qqp-bot` already holds a broader repository token. Credentials remain outside Git. Generated `openwiki/` pages remain owned by the separately scheduled maintainer and are not hand-edited in this source Change.

## Implementation

1. Add a repository-owned daily runner and systemd user service/timer templates. The timer uses local `03:00`, `Persistent=false`, and ordinary systemd single-service semantics; the OpenWiki common-directory lock remains the writer backstop. The runner uses absolute repository-owned commands and a headless Pi maintainer assignment, with output and exit status visible to journald.
2. Keep generation in the dedicated `openwiki/update` worktree reset from freshly fetched `origin/main`. No-change exits successfully without a pull request. Generated changes follow the maintainer procedure: documentation checks, independent fresh-context review, corrections and delta review when needed, one exact commit, push, and a docs-only pull request.
3. Add a guarded merge command. Before loading or selecting the bot credential and again immediately before merge, require the expected repository, open PR, base `main`, head `openwiki/update`, same-repository candidate, exact reviewed head, one candidate commit based on current `origin/main`, allowed generated OpenWiki paths only, immutable operator instructions, successful named CI for the exact head, no pending/failing check, and mergeability. Refuse malformed, missing, stale, or contradictory evidence. Merge by expected head with `qqp-bot`; never use native auto-merge. Afterward, verify the reviewed candidate and merge commit are on fresh `origin/main`; if the final non-atomic interval admitted another main Change, report the wiki stale and rely on the next 03:00 run for repair rather than claiming atomic freshness.
4. Update `openwiki-maintainer` only with the narrow scheduled auto-merge exception. On-demand maintenance and all ordinary Changes retain operator merge. Update root/operator-owned instructions, README, cockpit guidance, and tests; do not hand-edit generated `openwiki/` pages.
5. Add isolated shell tests with fake Git/GitHub/Pi/systemd surfaces for timer semantics, no catch-up, single-writer behavior, no-change, nonzero failure propagation, exact-candidate success, every refusal class, final-race detection, and credential-selection timing. Run the complete local suite and fresh-context review.
6. Deliver through one GitHub Flow Change. After the operator merges it and `main` is synchronized, add `qqp-bot` to the existing `main` push restriction if it is not already present, establish the long-lived `openwiki/update` worktree, link and enable the user units on this machine, and verify the next 03:00 schedule. Do not trigger an immediate OpenWiki generation as part of activation.

## Success evidence

- Repository tests and CI pass on the exact implementation head.
- Fresh review passes the complete Change and any correction delta.
- The installed timer reports the next 03:00 machine-local activation and has no `Persistent=true` catch-up behavior.
- A non-generating/fake-run activation check proves command resolution and journal-visible failure without inference or merge.
- The guarded merge test matrix proves exact reviewed-candidate success and fail-closed behavior for identity, branch, base, head, path, staleness, review, CI, and mergeability contradictions, plus detection of a final-interval main advance.

## Rollback

Disable and unlink the user timer/service, preserving journals and Repository evidence. Remove `qqp-bot` from the `main` push restriction if the scheduled merger is retired. Revert the narrow scheduled auto-merge exception and merge guard by ordinary reviewed Change. Do not delete OpenWiki content or credentials as part of scheduler rollback.
