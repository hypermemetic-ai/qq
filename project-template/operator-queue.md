# Operator queue

Fallback/export file for unresolved operator decisions when no rented
work-surface card is active. The normal surface may be Linear + Warp/Oz +
GitHub; this file is the portable shape, not a shadow work list.

During the rented-surface trial, lifecycle state lives in Linear and code state
lives in GitHub PRs, diffs, and CI. Without the trial, lifecycle may fall back
to unit files and this queue. Memory proposals live in `memory-candidates.md`.
Resolved outcomes live in the relevant unit, memory file, autonomy ledger, or
loss ledger.

The machine may draft cards and add evidence. It does not fill the operator
decision or delete unresolved cards. Clear aggressively after deciding: once
the relevant unit, ledger, or memory file is updated, delete the card; git
history is the archive.

## Card template

### Q-YYYYMMDD-short-slug — decision question

- **Surface card:** Linear/GitHub URL or `none`
- **Unit:** `units/<id>.md` or `none`
- **Kind:** `floor` | `blocked` | `acceptance-change` | `escalation-class` | `audit-regret` | `other`
- **Asked by:** agent, CI, audit, operator
- **Needed because:** one sentence naming why work stopped or why silence would be unsafe
- **Jump/action:** session, run, PR, CI, diff, or document link if relevant
- **Synthesis:** the smallest statement that makes the decision intelligible
- **Options:**
  - **A:** what changes, cost, reversibility
  - **B:** what changes, cost, reversibility
- **Delay cost:** what happens if this waits until the next batch
- **Machine lean:** one option, with one reason
- **Flip:** the observation that would change the lean
- **Operator decision:** empty until decided
- **Follow-up:** ledger ID, unit edit, memory promotion, or nothing

## Open cards

None.
