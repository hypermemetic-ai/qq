# Skills — attribution

qq's skill set is curated from four excellent MIT-licensed collections, plus
five skills authored for qq — three synthesizing the best ideas across them,
and `orchestrate` and `idea`, original to qq. All upstream sources are MIT; their
copyright notices are retained inside each vendored skill directory.

## Vendored (unmodified except where noted)

| skill | source repo | author | license |
|---|---|---|---|
| `grilling` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |
| `handoff` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |
| `diagnosing-bugs` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |
| `code-review` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |
| `writing-plans` | [obra/superpowers](https://github.com/obra/superpowers) | Jesse Vincent | MIT |
| `executing-plans` | [obra/superpowers](https://github.com/obra/superpowers) | Jesse Vincent | MIT |
| `finishing-a-development-branch` | [obra/superpowers](https://github.com/obra/superpowers) | Jesse Vincent | MIT |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | Jesse Vincent | MIT |
| `receiving-code-review` | [obra/superpowers](https://github.com/obra/superpowers) | Jesse Vincent | MIT |
| `compound` | [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | Kieran Klaassen & Trevin Chow (Every) | MIT |
| `git-guardrails-claude-code` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |

`diagnosing-bugs` carries a small qq addendum (a fix-attempt circuit-breaker
from superpowers `systematic-debugging`, and an optional scratchpad idea distilled
from gsd `gsd-debug`). `compound` (vendored as upstream's `ce-compound`, renamed)
has been slimmed from its upstream 727-line form to a lean, self-contained
~100-line capture skill that fires on its own judgment instead of asking. `git-guardrails-claude-code`'s
hook is modified from upstream to allow normal `git push` while still blocking
force-push, remote branch deletion, `reset --hard`, `clean -f`, `branch -D`,
`checkout/restore .`, `reflog expire`, `update-ref -d`, and history rewrites;
its matcher is argv-aware so quoted prose is allowed. `code-review` keeps qq's
**Intent** axis (backlog-first intent sources) where upstream renamed it
**Spec** and wired it to their issue-tracker pointer — a deliberate fork,
re-assert on every sync.

**Sync pin:** the mattpocock/skills set was last diffed against upstream
[v1.1.0](https://github.com/mattpocock/skills/releases/tag/v1.1.0) (2026-07-08);
all vendored copies match HEAD at that tag except the deliberate divergences
noted above. To re-check after an upstream release: fetch each skill's
`SKILL.md` and diff against `skills/<name>/`.

## Authored for qq

| skill | origin / synthesis | license |
|---|---|---|
| `research` | mattpocock `research` (shape) + Every researcher agents (source-craft) + [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) research guardrails | MIT |
| `uat-signoff` | the human-UAT pattern of gsd `gsd-verify-work` ([open-gsd/gsd-core](https://github.com/open-gsd/gsd-core)), distilled runtime-free | MIT |
| `writing-skills` | Anthropic skill-authoring best-practices + mattpocock `writing-great-skills` + superpowers `writing-skills` (eval-first) | MIT |
| `orchestrate` | original to qq — conducts the `AGENTS.md` loop as a Claude-conducts / Codex-worker-pane split | MIT |
| `idea` | original to qq — mid-session thought capture riding the `qq-phase` producer-slot substrate; delegates to `research`'s method and borrows `handoff`'s compaction discipline (design: `ideas/01-btw-ideas-skill.md`) | MIT |
