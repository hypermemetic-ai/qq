# Verification and change guidance

## Repository-wide baseline

This repository has no single conventional application test suite; its shell utilities have focused behavioral harnesses. Verification remains behavior-specific. Root instructions require evidence-backed execution; the triggered Skills add these working checks:

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
| Shell and Python commands under `bin/` | `bash -n` for shell syntax; Python syntax/import checks where applicable; isolated behavioral tests with temporary HOME/repository and mocked dependencies; `bash tests/test-bin-resolution.sh` for shared external-tool lookup | User-config mutation, quoting, symlink ownership, fail-open paths, race behavior, and divergence from the `QQ_<TOOL>_BIN` → `PATH` → package-manager fallback contract |
| `bin/qq-herdr-home` | `bash tests/test-qq-herdr-home.sh` | Exactly one primary `main` checkout and persistent home; matching Git common directory; unique single-pane Backlog board; focus confirmation without moving or closing work-session panes |
| `bin/qq-herdr-pull` | `bash tests/test-qq-herdr-pull.sh`; exercise `QQ_HERDR_PULL_DRY` before live layout testing | Operator-mode best effort versus agent-mode failure; live pane identity; sole idle placeholder; confirmed move before close |
| `bin/install.sh` | `bash tests/test-install-cleanup.sh`; temporary HOME/data/config directories; repeat install, stale managed link pruning, unmanaged destination refusal | Surgical removal of qq-owned MIME/desktop/userscript artifacts, preservation of unrelated configuration, invalid `XDG_CONFIG_HOME`, accidental overwrite, partial installation |
| `cockpit/` | Parse with owning tools where available; exercise key bindings in Herdr/yazi; verify linked paths | Machine-specific absolute paths and missing external binaries |
| `bin/qq-openwiki` | `bash tests/test-qq-openwiki.sh`; `git diff --check` | Verify command-mode, provider, and external-tool preflight occurs before stale recovery; recovery then precedes mode-specific branch/cleanliness gates and safely targets the recorded worktree even when invoked from a sibling. Exercise malformed, symlinked, unavailable, changed-worktree, and foreign-Repository snapshots; also watch for stale-base acceptance, dirty/staged-boundary errors, concurrent writers, retained generated workflow/guidance, and altered authored instruction text |
| Claude drift-net (`bin/qq-claude-guard`, `.claude/settings.json`) | `bash tests/test-qq-claude-guard.sh` | Recognizable `gh pr merge` parsing, direct edit-tool writes to managed Backlog Markdown, plan-asset exemptions, fail-local behavior, hook wiring, and declared coverage gaps; do not mistake it for a security boundary |
| `openwiki/` | Verify links and source references; search for retired concepts; compare key claims to current source and diff | Source Changes editing generated pages, duplicated or stale documentation |

Do not run `bin/install.sh` against a real user HOME merely to test it; isolate user-level mutation.

## Review sequence

Prepare the reviewer with the repository/branch coordinates, owning Task and accepted scope, diff boundary, and relevant Check results. Do not pass the author’s conclusions. A complete brief replaces generic startup orientation for this delegated reviewer: no broad intent or knowledge search, unrelated Skills, further delegation, state changes, or full-suite rerun. The reviewer derives findings independently from the brief and targeted repository evidence; the owning agent then verifies each finding against source and scope.

A discovered pre-existing defect or broader opportunity does not automatically belong in the current Change. Report it or create separate intent rather than broadening the fix silently.

## Current coverage gaps

- `.github/workflows/ci.yml` runs every `tests/test-*.sh` script on pull requests and pushes to `main` (`.github/workflows/ci.yml:1-23`).
- Focused harnesses cover OpenWiki generation, installer retirement cleanup, the Claude drift-net, Herdr home/board validation, and work-session adoption, but they do not replace live GitHub metadata and branch-protection checks, graphical browser behavior, or Herdr behavior.
- Installer behavior has a wide user-level blast radius despite careful refusal logic.
- Historical Backlog documents include obsolete gate/orchestration architecture and can mislead search-driven agents.

These are constraints to account for, not authorization to add a broad framework. Add the smallest Check that directly observes the behavior being changed.
