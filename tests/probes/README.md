# Baseline capability probes

This directory is the stable citation surface for the external contracts that
the qq base batch must preserve. The probes are on-demand Checks, not part of
the non-recursive `tests/test-*.sh` CI glob. Each script is executable,
accepts no arguments, finds the Repository from its own checkout, writes a
UTC-dated capture under `tests/probes/evidence/`, and exits zero only when it
observes the expected boundary behavior.

| Contract | Probe or existing Check | Expected observable outcome | Evidence |
|---|---|---|---|
| Required CI green-gates `main` | [`probe-agent-cannot-merge-main.sh`](probe-agent-cannot-merge-main.sh), plus the `shell-tests` job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | Live ruleset 18942749 is active on the default branch with no bypass actors, requires a PR and the GitHub Actions `shell-tests` status (integration 15368), and blocks deletion/non-fast-forward updates. Classic protection restricts updates to `qqp-dev`, `hypermemetic`, and `sshmendez`, excluding `qqp-bot`. The scratch PR's required Checks are green before C1 attempts its merge. | **Pending owner run.** C1 writes `evidence/<UTC-date>-c1-agent-cannot-merge-main.txt`. |
| C1 — agent credentials cannot merge `main` | [`probe-agent-cannot-merge-main.sh`](probe-agent-cannot-merge-main.sh) | With `gh` authenticated as `qqp-bot`, the REST `PUT /pulls/{number}/merge` attempt against a green, empty-commit scratch PR is rejected with HTTP 405. The PR is closed unmerged and its branch deleted. | **Pending owner run.** `evidence/<UTC-date>-c1-agent-cannot-merge-main.txt`. Historical baseline: T-37 observed HTTP 405 on green scratch PR #94. |
| C2 — agent credentials cannot push `main` | [`probe-agent-cannot-push-main.sh`](probe-agent-cannot-push-main.sh) | A direct push of a harmless empty commit from the repo-pinned agent SSH identity is rejected with GH013, and the remote `main` SHA remains unchanged. The probe creates no scratch remote ref. | **Pending owner run.** `evidence/<UTC-date>-c2-agent-cannot-push-main.txt`. Historical baseline: T-37 observed GH013. |
| C3 — structured edits to managed Backlog markdown get local feedback | [`probe-managed-backlog-feedback.sh`](probe-managed-backlog-feedback.sh) and [`tests/test-qq-claude-guard.sh`](../test-qq-claude-guard.sh) | A synthetic Claude Code `PreToolUse` `Edit` event targeting managed Backlog markdown is denied by the guard with exit 2, no stdout, and the one-line Backlog-CLI feedback on stderr. No Backlog file is opened or changed. | [`evidence/2026-07-17-c3-managed-backlog-feedback.txt`](evidence/2026-07-17-c3-managed-backlog-feedback.txt). |
| C4 — parallel writers get separate worktrees | [`probe-parallel-worktrees.sh`](probe-parallel-worktrees.sh) | In a disposable local clone, Git registers two linked worktrees with distinct paths and Git administrative directories. Simultaneous writes to the same relative marker remain isolated, the invoking checkout is untouched, and both worktrees are removed. | [`evidence/2026-07-17-c4-parallel-worktrees.txt`](evidence/2026-07-17-c4-parallel-worktrees.txt). |
| C5 — PR handoff yields a usable URL | [`probe-pr-handoff-url.sh`](probe-pr-handoff-url.sh) | `gh pr create` prints the canonical URL for an empty-commit scratch PR. The URL resolves to the expected open PR, base, branch, and head SHA; after the probe closes the PR and deletes its branch, the URL still resolves to the closed PR. | **Pending owner run.** `evidence/<UTC-date>-c5-pr-handoff-url.txt`. |
| C6 — delivery completes with Herdr absent | [`probe-delivery-without-herdr.sh`](probe-delivery-without-herdr.sh) and the full `tests/test-*.sh` Check suite | The probe removes every Herdr-containing directory from `PATH`, verifies `herdr` cannot resolve, and runs the complete shell Check suite successfully. CI has the same no-live-Herdr dependency by construction: its workflow only checks out the Repository and runs that suite; it neither installs nor invokes Herdr. | [`evidence/2026-07-17-c6-delivery-without-herdr.txt`](evidence/2026-07-17-c6-delivery-without-herdr.txt). |

## Running the probes

Local probes need no network or credentials:

```sh
bash tests/probes/probe-managed-backlog-feedback.sh
bash tests/probes/probe-parallel-worktrees.sh
bash tests/probes/probe-delivery-without-herdr.sh
```

The remaining probes require network access, an `origin` remote for this
Repository, `gh` authenticated as `qqp-bot`, and the repo-pinned SSH identity:

```sh
bash tests/probes/probe-agent-cannot-merge-main.sh
bash tests/probes/probe-agent-cannot-push-main.sh
bash tests/probes/probe-pr-handoff-url.sh
```

The C1 command includes the live configuration re-query for the required-CI
contract. It deliberately uses the REST API for the merge attempt, never
`gh pr merge`.

## Mutation and cleanup safety

C1 and C5 branch from freshly fetched `origin/main`, create only an empty
commit, and use unique scratch branches and PRs. They close any open scratch
PR, delete its branch, and remove the temporary detached worktree on both the
expected path and failure paths. C2 attempts to update `main` with only an
empty commit and creates no scratch ref. If any protected mutation
unexpectedly succeeds, its probe prints `CRITICAL`, exits non-zero, and cleans
everything it can without rewriting `main`. All three network probes refuse
to begin while `gh` reports an identity other than `qqp-bot`.

Evidence filenames use the probe run's UTC date. Re-running a probe on the
same UTC date replaces that probe's capture; running it on a later date adds a
new dated capture.
