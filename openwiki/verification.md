# Verification and change guidance

## Repository-wide baseline

This repository has no single conventional application test suite; its shell utilities and BPMN pipeline have focused behavioral harnesses. Verification remains behavior-specific. Root instructions require evidence-backed execution; the triggered Skills add these working checks:

1. Validate each changed Skill with Codex’s `skill-creator` validator.
2. Run Checks relevant to the changed files and behavior.
3. Run `git diff --check` before committing.
4. Give every non-trivial Change a fresh-context `code-review` after implementation and before commit/push/PR.
5. Rerun affected Checks after resolving confirmed findings.

A green Check must demonstrate that it observed the intended subject. A successful exit code alone is insufficient.

## Change matrix

| Area | Minimum useful checks | Watch for |
|---|---|---|
| `skills/*/SKILL.md` | Skill validator; inspect trigger/procedure coherence; scenario-test changed instructions; `git diff --check` | Ambiguous triggers, duplicated methodology, hidden state, scope expansion, restored ceremony |
| `AGENTS.md` / `CONCEPTS.md` | Cross-check terms and ordering across README, Skills, and linked-repository instructions; render/read Markdown; `git diff --check` | Conflicting authority, changed business rules, stale references to retired systems |
| `bin/*.sh` | `bash -n` for syntax plus isolated behavioral tests with temporary HOME/repository and mocked dependencies | User-config mutation, quoting, symlink ownership, fail-open paths, race behavior |
| `bin/qq-herdr-home` | `bash tests/test-qq-herdr-home.sh` | Exactly one primary `main` checkout and persistent home; matching Git common directory; unique single-pane Backlog board; focus confirmation without moving or closing work-session panes |
| `bin/qq-herdr-pull` | `bash tests/test-qq-herdr-pull.sh`; exercise `QQ_HERDR_PULL_DRY` before live layout testing | Operator-mode best effort versus agent-mode failure; live pane identity; sole idle placeholder; confirmed move before close |
| `bin/install.sh` | Temporary HOME/data directory: repeat install, stale managed link pruning, unmanaged destination refusal, locked BPMN install, desktop entry and MIME registration | Accidental overwrite of user paths, partial installation, unmanaged desktop replacement |
| `cockpit/` | Parse with owning tools where available; exercise key bindings in Herdr/yazi; verify linked paths | Machine-specific absolute paths and missing external binaries |
| `bin/qq-openwiki` | `bash tests/test-qq-openwiki.sh`; `bash tests/test-openwiki-maintainer.sh`; `git diff --check` | Wrong branch or stale-base acceptance, dirty/staged-boundary errors, concurrent writers, unbounded correction, retained generated workflow/guidance, altered authored instruction text |
| OpenWiki activation | `bash tests/test-qq-openwiki-activate.sh` | Wrong Repository/root discovery, ineligible merge dispatch, duplicate activation, recursive update activation, unsafe retry after uncertain dispatch |
| OpenWiki BPMN and plans | `bash tests/test-bpmn-plans.sh`; `bash tests/test-qq-openwiki-bpmn.sh`; `npm test --prefix skills/bpmn-plans/pipeline`; run `qq-openwiki-bpmn --check` for every retained spec | Lost task-specific flow, wrong green-PR boundary, repeated viewer launch, escaped or stale evidence, unsupported edges, non-deterministic output, stale artifacts, unreadable or unhelpful images |
| `openwiki/` | Verify links and source references; search for retired concepts; compare key claims to current source and diff | Source Changes editing generated pages, duplicated or stale documentation |

Do not run `bin/install.sh` against a real user HOME merely to test it; isolate user-level mutation.

## Review sequence

Prepare the reviewer with the repository/branch coordinates, owning Task and accepted scope, diff boundary, and relevant Check results. Do not pass the author’s conclusions. A complete brief replaces generic startup orientation for this delegated reviewer: no broad intent or knowledge search, unrelated Skills, further delegation, state changes, or full-suite rerun. The reviewer derives findings independently from the brief and targeted repository evidence; the owning agent then verifies each finding against source and scope.

A discovered pre-existing defect or broader opportunity does not automatically belong in the current Change. Report it or create separate intent rather than broadening the fix silently.

## Current coverage gaps

- No committed general CI workflow is visible; “final GitHub Checks” remain a delivery requirement assembled from the affected behavior's focused checks.
- Focused harnesses now cover OpenWiki generation/correction, guarded merge race behavior, merge activation, BPMN plan policy/publication, Herdr home/board validation, and work-session adoption, but they do not replace live GitHub metadata and branch-protection checks, browser/desktop-protocol behavior, Herdr behavior, or graphical readability checks. Raster rendering assertions are also skipped when Chrome is unavailable or `QQ_BPMN_SKIP_RENDER=1`.
- Installer behavior has a wide user-level blast radius despite careful refusal logic.
- Historical Backlog documents include obsolete gate/orchestration architecture and can mislead search-driven agents.

These are constraints to account for, not authorization to add a broad framework. Add the smallest Check that directly observes the behavior being changed.
