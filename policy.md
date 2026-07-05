# Policy

Loaded into every agent session. This file is the living operating spec. Keep it
lean: rules with one-line reasons, not essays.

## Unit of work

*The operator writes the gate; the worker must not weaken the gate that clears its own work.*

- Each unit is a plain-text file under `units/`, normally copied from
  `units/TEMPLATE.md`.
- Intent is at most fifteen lines and says what should change, not how the agent
  should internally reason.
- Acceptance is one shell fenced block of commands or probes that CI can run with
  `tools/run-acceptance`, plus optional explanatory text.
- While status is `queued`, the operator may change Intent, Acceptance, blast
  radius, and verifier class.
- Once the unit leaves `queued`, protected fields are frozen unless the operator
  explicitly requeues or creates a new unit.
- If implementation files changed in the same branch, protected field edits are
  suspect even if the unit still says `queued`; run `tools/unit-guard`.
- Project CI runs `tools/unit-guard --git-range BASE HEAD` and then runs changed
  unit acceptance on the merged candidate tree.

## Autonomy and floor

*Autonomy is for reversible internal work; values and commitments stay with the operator.*

- The machine proceeds autonomously on internal, reversible work.
- Stop at the floor for spending, publication, obligations, hard-to-reverse
  actions, external side effects, deployment/promotion, migration, billing,
  notification, data deletion, or any case where the machine catches itself
  arguing that none of these apply.
- CI-green work may merge autonomously to internal `main` only when `main` has
  no external side effects.
- If `main` deploys, bills, notifies, migrates, publishes, or otherwise leaves
  the project, autonomous work lands on an integration branch and promotion is
  a floor decision.
- Floor items become cards in the rented operator work surface when active, or
  in the project's `operator-queue.md` when no rented surface is active.

## Operator work surface

*Rent the cockpit; do not rent hidden authority.*

- Default trial surface: Linear + Warp/Oz + GitHub. Linear holds work cards and
  lifecycle; Warp/Oz starts cloud-agent sessions and exposes jump links; GitHub
  holds branches, pull requests, diffs, and CI.
- A visible work item names its unit or issue, lifecycle state, branch/PR/CI
  links, session or run link when one exists, pending floor or blocked decision,
  and relevant project documents.
- One primary action per item: start agent work, jump to session or run, open
  unit/issue, open PR/diff/CI, open decision, or open document. Conversation
  with agents may remain in the terminal; the surface manages lifecycle.
- During the trial, Linear may own `ready`, `running`, `blocked`, `done`, and
  pending decision cards. Resolved outcomes must be written to the unit, memory
  file, autonomy ledger, or loss ledger before the card closes.
- `operator-queue.md` is the exit/fallback backing file for unresolved operator
  decisions when no rented card is active. Do not maintain a shadow queue.
- Session links are handles, not state. A vanished or unjoinable session must
  leave a PR, log, or issue note sufficient to reconstruct or kill the work.
- The surface must be austere and optional to watch. It dies or is replaced if
  decisions hide in vendor chat, tracker/GitHub/repo state diverge, links are
  unreliable, or upkeep becomes its own project.

## Verifier routing

*Verifiers must fail differently; model opinion is the weakest witness.*

Order by decorrelation:

1. Execution against reality: builds, tests, staging probes, acceptance commands.
2. Authorless inputs: property-based tests, fuzzing, deterministic simulation.
3. Cross-family adversarial review, given only intent and diff, never transcript.
4. Same-family review, permitted for style; not evidence of correctness.

- Route stronger verifiers to units with weak acceptance or costly failure.
- Log unique catches by rung in the loss ledger.
- Any rung with zero unique catches in a quarter leaves routing for that class.

## Project memory

*Human-curated memory beats hidden retention.*

- Each project has one `memory.md`, capped near two hundred lines.
- Superseded knowledge is removed; git history is the archive.
- Agents may propose `memory-candidates.md` entries, but candidates are not truth
  until the operator promotes them.
- Vendor memory may be disposable cache only unless it is repo-resident or
  exportable, diffable, clearable, reviewable, and injected by an inspectable
  relevance rule.
- Transcripts are disposable.

## Ledgers and change gate

*System changes need losses, not aesthetic conviction.*

- Record losses in `loss-ledger.csv`: what happened, cost, failed layer, and
  proposed change.
- Record escalations and sampled audits in `autonomy-ledger.csv`.
- No system change without a cited `LL-<n>` entry; one change in flight at a
  time.
- `ideas.md` is free to append and has no operational force.
- Gate bypasses are logged and read first during the quarterly review.

## Audit

*Sampled audit verifies the verifiers without restoring synchronous review.*

- Start with ten percent sampled audit unless a project says otherwise.
- For each audited unit, reconstruct from intent, diff, CI/verifier logs, and
  escalation record if any.
- Mark whether the operator could explain the change and likely failure mode
  cold.
- Escalation classes that change outcomes or create regret are promoted;
  clean classes are demoted.

## One living home per fact

*Reasons generalize; duplicated state rots.*

- Rules carry one-line reasons, never arguments.
- Full rationale: frozen Markdown adoption record at `record/adoption.md` plus
  the loss ledger.
- Project lifecycle facts live in the rented surface during trial, or in unit
  files when no rented surface is active.
- Code facts live in git, PRs, diffs, and CI.
- Policy, acceptance, memory, ledgers, and this adoption record live in repo
  files.
- Provenance may inform decisions, but standing runtime facts live here or in
  project files; one living home per fact.
