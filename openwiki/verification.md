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
| `bin/qq-herdr-home` | `bash tests/test-qq-herdr-home.sh` | `inspect` validates the sole primary `main` checkout, persistent home, and matching Git common directory; only `focus-board` requires the unique single-pane board and confirms focus without moving or closing work-session panes |
| `bin/qq-herdr-pull` | `bash tests/test-qq-herdr-pull.sh`; exercise `QQ_HERDR_PULL_DRY` before live layout testing | Operator-mode best effort versus agent-mode failure; live pane identity; sole idle placeholder; confirmed move before close |
| `bin/qq-herdr-snap` | `bash tests/test-qq-herdr-snap.sh`; exercise `QQ_HERDR_SNAP_DRY` before live focus testing | Project-home Pi then Claude preference; focused-session Pi, Claude, then sidebar-order fallback; target-workspace-keyed bounce state, non-agent origins, stale panes, best-effort failure |
| Runtime mounts and profiles | Verify Skill-root links, fixed cockpit links, and Codex profile symlinks resolve into the intended checkout; `bash tests/test-bin-resolution.sh`; `bash tests/test-qq-dispatch.sh` | Per-member mirroring, stale profile targets, ambiguous `QQ_HOME`, accidental copies, and dispatch under the wrong sandbox/MCP policy |
| `cockpit/` | Parse with owning tools where available; exercise key bindings and popup close/size behavior in Herdr/yazi; verify linked paths | Machine-specific absolute paths, missing external binaries, Herdr popup frame/PTY size mismatch, and stage glass mistaken for durable workflow state |
| `bin/qq-openwiki` | `bash tests/test-qq-openwiki.sh`; `git diff --check` | Git-backed baseline restoration outside `openwiki/**`; rejection of tracked, untracked, or ignored setup deviation; instruction-symlink shadowing; stale-base, dirty/staged-boundary, concurrent-writer, retained-workflow, and altered-authored-guidance failures |
| Runtime drift-nets (`.claude/settings.json`, `bin/qq-claude-backlog-hook`, `cockpit/pi/qq-backlog-guard.ts`) | `bash tests/test-qq-claude-guard.sh`; `bash tests/test-qq-pi-backlog-guard.sh` | Claude native merge denies versus structured Backlog write-hook scope; Pi path normalization and built-in `write`/`edit` scope; Bash and reads remain outside the hooks; do not mistake either drift-net for a security boundary |
| Stateless engines (`qq-board`, `qq-change`, `qq-dispatch`, `qq-pr-watch`, `qq-status`) | Run the matching `tests/test-qq-*.sh` harnesses; exercise `inspect`/`--dry-run` where supported | Shared JSON result/exit contract (`done=0`, `error=1`, `refused=2`), fail-closed rails, atomic files, stale artifacts, timeout handling, selector validation, and unintended mutation during inspection |
| Ratchet baselines | `bash tests/test-ratchet.sh`; run `tools/ratchet.sh` through the normal shell-test suite | NUL-safe exact counting of mandatory prose, `codex exec`, runtime-specific Skill flags, and shell-parser idioms; improvements lower the committed baseline, while increases require an operator-approved baseline change |
| `openwiki/` | Verify links and source references; search for retired concepts; compare key claims to current source and diff | Source Changes editing generated pages, duplicated or stale documentation |

## Review sequence

Prepare the reviewer with the repository/branch coordinates, owning Task and accepted scope, diff boundary, and relevant Check results. Do not pass the author’s conclusions. A complete brief replaces generic startup orientation for this delegated reviewer: no broad intent or knowledge search, unrelated Skills, further delegation, state changes, or full-suite rerun. The reviewer derives findings independently from the brief and targeted repository evidence; the owning agent then verifies each finding against source and scope.

A discovered pre-existing defect or broader opportunity does not automatically belong in the current Change. Report it or create separate intent rather than broadening the fix silently.

## Capability probes and current gaps

The on-demand C1–C6 probes under `tests/probes/` preserve dated evidence for protected-main merge/push rejection, managed-Backlog feedback, parallel-worktree isolation, usable PR handoff, and operation without live Herdr. They are intentionally outside CI's non-recursive `tests/test-*.sh` glob; read [`tests/probes/README.md`](../tests/probes/README.md) before running them because some require network access or mutate temporary remote/local state.

- `.github/workflows/ci.yml` runs every top-level `tests/test-*.sh` script on pull requests and pushes to `main`, including engine and ratchet harnesses.
- Focused harnesses cover OpenWiki generation, mounted dispatch profiles, the Change/board/status/watch engines, Pi and Claude drift-nets, and Herdr adapters, but they do not replace live GitHub/branch-protection probes, graphical browser behavior, or real Herdr interaction.
- Machine bootstrap still changes user-level links and runtime configuration; verify it deliberately rather than treating shell harnesses as proof of a live installation.
- Historical Backlog documents include obsolete gate/orchestration architecture and can mislead search-driven Actors.

These are constraints to account for, not authorization to add a broad framework. Add the smallest Check that directly observes the behavior being changed.
