---
id: decision-19
title: >-
  Apply qq methodology and confined delegation globally to every Git Repository
  on this operator-owned Pi installation
date: '2026-07-27 08:58'
status: accepted
---
## Context

qq is the operator-owned harness for this Pi installation. Its methodology, Skills, extensions, and confined delegate runtime are machine-level infrastructure, but separate Repositories previously needed a root `AGENTS.md` symlink to activate qq delegation. After `qq-subagent-env` moved to the global extension mount, that marker selected canonical qq dispatch while `qq-dispatch` still rejected a child whose Git common directory differed from qq's. DecIQ therefore failed before child or provider start even though it carried the intended marker.

The marker represented operator intent, not a trust boundary: Repository content could create it, and Landstrip—not the marker—owns child filesystem confinement. The operator reviewed the global posture on 2026-07-27 and directed that the original objective remain controlling: DecIQ and other projects must be able to continue their work without per-Repository activation, Repository mutation, package/config reinstall, or an unconstrained fallback.

## Decision

On this operator-owned Pi installation, qq methodology and confined delegation apply globally to every Git Repository.

Pi's native global context path mounts canonical qq `AGENTS.md`. A Repository-local `AGENTS.md` is optional additive project context and is not an activation token. qq's own linked worktrees may use their checkout-local adapter and manifests for same-Repository Change verification; every external Repository uses canonical qq primary sources. Pi project trust remains authoritative for Repository-supplied settings, packages, and executable extensions. A delegated cwd without a Git Repository fails closed before child launch.

Reintroducing per-Repository qq opt-in, vanilla delegation for another Git Repository, or broader trust requires a new explicit operator-approved decision.

## Consequences

- The global subagent environment extension configures canonical qq delegation in every Pi session while preserving qq worktree self-hosting.
- `qq-dispatch` accepts markerless external Git Repositories only from canonical primary authority and scopes Landstrip grants to the invocation Repository and its exact Git metadata.
- Non-primary qq adapters refuse external Repositories; non-Git child directories continue to refuse.
- Bootstrap mounts `~/.pi/agent/AGENTS.md` directly to canonical qq guidance. Repository-local context can append specifics without controlling activation.
- Pi project trust, trusted role and execution-profile authority, authentication staging, structured output, timeout, signal, and process-tree confinement remain separate and unchanged.
- DecIQ source, Task state, package configuration, and bounded assignment remain unchanged; after the reviewed Change lands and global context is activated, its accountable session retries the same assignment.
