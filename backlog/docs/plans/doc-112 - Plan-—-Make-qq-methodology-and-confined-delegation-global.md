---
id: doc-112
title: Plan — Make qq methodology and confined delegation global
type: specification
created_date: '2026-07-27 08:59'
updated_date: '2026-07-27 09:39'
---
# Plan — Make qq methodology and confined delegation global

## Outcome

Restore DecIQ's blocked delegation and make the intended harness posture true by construction: on this operator-owned Pi installation, qq methodology and confined delegation apply to every Git Repository without a per-Repository activation marker.

## Reproducer and cause

The global `qq-subagent-env` extension currently recognizes a separate Repository only when its root `AGENTS.md` symlink resolves to qq's canonical file, then selects canonical `bin/qq-dispatch`. The dispatcher accepts only a child whose Git common directory matches the adapter Repository. From `/home/qqp/projects/deciq`, the canonical adapter therefore exits 65 with `child cwd belongs to an unrelated repository` before any child or provider action. The extension and dispatcher encode contradictory ownership tests.

## Settled decision

Decision `decision-19`, approved by the operator in the 2026-07-27 asked-and-answered alignment exchange: qq methodology and confined delegation are global for every Git Repository on this operator-owned Pi installation. Repository-local `AGENTS.md` is optional project context, not an activation token. Pi's project-trust mechanism remains the boundary for repository-supplied settings and executable extensions.

## Ownership boundary

- qq's global Pi context mount and globally mounted delegation environment extension;
- canonical `qq-dispatch` Repository selection and Landstrip policy inputs;
- focused dispatcher/extension tests and current operating documentation;
- agent-owned post-merge activation of the global canonical `AGENTS.md` mount;
- the retry signal to the already-blocked DecIQ accountable session.

## Non-goals

- Do not change DecIQ source, Task state, package configuration, or its bounded assignment.
- Do not bypass qq-dispatch, trusted role manifests, structured completion envelopes, or Landstrip.
- Do not auto-trust project-local Pi settings, extensions, packages, or code.
- Do not add non-Git delegation support; a child cwd without a Git Repository remains a fail-closed refusal.
- Do not broaden role filesystem grants beyond the assigned Repository and required runtime/session paths.
- Do not refactor unrelated delegation, observation, provider, or authentication behavior.

## Threat model

The declared trust boundary is Pi project trust for project-supplied executable resources. Repository membership is not a trust boundary: the retired `AGENTS.md` symlink marker could already be created by Repository content and did not constrain the child. Confinement remains owned by the canonical adapter, exact role manifests, and Landstrip policy scoped to the invocation Repository. External Repositories must use canonical qq primary `main`; qq's own linked worktrees may continue using their checkout-local adapter and manifests for Change verification.

Declined classes: hostile code executed through an operator-approved project toolchain, non-Git workspaces, remote repositories not present on this machine, multi-user installations, and changes to Pi's own project-trust semantics.

## Implementation

1. Mount canonical qq `AGENTS.md` through Pi's native global context path in the documented bootstrap so methodology is present without Repository markers; retain optional Repository-local context as additive.
2. Simplify the global subagent environment extension: qq checkouts select their active checkout; every other cwd selects canonical qq primary, without inspecting `AGENTS.md` as a governance gate.
3. Simplify `qq-dispatch` so canonical primary authority accepts any resolvable Git invocation root as the assigned Repository, while a non-primary qq worktree adapter may serve only its own Git common directory; retain adapter-integrity, role, runtime, capture-path, authentication, policy, and process-lifecycle refusals.
4. Replace the contradictory separate tests with an end-to-end external-Repository fixture that has no qq `AGENTS.md` symlink, reaches the fake child through canonical dispatch, and proves the rendered policy remains scoped to that Repository and its Git metadata. Preserve explicit non-Git refusal coverage and qq linked-worktree self-hosting coverage.
5. Update source documentation and canonical vocabulary so no surface describes `AGENTS.md` as qq activation or promises vanilla delegation in other Git Repositories.
6. After merge, perform the documented global context activation, verify the installed mount and runtime, then signal the DecIQ accountable session to retry its unchanged bounded assignment.

## Checks and success evidence

- Pre-fix DecIQ direct adapter reproducer exits 65 before child launch.
- Focused extension test proves every Git Repository receives canonical qq delegation configuration while qq worktrees retain checkout-local configuration.
- Focused dispatcher tests prove a separate external Git Repository with no marker launches through the fake canonical-primary adapter and receives only its assigned policy grants, while a feature-worktree adapter refuses that external Repository before child launch and a non-Git cwd still refuses.
- Existing dispatcher confinement, trusted-seat, capture, session-root, signal, timeout, provider, and observer-role cases remain green.
- `git diff --check`, relevant shell/static checks, and fresh review pass.
- Post-merge `~/.pi/agent/AGENTS.md` resolves to canonical qq `AGENTS.md` and a fresh Pi reload observes the global context.
- The DecIQ accountable session retries the exact blocked assignment without config/package changes or unconstrained fallback and confirms child start.
