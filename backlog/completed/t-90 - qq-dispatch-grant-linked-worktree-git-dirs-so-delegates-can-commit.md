---
id: T-90
title: 'qq-dispatch: grant linked-worktree git dirs so delegates can commit'
status: Done
assignee: []
created_date: '2026-07-19 01:37'
updated_date: '2026-07-19 02:45'
labels:
  - base-batch
dependencies:
  - T-83
documentation:
  - >-
    backlog/docs/solutions/doc-52 -
    codex-workspace-write-omits-linked-worktree-git-dirs-qq-dispatch-grants-them.md
priority: high
type: bug
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex's workspace-write sandbox does not grant write access to a linked worktree's git directories when the worktree lives in a separate subtree from its git dir (the herdr layout: worktree under ~/.herdr/worktrees/qq/…, git dir under ~/projects/qq/.git). Both the git-common-dir and the per-worktree git-dir are read-only, so a delegate can edit files in its worktree but cannot `git commit`. This blocks the codex-first model: every base-batch delegate hit it and the owner committed by hand (see T-87 notes). It affects the profile path (qq-dispatch) and the raw `--sandbox workspace-write` delegate-batch command identically — it is NOT profile-specific (the pre-compaction diagnosis was wrong on that point).

Fix: qq-dispatch computes the target worktree's git-common-dir and git-dir and grants both to the implementer role via `codex exec --add-dir <common> --add-dir <gitdir>` (deduped for a primary checkout). Both are required. Discovery probes strip the entire GIT_* environment so inherited git vars cannot false-grant an unrelated repo. Reviewer/researcher are read-only and unchanged.

Decision ledger:
- Diagnosis + fix shape (grant both git dirs, implementer-only, --add-dir, strip all GIT_* on discovery, dry-run surfaces the grant, offline regression test, delivered codex-first) — asked-and-answered alignment brief, 2026-07-18, operator approved; recorded as decision record doc-52 (this Change).
- Scope — base batch (doc-51), fixing the T-83 dispatch engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Implementer dispatch grants the target worktree's git-common-dir and git-dir as writable roots (codex --add-dir x2); reviewer and researcher dispatch are unchanged
- [x] #2 A non-git dispatch root adds no --add-dir grant (behavior unchanged under --skip-git-repo-check)
- [x] #3 inspect and --dry-run surface the computed writable-root grant in the state JSON
- [x] #4 An offline regression test in test-qq-dispatch.sh asserts the grant for a worktree root and its absence for a non-git root; full shell suite and ratchet stay green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered codex-first on branch fix/t-90-dispatch-worktree-git-dirs (PR #141). Root cause re-derived from scratch with direct sandbox probes (the pre-compaction "profile omits git-common-dir; raw flag works" diagnosis was wrong on both counts). qq-dispatch (implementer arm only) now resolves git via qq_resolve_bin, computes git-common-dir + per-worktree git-dir via `rev-parse --path-format=absolute`, dedupes, and appends `--add-dir` per dir; surfaces them as state.writable_roots (empty for non-git roots and read-only roles). Three review rounds by fresh Codex reviewers: R1 fixed inherited-GIT_DIR false-grant + read-only roles gaining a git dependency (gated the whole computation to implementer); R2 closed the class by stripping ALL GIT_* (`unset "${!GIT_@}"`) after GIT_DISCOVERY_ACROSS_FILESYSTEM was found to survive the enumerated unset (reproduced with a real cross-fs mount); R3 hardened the regression test with a git-env-capture shim that reproduces-before-fix. Verified live end-to-end: real commit lands in a herdr-topology worktree; the delegates that built this Change committed their own work through the grant; cross-fs hostile-env non-git root yields []. shellcheck PASS; tests 12/12; ratchet green, baselines unchanged; GitHub shell-tests PASS.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
qq-dispatch now grants a delegated implementer its target worktree's git dirs (--add-dir git-common-dir + per-worktree git-dir, implementer-only, deduped), so Codex delegates can commit inside herdr-layout worktrees; discovery strips the whole GIT_* environment to prevent inherited-env false grants. All 4 AC met and verified live; delivered on PR #141. Decision record: doc-52.
<!-- SECTION:FINAL_SUMMARY:END -->
