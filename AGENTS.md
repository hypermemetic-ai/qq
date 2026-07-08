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
gate: `git push no-mistakes <branch>` → the pipeline reviews correctness, runs
the checks (including the `backlog/` registry check), and opens a PR you merge
with one click. Trivial fixes skip the ceremony, never the path — they batch on
a branch and land as one gated push. "Green" is no longer a fact the agent
*asserts* — it is a fact the gate *proves*, independently, with a committed
evidence trail. (`/no-mistakes` drives the same gate headlessly.)

## Methodology
@qq-methodology.md
