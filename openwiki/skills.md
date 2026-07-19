# Skill catalog

qq currently retains thirteen stateless Skills. A Skill is invoked when its description/trigger matches the work; it is guidance, not persistent workflow state.

| Skill | Trigger and responsibility | Important boundary |
|---|---|---|
| `grilling` | Owner-only alignment for genuinely new work; default to one alignment brief listing the intended work and every consequential decision with a citation or recommendation, and escalate to an interview only for genuinely open decisions. | Only the operator-facing accountable owner invokes it. Dispositions do not transfer; the owning Task's decision ledger must cite what settled each decision before a Change mutates the Repository. |
| `code-review` | Fresh-context, Codex-native read-only review of a non-trivial Change against intent, scope, threat model, and evidence. | Skills are disabled and OS access is read-only; claimed failures need constructed failing scenarios, and repeated same-class findings trip a convergence circuit-breaker. |
| `diagnosing-bugs` | Evidence-first investigation of difficult or unexplained failures. | Diagnosis does not authorize a fix; reproduce before fixing. |
| `research` | Multi-source investigation supporting a decision through a fresh Codex-native read-only runner. | Skills are disabled; the owner retains judgment, verifies key citations, and process exit retires the researcher. |
| `compound` | Capture a verified, non-obvious, reusable lesson. | Do not create ceremony for routine outcomes or unverified speculation. |
| `idea` | Append an explicitly triggered idea verbatim to the single Backlog `Ideas` document. | Discover and mutate it through Backlog commands; no interpretation, research, commit, staging, or push. |
| `agent-messaging` | Coordinate already-live agents across runtimes and raise operator-visible notifications. | It does not start, own, or retire agents; resolve live identities after pane movement. |
| `delegate-batch` | Dispatch an aligned bounded ticket batch through Codex-first isolated work sessions. | The accountable session retains judgment and delivery; coupled writes are one ticket, writing concurrency is capped at 3–5, and integration is serialized. |
| `deliver-change` | Accountable one-PR delivery from an aligned assignment through Task finalization, operator notification and disposition watch, main synchronization, and guarded retirement. | Only the operator-facing accountable agent owns this lifecycle; delegated agents do not; it never merges, and retires a verified merged Change at source only when every safety rail passes—otherwise it preserves the session for the operator. |
| `openwiki-maintainer` | Dedicated ownership of explicitly assigned on-demand or scheduled OpenWiki refreshes. | The maintainer reviews generator output, opens an ordinary docs-only pull request, and never self-merges or publishes directly to `main`. |
| `uat-signoff` | Obtain owner confirmation for user-visible or subjective behavior after autonomous checks. | UAT is not authorization for destructive, monetary, irreversible, or outbound actions. |
| `operator-input` | Minimize and batch steps that only the operator can perform, after exhausting self-service routes. | It handles login, authorization, browser-only, operator-held-value, account, or machine boundaries; alignment remains with `grilling` and hands-on acceptance with `uat-signoff`. |
| `writing-for-clients` | Draft, revise, or judge client-facing decks, sites, proposals, pitches, and email in a practical, evidence-bearing register. | Preserve particulars, limits, and failure behavior; remove sales shapes and self-praise, then inspect the rendered form before it crosses to a client. |

## How Skills compose

The accountable Pi session remains in project home. `grilling` produces the alignment brief and decision-ledger boundary; `research` or `diagnosing-bugs` may establish evidence; and `delegate-batch` or `deliver-change` dispatch bounded implementation while judgment, integration, review, acceptance, and delivery stay accountable and serialized. `qq-dispatch` owns Codex role execution: mounted profiles disable Skill injection and select workspace-write or read-only access, implementers default MCP off unless explicitly opted in, and reviewers/researchers retain configured MCP. `operator-input` minimizes unavoidable operator-only actions, `agent-messaging` coordinates already-live Actors, `uat-signoff` validates subjective behavior, `code-review` independently reviews the Change, and `compound` captures a durable lesson only after verification. OpenWiki procedure remains confined to its explicitly assigned Skill.

There is no global skill phase machine. Follow each Skill’s current `SKILL.md` and the shared operating floor in root `AGENTS.md`.

## Changing a Skill

1. Read the current `skills/<name>/SKILL.md` and relevant methodology.
2. Keep the trigger explicit, procedure minimal, and state external.
3. Avoid restoring ceremonies or capabilities intentionally removed by the minimum-entity refactor.
4. Validate every changed Skill with Codex’s `skill-creator` validator.
5. Run checks that exercise the changed wording or workflow, then `git diff --check`.
6. Run independent `code-review` for a non-trivial Change.

Pi, Claude, and Codex mount the `skills/` root directly, so Skill membership and content are live by construction. There is no per-Skill synchronization or install step (`README.md:51-80`; `CONCEPTS.md:107-114`).

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
- `skills/operator-input/SKILL.md`
- `skills/writing-for-clients/SKILL.md`
