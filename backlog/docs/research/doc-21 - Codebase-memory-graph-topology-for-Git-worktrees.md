---
id: doc-21
title: Codebase-memory graph topology for Git worktrees
type: other
created_date: '2026-07-12 20:28'
updated_date: '2026-07-12 20:33'
tags:
  - research
---
# Codebase-memory graph topology for Git worktrees

**Owning Task:** T-12
**Overall confidence:** HIGH
**Settles:** On codebase-memory-mcp 0.9.0, keep linked worktrees as distinct physical project databases. The intended end state is one logical Repository graph made from a canonical base plus branch/worktree overlays, not one branch-unaware mutable snapshot.

## Findings

1. **Current 0.9.0 storage is path/project scoped — HIGH.** The indexing pipeline derives the project name from the indexed checkout path, while Git `canonical_root` and branch data are resolved as separate metadata ([pipeline source](https://github.com/DeusData/codebase-memory-mcp/blob/v0.9.0/src/pipeline/pipeline.c#L164-L172)). The MCP then maps each project name to `<cache>/<project>.db` ([store resolution](https://github.com/DeusData/codebase-memory-mcp/blob/v0.9.0/src/mcp/mcp.c#L958-L979)); the store states that each project gets its own database ([store invariant](https://github.com/DeusData/codebase-memory-mcp/blob/v0.9.0/src/store/store.c#L820-L825)). Locally, the qq main checkout and indexed linked worktrees have distinct SQLite files even though `list_projects` reports the same Git common directory and canonical Repository root.

2. **Distinct worktree databases are a deliberate correctness boundary — HIGH.** In July 2026, the owner rejected a proposal to use the shared Git `canonical_root` as project identity. The reason was explicit: main and every linked worktree share that value, so indexing one worktree would reuse or overwrite another branch graph and silently break multi-worktree operation. The requested safe identity remained per-worktree ([maintainer review on PR #754](https://github.com/DeusData/codebase-memory-mcp/pull/754#issuecomment-4878090987)). The later closure also rejected silent index merging because it could delete or replace an intentionally separate graph.

3. **The intended end state is one base graph plus contextual overlays — HIGH.** The owner endorsed a merge-base design with one canonical base index and changed-files-only worktree overlays, tombstones for deletions, and active-Git-context query resolution. The owner described this as the right shape and endorsed committed changes only for the first cut ([maintainer response on issue #573](https://github.com/DeusData/codebase-memory-mcp/issues/573#issuecomment-4784159373)). That issue remains open on the `0.9.2-rc` milestone. The merged precursor only added canonical Git metadata and `Project -[:HAS_BRANCH]-> Branch` roots; it did not deduplicate storage or implement overlay queries ([PR #401](https://github.com/DeusData/codebase-memory-mcp/pull/401)).

4. **Missing-root cleanup exists but is not yet proven for this installation — MEDIUM.** Version 0.9.0 added pruning for projects whose roots remain absent ([v0.9.0 release](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.9.0)); its watcher requires repeated missing observations plus a grace interval before deletion. The live cache still contains old worktree projects with `root_exists: false`, so prior or unregistered databases can persist. Automatic pruning should be verified before qq relies on it as complete cleanup.

## Recommendation

**Inference — HIGH confidence:** distinguish one *logical* Repository graph from one *physical mutable snapshot*.

- Keep the current per-worktree project databases on 0.9.0. They preserve the graph that matches each branch and avoid concurrent watchers overwriting one another.
- Do not override project identity to the canonical checkout, point multiple worktrees at one SQLite file, or build a qq-specific overlay layer.
- Leave `auto_index` and `auto_watch` unchanged for now. Verify upstream missing-root pruning separately; manually delete only confirmed stale derived projects if cleanup becomes worthwhile.
- Track issue #573 and adopt the upstream base-plus-overlay model after it ships and passes a qq worktree smoke test.
- Continue verifying uncommitted Change state in source and fresh Checks. The proposed first overlay indexes committed changes only, so even the future model will not immediately replace source inspection for active edits.

## Sources

- [Maintainer rejection of shared canonical-root identity](https://github.com/DeusData/codebase-memory-mcp/pull/754#issuecomment-4878090987)
- [Maintainer endorsement of canonical base plus worktree overlays](https://github.com/DeusData/codebase-memory-mcp/issues/573#issuecomment-4784159373)
- [Merged worktree branch-root foundation](https://github.com/DeusData/codebase-memory-mcp/pull/401)
- [codebase-memory-mcp v0.9.0 release](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.9.0)
- [Tagged v0.9.0 project/store implementation](https://github.com/DeusData/codebase-memory-mcp/tree/v0.9.0)

## Gaps

- No released overlay implementation exists; issue #573 still has unresolved identity, edge-rewrite, query-context, and garbage-collection details.
- The first proposed overlay intentionally excludes dirty working-tree changes.
- qq has not yet observed the 0.9.0 missing-root grace/prune cycle end to end.
