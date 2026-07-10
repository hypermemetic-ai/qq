---
id: doc-13
title: 'Wholesale landing system for qq: adopt GitHub''s native gate'
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 20:56'
tags:
  - research
---
# Wholesale landing system for qq: adopt GitHub's native gate

_2026-07-09 · Overall confidence: **HIGH**. This settles the baseline landing
system, the candidates rejected, and the only evidence that should trigger a
future escalation._

## Verdict

**Adopt GitHub itself wholesale: repository ruleset + pull request + strict
required GitHub Actions check + manual human merge. Build no qq gate and enable
no merge queue initially.** **[HIGH]**

This is a gate in the only useful sense: the hosting platform refuses an update
to `main` unless the declared conditions pass. GitHub rulesets can require a
pull request, require status checks from a selected app, require the branch to
be current with its base, block force pushes and deletions, require linear
history, and require conversation resolution. [Available rules for
rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
**[HIGH]** Required checks must pass against the latest commit SHA. [Required
status-check troubleshooting](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
**[HIGH]**

GitHub rulesets are available for this repository: qq is a public repository
owned by an organization, and rulesets are available to public repositories on
GitHub Free. [About
rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
**[HIGH]**

## Current-state audit

A live GitHub API read on 2026-07-09 found:

- `hypermemetic-ai/qq` is a public organization repository;
- it has no repository rulesets;
- `main` returns `404 Branch not protected` from the branch-protection API;
- auto-merge is disabled;
- delete-branch-on-merge is enabled;
- the current `origin/main` has no GitHub Actions workflow.

So qq built an enforcement platform before turning on the standard enforcement
surface it already used for hosting. **[HIGH, live repository state]**

## Candidate comparison

| Candidate | Strength | Cost / mismatch | Verdict |
|---|---|---|---|
| **GitHub ruleset + Actions** | Native refusal point, PR record, exact check identity, no daemon or adapter | One ordinary CI workflow per repo | **Adopt** **[HIGH]** |
| **GitHub merge queue** | Tests merge groups against current `main`; useful under concurrent landing pressure | Extra event/configuration and queue behavior; solves a problem qq has not demonstrated | Keep as native escalation **[HIGH]** |
| **Mergify** | Mature queue, batching, speculative checks, dependencies, merge protections; free here | Another privileged GitHub App and policy/config surface; its own guidance says native GitHub is enough for small teams | Reject for now **[HIGH]** |
| **Graphite** | Strong stacked-PR workflow and stack-aware queue | Paid queue, broad workflow adoption, GitHub App bypass, optimized for high PR volume/stacks | Reject **[HIGH]** |
| **Kodiak** | Maintained open-source auto-update/auto-merge bot | Duplicates native update/merge behavior and adds an app or self-hosted service | Reject **[HIGH]** |
| **Prow/Tide** | Proven large-scale merge-pool automation | Kubernetes-scale CI/control plane to operate | Reject **[HIGH]** |
| **bors-ng** | Historically proven gated merge model | Repository is archived | Reject **[HIGH]** |
| **no-mistakes** | Agent-backed review and repair pipeline | qq's direct use produced branch ambiguity, long fix loops, availability failure, and extensive integration coupling | Reject **[HIGH, local operational evidence]** |

### Why no queue yet

GitHub describes merge queue as a way to increase velocity on busy branches by
testing a PR with other PRs queued ahead of it. [Merge queue general
availability](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/)
**[HIGH]** Mergify's own current guide says a queue probably is not needed below
roughly five PRs per day when `main` is not breaking from independently green
changes; it calls GitHub's native queue appropriate for a single modest-volume
repository. [What is a merge
queue?](https://mergify.com/learn/merge-queue) **[MEDIUM]** This is vendor
guidance, but it argues against buying the vendor's own product and matches
GitHub's stated use case.

There is also no basis for treating more machinery as infallibility. GitHub's
April 23, 2026 incident caused multi-PR squash merge groups to produce incorrect
merge commits that reverted prior changes; 658 repositories and 2,092 PRs were
affected. Pull requests merged outside the queue were unaffected. [GitHub
incident report](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
**[HIGH]** This does not disqualify GitHub's queue. It does disqualify enabling
one merely to preserve qq's former exact-SHA obsession.

### Why Mergify and Graphite do not earn the extra surface

Mergify extends GitHub with dynamic conditions, dependency declarations,
scheduled freezes, batching, parallel checks, and a composite protection check.
[Mergify merge
protections](https://docs.mergify.com/merge-protections/) **[HIGH]** qq needs
none of those today. GitHub already enforces the required PR/check boundary.

Graphite's queue is stack-aware and offers speculative/parallel CI, but enforcing
it requires Graphite's GitHub App to bypass GitHub restrictions, and the queue is
a paid feature. [Graphite merge
queue](https://graphite.com/docs/graphite-merge-queue), [Graphite key
features](https://graphite.com/docs/key-features) **[HIGH]** qq has just learned
that stacked task branches and custom coordination are liabilities; adopting a
stack-oriented platform would push in the wrong direction.

### Why AI review is not part of the gate

Review quality and merge enforcement are different capabilities. Every
non-trivial Change receives an author-side `code-review` with fresh-context
independence before the final GitHub-side Checks. Deterministic CI remains the
required status check, and the operator performs the merge click. **[HIGH,
design inference; operator decision updated 2026-07-10]**

## Adopted configuration

Configure one active repository ruleset targeting `~DEFAULT_BRANCH`:

1. **Require a pull request before merging.** No approval count is required for
   the single-operator baseline; the human merge click remains the judgment
   point.
2. **Require conversation resolution.**
3. **Require the repository's deterministic CI check**, pinned to GitHub
   Actions as the expected source.
4. **Use strict required checks** so the candidate is tested with current
   `main` before it can merge.
5. **Block deletion and non-fast-forward updates** to `main`.
6. **Require linear history** if qq retains its current bisectable-history
   preference.
7. **Grant no routine bypass actor.** Emergency administration remains a
   deliberate GitHub-owner action, not an agent path.
8. Keep **manual merge**. Do not enable auto-merge or a merge queue initially.

Each repository owns one normal CI workflow that runs its real deterministic
checks on `pull_request`. qq does not generate, freeze, import, hash, or poll
that workflow. GitHub records the check and blocks the merge.

The official workflow is therefore:

```text
verify locally -> independent code-review -> resolve findings and reverify
-> push branch -> gh pr create -> GitHub Actions -> human merge
-> GitHub deletes branch
```

No `qq-land`, gate state, dossier, critic, repair transaction, status viewer,
installed control bundle, or CI polling process survives.

## Escalation rule

Enable **GitHub's native merge queue**, and add the documented `merge_group`
Actions trigger, only after observed evidence that two independently green PRs
or genuinely concurrent landings are breaking or repeatedly rebasing `main`.
[Actions `merge_group` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
**[HIGH]**

Evaluate Mergify only if qq later needs queue batching, speculative parallel
checks, multiple priority queues, cross-PR dependencies, or monorepo scopes.
Those are escalation criteria, not roadmap items.

## Gaps

- GitHub's required check name cannot be selected until the workflow has run at
  least once. Adoption therefore needs a simple bootstrap order: land/run CI,
  then activate the ruleset.
- Strict PR checks establish tested current merge state, not necessarily that
  the SHA appearing on `main` equals the PR head SHA after squash/rebase. No
  demonstrated qq requirement needs identity stronger than tested content.
- No independent controlled comparison covers every merge product. The
  recommendation rests on primary capability documentation, qq's actual scale,
  and direct operational evidence.

## Sources

- [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub merge queue](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue)
- [GitHub April 2026 incident](https://github.blog/news-insights/company-news/an-update-on-github-availability/)
- [Mergify merge queue](https://docs.mergify.com/merge-queue/)
- [Mergify guidance](https://mergify.com/learn/merge-queue)
- [Graphite merge queue](https://graphite.com/docs/graphite-merge-queue)
- [Kodiak](https://github.com/chdsbd/kodiak)
- [Prow](https://github.com/kubernetes-sigs/prow)
- [qq's first-wave gate evidence](https://github.com/hypermemetic-ai/qq/blob/41865dcb00118feecbe1cd0b77ece437b8a1bc42/docs/solutions/2026-07-08-silent-failure-and-the-gate-branch-contract.md)
