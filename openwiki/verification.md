# Verification and change guidance

## Repository-wide baseline

The merge-gating Check loop is `tools/test.sh`: it runs every top-level `tests/test-*.sh`, and GitHub Actions invokes the same script for pull requests and pushes to `main`. CI installs Node `22.22.3`, root dependencies with lifecycle scripts disabled, and Pi `0.80.10` only for extension checks; that CI dependency is not qq's accountable patched runtime.

Verification remains behavior-specific:

1. Run Checks relevant to changed files and behavior; scenario-check changed guidance.
2. Run `tools/test.sh` when the work order or scope requires the complete merge-gating loop.
3. Run `git diff --check` before committing.
4. Give every non-trivial Change fresh-context `code-review` after implementation and before publication.
5. Rerun affected Checks after resolving confirmed findings.

A green Check must demonstrate that it observed the intended subject. A successful exit code alone is insufficient.

## Change matrix

| Area | Minimum useful Checks | Watch for |
|---|---|---|
| `skills/*/SKILL.md` | Inspect trigger/procedure coherence; scenario-test changed instructions; run focused harnesses or `tools/test.sh`; `git diff --check` | Ambiguous triggers, duplicated methodology, hidden state, scope expansion, restored ceremony |
| `AGENTS.md` / `CONCEPTS.md` | Cross-check terms across README and Skills; render/read Markdown; `git diff --check` | Conflicting authority, changed business rules, stale retired-system references |
| Shell/Python commands under `bin/` | Syntax/import checks; isolated behavioral harnesses with temporary HOME/Repository and mocked dependencies; `bash tests/test-bin-resolution.sh` where relevant | User-state mutation, quoting, symlink ownership, fail-open paths, races, and external-tool lookup drift |
| Patched Pi runtime | `bash tests/test-qq-pi-runtime.sh`; artifact inspection, conformance, two-build reproducibility, install/verify/rollback scenarios | Stock/global fallback, writable or foreign generations, stale provenance, non-atomic publication |
| Execution policy and delegation | `bash tests/test-qq-execution-profiles.sh`; `bash tests/test-qq-delegate.sh` | Policy overrides, wrong role/model/tools, non-private or reused run dirs, missing envelopes, malformed `TERMINAL`, inherited Context7 credentials |
| Mounted Pi extensions | `bash tests/test-qq-extension-mount.sh` plus the owning `tests/test-qq-*-extension.sh` | Imported but uninvoked extensions, per-member mirroring, argument coercion, stale dependencies |
| `qq-change`, `qq-board`, `qq-handoff`, `qq-observe`, `qq-reap` | Run matching top-level harnesses; exercise inspect/dry-run surfaces where supported | Dirty primary checkout, off-branch Task lifecycle, store/source confusion, missing guided observation, stale nominations, mutation during inspection |
| Herdr adapters | Run `tests/test-qq-herdr-home.sh`, `tests/test-qq-herdr-pull.sh`, and `tests/test-qq-herdr-snap.sh`; use dry-run env vars before live mutation | Project-home identity, accidental per-Change workspace assumptions, move-before-close, focus theft, bounce state |
| `cockpit/` | Parse with owning tools; exercise live keybindings; verify links and systemd units | Machine-specific paths, missing binaries, stale retired file-browser/status surfaces, graphical behavior not covered by shell tests |
| OpenWiki guards and schedule | `bash tests/test-qq-openwiki.sh`; `bash tests/test-qq-openwiki-daily.sh`; `bash tests/test-qq-openwiki-merge.sh`; `git diff --check` | Baseline restoration, setup drift, stale base, concurrent writers, one-commit/generated-path rules, exact-head Checks, threads, bot identity, completion receipts |
| Backlog drift-net | `bash tests/test-qq-pi-backlog-guard.sh` | Built-in `write`/`edit` path normalization; Bash and reads remain out of scope; do not treat the guard as a security boundary |
| Ratchet baselines | `bash tests/test-ratchet.sh`; run `tools/ratchet.sh` through the normal suite | Tracked-file scope, exact counting, approved increases, improvements that should lower the baseline |
| `openwiki/` | Verify links and source references; search for retired concepts; compare key claims to current source and diff | Source Changes editing generated pages, duplicated authority, stale current-system claims |

## Review sequence

Prepare the reviewer with Repository/branch coordinates, owning Task and accepted scope, threat model, diff boundary, and relevant Check results. Do not pass the author's conclusions. A complete `BRIEF.md` replaces generic startup orientation; the reviewer derives findings independently from targeted evidence, and the owner verifies every finding against source and scope.

A discovered pre-existing defect or broader opportunity does not automatically belong in the current Change. Report it or create separate intent rather than broadening the fix silently. Follow [`REVIEW.md`](../REVIEW.md): smallest remedy means smallest resulting system, fences require cited trust boundaries, and context gaps are neither findings nor pass.

## Capability probes and current gaps

The on-demand probes under `tests/probes/` preserve dated evidence for live protected-main, managed-Backlog, worktree, PR handoff, and Herdr-independent behavior. They remain outside CI because `tools/test.sh` uses the non-recursive top-level `tests/test-*.sh` pattern. Read [`tests/probes/README.md`](../tests/probes/README.md) before running them; some require network access or mutate temporary remote/local state.

- Focused harnesses cover patched runtime, role policy, mounted extensions, delegate/Change/board/handoff/Observer/reaper engines, OpenWiki daily/merge guards, the Pi Backlog drift-net, and Herdr adapters.
- Shell tests do not replace live GitHub protection probes, graphical browser behavior, real Herdr interaction, provider authentication, or deliberate machine bootstrap verification.
- Historical Backlog documents include obsolete runtime, confinement, status, and orchestration architecture and can mislead search-driven Actors.

These constraints do not authorize a broad framework. Add the smallest Check that directly observes the behavior being changed.