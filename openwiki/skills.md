# Skill catalog

qq currently retains twelve stateless Skills. A Skill is invoked when its trigger matches the work; it is guidance, not persistent workflow state.

| Skill | Trigger and responsibility | Important boundary |
|---|---|---|
| `code-review` | Fresh-context review of a non-trivial Change against intent, scope, threat model, and evidence through the canonical reviewer role. | Do not pass author conclusions; claimed failures need constructed failing scenarios, and review does not transfer delivery authority. |
| `diagnosing-bugs` | Evidence-first investigation of difficult or unexplained failures. | Diagnosis does not authorize a fix; reproduce before fixing. |
| `research` | Multi-source investigation supporting a decision through the canonical researcher role. | The owner retains judgment and verifies key citations; only researcher children receive pinned Context7 tools, and inherited `CONTEXT7_API_KEY` is refused. |
| `architect` | Synthesize and selectively route or set aside unsettled Observer findings. | Findings remain proposals; never apply source, create Tasks, approve scope, or force decisions. |
| `idea` | Append an explicitly triggered idea verbatim to the single Backlog `Ideas` document. | Discover and mutate it through Backlog commands; no interpretation, research, commit, staging, or push. |
| `agent-messaging` | Coordinate already-live Actors through pi-intercom and operator-visible Herdr notifications. | It does not start, own, or retire Actors; resolve live identities after pane movement. |
| `delegate-batch` | Create durable work orders and dispatch aligned bounded tickets through the worktree-resident blocking `qq-delegate` engine. | The accountable session retains judgment and delivery; coupled writes are one ticket, writing concurrency is capped at 3–5, and every envelope claim is verified. |
| `deliver-change` | Accountable one-PR delivery from alignment through off-branch Task finalization, handoff, verified landing, guided Observer packaging, and retirement. | Only the operator-facing accountable Actor owns this lifecycle. Source Changes are never agent-merged; failed rails preserve state and evidence. |
| `openwiki-maintainer` | Dedicated ownership of explicitly assigned on-demand or scheduled OpenWiki refreshes. | On-demand PRs are operator-merged; only the scheduled marker may invoke the guarded exact-head merger. No path publishes directly to `main`. |
| `uat-signoff` | Obtain owner confirmation for user-visible or subjective behavior after autonomous Checks. | UAT is not authorization for destructive, monetary, irreversible, or outbound actions. |
| `operator-input` | Minimize and batch steps that only the operator can perform after exhausting self-service routes. | It handles login, authorization, browser-only, operator-held-value, account, or machine boundaries; alignment remains accountable and hands-on acceptance belongs to `uat-signoff`. |
| `writing-for-clients` | Draft, revise, or judge client-facing decks, sites, proposals, pitches, and email. | Preserve particulars, limits, and failure behavior; remove sales shapes and self-praise, then inspect the rendered form. |

## How Skills compose

The accountable Pi session remains in project home and owns the alignment brief, decision ledger, integration, verdicts, acceptance, and delivery. `research` or `diagnosing-bugs` may establish evidence; `delegate-batch` and `deliver-change` compose bounded implementation. The worktree-resident `qq-delegate` engine owns blocking child execution: canonical manifests and the six-role policy determine role, provider, model, effort, timeout, and tools, while private run directories retain `BRIEF.md`, `ENVELOPE.md`, `TERMINAL`, cache, configuration, output, and sessions.

`operator-input` minimizes unavoidable operator-only actions, `agent-messaging` coordinates already-live Actors, `uat-signoff` validates subjective behavior, `code-review` independently reviews the Change, and `architect` settles selected Observer findings without applying source or creating Tasks. OpenWiki procedure remains confined to its explicitly assigned Skill. There is no global Skill phase machine.

## Changing a Skill

1. Read the current `skills/<name>/SKILL.md` and relevant methodology.
2. Keep the trigger explicit, procedure minimal, and state external.
3. Avoid restoring intentionally retired ceremonies or capabilities.
4. Scenario-check changed guidance and run relevant focused harnesses or `tools/test.sh` as required.
5. Run `git diff --check`.
6. Run independent `code-review` for a non-trivial Change.

Pi mounts the `skills/` root directly, so Skill membership and content are live by construction without per-Skill synchronization (`README.md`; `CONCEPTS.md`).

## Source references

- `skills/agent-messaging/SKILL.md`
- `skills/architect/SKILL.md`
- `skills/code-review/SKILL.md`
- `skills/delegate-batch/SKILL.md`
- `skills/deliver-change/SKILL.md`
- `skills/diagnosing-bugs/SKILL.md`
- `skills/idea/SKILL.md`
- `skills/openwiki-maintainer/SKILL.md`
- `skills/operator-input/SKILL.md`
- `skills/research/SKILL.md`
- `skills/uat-signoff/SKILL.md`
- `skills/writing-for-clients/SKILL.md`