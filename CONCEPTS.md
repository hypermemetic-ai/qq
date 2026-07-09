# Concepts

Durable domain vocabulary for this system. Each entry is a term and its precise,
project-specific meaning. Appended by `compound` as concepts stabilize; read by
agents to speak the same language across sessions.

<!-- entries: `**term** — one-line definition grounded in this codebase.` -->

**background-status surface** — The shared `.qq/state.json` progress file plus
Claude Code status-line reader that lets long-running qq work show ambient phase
and gate progress without transcript chatter.

**qq-phase** — The `bin/qq-phase` command that writes producer-scoped
background-work phase state, renders the one-line status widget, and optionally
attaches the active `no-mistakes` gate run.

**document stack** — The four-document knowledge layer, one maintainer each:
code graph (codebase-memory MCP, derived + out-of-repo) · intent registry
(`backlog/`, gate-enforced) · durable descriptive docs (`openwiki/`,
gate-refreshed) · episodic docs (`docs/solutions/` + `CONCEPTS.md`, compound).

**intent registry** — `backlog/` (Backlog.md): what the operator wants and where
work stands, one markdown file per task. Trustworthy only because it is total —
the gate refuses any landing that doesn't touch it once adopted
(`bin/qq-registry-check.sh`); PR review checks whether that touch is truthful.

**one landing path** — The all-gated merge rule: every change reaches `main`
through the gate (`no-mistakes axi run --intent`, adding `--skip ci` only after
confirming no CI; `git push no-mistakes` only when no skip flags are needed) →
validated PR. Triage scales ceremony, never the landing path; trivial fixes
batch on a branch.

**landing agent owns the run** — The fire-and-forget gate consent model: the
agent starts `no-mistakes axi run --intent "<task + AC>"`, adds `--skip ci`
only after confirming no CI, lets objective review findings auto-fix, relays any
`ask-user` findings for operator judgment, and answers the gate with
`no-mistakes axi respond`.

**frontier** — The mechanically claimable backlog set: To Do tasks whose
dependencies are Done, whose assignee is empty, and whose task id has no local
or remote task branch claim.

**task branch claim** — The cross-worktree claim signal for task work: a
`task-<id>-<slug>` or `task-<id>.<n>-<slug>` branch, paired with the task's
assignee field on the worker's own branch.

**attendance label** — The triage label that says whether an unclaimed To Do
task is `afk` for unattended execution or `hitl` because it needs operator input.
