---
id: doc-14
title: Karpathy guidelines retention audit
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 20:56'
tags:
  - research
---
# Karpathy guidelines retention audit

_Overall confidence: **HIGH** · Settles which parts of the Karpathy-inspired
guidance remain in qq and where they belong._

## Findings

- **[HIGH] qq never carried a dedicated Karpathy Skill.** The initial qq commit
  (`4abad77`) names Karpathy's guidelines in `README.md` and compresses their
  four principles into the always-loaded behavioral floor in `AGENTS.md`; no
  `skills/karpathy-guidelines/` path appears anywhere in repository history.
- **[HIGH] The upstream artifact is an always-on instruction set first and a
  Skill wrapper second.** Its canonical `CLAUDE.md` and later Skill contain the
  same four sections: thinking before coding, simplicity, surgical changes,
  and goal-driven execution. The Skill was added afterward for native discovery.
  [Canonical instructions](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md),
  [Skill wrapper](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md)
- **[HIGH] Most of the operational wording earns retention.** The concrete
  prohibitions, the two self-checks, the distinction between new orphans and
  pre-existing dead code, the goal transformations, and the step-to-check
  template add behavior that qq's four-line compression lost. Runtime-specific
  packaging and installation do not affect the working principles.
- **[HIGH] The shared methodology is the reliable Codex placement.** On this
  system, `~/.codex/AGENTS.md` links to `qq-methodology.md`; Codex loads global
  guidance before Repository guidance. [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- **[MEDIUM] Upstream declares MIT but ships no license text.** The declaration
  appears in its README, plugin metadata, and Skill frontmatter; the checked
  repository tree contains no `LICENSE` file. [Plugin metadata](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/.claude-plugin/plugin.json)

## Sources

- qq Git history at `4abad77` and the full path history under `skills/`.
- The upstream canonical instructions, Skill wrapper, plugin metadata, and Git
  history at `2c606141936f1eeef17fa3043a72095b4765b9c2`.
- Official Codex `AGENTS.md` discovery documentation.

## Gaps

The linked X post could not be fetched directly, so this audit establishes
fidelity to the upstream guideline repository rather than independently
reconstructing Andrej Karpathy's original post. That gap does not affect the
placement or retention decision.
