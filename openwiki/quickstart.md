# qq OpenWiki quickstart

qq is an operator-owned harness for agentic software development. It is not an application server or autonomous workflow engine: it supplies shared language, operating guidance, stateless Skills, durable knowledge surfaces, a stock Pi entrypoint, bounded delegation, terminal preferences, and narrow workflow adapters. The human operator retains intent, judgment, acceptance, and source-Change merge authority. On-demand OpenWiki refreshes remain operator-merged; the optional scheduled service may merge only through qq's guarded exact-head path. See [`README.md`](../README.md), [`CONCEPTS.md`](../CONCEPTS.md), and [`AGENTS.md`](../AGENTS.md).

## The model

qq organizes work around seven entities:

| Entity | Meaning | Primary owner/surface |
|---|---|---|
| **Actor** | Operator or replaceable agent | Human judgment and agent runtime |
| **Repository** | Files, Git history, and GitHub delivery state | Git/GitHub |
| **Task** | Durable intent, acceptance criteria, dependencies, and status | Backlog.md operator store |
| **Change** | Branch, commits, and pull request as one delivery unit | GitHub Flow |
| **Check** | Reproducible evidence about a Change | Local commands and GitHub Actions |
| **Skill** | Stateless capability invoked by trigger | `skills/*/SKILL.md` |
| **Knowledge item** | Current description, research, idea, lesson, or vocabulary | `openwiki/`, Backlog documents/decisions, `CONCEPTS.md` |

Use these capitalized terms consistently. Canonical definitions and behavioral terms such as **green**, **fresh-context independence**, **silent failure**, and **reproduce before you fix** live in [`CONCEPTS.md`](../CONCEPTS.md).

## Start here

Start from the assignment and context already supplied, and read [`CONCEPTS.md`](../CONCEPTS.md) before working. Resolve only missing context through the owning surfaces: a Backlog Task or document for durable intent and decisions, this wiki for the landed system, and source plus fresh Checks for verification. Backlog records are read and changed through its CLI; source and fresh Checks outrank derived knowledge.

For genuinely new work, the default alignment brief belongs only to the operator-facing accountable owner. Every Change must bind its consequential decisions to cited dispositions in the owning Task's decision ledger before Repository mutation. Spawned, delegated, review, research, maintainer, and event-triggered Actors instead treat bounded assignments as aligned; they execute within scope and return new consequential decisions or scope gaps to their assigning or owning Actor. Do not restart alignment merely to continue already aligned work. Invoke Skills only when their triggers and the Actor's role match the assignment.

The shared operating floor is in [`AGENTS.md`](../AGENTS.md); it does not mandate blanket Backlog, OpenWiki, source, or Skill searches for every assignment.

## Wiki map

- [Architecture and knowledge model](architecture.md) — system boundaries, ownership, runtime, delegation, and extension points.
- [Workflows](workflows.md) — orientation, Task-to-Change delivery, delegation, review, research, UAT, and knowledge capture.
- [Skill catalog](skills.md) — triggers, responsibilities, and change guidance for the twelve current Skills.
- [Operations](operations.md) — runtime installation, cockpit, project-home movement, reaping, and OpenWiki maintenance.
- [Verification](verification.md) — the merge-gating test loop, focused checks, review sequence, and coverage gaps.

## Repository map

- `AGENTS.md` — shared operating guidance mounted through Pi's global context path; Repository-local guidance is optional additive context.
- `skills/` — current stateless capabilities.
- `backlog/` — link to the operator-owned store of Tasks, authored documents, and decisions.
- `CONCEPTS.md` — shared vocabulary.
- Backlog `Ideas`, `plans`, `research`, and `solutions` documents — idea capture, historical designs, cited evidence, and reusable lessons.
- `cockpit/` — source-controlled human terminal configuration.
- `delegation/` — canonical role manifests, completion-envelope contract, Observer procedure, and execution-profile policy.
- `extensions/` — the globally mounted Pi extension set.
- `bin/` — the stock Pi launcher plus stateless Change, delegation, handoff, Observer, board/reaper, OpenWiki, Ghostty-profile, and Herdr adapters.

## Authority and historical context

Current source, fresh Checks, `CONCEPTS.md`, root `AGENTS.md`, and triggered Skills are authoritative for present behavior. Historical Backlog documents preserve decision history and may describe retired gate, phase, wave, registry, confinement, status, or orchestration systems. Do not infer that deleted subsystems still exist.