# Verification and change guidance

## Repository-wide baseline

This repository has no conventional package manifest or automated test suite. Verification is behavior-specific. Repository instructions require:

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
| `qq-methodology.md` / `CONCEPTS.md` | Cross-check terms and ordering across README, Skills, and local instructions; render/read Markdown; `git diff --check` | Conflicting authority, changed business rules, stale references to retired systems |
| `bin/*.sh` | `bash -n` for syntax plus isolated behavioral tests with temporary HOME/repository and mocked dependencies | User-config mutation, quoting, symlink ownership, fail-open paths, race behavior |
| `bin/qq-herdr-pull` | Exercise invalid input and `QQ_HERDR_PULL_DRY`; mock herdr JSON and `jq` paths before live layout testing | 1-based indexing, current-pane protection, closing target only after successful move, silent notification failures |
| WIP scripts | Temporary Git repository: clean/dirty/untracked cases, repeated snapshot, list/diff/branch recovery, race/ref behavior | Real index/working-tree mutation, secret capture, branch/ref collisions, quiet failures |
| `bin/install.sh` | Temporary HOME: first install, repeat install, stale managed link pruning, unmanaged destination refusal, malformed hooks JSON, permission preservation | Accidental overwrite of user paths, partial installation, hook trust not communicated |
| `cockpit/` | Parse with owning tools where available; exercise key bindings in herdr/yazi; verify linked paths | Machine-specific absolute paths and missing external binaries |
| `bin/qq-openwiki` | `bash -n bin/qq-openwiki`; `bash tests/test-qq-openwiki.sh`; `git diff --check` | Wrong branch or stale-base acceptance, dirty-worktree writes, concurrent writers, retained generated workflow/guidance, altered authored instruction text |
| `openwiki/` | Verify links and source references; search for retired concepts; compare key claims to current source and diff | Source Changes editing generated pages, duplicated or stale documentation |

Do not run `bin/install.sh` against a real user HOME merely to test it; isolate user-level mutation.

## Review sequence

Prepare the reviewer with the repository/branch coordinates, owning Task and accepted scope, diff boundary, and relevant Check results. Do not pass the author’s conclusions. The reviewer derives findings independently; the owning agent then verifies each finding against source and scope.

A discovered pre-existing defect or broader opportunity does not automatically belong in the current Change. Report it or create separate intent rather than broadening the fix silently.

## Current coverage gaps

- No committed general CI or test workflow is visible; “final GitHub Checks” are a methodology requirement without a repository-specific suite documented here.
- Most shell utilities have no checked-in automated behavioral harness; `tests/test-qq-openwiki.sh` is the focused exception. It uses a temporary Repository and fake `openwiki` binary to verify local cleanup and instruction rewriting, provider/argument forwarding, and rejection of a concurrent writer.
- Installer behavior has a wide user-level blast radius despite careful refusal logic.
- WIP capture is structurally non-destructive but may quietly fail and may capture unignored sensitive files.
- Historical Backlog documents include obsolete gate/orchestration architecture and can mislead search-driven agents.

These are constraints to account for, not authorization to add a broad framework. Add the smallest Check that directly observes the behavior being changed.
