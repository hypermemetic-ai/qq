# Skills — attribution

hypercore's skill set is curated from four excellent MIT-licensed collections, plus
three skills authored for hypercore by synthesizing the best ideas across them.
All upstream sources are MIT; their copyright notices are retained inside each
vendored skill directory.

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
| `ce-compound` | [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | Kieran Klaassen & Trevin Chow (Every) | MIT |
| `git-guardrails-claude-code` | [mattpocock/skills](https://github.com/mattpocock/skills) | Matt Pocock | MIT |

`diagnosing-bugs` carries a small hypercore addendum (a fix-attempt circuit-breaker
from superpowers `systematic-debugging`, and an optional scratchpad idea distilled
from gsd `gsd-debug`). `ce-compound` has been slimmed from its upstream 727-line
form to a lean, self-contained ~94-line capture skill. `git-guardrails-claude-code`'s
hook is modified from upstream to allow normal `git push` while still blocking
force-push, `reset --hard`, `clean -f`, `branch -D`, `checkout/restore .`, and
history rewrites.

## Authored for hypercore (syntheses)

| skill | synthesized from | license |
|---|---|---|
| `research` | mattpocock `research` (shape) + Every researcher agents (source-craft) + [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) research guardrails | MIT |
| `uat-signoff` | the human-UAT pattern of gsd `gsd-verify-work` ([open-gsd/gsd-core](https://github.com/open-gsd/gsd-core)), distilled runtime-free | MIT |
| `writing-skills` | Anthropic skill-authoring best-practices + mattpocock `writing-great-skills` + superpowers `writing-skills` (eval-first) | MIT |
