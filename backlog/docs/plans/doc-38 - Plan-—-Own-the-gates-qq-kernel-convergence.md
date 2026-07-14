---
id: doc-38
title: 'Plan — Own the gates: qq kernel convergence'
type: specification
created_date: '2026-07-14 05:09'
updated_date: '2026-07-14 17:38'
---
# Plan — Own the gates: qq kernel convergence (Phases 1–4)

Approved by the operator on 2026-07-14 after a full-repo assessment, deciq
delivery-history review, and July-2026 field research (agent-engineering
practice, orchestration platforms, hosted wiki products).

## Intent

qq converges on what it is: five operator gates (intent alignment, plan
approval, review verdict, acceptance, merge), a shared glossary, and a cockpit.
Everything between the gates is rented from the harness and vendor lane, not
owned. Owned runtime code shrinks by roughly 1,800 lines and methodology prose
by more than half.

## Decisions settled at alignment

1. **Wiki — own the interface, adopt the generator, keep it swappable.** The
   durable asset is versioned markdown in `openwiki/` (agent-readable in-repo,
   diff-reviewed at merge, portable). OpenWiki remains the generator only as
   long as it earns the slot. Per-merge freshness is dropped: orientation
   content is the slowest-changing content in the repo, and regeneration churn
   hurts readers.
2. **Workflow — own the gates, never the flow.** The SOTA agent workflow is the
   fastest-converging vendor lane (plan modes, agent teams, loop primitives,
   mission-control UIs). qq keeps its gates as portable markdown so any winning
   product hosts them as configuration.
3. **Orchestration — engine/glass split.** The harness is the engine (what
   agents do: subagents, isolation, teams); herdr is the glass (what the
   operator sees), plus cross-runtime messaging that vendors do not provide.
4. **Cut by operator decision:** gardening cadence, frontier ledger and monthly
   drift watch, DeepWiki connection.

## Phase 1 — Deterministic floor

- `.github/workflows/ci.yml` runs both existing suites on every pull request
  and push to `main`: the BPMN pipeline node tests (Node >= 20, renderless via
  `QQ_BPMN_SKIP_RENDER=1`) and the shell suite (`tests/test-*.sh`).
- Claude Code project hooks (`.claude/settings.json` plus a small guard
  script) deterministically enforce the hard mandates: block agent-issued
  `gh pr merge`, and block direct `Edit`/`Write` to managed Backlog markdown
  (`backlog/**/*.md`, excluding plan asset bundles).
- The three sentence-grep policy tests (`tests/test-grilling.sh`,
  `tests/test-bpmn-plans.sh`, `tests/test-openwiki-maintainer.sh`) are
  deleted; deterministic behavior coverage replaces prose coverage.

## Phase 2 — Cheap wiki

- Delete the activation chain: `browser/openwiki-merge-activator.user.js`, the
  `qq-openwiki://` protocol handler and desktop registration,
  `bin/qq-openwiki-activate.py`, their installer sections and tests
  (~590 LOC).
- New trigger: on-demand `qq-openwiki --update`, plus an optional scheduled
  run. No merge-triggered activation.
- Delivery: an ordinary docs pull request the operator merges. The self-merge
  exception is deleted; "the operator merges" becomes exception-free. The
  `openwiki-maintainer` skill shrinks to roughly 200 words.
- Keep: the `qq-openwiki` guard wrapper, BPMN wiki diagrams, and
  `qq-openwiki-bpmn --check`.

## Phase 3 — Extract the gates

- `bpmn-plans` becomes opt-in (diagram at plan approval on request); the
  conformance ledger and `completions.json` closeout are deleted. The pipeline
  stays as a renderer.
- `deliver-change` drops the three-minute disposition watch (herdr
  notification on merge instead) and replaces the hand-rolled ancestry-gate
  fast-forward with porcelain plus the hook guard.
- `grilling` batches questions where the decision tree allows and softens
  "even when the request seems clear" to match its own skip clause.
- The duplicated herdr/codex delegation boilerplate consolidates into
  `agent-messaging`; the managed-markdown discipline is stated once; the
  codebase-memory mandate softens to "one of several search tools."

## Phase 4 — Engine/glass split

- `code-review` and `research` delegate through harness-native subagents;
  fresh-context independence is preserved by subagent isolation. Each skill
  reduces to its portable core: compose a complete brief; treat findings as
  unverified until re-derived.
- `agent-messaging` narrows to cross-runtime coordination and
  operator-visible notifications.
- Delegate work runs in harness worktree isolation; herdr work sessions remain
  for operator-attended Changes; `qq-herdr-home` and `qq-herdr-pull` are kept
  as cockpit tooling.

## Sequencing

Phases land in order, one pull request each. Phase 1 first: every later phase
deletes or rewrites guarded behavior, and the CI floor plus hooks make those
deletions safe.

## Amendments

- 2026-07-14 — Phase 1's hook guard is reclassified as a drift-net
  (CONCEPTS.md; lesson in doc-39): it intercepts a well-meaning Actor's
  accidental mandate violation and is not a security boundary. Exact
  enforcement of "only the operator merges" moved to the resource layer
  (TASK-36): a GitHub ruleset on `main` requires a pull request with green
  `bpmn-tests` and `shell-tests` for every actor, admins included, and
  rejects direct pushes, force pushes, and deletion. Agent-credential
  separation (a dedicated machine account) was deferred by operator
  decision and is tracked as follow-up work. The review-ownership verdict
  behind these rules is doc-40.
