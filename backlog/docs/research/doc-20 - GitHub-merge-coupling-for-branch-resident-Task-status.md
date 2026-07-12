---
id: doc-20
title: GitHub merge coupling for branch-resident Task status
type: other
created_date: '2026-07-12 18:31'
updated_date: '2026-07-12 18:31'
tags:
  - research
---
# GitHub merge coupling for branch-resident Task status

Owning Task: TASK-11  
Overall confidence: HIGH  
Settles: retain branch-resident Backlog Task status as work status and GitHub pull-request state as Change delivery status; do not add merge-time or post-merge status automation.

## Findings

- **HIGH — observed:** Native GitHub pull-request merge can merge, squash, or rebase the proposed commits. The merge API accepts commit metadata, expected head SHA, and merge method, but no alternate tree or file-transform hook. A PR whose Task says Ready would therefore land Ready. [GitHub merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github) · [Merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- **HIGH — observed:** An Action can react after a pull request merges, but any Task edit is a later commit rather than part of the merge. A push made with the repository GITHUB_TOKEN does not trigger ordinary push workflows. [Merge-triggered workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#running-your-pull_request-workflow-when-a-pull-request-merges) · [GITHUB_TOKEN event behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)
- **HIGH — inference:** Constructing a different merge commit or pushing a post-merge Task commit would introduce a privileged repository writer and, under the intended PR-only rules, routine bypass authority. That is disproportionate bookkeeping and conflicts with the settled qq decision not to own transactional Done flips or a landing coordinator. [GitHub ruleset behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-a-pull-request-before-merging)
- **HIGH — operator decision:** TASK-11 keeps the original entity split. Done means the agreed Task work is verified complete and ready for the operator delivery decision. Merged means the operator accepted and landed the Change. Feedback against existing acceptance criteria reopens the same Task; changed or additional intent is separately authorized work.

## Sources

- GitHub Docs: merge methods and pull-request merge API.
- GitHub Docs: Actions merge events, GITHUB_TOKEN behavior, and rulesets.
- qq simplification synthesis, backlog research doc-12.

## Gaps

No gap affects TASK-11. A GitHub-native Issue or Project could own merge-coupled status, but the operator explicitly retained Backlog as the Task surface.
