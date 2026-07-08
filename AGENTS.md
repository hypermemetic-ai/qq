# qq — agent operating rules

qq is surlej's bespoke agentic-dev command center — capability I reach for,
tuned to one operator: me. Sharp skills, a knowledge layer, named agent sessions,
a tuned terminal cockpit, and a thin external surface all earn their place by
being *invoked*, not by being *reported to*.

## This repo
qq is the source of truth for the methodology. The shared core is
`qq-methodology.md` (imported below), and every linked repo symlinks and
`@`-imports it. Skills live in `skills/` and are linked into
`~/.claude/skills` by `bin/qq-link.sh`; cockpit configs in `cockpit/` symlink
into `~/.config` via `bin/qq-activate.sh`, which also wires the `qq-phase` status
line.

**Merge gate: all-gated — one landing path.** Everything lands through the
gate: the landing agent runs `no-mistakes axi run --intent "<task + AC>"`,
adding `--skip ci` only after confirming the repo has no configured CI. For qq
itself, keep the skip flag until real CI exists; `git push no-mistakes <branch>`
is only a fallback when no skip flags are needed and transcript-inferred intent
is acceptable. The gate reviews correctness, runs the configured checks
(including the `backlog/` registry check), and opens a PR you merge with one
click. Trivial fixes skip the ceremony, never the path — they batch on a branch
and land as one gated push. The landing agent owns the run: objective findings
auto-fix, `ask-user` findings are relayed to the operator, and the operator's
touchpoints are judgment calls plus the PR merge click. "Green" is no longer a
fact the agent *asserts* — it is a fact the gate *proves*, independently, with a
committed evidence trail.

## Methodology
@qq-methodology.md
