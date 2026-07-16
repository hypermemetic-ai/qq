# Skill catalog

qq currently retains eleven stateless Skills. A Skill is invoked when its description/trigger matches the work; it is guidance, not persistent workflow state.

| Skill | Trigger and responsibility | Important boundary |
|---|---|---|
| `grilling` | Owner-only alignment for genuinely new work; inspect first, ask one decision question at a time, recommend an answer, and obtain confirmation. | Only the operator-facing accountable owner invokes it. Non-owning Actors execute bounded assignments as aligned and return consequential decisions or scope gaps to their assigning or owning Actor. |
| `code-review` | Fresh-context, Codex-native read-only review of a non-trivial Change against intent, scope, threat model, and evidence. | Skills are disabled and OS access is read-only; claimed failures need constructed failing scenarios, and repeated same-class findings trip a convergence circuit-breaker. |
| `diagnosing-bugs` | Evidence-first investigation of difficult or unexplained failures. | Diagnosis does not authorize a fix; reproduce before fixing. |
| `research` | Multi-source investigation supporting a decision through a fresh Codex-native read-only runner. | Skills are disabled; the owner retains judgment, verifies key citations, and process exit retires the researcher. |
| `compound` | Capture a verified, non-obvious, reusable lesson. | Do not create ceremony for routine outcomes or unverified speculation. |
| `idea` | Append an explicitly triggered idea verbatim to the single Backlog `Ideas` document. | Discover and mutate it through Backlog commands; no interpretation, research, commit, staging, or push. |
| `agent-messaging` | Coordinate already-live agents across runtimes and raise operator-visible notifications. | It does not start, own, or retire agents; resolve live identities after pane movement. |
| `delegate-batch` | Dispatch an aligned bounded ticket batch through Codex-first isolated work sessions. | The accountable session retains judgment and delivery; coupled writes are one ticket, writing concurrency is capped at 3–5, and integration is serialized. |
| `deliver-change` | Accountable one-PR delivery from an aligned assignment through Task finalization, operator notification and disposition watch, main synchronization, and preserved work-session handoff. | Only the operator-facing accountable agent owns this lifecycle; delegated agents do not; it never merges, and the operator explicitly retires the completed work session later. |
| `openwiki-maintainer` | Dedicated ownership of explicitly assigned on-demand or scheduled OpenWiki refreshes. | The maintainer reviews generator output, opens an ordinary docs-only pull request, and never self-merges or publishes directly to `main`. |
| `uat-signoff` | Obtain owner confirmation for user-visible or subjective behavior after autonomous checks. | UAT is not authorization for destructive, monetary, irreversible, or outbound actions. |

## How Skills compose

For the operator-facing accountable owner, `grilling` runs at the alignment boundary. Other Skills can compose around the work: `research` or `diagnosing-bugs` may establish evidence; `delegate-batch` may fan out bounded implementation while judgment, integration, review, acceptance, and delivery stay accountable and serialized; `deliver-change` keeps delivery accountability with the operator-facing agent; `agent-messaging` coordinates already-live agents and notifications; `uat-signoff` may validate subjective behavior; `code-review` independently reviews the completed Change; and `compound` captures a durable lesson only after verification. OpenWiki procedure remains confined to its explicitly assigned Skill.

There is no global skill phase machine. Follow each Skill’s current `SKILL.md` and the shared operating floor in root `AGENTS.md`.

## Changing a Skill

1. Read the current `skills/<name>/SKILL.md` and relevant methodology.
2. Keep the trigger explicit, procedure minimal, and state external.
3. Avoid restoring ceremonies or capabilities intentionally removed by the minimum-entity refactor.
4. Validate every changed Skill with Codex’s `skill-creator` validator.
5. Run checks that exercise the changed wording or workflow, then `git diff --check`.
6. Rerun `bash bin/install.sh` after adding or removing a Skill so live links are synchronized.
7. Run independent `code-review` for a non-trivial Change.

The installer auto-discovers immediate `skills/*` directories containing `SKILL.md`; it refuses unmanaged destinations and prunes broken links into this checkout’s removed Skills (`bin/install.sh`).

## Source references

- `skills/grilling/SKILL.md`
- `skills/code-review/SKILL.md`
- `skills/diagnosing-bugs/SKILL.md`
- `skills/research/SKILL.md`
- `skills/compound/SKILL.md`
- `skills/idea/SKILL.md`
- `skills/agent-messaging/SKILL.md`
- `skills/delegate-batch/SKILL.md`
- `skills/deliver-change/SKILL.md`
- `skills/openwiki-maintainer/SKILL.md`
- `skills/uat-signoff/SKILL.md`
