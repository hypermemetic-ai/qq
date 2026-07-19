---
id: doc-52
title: codex workspace-write omits linked-worktree git dirs; qq-dispatch grants them
type: other
created_date: '2026-07-19 02:41'
---

## Context

Delegated Codex implementers run under `qq-dispatch` in a `workspace-write`
sandbox confined to the target worktree (`-C <root>`). Delegates could edit
files but not `git commit`: every base-batch ticket hit this and the owner
committed by hand (recorded in T-87's notes). A pre-compaction diagnosis
attributed it to the `qq-implementer` Codex profile "omitting the
git-common-dir," and claimed the raw `--sandbox workspace-write` dispatch was
unaffected. Both claims were wrong.

## What is actually true (proven by direct sandbox probes)

codex's `workspace-write` sandbox does not grant write access to a linked
worktree's git directories when the worktree lives in a *separate subtree*
from its git dir — the herdr layout: worktree under
`~/.herdr/worktrees/<repo>/<name>`, git dir under `~/projects/<repo>/.git`. A
commit must write to two places outside the sandboxed cwd:

- the **git-common-dir** (`…/.git`) — objects and refs; and
- the **per-worktree git-dir** (`…/.git/worktrees/<name>`) — index,
  `index.lock`, HEAD, logs.

Both are read-only under `workspace-write`, so the commit fails. The failure is
**identical** via the Codex profile and via a bare `--sandbox workspace-write`
flag — it is not profile-specific. The sandbox itself is correctly enforced (an
out-of-root canary write is denied). Probes that appeared to "pass" did so only
because the throwaway git dir happened to sit under a default writable root
(`/tmp`, or a directory sharing an ancestor with the worktree) — the false
negative that produced the original mis-diagnosis. **Lesson:** verify sandbox
behavior in the real path topology, never one that shares an ancestor with a
default writable root.

## Decision

`qq-dispatch` grants the target worktree's git directories to the implementer
role via Codex's native `--add-dir <DIR>` flag: the git-common-dir, plus the
per-worktree git-dir when it differs (deduped; a primary checkout yields one).
**Both** are required — granting only the common dir leaves the per-worktree
subdir read-only. The grant is computed per dispatch (the paths are
per-worktree, so it cannot be a static profile setting), applies to the
**implementer only** (reviewer and researcher are `read-only` and never
commit), is empty for a non-git root (preserving `--skip-git-repo-check`
behavior), and is surfaced in the `inspect`/`--dry-run` state as
`writable_roots` so the grant is observable and offline-testable. Verified
end-to-end: a real `git add && git commit` lands in a herdr-topology worktree
with this argv.

## Discovery must ignore the ambient git environment

Deriving the grant from `git -C "$root" rev-parse` is only safe if `$root`
alone determines discovery. Inherited git variables otherwise cause a
**false grant** of an unrelated repository: `GIT_DIR`/`GIT_COMMON_DIR`/
`GIT_WORK_TREE` select a repo directly, and `GIT_DISCOVERY_ACROSS_FILESYSTEM`
lets upward discovery cross a mount boundary — both reproduced, the latter with
a real cross-filesystem (tmpfs) mount. Enumerating variables to unset is
whack-a-mole (the first fix missed `GIT_DISCOVERY_ACROSS_FILESYSTEM`). The
discovery probes therefore strip the **entire** `GIT_*` environment
(`unset "${!GIT_@}"`) in their subshell, closing the whole class in one move
while a legitimate root still discovers its own git dirs. `GIT_CEILING_DIRECTORIES`
can only *suppress* discovery, so it is not a false-grant vector.

## Scope / follow-up

The raw `codex exec … --sandbox workspace-write` command written into the
`delegate-batch` skill (outside the repo) carries the same latent block. The
settled direction is skills adopting `qq-dispatch` rather than carrying the raw
command; until then, that path needs the same two `--add-dir` grants. Tracked
as a follow-up, not fixed here.

Encoded by T-90 (base batch, doc-51). Operator-approved alignment brief,
2026-07-18.
