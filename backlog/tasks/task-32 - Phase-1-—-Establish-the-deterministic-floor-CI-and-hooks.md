---
id: TASK-32
title: Phase 1 — Establish the deterministic floor (CI and hooks)
status: In Progress
assignee: []
created_date: '2026-07-14 05:10'
labels: []
dependencies: []
documentation:
  - doc-38
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the missing deterministic enforcement layer per doc-38 Phase 1: a GitHub Actions workflow running both existing test suites, Claude Code project hooks enforcing the hard mandates, and removal of the three sentence-grep policy tests whose prose coverage the hooks replace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A GitHub Actions workflow runs the BPMN pipeline node tests (Node >=20, QQ_BPMN_SKIP_RENDER=1) on every pull request and push to main
- [ ] #2 The same workflow runs the shell suite (tests/test-*.sh) and fails on any test failure
- [ ] #3 Claude Code project hooks block agent-issued 'gh pr merge' and direct Edit/Write to managed Backlog markdown (excluding plan asset bundles), with behavior covered by a shell test
- [ ] #4 tests/test-grilling.sh, tests/test-bpmn-plans.sh, and tests/test-openwiki-maintainer.sh are deleted and nothing references them
- [ ] #5 All remaining local tests pass and the CI workflow is green on this Change's pull request
<!-- AC:END -->
