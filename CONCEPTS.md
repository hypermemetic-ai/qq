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

**wave dispatch** — `bin/qq-wave` fan-out from the frontier: workers are created
from `origin/main`, frontier state is read from that same commit, and each task
gets its own worktree, herdr tab, worker pane, and gate-viewer split.

**gate viewer** — `bin/qq-gate-view`, a pane-local wrapper around the
`no-mistakes` TUI that follows the current branch's run by default, follows the
repo's active run with `--repo`, waits before a run exists, survives successive
runs, and respects detach.

**task branch claim** — The cross-worktree claim signal for task work: a
`task-<id>-<slug>` or `task-<id>.<n>-<slug>` branch, paired with the task's
assignee field on the worker's own branch.

**attendance label** — The triage label that says whether an unclaimed To Do
task is `afk` for unattended execution or `hitl` because it needs operator input.

**silent failure** — A command that returns output and exit 0 while answering a
different question than the one asked: `axi status` falling back to another
branch's run, `git grep` eating `--split` as a flag, `${var:+}` firing on `0`.
The session of 2026-07-08 lost most of its time to this failure class. Working
assumption: producing output is orthogonal to succeeding, and no-output is never
evidence of success.

**gate branch contract** — A gate run rebases your commits onto its own head and
appends review-fix commits there; its push target refuses non-fast-forward
pushes; the rail blocks `--force`. Therefore a rebased branch can never land —
reconciliation with the gate (or with a moved `main`) must be a **merge**, with
your changes re-applied on top of the gate's files so its hardening survives.

**frontier ref** — The revision a dispatcher reads the registry from. The
implemented `qq-frontier --ref <rev>` support lets `bin/qq-wave` read frontier
state from the same `origin/main` commit that workers are created from, so a
wave cannot hand out a task whose file the worker's checkout does not contain.

**fresh-context independence** — The property that makes a reviewer able to catch
the author's mistakes: the reviewer holds no memory of the authoring session, so
it re-derives findings from the artifact rather than inheriting the author's
belief about it. It is a property of the *spawn*, not of the vendor — a fresh
Claude subagent and a fresh codex agent both have it; the author's own continued
session does not, at any model size. Operator ruling, 2026-07-09.

**refuse, don't sanitise** — When untrusted or model-authored input becomes a
path, a command, or an identifier, reject anything outside the accepted charset
rather than stripping it to fit. A sanitiser turns `../../etc/foo` into `etcfoo`
and proceeds; that is a silent failure wearing a safety costume. The clamp that
rewrites is indistinguishable, at the call site, from the clamp that validated.

**reproduce before you fix** — A fix is verified only against a test that fails on
the unfixed code. A harness that passes both before and after has tested nothing;
it is the same "plausible answer, exit 0" shape as the silent failures it was
written to catch.

**operator handoff** — A step the operator must perform because it is *reserved*,
not because it was inconvenient: the rail blocks unmerged-branch deletion, the
gate parks `ask-user` findings, a PR merge is a human click. The agent stages
everything around it so the operator's part is one paste at a short,
per-handoff path created with `mktemp /tmp/qq-<verb>-XXXX.sh`, for example
`/tmp/qq-cleanup-a3f9.sh`. The script is non-interactive (no `read` — the `!`
shell has no tty), dry-run by default, destructive only under `--yes`,
re-verifies preconditions at run time, refuses on anything it does not
recognise, carries its own guards because the rail never sees the operator's
shell or git run inside a script, names deliberate exclusions, and prints the
resulting state.
