# qq OpenWiki quickstart

qq is an operator-owned harness for agentic software development. It is not an application server or autonomous workflow engine: it supplies shared language, operating guidance, stateless agent skills, durable knowledge surfaces, terminal preferences, and a few installation and workflow utilities. The human operator retains intent, judgment, acceptance, and merge authority for ordinary source Changes; the sole narrow exception is the OpenWiki maintainer's fully revalidated, documentation-only Change, which may use its guarded non-force merge path. See [`README.md`](../README.md), [`CONCEPTS.md`](../CONCEPTS.md), and [`AGENTS.md`](../AGENTS.md).

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

Start from the assignment and context already supplied, and read [`CONCEPTS.md`](../CONCEPTS.md) before working. Resolve only missing context through the surfaces relevant to the question: a Backlog Task or document for durable intent and decisions, this wiki for the landed system, codebase-memory for relational code questions, and source plus fresh Checks for verification. Backlog records are read and changed through its CLI; source and fresh Checks outrank derived knowledge.

For a genuinely new work item, the default-on `grilling` Skill owns alignment unless the operator opts out or the action is impact-free and mechanical. Do not restart it merely to continue already aligned work. Invoke other Skills only when their triggers and the agent's role match the assignment; each Skill owns its procedure and exceptions.

The shared operating floor is in [`AGENTS.md`](../AGENTS.md); it does not mandate blanket Backlog, OpenWiki, source, or Skill searches for every assignment.

## Wiki map

- [Architecture and knowledge model](architecture.md) — system boundaries, ownership, repository surfaces, and extension points.
- [Workflows](workflows.md) — orientation, Task-to-Change delivery, review, research, diagnosis, UAT, and knowledge capture.
- [Skill catalog](skills.md) — triggers, responsibilities, and change guidance for the eleven current Skills.
- [Operations](operations.md) — installation, cockpit, Herdr workspace movement, and knowledge maintenance.
- [Verification](verification.md) — required checks, review sequence, coverage gaps, and risk-focused validation.

## Repository map

- `AGENTS.md` — shared operating guidance; linked Repositories may inherit it through a root symlink.
- `skills/` — current stateless capabilities.
- `backlog/` — CLI-managed Tasks, authored documents, and decisions.
- `CONCEPTS.md` — shared vocabulary.
- the root-level Backlog `Ideas` document — verbatim idea capture.
- Backlog `plans`, `research`, and `solutions` document categories — historical designs, cited evidence, and reusable lessons.
- `cockpit/` — source-controlled human terminal configuration.
- `bin/` — installer, guarded OpenWiki/diagram/activation commands, and Herdr pane movement.

## Authority and historical context

Current source, fresh Checks, `CONCEPTS.md`, root `AGENTS.md`, and triggered Skills are authoritative for present behavior. Historical Backlog `plans` and `research` documents preserve decision history and may describe the retired gate, phase, wave, registry, or orchestration systems. Commit `13638c3` intentionally removed that machinery and collapsed qq to the minimum entity set; do not infer that deleted subsystems still exist.
