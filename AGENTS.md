# qq — repository instructions

qq is the source of truth for the shared methodology, Skills, Knowledge items,
and operator-facing utilities used across linked Repositories.

## Source surfaces

- Edit shared operating guidance in `qq-methodology.md`.
- Edit Skills in `skills/`; installed or linked copies are consumers.
- Manage durable intent, status, authored documents, and decisions through the
  Backlog CLI. Never edit Backlog-managed Markdown directly.
- Keep plans, research, ideas, solutions, and historical design material as
  categorized Backlog documents under `backlog/docs/`.
- Keep project vocabulary in `CONCEPTS.md`.

## Repository verification

- Validate every changed Skill with Codex's `skill-creator` validator.
- Run the Checks relevant to the files and behavior changed.
- Run `git diff --check` before committing.

## Methodology

@qq-methodology.md

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links.

OpenWiki is a derived orientation surface. Verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
