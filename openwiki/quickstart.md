# qq OpenWiki quickstart

qq is an operator-owned harness for agentic software development. It is not an application server or autonomous workflow engine: it supplies shared language, operating guidance, stateless agent skills, durable knowledge surfaces, terminal preferences, and a few installation/recovery utilities. The human operator retains intent, judgment, acceptance, and merge authority; agents are replaceable collaborators. See [`README.md`](../README.md), [`CONCEPTS.md`](../CONCEPTS.md), and [`qq-methodology.md`](../qq-methodology.md).

## The model

qq organizes work around seven entities:

| Entity | Meaning | Primary owner/surface |
|---|---|---|
| **Actor** | Operator or replaceable agent | Human judgment and agent runtime |
| **Repository** | Files, Git history, and GitHub delivery state | Git/GitHub |
| **Task** | Durable intent, acceptance criteria, dependencies, and status | Backlog.md under `backlog/` |
| **Change** | Branch, commits, and pull request as one delivery unit | GitHub Flow |
| **Check** | Reproducible evidence about a Change | Local commands and GitHub Actions |
| **Skill** | Stateless capability invoked by trigger | `skills/*/SKILL.md` |
| **Knowledge item** | Current description, research, idea, lesson, or vocabulary | `openwiki/`, Backlog documents/decisions, `CONCEPTS.md`, external codebase-memory |

Use these capitalized terms consistently. The canonical definitions and behavioral terms such as **green**, **fresh-context independence**, **silent failure**, and **reproduce before you fix** live in [`CONCEPTS.md`](../CONCEPTS.md).

## Start here

For a new work item:

1. Read [`CONCEPTS.md`](../CONCEPTS.md).
2. Search Backlog's shared index for matching Tasks, documents, and decisions and read them through the CLI. Mutate records only after approval and only through Backlog commands.
3. Read the relevant page in this wiki, then any applicable Backlog `solutions` or `research` documents.
4. Inspect source directly. Use codebase-memory for relational code questions when indexed; source and fresh Checks outrank all derived knowledge.
5. Run the default-on `grilling` alignment Skill unless the request explicitly opts out or is genuinely impact-free and mechanical.
6. Invoke every other matching Skill, implement only the agreed scope, and verify the actual behavior.

The full ordering and behavioral floor are in [`qq-methodology.md`](../qq-methodology.md).

## Wiki map

- [Architecture and knowledge model](architecture.md) — system boundaries, ownership, repository surfaces, and extension points.
- [Workflows](workflows.md) — orientation, Task-to-Change delivery, review, research, diagnosis, UAT, and knowledge capture.
- [Skill catalog](skills.md) — triggers, responsibilities, and change guidance for the eight current Skills.
- [Operations](operations.md) — installation, cockpit, herdr pane movement, WIP recovery, and knowledge maintenance.
- [Verification](verification.md) — required checks, review sequence, coverage gaps, and risk-focused validation.

## Repository map

- `qq-methodology.md` — shared operating policy linked into agent runtimes.
- `AGENTS.md` — instructions specific to this Repository.
- `skills/` — current stateless capabilities.
- `backlog/` — CLI-managed Tasks, authored documents, and decisions.
- `CONCEPTS.md` — shared vocabulary.
- the root-level Backlog `Ideas` document — verbatim idea capture.
- Backlog `plans`, `research`, and `solutions` document categories — historical designs, cited evidence, and reusable lessons.
- `cockpit/` — source-controlled human terminal configuration.
- `bin/` — installer, local OpenWiki wrapper, herdr pane movement, and WIP snapshot/recovery commands.

## Authority and historical context

Current source, fresh Checks, `CONCEPTS.md`, and `qq-methodology.md` are authoritative for present behavior. Historical Backlog `plans` and `research` documents preserve decision history and may describe the retired gate, phase, wave, registry, or orchestration systems. Commit `13638c3` intentionally removed that machinery and collapsed qq to the minimum entity set; do not infer that deleted subsystems still exist.
