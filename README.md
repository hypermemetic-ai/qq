# The System Must Pay Rent

Operating repo for the solo-engineering system. The design is deliberately small:
plain files, rented execution, rented work surface, and a permanent bias toward
shrinking what does not pay rent.

- **Agents** interpret `policy.md`, loaded into every session.
- **CI** protects unit acceptance and executes each unit's acceptance commands.
- **The operator** works the rented surface plus the project files and runs
  `quarterly-checklist.md` once a quarter.

The distribution is this git repo. The living operating spec is the root files,
`units/`, and `project-template/`. The frozen adoption rationale is Markdown at
`record/adoption.md`; it is kept with the repo for reconstruction, but it is not
loaded as runtime policy and is not a second living source. Subsequent rationale
accrues in the loss ledger.

The test that separates the homes: if a fact must be read to operate, it belongs
in the operating files; if it is read only to build, justify, or resume the
design, it belongs in `record/adoption.md` or the loss ledger.

| File | Purpose |
|---|---|
| `policy.md` | Rules agents load: floor, autonomy, routing, rented surface |
| `units/TEMPLATE.md` | Definition-of-done template for a unit of work |
| `project-template/operator-queue.md` | Fallback/export shape for pending decisions |
| `project-template/linear-issue-template.md` | Rented-surface work-card template |
| `project-template/memory.md` | Per-project memory file template |
| `project-template/memory-candidates.md` | Review surface for proposed memory lines |
| `project-template/measurement.csv` | Trial-month measurement header |
| `project-template/.github/workflows/unit-acceptance.yml` | Project CI starter for unit guard + acceptance |
| `loss-ledger.csv` | System losses and change evidence |
| `autonomy-ledger.csv` | Escalation outcomes and audit verdicts |
| `ideas.md` | Free to append; does nothing |
| `quarterly-checklist.md` | One-hour shrink review |
| `record/adoption.md` | Frozen rationale; Markdown only, not runtime |
| `hooks/commit-msg` | Change gate, evidenced by `LL-<n>` |
| `tools/gate-report` | Gate bypasses, listed first at review |
| `tools/unit-guard` | Protects Intent/Acceptance after dispatch |
| `tools/run-acceptance` | Runs a unit's shell Acceptance block |
| `tools/sample-audit` | Deterministic audit sampler |
| `tools/fan-out` | Tiny dispatch helper; temporary adapter |

## Before the first trial

- In this system repo, activate the commit gate with `git config core.hooksPath hooks`.
- In each project repo, copy or vendor `units/TEMPLATE.md`, `operator-queue.md`,
  `memory.md`, `memory-candidates.md`, `measurement.csv`, `tools/unit-guard`,
  `tools/run-acceptance`, and the starter GitHub Actions workflow.
- Every dispatched unit must have one shell fenced block under `## Acceptance`; CI
  runs that block on the merged candidate tree.
- A Linear card may draft intent, but the unit file must exist before an agent is
  dispatched.

## Trial surface

Default trial candidate: **Linear + Warp/Oz + GitHub**.

- Linear owns work cards, lifecycle, and pending decision cards during the trial.
- Warp/Oz starts cloud-agent sessions and exposes jump links.
- GitHub owns branches, pull requests, diffs, CI, and the code audit substrate.
- Repo files own policy, acceptance, memory, ledgers, and this record.
- `operator-queue.md` is the fallback/export shape, not a shadow queue.

The surface is allowed to be useful. It is not allowed to become hidden
authority.
