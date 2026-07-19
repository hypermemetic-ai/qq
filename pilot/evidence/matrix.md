# T-94 pilot evidence matrix

Fresh local run: 2026-07-19. Package pins: pi-subagents 0.35.1, pi-landstrip/Landstrip 0.17.30, Pi 0.80.10.

Every raw log is normalized for machine paths, process IDs, and timestamps; runtime originals remain in the ephemeral `/tmp` run directory during execution. No Herdr stage bridge or reporting path was invoked.

| # | Required pilot check | Verdict | Boundary attribution | Evidence |
|---:|---|---|---|---|
| 1 | Reviewer/researcher read-only confinement | **INCONCLUSIVE-UNDER-SUBSTRATE** | Every filesystem target first succeeded from the pilot parent inside Codex's allowed worktree/Git/tmp boundary and was then denied after crossing native Landstrip. Codex rejected the loopback listener itself, so the network subcase cannot be attributed. | [raw](raw/check-01.log) |
| 2 | Implementer workspace/Git write confinement | **FAIL** | The pilot parent proved Codex permits every intended worktree/Git/runtime target and the decoy /tmp target. A static child isolates Landstrip's filesystem decision from dynamic-loader effects; the real-Pi smoke separately tests executable viability. | [raw](raw/check-02.log) |
| 3 | No implicit skill/project-context/extension leakage | **PASS** | This check targets pi-subagents' argument/environment and prompt-rewrite boundary. The child launch report is emitted after crossing the wrapper; the staged runtime source is checked for the exact environment-gated project-context and skill stripping hooks. | [raw](raw/check-03.log) |
| 4 | Strict Completion Envelope rejection | **PASS** | The staged pi-subagents parent validator owns this boundary. The deterministic child is launched directly so Landstrip's nested allowWrite defect cannot turn every structured-output case into the same filesystem failure. | [raw](raw/check-04.log) |
| 5 | Outer timeout tears down the complete descendant tree | **PASS** | The wrapper's GNU timeout is outermost, the qq subreaper owns native Landstrip beneath it, and a static mock Pi creates named tool, MCP, and double-forked orphan descendants. Only that observed descendant tree is inspected or cleaned. | [raw](raw/check-05.log) |
| 6 | SIGINT/SIGTERM/pane-close signal cleanup | **PASS** | Signals target only each check's dedicated timeout leader. SIGHUP is the Herdr-pane-closure signal-path simulation; no live Herdr pane or unrelated PID is touched. | [raw](raw/check-06.log) |
| 7 | Auditable foreground/background artifacts | **PASS** | Pi-subagents owns foreground and async lifecycle artifacts; the wrapper event log independently binds each runId to the role-selected Landstrip policy identity. Child stderr supplies policy diagnostics without Herdr machinery. | [raw](raw/check-07.log) |
| 8 | Resume cwd containment | **PASS** | Pi-subagents supplies the persisted session path; before Landstrip or Pi starts, the wrapper canonicalizes the launch cwd's Git root and requires it to equal the wrapper's assigned worktree. | [raw](raw/check-08.log) |
| 9 | Landstrip absence/unsupported fail closed | **PASS** | The absence path is the wrapper's executable preflight. The unsupported path uses a deterministic launcher with Landstrip's documented PLATFORM_UNSUPPORTED terminal record and proves the wrapper never falls back to Pi; the installed native binary is separately smoke-tested on this supported kernel. | [raw](raw/check-09.log) |

Overall: **HOLD**. Failed checks: 2. Inconclusive-under-substrate checks: 1.

The migration verdict is HOLD whenever any required check fails or is inconclusive. In this run, Check 2 is the decisive blocker: nested Landstrip denies its own explicit implementer allowWrite roots under the outer Codex sandbox.
