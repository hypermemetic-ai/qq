# Skill catalog

qq currently retains eleven stateless Skills. A Skill is invoked when its description/trigger matches the work; it is guidance, not persistent workflow state.

| Skill | Trigger and responsibility | Important boundary |
|---|---|---|
| `grilling` | Default alignment for new work; inspect first, ask one decision question at a time, recommend an answer, and obtain confirmation. | Skip only on explicit opt-out or genuinely impact-free mechanical work. |
| `code-review` | Fresh-context, read-only review of a non-trivial Change against intent, scope, and evidence. | Findings/fixes must be material, evidenced, introduced by the Change, and in scope. |
| `diagnosing-bugs` | Evidence-first investigation of difficult or unexplained failures. | Diagnosis does not authorize a fix; reproduce before fixing. |
| `research` | Multi-source investigation supporting a decision. | Fresh researcher gathers evidence; owning agent retains judgment and verifies key citations. |
| `compound` | Capture a verified, non-obvious, reusable lesson. | Do not create ceremony for routine outcomes or unverified speculation. |
| `idea` | Append an explicitly triggered idea verbatim to the single Backlog `Ideas` document. | Discover and mutate it through Backlog commands; no interpretation, research, commit, staging, or push. |
| `agent-messaging` | Coordinate with live agents through Herdr list/get/read/wait and atomic submitted turns. | Resolve live terminal identities after pane movement; use `pane run` for a submitted turn, not separate text and Enter calls. |
| `bpmn-plans` | Plan complex authorized work with evidence-stamped BPMN artifacts; retain task-specific flow and collapse inherited delivery into one call activity ending at `Green PR ready`. | Planning artifacts do not authorize implementation; only the final verified version is presented, once, and OpenWiki publication adds stricter evidence and determinism checks. |
| `deliver-change` | Accountable one-PR delivery from an aligned assignment through Task finalization, operator disposition, main synchronization, and preserved work-session handoff. | Only the operator-facing accountable agent owns this lifecycle; delegated agents do not; the operator explicitly retires the completed work session later. |
| `openwiki-maintainer` | Dedicated ownership of the derived OpenWiki surface. | The maintainer reviews generator output rather than authoring it, and may self-merge only its fully revalidated documentation Change through the guarded non-force path. |
| `uat-signoff` | Obtain owner confirmation for user-visible or subjective behavior after autonomous checks. | UAT is not authorization for destructive, monetary, irreversible, or outbound actions. |

## How Skills compose

`grilling` runs at the alignment boundary. Other Skills can compose around the work: `research` or `diagnosing-bugs` may establish evidence; `bpmn-plans` can make an approved complex plan inspectable; `deliver-change` keeps delivery accountability with the operator-facing agent; `agent-messaging` coordinates live delegates; `uat-signoff` may validate subjective behavior; `code-review` independently reviews the completed Change; and `compound` captures a durable lesson only after verification. OpenWiki procedure remains confined to its narrowly triggered Skill.

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
- `skills/bpmn-plans/SKILL.md`
- `skills/deliver-change/SKILL.md`
- `skills/openwiki-maintainer/SKILL.md`
- `skills/uat-signoff/SKILL.md`
